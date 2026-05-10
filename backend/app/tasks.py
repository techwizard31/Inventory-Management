import os
import asyncio
from celery import Celery
from app.core.database import SessionLocal
from app.services.inventory import process_inventory_deduction
from app.services.swiggy_mcp import SwiggyMCPService
from app.models import Transaction, Restaurant

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
            trigger_swiggy_restock.delay(
                item["restaurant_id"], 
                item["id"], 
                item["search_query"], 
                item["reorder_qty"]
            )
    finally:
        db.close()

@celery_app.task
def trigger_swiggy_restock(restaurant_id: str, ingredient_id: str, query: str, qty: float):
    """Executes the Instamart purchase and logs the expense."""
    db = SessionLocal()
    try:
        restaurant = db.query(Restaurant).filter(Restaurant.id == restaurant_id).first()
        if not restaurant or not restaurant.swiggy_access_token:
            return

        mcp_service = SwiggyMCPService(restaurant.swiggy_access_token)
        
        # Celery workers are synchronous, so we run the async HTTPX call in an event loop
        result = asyncio.run(mcp_service.restock_item(
            address_id=restaurant.swiggy_address_id,
            query=query,
            quantity=qty
        ))

        # If checkout is successful, record the financial hit in the Ledger
        if result and result.get("orderId"):
            expense = Transaction(
                restaurant_id=restaurant.id,
                type="INSTAMART_EXPENSE",
                amount=result.get("totalAmount", 0), 
                reference_id=result.get("orderId")
            )
            db.add(expense)
            db.commit()

    except Exception as e:
        db.rollback()
        # In a production environment, this is where you'd trigger a Slack/Email alert 
        # to the kitchen manager that the automation failed.
        print(f"Restock failed for {ingredient_id}: {e}")
    finally:
        db.close()