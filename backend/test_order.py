import requests
import sys

# Replace this with the Kitchen ID you see in your dashboard sidebar!
RESTAURANT_ID = "YOUR_KITCHEN_ID_HERE" 

# Replace with the exact POS ID you generated via the AI Dictation (e.g., CHICKEN_BIRYANI)
POS_ITEM_ID = "CHICKEN_BIRYANI" 

def send_order():
    url = "http://127.0.0.1:8000/api/webhooks/pos"
    payload = {
        "restaurant_id": RESTAURANT_ID,
        "items": [
            {
                "pos_item_id": POS_ITEM_ID,
                "quantity": 10 # Ordering 10 to force a massive stock drop
            }
        ]
    }
    
    print(f"Sending order for 10x {POS_ITEM_ID}...")
    response = requests.post(url, json=payload)
    
    if response.status_code == 200:
        print("Success! Check your Dashboard to see the revenue spike and stock drop.")
    else:
        print(f"Failed: {response.text}")

if __name__ == "__main__":
    send_order()