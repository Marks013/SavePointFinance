import uuid
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.category import Category
from app.services.ai_service import anthropic_client

async def classify_transaction(description: str, type_val: str, tenant_id: str, db: AsyncSession) -> dict | None:
    """
    Leverages Claude 3.5 Haiku to accurately categorize a transaction based on the tenant's existing categories.
    """
    try:
        tenant_uuid = uuid.UUID(tenant_id) if isinstance(tenant_id, str) else tenant_id
        result = await db.execute(select(Category).where(Category.tenant_id == tenant_uuid))
        categories = result.scalars().all()
        
        if not categories:
            return None
            
        categories_context = "\n".join([f"- ID: {str(c.id)}, Nome: {c.name}, Tipo: {c.type.value}" for c in categories])
        
        prompt = f"""Você é um assistente financeiro de classificação. Retorne EXCLUSIVAMENTE um JSON válido.
        
Transação a classificar: "{description}"
Tipo (expense/income): {type_val}

Categorias existentes do usuário:
{categories_context}

Escolha a categoria que MELHOR se aplica à transação. Sua resposta DEVE ser estritamente no formato JSON abaixo:
{{
  "category_id": "uuid-escolhido-aqui-ou-null",
  "confidence": 0.95
}}
"""
        response = await anthropic_client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=150,
            temperature=0.0,
            messages=[{"role": "user", "content": prompt}]
        )
        
        # Safely parse the returning JSON string
        data = json.loads(response.content[0].text.strip())
        cat_id_raw = data.get("category_id")
        
        if cat_id_raw and cat_id_raw != "null":
            parsed_id = uuid.UUID(cat_id_raw)
            return {"category_id": parsed_id, "confidence": float(data.get("confidence", 0.85))}
            
    except json.JSONDecodeError:
        print("[AI Classifier] JSON Decode error.")
    except Exception as e:
        print(f"[AI Classifier Error] {e}")
        
    return None
