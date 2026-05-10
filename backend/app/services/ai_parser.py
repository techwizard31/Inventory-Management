import os
from pydantic import BaseModel, Field
from typing import List
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from app.core.config import settings

# 1. Define the strict schema we want Gemini to output
class ParsedIngredient(BaseModel):
    name: str = Field(description="Name of the raw ingredient (e.g., Potato, Flour)")
    current_stock: float = Field(description="Current physical stock quantity")
    unit: str = Field(description="Unit of measurement. IMPORTANT: Normalize all weights to 'kg' and volumes to 'ltr'. e.g., 500 grams becomes 0.5 kg.")
    reorder_threshold: float = Field(description="Quantity at which to trigger a Swiggy restock")
    reorder_qty: float = Field(description="How much to buy when restocking. If not specified, default to a logical bulk amount (e.g., 2.0 or 5.0)")
    burn_rate: float = Field(description="How much of this ingredient is used to cook ONE order of the dish. Must match the normalized unit (e.g., 200g = 0.2kg).")
    search_query: str = Field(description="An optimized Swiggy Instamart search string (e.g., 'Fresh Potato 1kg')")

class RecipeIngestionSchema(BaseModel):
    dish_name: str = Field(description="The name of the menu item / dish")
    ingredients: List[ParsedIngredient]

# 2. Build the parsing engine
def parse_chef_instructions(text: str) -> RecipeIngestionSchema:
    """Takes natural language and returns structured database entities."""
    
    # Initialize Gemini (Requires GOOGLE_API_KEY in environment)
    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-pro", 
        temperature=0, # Temperature 0 for strict data extraction
        max_retries=2,
        api_key=settings.GOOGLE_API_KEY
    )
    
    # Force Gemini to output data matching our Pydantic schema
    structured_llm = llm.with_structured_output(RecipeIngestionSchema)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are an expert culinary supply chain data parser. 
        Extract the dish name, ingredients, stock levels, reorder thresholds, and per-dish burn rates from the chef's input. 
        CRITICAL: Normalize all units. If a chef says 'uses 200 grams but I have 15kg in stock', convert the burn rate to 0.2 kg so the units match."""),
        ("human", "{text}")
    ])
    
    chain = prompt | structured_llm
    
    # Execute the chain
    return chain.invoke({"text": text})