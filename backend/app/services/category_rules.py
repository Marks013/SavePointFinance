import uuid
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.category import Category

# ============================================================
# MAPA DE PALAVRAS-CHAVE BRASILEIRO - CATEGORIZAÇÃO AUTOMÁTICA
# 70% REGRAS / 30% IA - Brasil 100%
# ============================================================

DEFAULT_KEYWORD_MAP = {
    # ==================== RECEITAS ====================
    
    "salario": [
        r"(?i)\b(salario|salário|folha de pagamento|pagamento|vcto|vencimento|contra cheque|holerite|paycheck)\b",
        r"(?i)\b(pagamento mensual|mesada работодателя|salario liquido|salario bruto)\b",
        r"(?i)\b(plr|participacao nos lucros|abono|adicional|hora extra|periculosidade|insalubridade)\b",
    ],
    "freelance": [
        r"(?i)\b(freelance|freelancer|autonomo|autônomo|freela|prestador de servico|prestação de serviço)\b",
        r"(?i)\b(projeto|contrato|pj|pessoa juridica|mei|microempreendedor)\b",
        r"(?i)\b(consultoria|assessoria|parceria|trabalho eventual|trabalho avulso)\b",
    ],
    "investimentos": [
        r"(?i)\b(dividendo|rendimento|juros|acao|ações|bolsa|ibovespa|mini indice)\b",
        r"(?i)\b(fundo|imob|ficfi|debenture|cdb|rdb|lci|lca|tesouro|selic|ipca)\b",
        r"(?i)\b(criptomoeda|bitcoin|ethereum|binance|mercadolibre)\b",
        r"(?i)\b(rendimento|proveito|luz criativa|juros capitalizados)\b",
        r"(?i)\b(poupanca|rendap|aplicacao|aplicação)\b",
    ],
    "aposentadoria": [
        r"(?i)\b(aposentadoria|inss|beneficio|benefício|previdencia|previdência|pencao|pensão)\b",
        r"(?i)\b(oi|japi|idade|morte|invalidez|auxilio)\b",
    ],
    "aluguel_recebido": [
        r"(?i)\b(aluguel recebido|aluguel|rent|arrendamento|inquilino|locacao|imoveis)\b",
        r"(?i)\b(imovel|propriedade|flat|apartamento|loja|galpao)\b",
    ],
    "bonus": [
        r"(?i)\b(bonus|premio|prêmio|comissao|comissão|gratificacao|gratificação)\b",
        r"(?i)\b(13o|decimo terceiro|ferias|licenca|prêmio produtividade)\b",
    ],
    "emprestimo_recebido": [
        r"(?i)\b(emprestimo|empréstimo|financiamento|credito|crédito)\b",
        r"(?i)\b(baixa juros|liberação|desembolso|aval)\b",
    ],
    "venda": [
        r"(?i)\b(venda|venda de|vendido|negocio|negócio|comercio)\b",
        r"(?i)\b(mercadoria|produto|servico|peca|peça|estoque)\b",
    ],
    "transferencia_recebida": [
        r"(?i)\b(transferencia|transferência|recebimento|pix|ted|doc|boleto)\b",
        r"(?i)\b(recebimento|credito|crédito|entrada|deposito|depósito)\b",
    ],
    "outras_receitas": [
        r"(?i)\b(outros|misc|outras|diversos|various)\b",
    ],

    # ==================== DESPESAS ====================

    "alimentacao": [
        r"(?i)\b(ifood|ifood|i food|mcdonalds|mc donalds|burger king|bk|kfc|habibs|subway)\b",
        r"(?i)\b(uber eats|uber-eats|rappi|delivery|delivery comida|just eat)\b",
        r"(?i)\b(mercado|supermercado|carrefour|extra|pao de acucar|padaria|panificadora)\b",
        r"(?i)\b(panmig|pão agudo|hering|outback|texas|giusti|marmita)\b",
        r"(?i)\b(lanche|hamburguer|pizza|pizzaria|lasanha|massas|macarrao|macarrão)\b",
        r"(?i)\b(restaurante|restaur|lanhouse|fast food|fastfood|lanchonete)\b",
        r"(?i)\b(cafe|café|cafeteria|starbucks|doceria|confeitaria|bolore)\b",
        r"(?i)\b(sorvete|gelato|açaí|acai|acai|açaí do Brasil|bar gelado)\b",
        r"(?i)\b(frutas|verduras|legumes|hortifruti|ceasa|feira)\b",
        r"(?i)\b(carnes|acougue|açougue|frango|peixe| bovina| suína)\b",
        r"(?i)\b(brecho|comida|almoço|jantar|cafe da manha|café da manhã)\b",
    ],
    "moradia": [
        r"(?i)\b(aluguel|aluguel|condominio|condomínio|luz|agua|água|gás|gas)\b",
        r"(?i)\b(iptu|taxa condominio|encargo|mensalidade|imóvel|imóvel)\b",
        r"(?i)\b(internet|net|claro tv|sky|oi tv|tim tv|fibra|wi-fi|wifi)\b",
        r"(?i)\b(telefone|celular|movel|móvel|claro|claro| vivo| tim|oi)\b",
        r"(?i)\b(luz\.br|contagem|cemig|copel|eletrobras|energisa)\b",
        r"(?i)\b(sabesp|cosan|COREMU|água tratada|esgoto)\b",
        r"(?i)\b(gas natural|gnv|glp|botija|botijão)\b",
        r"(?i)\b(manutencao|manutenção|reforma|pintura|marceneiro)\b",
        r"(?i)\b(imovel|propriedade|imposto|transacao|transação)\b",
        r"(?i)\b(seguro residenc|seguro|imóvel|eletrodomestico|eletrodomésticos)\b",
    ],
    "transporte": [
        r"(?i)\b(uber|uber app|99|99 app|pop|cabify|99pop)\b",
        r"(?i)\b(posto|ipiranga|shell|br|petrobras|combustivel|combustível)\b",
        r"(?i)\b(etanol|gasolina|diesel|alcool|álcool)\b",
        r"(?i)\b(estacionamento|manobrista|garagem|zonasul|zona norte)\b",
        r"(?i)\b(onibus|ônibus|metro|metrô|trem|van|transporte público)\b",
        r"(?i)\b(passagem|aviao|avião|gol|latam|azul|passagem aerea)\b",
        r"(?i)\b(uber机票|voo|voo|reserva|booking|hotel)\b",
        r"(?i)\b(taxi|app taxi|99 taxi|uber taxi)\b",
        r"(?i)\b(carregamento|pedagio|pedágio|portagem|freeway|rioservice)\b",
        r"(?i)\b(uber uber|uberx|uber comfort|uber black)\b",
        r"(?i)\b(seguro veicular|IPVA|licenciamento|detran|multa|infração)\b",
        r"(?i)\b(mecanica|mecânica|piezas|peças|oleo|óleo|lataria|pintura)\b",
    ],
    "saude": [
        r"(?i)\b(farmacia|drogaria|rede|farm|panvel|raia|droga raia)\b",
        r"(?i)\b(pague menos|ultrafarma|drogabel|venancio|cristalia)\b",
        r"(?i)\b(remedio|remédio|medicamento|prescrito|farmaco|fármaco)\b",
        r"(?i)\b(medico|médico|consulta|clinica|clínica|ambulatorio)\b",
        r"(?i)\b(hospital|hospitalar|urgencia|emergência|pronto socorro)\b",
        r"(?i)\b(plano de saude|plano de saúde|unimed|bradesco saude|allianz)\b",
        r"(?i)\b(odontologico|dental|dentista|ortodontia|implante)\b",
        r"(?i)\b(exame|exames|laboratorio|laboratório|analise|análise)\b",
        r"(?i)\b(academia|fit|smart fit|world gym|academia|crossfit)\b",
        r"(?i)\b(fisioterapia|psicologo|terapeuta|nutricionista)\b",
        r"(?i)\b(vacina|imunizacao|imunização|influenza|coronavac)\b",
    ],
    "lazer": [
        r"(?i)\b(cinema|cinemark|uci|space|playarte)\b",
        r"(?i)\b(viagem|ferias|férias|vist|resort|hotel|pousada)\b",
        r"(?i)\b(show|show|banda|rock|pop|música|teatro)\b",
        r"(?i)\b(jogo|futebol|brasileirão|campeonato|brasileirão)\b",
        r"(?i)\b(streaming|netflix|spotify|prime|disney|hbo)\b",
        r"(?i)\b(netflix|spotify|amazon|disneyplus|globoplay|paramount)\b",
        r"(?i)\b(youtube|twitch|twitch|canal|assinatura)\b",
        r"(?i)\b(jogo digital|steam|playstation|xbox|nintendo|epic)\b",
        r"(?i)\b(park|tematico|parque|rodizio|esporte|pesca|pesqueiro)\b",
        r"(?i)\b(bar|boteco|balada|balada|pub|happy hour)\b",
        r"(?i)\b(boteco|boteco|churrascaria|rodizio|buffet)\b",
    ],
    "educacao": [
        r"(?i)\b(faculdade|universidade|graduacao|graduação|mestrado|doutorado)\b",
        r"(?i)\b(escola|colegio|colégio|ensino|fundamental|medio|médio)\b",
        r"(?i)\b(curso|treinamento|workshop|seminario|seminário)\b",
        r"(?i)\b(udemy|coursera|linkedin|skillshare|edx)\b",
        r"(?i)\b(livro|livraria|amazon|americana|saraiva)\b",
        r"(?i)\b(material|escolar|caderno|caneta|mochila)\b",
        r"(?i)\b(informatica|programacao|programação|code|dev)\b",
        r"(?i)\b(idioma|ingles|espanhol|alemao|mandarim|duolingo)\b",
        r"(?i)\b(cartilha apostila|biblia|dicionario|enciclopedia)\b",
        r"(?i)\b(instituto|faculdade|universidade|etec|senai|senac)\b",
    ],
    "assinaturas": [
        r"(?i)\b(netflix|spotify|amazon prime|prime video)\b",
        r"(?i)\b(disney|hbo|max|paramount|apple tv|globoplay)\b",
        r"(?i)\b(youtube premium|linkedin premium|notion|dropbox)\b",
        r"(?i)\b(adobe|office|microsoft|google one|gmail)\b",
        r"(?i)\b(cloud|aws|azure|heroku|vercel|hostgator)\b",
        r"(?i)\b(assinan|mensalidade|recorrente|assinatura)\b",
        r"(?i)\b(canal|cabo|tv|televisao|televisão)\b",
        r"(?i)\b(revistas|oglobo|folha|valor|exame)\b",
    ],
    "cartao_credito": [
        r"(?i)\b(nubank|nu|caixacartão|itau|inter|bradesco|santander)\b",
        r"(?i)\b(fatura|boleto|cartao|cartão|parcelamento)\b",
        r"(?i)\b(minha fatura|resumo|extrato|trace|scoring)\b",
        r"(?i)\b(bandeir|mastercard|visa|elo|amex|hipercard)\b",
        r"(?i)\b(credito|crédito|parcela|juros rotativo)\b",
    ],
    "dizimo_ofertas": [
        r"(?i)\b(igreja|igreja evangelica|igreja catholica)\b",
        r"(?i)\b(oferta|dizimo|dízimo|doacao|doação|caridade)\b",
        r"(?i)\b(dezena|primicia|oblação|contribuição)\b",
        r"(?i)\b(mission|missionário|missao|missão|evangelho)\b",
        r"(?i)\b(culto|missa|celebração|oração|grupo de oração)\b",
    ],
    "vestuario": [
        r"(?i)\b(roupa|vestido|blusa|calça|saia|bermuda)\b",
        r"(?i)\b(calcado|tenis|tênis|sandalia|sandália|botina|bota)\b",
        r"(?i)\b(moda|loja|magazine|luiza|magazine luiza)\b",
        r"(?i)\b(magalu|amazon|shopee|aliexpress|mercadolivre)\b",
        r"(?i)\b(roupa intima|íntima|calcinha|cueca|sutiã)\b",
        r"(?i)\b(acessorios|acessórios|bolsa|carteira|relógio|joia)\b",
        r"(?i)\b(costure|alfaiat|modista|conserto|ajuste)\b",
    ],
    "cosméticos": [
        r"(?i)\b(cosmetico|cosmético|maquiagem|maquiagem|batom| lipstick)\b",
        r"(?i)\b(perfume|colônia|desodorante|antitranspirante)\b",
        r"(?i)\b(creme|skincare|hidratante|protetor solar|protetor)\b",
        r"(?i)\b(shampoo| condicionador|tratamento|cabelo|penteado)\b",
        r"(?i)\b(barbear|barbearia|barbeiro|corte|tesoura)\b",
        r"(?i)\b(manicure|pedicure|esmalte|unhas|spa)\b",
        r"(?i)\b(dermato|estetic|espaco|belez|salão)\b",
    ],
    "pets": [
        r"(?i)\b(pet|cao|cão|gato|passaro|pássaro|peixe|hamster)\b",
        r"(?i)\b(racao|ração|raça|pet shop|petz|cobasi)\b",
        r"(?i)\b(veterinario|veterinário|consulta|vacina|castração)\b",
        r"(?i)\b(banho|tosa|pet shop|creche|hotel pet)\b",
        r"(?i)\b(brinquedo|coleira|comedouro|potinho)\b",
        r"(?i)\b(passeio|pet walker|dog walker|adiestrador)\b",
    ],
    "presentes": [
        r"(?i)\b(presente|aniversario|aniversário|natal|dia dos namorados)\b",
        r"(?i)\b(mãe|pai|filho|filha|avó|avo|amigo|amiga)\b",
        r"(?i)\b(flor|floricultura|buque|orquídea|rosa)\b",
        r"(?i)\b(presente|surpresa|caixa|embalagem)\b",
    ],
    "utilidades": [
        r"(?i)\b(limpeza|detergente|sabao|sabão|alvejante)\b",
        r"(?i)\b(papel|higienico|higiênico|papelão|embalagem)\b",
        r"(?i)\b(utensilio|utensílio|panela|prato|copo|talher)\b",
        r"(?i)\b(ferramenta|chave|fuique|parafuso|prego)\b",
        r"(?i)\b(produto|domestico|doméstico|generic)\b",
    ],
    "burocracia": [
        r"(?i)\b(cartorio|registro|rg|cpf|cnh|passaporte)\b",
        r"(?i)\b(taxa|tarifa|emolumento|cartão|licenciamento)\b",
        r"(?i)\b(imposto|irpf|icms|iss|pis|cofins)\b",
        r"(?i)\b(junta|juntas|commercial|cnpj|mei)\b",
        r"(?i)\b(advogado|advogada|juridico|jurídico|consulta)\b",
    ],
    "servicos": [
        r"(?i)\b(encrypt|servico|serviço|prestacao|prestação)\b",
        r"(?i)\b(pintor|pedreiro|eletricista|encanador)\b",
        r"(?i)\b(manutencao|manutenção|reparo|conserto)\b",
        r"(?i)\b(seguro|assist|residencial|veicular)\b",
        r"(?i)\b(guincho|reboque|assistência|24h)\b",
    ],
    "emprestimo_pago": [
        r"(?i)\b(emprestimo|empréstimo|financiamento|credito|crédito)\b",
        r"(?i)\b(parcela|parcelas|quitação|amortização)\b",
        r"(?i)\b(juros|multa|encargo|spread)\b",
    ],
    "outras_despesas": [
        r"(?i)\b(outros|diversos|misc|various)\b",
    ],
}


