"""
ai_classifier.py — Arquitetura em 3 Camadas de Classificação

CAMADA 1 → Regras locais (category_rules.py)   → ~70% dos casos — GRÁTIS
CAMADA 2 → Claude Haiku 4.5                     → ~28% dos casos — Custo mínimo
CAMADA 3 → Categoria "Outros" como fallback      → ~2% dos casos — GRÁTIS
"""
import uuid
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.category import Category
from app.services.ai_service import anthropic_client


async def classify_transaction(
    description: str,
    type_val: str,
    tenant_id: str,
    db: AsyncSession,
) -> dict | None:
    """
    Camada 2: Claude Haiku 4.5 para descrições não classificadas pelas regras locais.
    Chamado APENAS quando a Camada 1 não identificou a categoria.
    Custo real: ~R$ 0,10/mês para uso típico.
    """
    if not anthropic_client:
        return None

    try:
        tenant_uuid = uuid.UUID(tenant_id) if isinstance(tenant_id, str) else tenant_id
        result = await db.execute(
            select(Category).where(Category.tenant_id == tenant_uuid)
        )
        categories = result.scalars().all()

        if not categories:
            return None

        categories_context = "\n".join([
            f"- ID: {str(c.id)}, Nome: {c.name}, Tipo: {c.type.value}"
            for c in categories
        ])

        # Prompt otimizado para português brasileiro coloquial + Haiku
        prompt = f"""Classifique esta transação financeira brasileira em uma categoria.

Transação: "{description}"
Tipo: {type_val} (expense=despesa, income=receita)

Categorias disponíveis:
{categories_context}

Exemplos de expressões coloquiais brasileiras:
- "fui no rango" = Alimentação
- "abasteci o carro" = Transporte
- "paguei o condomin" = Moradia
- "academia" = Saúde/Esporte

Responda APENAS com JSON válido, sem texto extra:
{{"category_id": "uuid-aqui-ou-null", "confidence": 0.95}}"""

        response = await anthropic_client.messages.create(
            model="claude-haiku-4-5-20251001",  # Haiku 4.5 — mais barato e rápido
            max_tokens=100,
            temperature=0.0,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text.strip()
        # Remove possíveis backticks
        if text.startswith("```"):
            text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

        data = json.loads(text)
        cat_id_raw = data.get("category_id")

        if cat_id_raw and cat_id_raw not in ("null", None):
            parsed_id = uuid.UUID(cat_id_raw)
            return {
                "category_id": parsed_id,
                "confidence": float(data.get("confidence", 0.85)),
            }

    except json.JSONDecodeError as e:
        print(f"[AI Classifier] JSON parse error: {e}")
    except Exception as e:
        print(f"[AI Classifier Error] {e}")

    return None


async def classify_smart(
    description: str,
    type_val: str,
    tenant_id: str,
    db: AsyncSession,
) -> uuid.UUID | None:
    """
    Ponto de entrada da classificação em 3 camadas.
    Retorna UUID da categoria encontrada ou None (→ usar 'Outros').

    FLUXO:
    1. Camada 1: Regras locais (regex, grátis)
    2. Camada 2: Claude Haiku 4.5 (se camada 1 falhou)
    3. Camada 3: None → frontend mostra "Outros"
    """
    from app.services.category_rules import classify_by_rules

    # CAMADA 1 — Regras locais
    cat_id = await classify_by_rules(description, tenant_id, db)
    if cat_id:
        return cat_id

    # CAMADA 2 — Claude Haiku 4.5
    result = await classify_transaction(description, type_val, tenant_id, db)
    if result:
        return result["category_id"]

    # CAMADA 3 — Fallback: retorna None (UI mostrará "Outros")
    return None
