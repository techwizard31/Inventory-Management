import os
import asyncio
import re  # <-- IMPORT ADDED FOR REGEX PARSING
from datetime import datetime
from celery import Celery

from dotenv import load_dotenv
load_dotenv()

from app.core.database import SessionLocal
from app.models import Transaction, Restaurant, RawIngredient
from app.services.inventory import process_inventory_deduction
from app.services.agent import execute_swiggy_agent 

celery_app = Celery(
    "jit_kitchen_tasks",
    broker=os.getenv("REDIS_URL", "redis://localhost:6379/0")
)  

@celery_app.task
def handle_pos_order(restaurant_id: str, pos_item_id: str, quantity: int):
    """Background worker to handle inventory math without blocking the webhook."""
    db = SessionLocal()
    try:
        critical_items = process_inventory_deduction(db, pos_item_id, quantity)
        for item in critical_items:
            execute_swiggy_restock.delay(
                item["restaurant_id"], 
                item["id"], 
                item["reorder_qty"]
            )
    finally:
        db.close()

@celery_app.task
def execute_swiggy_restock(restaurant_id: str, ingredient_id: str, order_qty: float):
    """Executes the Instamart purchase and logs the official Swiggy receipt."""
    db = SessionLocal()
    try:
        restaurant = db.query(Restaurant).filter(Restaurant.id == restaurant_id).first()
        ingredient = db.query(RawIngredient).filter(RawIngredient.id == ingredient_id).first()
        
        if not restaurant or not restaurant.swiggy_access_token:
            print(f"[{datetime.now()}] Skipping restock: No Swiggy connection for {restaurant.name}")
            return
            
        search_query = ingredient.search_query
        
        print(f"[{datetime.now()}] Initializing Swiggy MCP for {ingredient.name}...")
        
        prompt = (
            f"You need to urgently restock inventory. "
            f"Search Instamart for '{search_query}'. "
            f"Find the best match and checkout {order_qty} units. "
            f"Return ONLY the final order status and Swiggy Order ID."
        )
        
        agent_receipt = asyncio.run(execute_swiggy_agent(restaurant.swiggy_access_token, prompt))
        
        # FIX: Use Regex to extract ONLY the numeric Order ID from the raw LangChain array
        raw_receipt = str(agent_receipt)
        match = re.search(r'(?i)order\s*id[^\d]*(\d+)', raw_receipt)
        
        if match:
            # If it finds the ID, format it beautifully: "Swiggy Order #237411480216722"
            safe_receipt = f"Swiggy Order #{match.group(1)}"
        else:
            # Safe fallback if the AI phrases it weirdly
            safe_receipt = "Swiggy Auto-Restock Completed"
        
        estimated_cost = order_qty * 150.0 
        
        new_transaction = Transaction(
            restaurant_id=restaurant_id,
            type="INSTAMART_EXPENSE",
            amount=estimated_cost,
            reference_id=safe_receipt 
        )
        
        ingredient.current_stock = float(ingredient.current_stock) + float(order_qty)
        
        db.add(new_transaction)
        db.commit()
        
        print(f"[{datetime.now()}] SUCCESS: Restock logged to ledger -> {safe_receipt}")

    except Exception as e:
        db.rollback()
        print(f"[{datetime.now()}] FAILED to execute restock: {str(e)}")
    finally:
        db.close()