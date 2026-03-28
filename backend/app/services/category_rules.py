"""
category_rules.py — Camada 1 da classificação inteligente
Regras locais GRATUITAS (regex), cobertura ~70% dos casos.
"""
import uuid
import re
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.category import Category

# Mapa expandido de palavras-chave → nome de categoria
# Cobre expressões brasileiras coloquiais e formais
KEYWORD_MAP = {
    # Alimentação
    r"(?i)\b(ifood|i[-\s]food|ifd|rappi|uber\s*eats|james|delivery|deliveroo|mcdonalds|mc\s*donalds|burguer|burger|lanche|lanchonete|restaurante|rest\b|pizza|pizzaria|sushi|churrasco|padaria|pao\s*de\s*acucar|carrefour|extra|atacad|assai|dia\b|mercado|supermercado|hortifruti|feira|acougue|rotisseria|sorveteria|sorvete|doceria|confeitaria|cafe\b|cafeteria|rango|marmita|almoço|janta|refeicao|comida|snack|cachorro.quente|hamburger|hamburguer|subway|bob.s|grill|espetinho|churros|tapioca|coxinha|pastel|salgado|fruta|verdura|legume|mercearia|minimercado|atacarejo|sam.s|makro|big|walmart|hipermercado|superpao|covabra|angeloni|condor|boa|verdemar|prezunic)\b": "Alimentação",

    # Transporte
    r"(?i)\b(uber\b|99\b|pop\b|cabify|indriver|in\s*driver|taxi|ônibus|busão|metro\b|metrô|trem\b|barca\b|barco|combustivel|combustível|gasolina|etanol|alcool|diesel|abasteci|posto\b|ipiranga|petrobras|shell|br\s*distrib|ale\b|raizen|ticket\s*log|sem\s*parar|veloe|move\s*mais|estaciamento|estacion|pedágio|pedagio|portagem|carro|veiculo|veículo|moto|onibus|passagem|passagem\b|rodoviaria|aeroporto|brt\b|vlt\b)\b": "Transporte",

    # Moradia / Casa
    r"(?i)\b(aluguel|condomin|condomínio|iptu|agua\b|luz\b|energia|enel|cpfl|light\b|celpe|coelba|cemig|cosern|celesc|eletrobras|copel|sabesp|cagece|saae|caesb|saneago|copasa|casan|embasa|imóvel|imovel|imposto|retrofit|reforma|pintura|encanador|eletricista|dedetiza|faxina|limpeza\s*resid|domestica|diarista|porteiro|zelador|prestação|prestacao|financiam|casa|apto|apartamento|kitnet|flat\b|wifi|internet|net\b|claro\b|vivo\b|tim\b|oi\b|sky\b|directv|streaming\s*tv)\b": "Moradia",

    # Saúde
    r"(?i)\b(farmacia|farmácia|drogaria|droga|ultrafarma|pague\s*menos|raia\b|drogasil|venancio|panvel|nissei|pacheco|remedio|remédio|medicamento|comprimido|vitamina|suplemento|medico|médico|consulta|clinica|clínica|hospital|pronto.socorro|emergencia|emergência|dentista|odonto|ortodont|psicolog|psiquiatr|fisio|nutricion|lab\s*\w+|exame|plano\s*saude|unimed|amil|bradesco\s*saude|hapvida|notredame|sulamerica|gndi|care\s*plus|cirurgia|operacao|internacao|vacina|imuno|ortopedia)\b": "Saúde",

    # Educação
    r"(?i)\b(escola|colégio|colegio|faculdade|universidade|usp|unicamp|ufrj|puc|fgv|insper|unip|unicsul|uninove|cruzeiro\s*sul|anhanguera|estácio|estacio|senac|senai|sebrae|curso|aula|mensalidade\s*escola|mensalidade\s*facul|matrícula|matricula|livro|material\s*escolar|apostila|caderno|mochila|uniforme|estudo|educação|educacao|bolsa\s*aluno|financiamento\s*estudant|fies\b|prouni|enem|cursinho|preparatório|preparatorio|inglês|ingles|espanhol|francês|frances|idioma|udemy|coursera|alura|dio\.me|duolingo|khan)\b": "Educação",

    # Lazer / Entretenimento
    r"(?i)\b(netflix|spotify|amazon\s*prime|hbo|disney\+|disney\s*plus|apple\s*tv|globoplay|paramount|deezer|youtube\s*premium|twitch|steam\b|playstation|xbox|nintendo|jogo\b|game\b|cinema|cinemark|cinesystem|ingresso|teatro|show\b|evento|festival|parque|viagem|hotel|pousada|hostel|airbnb|booking|decolar|maxmilhas|123milhas|clube\b|academia\b|sport\b|esporte|piscina|lazer|diversao|diversão|bar\b|balada|festa|karaoke|boliche|bowling|laser\s*tag|escape\s*room)\b": "Lazer",

    # Vestuário / Moda
    r"(?i)\b(roupa|calçado|calcado|tenis\b|tênis\b|sapato|sandalia|bota|jaqueta|camiseta|blusa|camisa|calça|calca|vestido|shorts|bermuda|cueca|sutiã|sutia|lingerie|meia\b|acessorio|acessório|bolsa\b|carteira|cintos|cinto|lojas\s*renner|renner|riachuelo|cea\b|marisa|zara|hm\b|forever\s*21|forever21|shein|shopee|aliexpress|americanas|magazine|magalu|casas\s*bahia|ponto\s*frio|pontofrio|leroy|tok.stok|etna\b|camicado|kalunga|papelaria)\b": "Vestuário",

    # Assinaturas / Serviços Digitais
    r"(?i)\b(netflix|spotify|deezer|amazon\s*prime|hbo\s*max|disney\b|apple\s*music|google\s*one|microsoft\s*365|office\s*365|dropbox|notion\s*\w*|figma\b|adobe|canva\b|chatgpt|claude\b|openai|antivirus|norton|kaspersky|assinatura|mensalidade\s*(serv|plan|app|digita|soft))\b": "Assinaturas",

    # Cartão / Financeiro / Banco
    r"(?i)\b(fatura|cartão\s*crédito|cartao\s*credito|anuidade|tarifa\s*banco|iof\b|juros|multa|taxa\s*\w+|emprestimo|empréstimo|financiamento|cdb\b|poupanca|poupança|investimento|aplicação|aplicacao|tesouro\s*direto|ação\b|acao\b|fundo\b|dividendo|rendimento|nubank|itau|itaú|bradesco|santander|caixa\s*econ|banco\s*brasil|inter\b|c6\b|next\b|neon\b|pagbank|picpay|mercadopago|pagseguro|ame\s*digital|starkbank|will\s*bank|sofisa|modal|banco)\b": "Banco / Financeiro",

    # Beleza / Higiene Pessoal
    r"(?i)\b(salao|salão|cabeleiro|barber|barbearia|manicure|pedicure|depilacao|depilação|spa\b|massage|massagem|estetica|estética|perfume|cosmetico|cosmético|maquiagem|make\b|shampoo|condicionador|creme\b|hidratante|desodorante|sabonete|pasta\s*dente|fio\s*dental|escova\b|absorvente|fraldas?|gilete|lâmina|barbeador)\b": "Beleza / Higiene",

    # Pets
    r"(?i)\b(petshop|pet\s*shop|racao|ração|veterinario|veterinário|vacina\s*(pet|gato|cao|dog|cat)|remedio\s*(pet|gato|cao|dog|cat)|banho\s*(pet|gato|cao)|tosa\b|canil|gatil|bichinho|pet\b|dog\b|cat\b|gato|cachorro|calopsita|passaro|reptil)\b": "Pets",

    # Impostos / Taxas governamentais
    r"(?i)\b(ipva|iptu|ir\b|irpf|irpj|inss|fgts|pgbl|vgbl|dasdif\b|das\s*\d|mei\b|simples\s*nacional|decore|sped|ecf\b|dirf|cnpj|cpf\b|rg\b|passaporte|renach|crlv|detran|multa\s*tran|cartório|cartorio|notaria|registro\s*(imovel|civil|comercial)|taxa\s*gov|tributo|imposto)\b": "Impostos / Taxas",
}

