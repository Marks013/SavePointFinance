import defaultsData from "@/lib/finance/default-categories.json";
import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma/client";

type DefaultCategoryDefinition = {
  name: string;
  icon: string;
  color: string;
  type: "income" | "expense";
  isDefault: boolean;
  keywords: string[];
};

export const defaultCategories = defaultsData as DefaultCategoryDefinition[];

export function normalizeCategoryName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

function normalizeKeyword(keyword: string) {
  return keyword
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function dedupeKeywords(keywords: string[]) {
  return Array.from(
    new Set(
      keywords
        .map((keyword) => normalizeKeyword(keyword))
        .filter(Boolean)
    )
  );
}

export function buildCategoryKeywords(name: string, keywords: string[]) {
  return dedupeKeywords([name, ...keywords]);
}

type CategoryClient = Pick<PrismaClient, "$transaction" | "category" | "subscription" | "transaction">;

function getCategoryKey(type: "income" | "expense", name: string) {
  return `${type}:${normalizeCategoryName(name).toLowerCase()}`;
}

export async function dedupeTenantCategories(tenantId: string, client: CategoryClient = prisma) {
  const categories = await client.category.findMany({
    where: { tenantId },
    select: {
      id: true,
      name: true,
      type: true,
      createdAt: true,
      isDefault: true,
      keywords: true
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  const grouped = new Map<string, typeof categories>();

  for (const category of categories) {
    const key = getCategoryKey(category.type, category.name);
    const current = grouped.get(key) ?? [];
    current.push(category);
    grouped.set(key, current);
  }

  for (const duplicates of grouped.values()) {
    if (duplicates.length < 2) {
      continue;
    }

    const keeper = duplicates[0];
    const redundant = duplicates.slice(1);
    const redundantIds = redundant.map((item) => item.id);
    const mergedKeywords = dedupeKeywords(
      duplicates.flatMap((item) => item.keywords ?? [])
    );

    await client.$transaction([
      client.transaction.updateMany({
        where: {
          tenantId,
          categoryId: {
            in: redundantIds
          }
        },
        data: {
          categoryId: keeper.id
        }
      }),
      client.transaction.updateMany({
        where: {
          tenantId,
          titheCategoryId: {
            in: redundantIds
          }
        },
        data: {
          titheCategoryId: keeper.id
        }
      }),
      client.subscription.updateMany({
        where: {
          tenantId,
          categoryId: {
            in: redundantIds
          }
        },
        data: {
          categoryId: keeper.id
        }
      }),
      client.category.update({
        where: {
          id: keeper.id
        },
        data: {
          isDefault: duplicates.some((item) => item.isDefault),
          keywords: mergedKeywords
        }
      }),
      client.category.deleteMany({
        where: {
          tenantId,
          id: {
            in: redundantIds
          }
        }
      })
    ]);
  }
}

export async function ensureTenantDefaultCategories(tenantId: string, client: CategoryClient = prisma) {
  await dedupeTenantCategories(tenantId, client);

  const existing = await client.category.findMany({
    where: { tenantId },
    select: { name: true, type: true }
  });

  const existingKeys = new Set(existing.map((item) => getCategoryKey(item.type, item.name)));
  const missing = defaultCategories.filter(
    (item) => !existingKeys.has(getCategoryKey(item.type, item.name))
  );

  if (!missing.length) {
    return;
  }

  for (const category of missing) {
    await client.category.create({
      data: {
        tenantId,
        name: category.name,
        icon: category.icon,
        color: category.color,
        type: category.type,
        isDefault: category.isDefault,
        keywords: dedupeKeywords(category.keywords)
      }
    });
  }
}

export function getFallbackCategoryName(type: "income" | "expense") {
  return type === "income" ? "Outras receitas" : "Outras despesas";
}

export async function ensureFallbackCategory(
  tenantId: string,
  type: "income" | "expense",
  client: CategoryClient = prisma
) {
  const fallbackName = getFallbackCategoryName(type);
  const existing = await client.category.findFirst({
    where: {
      tenantId,
      type,
      name: {
        equals: fallbackName,
        mode: "insensitive"
      }
    },
    select: {
      id: true
    }
  });

  if (existing) {
    return existing.id;
  }

  const definition = defaultCategories.find(
    (item) => item.type === type && normalizeCategoryName(item.name).toLowerCase() === fallbackName.toLowerCase()
  );

  if (!definition) {
    return null;
  }

  const created = await client.category.create({
    data: {
      tenantId,
      name: definition.name,
      icon: definition.icon,
      color: definition.color,
      type: definition.type,
      isDefault: true,
      keywords: buildCategoryKeywords(definition.name, definition.keywords)
    }
  });

  return created.id;
}
