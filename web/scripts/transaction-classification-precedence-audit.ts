import { config as loadEnv } from "dotenv";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), "../.env"), override: false });
loadEnv({ path: resolve(process.cwd(), ".env"), override: false });
process.env.AUTH_SECRET ||= "audit-secret";
process.env.AUTOMATION_CRON_SECRET ||= "audit-cron-secret";

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const { prisma } = await import("@/lib/prisma/client");
  const { resolveTransactionClassification } = await import("@/lib/finance/transaction-classification");

  const plan = await prisma.plan.findFirst({
    where: {
      isActive: true
    },
    select: {
      id: true
    },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
  });

  assertCondition(plan?.id, "Nenhum plano ativo encontrado para criar tenant de auditoria");

  const slug = `classification-audit-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const tenant = await prisma.tenant.create({
    data: {
      name: "Classification Audit",
      slug,
      planId: plan.id,
      trialDays: 0,
      isActive: true
    },
    select: {
      id: true
    }
  });

  const results: string[] = [];

  try {
    const [marketCategory, deliveryCategory, mobilityCategory, bakeryCategory, pharmacyCategory] =
      await Promise.all([
        prisma.category.create({
          data: {
            tenantId: tenant.id,
            name: "Mercado audit",
            type: "expense",
            systemKey: "supermercado",
            keywords: ["mercado", "compra do mes"]
          }
        }),
        prisma.category.create({
          data: {
            tenantId: tenant.id,
            name: "Delivery audit",
            type: "expense",
            systemKey: "delivery",
            keywords: ["delivery"]
          }
        }),
        prisma.category.create({
          data: {
            tenantId: tenant.id,
            name: "Mobilidade audit",
            type: "expense",
            systemKey: "apps-mobilidade",
            keywords: ["corrida"]
          }
        }),
        prisma.category.create({
          data: {
            tenantId: tenant.id,
            name: "Padaria audit",
            type: "expense",
            systemKey: "cafe-padaria",
            keywords: ["aurora", "padaria"]
          }
        }),
        prisma.category.create({
          data: {
            tenantId: tenant.id,
            name: "Farmacia audit",
            type: "expense",
            systemKey: "farmacia",
            keywords: ["remedio"]
          }
        })
      ]);

    await prisma.categoryRule.create({
      data: {
        tenantId: tenant.id,
        categoryId: marketCategory.id,
        type: "expense",
        normalizedKeyword: "ifood",
        matchMode: "exact_phrase",
        source: "manual",
        priority: 1000,
        confidence: 0.99
      }
    });

    await prisma.categoryRule.create({
      data: {
        tenantId: tenant.id,
        categoryId: marketCategory.id,
        type: "expense",
        normalizedKeyword: "uber trip",
        matchMode: "exact_phrase",
        source: "ai_learned",
        priority: 900,
        confidence: 0.91
      }
    });

    await prisma.categoryRule.create({
      data: {
        tenantId: tenant.id,
        categoryId: pharmacyCategory.id,
        type: "expense",
        normalizedKeyword: "aurora",
        matchMode: "exact_phrase",
        source: "ai_learned",
        priority: 900,
        confidence: 0.91
      }
    });

    const manualOverridesGlobal = await resolveTransactionClassification({
      tenantId: tenant.id,
      type: "expense",
      description: "PIX TRANSF PGTO IFOOD SAO PAULO BR",
      paymentMethod: "pix"
    });

    assertCondition(
      manualOverridesGlobal.categoryId === marketCategory.id,
      `Regra manual nao venceu o global: ${JSON.stringify(manualOverridesGlobal)}`
    );
    assertCondition(
      manualOverridesGlobal.classificationSource === "manual_rule",
      `Fonte inesperada para regra manual: ${manualOverridesGlobal.classificationSource}`
    );
    results.push("Regra manual vence o contexto global para 'ifood'");

    const categoryKeywordOverridesAiLearned = await resolveTransactionClassification({
      tenantId: tenant.id,
      type: "expense",
      description: "Aurora 7h",
      paymentMethod: "pix"
    });

    assertCondition(
      categoryKeywordOverridesAiLearned.categoryId === bakeryCategory.id,
      `Keyword da categoria nao venceu ai_learned: ${JSON.stringify(categoryKeywordOverridesAiLearned)}`
    );
    assertCondition(
      categoryKeywordOverridesAiLearned.classificationSource === "category_keyword",
      `Fonte inesperada para keyword da categoria: ${categoryKeywordOverridesAiLearned.classificationSource}`
    );
    results.push("Keyword da categoria vence regra ai_learned para 'Aurora 7h'");

    const aiLearnedOverridesGlobal = await resolveTransactionClassification({
      tenantId: tenant.id,
      type: "expense",
      description: "COMPRA CARTAO 02/04 UBER TRIP SAO PAULO BR",
      paymentMethod: "credit_card"
    });

    assertCondition(
      aiLearnedOverridesGlobal.categoryId === marketCategory.id,
      `Regra ai_learned nao venceu o global: ${JSON.stringify(aiLearnedOverridesGlobal)}`
    );
    assertCondition(
      aiLearnedOverridesGlobal.classificationSource === "ai_learned",
      `Fonte inesperada para ai_learned: ${aiLearnedOverridesGlobal.classificationSource}`
    );
    results.push("Regra ai_learned vence o contexto global para 'uber trip'");

    const untouchedGlobal = await resolveTransactionClassification({
      tenantId: tenant.id,
      type: "expense",
      description: "COMPRA CARTAO 02/04 IFOOD EXTRA BR",
      paymentMethod: "credit_card"
    });

    assertCondition(
      untouchedGlobal.categoryId === marketCategory.id,
      `Regra manual deveria continuar prevalecendo: ${JSON.stringify(untouchedGlobal)}`
    );
    results.push("Tenant continua deterministico com regras repetidas");

    void deliveryCategory;
    void mobilityCategory;
  } finally {
    await prisma.tenant.delete({
      where: {
        id: tenant.id
      }
    });
  }

  console.log("CLASSIFICATION_PRECEDENCE_AUDIT_OK");
  for (const item of results) {
    console.log(`- ${item}`);
  }
}

main().catch((error) => {
  console.error("CLASSIFICATION_PRECEDENCE_AUDIT_FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
