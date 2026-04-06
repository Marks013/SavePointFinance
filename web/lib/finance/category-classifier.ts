import type { Category, PaymentMethod } from "@prisma/client";

import { serverEnv } from "@/lib/env/server";
import { dedupeKeywords, getFallbackCategoryName } from "@/lib/finance/default-categories";

type ClassifyTransactionInput = {
  type: "income" | "expense" | "transfer";
  description: string;
  notes?: string | null;
  paymentMethod: PaymentMethod;
  categories: Array<Pick<Category, "id" | "name" | "type" | "keywords">>;
  history?: Array<{
    categoryId: string;
    description: string;
    notes?: string | null;
    aiClassified?: boolean;
    aiConfidence?: number | null;
  }>;
};

type ClassificationResult = {
  categoryId: string | null;
  confidence: number | null;
  aiClassified: boolean;
  reason: string;
};

const contextualAliases: Record<string, string[]> = {
  mercado: ["supermercado", "mercado", "compras mercado", "compras casa"],
  mercadinho: ["supermercado", "mercado"],
  atacado: ["supermercado", "mercado", "atacarejo"],
  atacarejo: ["supermercado", "mercado", "atacado"],
  feira: ["feira", "hortifruti", "frutas", "verduras"],
  hortifruti: ["feira", "hortifruti", "verduras", "frutas"],
  acougue: ["supermercado", "acougue", "carne"],
  açougue: ["supermercado", "acougue", "carne"],
  pao: ["padaria", "pao", "cafe", "café"],
  pão: ["padaria", "pao", "cafe", "café"],
  paozinho: ["padaria", "pao", "cafe", "café"],
  padoca: ["padaria", "pao", "cafe", "café"],
  leite: ["supermercado", "mercado", "compras casa"],
  arroz: ["supermercado", "mercado", "compras casa"],
  feijao: ["supermercado", "mercado", "compras casa"],
  feijão: ["supermercado", "mercado", "compras casa"],
  macarrao: ["supermercado", "mercado", "compras casa"],
  macarrão: ["supermercado", "mercado", "compras casa"],
  carne: ["supermercado", "acougue", "mercado"],
  frango: ["supermercado", "acougue", "mercado"],
  ovo: ["supermercado", "mercado", "compras casa"],
  queijo: ["supermercado", "mercado", "compras casa"],
  presunto: ["supermercado", "mercado", "compras casa"],
  manteiga: ["supermercado", "mercado", "compras casa"],
  iogurte: ["supermercado", "mercado", "compras casa"],
  bolacha: ["supermercado", "mercado", "compras casa"],
  biscoito: ["supermercado", "mercado", "compras casa"],
  fruta: ["feira", "hortifruti", "frutas"],
  frutas: ["feira", "hortifruti", "frutas"],
  verdura: ["feira", "hortifruti", "verduras"],
  verduras: ["feira", "hortifruti", "verduras"],
  legume: ["feira", "hortifruti", "verduras"],
  legumes: ["feira", "hortifruti", "verduras"],
  cafe: ["padaria", "cafeteria", "cafe"],
  café: ["padaria", "cafeteria", "café"],
  salgado: ["padaria", "cafeteria", "cafe"],
  bolo: ["padaria", "cafeteria", "cafe"],
  torta: ["padaria", "cafeteria", "cafe"],
  lanche: ["restaurante", "lanchonete", "refeicao"],
  marmita: ["restaurante", "almoco", "refeicao"],
  marmitex: ["restaurante", "almoco", "refeicao"],
  pizza: ["restaurante", "jantar", "refeicao"],
  pastel: ["restaurante", "lanche", "refeicao"],
  remedio: ["farmacia", "remedio", "medicamento"],
  remédio: ["farmacia", "remedio", "medicamento"],
  remedinho: ["farmacia", "remedio", "medicamento"],
  dipirona: ["farmacia", "remedio", "medicamento"],
  ibuprofeno: ["farmacia", "remedio", "medicamento"],
  paracetamol: ["farmacia", "remedio", "medicamento"],
  vitamina: ["farmacia", "medicamento", "suplemento"],
  farmacia: ["farmacia", "drogaria", "medicamento"],
  farmácia: ["farmacia", "drogaria", "medicamento"],
  drogaria: ["farmacia", "drogaria", "medicamento"],
  medico: ["saude", "consulta", "medico"],
  médico: ["saude", "consulta", "medico"],
  exame: ["saude", "consulta", "medico"],
  dentista: ["saude", "consulta", "medico"],
  clinica: ["saude", "consulta", "medico"],
  clínica: ["saude", "consulta", "medico"],
  uber: ["uber", "corrida", "mobilidade"],
  99: ["99", "corrida", "mobilidade"],
  taxi: ["uber", "corrida", "mobilidade"],
  táxi: ["uber", "corrida", "mobilidade"],
  pedagio: ["transporte", "pedagio", "estacionamento"],
  pedágio: ["transporte", "pedagio", "estacionamento"],
  estacionamento: ["transporte", "pedagio", "estacionamento"],
  onibus: ["transporte", "onibus", "passagem"],
  ônibus: ["transporte", "onibus", "passagem"],
  metro: ["transporte", "metro", "passagem"],
  metrô: ["transporte", "metro", "passagem"],
  ifood: ["delivery", "ifood", "comida"],
  rappi: ["delivery", "rappi", "comida"],
  almoço: ["restaurante", "almoco", "refeicao"],
  almoco: ["restaurante", "almoco", "refeicao"],
  jantar: ["restaurante", "jantar", "refeicao"],
  combustivel: ["posto", "gasolina", "combustivel"],
  combustível: ["posto", "gasolina", "combustivel"],
  gasolina: ["posto", "gasolina", "combustivel"],
  etanol: ["posto", "gasolina", "combustivel"],
  diesel: ["posto", "gasolina", "combustivel"],
  luz: ["energia", "conta luz"],
  energia: ["energia", "conta luz"],
  agua: ["agua", "saneamento", "conta agua"],
  água: ["agua", "saneamento", "conta agua"],
  saneamento: ["agua", "saneamento", "conta agua"],
  internet: ["internet", "telefone", "banda larga"],
  telefone: ["internet", "telefone", "banda larga"],
  celular: ["internet", "telefone", "banda larga"],
  recarga: ["internet", "telefone", "banda larga"],
  aluguel: ["aluguel", "moradia"],
  financiamento: ["moradia", "financiamento habitacional", "financiamento imobiliario", "prestacao casa"],
  habitacional: ["moradia", "financiamento habitacional", "credito habitacional"],
  imobiliario: ["moradia", "financiamento imobiliario", "credito habitacional"],
  imovel: ["moradia", "prestacao casa", "financiamento imobiliario"],
  apartamento: ["moradia", "prestacao casa", "financiamento imobiliario"],
  casa: ["moradia", "prestacao casa", "financiamento habitacional"],
  hipoteca: ["moradia", "credito habitacional", "financiamento imobiliario"],
  consorcio: ["moradia", "consorcio imobiliario", "financiamento imobiliario"],
  condominio: ["condominio", "moradia"],
  condomínio: ["condominio", "moradia"],
  gas: ["moradia", "gas cozinha", "botijao"],
  gás: ["moradia", "gas cozinha", "botijao"],
  botijao: ["moradia", "gas cozinha", "botijao"],
  botijão: ["moradia", "gas cozinha", "botijao"],
  ultragaz: ["moradia", "gas cozinha", "botijao"],
  netflix: ["streaming", "assinatura"],
  spotify: ["streaming", "assinatura"],
  deezer: ["streaming", "assinatura"],
  prime: ["streaming", "assinatura"],
  youtube: ["streaming", "assinatura"],
  crunchyroll: ["streaming", "assinatura"],
  disney: ["streaming", "assinatura"],
  globoplay: ["streaming", "assinatura"],
  telecine: ["streaming", "assinatura"],
  premiere: ["streaming", "assinatura"],
  paramount: ["streaming", "assinatura"],
  "paramount+": ["streaming", "assinatura"],
  "apple tv": ["streaming", "assinatura"],
  max: ["streaming", "assinatura"],
  salario: ["salario", "folha", "pagamento"],
  salário: ["salario", "folha", "pagamento"],
  freela: ["freelance", "servico", "cliente"],
  freelance: ["freelance", "servico", "cliente"],
  servico: ["freelance", "servico", "cliente"],
  serviço: ["freelance", "servico", "cliente"],
  cliente: ["freelance", "servico", "cliente"],
  livro: ["educacao", "curso", "material escolar"],
  apostila: ["educacao", "curso", "material escolar"],
  mensalidade: ["educacao", "curso", "material escolar"],
  racao: ["pets", "petshop", "veterinario"],
  ração: ["pets", "petshop", "veterinario"],
  veterinario: ["pets", "petshop", "veterinario"],
  veterinário: ["pets", "petshop", "veterinario"],
  petshop: ["pets", "petshop", "veterinario"],
  roupa: ["vestuario", "roupa", "calcado"],
  calcado: ["vestuario", "roupa", "calcado"],
  calçado: ["vestuario", "roupa", "calcado"],
  viagem: ["viagem", "hotel", "passagem"]
};

