import { Prisma, Transaction, TransactionSource } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { getCardExpenseCompetenceDate } from "@/lib/cards/statement";
import { classifyTransactionCategory } from "@/lib/finance/category-classifier";
import { ensureFallbackCategory } from "@/lib/finance/default-categories";
import { assertTenantTransactionReferences, TenantReferenceError } from "@/lib/finance/tenant-reference-guard";
import { ensureTitheCategory, syncTitheForTransactionDates } from "@/lib/finance/tithe";
import { prisma } from "@/lib/prisma/client";
import { addMonthsClamped, splitAmountIntoInstallments } from "@/lib/utils";
import { transactionFiltersSchema, transactionFormSchema } from "@/features/transactions/schemas/transaction-schema";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const filters = transactionFiltersSchema.parse({
      limit: searchParams.get("limit") ?? 20,
      from: searchParams.get("from"),
      to: searchParams.get("to"),
      type: searchParams.get("type"),
      categoryId: searchParams.get("categoryId"),
      accountId: searchParams.get("accountId"),
      cardId: searchParams.get("cardId")
    });
    const where: Prisma.TransactionWhereInput = {
      tenantId: user.tenantId,
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.cardId ? { cardId: filters.cardId } : {})
    };
    const hasDateFilter = Boolean(filters.from || filters.to);

    if (filters.accountId) {
      where.OR = [{ accountId: filters.accountId }, { destinationAccountId: filters.accountId }];
    }

    if (hasDateFilter) {
      where.date = {};

      if (filters.from) {
        const fromDate = new Date(`${filters.from}T00:00:00`);
        fromDate.setMonth(fromDate.getMonth() - 1);
        where.date.gte = fromDate;
      }

      if (filters.to) {
        where.date.lte = new Date(`${filters.to}T23:59:59`);
      }
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        category: true,
        financialAccount: true,
        destinationAccount: true,
        card: true
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: hasDateFilter ? Math.max(filters.limit * 8, 500) : filters.limit
    });

    const filteredTransactions = hasDateFilter
      ? transactions
          .filter((transaction) => {
            const competenceDate = transaction.card
              ? getCardExpenseCompetenceDate(transaction.card, transaction.date)
              : transaction.date;

            if (filters.from && competenceDate < new Date(`${filters.from}T00:00:00`)) {
              return false;
            }

            if (filters.to && competenceDate > new Date(`${filters.to}T23:59:59`)) {
              return false;
            }

            return true;
          })
          .slice(0, filters.limit)
      : transactions;

    return NextResponse.json({
      items: filteredTransactions.map((transaction) => ({
        id: transaction.id,
        date: transaction.date.toISOString(),
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
              name: transaction.financialAccount.name
            }
          : null,
        destinationAccount: transaction.destinationAccount
          ? {
              id: transaction.destinationAccount.id,
              name: transaction.destinationAccount.name
            }
          : null,
        card: transaction.card
          ? {
              id: transaction.card.id,
              name: transaction.card.name
            }
          : null,
        notes: transaction.notes,
        titheAmount: transaction.titheAmount ? Number(transaction.titheAmount) : null,
        applyTithe: Number(transaction.titheAmount ?? 0) > 0,
        classification: transaction.categoryId
          ? {
              auto: transaction.aiClassified || transaction.aiConfidence !== null,
              ai: transaction.aiClassified,
              confidence: transaction.aiConfidence ? Number(transaction.aiConfidence) : null
            }
          : null
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to load transactions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = transactionFormSchema.parse(await request.json());
    const parsedDate = new Date(`${body.date}T12:00:00`);
    const accountId = body.accountId || null;
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
              dueDay: true
            }
          })
        : null;

    if (body.paymentMethod === "credit_card" && cardId && !selectedCard) {
      return NextResponse.json({ message: "Cartão selecionado não foi encontrado" }, { status: 404 });
    }
    const categories = await prisma.category.findMany({
      where: {
        tenantId: user.tenantId
      },
      select: {
        id: true,
        name: true,
        type: true,
        keywords: true
      }
    });
    const history = await prisma.transaction.findMany({
      where: {
        tenantId: user.tenantId,
        type: body.type,
        categoryId: {
          not: null
        }
      },
      select: {
        categoryId: true,
        description: true,
        notes: true,
        aiClassified: true,
        aiConfidence: true
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 120
    });
    const classification =
      body.categoryId || body.type === "transfer"
        ? {
            categoryId: body.categoryId || null,
            confidence: null,
            aiClassified: false,
            reason: "Categoria definida manualmente"
          }
        : await classifyTransactionCategory({
            type: body.type,
            description: body.description,
            notes,
            paymentMethod: body.paymentMethod,
            categories,
            history: history
              .filter((item): item is typeof item & { categoryId: string } => Boolean(item.categoryId))
              .map((item) => ({
                categoryId: item.categoryId,
                description: item.description,
                notes: item.notes,
                aiClassified: item.aiClassified,
                aiConfidence: item.aiConfidence ? Number(item.aiConfidence) : null
              }))
          });
    const categoryId =
      classification.categoryId ||
      (body.type !== "transfer" ? await ensureFallbackCategory(user.tenantId, body.type) : null);
    const applyTithe = body.type === "income" && body.applyTithe;
    const titheCategoryId = applyTithe ? await ensureTitheCategory(user.tenantId) : null;
    const affectedDates: Date[] = [];

    let parentId: string | null = null;
    let firstTransactionId: string | null = null;

    for (let index = 0; index < body.installments; index += 1) {
      const transactionDate = addMonthsClamped(parsedDate, index);
      affectedDates.push(transactionDate);
      const created: Transaction = await prisma.transaction.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          date: transactionDate,
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
          installmentsTotal: body.installments,
          installmentNumber: index + 1,
          parentId,
          titheAmount: applyTithe ? new Prisma.Decimal((installmentAmounts[index] * 0.1).toFixed(2)) : null,
          titheCategoryId,
          aiClassified: classification.aiClassified,
          aiConfidence:
            classification.confidence !== null ? new Prisma.Decimal(classification.confidence.toFixed(2)) : null
        }
      });

      if (index === 0) {
        parentId = created.id;
        firstTransactionId = created.id;
      }
    }

    if (!firstTransactionId) {
      return NextResponse.json({ message: "Failed to create transaction" }, { status: 500 });
    }

    if (applyTithe) {
      await syncTitheForTransactionDates({
        tenantId: user.tenantId,
        userId: user.id,
        dates: affectedDates
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

    return NextResponse.json({ message: "Failed to create transaction" }, { status: 400 });
  }
}
