import { NextResponse } from "next/server";

import { cardFormSchema } from "@/features/cards/schemas/card-schema";
import { requireSessionUser } from "@/lib/auth/session";
import { getCurrentStatementMonth, getStatementCloseDate, getStatementPaymentDate, getStatementRange } from "@/lib/cards/statement";
import { canCreateCard } from "@/lib/licensing/server";
import { prisma } from "@/lib/prisma/client";

export async function GET() {
  try {
    const user = await requireSessionUser();
    const cards = await prisma.card.findMany({
      where: {
        tenantId: user.tenantId,
        ownerUserId: user.id
      },
      orderBy: {
        name: "asc"
      }
    });
    const items = await Promise.all(
      cards.map(async (card) => {
        const statementMonth = getCurrentStatementMonth(card.closeDay);
        const { start, end } = getStatementRange(statementMonth, card.closeDay);
        const transactions = await prisma.transaction.findMany({
          where: {
            tenantId: user.tenantId,
            userId: user.id,
            cardId: card.id,
            date: {
              gte: start,
              lte: end
            }
          },
          select: {
            amount: true,
            type: true
          }
        });

        const statementAmount = transactions.reduce((sum, item) => {
          const amount = Number(item.amount);

          if (item.type === "expense") {
            return sum + amount;
          }

          if (item.type === "income") {
            return sum - amount;
          }

          return sum;
        }, 0);

        return {
          id: card.id,
          name: card.name,
          brand: card.brand,
          last4: card.last4,
          limitAmount: Number(card.limitAmount),
          availableLimit: Number(card.limitAmount) - statementAmount,
          statementAmount,
          statementMonth,
          closeDate: getStatementCloseDate(statementMonth, card.closeDay).toISOString(),
          dueDate: getStatementPaymentDate(statementMonth, card.dueDay).toISOString(),
          dueDay: card.dueDay,
          closeDay: card.closeDay,
          color: card.color,
          institution: card.institution
        };
      })
    );

    return NextResponse.json({
      items
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to load cards" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = cardFormSchema.parse(await request.json());
    const usage = await canCreateCard(user.tenantId, user.id);

    if (!usage?.license.canAccessApp) {
      return NextResponse.json({ message: "Plano indisponível para criar cartões" }, { status: 403 });
    }

    if (!usage.allowed) {
      return NextResponse.json(
        {
          message:
            usage.limit === 1
              ? "O plano atual permite apenas 1 cartão ativo"
              : `O plano atual permite até ${usage.limit} cartões ativos`
        },
        { status: 409 }
      );
    }

    const normalizedName = body.name.trim().replace(/\s+/g, " ");
    const existingCard = await prisma.card.findFirst({
      where: {
        ownerUserId: user.id,
        name: {
          equals: normalizedName,
          mode: "insensitive"
        }
      },
      select: {
        id: true
      }
    });

    if (existingCard) {
      return NextResponse.json({ message: "Já existe um cartão com esse nome" }, { status: 409 });
    }

    const card = await prisma.card.create({
      data: {
        tenantId: user.tenantId,
        ownerUserId: user.id,
        name: normalizedName,
        brand: body.brand,
        last4: body.last4 || null,
        limitAmount: body.limitAmount,
        dueDay: body.dueDay,
        closeDay: body.closeDay,
        color: body.color,
        institution: body.institution?.trim() || null
      }
    });

    return NextResponse.json(
      {
        id: card.id,
        name: card.name,
        brand: card.brand,
        last4: card.last4,
        limitAmount: Number(card.limitAmount),
        dueDay: card.dueDay,
        closeDay: card.closeDay,
        color: card.color,
        institution: card.institution
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ message: "Já existe um cartão com esse nome" }, { status: 409 });
    }

    return NextResponse.json({ message: "Failed to create card" }, { status: 400 });
  }
}