const merchantSignals: Array<{ terms: string[]; category: string; boost?: number }> = [
  { terms: ["drogasil", "droga raia", "pague menos", "panvel", "pacheco", "drogaria sao paulo", "ultrafarma", "farmelhor"], category: "Farmácia", boost: 12 },
  { terms: ["assai", "atacadao", "carrefour", "pao de acucar", "sonda", "savegnago", "guanabara", "verdemar", "dia", "extra", "st marche", "mateus", "super nosso", "coop"], category: "Supermercado", boost: 12 },
  { terms: ["swift", "minerva", "friboi"], category: "Supermercado", boost: 10 },
  { terms: ["hortifruti", "ceasa", "quitanda", "sacolao", "oba hortifruti", "feira livre"], category: "Feira e hortifruti", boost: 11 },
  { terms: ["ifood", "rappi", "aiqfome", "ze delivery", "delivery much"], category: "Delivery", boost: 12 },
  { terms: ["outback", "madero", "habibs", "giraffas", "subway", "mcdonalds", "burger king", "coco bambu", "jeronimo", "parmegiana factory", "spoleto"], category: "Restaurantes", boost: 11 },
  { terms: ["starbucks", "casa bauducco", "cafeteria", "padaria", "havanna", "kopenhagen", "cacau show"], category: "Café e padaria", boost: 10 },
  { terms: ["shell", "ipiranga", "petrobras", "texaco", "ale", "petronas"], category: "Combustível", boost: 12 },
  { terms: ["uber", "99app", "99", "cabify", "indrive"], category: "Apps de mobilidade", boost: 11 },
  { terms: ["enel", "cpfl", "cemig", "neoenergia", "equatorial"], category: "Energia elétrica", boost: 12 },
  { terms: ["sabesp", "copasa", "sanepar", "caesb", "embasa"], category: "Água e saneamento", boost: 12 },
  { terms: ["tim", "vivo", "claro", "oi", "algar", "brisanet"], category: "Internet e telefonia", boost: 10 },
  { terms: ["fleury", "pardini", "delboni", "lavoisier", "dr consulta"], category: "Saúde", boost: 12 },
  { terms: ["unimed", "amil", "hapvida", "bradesco saude", "sulamerica"], category: "Saúde", boost: 12 },
  { terms: ["netflix", "spotify", "globoplay", "disney", "disney plus", "disney+", "youtube premium", "youtube", "prime video", "amazon prime", "hbo", "hbo max", "max", "deezer", "apple tv", "apple tv+", "crunchyroll", "paramount", "paramount+", "telecine", "premiere", "star+", "star plus", "mubi"], category: "Streaming e assinaturas", boost: 12 },
  { terms: ["mercado livre", "amazon", "shopee", "magalu", "americanas", "aliexpress", "shein", "kabum", "madeiramadeira", "netshoes", "dafiti"], category: "Compras online", boost: 11 },
  { terms: ["renner", "riachuelo", "zara", "nike", "adidas", "hering", "centauro", "cea", "c&a", "youcom"], category: "Vestuário", boost: 10 },
  { terms: ["petz", "cobasi", "petlove"], category: "Pets", boost: 11 },
  { terms: ["ultragaz", "nacional gas", "supergasbras"], category: "Moradia", boost: 11 },
  { terms: ["latam", "gol", "azul", "booking", "airbnb"], category: "Viagem", boost: 12 },
  { terms: ["udemy", "alura", "senac", "senai", "kumon"], category: "Educação", boost: 10 }
];

