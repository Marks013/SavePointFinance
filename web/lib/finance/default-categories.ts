import defaultsData from "@/lib/finance/default-categories.json";
import type { PrismaClient } from "@prisma/client";

import { normalizeClassificationKeyword } from "@/lib/finance/classification-normalization";
import { prisma } from "@/lib/prisma/client";

type DefaultCategoryDefinition = {
  name: string;
  icon: string;
  color: string;
  type: "income" | "expense";
  isDefault: boolean;
  keywords: string[];
  systemKey?: string;
};

export const defaultCategories = defaultsData as DefaultCategoryDefinition[];

const DEFAULT_CATEGORY_SYSTEM_KEYS = {
  "income:salario": "salario",
  "income:freelance e servicos": "freelance-servicos",
  "income:rendimentos": "rendimentos",
  "income:reembolso": "reembolso",
  "income:vendas": "vendas",
  "income:transferencias recebidas": "transferencias-recebidas",
  "income:outras receitas": "outras-receitas",
  "expense:supermercado": "supermercado",
  "expense:feira e hortifruti": "feira-hortifruti",
  "expense:restaurantes": "restaurantes",
  "expense:delivery": "delivery",
  "expense:cafe e padaria": "cafe-padaria",
  "expense:combustivel": "combustivel",
  "expense:transporte": "transporte",
  "expense:apps de mobilidade": "apps-mobilidade",
  "expense:moradia": "moradia",
  "expense:condominio": "condominio",
  "expense:energia eletrica": "energia-eletrica",
  "expense:agua e saneamento": "agua-saneamento",
  "expense:internet e telefonia": "internet-telefonia",
  "expense:saude": "saude",
  "expense:farmacia": "farmacia",
  "expense:educacao": "educacao",
  "expense:streaming e assinaturas": "streaming-assinaturas",
  "expense:lazer": "lazer",
  "expense:pets": "pets",
  "expense:impostos e taxas": "impostos-taxas",
  "expense:tarifas bancarias": "tarifas-bancarias",
  "expense:dizimo": "dizimo",
  "expense:compras online": "compras-online",
  "expense:vestuario": "vestuario",
  "expense:viagem": "viagem",
  "expense:outras despesas": "outras-despesas"
} as const;

export type DefaultCategorySystemKey = (typeof DEFAULT_CATEGORY_SYSTEM_KEYS)[keyof typeof DEFAULT_CATEGORY_SYSTEM_KEYS];

export function normalizeCategoryName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function dedupeKeywords(keywords: string[]) {
  return Array.from(
    new Set(
      keywords
        .map((keyword) => normalizeClassificationKeyword(keyword))
        .filter(Boolean)
    )
  );
}

export function buildCategoryKeywords(name: string, keywords: string[]) {
  return dedupeKeywords([name, ...keywords]);
}

export function getDefaultCategorySystemKey(type: "income" | "expense", name: string) {
  const normalizedName = normalizeClassificationKeyword(name);
  return DEFAULT_CATEGORY_SYSTEM_KEYS[`${type}:${normalizedName}` as keyof typeof DEFAULT_CATEGORY_SYSTEM_KEYS] ?? null;
}

function getDefaultCategoryDefinition(type: "income" | "expense", name: string) {
  const normalizedName = normalizeClassificationKeyword(name);
  return defaultCategories.find((item) => item.type === type && normalizeClassificationKeyword(item.name) === normalizedName) ?? null;
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
      systemKey: true,
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
    const mergedSystemKey =
      duplicates.find((item) => item.systemKey)?.systemKey ?? getDefaultCategorySystemKey(keeper.type, keeper.name);

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
          systemKey: mergedSystemKey,
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

  if (missing.length) {
    for (const category of missing) {
      await client.category.create({
        data: {
          tenantId,
          name: category.name,
          systemKey: category.systemKey ?? getDefaultCategorySystemKey(category.type, category.name),
          icon: category.icon,
          color: category.color,
          type: category.type,
          isDefault: category.isDefault,
          keywords: dedupeKeywords(category.keywords)
        }
      });
    }
  }

  const categoriesMissingSystemKey = await client.category.findMany({
    where: {
      tenantId,
      systemKey: null
    },
    select: {
      id: true,
      name: true,
      type: true
    }
  });

  for (const category of categoriesMissingSystemKey) {
    const systemKey = getDefaultCategorySystemKey(category.type, category.name);
    if (!systemKey) {
      continue;
    }

    await client.category.update({
      where: {
        id: category.id
      },
      data: {
        systemKey
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

  const definition = getDefaultCategoryDefinition(type, fallbackName);

  if (!definition) {
    return null;
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
