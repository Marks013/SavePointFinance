import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireSessionUser } from "@/lib/auth/session";
import { getCardStatementSnapshot, statementMonthSchema } from "@/lib/cards/statement";
import { ensureTenantCardStatementSnapshots, recomputeCardStatementSnapshots } from "@/lib/cards/snapshot-sync";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";

type Params = {
  params: Promise<{ id: string }>;
};

const statementQuerySchema = z.object({
  month: statementMonthSchema.optional(),
  limit: z.coerce.number().int().min(10).max(200).default(50)
});

const statementCycleSchema = z
  .object({
    month: statementMonthSchema,
    closeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de fechamento invalida"),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de vencimento invalida")
  })
  .superRefine((value, ctx) => {
    const closeDate = new Date(`${value.closeDate}T12:00:00`);
    const dueDate = new Date(`${value.dueDate}T12:00:00`);

    if (dueDate <= closeDate) {
      ctx.addIssue({
        code: "custom",
        path: ["dueDate"],
        message: "O vencimento deve ser posterior ao fechamento"
      });
    }
  });

export async function GET(request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const query = statementQuerySchema.parse({
      month: searchParams.get("month") ?? undefined,
      limit: searchParams.get("limit") ?? 50
    });
    await ensureTenantCardStatementSnapshots(user.tenantId);

    const card = await prisma.card.findFirst({
      where: {
        id,
        tenantId: user.tenantId
      }
    });

    if (!card) {
      return NextResponse.json({ message: "Card not found" }, { status: 404 });
    }

    const statement = await getCardStatementSnapshot({
      tenantId: user.tenantId,
      card,
      month: query.month,
      client: prisma
    });

    const statementItemsWhere: Prisma.TransactionWhereInput = {
      tenantId: user.tenantId,
      cardId: id,
      competence: statement.month
    };

    const [transactions, transactionsCount, installmentItems, payment] = await Promise.all([
      prisma.transaction.findMany({
        where: statementItemsWhere,
        select: {
          id: true,
          date: true,
          description: true,
          amount: true,
          type: true,
          installmentNumber: true,
          installmentsTotal: true,
          category: {
            select: {
              name: true
            }
          }
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        take: query.limit
      }),
      prisma.transaction.count({
        where: statementItemsWhere
      }),
      prisma.transaction.count({
        where: {
          ...statementItemsWhere,
          type: "expense",
          installmentsTotal: {
            gt: 1
          }
        }
      }),
      prisma.statementPayment.findUnique({
        where: {
          tenantId_cardId_month: {
            tenantId: user.tenantId,
            cardId: id,
            month: statement.month
          }
        },
        include: {
          account: true
        }
      })
    ]);

    return NextResponse.json({
      card: {
        id: card.id,
        name: card.name,
        brand: card.brand,
        last4: card.last4,
        limitAmount: Number(card.limitAmount),
        closeDay: card.closeDay,
        dueDay: card.dueDay,
        statementMonthAnchor: card.statementMonthAnchor
      },
      month: statement.month,
      summary: {
        totalAmount: statement.totalAmount,
        statementOutstandingAmount: statement.statementOutstandingAmount,
        outstandingAmount: statement.outstandingAmount,
        availableLimit: statement.availableLimit,
        installmentItems,
        transactions: transactionsCount,
        cycleStart: statement.start.toISOString(),
        cycleEnd: statement.end.toISOString(),
        closeDate: statement.closeDate.toISOString(),
        dueDate: statement.dueDate.toISOString(),
        customCycle: statement.customCycle
      },
      itemsMeta: {
        returned: transactions.length,
        limit: query.limit,
        hasMore: transactionsCount > transactions.length
      },
      payment: payment
        ? {
            id: payment.id,
            amount: Number(payment.amount),
            paidAt: payment.paidAt.toISOString(),
            transactionId: payment.transactionId,
            account: {
              id: payment.account.id,
              name: payment.account.name
            }
          }
        : null,
      items: transactions.map((transaction) => ({
        id: transaction.id,
        date: transaction.date.toISOString(),
        description: transaction.description,
        amount: Number(transaction.amount),
        type: transaction.type,
        category: transaction.category?.name ?? "Sem categoria",
        installmentLabel:
          transaction.installmentsTotal > 1
            ? `${transaction.installmentNumber}/${transaction.installmentsTotal}`
            : null
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "cards" });
    return NextResponse.json({ message: "Failed to load statement" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const body = statementCycleSchema.parse(await request.json());
    const card = await prisma.card.findFirst({
      where: {
        id,
        tenantId: user.tenantId
      },
      select: {
        id: true
      }
    });

    if (!card) {
      return NextResponse.json({ message: "Card not found" }, { status: 404 });
    }

    const cycle = await prisma.cardStatementCycle.upsert({
      where: {
        tenantId_cardId_month: {
          tenantId: user.tenantId,
          cardId: id,
          month: body.month
        }
      },
      create: {
        tenantId: user.tenantId,
        cardId: id,
        month: body.month,
        closeDate: new Date(`${body.closeDate}T12:00:00`),
        dueDate: new Date(`${body.dueDate}T12:00:00`)
      },
      update: {
        closeDate: new Date(`${body.closeDate}T12:00:00`),
        dueDate: new Date(`${body.dueDate}T12:00:00`)
      }
    });

    await recomputeCardStatementSnapshots(user.tenantId, id, prisma);

    return NextResponse.json({
      id: cycle.id,
      month: cycle.month,
      closeDate: cycle.closeDate.toISOString(),
      dueDate: cycle.dueDate.toISOString()
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "cards" });
    return NextResponse.json({ message: "Failed to update statement cycle" }, { status: 400 });
  }
}
