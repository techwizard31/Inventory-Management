import uuid
from sqlalchemy import Column, String, Numeric, Boolean, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base

class Restaurant(Base):
    __tablename__ = "restaurants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    swiggy_access_token = Column(String, nullable=True) # Will be encrypted
    swiggy_address_id = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    ingredients = relationship("RawIngredient", back_populates="restaurant")
    transactions = relationship("Transaction", back_populates="restaurant")

class RawIngredient(Base):
    __tablename__ = "raw_ingredients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    restaurant_id = Column(UUID(as_uuid=True), ForeignKey("restaurants.id"), nullable=False)
    name = Column(String(100), nullable=False)
    current_stock = Column(Numeric(10, 3), nullable=False)
    unit = Column(String(10), nullable=False) # e.g., 'kg', 'ltr'
    reorder_threshold = Column(Numeric(10, 3), nullable=False)
    reorder_qty = Column(Numeric(10, 3), nullable=False)
    search_query = Column(String(255), nullable=True) # e.g., "Fresh Tomato 1kg"

    # Relationships
    restaurant = relationship("Restaurant", back_populates="ingredients")
    bom_entries = relationship("RecipeBOM", back_populates="ingredient")

class RecipeBOM(Base):
    __tablename__ = "recipe_bom"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    pos_item_id = Column(String(100), nullable=False) # ID from the POS system webhook
    ingredient_id = Column(UUID(as_uuid=True), ForeignKey("raw_ingredients.id"), nullable=False)
    burn_rate = Column(Numeric(10, 3), nullable=False) # Amount deducted per order

    # Relationships
    ingredient = relationship("RawIngredient", back_populates="bom_entries")

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    restaurant_id = Column(UUID(as_uuid=True), ForeignKey("restaurants.id"), nullable=False)
    type = Column(String(20), nullable=False) # 'POS_INCOME' or 'INSTAMART_EXPENSE'
    amount = Column(Numeric(10, 2), nullable=False)
    reference_id = Column(String(100), nullable=True) # Order ID or Swiggy ID
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    restaurant = relationship("Restaurant", back_populates="transactions")