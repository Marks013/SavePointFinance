import uuid
import json
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.category import Category
from app.services.ai_service import anthropic_client
from app.services.category_rules import get_category_others, normalize_text


BRASILEIRO_CONTEXT = """
## Contexto Brasileiro de Finanças Pessoais

Você está classificando transações financeiras de um usuário brasileiro no contexto do Brasil.

### Regras de Classificação:
1. Use APENAS categorias que existam na lista fornecida
2. Se nenhuma categoria fizer sentido, retorne category_id como "OUTROS" (ou o ID da categoria "Outros")
3. Para despesas, use categorias como: Alimentação, Moradia, Transporte, Saúde, Lazer, Educação, Assinaturas, Cartão de Crédito, Dízimo/Ofertas, Vestuário, Cosméticos, Pets, Presentes, Utilidades, Burocracia, Serviços, Empréstimo/Financiamento, Outras Despesas
4. Para receitas, use: Salário, Freelance, Investimentos, Aposentadoria, Aluguel Recebido, Bônus, Empréstimo Recebido, Venda, Transferência Recebida, Outras Receitas

### Dicionário de Termos Brasileiros:
- PIX = pagamento instantâneo brasileiro
- TED/DOC = transferências bancárias
- Fatura = cartão de crédito
- Conta de luz = energia elétrica
- Conta de água = saneamento
- IPTU = imposto propriedade
- Condomínio = rateio edifício
--farmácia = drogaria
- Uber/99 = aplicativos de transporte
- iFood = entrega de comida
- Cartão de crédito parcelado = compra parcelada
- Dízimo = contribuição religiosa (10%)
- autônomo = profissional independente
- MEI = microempreendedor individual

### Exemplos de Classificação:
- "Netflix" → Assinaturas (ou Entretenimento)
- "Uber corrida" → Transporte
- "Farmácia" → Saúde
- "iFood" → Alimentação
- "Salário" → Salário
- "Aluguel" → Moradia
- "Conta de luz" → Moradia
- "PIX transferencia" → pode ser transferência
- "Parcelamento" → Cartão de Crédito
- "igreja" → Dízimo/Ofertas
- "academia" → Saúde
- "supermercado" → Alimentação
- "farmácia" → Saúde
"""


