import { NextResponse } from "next/server";

import { cardFormSchema } from "@/features/cards/schemas/card-schema";
import { requireSessionUser } from "@/lib/auth/session";
import { revalidateFinanceReports } from "@/lib/cache/finance-read-models";
import { getCardStatementSnapshot, getNextPayableStatementSnapshot, statementMonthSchema } from "@/lib/cards/statement";
import { ensureTenantCardStatementSnapshots } from "@/lib/cards/snapshot-sync";
import { canCreateCard } from "@/lib/licensing/server";
import { getCurrentMonthKey, getMonthRange } from "@/lib/month";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";

function getStatementReferenceDate(month?: string) {
  if (!month || month === getCurrentMonthKey()) {
    return new Date();
  }

  return getMonthRange(month).end;
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const month = statementMonthSchema.optional().parse(searchParams.get("month") ?? undefined);
    const referenceDate = getStatementReferenceDate(month);
    await ensureTenantCardStatementSnapshots(user.tenantId);
    const cards = await prisma.card.findMany({
      where: {
        tenantId: user.tenantId
      },
      orderBy: {
        name: "asc"
      }
    });
    const items = await Promise.all(
      cards.map(async (card) => {
        const statement = await getCardStatementSnapshot({
          tenantId: user.tenantId,
          card,
          month,
          client: prisma
        });
        const payableStatement = await getNextPayableStatementSnapshot({
          tenantId: user.tenantId,
          card,
          referenceDate,
          client: prisma
        });
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const payableDueDate = new Date(payableStatement.dueDate);
        payableDueDate.setHours(0, 0, 0, 0);
        const payableDaysLate = Math.max(
          0,
          Math.floor((today.getTime() - payableDueDate.getTime()) / (1000 * 60 * 60 * 24))
        );

        return {
          id: card.id,
          name: card.name,
          brand: card.brand,
          last4: card.last4,
          limitAmount: Number(card.limitAmount),
          availableLimit: statement.availableLimit,
          statementAmount: statement.totalAmount,
          statementOutstandingAmount: statement.statementOutstandingAmount,
          outstandingAmount: statement.outstandingAmount,
          statementMonth: statement.month,
          closeDate: statement.closeDate.toISOString(),
          dueDate: statement.dueDate.toISOString(),
          payableStatementAmount: payableStatement.statementOutstandingAmount,
          payableStatementMonth: payableStatement.month,
          payableDueDate: payableStatement.dueDate.toISOString(),
          payableOverdue: payableStatement.statementOutstandingAmount > 0 && payableDaysLate > 0,
          payableDaysLate,
          dueDay: card.dueDay,
          closeDay: card.closeDay,
          statementMonthAnchor: card.statementMonthAnchor,
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

    captureRequestError(error, { request, feature: "cards" });
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
        tenantId: user.tenantId,
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
        statementMonthAnchor: body.statementMonthAnchor,
        color: body.color,
        institution: body.institution?.trim() || null
      }
    });
    revalidateFinanceReports(user.tenantId);

    return NextResponse.json(
      {
        id: card.id,
        name: card.name,
        brand: card.brand,
        last4: card.last4,
        limitAmount: Number(card.limitAmount),
        dueDay: card.dueDay,
        closeDay: card.closeDay,
        statementMonthAnchor: card.statementMonthAnchor,
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

    captureRequestError(error, { request, feature: "cards" });
    return NextResponse.json({ message: "Failed to create card" }, { status: 400 });
  }
}
