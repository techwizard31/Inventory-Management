import time
import requests
from app.core.database import SessionLocal
from app.models import Restaurant, RawIngredient, RecipeBOM

def seed_database():
    """Injects test data into Supabase."""
    db = SessionLocal()
    try:
        # 1. Create a Test Restaurant
        # Note: We are leaving the Swiggy token blank for this test to avoid 
        # actually charging a credit card during our dry run.
        restaurant = Restaurant(name="The Test Kitchen", swiggy_address_id="ADDR_123")
        db.add(restaurant)
        db.flush() # Get the generated UUID without committing yet

        # 2. Add Raw Material (Paneer)
        # Starting with 3.0 kg, reorder threshold is 1.0 kg
        paneer = RawIngredient(
            restaurant_id=restaurant.id,
            name="Paneer",
            current_stock=3.000,
            unit="kg",
            reorder_threshold=1.000,
            reorder_qty=2.000,
            search_query="Fresh Paneer 500g"
        )
        db.add(paneer)
        db.flush()

        # 3. Create the Bill of Materials (The Recipe)
        # Every time 'PETPOOJA_PANEER_MASALA' is ordered, burn 0.5 kg of Paneer
        pos_item_id = "PETPOOJA_PANEER_MASALA"
        bom = RecipeBOM(
            pos_item_id=pos_item_id,
            ingredient_id=paneer.id,
            burn_rate=0.500
        )
        db.add(bom)
        
        db.commit()
        print(f"✅ DB Seeded. Restaurant ID: {restaurant.id}")
        return str(restaurant.id), pos_item_id

    except Exception as e:
        db.rollback()
        print(f"❌ DB Setup Failed: {e}")
        return None, None
    finally:
        db.close()

def fire_webhook(restaurant_id: str, pos_item_id: str, qty: int, order_id: str):
    """Simulates the POS system sending an order to our API."""
    url = "http://127.0.0.1:8000/api/webhooks/pos"
    payload = {
        "restaurant_id": restaurant_id,
        "pos_item_id": pos_item_id,
        "quantity": qty,
        "order_value": 450.00 * qty,
        "order_id": order_id
    }
    
    print(f"🚀 Firing Webhook for {qty}x Paneer Butter Masala...")
    response = requests.post(url, json=payload)
    print(f"📥 API Response: {response.status_code} - {response.json()}\n")

if __name__ == "__main__":
    print("--- Starting JIT Kitchen Simulation ---")
    rest_id, item_id = seed_database()
    
    if rest_id:
        # Order 1: Uses 1.0 kg (Stock drops from 3.0 -> 2.0) - No Trigger
        fire_webhook(rest_id, item_id, qty=2, order_id="ORD-001")
        time.sleep(1)

        # Order 2: Uses 1.5 kg (Stock drops from 2.0 -> 0.5) - TRIGGERS SWIGGY!
        fire_webhook(rest_id, item_id, qty=3, order_id="ORD-002")
        
        print("🎉 Simulation complete. Check your Celery terminal!")