async def classify_transaction(description: str, type_val: str, tenant_id: str, db: AsyncSession) -> dict | None:
    """
    Classifica transação usando Claude 3.5 Haiku (30% dos casos).
    Usa contexto brasileiro completo para precisão máxima.
    """
    if not description:
        return None
        
    try:
        tenant_uuid = uuid.UUID(tenant_id) if isinstance(tenant_id, str) else tenant_id
        
        # Get all categories
        result = await db.execute(select(Category).where(Category.tenant_id == tenant_uuid))
        categories = result.scalars().all()
        
        if not categories:
            return None
        
        # Build categories list
        categories_list = []
        for c in categories:
            keywords = c.keywords if c.keywords else []
            keywords_str = ", ".join(keywords[:10]) if keywords else "sem palavras-chave"
            categories_list.append({
                "id": str(c.id),
                "name": c.name,
                "type": c.type.value if hasattr(c.type, 'value') else str(c.type),
                "keywords": keywords_str
            })
        
        categories_context = "\n".join([
            f"- ID: {c['id']}, Nome: {c['name']}, Tipo: {c['type']}, Palavras: {c['keywords']}"
            for c in categories_list
        ])
        
        type_label = "despesa (expense)" if type_val == "expense" else "receita (income)"
        
        # Clean description for better matching
        cleaned_desc = description.strip()
        
        prompt = f"""Você é um assistente financeiro brasileiro expert em classificação de transações.

{BRASILEIRO_CONTEXT}

## Transação a classificar:
- Descrição: "{cleaned_desc}"
- Tipo: {type_label}

## Categorias disponíveis:
{categories_context}

## Sua tarefa:
Analise a descrição acima e escolha a categoria que MELHOR se aplica.
Se nenhuma categoria fazer sentido, use "Outros" como fallback.

Retorne APENAS um JSON válido (sem explicações):
{{
  "category_id": "uuid-da-categoria-ou-OUTROS-se-nenhuma-categorizar",
  "confidence": 0.0-1.0,
  "reason": "breve justificativa em português"
}}

Importante: 
- confidence deve ser alto (>= 0.8) se você tem certeza
- confidence deve ser baixo (< 0.5) se houver dúvida
- category_id deve ser o UUID exato ou "OUTROS"
"""
        
        if not anthropic_client:
            # Fallback to Outros if no API key
            others_id = await get_category_others(tenant_uuid, db)
            return {"category_id": others_id, "confidence": 0.1, "reason": "Sem API key"}
        
        try:
            response = await anthropic_client.messages.create(
                model="claude-3-5-haiku-20241022",
                max_tokens=300,
                temperature=0.1,
                messages=[{"role": "user", "content": prompt}]
            )
            
            # Parse JSON response
            try:
                response_text = response.content[0].text.strip()
                
                # Extract JSON from response (handle potential markdown)
                json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
                if json_match:
                    data = json.loads(json_match.group())
                else:
                    data = json.loads(response_text)
                    
            except (json.JSONDecodeError, AttributeError) as e:
                print(f"[AI Classifier] JSON parse error: {e}")
                # Fallback to Outros
                others_id = await get_category_others(tenant_uuid, db)
                return {"category_id": others_id, "confidence": 0.1, "reason": "Erro parsing"}
            
            # Handle "OUTROS" as fallback
            cat_id_raw = data.get("category_id", "").upper()
            
            if cat_id_raw == "OUTROS" or cat_id_raw == "NULL" or cat_id_raw == "NONE":
                others_id = await get_category_others(tenant_uuid, db)
                if others_id:
                    return {"category_id": others_id, "confidence": float(data.get("confidence", 0.3)), "reason": data.get("reason", "Nenhuma categoria encontrada")}
                return None
            
            if cat_id_raw:
                try:
                    parsed_id = uuid.UUID(cat_id_raw)
                    
                    # Verify category exists for this tenant
                    result = await db.execute(
                        select(Category).where(
                            Category.id == parsed_id,
                            Category.tenant_id == tenant_uuid
                        )
                    )
                    if result.scalar_one_or_none():
                        return {
                            "category_id": parsed_id,
                            "confidence": float(data.get("confidence", 0.7)),
                            "reason": data.get("reason", "")
                        }
                    else:
                        # Category not found, use Outros
                        others_id = await get_category_others(tenant_uuid, db)
                        if others_id:
                            return {"category_id": others_id, "confidence": 0.3, "reason": "Categoria não encontrada"}
                except (ValueError, TypeError) as e:
                    print(f"[AI Classifier] Invalid UUID: {e}")
            
            # Default fallback to Outros
            others_id = await get_category_others(tenant_uuid, db)
            if others_id:
                return {"category_id": others_id, "confidence": 0.3, "reason": "Fallback para Outros"}
                
        except Exception as e:
            print(f"[AI Classifier API Error] {e}")
            others_id = await get_category_others(tenant_uuid, db)
            if others_id:
                return {"category_id": others_id, "confidence": 0.1, "reason": f"Erro: {str(e)[:50]}"}
                
    except Exception as e:
        print(f"[AI Classifier Error] {e}")
    
    return None


async def classify_with_fallback(description: str, type_val: str, tenant_id: str, db: AsyncSession) -> uuid.UUID | None:
    """
    Classificação completa: 70% regras + 30% IA com fallback para Outros.
    Retorna o category_id diretamente.
    """
    tenant_uuid = uuid.UUID(tenant_id) if isinstance(tenant_id, str) else tenant_id
    
    # First try rules (70%)
    from app.services.category_rules import classify_by_rules
    rule_result = await classify_by_rules(description, tenant_id, db)
    
    if rule_result:
        return rule_result
    
    # Try AI (30%) if no rule match
    from app.services.ai_service import anthropic_client
    if anthropic_client:
        ai_result = await classify_transaction(description, type_val, tenant_id, db)
        if ai_result and ai_result.get("category_id"):
            return ai_result["category_id"]
    
    # Final fallback to Others
    others_id = await get_category_others(tenant_uuid, db)
    return others_id