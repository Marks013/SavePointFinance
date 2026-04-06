import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { getCardStatementSnapshot } from "@/lib/cards/statement";
import { prisma } from "@/lib/prisma/client";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);

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
      month,
      client: prisma
    });

    const transactions = await prisma.transaction.findMany({
      where: {
        tenantId: user.tenantId,
        cardId: id,
        date: {
          gte: statement.start,
          lte: statement.end
        }
      },
      include: {
        category: true
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }]
    });

    const installmentItems = transactions.filter(
      (item) => item.type === "expense" && item.installmentsTotal > 1
    ).length;
    const payment = await prisma.statementPayment.findUnique({
      where: {
        tenantId_cardId_month: {
          tenantId: user.tenantId,
          cardId: id,
          month
        }
      },
      include: {
        account: true
      }
    });

    return NextResponse.json({
      card: {
        id: card.id,
        name: card.name,
        brand: card.brand,
        last4: card.last4,
        limitAmount: Number(card.limitAmount),
        closeDay: card.closeDay,
        dueDay: card.dueDay
      },
      month,
      summary: {
        totalAmount: statement.totalAmount,
        availableLimit: statement.availableLimit,
        installmentItems,
        transactions: transactions.length,
        cycleStart: statement.start.toISOString(),
        cycleEnd: statement.end.toISOString(),
        closeDate: statement.closeDate.toISOString(),
        dueDate: statement.dueDate.toISOString()
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

    return NextResponse.json({ message: "Failed to load statement" }, { status: 500 });
  }
}
