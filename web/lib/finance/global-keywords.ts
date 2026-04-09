import {
  buildNormalizedBankStatementText,
  normalizeClassificationKeyword,
  tokenizeClassificationText
} from "@/lib/finance/classification-normalization";

export type GlobalCategoryKey =
  | "salario"
  | "freelance-servicos"
  | "rendimentos"
  | "reembolso"
  | "vendas"
  | "transferencias-recebidas"
  | "outras-receitas"
  | "supermercado"
  | "feira-hortifruti"
  | "restaurantes"
  | "delivery"
  | "cafe-padaria"
  | "combustivel"
  | "transporte"
  | "apps-mobilidade"
  | "moradia"
  | "condominio"
  | "energia-eletrica"
  | "agua-saneamento"
  | "internet-telefonia"
  | "saude"
  | "farmacia"
  | "educacao"
  | "streaming-assinaturas"
  | "lazer"
  | "pets"
  | "impostos-taxas"
  | "tarifas-bancarias"
  | "dizimo"
  | "compras-online"
  | "vestuario"
  | "viagem";

export type GlobalKeywordRule = {
  phrase: string;
  categoryKey: GlobalCategoryKey;
  type: "income" | "expense";
  priority: number;
};

export type GlobalKeywordMatch = {
  keyword: string;
  categoryKey: GlobalCategoryKey;
  type: "income" | "expense";
  confidence: number;
};

type GlobalKeywordSeed = Omit<GlobalKeywordRule, "priority">;

