import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

import { PaymentMethod, Prisma, TransactionSource, TransactionType } from "@prisma/client";

loadEnv({ path: resolve(process.cwd(), "../.env"), override: false });
loadEnv({ path: resolve(process.cwd(), ".env"), override: false });
process.env.DATABASE_URL ||= "postgresql://audit:auditoria@localhost:5432/audit";

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const { prisma } = await import("../lib/prisma/client");
  const { buildCardBillingSnapshot, buildCardBillingSnapshotForDate, getCardStatementSnapshot, getNextPayableStatementSnapshot } = await import("../lib/cards/statement");
  const { ensureTenantCardStatementSnapshots } = await import("../lib/cards/snapshot-sync");
  const { deriveStatementMonthAnchor } = await import("../features/cards/schemas/card-schema");

  const earlyClosingCard = {
    closeDay: 3,
    dueDay: 10,
    statementMonthAnchor: deriveStatementMonthAnchor(3, 10)
  };
  const earlyBeforeClose = buildCardBillingSnapshot(earlyClosingCard, new Date(2026, 3, 2, 12, 0, 0, 0));
  const earlyOnClose = buildCardBillingSnapshot(earlyClosingCard, new Date(2026, 3, 3, 12, 0, 0, 0));
  assertCondition(earlyClosingCard.statementMonthAnchor === "previous_month", "Fechamento antes do vencimento deve usar mes anterior");
  assertCondition(earlyBeforeClose.competence === "2026-03", `Compra antes do fechamento deveria ir para 2026-03: ${earlyBeforeClose.competence}`);
  assertCondition(earlyBeforeClose.dueDate.toISOString().slice(0, 10) === "2026-04-10", "Vencimento da fatura anterior incorreto");
  assertCondition(earlyOnClose.competence === "2026-04", `Compra no dia do fechamento deveria ir para 2026-04: ${earlyOnClose.competence}`);

  const lateClosingCard = {
    closeDay: 24,
    dueDay: 8,
    statementMonthAnchor: deriveStatementMonthAnchor(24, 8)
  };
  const lateBeforeClose = buildCardBillingSnapshot(lateClosingCard, new Date(2026, 2, 20, 12, 0, 0, 0));
  const lateOnClose = buildCardBillingSnapshot(lateClosingCard, new Date(2026, 2, 24, 12, 0, 0, 0));
  assertCondition(lateClosingCard.statementMonthAnchor === "close_month", "Fechamento depois do vencimento deve usar mes do fechamento");
  assertCondition(lateBeforeClose.competence === "2026-03", `Compra antes do fechamento deveria ir para 2026-03: ${lateBeforeClose.competence}`);
  assertCondition(lateBeforeClose.dueDate.toISOString().slice(0, 10) === "2026-04-08", "Vencimento da fatura com fechamento tardio incorreto");
  assertCondition(lateOnClose.competence === "2026-04", `Compra no dia do fechamento deveria ir para 2026-04: ${lateOnClose.competence}`);

  const cycleClient = {
    cardStatementCycle: {
      findFirst: async () => ({
        month: "2026-05",
        closeDate: new Date(2026, 4, 26, 12, 0, 0, 0),
        dueDate: new Date(2026, 5, 8, 12, 0, 0, 0)
      }),
      findUnique: async ({ where }: { where: { tenantId_cardId_month: { month: string } } }) =>
        where.tenantId_cardId_month.month === "2026-05"
          ? {
              month: "2026-05",
              closeDate: new Date(2026, 4, 26, 12, 0, 0, 0),
              dueDate: new Date(2026, 5, 8, 12, 0, 0, 0)
            }
          : null
    },
    statementPayment: {},
    transaction: {}
  };
  const mayCyclePurchase = await buildCardBillingSnapshotForDate({
    tenantId: "tenant-audit",
    card: { id: "card-audit", ...lateClosingCard },
    referenceDate: new Date(2026, 4, 25, 12, 0, 0, 0),
    client: cycleClient as never
  });
  assertCondition(mayCyclePurchase.competence === "2026-05", "Compra em 25/05 deveria respeitar fechamento real em 26/05");
  assertCondition(mayCyclePurchase.dueDate.toISOString().slice(0, 10) === "2026-06-08", "Vencimento real de junho nao foi aplicado");

  const plan = await prisma.plan.findFirst({
    where: {
      isActive: true
    },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }]
  });
  assertCondition(plan, "Nenhum plano ativo encontrado para auditoria de fatura");

  const unique = Date.now().toString(36);
  const tenant = await prisma.tenant.create({
    data: {
      name: `Conta auditoria cartao ${unique}`,
      slug: `conta-auditoria-cartao-${unique}`,
      planId: plan.id,
      isActive: true,
      expiresAt: null
    }
  });

  try {
    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `card-smoke-${unique}@savepoint.local`,
        name: "Pessoa Auditoria Cartao",
        passwordHash: "audit",
        role: "admin",
        isActive: true
      }
    });

    const account = await prisma.financialAccount.create({
      data: {
        tenantId: tenant.id,
        ownerUserId: user.id,
        name: `Conta smoke ${unique}`,
        type: "checking",
        openingBalance: new Prisma.Decimal("2000.00"),
        color: "#10B981"
      }
    });

    const card = await prisma.card.create({
      data: {
        tenantId: tenant.id,
        ownerUserId: user.id,
        name: `Cartao smoke ${unique}`,
        brand: "Visa",
        limitAmount: new Prisma.Decimal("5000.00"),
        dueDay: 8,
        closeDay: 24,
        color: "#374151"
      }
    });

    await prisma.transaction.createMany({
      data: [
        {
          tenantId: tenant.id,
          userId: user.id,
          cardId: card.id,
          date: new Date(2026, 2, 20, 12, 0, 0, 0),
          amount: new Prisma.Decimal("100.00"),
          description: "Compra smoke anterior ao fechamento",
          type: TransactionType.expense,
          source: TransactionSource.manual,
          paymentMethod: PaymentMethod.credit_card
        },
        {
          tenantId: tenant.id,
          userId: user.id,
          cardId: card.id,
          date: new Date(2026, 2, 25, 12, 0, 0, 0),
          amount: new Prisma.Decimal("50.00"),
          description: "Compra smoke apos fechamento",
          type: TransactionType.expense,
          source: TransactionSource.manual,
          paymentMethod: PaymentMethod.credit_card
        }
      ]
    });
    await ensureTenantCardStatementSnapshots(tenant.id, prisma);

    const marchStatement = await getCardStatementSnapshot({
      tenantId: tenant.id,
      card,
      month: "2026-03",
      client: prisma
    });
    assertCondition(Math.abs(marchStatement.totalAmount - 100) < 0.0001, `Total da fatura de março incorreto: ${marchStatement.totalAmount}`);
    assertCondition(
      Math.abs(marchStatement.statementOutstandingAmount - 100) < 0.0001,
      `Saldo em aberto da fatura de março incorreto: ${marchStatement.statementOutstandingAmount}`
    );

    const payableBeforePayment = await getNextPayableStatementSnapshot({
      tenantId: tenant.id,
      card,
      referenceDate: new Date(2026, 3, 2, 12, 0, 0, 0),
      client: prisma
    });
    assertCondition(payableBeforePayment.month === "2026-03", `Competência pagável antes do pagamento incorreta: ${payableBeforePayment.month}`);
    assertCondition(
      Math.abs(payableBeforePayment.statementOutstandingAmount - 100) < 0.0001,
      `Valor pagável antes do pagamento incorreto: ${payableBeforePayment.statementOutstandingAmount}`
    );

    await prisma.statementPayment.create({
      data: {
        tenantId: tenant.id,
        cardId: card.id,
        accountId: account.id,
        month: "2026-03",
        amount: new Prisma.Decimal("100.00"),
        paidAt: new Date(2026, 3, 5, 12, 0, 0, 0)
      }
    });

    const marchStatementAfterPayment = await getCardStatementSnapshot({
      tenantId: tenant.id,
      card,
      month: "2026-03",
      client: prisma
    });
    assertCondition(
      Math.abs(marchStatementAfterPayment.statementOutstandingAmount) < 0.0001,
      `Fatura paga deveria zerar o saldo da competência: ${marchStatementAfterPayment.statementOutstandingAmount}`
    );

    const payableAfterPayment = await getNextPayableStatementSnapshot({
      tenantId: tenant.id,
      card,
      referenceDate: new Date(2026, 3, 6, 12, 0, 0, 0),
      client: prisma
    });
    assertCondition(payableAfterPayment.month === "2026-04", `Próxima competência pagável incorreta: ${payableAfterPayment.month}`);
    assertCondition(
      Math.abs(payableAfterPayment.statementOutstandingAmount - 50) < 0.0001,
      `Valor da próxima competência pagável incorreto: ${payableAfterPayment.statementOutstandingAmount}`
    );

    console.log("Card statement smoke audit OK");
  } finally {
    await prisma.tenant.delete({
      where: {
        id: tenant.id
      }
    });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Card statement smoke audit failed");
  console.error(error);
  process.exitCode = 1;
});
