import { Prisma, Transaction, TransactionSource } from "@prisma/client";
import { NextResponse } from "next/server";

import { format } from "date-fns";
import { syncDueSubscriptionTransactions } from "@/lib/automation/subscriptions";
import { requireSessionUser } from "@/lib/auth/session";
import { revalidateFinanceReports } from "@/lib/cache/finance-read-models";
import { buildCardBillingSnapshotForDate } from "@/lib/cards/statement";
import { BenefitWalletRuleError, validateBenefitWalletTransaction } from "@/lib/finance/benefit-wallet";
import { FOOD_BENEFIT_CATEGORY_SYSTEM_KEYS } from "@/lib/finance/benefit-wallet-rules";
import { ensureTenantCardStatementSnapshots } from "@/lib/cards/snapshot-sync";
import { resolveTransactionClassification } from "@/lib/finance/transaction-classification";
import { assertTenantTransactionReferences, TenantReferenceError } from "@/lib/finance/tenant-reference-guard";
import { ensureTitheCategory, syncTitheForMonthKeys } from "@/lib/finance/tithe";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";
import { addMonthsClamped, splitAmountIntoInstallments } from "@/lib/utils";
import { transactionFiltersSchema, transactionFormSchema } from "@/features/transactions/schemas/transaction-schema";

