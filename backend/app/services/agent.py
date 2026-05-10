import os
import asyncio
import traceback
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.prebuilt import create_react_agent
from mcp.client.streamable_http import streamablehttp_client
from mcp.client.session import ClientSession
from langchain_mcp_adapters.tools import load_mcp_tools

async def execute_swiggy_agent(swiggy_oauth_token: str, prompt: str):
    """
    Connects to the Swiggy MCP server, extracts tools, and executes the prompt.
    """
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-pro",
        temperature=0,
        max_retries=2
    )

    instamart_url = "https://mcp.swiggy.com/im"
    headers = {
        "Authorization": f"Bearer {swiggy_oauth_token}"
    }

    try:
        async with streamablehttp_client(url=instamart_url, headers=headers, timeout=60.0) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                swiggy_tools = await load_mcp_tools(session)
                
                # FIX: We remove state_modifier entirely to avoid version crashes.
                agent_executor = create_react_agent(
                    model=llm,
                    tools=swiggy_tools
                )
                
                # FIX: We combine the system rules and the user prompt into one bulletproof message
                full_prompt = f"""
                You are an autonomous supply chain agent for a restaurant. 
                Your job is to restock inventory via Swiggy Instamart.
                ALWAYS call 'get_addresses' first to find the delivery location before searching or checking out.
                
                USER REQUEST: {prompt}
                """
                
                # Execute the LangGraph loop
                result = await agent_executor.ainvoke({"messages": [("user", full_prompt)]})
                return result["messages"][-1].content

    except Exception as e:
        print("\n" + "="*60)
        print(f"🚨 AGENT CRASH DETECTED: {type(e).__name__}")
        print("="*60)
        
        if hasattr(e, 'exceptions'):
            for i, exc in enumerate(e.exceptions):
                print(f"\n--- HIDDEN SUB-EXCEPTION {i+1} ---")
                traceback.print_exception(type(exc), exc, exc.__traceback__)
        else:
            traceback.print_exc()
            
        print("="*60 + "\n")
        raise e