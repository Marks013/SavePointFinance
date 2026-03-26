import uuid
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.category import Category

# Simple fast keyword lookup to save AI tokens for common Brazilian expenses
# Map to category names from seed (categories.py _seed_defaults)
KEYWORD_MAP = {
    r"(?i)\b(ifood|mcdonalds|burger king|uber eats|rappi|mercado|supermercado|carrefour|extra|pao de acucar)\b": "Alimentação",
    r"(?i)\b(uber|99|pop|cabify|posto|ipiranga|shell)\b": "Transporte",
    r"(?i)\b(netflix|spotify|amazon prime|hbo|disney|apple)\b": "Assinaturas",
    r"(?i)\b(nubank|itau|inter|bradesco|fatura)\b": "Cartão de Crédito",
    r"(?i)\b(farmacia|drogaria|remedio|pague menos)\b": "Saúde",
}

async def classify_by_rules(description: str, tenant_id: str, db: AsyncSession) -> uuid.UUID | None:
    matched_name = None
    for pattern, cat_name in KEYWORD_MAP.items():
        if re.search(pattern, description):
            matched_name = cat_name
            break
            
    if not matched_name:
        return None
        
    try:
        tenant_uuid = uuid.UUID(tenant_id) if isinstance(tenant_id, str) else tenant_id
        result = await db.execute(
            select(Category).where(
                Category.tenant_id == tenant_uuid,
                Category.name.ilike(f"%{matched_name}%")
            ).limit(1)
        )
        category = result.scalar_one_or_none()
        if category:
            return category.id
    except Exception as e:
        print(f"[Rules Classifier Error] {e}")
        
    return None
