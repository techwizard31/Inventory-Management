from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.schemas import POSWebhookPayload
from app.models import Restaurant, Transaction, RawIngredient, RecipeBOM
from app.tasks import handle_pos_order
from sqlalchemy import func
from app.services.ai_parser import parse_chef_instructions
from pydantic import BaseModel
import re
import os
import httpx
from app.schemas import SwiggyAuthPayload

app = FastAPI(title="JIT Kitchen Controller API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Allow Next.js to talk to FastAPI
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/webhooks/pos")
async def receive_pos_webhook(payload: POSWebhookPayload, db: Session = Depends(get_db)):
    """
    Ingests live orders from the POS system.
    """
    # 1. Verify the restaurant exists
    restaurant = db.query(Restaurant).filter(Restaurant.id == payload.restaurant_id).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    # 2. Record the income in the Ledger
    new_transaction = Transaction(
        restaurant_id=restaurant.id,
        type="POS_INCOME",
        amount=payload.order_value,
        reference_id=payload.order_id
    )
    db.add(new_transaction)
    db.commit()

    # 3. Pass off to Celery (Task Queue) for asynchronous processing.
    handle_pos_order.delay(str(payload.restaurant_id), payload.pos_item_id, payload.quantity)

    return {"status": "success", "message": "Order ingested and sent to processing queue."}

@app.post("/api/auth/swiggy/exchange")
async def exchange_swiggy_token(payload: SwiggyAuthPayload, db: Session = Depends(get_db)):
    """
    Takes the temporary auth code from the frontend, exchanges it with Swiggy 
    for a permanent access token, and stores it securely in the database.
    """
    # 1. Prepare the OAuth 2.1 token request
    # Note: Using the standard OAuth token endpoint format based on Swiggy docs
    token_url = "https://mcp.swiggy.com/auth/token" 
    
    data = {
        "grant_type": "authorization_code",
        "client_id": os.getenv("SWIGGY_CLIENT_ID", "mock_client_id"),
        "client_secret": os.getenv("SWIGGY_CLIENT_SECRET", "mock_secret"),
        "code": payload.code,
        "redirect_uri": os.getenv("SWIGGY_REDIRECT_URI", "http://localhost:3000/auth/callback"),
        "code_verifier": payload.code_verifier
    }

    # 2. Make the Server-to-Server call to Swiggy
    async with httpx.AsyncClient() as client:
        response = await client.post(token_url, data=data)
        
        if response.status_code != 200:
            # If the code expired or the PKCE verifier is wrong, Swiggy rejects it.
            raise HTTPException(
                status_code=400, 
                detail=f"Swiggy Token Exchange Failed: {response.text}"
            )
            
        token_data = response.json()
        access_token = token_data.get("access_token")

    # 3. Save to Database (The Vault)
    restaurant = db.query(Restaurant).filter(Restaurant.id == payload.restaurant_id).first()
    if not restaurant:
        raise HTTPException(status_code=404, detail="Restaurant not found")

    # In a production environment, you would run access_token through a Fernet 
    # encryption cipher here before saving it to the database to protect against DB leaks.
    restaurant.swiggy_access_token = access_token
    db.commit()

    return {
        "status": "success", 
        "message": "Swiggy connected securely.",
        "restaurant_id": str(restaurant.id),
        "restaurant_name": restaurant.name
    }

@app.get("/api/restaurants")
def list_restaurants(db: Session = Depends(get_db)):
    """Fetches all registered B2B kitchens for the login page."""
    restaurants = db.query(Restaurant).all()
    return [{"id": str(r.id), "name": r.name} for r in restaurants]

class ManualStockPayload(BaseModel):
    restaurant_id: str
    name: str
    quantity: float
    unit: str
    reorder_threshold: float
    reorder_qty: float

@app.post("/api/inventory/stock")
def update_stock_manually(payload: ManualStockPayload, db: Session = Depends(get_db)):
    """Allows the chef to manually add stock and define automation rules."""
    ingredient = db.query(RawIngredient).filter(
        RawIngredient.restaurant_id == payload.restaurant_id,
        func.lower(RawIngredient.name) == payload.name.lower()
    ).first()

    if ingredient:
        # If it exists, just add the new delivery to the current stock
        ingredient.current_stock += payload.quantity
        # Update the rules in case the chef wants to adjust them
        ingredient.reorder_threshold = payload.reorder_threshold
        ingredient.reorder_qty = payload.reorder_qty
    else:
        # If it's a brand new item, create it with the chef's specific rules
        ingredient = RawIngredient(
            restaurant_id=payload.restaurant_id,
            name=payload.name,
            current_stock=payload.quantity,
            unit=payload.unit,
            reorder_threshold=payload.reorder_threshold, 
            reorder_qty=payload.reorder_qty,
            search_query=f"{payload.name} {payload.unit}"
        )
        db.add(ingredient)
    
    db.commit()
    return {"status": "success", "message": f"Added {payload.quantity}{payload.unit} of {payload.name}"}

@app.post("/api/inventory/stock")
def update_stock_manually(payload: ManualStockPayload, db: Session = Depends(get_db)):
    """Allows the chef to manually add delivered stock (e.g., 50kg potatoes)."""
    # Try to find existing ingredient
    ingredient = db.query(RawIngredient).filter(
        RawIngredient.restaurant_id == payload.restaurant_id,
        func.lower(RawIngredient.name) == payload.name.lower()
    ).first()

    if ingredient:
        # Add to existing stock
        ingredient.current_stock += payload.quantity
    else:
        # Create a new raw material with some safe defaults for the AI to update later
        ingredient = RawIngredient(
            restaurant_id=payload.restaurant_id,
            name=payload.name,
            current_stock=payload.quantity,
            unit=payload.unit,
            reorder_threshold=1.0, 
            reorder_qty=5.0,
            search_query=f"{payload.name} {payload.unit}"
        )
        db.add(ingredient)
    
    db.commit()
    return {"status": "success", "message": f"Added {payload.quantity}{payload.unit} of {payload.name}"}

# Add a simple health check route
@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.get("/api/dashboard/stats")
def get_dashboard_stats(restaurant_id: str, db: Session = Depends(get_db)):
    """Fetches real-time financial and inventory data for the SPECIFIC logged-in kitchen."""
    
    # 1. Verify the tenant
    restaurant = db.query(Restaurant).filter(Restaurant.id == restaurant_id).first()
    if not restaurant:
        return {"revenue": 0, "spend": 0, "net_profit": 0, "critical_inventory": []}

    # 2. Calculate Financials strictly for THIS specific restaurant
    revenue = db.query(func.sum(Transaction.amount)).filter(
        Transaction.type == 'POS_INCOME',
        Transaction.restaurant_id == restaurant.id
    ).scalar() or 0
    
    spend = db.query(func.sum(Transaction.amount)).filter(
        Transaction.type == 'INSTAMART_EXPENSE',
        Transaction.restaurant_id == restaurant.id
    ).scalar() or 0
    
    # 3. Get Critical Inventory strictly for THIS specific restaurant
    critical_stock = db.query(RawIngredient).filter(
        RawIngredient.restaurant_id == restaurant.id,
        RawIngredient.current_stock <= RawIngredient.reorder_threshold
    ).all()

    inventory_data = [
        {"name": item.name, "stock": f"{item.current_stock} {item.unit}", "status": "Low"}
        for item in critical_stock
    ]

    return {
        "revenue": float(revenue),
        "spend": float(spend),
        "net_profit": float(revenue - spend),
        "critical_inventory": inventory_data
    }
    
class AILocalIngestRequest(BaseModel):
    restaurant_id: str
    text: str

@app.post("/api/inventory/ai-ingest")
def ai_ingest_inventory(request: AILocalIngestRequest, db: Session = Depends(get_db)):
    """
    Takes natural language from the chef, parses it via Gemini, 
    and injects it into the inventory and BOM tables.
    """
    # 1. Parse the text using Gemini
    try:
        parsed_data = parse_chef_instructions(request.text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Parsing failed: {str(e)}")

    # 2. Generate a POS Item ID (Slugify the dish name)
    # e.g., "Aloo Paratha" -> "ALOO_PARATHA"
    pos_item_id = re.sub(r'[^A-Z0-9]', '_', parsed_data.dish_name.upper())

    try:
        inserted_ingredients = []
        
        # 3. Process each ingredient
        for item in parsed_data.ingredients:
            
            # Check if ingredient already exists to prevent duplicates
            existing_ingredient = db.query(RawIngredient).filter(
                RawIngredient.restaurant_id == request.restaurant_id,
                func.lower(RawIngredient.name) == item.name.lower()
            ).first()

            if existing_ingredient:
                ingredient_id = existing_ingredient.id
                # Optionally update existing stock here if desired
            else:
                # Create new ingredient
                new_ingredient = RawIngredient(
                    restaurant_id=request.restaurant_id,
                    name=item.name,
                    current_stock=item.current_stock,
                    unit=item.unit,
                    reorder_threshold=item.reorder_threshold,
                    reorder_qty=item.reorder_qty,
                    search_query=item.search_query
                )
                db.add(new_ingredient)
                db.flush() # Flush to get the newly generated UUID
                ingredient_id = new_ingredient.id
                inserted_ingredients.append(item.name)

            # 4. Create the Bill of Materials (Recipe mapping)
            # Use a merge/upsert approach in case they are updating an existing recipe
            existing_bom = db.query(RecipeBOM).filter(
                RecipeBOM.pos_item_id == pos_item_id,
                RecipeBOM.ingredient_id == ingredient_id
            ).first()

            if not existing_bom:
                new_bom = RecipeBOM(
                    pos_item_id=pos_item_id,
                    ingredient_id=ingredient_id,
                    burn_rate=item.burn_rate
                )
                db.add(new_bom)

        # 5. Commit the entire transaction atomically
        db.commit()
        
        return {
            "status": "success", 
            "dish": parsed_data.dish_name,
            "pos_id": pos_item_id,
            "ingredients_processed": len(parsed_data.ingredients),
            "new_items_added": inserted_ingredients
        }

    except Exception as e:
        db.rollback() # If anything fails, undo all database changes
        raise HTTPException(status_code=500, detail=f"Database injection failed: {str(e)}")
    
class RestaurantCreate(BaseModel):
    name: str

@app.post("/api/restaurants")
def create_restaurant(payload: RestaurantCreate, db: Session = Depends(get_db)):
    """Creates a new B2B tenant before they authenticate with Swiggy."""
    new_restaurant = Restaurant(name=payload.name)
    db.add(new_restaurant)
    db.commit()
    db.refresh(new_restaurant)
    
    return {
        "status": "success", 
        "id": str(new_restaurant.id), 
        "name": new_restaurant.name
    }

@app.get("/api/inventory/{restaurant_id}")
def get_full_inventory(restaurant_id: str, db: Session = Depends(get_db)):
    """Fetches the complete master inventory list for the dashboard."""
    inventory = db.query(RawIngredient).filter(RawIngredient.restaurant_id == restaurant_id).all()
    
    # Return an empty list if the kitchen is brand new
    if not inventory:
        return []
        
    return [
        {
            "id": str(i.id), 
            "name": i.name, 
            "stock": float(i.current_stock), 
            "unit": i.unit, 
            "status": "Healthy" if float(i.current_stock) > float(i.reorder_threshold) else "Low"
        } 
        for i in inventory
    ]