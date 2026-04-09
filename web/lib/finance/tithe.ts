import { Prisma, type PrismaClient } from "@prisma/client";

import { buildCategoryKeywords, defaultCategories, getDefaultCategorySystemKey } from "@/lib/finance/default-categories";
import { prisma } from "@/lib/prisma/client";
import { formatDateKey } from "@/lib/date";

type TitheClient = Pick<PrismaClient, "category" | "transaction">;

export function getMonthKey(date: Date) {
  return formatDateKey(date).slice(0, 7);
}

function getMonthRange(monthKey: string) {
  const start = new Date(`${monthKey}-01T00:00:00`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return { start, end };
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric"
  }).format(new Date(year, (month ?? 1) - 1, 1));
}

export async function ensureTitheCategory(tenantId: string, client: TitheClient = prisma) {
  const existing = await client.category.findFirst({
    where: {
      tenantId,
      type: "expense",
      name: {
        equals: "Dízimo",
        mode: "insensitive"
      }
    },
    select: { id: true }
  });

  if (existing) {
    return existing.id;
  }

  const definition = defaultCategories.find((item) => item.type === "expense" && item.name === "Dízimo");

  if (!definition) {
    throw new Error("Categoria padrão de dízimo não encontrada");
  }

  const created = await client.category.create({
    data: {
      tenantId,
      name: definition.name,
      systemKey: definition.systemKey ?? getDefaultCategorySystemKey(definition.type, definition.name),
      icon: definition.icon,
      color: definition.color,
      type: definition.type,
      isDefault: true,
      keywords: buildCategoryKeywords(definition.name, definition.keywords)
    }
  });

  return created.id;
}

export async function syncMonthlyTitheTransaction({
  tenantId,
  userId,
  monthKey,
  client = prisma
}: {
  tenantId: string;
  userId: string;
  monthKey: string;
  client?: TitheClient;
}) {
  const { start, end } = getMonthRange(monthKey);
  const titheCategoryId = await ensureTitheCategory(tenantId, client);
  const notesTag = `[AUTO_TITHE:${monthKey}]`;
  const title = `Dízimo consolidado ${monthLabel(monthKey)}`;

  const [incomeTransactions, existingAutoTithes] = await Promise.all([
    client.transaction.findMany({
      where: {
        tenantId,
        type: "income",
        date: {
          gte: start,
          lte: end
        },
        titheAmount: {
          gt: new Prisma.Decimal(0)
        }
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        accountId: true,
        titheAmount: true,
        date: true
      }
    }),
    client.transaction.findMany({
      where: {
        tenantId,
        type: "expense",
        notes: notesTag
      },
      select: {
        id: true,
        userId: true
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    })
  ]);

  const total = incomeTransactions.reduce((sum, transaction) => {
    return sum + Number(transaction.titheAmount ?? 0);
  }, 0);

  if (total <= 0) {
    if (existingAutoTithes.length > 0) {
      await client.transaction.deleteMany({
        where: {
          id: {
            in: existingAutoTithes.map((item) => item.id)
          }
        }
      });
    }
    return null;
  }

  const primaryAutoTithe = existingAutoTithes[0] ?? null;
  const duplicateIds = existingAutoTithes.slice(1).map((item) => item.id);
  const preferredAccountId =
    incomeTransactions.find((transaction) => transaction.accountId)?.accountId ?? null;
  const dueDate = new Date(`${monthKey}-01T12:00:00`);
  dueDate.setMonth(dueDate.getMonth() + 1, 0);

  if (duplicateIds.length > 0) {
    await client.transaction.deleteMany({
      where: {
        id: {
          in: duplicateIds
        }
      }
    });
  }

  if (primaryAutoTithe) {
    return client.transaction.update({
      where: {
        id: primaryAutoTithe.id
      },
      data: {
        date: dueDate,
        amount: new Prisma.Decimal(total.toFixed(2)),
        description: title,
        notes: notesTag,
        type: "expense",
        paymentMethod: preferredAccountId ? "pix" : "money",
        categoryId: titheCategoryId,
        titheCategoryId,
        userId: userId ?? primaryAutoTithe.userId ?? null,
        accountId: preferredAccountId,
        cardId: null,
        destinationAccountId: null,
        source: "manual"
      }
    });
  }

  return client.transaction.create({
    data: {
      tenantId,
      userId: userId ?? null,
      date: dueDate,
      amount: new Prisma.Decimal(total.toFixed(2)),
      description: title,
      notes: notesTag,
      type: "expense",
      paymentMethod: preferredAccountId ? "pix" : "money",
      categoryId: titheCategoryId,
      titheCategoryId,
      accountId: preferredAccountId,
      source: "manual"
    }
  });
}

export async function syncTitheForTransactionDates({
  tenantId,
  userId,
  dates,
  client = prisma
}: {
  tenantId: string;
  userId: string;
  dates: Date[];
  client?: TitheClient;
}) {
  const monthKeys = Array.from(new Set(dates.map(getMonthKey)));
  for (const monthKey of monthKeys) {
    await syncMonthlyTitheTransaction({ tenantId, userId, monthKey, client });
  }
}
