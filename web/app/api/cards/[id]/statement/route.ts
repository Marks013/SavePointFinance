import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { getStatementCloseDate, getStatementPaymentDate, getStatementRange } from "@/lib/cards/statement";
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

    const { start, end } = getStatementRange(month, card.closeDay);

    const transactions = await prisma.transaction.findMany({
      where: {
        tenantId: user.tenantId,
        cardId: id,
        date: {
          gte: start,
          lte: end
        }
      },
      include: {
        category: true
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }]
    });

    const totalAmount = transactions.reduce((sum, item) => {
      const amount = Number(item.amount);

      if (item.type === "expense") {
        return sum + amount;
      }

      if (item.type === "income") {
        return sum - amount;
      }

      return sum;
    }, 0);
    const installmentItems = transactions.filter(
      (item) => item.type === "expense" && item.installmentsTotal > 1
    ).length;
    const availableLimit = Number(card.limitAmount) - totalAmount;
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
        totalAmount,
        availableLimit,
        installmentItems,
        transactions: transactions.length,
        cycleStart: start.toISOString(),
        cycleEnd: end.toISOString(),
        closeDate: getStatementCloseDate(month, card.closeDay).toISOString(),
        dueDate: getStatementPaymentDate(month, card.dueDay).toISOString()
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