const semanticSignals: Array<{ terms: string[]; category: string; boost?: number }> = [
  {
    terms: [
      "financiamento de casa",
      "financiamento da casa",
      "financiamento do apartamento",
      "financiamento habitacional",
      "financiamento imobiliario",
      "credito habitacional",
      "prestacao da casa",
      "prestacao do apartamento",
      "parcela da casa",
      "consorcio imobiliario"
    ],
    category: "Moradia",
    boost: 14
  }
];

const merchantSignalsByCategory = new Map<string, Array<{ terms: string[]; boost?: number }>>();
for (const signal of merchantSignals) {
  const current = merchantSignalsByCategory.get(signal.category) ?? [];
  current.push({
    terms: signal.terms,
    boost: signal.boost
  });
  merchantSignalsByCategory.set(signal.category, current);
}

const semanticSignalsByCategory = new Map<string, Array<{ terms: string[]; boost?: number }>>();
for (const signal of semanticSignals) {
  const current = semanticSignalsByCategory.get(signal.category) ?? [];
  current.push({
    terms: signal.terms.map((term) => normalizeText(term)),
    boost: signal.boost
  });
  semanticSignalsByCategory.set(signal.category, current);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function expandContext(tokens: string[]) {
  const expanded = new Set(tokens);

  for (const token of tokens) {
    const aliases = contextualAliases[token];
    if (!aliases) {
      continue;
    }

    for (const alias of aliases) {
      const normalizedAlias = normalizeText(alias);
      if (normalizedAlias) {
        expanded.add(normalizedAlias);
      }
    }
  }

  return Array.from(expanded);
}

function hasNormalizedTerm(haystack: string, term: string, contextSet: Set<string>) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) {
    return false;
  }

  if (normalizedTerm.includes(" ")) {
    return haystack.includes(normalizedTerm);
  }

  return contextSet.has(normalizedTerm);
}

