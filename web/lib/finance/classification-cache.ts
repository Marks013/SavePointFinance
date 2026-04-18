import type { CategoryType, CategoryRuleMatchMode, CategoryRuleSource } from "@prisma/client";

import { prisma } from "@/lib/prisma/client";

export type TenantClassificationCategory = {
  id: string;
  name: string;
  systemKey: string | null;
  type: CategoryType;
  keywords: string[];
};

export type TenantClassificationRule = {
  id: string;
  categoryId: string;
  type: CategoryType;
  normalizedKeyword: string;
  matchMode: CategoryRuleMatchMode;
  source: CategoryRuleSource;
  priority: number;
  confidence: number | null;
};

export type GlobalClassificationRule = {
  id: string;
  categorySystemKey: string;
  type: CategoryType;
  normalizedKeyword: string;
  matchMode: CategoryRuleMatchMode;
  priority: number;
  confidence: number | null;
};

type TenantClassificationContext = {
  categories: TenantClassificationCategory[];
  rules: TenantClassificationRule[];
  expiresAt: number;
};

const TENANT_CLASSIFICATION_CACHE_TTL_MS = 30_000;
const tenantClassificationCache = new Map<string, TenantClassificationContext>();
const GLOBAL_CLASSIFICATION_CACHE_TTL_MS = 30_000;

let globalClassificationCache:
  | {
      rules: GlobalClassificationRule[];
      expiresAt: number;
    }
  | null = null;

function sortRules<T extends { priority: number; normalizedKeyword: string }>(rules: T[]) {
  return [...rules].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority;
    }

    return right.normalizedKeyword.length - left.normalizedKeyword.length;
  });
}

export function invalidateTenantClassificationCache(tenantId: string) {
  tenantClassificationCache.delete(tenantId);
}

export function invalidateGlobalClassificationCache() {
  globalClassificationCache = null;
}

export async function getTenantClassificationContext(tenantId: string) {
  const cached = tenantClassificationCache.get(tenantId);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      categories: cached.categories,
      rules: cached.rules
    };
  }

  const [categories, rules] = await Promise.all([
    prisma.category.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        systemKey: true,
        type: true,
        keywords: true
      }
    }),
    prisma.categoryRule.findMany({
      where: {
        tenantId,
        isActive: true
      },
      select: {
        id: true,
        categoryId: true,
        type: true,
        normalizedKeyword: true,
        matchMode: true,
        source: true,
        priority: true,
        confidence: true
      }
    })
  ]);

  const nextValue: TenantClassificationContext = {
    categories,
    rules: sortRules(
      rules.map((rule) => ({
        ...rule,
        confidence: rule.confidence ? Number(rule.confidence) : null
      }))
    ),
    expiresAt: Date.now() + TENANT_CLASSIFICATION_CACHE_TTL_MS
  };

  tenantClassificationCache.set(tenantId, nextValue);

  return {
    categories: nextValue.categories,
    rules: nextValue.rules
  };
}

export async function getGlobalClassificationRules() {
  if (globalClassificationCache && globalClassificationCache.expiresAt > Date.now()) {
    return globalClassificationCache.rules;
  }

  const globalCategoryRuleDelegate = (
    prisma as typeof prisma & {
      globalCategoryRule: {
        findMany: (args: Record<string, unknown>) => Promise<Array<{
          id: string;
          categorySystemKey: string;
          type: CategoryType;
          normalizedKeyword: string;
          matchMode: CategoryRuleMatchMode;
          priority: number;
          confidence: unknown;
        }>>;
      };
    }
  ).globalCategoryRule;

  const rules = await globalCategoryRuleDelegate.findMany({
    where: {
      isActive: true
    },
    select: {
      id: true,
      categorySystemKey: true,
      type: true,
      normalizedKeyword: true,
      matchMode: true,
      priority: true,
      confidence: true
    }
  });

  const nextValue: {
    rules: GlobalClassificationRule[];
    expiresAt: number;
  } = {
    rules: sortRules(
      rules.map((rule: (typeof rules)[number]) => ({
        ...rule,
        confidence: rule.confidence ? Number(rule.confidence) : null
      }))
    ),
    expiresAt: Date.now() + GLOBAL_CLASSIFICATION_CACHE_TTL_MS
  };

  globalClassificationCache = nextValue;

  return nextValue.rules;
}