async def classify_by_rules(description: str, tenant_id: str, db: AsyncSession) -> uuid.UUID | None:
    """
    Camada 1: Classifica usando regex locais (100% gratuito).
    Retorna UUID da categoria se encontrar match, None caso contrário.
    """
    matched_name = None
    for pattern, cat_name in KEYWORD_MAP.items():
        if re.search(pattern, description):
            matched_name = cat_name
            break

    if not matched_name:
        return None

    try:
        tenant_uuid = uuid.UUID(tenant_id) if isinstance(tenant_id, str) else tenant_id
        # Busca por nome exato ou partial match
        result = await db.execute(
            select(Category).where(
                Category.tenant_id == tenant_uuid,
                Category.name.ilike(f"%{matched_name.split('/')[0].strip()}%")
            ).limit(1)
        )
        category = result.scalar_one_or_none()
        if category:
            return category.id
    except Exception as e:
        print(f"[Rules Classifier Error] {e}")

    return None


async def get_or_create_outros(tenant_id: uuid.UUID, db: AsyncSession) -> uuid.UUID | None:
    """
    Retorna/cria a categoria 'Outros' para o tenant.
    Usada como fallback quando nenhuma categoria é identificada.
    """
    from app.models.category import CategoryType
    result = await db.execute(
        select(Category).where(
            Category.tenant_id == tenant_id,
            Category.name.ilike("outros%"),
        ).limit(1)
    )
    cat = result.scalar_one_or_none()
    if cat:
        return cat.id

    # Cria a categoria Outros se não existir
    cat = Category(
        tenant_id=tenant_id,
        name="Outros",
        type=CategoryType.expense,
        icon="📦",
        color="#6B7280",
        keywords=[],
        is_default=True,
    )
    db.add(cat)
    await db.flush()
    return cat.id