# Normalize text: lowercase, remove accents for matching
def normalize_text(text: str) -> str:
    """Remove accents and convert to lowercase."""
    import unicodedata
    text = text.lower()
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    return text


# Build keyword map dynamically from all categories with keywords in DB
async def get_keyword_map(tenant_id: uuid.UUID, db: AsyncSession) -> dict:
    """Build keyword map from category keywords stored in DB."""
    result = await db.execute(select(Category).where(Category.tenant_id == tenant_id))
    categories = result.scalars().all()
    
    keyword_map = {}
    
    # First, add user custom keywords from database
    for cat in categories:
        if cat.keywords and isinstance(cat.keywords, list):
            for kw in cat.keywords:
                if kw:
                    # Create patterns with and without accent
                    normalized_kw = normalize_text(kw)
                    
                    # Pattern with original keyword
                    pattern_orig = r"(?i)\b(" + re.escape(kw) + r")\b"
                    keyword_map[pattern_orig] = cat.name
                    
                    # Pattern with normalized keyword (no accents)
                    if normalized_kw != kw.lower():
                        pattern_norm = r"(?i)\b(" + re.escape(normalized_kw) + r")\b"
                        keyword_map[pattern_norm] = cat.name
    
    # Merge with default Brazilian rules
    for cat_name, patterns in DEFAULT_KEYWORD_MAP.items():
        if cat_name not in keyword_map:
            # Check if category exists in DB
            result = await db.execute(
                select(Category).where(
                    Category.tenant_id == tenant_id,
                    Category.name.ilike(f"%{cat_name.replace('_', ' ')}%")
                ).limit(1)
            )
            cat = result.scalar_one_or_none()
            if cat:
                for pattern in patterns:
                    if pattern not in keyword_map:
                        keyword_map[pattern] = cat.name
    
    return keyword_map


