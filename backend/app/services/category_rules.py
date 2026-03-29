"""
category_rules.py — Camada 1 da classificação inteligente
Regras locais GRATUITAS (regex), cobertura ~70% dos casos.
Brasil 100% - Suporta acentos e caracteres especiais
"""
import uuid
import re
import unicodedata
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.category import Category


def normalize_text(text: str) -> str:
    """
    Normaliza texto para busca:
    - Remove acentos
    - Converte para minúsculas
    - Remove caracteres especiais duplicados
    """
    text = text.lower().strip()
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    text = re.sub(r'[^\w\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


# Mapa expandido de palavras-chave → nome de categoria
# Cobre expressões brasileiras coloquiais e formais
# Suporta acentos e não-acentos (a-z)
KEYWORD_MAP = {
    # ===== ALIMENTAÇÃO =====
    r"(?i)(?:alimentacao|alimentaçao|comida|comer|refeicao|refeiçao)": "Alimentação",
    r"(?i)(?:ifood|i[-\s]food|ifd|rappi|uber\s*eats|uber\s*eat|james|delivery|deliveroo|loggi|quando\s*foi)": "Alimentação",
    r"(?i)(?:mcdonalds|mc\s*donalds|mc\s*donals|bk|burger\s*king|hamburger|hamburguer|lanche|lanche|lanchonete|hot\s*dog|cachorro\s*quente)": "Alimentação",
    r"(?i)(?:subway|bob\s*\.?|grill|spoleto| Habibs|habibs| Habib|habib|madero|madero\s*burger|kfc|pizza| pizzaria|pizzaria|calzone|calzone|domino|domino\s*pizza)": "Alimentação",
    r"(?i)(?:sushi|yaksoba|yak|hana\s*sushi|matsuri|tenko| temaki|shimeji|miss|miss\s*gelada|wasabi|habib)": "Alimentação",
    r"(?i)(?:churrasco|churrascaria|carbone|outback|porco|na\s*brasa|assado|grelh|rodizio| self[-\s]service)": "Alimentação",
    r"(?i)(?:padaria|pao\s*de\s*acucar|pão\s*de\s*açúcar|pao\s*de\s*acucar|padoca|confeitaria|doceria|sorveteria|sorvete|gelateria|ice\s*cream)": "Alimentação",
    r"(?i)(?:pao|paozinho|pão|broa|croissant|coffe|cafe|café|cafeteria|starbucks|cafe\s*do\s*ponto|grão\s*beto|gol|caffè|milk\s*shake|suco|vitamina|acai|açaí|açai|acai|bowl|acai\s*bowl)": "Alimentação",
    r"(?i)(?:carrefour|carrefour\s*express|extra|super\s*extra|atacad|atacadão|assai|assai\s*atacadista|savegnago|makro|sam\s*club|sam\s*s|club|maxx|mundial|环球)": "Alimentação",
    r"(?i)(?:dia\s*.|supermercado|supermerc|hortifruti|feira\s*.,feira|verdura|legume|fruta|hortaliça|hortaliça|mercadao|mini\s*mercado|mini\s*merc|mercearia|minimercado)": "Alimentação",
    r"(?i)(?:acougue|acougueiro|carniceria|carne|frango|peixe|pescaria|marisco|camarao|lagosta|sardinha|bacalhau|carangueijo)": "Alimentação",
    r"(?i)(?:restaurant|eats|self\s*service|buffet|prato\s*feito|pf|kg|por\s*quilo|comer\s*rua|food\s*park|gourmet|chef|cozinha|delivery\s*food)": "Alimentação",
    r"(?i)(?:marmita|quentinha|delivery\s*restaurant|embalagem|take\s*away|via\s*blu|ifood\s*plus|ifood\s*club|ragazzo)": "Alimentação",
    r"(?i)(?:lanche|batata\s*frita|onion|rings|nuggets|frango\s*passaporte|规)": "Alimentação",
    r"(?i)(?:coxinha|pastel|salgado|tapioca|crepe|waffle|panqueca| Empada|empada|mini\s*sal|sanduiche|torrada|cafe\s*leite|leite\s*quente)": "Alimentação",
    r"(?i)(?:churros|beijing|churros\s*california|candys|doces|doce|brigadeiro|brig|ovo\s*de\s*pascoa|pascoa|panetone|ferrero|confete| MM|M&M|skol| Antarctica|brahma|itaipava|budweiser|bud|corona|heineken)": "Alimentação",

    # ===== TRANSPORTE =====
    r"(?i)(?:uber|uber\s*\.?|99|99\s*pop|99\s*.\?|pop\s*99|cabify|indriver|in\s*driver|taxi|uber\s*eas|uber\s*eat|99\s*táxi)": "Transporte",
    r"(?i)(?:ônibus|onibus|busão|micros|bus|rodoviari|passagem|viacao|viação|util|express|executivo|leito|convent|plain|avianca|gol|latam|azul)": "Transporte",
    r"(?i)(?:metro|metrô|metrô\s*sp|metrô\s*rio|trem| CPTM|cmtm|barca|barco|ferry|lancha)": "Transporte",
    r"(?i)(?:combustivel|combustível|gasolina|etanol|álcool|diesel|gnv|biometano|abastec|posto|ipiranga|petrobras|shell|br|raizen|ale|delta|distribuidora)": "Transporte",
    r"(?i)(?:ticket\s*log|sem\s*parar|veloe|move\s*mais|conectcar|auto\s*sinais|pedagio|pedágio|portagem|free\s*flow)": "Transporte",
    r"(?i)(?:estacionamento|estaci|garagem|manobrista|zona\s*azul|rotativo|parquímetro)": "Transporte",
    r"(?i)(?:carro|veiculo|veículo|automóvel|auto|montadora|concession|revenda|toyota|volkswagen|vw|ford|chevrolet|gm|fiat|hyundai|honda|nissan|bmw|mercedes|audi|porsche)": "Transporte",
    r"(?i)(?:moto|motocicleta|motinha|motoneta|scooter|yamaha|honda\s*biz|cg|titan|fan|pop|next)": "Transporte",
    r"(?i)(?:uber\s*transit|99\s*transit|app\s*transporte|carona|blablacar|carone|van|van\s*escolar|kombi)": "Transporte",
    r"(?i)(?:aeroporto|aviao|avião|voo|passagem\s*aerea|passagem\s*aérea|embarque|desembarque|check\s*in|bagagem|voar|fly)": "Transporte",
    r"(?i)(?:brt|vlt|trem\s*urbano|metrô\s*lotação|ônibus\s*articulado|biarticulado|alimentadora|integração|integração)": "Transporte",
    r"(?i)(?:locadora|aluguel\s*carro|locação|car\s*rent|rent\s*car|enterprise|hertz|localiza|unidas|moove|volts)": "Transporte",
    r"(?:(?i)seguro\s*carro|(?i)seguro\s*veiculo|(?i)ipva|(?i)licenciamento|(?i)dpvat|(?i)crlv|(?i)crv|(?i)multa\s*transito)": "Transporte",
    r"(?i)(?:uber\s*eas|uber\s*eat|uber\s*eats|rapido|zig|loggi|azul)": "Transporte",

    # ===== MORADIA / CASA =====
    r"(?i)(?:aluguel|aluguer|locação|inquilino|proprietário|fiador)": "Moradia",
    r"(?i)(?:condominio|condomínio|cond|rateio\s*cond)": "Moradia",
    r"(?i)(?:iptu|imposto\s*predial|taxa\s*lixo|iluminação\s*publica|iluminação\s*pública)": "Moradia",
    r"(?i)(?:agua|água|saneamento|caesb|copasa|casan|embasa|sabesp|cagece|saae|agua\s*esgoto)": "Moradia",
    r"(?i)(?:luz|energia|eletricidade|enel|cpfl|light|celpe|coelba|cemig|cosern|celesc|copel|eletrobras|celesc|equatorial)": "Moradia",
    r"(?i)(?:gas\s*natural|gn|gnb|gás|comgás|ulgas|naturgy|copel\s*gas)": "Moradia",
    r"(?i)(?:telefone\s*fixo|telefonia|fixo|oi|tim\s*fixo|vivo\s*fixo|claro\s*fixo)": "Moradia",
    r"(?i)(?:internet|net|wi[- ]?fi|wi fi|banda\s*larga|fibra|velocidade)": "Moradia",
    r"(?i)(?:claro|claro\s*.\?|vivo|tim|oi|oi\s*.\?|sky|claro\s*tv|net\s*flix|vídeo)": "Moradia",
    r"(?i)(?:streaming|tv\s*a\s*cabo|tv\s*assinatura|decodificador|modem|roteador)": "Moradia",
    r"(?i)(?:imovel|imóvel|imposto\s*imovel|apartamento|casa|kitnet|flat|loft|studio|sobrado)": "Moradia",
    r"(?i)(?:financiamento\s*imovel|financiamento\s*casa|prestação\s*imovel|parcela\s*casa|caixa\s*economica)": "Moradia",
    r"(?i)(?:reforma|reforma\s*casa|construção|obras|pintura|azulejo|argamassa|cimento|areia|tijolo|bloco)": "Moradia",
    r"(?i)(?:encanador|eletricista|pedreiro|mestre\s*obra|arquiteto|engenheiro|decorador)": "Moradia",
    r"(?i)(?:dedetização|dedetiz|dedet|desinsetização|desratização|control\s*peste|ambient\s*control)": "Moradia",
    r"(?i)(?:faxina|limpeza\s*resid|domestica|diarista|empregada|copeira|porteiro|zelador|garim)": "Moradia",
    r"(?i)(?:mobília|móvel|moveis|móveis|sofá|cama|colchão|guarda\s*roupa|estante|mesa|cadeira)": "Moradia",
    r"(?i)(?:eletrodomestico|eletrodomésticos|geladeira|freezer|fogão|microondas|maquina\s*lavar|secadora|lava\s*louça)": "Moradia",
    r"(?i)(?:tv|smart\s*tv|monitor|notebook|computador|pc|monitoramento|câmera\s*segurança)": "Moradia",

    # ===== SAÚDE =====
    r"(?i)(?:farmacia|farmácia|drogaria|droga\s*.\?|ultrafarma|pague\s*menos|raia|drogasil|venancio|panvel|nissei|pacheco|maxxa)": "Saúde",
    r"(?i)(?:remedio|remédio|medicamento|remédios|fármaco|farmaco|comprimido|cápsula|tablete|xarope|gotas|pomada|gel\s*pomada|gel\s* tópico)": "Saúde",
    r"(?i)(?:vitamina|suplemento|suplementação|polivitamin|whey|creatina|hiper|growth|integralmedica|golden|terraw)": "Saúde",
    r"(?i)(?:medico|médico|doctor|dr\.|dra\.|consulta|médica|atendimento|ambulatório|posto\s*saude)": "Saúde",
    r"(?i)(?:clinica|clínica|consultório|hospital|psicolog|psiquiatr|neurolog|dermatolog|oftalmolog|ortoped|cardiolog|urolog|ginecolog|pediatr)": "Saúde",
    r"(?i)(?:dentista|odontolog|odonto|ortodont|implante\s*dental|lente\s*contato|clareamento|rótula)": "Saúde",
    r"(?i)(?:fisioterapia|fisio|psicolog|psicólogo|terapia|coach|psicoterapia|hipnose)": "Saúde",
    r"(?i)(?:nutricion|nutri|consulta\s*nutri|plano\s*alimentar|dieta|emagrecimento|perda\s*peso)": "Saúde",
    r"(?i)(?:exame|laboratório|lab|análise\s*clínica|biopsia|ultrasson|raio\s*x|tomografia|ressonância|mamografia)": "Saúde",
    r"(?i)(?:plano\s*saude|plano\s*de\s*saúde|unimed|amil|bradesco\s*saude|hapvida|notredame|sulamerica|gndi|care\s*plus|prevent\s*senior|saude\s*\.?)": "Saúde",
    r"(?i)(?:vacina|vacinação|imunização|gripe|corona|virus|covid|teste\s*covid|pcr|antigeno)": "Saúde",
    r"(?i)(?:hospital|pronto\s*socorro|ps\s*.,emergencia|urgência|uti|internação|cirurgia|parto|cesárea)": "Saúde",
    r"(?i)(?:convênio|convenio|carência|cobertura|reembolso|autorização\s*medic)": "Saúde",
    r"(?i)(?:plano\s*odontolog|odonto\s*plus|odontoprev| Dental\s*plan|sinopse)": "Saúde",
    r"(?i)(?:sport\s*life|smart\s*fit|academia|academia\s*.\?|crossfit|yoga|pilates|spinning|musculação|treino)": "Saúde",
    r"(?i)(?:espelho|espelho\s*.\?|visa|mastercard|hipercard|elo|credsystem|stone|cielo|getnet)": "Saúde",

    # ===== EDUCAÇÃO =====
    r"(?i)(?:escola|colegio|colégio|ensino\s*fundamental|ensino\s*médio|ensino\s*médio|fundamental|médio)": "Educação",
    r"(?i)(?:faculdade|universidade|graduação|pós[-\s]*graduação|mestrado|doutorado|phd)": "Educação",
    r"(?i)(?:usp|unicamp|ufrj|ufsp|puc|fgv|insper|unip|unicsul|uninove|unicsul|anhanguera|estacio|estácio|unicamp)": "Educação",
    r"(?i)(?:senac|senai|sebrae|etec|faetec|celes|escola\s*tecnica)": "Educação",
    r"(?i)(?:curso|aula|aulas|treinamento|workshop|seminário|palestra|congresso)": "Educação",
    r"(?i)(?:mensalidade\s*escola|mensalidade\s*facul|mensalidade\s*curso|matricula|matrícula|taxa\s*inscrição)": "Educação",
    r"(?i)(?:material\s*escolar|livro|apostila|caderno|mochila|uniforme|estojo|caneta|lápis)": "Educação",
    r"(?i)(?:bolsa\s*estudo|bolsa\s*aluno|bolsa\s*mérito|financiamento\s*estudantil|fies|prouni|prouni)": "Educação",
    r"(?i)(?:enem|vestibular|concurso\s*publico|concurso\s*público|passaporte\s*estudantil)": "Educação",
    r"(?i)(?:cursinho|pré[-\s]*vestibular|preparatório|preparatorio|intensivo)": "Educação",
    r"(?i)(?:inglês|ingles|espanhol|francês|frances|alemão|alemao|italiano|português|portugues|chinês|chinês|japonês|japones|coreano|russo|idioma)": "Educação",
    r"(?i)(?:duolingo|busuu|italki|udemy|coursera|alura|dio\.me|khan\s*academy|linkedin\s*learning)": "Educação",
    r"(?i)(?:papai\s*noel|presentinho|nécessaire|mochileiro)": "Educação",
    r"(?i)(?:escola\s*particular|escola\s*privada|escola\s*publica|creche|berçário|pré\s*escola)": "Educação",
    r"(?i)(?:livraria|amazon\s*livros|estante\s*virtual|companhia\s*das\s*letras|record|cultura)": "Educação",

    # ===== LAZER / ENTRETENIMENTO =====
    r"(?i)(?:netflix|globoplay|paramount|deezer|spotify|amazon\s*prime|prime\s*video|hbo\s*max|hbo|disney|disney\s*plus|apple\s*tv|net|now)": "Lazer",
    r"(?i)(?:youtube|premium|twitch|steam|playstation|psn|ps\s*plus|xbox\s*live|game\s*pass|nintendo\s*online|ns\s*online)": "Lazer",
    r"(?i)(?:cinema|cinemark|cinesystem|arcoplex|playarte|box\s*cinema|ingresso\s*cinema)": "Lazer",
    r"(?i)(?:teatro|musical|show|show\s*.\?|banda|artista|turnê|turne|concerto|festival)": "Lazer",
    r"(?i)(?:viagem|ferias|feriado|passeio|resort|pousada|hotel|hostel|resort|resort\s*.)": "Lazer",
    r"(?i)(?:airbnb|booking|decolar|maxmilhas|123milhas|viagens|passagem\s*aerea|passagem\s*aérea)": "Lazer",
    r"(?i)(?:parque\s*temático|parque\s*aquático|water\s*park|fun\s*city|hopi\s*hari|playland|diver\s*land)": "Lazer",
    r"(?i)(?:zoo|zoologico|zoológico|picapau|club\s*embu|club\s*curupira)": "Lazer",
    r"(?i)(?:bar|balada|festa|festão|balada|karaok|karaokê|pub|brewery|cervejaria)": "Lazer",
    r"(?i)(?:billiard|sinuca|boliche|bowling|laser\s*tag|escape\s*room|aventureiro)": "Lazer",
    r"(?i)(?:academia|academia\s*.\?|smart\s*fit|smartfit|crossfit|yoga|pilates|spinning|musculação|treino|fit\s*pass|gyro)": "Lazer",
    r"(?i)(?:jogo\s*football|jogo\s*futebol|match|brasileirão|brasileirão|campeonato|libertadores|champions\s*league)": "Lazer",
    r"(?i)(?:loteria|mega\s*sena|lotofacil|quina|dupla\s*sena|timemania|loteria\s*federal|bilhete)": "Lazer",
    r"(?i)(?:cassino|aposta|betting|bonus\s*casino|roleta|blackjack|poker|WSOP)": "Lazer",
    r"(?i)(?:game|games|videogame|play|ps4|ps5|xbox\s*series|switch|nintendo\s*switch|pc\s*game)": "Lazer",
    r"(?i)(?:blizzard|battle\.net|origin|ea\s*play|ubisoft|rockstar|steep)": "Lazer",
    r"(?i)(?:clube\s*social|clube\s*recanto|clube\s*dos\s*vip|clube)": "Lazer",
    r"(?i)(?:salao|salão|ping\s*pong|sinuca|domino|baralho|cartas|tarot|astrologia)": "Lazer",

    # ===== VESTUÁRIO / MODA =====
    r"(?i)(?:roupa|vestuário|vestuario|moda|moda\s*.\?|tendência|look|look\s*.\?|estilo| fashion)": "Vestuário",
    r"(?i)(?:calçado|calcado|sapato|tenis|tênis|sandalia|bota|coturno|chute|chinelo|rasteira|mocassim|oxford)": "Vestuário",
    r"(?i)(?:camiseta|blusa|camisa|calça|calca|bermuda|shorts|saia|vestido|macacão|macacao|conjunto)": "Vestuário",
    r"(?i)(?:jaqueta|blazer|casaco|cardigan|suéter|sueter|moletom|capuz|bone|chapéu|lenço|luva)": "Vestuário",
    r"(?i)(?:cueca|calcinha|sutiã|sutia|lingerie|pijama|bermuda\s*box|meia|meias|calc\s*social)": "Vestuário",
    r"(?i)(?:bolsa|bolsas|mochila|carteira|cinto|óculos|oculos|relogio|relógio|joia|brinco|colar|pulseira)": "Vestuário",
    r"(?i)(?:lojas\s*renner|renner|riachuelo|cea|marisa|zara|hm|forever\s*21|shein|shopee|aliexpress)": "Vestuário",
    r"(?i)(?:americanas|magazine|magazine\s*luiza|magalu|casas\s*bahia|ponto\s*frio|pontofrio|extra\.com|mericanas)": "Vestuário",
    r"(?i)(?:leroy|leroy\s*merlin|tok\.stok|etna|móveis|moveis|decoração|decor)": "Vestuário",
    r"(?i)(?:camicado|calçados|nik|adidas|puma|asics|under\s*armour|topper|olympikus)": "Vestuário",
    r"(?i)(?:kalunga|papelaria|papel|caneta|estojo|lápis|giz|caderno|mochila)": "Vestuário",
    r"(?i)(?:brecho|brechó|usado|second\s*hand|vintage|reutiliz)": "Vestuário",
    r"(?i)(?:cosmetico|cosmético|perfume|desodorante|shampoo|condicionador|creme|hidratante)": "Vestuário",

    # ===== ASSINATURAS / SERVIÇOS DIGITAIS =====
    r"(?i)(?:assinatura|mensalidade\s*(?:serv|plan|app|digita|soft|stream|musica|video))": "Assinaturas",
    r"(?i)(?:netflix|spotify|deezer|amazon\s*prime|prime\s*video|hbo|disney|apple\s*music|twitch|paramount)": "Assinaturas",
    r"(?i)(?:microsoft\s*365|office\s*365|office|excel\s*365|outlook\s*365|onedrive)": "Assinaturas",
    r"(?i)(?:dropbox|google\s*one|icloud|cloud|armazenamento)": "Assinaturas",
    r"(?i)(?:notion|evernote|trello|slack|monday|asana|trello\s*.\?|jira)": "Assinaturas",
    r"(?i)(?:figma|adobe|photoshop|illustrator|xd|canva|pro\s*create|sketch)": "Assinaturas",
    r"(?i)(?:chatgpt|claude|openai|gemini|midjourney|copilot|ai\s*assinatura)": "Assinaturas",
    r"(?i)(?:antivirus|norton|kaspersky|avast|mcafee|malwarebytes|segurança\s*digital)": "Assinaturas",
    r"(?i)(?:linkedin\s*premium|linkedin\s*premium|indeed\s*premium|curriculum\s*vitae|cv)": "Assinaturas",
    r"(?i)(?:gym\s*pass|smartfit|smart\s*fit|academia\s*online|workout|youtube\s*premium)": "Assinaturas",
    r"(?i)(?:amazon\s*prime|prime\s*membership|assinatura\s*amazon|amz\s*prime)": "Assinaturas",

    # ===== BANCO / FINANCEIRO =====
    r"(?i)(?:banco|financeiro|financeira|instituição\s*financeira)": "Banco / Financeiro",
    r"(?i)(?:nubank|nubank\s*.\?|nu\s*card|nubank\s*Rewards|nubank\s*Usa)": "Banco / Financeiro",
    r"(?i)(?:itau|itau\s*.\?|itú|bradesco|santander|caixa|banco\s*brasil|banco\s*do\s*brasil)": "Banco / Financeiro",
    r"(?i)(?:inter|inter\s*.\?|next|next\s*.\?|neon|c6\s*bank|c6|will\s*bank|pagbank|picpay|mercadopago|pagseguro)": "Banco / Financeiro",
    r"(?i)(?:ame\s*digital|starkbank|original|modalmais|modal|sofisa|vincia| geru)": "Banco / Financeiro",
    r"(?i)(?:cartão\s*crédito|cartão\s*crédito|cartão\s*débito|cartão\s*debito|cartão\s*credito|cartão\s*debito)": "Banco / Financeiro",
    r"(?i)(?:fatura|extrato|anuidade|tarifa|taxa|mensalidade\s*banco|IOF|juros|multa)": "Banco / Financeiro",
    r"(?i)(?:emprestimo|empréstimo|emprestimo\s*pessoal|credito\s*pessoal|financiamento)": "Banco / Financeiro",
    r"(?i)(?:investimento|aplicação|aplicacao|cdb|poupança|poupanca|renda\s*fixa|renda\s*variavel)": "Banco / Financeiro",
    r"(?i)(?:tesouro\s*direto|tesouro\s*selic|tesouro\s*ipca|tesouro\s*prefixado)": "Banco / Financeiro",
    r"(?i)(?:ação|ações|acao|acoes|bolsa\s*valores|b3|ibovespa|trader|day\s*trade|mini\s*índice)": "Banco / Financeiro",
    r"(?i)(?:fundo\s*investimento|fundos|imposto\s*renda|ir\s*fixa|ir\s*variável|come\cota)": "Banco / Financeiro",
    r"(?i)(?:dividendo|juros\s*sobre\s*capital|yield|retorno\s*investimento|rendimento)": "Banco / Financeiro",
    r"(?i)(?:bitcoin|bitc|bitcoin|criptomoeda|cripto|binance|mercado\s*bitcoin|foxbit|bitpreço)": "Banco / Financeiro",
    r"(?i)(?:pix|transferencia|ted|doc|boleto|boleto\s*bancário|debito\s*automatico)": "Banco / Financeiro",
    r"(?i)(?:fgts|inss|imposto\s*de\s*renda|irpf|dirpf|imposto\s*renal)": "Banco / Financeiro",
    r"(?i)(?:seguro\s*vida|seguro\s*carro|seguro\s*casa|seguro\s*prestamista)": "Banco / Financeiro",
    r"(?i)(?:consorcio|consórcio|consórcio\s*imovel|consórcio\s*carro|consórcio\s*moto)": "Banco / Financeiro",
    r"(?i)(?:cartao|cartão|cartoes|cartões|credito|crédito|débito|débito|bandeira)": "Banco / Financeiro",

    # ===== BELEZA / HIGIENE PESSOAL =====
    r"(?i)(?:salao|salão|cabeleleiro|cabeleireiro|barber|barbearia|barbeiro|corte\s*de\s*cabelo)": "Beleza / Higiene",
    r"(?i)(?:manicure|pedicure|esmalte|unhas|unha\s*gel|unha\s*fibra|pedicure\s*.\?|maquiagem)": "Beleza / Higiene",
    r"(?i)(?:depilacao|depilação|depilação\s*a\s*laser|depilação\s*cera|barbeador| lâminas)": "Beleza / Higiene",
    r"(?i)(?:spa|spa\s*.\?|massagem|massagem\s*relaxante|massagem\s*terapêutica|terapia\s*massagem)": "Beleza / Higiene",
    r"(?i)(?:estetica|estética|esteticista|tratamento\s*facial|tratamento\s*corporal|dermo)": "Beleza / Higiene",
    r"(?i)(?:perfume|colônia|essência|desodorante|antitranspirante|roll\s*on)": "Beleza / Higiene",
    r"(?i)(?:cosmetico|cosmético|maquiagem|make\s*up|make\s*b|batom|base|rimel|gloss|pó|blush)": "Beleza / Higiene",
    r"(?i)(?:shampoo| condicionador| condicionador|mascare|óleo\s*cabelo|serum|creme\s*pentear)": "Beleza / Higiene",
    r"(?i)(?:creme|creme\s*hidratante|creme\s*facial|creme\s*corporal|loção|loção\s*corporal)": "Beleza / Higiene",
    r"(?i)(?:sabonete| sabonete|gel\s*de\s*limpeza|pasta\s*dente|escova\s*dente|fio\s*dental)": "Beleza / Higiene",
    r"(?i)(?:absorvente|protect|lençol\s*descartável|fralda|popó|urinol)": "Beleza / Higiene",
    r"(?i)(?:barbeador|gilete|lâmina|lamina|depilador|maquininha\s*depilar)": "Beleza / Higiene",
    r"(?i)(?:academia|academia\s*.\?|smart\s*fit|smartfit|crossfit|yoga|pilates|spinning)": "Beleza / Higiene",
    r"(?i)(?:clube\s*bel|clube\s*fitness|clube\s*esportivo|esporte|atividade\s*física)": "Beleza / Higiene",

    # ===== PETS =====
    r"(?i)(?:petshop|pet\s*shop|pet\s*.\?|petz|petlove|cobasi|love\s*pets)": "Pets",
    r"(?i)(?:racao|ração|ração\s*seca|ração\s*úmida|ração\s*premium|ração\s*super\s*premium)": "Pets",
    r"(?i)(?:veterinario|veterinário|vet|clinica\s*vet|hospital\s*vet|consulta\s*vet)": "Pets",
    r"(?i)(?:vacina\s*pet|vacina\s*cão|vacina\s*gato|vacina\s*dog|vacina\s*cat|verminfugo|antiparasitário)": "Pets",
    r"(?i)(?:remedio\s*pet|medicamento\s*pet|antibiótico\s*pet|anti\s*inflamatório\s*pet)": "Pets",
    r"(?i)(?:banho\s*pet|tosa|tosapet|pet\s*banho|pet\s*bath|grooming)": "Pets",
    r"(?i)(?:coleira|guia\s*pet|coleira\s*peitoral|ração\s*pet|comedouro|bebedouro|petisco)": "Pets",
    r"(?i)(?:dog|cão|cachorro|gato|cat|pet\b|animal\s*doméstico|animal\s*de\s*estimação)": "Pets",
    r"(?i)(?:passaro|pássaro|ave|calopsita|periquito|papagaio|cacatua|canário|cardeal)": "Pets",
    r"(?i)(?:peixe|aquário|peixe\s*ornamental|tartaruga|réptil|hamster|porquinho\s*india|coelho)": "Pets",
    r"(?i)(?:pet\s*food|pet\s*store|pet\s*market|pet\s*virtual|pet\s*friendly|pet\s*sitter|pet\s*walker)": "Pets",

    # ===== IMPOSTOS / TAXAS GOVERNAMENTAIS =====
    r"(?i)(?:imposto|impostos|tributo|tributos|arrecadação)": "Impostos / Taxas",
    r"(?i)(?:ipva|licenciamento\s*veicular|licenciamento\s*anual|dpvat)": "Impostos / Taxas",
    r"(?i)(?:iptu|imposto\s*predial|taxa\s*lixo|taxa\s*coleta)": "Impostos / Taxas",
    r"(?i)(?:ir\s*pf|irpf|imposto\s*de\s*renda|declaração\s*ir|dirpf|informe\s*renda)": "Impostos / Taxas",
    r"(?i)(?:inss|previdência\s*social|contribuição\s*inss|gpraud| gps|guia\s*previdencia)": "Impostos / Taxas",
    r"(?i)(?:fgts|fundo\s*de\s*garantia|fgts\s*mensal|fgts\s*rescisório)": "Impostos / Taxas",
    r"(?i)(?:mei|mei\s*.\?|micro\s*empreendedor|simples\s*nacional|das\s*mei|das\s*micro)": "Impostos / Taxas",
    r"(?i)(?:cnpj|cpf|rg|identidade|passaporte|carteira\s*motorista|cnh|detran)": "Impostos / Taxas",
    r"(?i)(?:cartório|cartorio|registro\s*civil|registro\s*imóvel|tabelionato|notaria)": "Impostos / Taxas",
    r"(?i)(?:multa\s*governamental|multa\s*federal|multa\s*estadual|multa\s*municipal)": "Impostos / Taxas",
    r"(?i)(?:taxa\s*adm|taxa\s*juridica|taxa\s*contabil|honorários\s*advocatícios)": "Impostos / Taxas",
    r"(?i)(?:sped|ecf|sintegra|nfe|nfse|nf\s*eletronica|nota\s*fiscal\s*eletronica)": "Impostos / Taxas",
    r"(?i)(?:pis|cofins|csll|irpj|irpj\s*estimado|imposto\s*retido\s*fonte)": "Impostos / Taxas",

    # ===== RECEITAS / INCOME =====
    r"(?i)(?:salário|salario|salário\s*.\?|vencimento|pagamento\s*salário|pagamento\s*mensal|holerite|contra\s*cheque)": "Salário",
    r"(?i)(?:bonus|bonificação|gratificação|premio|premiação|participação\s*lucros|plr)": "Salário",
    r"(?i)(?:comissão|comissao|comiss|comissão\s*.\?|royalty|percentual|venda\s*comissao)": "Salário",
    r"(?i)(?:honorário|honorarios|honorário\s*advocatício|honorário\s*contábil|honorário\s*médico|consultoria)": "Salário",
    r"(?i)(?:pensão\s*alimentícia|pensão\s*.\?|pensão\s*.*|auxílio\s*.*|benefício\s*.*)": "Salário",
    r"(?i)(?:auxílio\s*.*|auxilio\s*.*|benefício\s*.*|beneficio\s*.*|ajuda\s*.*|vale\s*.*)": "Salário",
    r"(?i)(?:decimo\s*terceiro|13º|decimo\s*quarto|abono\s*.*|gratificação\s*natalina)": "Salário",
    r"(?i)(?:ferias|feriado|férias\s*.\?|abono\s*pecuniário|ferias\s*vendidas)": "Salário",
    r"(?i)(?:rescisão|rescisão\s*trabalhista|demissão|demissão\s*.\?|aviso\s*prévio\s*.*)": "Salário",
    r"(?i)(?:freelance|freela|freelancer|trabalhos\s*freelance|projetos\s*.*|trabalhos\s*extras)": "Freelance",
    r"(?i)(?:freelance\s*\.?|freela\s*\.?|trabalhos\s*independentes|trabalho\s*autônomo|autônomo)": "Freelance",
    r"(?i)(?:autônomo|autonomo|mei|micro\s*empreendedor|prestador\s*serviços|prestador\s*.\?)": "Freelance",
    r"(?i)(?:pj|pessoa\s*jurídica|contrato\s*pj|nota\s*fiscal\s*pj|faturamento\s*pj)": "Freelance",
    r"(?i)(?:dividendo|dividendos|yield|retorno\s*investimento|rendimento\s*aplicação)": "Investimentos",
    r"(?i)(?:juros\s*recebido|juros\s*.\?|rendimento\s*poupança|rendimento\s*cdb|rendimento\s*fundo)": "Investimentos",
    r"(?i)(?:aluguel\s*recebido|aluguel\s*.\?|renda\s*aluguel|contrato\s*aluguel|fiador\s*.*)": "Investimentos",
    r"(?i)(?:venda|vendeu|venda\s*.*|lucro\s*venda|ganho\s*capital|mais\s*valia)": "Investimentos",
    r"(?i)(?:presente|doação|doacao|herança|heranca|ganhou|win|gift|transferência\s*.\?)": "Outros",
    r"(?i)(?:reembolso|restituição|devolução|cashback|devolução\s*.*|restituição\s*.*)": "Outros",
    r"(?i)(?:sorteio|prêmio\s*sorteio|loteria|ganho\s*loterico|ganhou\s*na\s*loteria)": "Outros",
    r"(?i)(?:bolsa\s*estudo|bolsa\s*.*|assistência\s*.*|auxílio\s*.*|bolsa\s*pesquisa)": "Outros",
    r"(?i)(?:indenização|indenização\s*.*|seguro\s*.*|franquia\s*.*|sinistro\s*.*)": "Outros",
    r"(?i)(?:transferência\s*recebida|transferencia\s*recebida|pix\s*recebido|deposito\s*.*)": "Outros",
    r"(?i)(?:jianni|ben|vr|va|vt|vale\s*alimentação|vale\s*refeição|vale\s*transporte)": "Salário",
    r"(?i)(?:benefício|beneficio|benefício\s*.*|vale\s*.*|cesta\s*.*|auxílio\s*.*)": "Salário",

    # ===== GASTOS COM VIAGENS =====
    r"(?i)(?:passagem|passagem\s*aerea|passagem\s*aérea|voo|voo\s*.\?|billete|aereo|aéreo)": "Viagem",
    r"(?i)(?:hotel|hoteis|pousada|resort|hostel|flat|apart-hotel|hospedagem)": "Viagem",
    r"(?i)(?:reserva\s*hotel|reserva\s*.\?|booking|airbnb|decolar|hotels|viajanet)": "Viagem",
    r"(?i)(?:viagem|viagens|ferias|feriados|passeio|turismo|viajante|viajar)": "Viagem",
    r"(?i)(?:seguro\s*viagem|seguro\s*.*|assistência\s*viagem|cover\s*travel)": "Viagem",
    r"(?i)(?:aluguel\s*carro|locadora|locação\s*veiculo|enterprise|hertz|localiza)": "Viagem",
    r"(?i)(?:traslado|transfer|transporte\s*aeroporto|shuttle|van\s*.)": "Viagem",
    r"(?i)(?:excursão|excursao|viagem\s*organizada|package|tour|roteiro)": "Viagem",
    r"(?i)(?:turismo|turist|guia\s*turist|guia\s*local|travel\s*guide)": "Viagem",
    r"(?i)(?:moeda\s*estrangeira|dólar|euro|libra|pesos|câmbio|cambio|Exchange)": "Viagem",
    r"(?i)(?:passaporte|visto|visa\s*.*|embaixada|consulado|documentação\s*viagem)": "Viagem",

    # ===== DOAÇÕES E CARIDADE =====
    r"(?i)(?:doação|doacao|doar|doe|caridade|caridade\s*.*|beneficência|beneficencia)": "Doações",
    r"(?i)(?:instituição\s*beneficente|instituição\s*filantropica|ong|onp|red\s*cross|cruz\s*vermelha)": "Doações",
    r"(?i)(?:trote|trote\s*universitário|aranha|aranha\s*.)": "Doações",
    r"(?i)(?:vaquinha|vakinha|crowdfunding|apoia\.me|catarse|benfeitoria|impacto)": "Doações",
    r"(?i)(?:pix\s*doação|pix\s*.\?|chave\s*pix|chave\s*aleatória)": "Doações",

    # ===== CUIDADOS COM O CARRO =====
    r"(?i)(?:mecanico|mecânico|mecanica|mecânica|oficina|conserto\s*carro|revisão|revisão\s*.*)": "Carro",
    r"(?i)(?:oleo|óleo|oleo|mudança\s*oleo|troca\s*oleo|oleo\s*motor|oleo\s*.)": "Carro",
    r"(?i)(?:pneu|pneus|troca\s*pneu|balanceamento|alinhamento|roda|aro)": "Carro",
    r"(?i)(?:bateria|bateria\s*carro|troca\s*bateria|alternador|motor\s*partida)": "Carro",
    r"(?i)(?:freio|freios|troca\s*freio|disco\s*freio|pastilha\s*freio| tambor)": "Carro",
    r"(?i)(?:corretivo\s*.*|higienização\s*.*|limpeza\s*estofado|polimento\s*.*|cristalização)": "Carro",
    r"(?i)(?:lavagem|lavagem\s*carro|car\s*wash|autolavagem|detailing|espelhamento\s*.)": "Carro",
    r"(?i)(?:estacionamento|estaci|garagem|zona\s*azul|rotativo|parquímetro)": "Carro",
    r"(?i)(?:pedagio|pedágio|portagem|free\s*flow|taxa\s*pedagio)": "Carro",
    r"(?i)(?:ipva|licenciamento|dpvat|multa\s*transito|taxa\s*detran|crlv)": "Carro",
    r"(?i)(?:seguro\s*carro|seguro\s*auto|seguro\s*veicular|proteção\s*veicular)": "Carro",
    r"(?i)(?:guincho|reboque|resgate\s*veicular|socorro\s*.*|assistência\s*.*)": "Carro",

    # ===== PRESENTES E EVENTOS =====
    r"(?i)(?:presente|presente\s*.*|gift\s*.*|surpresa|aniversário|niver|casamento|noiva|noivo)": "Presentes",
    r"(?i)(?:casamento|noiva|noivo|cerimônia|festa\s*casamento|buffet\s*.*|convite\s*.*)": "Presentes",
    r"(?i)(?:formatura|formatura\s*.*|toga|batismo|comunhão|crisma|casamento\s*.)": "Presentes",
    r"(?i)(?:chá\s*.*|cha\s*cozinha|cha\s*bebê|cha\s*revelação|encontro\s*.\?|happy\s*hour)": "Presentes",
    r"(?i)(?:flor|flores|floricultura|buquê|arranjo\s*floral|orquídea|rosa|cravo)": "Presentes",
    r"(?i)(?:doces|docinho|brigadeiro|beijinho|confete|confete\s*.\?| MM|M&M)": "Presentes",
    r"(?i)(?:papel\s*.*|embalagem\s*.*|laço|fita|presente\s*embalar|papel\s*.)": "Presentes",

    # ===== ESCOLARIDADE / CURSOS =====
    r"(?i)(?:escola|colegio|colégio|creche|berçário|pré\s*escola|ensino\s*.)": "Educação",
    r"(?i)(?:uniforme\s*escolar|mochila\s*escolar|material\s*escolar|kit\s*escolar)": "Educação",
    r"(?i)(?:mensalidade\s*escola|mensalidade\s*colegio|taxa\s*matricula|taxa\s*inscrição)": "Educação",
    r"(?i)(?:livro\s*didático|livro\s*escolar|apostila|caderno|agenda|caneta|estojo)": "Educação",
    r"(?i)(?:transporte\s*escolar|van\s*escolar|onibus\s*escolar|microônibus\s*escolar)": "Educação",
    r"(?i)(?:refeição\s*escolar|merenda\s*escolar|lanche\s*escolar|café\s*.)": "Educação",
    r"(?i)(?:extracurricular|curso\s*extr|aula\s*particula|aulão|reforço\s*.)": "Educação",
    r"(?i)(?:sport|society|campo\s*futebol|quadra|academia\s*escolar|educação\s*física)": "Educação",

    # ===== ASSISTÊNCIA TÉCNICA E SERVIÇOS =====
    r"(?i)(?:assistência\s*técnica|assistência\s*.\?|técnico|tecnico|conserto|reparo\s*.)": "Serviços",
    r"(?i)(?:celular\s*conserto|celular\s*reparo|tela\s*.*|bateria\s*.*|iphone\s*.)": "Serviços",
    r"(?i)(?:computador\s*conserto|notebook\s*reparo|pc\s*.\?|formatacao|formatação)": "Serviços",
    r"(?i)(?:eletrodomestico\s*conserto|eletro\s*reparo|assistência\s*.)": "Serviços",
    r"(?i)(?:chaveiro|chave\s*.*|carimbo|serralheria|vidraceiro|vidro\s*.*)": "Serviços",
    r"(?i)(?:encanador|chuveiro|torneira|registro|caixa\s*.*|bóia\s*.)": "Serviços",
    r"(?i)(?:eletricista|fio|cabo|disjuntor|tomada|interruptor|lâmpada)": "Serviços",
    r"(?i)(?:pintor|pintura|reforma|construção|argamassa|cimento|tijolo)": "Serviços",
    r"(?i)(?:marceneiro|móvel\s*.*|moveis\s*.*|armário|prateleira)": "Serviços",
    r"(?i)(?:costureira|alfaiate|roupa\s*.*|ajuste\s*.*|bordado\s*.)": "Serviços",

    # ===== ASSINATURAS DE REVISTAS E JORNAIS =====
    r"(?i)(?:revista|revist|assinatura\s*revista|jornal|assinatura\s*jornal|publicação|leitura)": "Assinaturas",
    r"(?i)(?:globo|oglobo|folha|uol|terra|ig|noticias|news|newsletter)": "Assinaturas",
    r"(?i)(?:digital|ebook|kindle|amazon\s*kindle|livro\s*digital|audiolivro)": "Assinaturas",
    r"(?i)(?:app\s*notícia|app\s*news|jornal\s*digital|leitura\s*.)": "Assinaturas",

    # ===== SEGUROS =====
    r"(?i)(?:seguro\s*.*|seguros|seguradora|cobertura\s*.*|apólice|apolice|sinistro\s*.)": "Seguros",
    r"(?i)(?:seguro\s*vida|seguro\s*.*|vida\s*.*|previdência\s*privada|pesion)": "Seguros",
    r"(?i)(?:seguro\s*saude|seguro\s*médico|plano\s*saúde|plano\s*médico)": "Seguros",
    r"(?i)(?:seguro\s*carro|seguro\s*auto|seguro\s*veicular|comprehensive\s*.)": "Seguros",
    r"(?i)(?:seguro\s*casa|seguro\s*residencial|seguro\s*imovel|home\s*insurance)": "Seguros",
    r"(?i)(?:seguro\s*viagem|seguro\s*.*|assistência\s*viagem|travel\s*insurance)": "Seguros",
    r"(?i)(?:previdência|previdencia|prev\s*privada|plano\s*aposentadoria|aposentadoria)": "Seguros",
    r"(?i)(?:pgb|pgbil|vgbl|plano\s*prev|vblz|pensão\s*.*|renda\s*.)": "Seguros",

    # ===== MENSALIDADES E ASSINATURAS DIVERSAS =====
    r"(?i)(?:mensalidade|mensal|mensalidade\s*.*|anuidade|anuidade\s*.*|taxa\s*mensal)": "Assinaturas",
    r"(?i)(?:associacao|associação|associado|associada|membro|clube\s*.*|sindicato\s*.)": "Assinaturas",
    r"(?i)(?:partido|partido\s*político|doação\s*política|eleição\s*.*)": "Assinaturas",
    r"(?i)(?:ordem\s*advogados|oab|inscrição\s*oab|anuidade\s*oab)": "Assinaturas",
    r"(?i)(?:creci|creci\s*.\?|corretor\s*imóvel|credenciamento\s*.)": "Assinaturas",
    r"(?i)(?:crm|crm\s*.\?|inscrição\s*médica|anuidade\s*médica|regional\s*.)": "Assinaturas",

    # ===== GASTOS COM FAMÍLIA =====
    r"(?i)(?:família|familia|filho|filha|criança|crianca|bebê|bebe|menino|menina)": "Família",
    r"(?i)(?:escola\s*filho|escola\s*.*|mensalidade\s*filho|curso\s*.*|extracurricular\s*.)": "Família",
    r"(?i)(?:roupa\s*filho|roupa\s*.*|calçado\s*.*|material\s*escolar\s*.)": "Família",
    r"(?i)(?:brinquedo|brinquedos|brinq|jogo\s*.\?|presente\s*.*|boneca| bone)": "Família",
    r"(?i)(?:médico\s*filho|odontopediatra|vacinação\s*.*|pediatra\s*.)": "Família",
    r"(?i)(?:fralda|leite\s*.*|papinha|comida\s*.*|papá\s*.)": "Família",
    r"(?i)(?:pai|pai\s*.*|mãe|mae\s*.*|presente\s*pai|presente\s*mãe| dia\s*dos\s*pais)": "Família",
    r"(?i)(?:cônjuge|conjuge|marido|esposa|companheiro|companheira)": "Família",
    r"(?i)(?:pensão\s*.*|pensão\s*alimentícia|alimentação\s*.)": "Família",

    # ===== TELEFONIA MÓVEL =====
    r"(?i)(?:celular|telefone|telefonia|móvel|movel|smartphone|iphone|samsung|xiaomi|motorola)": "Telefonia",
    r"(?i)(?:claro|claro\s*.\?|vivo|vivo\s*.\?|tim|tim\s*.\?|oi|oi\s*.\?|operadora)": "Telefonia",
    r"(?i)(?:plano\s*celular|plano\s*.\?|chip|sim\s*card|recarga|recarga\s*.)": "Telefonia",
    r"(?i)(?:mensalidade\s*celular|mensalidade\s*.\?|conta\s*telefone|conta\s*.)": "Telefonia",
    r"(?i)(?:ligação|chamada|tarifa\s*ligação|ligações\s*.\?|minutos\s*.)": "Telefonia",
    r"(?i)(?:internet\s*movel|internet\s*.\?|4g|5g|dados\s*.\?|流量)": "Telefonia",
    r"(?i)(?:whatsapp\s*business|whatsapp\s*.\?|messenger|telegram|signal\s*.)": "Telefonia",
    r"(?i)(?:app\s*celular|aplicativo\s*.*|download\s*.*|atualização\s*.)": "Telefonia",

    # ===== DESPESAS DIVERSAS =====
    r"(?i)(?:outros|outras|outro|diversos|diversas|misc|miscellaneous|gastos\s*.)": "Outros",
    r"(?i)(?:taxa\s*.*|tarifa\s*.*|serviço\s*.*|comissão\s*.*|juros\s*.)": "Outros",
    r"(?i)(?:multa\s*.*|penalidade\s*.*|encargo\s*.*|acrescimo\s*.)": "Outros",
    r"(?i)(?:ajuste\s*.*|diferença\s*.*|saldo\s*.*|acerto\s*.*)": "Outros",
    r"(?i)(?:rateio\s*.*|divisão\s*.*|cota\s*.*|participação\s*.)": "Outros",
    r"(?i)(?:emprestimo\s*.*|financiamento\s*.*|parcela\s*.*|prestação\s*.)": "Outros",
    r"(?i)(?:guia\s*.*|boleto\s*.*|darf|darf\s*.*|gps\s*.)": "Outros",
    r"(?i)(?:custo\s*.*|despesa\s*.*|gasto\s*.*|retirada\s*.)": "Outros",
    r"(?i)(?:saque\s*.*|tarifa\s*saque|taxa\s*saque|comissão\s*saque)": "Outros",
    r"(?i)(?:manutenção\s*.*|mantimento\s*.*|custeio\s*.*|operação\s*.)": "Outros",
}

# Categorias de receita (income) -map para filtragem
INCOME_CATEGORIES = {"Salário", "Freelance", "Investimentos", "Outros", "Viagem", "Doações", "Presentes"}


async def classify_by_rules(description: str, tenant_id: str, db: AsyncSession, type_val: str = "expense") -> uuid.UUID | None:
    """
    Camada 1: Classifica usando regex locais (100% gratuito).
    Retorna UUID da categoria se encontrar match, None caso contrário.
    type_val: 'expense' ou 'income' para filtrar categorias relevantes.
    
    Suporta:
    - Palavras com e sem acentos
    - Maiúsculas e minúsculas
    - Abreviações comuns brasileiras
    - Expressões coloquiais
    """
    matched_name = None
    
    # Normaliza o texto de entrada para busca mais precisa
    normalized_desc = normalize_text(description)
    
    for pattern, cat_name in KEYWORD_MAP.items():
        # Filtra categorias de receita/despesa conforme type_val
        if type_val == "expense" and cat_name in INCOME_CATEGORIES:
            continue
        if type_val == "income" and cat_name not in INCOME_CATEGORIES:
            continue
            
        # Tenta fazer match tanto no texto original quanto no normalizado
        if re.search(pattern, description) or re.search(pattern, normalized_desc):
            matched_name = cat_name
            break

    if not matched_name:
        return None

    try:
        tenant_uuid = uuid.UUID(tenant_id) if isinstance(tenant_id, str) else tenant_id
        
        # Busca por nome exato ou partial match (pegando primeiro nome antes da barra)
        search_name = matched_name.split('/')[0].strip()
        
        result = await db.execute(
            select(Category).where(
                Category.tenant_id == tenant_uuid,
                Category.name.ilike(f"%{search_name}%")
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