function scoreCategory(
  category: Pick<Category, "id" | "name" | "keywords">,
  haystack: string,
  tokens: string[],
  paymentMethod: PaymentMethod,
  history: ClassifyTransactionInput["history"]
) {
  let score = 0;
  const matchedKeywords: string[] = [];
  const normalizedName = normalizeText(category.name);
  const contextSet = new Set(tokens);

  if (normalizedName && haystack === normalizedName) {
    score += 20;
    matchedKeywords.push("nome exato");
  } else if (normalizedName && haystack.includes(normalizedName)) {
    score += normalizedName.includes(" ") ? 10 : 8;
    matchedKeywords.push("nome da categoria");
  }

  for (const keyword of dedupeKeywords(category.keywords)) {
    if (!keyword) {
      continue;
    }

    if (haystack.includes(keyword)) {
      const exactToken = contextSet.has(keyword);
      score += exactToken ? 8 : keyword.includes(" ") ? 7 : 5;
      matchedKeywords.push(keyword);
      continue;
    }

    const keywordParts = keyword.split(" ").filter(Boolean);
    const partialHits = keywordParts.filter((part) => contextSet.has(part));
    if (partialHits.length && partialHits.length === keywordParts.length) {
      score += keyword.includes(" ") ? 5 : 4;
      matchedKeywords.push(keyword);
    }
  }

  for (const piece of normalizedName.split(" ")) {
    if (piece.length < 3) {
      continue;
    }

    if (contextSet.has(piece)) {
      score += 2;
    }
  }

  if (paymentMethod === "credit_card" && /streaming|assinaturas/.test(normalizedName)) {
    score += 1;
  }

  const merchantBoost = (merchantSignalsByCategory.get(category.name) ?? [])
    .reduce((sum, signal) => {
      return sum + (signal.terms.some((term) => hasNormalizedTerm(haystack, term, contextSet)) ? signal.boost ?? 10 : 0);
    }, 0);
  if (merchantBoost > 0) {
    score += merchantBoost;
    matchedKeywords.push("estabelecimento");
  }

  const semanticBoost = (semanticSignalsByCategory.get(category.name) ?? [])
    .reduce((sum, signal) => {
      return sum + (signal.terms.some((term) => haystack.includes(term)) ? signal.boost ?? 10 : 0);
    }, 0);
  if (semanticBoost > 0) {
    score += semanticBoost;
    matchedKeywords.push("contexto semantico");
  }

  const normalizedDescription = haystack;
  const historyContextSet = new Set(tokens);
  const historyBoost = (history ?? []).reduce((sum, item) => {
    if (item.categoryId !== category.id) {
      return sum;
    }

    if (item.aiClassified) {
      return sum;
    }

    const historyText = normalizeText(`${item.description} ${item.notes ?? ""}`);
    const historyTokens = new Set(expandContext(tokenize(`${item.description} ${item.notes ?? ""}`)));

    if (historyText === normalizedDescription) {
      matchedKeywords.push("histórico exato");
      return sum + 14;
    }

    let overlap = 0;
    for (const token of historyContextSet) {
      if (historyTokens.has(token)) {
        overlap += 1;
      }
    }

    if (overlap >= 3) {
      matchedKeywords.push("histórico semelhante");
      return sum + Math.min(10, overlap * 2);
    }

    return sum;
  }, 0);

  score += historyBoost;

  return {
    score,
    matchedKeywords
  };
}