function readAccountUsage(account: unknown) {
  return (account as { usage?: "standard" | "benefit_food" }).usage ?? "standard";
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    await syncDueSubscriptionTransactions({
      tenantId: user.tenantId,
      userId: user.id
    });
    await ensureTenantCardStatementSnapshots(user.tenantId);
    const { searchParams } = new URL(request.url);
    const filters = transactionFiltersSchema.parse({
      limit: searchParams.get("limit") ?? 20,
      month: searchParams.get("month"), // Use month filter
      type: searchParams.get("type"),
      categoryId: searchParams.get("categoryId"),
      accountId: searchParams.get("accountId"),
      cardId: searchParams.get("cardId"),
      accountUsage: searchParams.get("accountUsage")
    });

    if (!filters.month) {
      return NextResponse.json({ error: "Parâmetro 'month' é obrigatório." }, { status: 400 });
    }

    const where: Prisma.TransactionWhereInput = {
      tenantId: user.tenantId,
      competence: filters.month, // Filter by competence
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.cardId ? { cardId: filters.cardId } : {})
    };

    if (filters.accountId) {
      where.OR = [{ accountId: filters.accountId }, { destinationAccountId: filters.accountId }];
    }

    if (filters.accountUsage) {
      const usageFilter = [
        { financialAccount: { is: { usage: filters.accountUsage } } },
        { destinationAccount: { is: { usage: filters.accountUsage } } }
      ];
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: usageFilter }];
    }

    const [transactions, totalsByType, totalCount] = await Promise.all([
      prisma.transaction.findMany({
        where,
        include: {
          category: true,
          financialAccount: true,
          destinationAccount: true,
          card: true
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: filters.limit
      }),
      prisma.transaction.groupBy({
        by: ["type"],
        where,
        _sum: {
          amount: true
        }
      }),
      prisma.transaction.count({ where })
    ]);
    const totals = totalsByType.reduce(
      (accumulator, item) => {
        const amount = Number(item._sum.amount ?? 0);

        if (item.type === "income") {
          accumulator.income = amount;
        } else if (item.type === "expense") {
          accumulator.expense = amount;
        } else if (item.type === "transfer") {
          accumulator.transfer = amount;
        }

        return accumulator;
      },
      {
        income: 0,
        expense: 0,
        transfer: 0
      }
    );

    return NextResponse.json({
      items: transactions.map((transaction) => ({
        id: transaction.id,
        date: transaction.date.toISOString(),
        competence: transaction.competence, // Include competence in response
        amount: Number(transaction.amount),
        description: transaction.description,
        type: transaction.type,
        paymentMethod: transaction.paymentMethod,
        installmentsTotal: transaction.installmentsTotal,
        installmentNumber: transaction.installmentNumber,
        category: transaction.category
          ? {
              id: transaction.category.id,
              name: transaction.category.name,
              color: transaction.category.color
            }
          : null,
        account: transaction.financialAccount
          ? {
              id: transaction.financialAccount.id,
              name: transaction.financialAccount.name,
              usage: readAccountUsage(transaction.financialAccount)
            }
          : null,
        destinationAccount: transaction.destinationAccount
          ? {
              id: transaction.destinationAccount.id,
              name: transaction.destinationAccount.name,
              usage: readAccountUsage(transaction.destinationAccount)
            }
          : null,
        card: transaction.card
          ? {
              id: transaction.card.id,
              name: transaction.card.name
            }
          : null,
        competenceDate: transaction.competence ? new Date(`${transaction.competence}-01T12:00:00`).toISOString() : null,
        payableDate: transaction.statementDueDate?.toISOString() ?? null,
        notes: transaction.notes,
        titheAmount: transaction.titheAmount ? Number(transaction.titheAmount) : null,
        applyTithe: Number(transaction.titheAmount ?? 0) > 0,
        classification: transaction.categoryId
          ? {
              auto:
                transaction.classificationSource !== "manual_input" &&
                transaction.classificationSource !== "manual_rule" &&
                transaction.classificationSource !== "unknown",
              ai: transaction.aiClassified,
              confidence: transaction.aiConfidence ? Number(transaction.aiConfidence) : null,
              source: transaction.classificationSource
            }
          : null
      })),
      summary: {
        totalCount,
        returnedCount: transactions.length,
        totals
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "transactions" });
    return NextResponse.json({ message: "Failed to load transactions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = await request.json();
    const parsedData = transactionFormSchema.parse(body);
    const accountId = body.accountId || null;
    const competenceKey = parsedData.competence || format(parsedData.date, "yyyy-MM");
    const baseCompetenceDate = new Date(`${competenceKey}-15T12:00:00`);
    const destinationAccountId = body.destinationAccountId || null;
    const cardId = body.cardId || null;
    const notes = body.notes?.trim() || null;
    const installmentAmounts = splitAmountIntoInstallments(body.amount, body.installments);

    await assertTenantTransactionReferences({
      tenantId: user.tenantId,
      accountId,
      destinationAccountId,
      cardId,
      categoryId: body.categoryId
    });
    const selectedAccount =
      accountId !== null
        ? await prisma.financialAccount.findFirst({
            where: {
              id: accountId,
              tenantId: user.tenantId
            },
            select: {
              usage: true
            }
          })
        : null;

    const selectedCard =
      body.paymentMethod === "credit_card" && cardId
        ? await prisma.card.findFirst({
            where: {
              id: cardId,
              tenantId: user.tenantId,
              isActive: true
            },
            select: {
              id: true,
              closeDay: true,
              dueDay: true,
              statementMonthAnchor: true
            }
          })
        : null;

    if (body.paymentMethod === "credit_card" && cardId && !selectedCard) {
      return NextResponse.json({ message: "Cartão selecionado não foi encontrado" }, { status: 404 });
    }
    const classification = await resolveTransactionClassification({
      tenantId: user.tenantId,
      type: body.type,
      description: body.description,
      notes,
      paymentMethod: body.paymentMethod,
      categoryId: body.categoryId || null,
      allowedCategorySystemKeys:
        selectedAccount?.usage === "benefit_food" && body.type === "expense"
          ? FOOD_BENEFIT_CATEGORY_SYSTEM_KEYS
          : undefined
    });
    const categoryId = body.categoryId || classification.categoryId;
    await validateBenefitWalletTransaction({
      tenantId: user.tenantId,
      type: body.type,
      paymentMethod: body.paymentMethod,
      accountId,
      destinationAccountId,
      categoryId: categoryId || null,
      cardId
    });
    const applyTithe = body.type === "income" && body.applyTithe;
    const titheCategoryId = applyTithe ? await ensureTitheCategory(user.tenantId) : null;
    const affectedCompetences: string[] = [];

    let parentId: string | null = null;
    let firstTransactionId: string | null = null;

    for (let index = 0; index < body.installments; index += 1) {
      const transactionDate = addMonthsClamped(parsedData.date, index);
      const manualCompetenceDate = addMonthsClamped(baseCompetenceDate, index);
      const cardSnapshot = selectedCard
        ? await buildCardBillingSnapshotForDate({
            tenantId: user.tenantId,
            card: selectedCard,
            referenceDate: transactionDate,
            client: prisma
          })
        : null;
      const competenceForInstallment = cardSnapshot?.competence ?? format(manualCompetenceDate, "yyyy-MM");

      const created: Transaction = await prisma.transaction.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          date: transactionDate,
          competence: competenceForInstallment,
          amount: new Prisma.Decimal(installmentAmounts[index].toFixed(2)),
          description:
            body.installments > 1
              ? `${body.description} (${index + 1}/${body.installments})`
              : body.description,
          notes,
          type: body.type,
          source: TransactionSource.manual,
          paymentMethod: body.paymentMethod,
          categoryId,
          accountId,
          destinationAccountId,
          cardId,
          statementCloseDate: cardSnapshot?.closeDate ?? null,
          statementDueDate: cardSnapshot?.dueDate ?? null,
          installmentsTotal: body.installments,
          installmentNumber: index + 1,
          parentId,
          titheAmount: applyTithe ? new Prisma.Decimal((installmentAmounts[index] * 0.1).toFixed(2)) : null,
          titheCategoryId,
          classificationSource: classification.classificationSource,
          classificationKeyword: classification.classificationKeyword,
          classificationReason: classification.reason,
          classificationVersion: 2,
          aiClassified: classification.aiClassified,
          aiConfidence:
            classification.confidence !== null ? new Prisma.Decimal(classification.confidence.toFixed(2)) : null
        }
      });

      affectedCompetences.push(competenceForInstallment);

      if (index === 0) {
        parentId = created.id;
        firstTransactionId = created.id;
      }
    }
    if (!firstTransactionId) {
      return NextResponse.json({ message: "Failed to create transaction" }, { status: 500 });
    }

    if (applyTithe) {
      await syncTitheForMonthKeys({
        tenantId: user.tenantId,
        userId: user.id,
        monthKeys: affectedCompetences
      });
    }

    const createdTransaction = await prisma.transaction.findUniqueOrThrow({
      where: {
        id: firstTransactionId
      },
      include: {
        category: true,
        financialAccount: true,
        destinationAccount: true,
        card: true
      }
    });
    revalidateFinanceReports(user.tenantId);

    return NextResponse.json(
      {
        id: createdTransaction.id,
        date: createdTransaction.date.toISOString(),
        amount: Number(createdTransaction.amount),
        description: createdTransaction.description,
        type: createdTransaction.type,
        paymentMethod: createdTransaction.paymentMethod,
        installmentsTotal: createdTransaction.installmentsTotal,
        installmentNumber: createdTransaction.installmentNumber,
        category: createdTransaction.category,
        account: createdTransaction.financialAccount,
        destinationAccount: createdTransaction.destinationAccount,
        card: createdTransaction.card,
        titheAmount: createdTransaction.titheAmount ? Number(createdTransaction.titheAmount) : null,
        applyTithe: Number(createdTransaction.titheAmount ?? 0) > 0,
        classification: categoryId
          ? {
              auto: !body.categoryId,
              ai: classification.aiClassified,
              confidence: classification.confidence,
              source: classification.classificationSource,
              reason: classification.reason
            }
          : null
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof TenantReferenceError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof BenefitWalletRuleError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    captureRequestError(error, { request, feature: "transactions" });
    return NextResponse.json({ message: "Failed to create transaction" }, { status: 400 });
  }
}
