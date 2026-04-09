import type {
  CategoryRuleMatchMode,
  CategoryRuleSource,
  ClassificationSource,
  Prisma
} from "@prisma/client";

import {
  buildNormalizedBankStatementText,
  buildNormalizedClassificationText,
  normalizeClassificationKeyword,
  tokenizeClassificationText
} from "@/lib/finance/classification-normalization";
import type { TenantClassificationCategory } from "@/lib/finance/classification-cache";
import { dedupeKeywords } from "@/lib/finance/default-categories";
import { prisma } from "@/lib/prisma/client";

type RuleRecord = {
  categoryId: string;
  type: "income" | "expense";
  normalizedKeyword: string;
  matchMode: CategoryRuleMatchMode;
  source: CategoryRuleSource;
  priority: number;
  confidence: Prisma.Decimal | number | null;
};

type RuleMatch = {
  categoryId: string;
  confidence: number;
  classificationSource: ClassificationSource;
  classificationKeyword: string;
  reason: string;
};

type CategoryKeywordMatch = {
  categoryId: string;
  confidence: number;
  classificationSource: "category_keyword";
  classificationKeyword: string;
  reason: string;
};

function getRuleSourceWeight(source: CategoryRuleSource) {
  switch (source) {
    case "manual":
      return 2000;
    case "ai_learned":
      return 1000;
    default:
      return 0;
  }
}

function matchesRule(haystack: string, tokenSet: Set<string>, keyword: string, matchMode: CategoryRuleMatchMode) {
  if (!keyword) {
    return false;
  }

  if (matchMode === "contains_phrase") {
    return haystack.includes(keyword);
  }

  if (keyword.includes(" ")) {
    return haystack.includes(keyword);
  }

  return tokenSet.has(keyword);
}

export function deriveRuleKeyword(params: {
  existingKeyword?: string | null;
  description: string;
  notes?: string | null;
}) {
  const explicit = normalizeClassificationKeyword(params.existingKeyword ?? "");
  if (explicit) {
    return explicit;
  }

  const derived = buildNormalizedBankStatementText(params.description, params.notes ?? null);
  if (!derived) {
    return null;
  }

  const tokens = tokenizeClassificationText(derived).slice(0, 6);
  return tokens.join(" ").trim() || null;
}

export function matchTenantCategoryRules(
  rules: RuleRecord[],
  input: {
    type: "income" | "expense";
    description: string;
    notes?: string | null;
  }
): RuleMatch | null {
  const haystack = buildNormalizedBankStatementText(input.description, input.notes ?? null);
  const tokenSet = new Set(tokenizeClassificationText(haystack));

  const sortedRules = [...rules].sort((left, right) => {
    const leftWeight = getRuleSourceWeight(left.source) + left.priority;
    const rightWeight = getRuleSourceWeight(right.source) + right.priority;
    if (leftWeight !== rightWeight) {
      return rightWeight - leftWeight;
    }

    return right.normalizedKeyword.length - left.normalizedKeyword.length;
  });

  for (const rule of sortedRules) {
    if (rule.type !== input.type) {
      continue;
    }

    if (!matchesRule(haystack, tokenSet, rule.normalizedKeyword, rule.matchMode)) {
      continue;
    }

    return {
      categoryId: rule.categoryId,
      confidence:
        rule.source === "manual"
          ? 1
          : rule.confidence !== null && rule.confidence !== undefined
            ? Number(rule.confidence)
            : 0.9,
      classificationSource: rule.source === "manual" ? "manual_rule" : "ai_learned",
      classificationKeyword: rule.normalizedKeyword,
      reason:
        rule.source === "manual"
          ? `Regra manual: ${rule.normalizedKeyword}`
          : `Regra aprendida: ${rule.normalizedKeyword}`
    };
  }

  return null;
}

export function matchCategoryKeywords(
  categories: TenantClassificationCategory[],
  input: {
    type: "income" | "expense";
    description: string;
    notes?: string | null;
  }
): CategoryKeywordMatch | null {
  const haystack = buildNormalizedClassificationText(input.description, input.notes ?? null);
  const tokenSet = new Set(tokenizeClassificationText(haystack));
  const rankedKeywords = categories
    .filter((category) => category.type === input.type)
    .flatMap((category) =>
      dedupeKeywords(category.keywords).map((keyword) => ({
        categoryId: category.id,
        keyword
      }))
    )
    .sort((left, right) => right.keyword.length - left.keyword.length);

  for (const candidate of rankedKeywords) {
    if (!matchesRule(haystack, tokenSet, candidate.keyword, "exact_phrase")) {
      continue;
    }

    return {
      categoryId: candidate.categoryId,
      confidence: candidate.keyword.includes(" ") ? 0.97 : 0.94,
      classificationSource: "category_keyword",
      classificationKeyword: candidate.keyword,
      reason: `Keyword da categoria: ${candidate.keyword}`
    };
  }

  return null;
}

export async function upsertManualCategoryRule(input: {
  tenantId: string;
  categoryId: string;
  type: "income" | "expense";
  description: string;
  notes?: string | null;
  existingKeyword?: string | null;
  createdFromTransactionId?: string | null;
}) {
  const normalizedKeyword = deriveRuleKeyword({
    existingKeyword: input.existingKeyword,
    description: input.description,
    notes: input.notes ?? null
  });

  if (!normalizedKeyword) {
    return null;
  }

  return prisma.categoryRule.upsert({
    where: {
      tenantId_type_normalizedKeyword_source_matchMode: {
        tenantId: input.tenantId,
        type: input.type,
        normalizedKeyword,
        source: "manual",
        matchMode: "exact_phrase"
      }
    },
    update: {
      categoryId: input.categoryId,
      priority: 1000,
      confidence: 0.99,
      isActive: true,
      createdFromTransactionId: input.createdFromTransactionId ?? undefined
    },
    create: {
      tenantId: input.tenantId,
      categoryId: input.categoryId,
      type: input.type,
      normalizedKeyword,
      matchMode: "exact_phrase",
      source: "manual",
      priority: 1000,
      confidence: 0.99,
      createdFromTransactionId: input.createdFromTransactionId ?? null
    }
  });
}
