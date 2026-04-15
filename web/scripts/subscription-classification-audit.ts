import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), "../.env"), override: false });
loadEnv({ path: resolve(process.cwd(), ".env"), override: false });

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const { prisma } = await import("../lib/prisma/client");
  const { generateSubscriptionTransaction } = await import("../lib/automation/subscriptions");
  const { ensureDefaultPlans, getDefaultPlanBySlug, applyPlanDefaultsToTenant } = await import(
    "../lib/licensing/default-plans"
  );

  await prisma.$connect();
  await ensureDefaultPlans(prisma);

  const unique = Date.now().toString(36);
  const premiumPlan =
    (await getDefaultPlanBySlug(prisma, "premium-completo")) ??
    (() => {
      throw new Error("Plano premium padrão não encontrado");
    })();
  const tenant = await prisma.tenant.create({
    data: {
      name: `Conta auditoria assinatura ${unique}`,
      slug: `conta-auditoria-assinatura-${unique}`,
      ...applyPlanDefaultsToTenant(premiumPlan),
      isActive: true
    }
  });

  try {
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `subscription-audit-${unique}@savepoint.local`,
        name: "Pessoa Auditoria Assinatura",
        passwordHash: "audit",
        role: "admin",
        isActive: true,
        preferences: {
          create: {
            autoTithe: false
          }
        }
      }
    });

    const account = await prisma.financialAccount.create({
      data: {
        tenantId: tenant.id,
        ownerUserId: user.id,
        name: "Conta Assinatura Audit",
        type: "checking",
        openingBalance: 300,
        currency: "BRL",
        color: "#111111",
        isActive: true
      }
    });

    await prisma.category.createMany({
      data: [
        {
          tenantId: tenant.id,
          name: "Streaming e assinaturas",
          type: "expense",
          color: "#6B7280",
          icon: "tv",
          keywords: ["streaming", "assinatura", "netflix"],
          isDefault: false
        },
        {
          tenantId: tenant.id,
          name: "Supermercado",
          type: "expense",
          color: "#10B981",
          icon: "shopping-cart",
          keywords: ["mercado"],
          isDefault: false
        }
      ]
    });

    const subscription = await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        userId: user.id,
        accountId: account.id,
        name: "Netflix Premium",
        type: "expense",
        amount: 59.9,
        billingDay: 5,
        nextBillingDate: new Date("2026-04-05T12:00:00"),
        isActive: true,
        autoTithe: false
      }
    });

    const result = await generateSubscriptionTransaction(subscription.id, tenant.id, user.id);
    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: {
        id: result.transactionId
      },
      include: {
        category: true
      }
    });
    const refreshedSubscription = await prisma.subscription.findUniqueOrThrow({
      where: {
        id: subscription.id
      },
      include: {
        category: true
      }
    });

    assertCondition(Boolean(transaction.categoryId), "A transação gerada pela assinatura ficou sem categoria");
    assertCondition(
      transaction.category?.name === "Streaming e assinaturas",
      `Categoria inesperada na transação da assinatura: ${transaction.category?.name ?? "sem categoria"}`
    );
    assertCondition(Boolean(refreshedSubscription.categoryId), "A assinatura não persistiu a categoria classificada");

    console.log("SUBSCRIPTION_CLASSIFICATION_AUDIT_OK");
    console.log(
      JSON.stringify(
        {
          transactionCategory: transaction.category?.name,
          aiClassified: transaction.aiClassified,
          subscriptionCategory: refreshedSubscription.category?.name
        },
        null,
        2
      )
    );
  } finally {
    await prisma.tenant.deleteMany({
      where: {
        id: tenant.id
      }
    });
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error("SUBSCRIPTION_CLASSIFICATION_AUDIT_FAILED");
  console.error(error instanceof Error ? error.message : error);
  const { prisma } = await import("../lib/prisma/client");
  await prisma.$disconnect();
  process.exitCode = 1;
});
