import { Prisma, TransactionSource, TransactionType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSessionUser } from "@/lib/auth/session";
import { getCardStatementSnapshot, getStatementPaymentDate, statementMonthSchema } from "@/lib/cards/statement";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";

type Params = {
  params: Promise<{ id: string }>;
};

const statementPaymentSchema = z.object({
  month: statementMonthSchema,
  accountId: z.string().min(1, "Conta obrigatoria")
});

export async function POST(request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const body = statementPaymentSchema.parse(await request.json());

    const [card, account] = await Promise.all([
      prisma.card.findFirst({
        where: {
          id,
          tenantId: user.tenantId
        }
      }),
      prisma.financialAccount.findFirst({
        where: {
          id: body.accountId,
          tenantId: user.tenantId,
          isActive: true
        }
      })
    ]);

    if (!card) {
      return NextResponse.json({ message: "Card not found" }, { status: 404 });
    }

    if (!account) {
      return NextResponse.json({ message: "Account not found" }, { status: 404 });
    }

    const existingPayment = await prisma.statementPayment.findUnique({
      where: {
        tenantId_cardId_month: {
          tenantId: user.tenantId,
          cardId: id,
          month: body.month
        }
      }
    });

    if (existingPayment) {
      return NextResponse.json({ message: "Statement already paid" }, { status: 409 });
    }

    const statement = await getCardStatementSnapshot({
      tenantId: user.tenantId,
      card,
      month: body.month,
      client: prisma
    });

    if (statement.statementOutstandingAmount <= 0) {
      return NextResponse.json({ message: "Statement has no balance to pay" }, { status: 400 });
    }

    const paidAt = getStatementPaymentDate(body.month, card.dueDay, card.closeDay);
    const amount = new Prisma.Decimal(statement.statementOutstandingAmount.toFixed(2));

    const payment = await prisma.$transaction(async (tx) => {
      const paymentTransaction = await tx.transaction.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          accountId: account.id,
          date: paidAt,
          amount,
          description: `Pagamento fatura ${card.name} ${body.month}`,
          notes: `Baixa automatica da competencia ${body.month}.`,
          type: TransactionType.transfer,
          source: TransactionSource.manual,
          paymentMethod: "transfer"
        }
      });

      return tx.statementPayment.create({
        data: {
          tenantId: user.tenantId,
          cardId: card.id,
          accountId: account.id,
          month: body.month,
          amount,
          paidAt,
          transactionId: paymentTransaction.id
        },
        include: {
          account: true
        }
      });
    });

    return NextResponse.json(
      {
        id: payment.id,
        month: payment.month,
        amount: Number(payment.amount),
        paidAt: payment.paidAt.toISOString(),
        transactionId: payment.transactionId,
        account: {
          id: payment.account.id,
          name: payment.account.name
        }
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Invalid statement payment payload" }, { status: 400 });
    }

    captureRequestError(error, { request, feature: "cards" });
    return NextResponse.json({ message: "Failed to pay statement" }, { status: 500 });
  }
}
