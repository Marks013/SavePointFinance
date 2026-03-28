import json
from anthropic import AsyncAnthropic
from app.config import settings
from typing import Optional, Dict, Any

anthropic_client = None
if settings.ANTHROPIC_API_KEY:
    anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

async def analyze_transaction(user_message: str, user_categories: list[dict]) -> Dict[str, Any]:
    categories_context = "\n".join(
        [f"- ID: {c['id']}, Nome: {c['name']}, Tipo: {c['type']}" for c in user_categories]
    )
    prompt = f"""Você é um assistente de extração de dados financeiros. Retorne EXCLUSIVAMENTE um JSON válido.

Mensagem: "{user_message}"
Categorias disponíveis:
{categories_context}

Formato JSON:
{{"value": 50.00, "description": "Descrição curta", "type": "expense", "category_id": "uuid-ou-null"}}"""

    if not anthropic_client:
        return {"value": 0.0, "description": "Chave Anthropic ausente", "type": "expense", "category_id": None}

    try:
        response = await anthropic_client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            temperature=0.0,
            messages=[{"role": "user", "content": prompt}]
        )
        return json.loads(response.content[0].text)
    except Exception as e:
        print(f"[AI Service Error] {str(e)}")
        return {"value": 0.0, "description": "Erro na interpretação", "type": "expense", "category_id": None}
