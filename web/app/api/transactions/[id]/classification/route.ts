import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSessionUser } from "@/lib/auth/session";
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

    const category = await prisma.category.findFirst({
      where: {
        id: body.categoryId,
        tenantId: user.tenantId,
        type: transaction.type
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
        parentId: true
      }
    });

    if (!target) {
      return NextResponse.json({ message: "Transaction not found" }, { status: 404 });
    }

    if (body.applyToInstallments && target.parentId) {
      await prisma.transaction.updateMany({
        where: {
          tenantId: user.tenantId,
          OR: [{ id: target.parentId }, { parentId: target.parentId }]
        },
        data: {
          categoryId: category.id,
          aiClassified: false,
          aiConfidence: null
        }
      });
    } else {
      await prisma.transaction.update({
        where: {
          id,
          tenantId: user.tenantId
        },
        data: {
          categoryId: category.id,
          aiClassified: false,
          aiConfidence: null
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to review classification" }, { status: 400 });
  }
}