const GLOBAL_KEYWORD_SEEDS: GlobalKeywordSeed[] = [
  { phrase: "ifood", categoryKey: "delivery", type: "expense" },
  { phrase: "uber eats", categoryKey: "delivery", type: "expense" },
  { phrase: "rappi", categoryKey: "delivery", type: "expense" },
  { phrase: "ze delivery", categoryKey: "delivery", type: "expense" },
  { phrase: "zedelivery", categoryKey: "delivery", type: "expense" },
  { phrase: "outback", categoryKey: "restaurantes", type: "expense" },
  { phrase: "mcdonalds", categoryKey: "restaurantes", type: "expense" },
  { phrase: "burger king", categoryKey: "restaurantes", type: "expense" },
  { phrase: "coco bambu", categoryKey: "restaurantes", type: "expense" },
  { phrase: "almoco", categoryKey: "restaurantes", type: "expense" },
  { phrase: "jantar", categoryKey: "restaurantes", type: "expense" },
  { phrase: "marmita", categoryKey: "restaurantes", type: "expense" },
  { phrase: "pizza", categoryKey: "restaurantes", type: "expense" },
  { phrase: "pizzaria", categoryKey: "restaurantes", type: "expense" },
  { phrase: "hamburguer", categoryKey: "restaurantes", type: "expense" },
  { phrase: "sushi", categoryKey: "restaurantes", type: "expense" },
  { phrase: "padaria", categoryKey: "cafe-padaria", type: "expense" },
  { phrase: "cafe da manha", categoryKey: "cafe-padaria", type: "expense" },
  { phrase: "cafezinho", categoryKey: "cafe-padaria", type: "expense" },
  { phrase: "pao", categoryKey: "cafe-padaria", type: "expense" },
  { phrase: "pastel", categoryKey: "cafe-padaria", type: "expense" },
  { phrase: "carrefour", categoryKey: "supermercado", type: "expense" },
  { phrase: "atacadao", categoryKey: "supermercado", type: "expense" },
  { phrase: "assai", categoryKey: "supermercado", type: "expense" },
  { phrase: "pao de acucar", categoryKey: "supermercado", type: "expense" },
  { phrase: "mercado", categoryKey: "supermercado", type: "expense" },
  { phrase: "supermercado", categoryKey: "supermercado", type: "expense" },
  { phrase: "compra do mes", categoryKey: "supermercado", type: "expense" },
  { phrase: "compras do mes", categoryKey: "supermercado", type: "expense" },
  { phrase: "feira", categoryKey: "feira-hortifruti", type: "expense" },
  { phrase: "hortifruti", categoryKey: "feira-hortifruti", type: "expense" },
  { phrase: "sacolao", categoryKey: "feira-hortifruti", type: "expense" },
  { phrase: "verdura", categoryKey: "feira-hortifruti", type: "expense" },
  { phrase: "frutas", categoryKey: "feira-hortifruti", type: "expense" },
  { phrase: "acougue", categoryKey: "supermercado", type: "expense" },
  { phrase: "uber trip", categoryKey: "apps-mobilidade", type: "expense" },
  { phrase: "uber do brasil", categoryKey: "apps-mobilidade", type: "expense" },
  { phrase: "99app", categoryKey: "apps-mobilidade", type: "expense" },
  { phrase: "99 pop", categoryKey: "apps-mobilidade", type: "expense" },
  { phrase: "uber", categoryKey: "apps-mobilidade", type: "expense" },
  { phrase: "taxi", categoryKey: "apps-mobilidade", type: "expense" },
  { phrase: "gasolina", categoryKey: "combustivel", type: "expense" },
  { phrase: "etanol", categoryKey: "combustivel", type: "expense" },
  { phrase: "diesel", categoryKey: "combustivel", type: "expense" },
  { phrase: "abastecimento", categoryKey: "combustivel", type: "expense" },
  { phrase: "posto", categoryKey: "combustivel", type: "expense" },
  { phrase: "petrobras", categoryKey: "combustivel", type: "expense" },
  { phrase: "ipiranga", categoryKey: "combustivel", type: "expense" },
  { phrase: "shell box", categoryKey: "combustivel", type: "expense" },
  { phrase: "pedagio", categoryKey: "transporte", type: "expense" },
  { phrase: "estacionamento", categoryKey: "transporte", type: "expense" },
  { phrase: "onibus", categoryKey: "transporte", type: "expense" },
  { phrase: "metro", categoryKey: "transporte", type: "expense" },
  { phrase: "trem", categoryKey: "transporte", type: "expense" },
  { phrase: "passagem", categoryKey: "transporte", type: "expense" },
  { phrase: "bilhete unico", categoryKey: "transporte", type: "expense" },
  { phrase: "enel", categoryKey: "energia-eletrica", type: "expense" },
  { phrase: "light", categoryKey: "energia-eletrica", type: "expense" },
  { phrase: "copel", categoryKey: "energia-eletrica", type: "expense" },
  { phrase: "cemig", categoryKey: "energia-eletrica", type: "expense" },
  { phrase: "conta de luz", categoryKey: "energia-eletrica", type: "expense" },
  { phrase: "energia", categoryKey: "energia-eletrica", type: "expense" },
  { phrase: "sabesp", categoryKey: "agua-saneamento", type: "expense" },
  { phrase: "sanepar", categoryKey: "agua-saneamento", type: "expense" },
  { phrase: "copasa", categoryKey: "agua-saneamento", type: "expense" },
  { phrase: "conta de agua", categoryKey: "agua-saneamento", type: "expense" },
  { phrase: "agua", categoryKey: "agua-saneamento", type: "expense" },
  { phrase: "aluguel", categoryKey: "moradia", type: "expense" },
  { phrase: "quintoandar", categoryKey: "moradia", type: "expense" },
  { phrase: "reforma", categoryKey: "moradia", type: "expense" },
  { phrase: "pedreiro", categoryKey: "moradia", type: "expense" },
  { phrase: "faxina", categoryKey: "moradia", type: "expense" },
  { phrase: "diarista", categoryKey: "moradia", type: "expense" },
  { phrase: "condominio", categoryKey: "condominio", type: "expense" },
  { phrase: "comgas", categoryKey: "moradia", type: "expense" },
  { phrase: "ultragaz", categoryKey: "moradia", type: "expense" },
  { phrase: "gas", categoryKey: "moradia", type: "expense" },
  { phrase: "botijao", categoryKey: "moradia", type: "expense" },
  { phrase: "iptu", categoryKey: "impostos-taxas", type: "expense" },
  { phrase: "ipva", categoryKey: "impostos-taxas", type: "expense" },
  { phrase: "internet", categoryKey: "internet-telefonia", type: "expense" },
  { phrase: "celular", categoryKey: "internet-telefonia", type: "expense" },
  { phrase: "vivo", categoryKey: "internet-telefonia", type: "expense" },
  { phrase: "claro", categoryKey: "internet-telefonia", type: "expense" },
  { phrase: "tim", categoryKey: "internet-telefonia", type: "expense" },
  { phrase: "netflix", categoryKey: "streaming-assinaturas", type: "expense" },
  { phrase: "spotify", categoryKey: "streaming-assinaturas", type: "expense" },
  { phrase: "amazon prime", categoryKey: "streaming-assinaturas", type: "expense" },
  { phrase: "disney", categoryKey: "streaming-assinaturas", type: "expense" },
  { phrase: "globoplay", categoryKey: "streaming-assinaturas", type: "expense" },
  { phrase: "youtube premium", categoryKey: "streaming-assinaturas", type: "expense" },
  { phrase: "microsoft 365", categoryKey: "streaming-assinaturas", type: "expense" },
  { phrase: "playstation", categoryKey: "streaming-assinaturas", type: "expense" },
  { phrase: "steam", categoryKey: "streaming-assinaturas", type: "expense" },
  { phrase: "cinema", categoryKey: "lazer", type: "expense" },
  { phrase: "show", categoryKey: "lazer", type: "expense" },
  { phrase: "teatro", categoryKey: "lazer", type: "expense" },
  { phrase: "barzinho", categoryKey: "lazer", type: "expense" },
  { phrase: "viagem", categoryKey: "viagem", type: "expense" },
  { phrase: "hotel", categoryKey: "viagem", type: "expense" },
  { phrase: "pousada", categoryKey: "viagem", type: "expense" },
  { phrase: "airbnb", categoryKey: "viagem", type: "expense" },
  { phrase: "latam", categoryKey: "viagem", type: "expense" },
  { phrase: "gol linhas", categoryKey: "viagem", type: "expense" },
  { phrase: "drogasil", categoryKey: "farmacia", type: "expense" },
  { phrase: "droga raia", categoryKey: "farmacia", type: "expense" },
  { phrase: "pague menos", categoryKey: "farmacia", type: "expense" },
  { phrase: "drogaria sao paulo", categoryKey: "farmacia", type: "expense" },
  { phrase: "farmacia", categoryKey: "farmacia", type: "expense" },
  { phrase: "remedio", categoryKey: "farmacia", type: "expense" },
  { phrase: "medicamento", categoryKey: "farmacia", type: "expense" },
  { phrase: "unimed", categoryKey: "saude", type: "expense" },
  { phrase: "bradesco saude", categoryKey: "saude", type: "expense" },
  { phrase: "amil", categoryKey: "saude", type: "expense" },
  { phrase: "hapvida", categoryKey: "saude", type: "expense" },
  { phrase: "smart fit", categoryKey: "saude", type: "expense" },
  { phrase: "gympass", categoryKey: "saude", type: "expense" },
  { phrase: "consulta", categoryKey: "saude", type: "expense" },
  { phrase: "medico", categoryKey: "saude", type: "expense" },
  { phrase: "dentista", categoryKey: "saude", type: "expense" },
  { phrase: "terapia", categoryKey: "saude", type: "expense" },
  { phrase: "psicologo", categoryKey: "saude", type: "expense" },
  { phrase: "exame", categoryKey: "saude", type: "expense" },
  { phrase: "academia", categoryKey: "saude", type: "expense" },
  { phrase: "mercado livre", categoryKey: "compras-online", type: "expense" },
  { phrase: "mercadolivre", categoryKey: "compras-online", type: "expense" },
  { phrase: "amazon.com.br", categoryKey: "compras-online", type: "expense" },
  { phrase: "shopee", categoryKey: "compras-online", type: "expense" },
  { phrase: "aliexpress", categoryKey: "compras-online", type: "expense" },
  { phrase: "shein", categoryKey: "compras-online", type: "expense" },
  { phrase: "magalu", categoryKey: "compras-online", type: "expense" },
  { phrase: "americanas", categoryKey: "compras-online", type: "expense" },
  { phrase: "roupa", categoryKey: "vestuario", type: "expense" },
  { phrase: "camisa", categoryKey: "vestuario", type: "expense" },
  { phrase: "calca", categoryKey: "vestuario", type: "expense" },
  { phrase: "tenis", categoryKey: "vestuario", type: "expense" },
  { phrase: "sapato", categoryKey: "vestuario", type: "expense" },
  { phrase: "maquiagem", categoryKey: "vestuario", type: "expense" },
  { phrase: "perfume", categoryKey: "vestuario", type: "expense" },
  { phrase: "renner", categoryKey: "vestuario", type: "expense" },
  { phrase: "zara", categoryKey: "vestuario", type: "expense" },
  { phrase: "netshoes", categoryKey: "vestuario", type: "expense" },
  { phrase: "estacio", categoryKey: "educacao", type: "expense" },
  { phrase: "puc", categoryKey: "educacao", type: "expense" },
  { phrase: "senai", categoryKey: "educacao", type: "expense" },
  { phrase: "alura", categoryKey: "educacao", type: "expense" },
  { phrase: "udemy", categoryKey: "educacao", type: "expense" },
  { phrase: "hotmart", categoryKey: "educacao", type: "expense" },
  { phrase: "escola", categoryKey: "educacao", type: "expense" },
  { phrase: "faculdade", categoryKey: "educacao", type: "expense" },
  { phrase: "curso", categoryKey: "educacao", type: "expense" },
  { phrase: "ingles", categoryKey: "educacao", type: "expense" },
  { phrase: "livro", categoryKey: "educacao", type: "expense" },
  { phrase: "manutencao de conta", categoryKey: "tarifas-bancarias", type: "expense" },
  { phrase: "pacote de servicos", categoryKey: "tarifas-bancarias", type: "expense" },
  { phrase: "anuidade", categoryKey: "tarifas-bancarias", type: "expense" },
  { phrase: "taxa", categoryKey: "tarifas-bancarias", type: "expense" },
  { phrase: "tarifa", categoryKey: "tarifas-bancarias", type: "expense" },
  { phrase: "juros", categoryKey: "tarifas-bancarias", type: "expense" },
  { phrase: "iof", categoryKey: "tarifas-bancarias", type: "expense" },
  { phrase: "receita federal", categoryKey: "impostos-taxas", type: "expense" },
  { phrase: "darf", categoryKey: "impostos-taxas", type: "expense" },
  { phrase: "das mei", categoryKey: "impostos-taxas", type: "expense" },
  { phrase: "imposto", categoryKey: "impostos-taxas", type: "expense" },
  { phrase: "petz", categoryKey: "pets", type: "expense" },
  { phrase: "cobasi", categoryKey: "pets", type: "expense" },
  { phrase: "petlove", categoryKey: "pets", type: "expense" },
  { phrase: "racao", categoryKey: "pets", type: "expense" },
  { phrase: "veterinario", categoryKey: "pets", type: "expense" },
  { phrase: "petshop", categoryKey: "pets", type: "expense" },
  { phrase: "igreja", categoryKey: "dizimo", type: "expense" },
  { phrase: "dizimo", categoryKey: "dizimo", type: "expense" },
  { phrase: "oferta", categoryKey: "dizimo", type: "expense" },
  { phrase: "adiantamento quinzenal", categoryKey: "salario", type: "income" },
  { phrase: "vale refeicao", categoryKey: "salario", type: "income" },
  { phrase: "vale alimentacao", categoryKey: "salario", type: "income" },
  { phrase: "alelo", categoryKey: "salario", type: "income" },
  { phrase: "sodexo", categoryKey: "salario", type: "income" },
  { phrase: "pluxee", categoryKey: "salario", type: "income" },
  { phrase: "flash beneficios", categoryKey: "salario", type: "income" },
  { phrase: "salario", categoryKey: "salario", type: "income" },
  { phrase: "pagamento", categoryKey: "salario", type: "income" },
  { phrase: "decimo terceiro", categoryKey: "salario", type: "income" },
  { phrase: "ferias", categoryKey: "salario", type: "income" },
  { phrase: "reembolso", categoryKey: "reembolso", type: "income" },
  { phrase: "estorno", categoryKey: "reembolso", type: "income" },
  { phrase: "cashback", categoryKey: "reembolso", type: "income" },
  { phrase: "venda", categoryKey: "vendas", type: "income" },
  { phrase: "mercado pago", categoryKey: "vendas", type: "income" },
  { phrase: "freela", categoryKey: "freelance-servicos", type: "income" },
  { phrase: "freelance", categoryKey: "freelance-servicos", type: "income" },
  { phrase: "servico", categoryKey: "freelance-servicos", type: "income" },
  { phrase: "mesada", categoryKey: "outras-receitas", type: "income" },
  { phrase: "pix recebido", categoryKey: "transferencias-recebidas", type: "income" },
  { phrase: "transferencia recebida", categoryKey: "transferencias-recebidas", type: "income" },
  { phrase: "ted recebida", categoryKey: "transferencias-recebidas", type: "income" },
  { phrase: "deposito", categoryKey: "transferencias-recebidas", type: "income" },
  { phrase: "juros sobre capital", categoryKey: "rendimentos", type: "income" },
  { phrase: "dividendos", categoryKey: "rendimentos", type: "income" },
  { phrase: "tesouro direto", categoryKey: "rendimentos", type: "income" },
  { phrase: "xp investimentos", categoryKey: "rendimentos", type: "income" },
  { phrase: "rendimento", categoryKey: "rendimentos", type: "income" },
  { phrase: "investimento", categoryKey: "rendimentos", type: "income" },
  { phrase: "poupanca", categoryKey: "rendimentos", type: "income" },
  { phrase: "resgate", categoryKey: "rendimentos", type: "income" }
];

