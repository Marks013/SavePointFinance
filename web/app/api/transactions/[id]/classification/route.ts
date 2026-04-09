import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSessionUser } from "@/lib/auth/session";
import { deriveRuleKeyword } from "@/lib/finance/category-rules";
import { invalidateTenantClassificationCache } from "@/lib/finance/classification-cache";
import { prisma } from "@/lib/prisma/client";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

const classificationReviewSchema = z.object({
  categoryId: z.string().min(1, "Informe a categoria"),
  applyToInstallments: z.boolean().optional().default(false)
});

export async function PATCH(request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const body = classificationReviewSchema.parse(await request.json());

    const transaction = await prisma.transaction.findFirst({
      where: {
        id,
        tenantId: user.tenantId
      },
      select: {
        id: true,
        type: true
      }
    });

    if (!transaction) {
      return NextResponse.json({ message: "Transaction not found" }, { status: 404 });
    }

    if (transaction.type === "transfer") {
      return NextResponse.json({ message: "Transfers do not support categories" }, { status: 400 });
    }

    const categoryType: "income" | "expense" = transaction.type;

    const category = await prisma.category.findFirst({
      where: {
        id: body.categoryId,
        tenantId: user.tenantId,
        type: categoryType
      },
      select: {
        id: true
      }
    });

    if (!category) {
      return NextResponse.json({ message: "Invalid category for transaction type" }, { status: 400 });
    }

    const target = await prisma.transaction.findFirst({
      where: {
        id,
        tenantId: user.tenantId
      },
      select: {
        id: true,
        parentId: true,
        description: true,
        notes: true,
        classificationKeyword: true
      }
    });

    if (!target) {
      return NextResponse.json({ message: "Transaction not found" }, { status: 404 });
    }

    const ruleKeyword = deriveRuleKeyword({
      existingKeyword: target.classificationKeyword,
      description: target.description,
      notes: target.notes
    });
    const rootId = target.parentId ?? target.id;

    await prisma.$transaction(async (tx) => {
      const transactionData = {
        categoryId: category.id,
        classificationSource: "manual_rule" as const,
        classificationKeyword: ruleKeyword,
        classificationReason: "Classificacao revisada manualmente",
        classificationVersion: 2,
        aiClassified: false,
        aiConfidence: null
      };

      if (body.applyToInstallments) {
        await tx.transaction.updateMany({
          where: {
            tenantId: user.tenantId,
            OR: [{ id: rootId }, { parentId: rootId }]
          },
          data: transactionData
        });
      } else {
        await tx.transaction.update({
          where: {
            id,
            tenantId: user.tenantId
          },
          data: transactionData
        });
      }

      if (!ruleKeyword) {
        return;
      }

      await tx.categoryRule.updateMany({
        where: {
          tenantId: user.tenantId,
          type: categoryType,
          normalizedKeyword: ruleKeyword,
          source: "ai_learned",
          isActive: true
        },
        data: {
          isActive: false
        }
      });

      const existingRule = await tx.categoryRule.findFirst({
        where: {
          tenantId: user.tenantId,
          type: categoryType,
          normalizedKeyword: ruleKeyword,
          source: "manual",
          matchMode: "exact_phrase"
        },
        select: {
          id: true
        }
      });

      if (existingRule) {
        await tx.categoryRule.update({
          where: {
            id: existingRule.id
          },
          data: {
            categoryId: category.id,
            isActive: true,
            priority: 1000,
            confidence: 1,
            createdFromTransactionId: target.id
          }
        });
      } else {
        await tx.categoryRule.create({
          data: {
            tenantId: user.tenantId,
            categoryId: category.id,
            type: categoryType,
            normalizedKeyword: ruleKeyword,
            source: "manual",
            matchMode: "exact_phrase",
            priority: 1000,
            confidence: 1,
            createdFromTransactionId: target.id
          }
        });
      }
    });

    invalidateTenantClassificationCache(user.tenantId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to review classification" }, { status: 400 });
  }
}
