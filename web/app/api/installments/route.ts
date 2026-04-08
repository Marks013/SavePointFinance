import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { getCardExpenseCompetenceDate } from "@/lib/cards/statement";
import { prisma } from "@/lib/prisma/client";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const cardId = searchParams.get("cardId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const groupWhere: Prisma.TransactionWhereInput = {
      tenantId: user.tenantId,
      installmentsTotal: {
        gt: 1
      },
      ...(cardId ? { cardId } : {})
    };

    if (from || to) {
      groupWhere.date = {};

      if (from) {
        const fromDate = new Date(`${from}T00:00:00`);
        fromDate.setMonth(fromDate.getMonth() - 1);
        groupWhere.date.gte = fromDate;
      }

      if (to) {
        groupWhere.date.lte = new Date(`${to}T23:59:59`);
      }
    }

    const filteredInstallments = await prisma.transaction.findMany({
      where: groupWhere,
      select: {
        id: true,
        parentId: true
      }
    });

    const rootIds = Array.from(
      new Set(filteredInstallments.map((item) => item.parentId ?? item.id))
    );

    const roots =
      rootIds.length > 0
        ? await prisma.transaction.findMany({
            where: {
              tenantId: user.tenantId,
              id: {
                in: rootIds
              },
              parentId: null
            },
            include: {
              card: true,
              category: true
            },
            orderBy: {
              date: "desc"
            }
          })
        : [];

    const filterStart = from ? new Date(`${from}T00:00:00`) : null;
    const filterEnd = to ? new Date(`${to}T23:59:59`) : null;

    const groups = await Promise.all(
      roots.map(async (root) => {
        const installments = await prisma.transaction.findMany({
          where: {
            tenantId: user.tenantId,
            OR: [{ id: root.id }, { parentId: root.id }]
          },
          orderBy: {
            installmentNumber: "asc"
          }
        });

        const today = new Date();
        const totalAmount = installments.reduce((sum, item) => sum + Number(item.amount), 0);
        const settledInstallments = installments.filter((item) => item.settledAt).length;
        const overdueOpenInstallments = installments.filter((item) => item.date <= today && !item.settledAt).length;
        const nextInstallment = installments.find((item) => !item.settledAt && item.date > today) ?? null;

        return {
          id: root.id,
          description: root.description.replace(/\s\(\d+\/\d+\)$/, ""),
          totalAmount,
          installmentAmount: installments[0] ? Number(installments[0].amount) : 0,
          installmentsTotal: root.installmentsTotal,
          installmentsPaid: settledInstallments,
          installmentsRemaining: root.installmentsTotal - settledInstallments,
          overdueOpenInstallments,
          nextInstallmentDate: nextInstallment?.date.toISOString() ?? null,
          card: root.card ? { id: root.card.id, name: root.card.name } : null,
          category: root.category ? { id: root.category.id, name: root.category.name } : null,
          notes: root.notes
        };
      })
    );

    const filteredGroups =
      filterStart || filterEnd
        ? groups.filter((group) => {
            const matchingRoot = roots.find((root) => root.id === group.id);
            if (!matchingRoot) {
              return false;
            }

            const competenceDate = matchingRoot.card
              ? getCardExpenseCompetenceDate(matchingRoot.card, matchingRoot.date)
              : matchingRoot.date;

            if (filterStart && competenceDate < filterStart) {
              return false;
            }

            if (filterEnd && competenceDate > filterEnd) {
              return false;
            }

            return true;
          })
        : groups;

    return NextResponse.json({ items: filteredGroups });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to load installments" }, { status: 500 });
  }
}
