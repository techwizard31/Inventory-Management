import requests
import uuid

# Replace this with your exact Kitchen ID from the dashboard
RESTAURANT_ID = "cdb6c69a-83ba-4a01-a99a-9ffa3f504b55" 

# The exact POS ID you generated via the AI Dictation
POS_ITEM_ID = "PANEER_TIKKA" 

def send_order():
    url = "http://127.0.0.1:8000/api/webhooks/pos"
    
    # Generate a fake order ID for the test
    fake_order_id = f"POS-{uuid.uuid4().hex[:6].upper()}"
    
    # Updated payload to perfectly match the POSWebhookPayload schema
    payload = {
        "restaurant_id": RESTAURANT_ID,
        "pos_item_id": POS_ITEM_ID,
        "quantity": 5,                 # Ordering 5 to force a stock drop
        "order_value": 1250.00,        # Fake revenue amount for the ledger
        "order_id": fake_order_id      # Fake order ID for the ledger
    }
    
    print(f"Sending POS Webhook for 5x {POS_ITEM_ID}...")
    response = requests.post(url, json=payload)
    
    if response.status_code == 200:
        print("Success! Check your Dashboard to see the revenue spike and stock drop.")
    else:
        print(f"Failed: {response.status_code}")
        print(response.text)

if __name__ == "__main__":
    send_order()