import os
import asyncio
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.prebuilt import create_react_agent
from mcp.client.sse import sse_client
from mcp.client.session import ClientSession
from langchain_mcp_adapters.tools import load_mcp_tools

async def initialize_swiggy_agent(swiggy_oauth_token: str):
    """
    Connects to the Swiggy MCP server using Server-Sent Events (SSE), 
    extracts the tool schemas, and binds them to Google Gemini.
    """
    # 1. Initialize Google Gemini
    # Ensure GOOGLE_API_KEY is in your .env file
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-pro", # Or gemini-2.5-flash for speed
        temperature=0,
        max_retries=2
    )

    # 2. Configure the Swiggy Instamart MCP URL & Auth Headers
    instamart_url = "https://mcp.swiggy.com/instamart"
    headers = {
        "Authorization": f"Bearer {swiggy_oauth_token}"
    }

    # 3. Connect to the Swiggy MCP via SSE
    # This is where the magic happens. We connect to their server and it 
    # streams back the definitions for all 13 Instamart tools.
    async with sse_client(url=instamart_url, headers=headers) as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()
            
            # Load the tools directly from Swiggy's MCP server into LangChain format
            swiggy_tools = await load_mcp_tools(session)
            
            # 4. Create the LangGraph Agent
            # We give Gemini the official Swiggy tools. 
            system_prompt = """
            You are an autonomous supply chain agent for a restaurant. 
            Your job is to restock inventory via Swiggy Instamart.
            ALWAYS call 'get_addresses' first to find the delivery location before searching or checking out.
            """
            
            agent_executor = create_react_agent(
                model=llm,
                tools=swiggy_tools,
                state_modifier=system_prompt
            )
            
            return agent_executor, session