async def classify_by_rules(description: str, tenant_id: str, db: AsyncSession) -> uuid.UUID | None:
    """Classify transaction using keyword matching (70% of cases)."""
    if not description:
        return None
    
    try:
        tenant_uuid = uuid.UUID(tenant_id) if isinstance(tenant_id, str) else tenant_id
    except (ValueError, TypeError):
        return None
    
    # Get keyword map from categories and defaults
    keyword_map = await get_keyword_map(tenant_uuid, db)
    
    matched_name = None
    
    # Try exact match first (case insensitive)
    for pattern, cat_name in keyword_map.items():
        if re.search(pattern, description):
            matched_name = cat_name
            break
    
    # If no match, try normalized version (without accents)
    if not matched_name:
        normalized_desc = normalize_text(description)
        
        for pattern, cat_name in keyword_map.items():
            # Normalize pattern too for comparison
            normalized_pattern = normalize_text(pattern.replace("(?i)\\b(", "").replace(")\\b", ""))
            if normalized_pattern in normalized_desc:
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


async def get_category_others(tenant_id: uuid.UUID, db: AsyncSession) -> uuid.UUID | None:
    """Get or create 'Outros' category as fallback."""
    try:
        result = await db.execute(
            select(Category).where(
                Category.tenant_id == tenant_id,
                Category.name.ilike("%outros%")
            ).limit(1)
        )
        category = result.scalar_one_or_none()
        
        if not category:
            # Create 'Outros' category if not exists
            category = Category(
                tenant_id=tenant_id,
                name="Outros",
                icon="tag",
                color="#9CA3AF",
                type="expense",
                keywords=["outros", "diversos", "misc"],
                is_default=False
            )
            db.add(category)
            await db.commit()
            await db.refresh(category)
        
        return category.id
    except Exception as e:
        print(f"[Get Others Category Error] {e}")
        return None