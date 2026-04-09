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

type TenantClassificationContext = {
  categories: TenantClassificationCategory[];
  rules: TenantClassificationRule[];
  expiresAt: number;
};

const TENANT_CLASSIFICATION_CACHE_TTL_MS = 30_000;
const tenantClassificationCache = new Map<string, TenantClassificationContext>();

function sortRules(rules: TenantClassificationRule[]) {
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