function mapAiCategoryName(
  categories: Array<Pick<Category, "id" | "name" | "type">>,
  label: string
) {
  const normalizedLabel = normalizeText(label);
  return categories.find((item) => normalizeText(item.name) === normalizedLabel) ?? null;
}

function extractGeminiText(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates)) {
    return null;
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const content = (candidate as { content?: unknown }).content;
    if (!content || typeof content !== "object") {
      continue;
    }

    const parts = (content as { parts?: unknown }).parts;
    if (!Array.isArray(parts)) {
      continue;
    }

    for (const part of parts) {
      if (!part || typeof part !== "object") {
        continue;
      }

      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) {
        return text.trim();
      }
    }
  }

  return null;
}

async function refineWithGemini(
  input: ClassifyTransactionInput,
  candidates: Array<{ id: string; name: string; score: number }>
) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const baseUrl =
    process.env.GEMINI_BASE_URL ||
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const candidateText = candidates
    .map((item) => {
      const category = input.categories.find((categoryItem) => categoryItem.id === item.id);
      const keywords = dedupeKeywords(category?.keywords ?? []).slice(0, 8);
      return `- ${item.name} | sinais: ${keywords.length ? keywords.join(", ") : "sem palavras-chave"} | score inicial: ${item.score}`;
    })
    .join("\n");
  const historyText = (input.history ?? [])
    .filter((item) => !item.aiClassified)
    .slice(0, 6)
    .map((item) => {
      const categoryName =
        input.categories.find((category) => category.id === item.categoryId)?.name ?? item.categoryId;
      return `- ${item.description}${item.notes ? ` | obs: ${item.notes}` : ""} => ${categoryName}`;
    })
    .join("\n");
  const candidateNames = candidates.map((item) => item.name);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);

  try {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: [
                  "Você é um classificador de lançamentos financeiros de um app brasileiro de finanças pessoais.",
                  "Escolha exatamente uma categoria já existente para o lançamento informado.",
                  "Nunca invente categoria, nunca responda texto fora do JSON e nunca explique além dos campos pedidos.",
                  "",
                  "Regras obrigatórias:",
                  "1. Escolha somente entre as categorias fornecidas.",
                  "2. Considere português do Brasil, com e sem acento, maiúsculas/minúsculas e nomes abreviados.",
                  "3. Priorize nesta ordem: estabelecimento/marca, item ou serviço comprado, contexto semântico, histórico manual da carteira e forma de pagamento apenas como desempate.",
                  "4. Se a descrição sugerir assinatura, streaming, mercado, farmácia, padaria, transporte, combustível ou contas da casa, use o contexto do gasto real e não palavras genéricas.",
                  "5. Se houver duas opções parecidas, escolha a mais específica para o consumo descrito.",
                  "6. A confiança deve ficar entre 0.51 e 0.98.",
                  "",
                  "Saída obrigatória em JSON válido:",
                  '{"category":"nome exato da categoria","confidence":0.78,"rationale":"motivo curto e objetivo"}',
                  "",
                  `Tipo do lançamento: ${input.type}`,
                  `Descrição: ${input.description}`,
                  `Observações: ${input.notes ?? "sem observações"}`,
                  `Forma de pagamento: ${input.paymentMethod}`,
                  "",
                  "Categorias candidatas:",
                  candidateText,
                  "",
                  "Histórico manual relevante da carteira:",
                  historyText || "- sem histórico manual relevante"
                ].join("\n")
              }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: {
            type: "object",
            properties: {
              category: {
                type: "string",
                enum: candidateNames
              },
              confidence: {
                type: "number"
              },
              rationale: {
                type: "string"
              }
            },
            required: ["category", "confidence", "rationale"]
          }
        }
      })
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const text = extractGeminiText(payload);

    if (!text) {
      return null;
    }

    const parsed = JSON.parse(text) as {
      category?: string;
      confidence?: number;
      rationale?: string;
    };

    if (!parsed.category) {
      return null;
    }

    const mapped = mapAiCategoryName(input.categories, parsed.category);
    if (!mapped) {
      return null;
    }

    return {
      categoryId: mapped.id,
      confidence: Math.max(0, Math.min(Number(parsed.confidence ?? 0.5), 0.99)),
      aiClassified: true,
      reason: parsed.rationale?.trim() || "Classificação contextual por IA"
    } satisfies ClassificationResult;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

