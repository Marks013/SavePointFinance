import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireSessionUser } from "@/lib/auth/session";
import { classifyTransactionCategory } from "@/lib/finance/category-classifier";
import { ensureFallbackCategory } from "@/lib/finance/default-categories";
import { ensureTitheCategory, syncTitheForTransactionDates } from "@/lib/finance/tithe";
import { prisma } from "@/lib/prisma/client";
import { transactionFormSchema } from "@/features/transactions/schemas/transaction-schema";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const body = transactionFormSchema.parse(await request.json());
    const existingTransaction = await prisma.transaction.findFirstOrThrow({
      where: {
        id,
        tenantId: user.tenantId
      },
      select: {
        id: true,
        date: true,
        titheAmount: true,
        notes: true,
        userId: true
      }
    });

    if (existingTransaction.notes?.startsWith("[AUTO_TITHE:")) {
      return NextResponse.json({ message: "O dízimo consolidado é gerado automaticamente" }, { status: 400 });
    }
    const notes = body.notes?.trim() || null;
    const categories = await prisma.category.findMany({
      where: {
        tenantId: user.tenantId
      },
      select: {
        id: true,
        name: true,
        type: true,
        keywords: true
      }
    });
    const history = await prisma.transaction.findMany({
      where: {
        tenantId: user.tenantId,
        type: body.type,
        categoryId: {
          not: null
        },
        id: {
          not: id
        }
      },
      select: {
        categoryId: true,
        description: true,
        notes: true,
        aiClassified: true,
        aiConfidence: true
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 250
    });
    const classification =
      body.categoryId || body.type === "transfer"
        ? {
            categoryId: body.categoryId || null,
            confidence: null,
            aiClassified: false
          }
        : await classifyTransactionCategory({
            type: body.type,
            description: body.description,
            notes,
            paymentMethod: body.paymentMethod,
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

    const categoryId =
      classification.categoryId ||
      (body.type !== "transfer" ? await ensureFallbackCategory(user.tenantId, body.type) : null);
    const applyTithe = body.type === "income" && body.applyTithe;
    const titheCategoryId = applyTithe ? await ensureTitheCategory(user.tenantId) : null;
    const updatedDate = new Date(`${body.date}T12:00:00`);

    const updated = await prisma.transaction.update({
      where: {
        id,
        tenantId: user.tenantId
      },
      data: {
        date: updatedDate,
        amount: body.amount,
        description: body.description,
        type: body.type,
        paymentMethod: body.paymentMethod,
        categoryId,
        accountId: body.accountId || null,
        destinationAccountId: body.destinationAccountId || null,
        cardId: body.cardId || null,
        notes,
        titheAmount: applyTithe ? new Prisma.Decimal((body.amount * 0.1).toFixed(2)) : null,
        titheCategoryId,
        aiClassified: classification.aiClassified,
        aiConfidence:
          classification.confidence !== null ? new Prisma.Decimal(classification.confidence.toFixed(2)) : null
      }
    });

    if (applyTithe || Number(existingTransaction.titheAmount ?? 0) > 0) {
      await syncTitheForTransactionDates({
        tenantId: user.tenantId,
        userId: existingTransaction.userId ?? user.id,
        dates: [existingTransaction.date, updatedDate]
      });
    }

    return NextResponse.json({
      id: updated.id
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to update transaction" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const existingTransaction = await prisma.transaction.findFirstOrThrow({
      where: {
        id,
        tenantId: user.tenantId
      },
      select: {
        date: true,
        titheAmount: true,
        notes: true,
        userId: true
      }
    });

    if (existingTransaction.notes?.startsWith("[AUTO_TITHE:")) {
      return NextResponse.json({ message: "O dízimo consolidado é gerado automaticamente" }, { status: 400 });
    }

    await prisma.transaction.delete({
      where: {
        id,
        tenantId: user.tenantId
      }
    });

    if (Number(existingTransaction.titheAmount ?? 0) > 0) {
      await syncTitheForTransactionDates({
        tenantId: user.tenantId,
        userId: existingTransaction.userId ?? user.id,
        dates: [existingTransaction.date]
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to delete transaction" }, { status: 400 });
  }
}
