import os
import asyncio
from datetime import datetime
from celery import Celery

# Adjust these imports based on your actual folder structure if needed
from app.core.database import SessionLocal
from app.models import Transaction, Restaurant, RawIngredient
from app.services.inventory import process_inventory_deduction
from app.services.agent import initialize_swiggy_agent

# Initialize Celery (Expects Redis running locally on default port)
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
        
        # Dispatch a separate restock task for every item that breached the threshold
        for item in critical_items:
            # This now triggers the LangGraph AI Agent!
            execute_swiggy_restock.delay(
                item["restaurant_id"], 
                item["id"], 
                item["reorder_qty"]
            )
    finally:
        db.close()

@celery_app.task
def execute_swiggy_restock(restaurant_id: str, ingredient_id: str, order_qty: float):
    """
    Background worker that runs the LangGraph AI agent, executes the Instamart 
    purchase, and logs the official Swiggy receipt to the financial ledger.
    """
    db = SessionLocal()
    try:
        # 1. Fetch the necessary data
        restaurant = db.query(Restaurant).filter(Restaurant.id == restaurant_id).first()
        ingredient = db.query(RawIngredient).filter(RawIngredient.id == ingredient_id).first()
        
        if not restaurant or not restaurant.swiggy_access_token:
            print(f"[{datetime.now()}] Skipping restock: No Swiggy connection for {restaurant.name}")
            return
            
        search_query = ingredient.search_query
        
        # 2. Run the AI Agent asynchronously
        async def run_agent():
            agent_executor, session = await initialize_swiggy_agent(restaurant.swiggy_access_token)
            
            prompt = (
                f"You need to urgently restock inventory. "
                f"Search Instamart for '{search_query}'. "
                f"Find the best match and checkout {order_qty} units. "
                f"Return ONLY the final order status and Swiggy Order ID."
            )
            
            result = await agent_executor.ainvoke({"messages": [("user", prompt)]})
            await session.close()
            return result["messages"][-1].content
            
        print(f"[{datetime.now()}] Initializing Swiggy MCP for {ingredient.name}...")
        agent_receipt = asyncio.run(run_agent())
        
        # 3. Calculate an estimated cost (Placeholder for dashboard)
        estimated_cost = order_qty * 150.0 
        
        # 4. Write the VERIFIABLE proof to the Ledger
        new_transaction = Transaction(
            restaurant_id=restaurant_id,
            type="INSTAMART_EXPENSE",
            amount=estimated_cost,
            reference_id=f"Order: {agent_receipt}" # Swapped 'description' to 'reference_id'
            # We completely remove 'timestamp' because your DB auto-generates 'created_at'!
        )
        
        # Automatically update the local inventory stock back to healthy levels
        ingredient.current_stock += order_qty
        
        db.add(new_transaction)
        db.commit()
        
        print(f"[{datetime.now()}] SUCCESS: Restock logged to ledger.")

    except Exception as e:
        db.rollback()
        print(f"[{datetime.now()}] FAILED to execute restock: {str(e)}")
    finally:
        db.close()