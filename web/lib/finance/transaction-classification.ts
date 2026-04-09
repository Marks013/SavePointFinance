import { type PaymentMethod, type Prisma, type TransactionType } from "@prisma/client";

import { classifyTransactionCategory } from "@/lib/finance/category-classifier";
import { ensureFallbackCategory } from "@/lib/finance/default-categories";
import { prisma } from "@/lib/prisma/client";

type ClassificationInput = {
  tenantId: string;
  type: TransactionType | "income" | "expense";
  description: string;
  notes?: string | null;
  paymentMethod: PaymentMethod;
  categoryId?: string | null;
  excludeTransactionId?: string;
};

type ClassificationOutput = {
  categoryId: string | null;
  confidence: number | null;
  aiClassified: boolean;
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
      reason: "Transferências não usam categoria"
    };
  }

  if (input.categoryId) {
    return {
      categoryId: input.categoryId,
      confidence: null,
      aiClassified: false,
      reason: "Categoria definida manualmente"
    };
  }

  const categories = await prisma.category.findMany({
    where: {
      tenantId: input.tenantId
    },
    select: {
      id: true,
      name: true,
      type: true,
      keywords: true
    }
  });

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
      aiClassified: true,
      aiConfidence: true
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 120
  });

  const classification = await classifyTransactionCategory({
    type: input.type,
    description: input.description,
    notes: input.notes ?? null,
    paymentMethod: input.paymentMethod,
    categories,
    history: history
      .filter((item): item is typeof item & { categoryId: string } => Boolean(item.categoryId))
      .map((item) => ({
        categoryId: item.categoryId,
        description: item.description,
        notes: item.notes,
        aiClassified: item.aiClassified,
        aiConfidence: item.aiConfidence ? Number(item.aiConfidence) : null
      }))
  });

  return {
    ...classification,
    categoryId: classification.categoryId ?? (await ensureFallbackCategory(input.tenantId, input.type))
  };
}