export async function classifyTransactionCategory(
  input: ClassifyTransactionInput
): Promise<ClassificationResult> {
  if (input.type === "transfer") {
    return {
      categoryId: null,
      confidence: null,
      aiClassified: false,
      reason: "Transferências não usam categoria"
    };
  }

  const typedType = input.type;
  const typedCategories = input.categories.filter((item) => item.type === typedType);
  if (!typedCategories.length) {
    return {
      categoryId: null,
      confidence: null,
      aiClassified: false,
      reason: "Sem categorias disponíveis"
    };
  }

  const haystack = normalizeText(`${input.description} ${input.notes ?? ""}`);
  const tokens = expandContext(tokenize(`${input.description} ${input.notes ?? ""}`));
  const ranked = typedCategories
    .map((category) => ({
      id: category.id,
      name: category.name,
      ...scoreCategory(category, haystack, tokens, input.paymentMethod, input.history)
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const second = ranked[1];

  if (best && best.matchedKeywords.includes("contexto semantico") && best.score >= 4) {
    return {
      categoryId: best.id,
      confidence: Math.min(0.92, 0.52 + best.score / 24),
      aiClassified: false,
      reason: "Correspondencia semantica forte"
    };
  }

  if (best && best.score >= 6 && best.score >= (second?.score ?? 0) + 2) {
    return {
      categoryId: best.id,
      confidence: Math.min(0.94, 0.46 + best.score / 20),
      aiClassified: false,
      reason: best.matchedKeywords.length
        ? `Correspondência com ${best.matchedKeywords.slice(0, 3).join(", ")}`
        : "Correspondência contextual"
    };
  }

  const fallback = typedCategories.find((item) => item.name === getFallbackCategoryName(typedType));
  const aiResult =
    serverEnv.GEMINI_ENABLED === "true"
      ? await refineWithGemini(
          input,
          ranked.slice(0, 8).map((item) => ({ id: item.id, name: item.name, score: item.score }))
        )
      : null;

  if (aiResult) {
    return aiResult;
  }

  return {
    categoryId: fallback?.id ?? best?.id ?? null,
    confidence: best?.score ? Math.min(0.68, 0.32 + best.score / 28) : 0.24,
    aiClassified: false,
    reason: best?.score ? "Classificação aproximada por contexto" : "Categoria padrão aplicada"
  };
}
