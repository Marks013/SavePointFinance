import json
from anthropic import AsyncAnthropic
from app.config import settings
from typing import Optional, Dict, Any

anthropic_client = None
if settings.ANTHROPIC_API_KEY:
    anthropic_client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)


async def analyze_transaction(user_message: str, user_categories: list[dict]) -> Dict[str, Any]:
    """
    Calls Anthropic (Claude 3.5 Haiku) to extract transaction data from a user's natural language message.
    Categories must match the exact ones passed.
    """
    categories_context = "\n".join(
        [f"- ID: {c['id']}, Nome: {c['name']}, Tipo: {c['type']}" for c in user_categories]
    )

    prompt = f"""Você é um assistente de extração de dados financeiros. Seu retorno deve ser **exclusivamente um JSON válido**. Nenhum outro texto.

Mensagem do usuário: "{user_message}"

Lista de Categorias Permitidas:
{categories_context}

Sua tarefa:
1. Identificar o valor da transação (como float).
2. Identificar a descrição curta da transação.
3. Determinar o tipo da transação: 'expense' (despesa) ou 'income' (receita). Assuma 'expense' para compras e gastos gerais.
4. Tentar classificar a transação em **exatamente** UM dos IDs de categoria acima. 
Se NENHUMA categoria existente fizer sentido (mesmo com nomes similares), ou for um gasto totalmente novo, retorne null para "category_id". Não invente IDs.

Formato esperado de saída JSON:
{{
  "value": 50.00,
  "description": "Ifood almoço",
  "type": "expense",
  "category_id": "uuid-da-categoria-ou-null"
}}
"""
    if not anthropic_client:
        return {"value": 0.0, "description": "Chave Anthropic ausente", "type": "expense", "category_id": None}
    
    try:
        response = await anthropic_client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=256,
            temperature=0.0,
            messages=[{"role": "user", "content": prompt}]
        )
        return json.loads(response.content[0].text)
    except Exception as e:
        print(f"[AI Service Error] {str(e)}")
        return {
            "value": 0.0,
            "description": "Erro na interpretação do texto",
            "type": "expense",
            "category_id": None
        }
