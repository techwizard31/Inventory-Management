import httpx
from app.core.config import settings

class SwiggyMCPService:
    """Helper to communicate with Swiggy MCP tools over HTTP."""
    
    def __init__(self, access_token: str):
        self.headers = {"Authorization": f"Bearer {access_token}"}
        self.base_url = "https://mcp.swiggy.com/v1/tools"

    async def call_tool(self, tool_name: str, arguments: dict):
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/{tool_name}",
                json={"arguments": arguments},
                headers=self.headers
            )
            data = response.json()
            if not data.get("success"):
                raise Exception(f"MCP Tool Error: {data.get('message')}")
            return data["data"]

    async def restock_item(self, address_id: str, query: str, quantity: float):
        # Search -> Find First -> Add to Cart -> Checkout
        search_results = await self.call_tool("search_products", {"addressId": address_id, "query": query})
        if not search_results.get("items"):
            return None
            
        product = search_results["items"][0]
        return await self.call_tool("checkout", {
            "addressId": address_id,
            "items": [{"id": product["id"], "quantity": int(quantity)}]
        })