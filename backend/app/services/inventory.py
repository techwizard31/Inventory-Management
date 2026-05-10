import logging
from sqlalchemy.orm import Session
from app.models import RawIngredient, RecipeBOM

logger = logging.getLogger(__name__)

def process_inventory_deduction(db: Session, pos_item_id: str, order_qty: int):
    """
    Calculates depletion, applies row-level locking to prevent race conditions, 
    and returns a list of items that breached the safety threshold.
    """
    items_to_restock = []

    try:
        # Find all raw materials needed for this specific POS item
        boms = db.query(RecipeBOM).filter(RecipeBOM.pos_item_id == pos_item_id).all()
        
        if not boms:
            logger.warning(f"No recipe mapping found for POS item: {pos_item_id}")
            return items_to_restock

        # Iterate and deduct
        for bom in boms:
            # Lock the specific ingredient row until this math commits
            ingredient = db.query(RawIngredient).filter(
                RawIngredient.id == bom.ingredient_id
            ).with_for_update().first()

            if not ingredient:
                continue

            # Calculate the total material used in this specific order batch
            total_burned = bom.burn_rate * order_qty
            ingredient.current_stock -= total_burned

            # If the stock drops below the safety threshold, flag it for purchase
            if ingredient.current_stock <= ingredient.reorder_threshold:
                items_to_restock.append({
                    "id": str(ingredient.id),
                    "restaurant_id": str(ingredient.restaurant_id),
                    "search_query": ingredient.search_query,
                    "reorder_qty": float(ingredient.reorder_qty)
                })

        # Commit the calculations to Supabase
        db.commit()
        return items_to_restock

    except Exception as e:
        db.rollback()
        logger.error(f"Inventory deduction failed: {str(e)}")
        raise e