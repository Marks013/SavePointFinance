import {
  type ClassificationSource,
  type PaymentMethod,
  type Prisma,
  type TransactionType
} from "@prisma/client";

import { classifyTransactionCategory } from "@/lib/finance/category-classifier";
import {
  getGlobalClassificationRules,
  getTenantClassificationContext
} from "@/lib/finance/classification-cache";
import {
  matchCategoryKeywords,
  matchGlobalCategoryRules,
  matchTenantCategoryRules,
} from "@/lib/finance/category-rules";
import { ensureFallbackCategory } from "@/lib/finance/default-categories";
import { matchGlobalKeywordContext } from "@/lib/finance/global-keywords";
import { prisma } from "@/lib/prisma/client";
import { isAllowedBenefitFoodCategory } from "@/lib/finance/benefit-wallet-rules";

type ClassificationInput = {
  tenantId: string;
  type: TransactionType | "income" | "expense";
  description: string;
  notes?: string | null;
  paymentMethod: PaymentMethod;
  categoryId?: string | null;
  excludeTransactionId?: string;
  allowedCategorySystemKeys?: readonly string[];
};

type ClassificationOutput = {
  categoryId: string | null;
  confidence: number | null;
  aiClassified: boolean;
  classificationSource: ClassificationSource;
  classificationKeyword: string | null;
  reason: string;
};

export async function resolveTransactionClassification(
  input: ClassificationInput
): Promise<ClassificationOutput> {
  if (input.type === "transfer") {
    return {
      categoryId: null,
      confidence: null,
      aiClassified: false,
      classificationSource: "unknown",
      classificationKeyword: null,
      reason: "Transferências não usam categoria"
    };
  }

  if (input.categoryId) {
    return {
      categoryId: input.categoryId,
      confidence: null,
      aiClassified: false,
      classificationSource: "manual_input",
      classificationKeyword: null,
      reason: "Categoria definida manualmente"
    };
  }

  const [{ categories: tenantCategories, rules: tenantCategoryRules }, globalClassificationRules] = await Promise.all([
    getTenantClassificationContext(input.tenantId),
    getGlobalClassificationRules()
  ]);
  const allowedCategorySystemKeys = new Set(input.allowedCategorySystemKeys ?? []);
  const restrictCategories = allowedCategorySystemKeys.size > 0;
  const categories = tenantCategories.filter((category) => {
    if (category.type !== input.type) {
      return false;
    }

    if (!restrictCategories) {
      return true;
    }

    const systemKey = category.systemKey;
    if (!systemKey) {
      return false;
    }

    return isAllowedBenefitFoodCategory(systemKey) && allowedCategorySystemKeys.has(systemKey);
  });
  const allowedCategoryIds = new Set(categories.map((category) => category.id));
  const categoryRules = restrictCategories
    ? tenantCategoryRules.filter((rule) => allowedCategoryIds.has(rule.categoryId))
    : tenantCategoryRules;

  const manualRuleMatch = matchTenantCategoryRules(
    categoryRules.filter((rule) => rule.source === "manual"),
    {
      type: input.type,
      description: input.description,
      notes: input.notes ?? null
    }
  );

  if (manualRuleMatch) {
    return {
      categoryId: manualRuleMatch.categoryId,
      confidence: manualRuleMatch.confidence,
      aiClassified: false,
      classificationSource: manualRuleMatch.classificationSource,
      classificationKeyword: manualRuleMatch.classificationKeyword,
      reason: manualRuleMatch.reason
    };
  }

  const categoryKeywordMatch = matchCategoryKeywords(categories, {
    type: input.type,
    description: input.description,
    notes: input.notes ?? null
  });

  if (categoryKeywordMatch) {
    return {
      categoryId: categoryKeywordMatch.categoryId,
      confidence: categoryKeywordMatch.confidence,
      aiClassified: false,
      classificationSource: categoryKeywordMatch.classificationSource,
      classificationKeyword: categoryKeywordMatch.classificationKeyword,
      reason: categoryKeywordMatch.reason
    };
  }

  const aiLearnedRuleMatch = matchTenantCategoryRules(
    categoryRules.filter((rule) => rule.source === "ai_learned"),
    {
      type: input.type,
      description: input.description,
      notes: input.notes ?? null
    }
  );

  if (aiLearnedRuleMatch) {
    return {
      categoryId: aiLearnedRuleMatch.categoryId,
      confidence: aiLearnedRuleMatch.confidence,
      aiClassified: true,
      classificationSource: aiLearnedRuleMatch.classificationSource,
      classificationKeyword: aiLearnedRuleMatch.classificationKeyword,
      reason: aiLearnedRuleMatch.reason
    };
  }

  const globalAiLearnedRuleMatch = matchGlobalCategoryRules(globalClassificationRules, categories, {
    type: input.type,
    description: input.description,
    notes: input.notes ?? null
  });

  if (globalAiLearnedRuleMatch) {
    return {
      categoryId: globalAiLearnedRuleMatch.categoryId,
      confidence: globalAiLearnedRuleMatch.confidence,
      aiClassified: true,
      classificationSource: globalAiLearnedRuleMatch.classificationSource,
      classificationKeyword: globalAiLearnedRuleMatch.classificationKeyword,
      reason: globalAiLearnedRuleMatch.reason
    };
  }

  const globalMatch = matchGlobalKeywordContext({
    description: input.description,
    notes: input.notes ?? null,
    type: input.type
  });

  if (globalMatch) {
    const globalCategory = categories.find(
      (category) => category.type === input.type && category.systemKey === globalMatch.categoryKey
    );

    if (globalCategory) {
      return {
        categoryId: globalCategory.id,
        confidence: globalMatch.confidence,
        aiClassified: false,
        classificationSource: "global_context",
        classificationKeyword: globalMatch.keyword,
        reason: `Contexto global: ${globalMatch.keyword}`
      };
    }
  }

  const historyWhere: Prisma.TransactionWhereInput = {
    tenantId: input.tenantId,
    type: input.type,
    categoryId: {
      not: null
    }
  };

  if (input.excludeTransactionId) {
    historyWhere.id = {
      not: input.excludeTransactionId
    };
  }

  const history = await prisma.transaction.findMany({
    where: historyWhere,
    select: {
      categoryId: true,
      description: true,
      notes: true,
      classificationSource: true,
      aiClassified: true,
      aiConfidence: true
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 120
  });
  const filteredHistory = history.filter((item) => !restrictCategories || allowedCategoryIds.has(item.categoryId ?? ""));

  const classification = await classifyTransactionCategory({
    type: input.type,
    description: input.description,
    notes: input.notes ?? null,
    paymentMethod: input.paymentMethod,
    categories,
    history: filteredHistory
      .filter(
        (item): item is typeof item & { categoryId: string } =>
          Boolean(item.categoryId) &&
          !item.aiClassified &&
          item.classificationSource !== "fallback" &&
          item.classificationSource !== "unknown"
      )
      .map((item) => ({
        categoryId: item.categoryId,
        description: item.description,
        notes: item.notes,
        aiClassified: false,
        aiConfidence: item.aiConfidence ? Number(item.aiConfidence) : null
      }))
  });

  return {
    ...classification,
    categoryId:
      classification.categoryId ??
      (restrictCategories ? null : await ensureFallbackCategory(input.tenantId, input.type))
  };
}