export const GLOBAL_KEYWORD_CONTEXT = Object.freeze(
  Object.fromEntries(
    GLOBAL_KEYWORD_SEEDS.map((rule) => [normalizeClassificationKeyword(rule.phrase), rule.categoryKey])
  ) as Record<string, GlobalCategoryKey>
);

export const GLOBAL_KEYWORD_RULES = Object.freeze(
  GLOBAL_KEYWORD_SEEDS
    .map((rule) => {
      const phrase = normalizeClassificationKeyword(rule.phrase);
      return {
        ...rule,
        phrase,
        priority: phrase.split(" ").length * 100 + phrase.length
      } satisfies GlobalKeywordRule;
    })
    .sort((left, right) => right.priority - left.priority || right.phrase.length - left.phrase.length)
);

export function matchGlobalKeywordContext(input: {
  description: string;
  notes?: string | null;
  type: "income" | "expense";
}): GlobalKeywordMatch | null {
  const haystack = buildNormalizedBankStatementText(input.description, input.notes ?? null);
  const tokenSet = new Set(tokenizeClassificationText(haystack));

  for (const rule of GLOBAL_KEYWORD_RULES) {
    if (rule.type !== input.type) {
      continue;
    }

    const matched = rule.phrase.includes(" ")
      ? haystack.includes(rule.phrase)
      : tokenSet.has(rule.phrase);

    if (!matched) {
      continue;
    }

    return {
      keyword: rule.phrase,
      categoryKey: rule.categoryKey,
      type: rule.type,
      confidence: 0.98
    };
  }

  return null;
}
