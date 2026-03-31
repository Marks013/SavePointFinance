import uuid
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.category import Category

# Simple fast keyword lookup to save AI tokens for common Brazilian expenses
# Map to category names from seed (categories.py _seed_defaults)
KEYWORD_MAP = {
    # Income
    r"(?i)\b(salario|folha|pagamento|vencimento)\b": "Salário",
    r"(?i)\b(freelance|projeto|servico|autonomo)\b": "Freelance",
    r"(?i)\b(dividendo|rendimento|acao|fundo|investimento|juros)\b": "Investimentos",
    
    # Expense - Alimentação
    r"(?i)\b(ifood|mcdonalds|burger king|uber eats|rappi|mercado|supermercado|carrefour|extra|pao de acucar|padaria|lanche|pizza|restaurant|cafe|doceria)\b": "Alimentação",
    
    # Expense - Moradia
    r"(?i)\b(aluguel|condominio|luz|agua|gas|iptu|internet|telefone|luz\.br|claro|vivo|oi|tim)\b": "Moradia",
    
    # Expense - Transporte
    r"(?i)\b(uber|99|pop|cabify|posto|ipiranga|shell|combustivel|estacionamento|onibus|metro|trem|passagem|aviao)\b": "Transporte",
    
    # Expense - Saúde
    r"(?i)\b(farmacia|drogaria|remedio|pague menos|medico|hospital|plano de saude|academia|consulta|exame)\b": "Saúde",
    
    # Expense - Lazer
    r"(?i)\b(cinema|viagem|show|jogo|streaming|netflix|spotify|prime|disney|apple music|hbo|youtube|twitch)\b": "Lazer",
    
    # Expense - Educação
    r"(?i)\b(faculdade|curso|livro|escola|treinamento|udemy|coursera|estudo)\b": "Educação",
    
    # Expense - Assinaturas
    r"(?i)\b(netflix|spotify|amazon prime|hbo|disney|apple|cloud|adobe|microsoft|assinan)\b": "Assinaturas",
    
    # Expense - Cartão
    r"(?i)\b(nubank|itau|inter|bradesco|fatura|cartao)\b": "Cartão de Crédito",
    
    # Expense - Dízimo
    r"(?i)\b(igreja|oferta|dizimo|doacao|caridade)\b": "Dízimo / Doações",
    
    # Expense - Vestuário
    r"(?i)\b(roupa|calcado|vestuario|moda|loja|magalu|magazine|amazon)\b": "Vestuário",
}

# Build keyword map dynamically from all categories with keywords
async def get_keyword_map(tenant_id: uuid.UUID, db: AsyncSession) -> dict:
    """Build keyword map from category keywords stored in DB."""
    result = await db.execute(select(Category).where(Category.tenant_id == tenant_id))
    categories = result.scalars().all()
    
    keyword_map = {}
    for cat in categories:
        if cat.keywords and isinstance(cat.keywords, list):
            for kw in cat.keywords:
                if kw:
                    pattern = r"(?i)\b(" + re.escape(kw) + r")\b"
                    keyword_map[pattern] = cat.name
    
    # Merge with default rules
    for k, v in KEYWORD_MAP.items():
        if k not in keyword_map:
            keyword_map[k] = v
    
    return keyword_map


async def classify_by_rules(description: str, tenant_id: str, db: AsyncSession) -> uuid.UUID | None:
    """Classify transaction using keyword matching."""
    try:
        tenant_uuid = uuid.UUID(tenant_id) if isinstance(tenant_id, str) else tenant_id
    except (ValueError, TypeError):
        return None
    
    # Get keyword map from categories
    keyword_map = await get_keyword_map(tenant_uuid, db)
    
    matched_name = None
    for pattern, cat_name in keyword_map.items():
        if re.search(pattern, description):
            matched_name = cat_name
            break
            
    if not matched_name:
        return None
        
    try:
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
