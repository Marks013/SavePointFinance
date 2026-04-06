import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

import { PaymentMethod } from "@prisma/client";

loadEnv({ path: resolve(process.cwd(), "../.env"), override: false });
loadEnv({ path: resolve(process.cwd(), ".env"), override: false });

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const { classifyTransactionCategory } = await import("@/lib/finance/category-classifier");
  const expenseCategories = [
    {
      id: "cat-supermercado",
      name: "Supermercado",
      type: "expense" as const,
      keywords: ["supermercado", "mercado", "compras casa", "atacado"]
    },
    {
      id: "cat-farmacia",
      name: "Farmácia",
      type: "expense" as const,
      keywords: ["farmacia", "drogaria", "remedio", "medicamento"]
    },
    {
      id: "cat-padaria",
      name: "Café e padaria",
      type: "expense" as const,
      keywords: ["padaria", "pao", "cafe", "cafeteria"]
    }
  ];

  const results: string[] = [];

  const breadCase = await classifyTransactionCategory({
    type: "expense",
    description: "Pão francês",
    paymentMethod: PaymentMethod.pix,
    categories: expenseCategories
  });
  assertCondition(breadCase.categoryId === "cat-padaria", "Pão não caiu em Café e padaria");
  assertCondition(breadCase.aiClassified === false, "Pão não deveria depender de IA");
  results.push("Vocabulário básico classifica 'Pão francês' como Café e padaria");

  const medicineCase = await classifyTransactionCategory({
    type: "expense",
    description: "Remédio dipirona",
    paymentMethod: PaymentMethod.pix,
    categories: expenseCategories
  });
  assertCondition(medicineCase.categoryId === "cat-farmacia", "Remédio não caiu em Farmácia");
  assertCondition(medicineCase.aiClassified === false, "Remédio não deveria depender de IA");
  results.push("Vocabulário básico classifica 'Remédio dipirona' como Farmácia");

  const marketCase = await classifyTransactionCategory({
    type: "expense",
    description: "Compra do mês no Atacadão",
    paymentMethod: PaymentMethod.debit_card,
    categories: expenseCategories
  });
  assertCondition(marketCase.categoryId === "cat-supermercado", "Atacadão não caiu em Supermercado");
  assertCondition(marketCase.aiClassified === false, "Atacadão não deveria depender de IA");
  results.push("Sinais de estabelecimento classificam Atacadão como Supermercado");

  const memoryCase = await classifyTransactionCategory({
    type: "expense",
    description: "Aurora 7h",
    paymentMethod: PaymentMethod.pix,
    categories: expenseCategories,
    history: [
      {
        categoryId: "cat-padaria",
        description: "Aurora 7h",
        notes: null,
        aiClassified: false,
        aiConfidence: null
      }
    ]
  });
  assertCondition(memoryCase.categoryId === "cat-padaria", "Memória local não reforçou a categoria esperada");
  assertCondition(memoryCase.aiClassified === false, "Memória local não deveria marcar classificação por IA");
  assertCondition(/histórico/i.test(memoryCase.reason), "Classificação por memória não registrou motivo de histórico");
  results.push("Memória local reforça descrições parecidas já classificadas manualmente");

  const geminiEnabled = process.env.GEMINI_ENABLED === "true";
  const geminiKeyPresent = Boolean(process.env.GEMINI_API_KEY?.trim());

  if (geminiEnabled && geminiKeyPresent) {
    const genericCategories = [
      { id: "generic-house", name: "Compras domésticas", type: "expense" as const, keywords: [] as string[] },
      { id: "generic-health", name: "Saúde cotidiana", type: "expense" as const, keywords: [] as string[] },
      { id: "generic-streaming", name: "Assinaturas digitais", type: "expense" as const, keywords: [] as string[] }
    ];

    const aiCases = await Promise.all([
      classifyTransactionCategory({
        type: "expense",
        description: "renovação disney plus anual",
        paymentMethod: PaymentMethod.credit_card,
        categories: genericCategories
      }),
      classifyTransactionCategory({
        type: "expense",
        description: "dipirona da madrugada",
        paymentMethod: PaymentMethod.pix,
        categories: genericCategories
      }),
      classifyTransactionCategory({
        type: "expense",
        description: "compra do mês no atacadão",
        paymentMethod: PaymentMethod.debit_card,
        categories: genericCategories
      })
    ]);

    const aiHits = aiCases.filter((item) => item.aiClassified);
    assertCondition(
      aiHits.length >= 1,
      `Gemini não retornou nenhuma classificação marcada como IA: ${JSON.stringify(aiCases)}`
    );
    assertCondition(
      aiCases.every((item) => item.categoryId),
      "Uma ou mais classificações com IA ficaram sem categoria de destino"
    );
    results.push(`IA Gemini respondeu com classificação contextual em ${aiHits.length}/3 cenários genéricos`);
  } else {
    results.push("IA Gemini não foi auditada em runtime porque GEMINI_ENABLED/GEMINI_API_KEY não estão ativos");
  }

  console.log("CATEGORY_AUDIT_OK");
  for (const item of results) {
    console.log(`- ${item}`);
  }
}

main().catch((error) => {
  console.error("CATEGORY_AUDIT_FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
