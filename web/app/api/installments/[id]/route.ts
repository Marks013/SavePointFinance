import { NextResponse } from "next/server";

import {
  installmentGroupUpdateSchema,
  installmentReconcileSchema
} from "@/features/installments/schemas/installment-schema";
import { requireSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/client";

type Params = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;

    await prisma.transaction.deleteMany({
      where: {
        tenantId: user.tenantId,
        OR: [{ id }, { parentId: id }]
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to delete installment group" }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const payload = await request.json();

    const root = await prisma.transaction.findFirst({
      where: {
        id,
        tenantId: user.tenantId,
        installmentsTotal: {
          gt: 1
        }
      }
    });

    if (!root) {
      return NextResponse.json({ message: "Installment group not found" }, { status: 404 });
    }

    const reconcileResult = installmentReconcileSchema.safeParse(payload);

    if (reconcileResult.success) {
      const today = new Date();
      const updated = await prisma.transaction.updateMany({
        where: {
          tenantId: user.tenantId,
          OR: [{ id }, { parentId: id }],
          date: {
            lte: today
          },
          settledAt: null
        },
        data: {
          settledAt: today
        }
      });

      return NextResponse.json({
        reconciled: updated.count
      });
    }

    const body = installmentGroupUpdateSchema.parse(payload);
    const installments = await prisma.transaction.findMany({
      where: {
        tenantId: user.tenantId,
        OR: [{ id }, { parentId: id }]
      },
      orderBy: {
        installmentNumber: "asc"
      }
    });

    await prisma.$transaction(
      installments.map((installment) =>
        prisma.transaction.update({
          where: {
            id: installment.id
          },
          data: {
            description: `${body.description} (${installment.installmentNumber}/${installment.installmentsTotal})`,
            ...(typeof body.amount === "number"
              ? {
                  amount: body.amount
                }
              : {}),
            categoryId: body.categoryId || null,
            notes: body.notes?.trim() || null
          }
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to update installment group" }, { status: 400 });
  }
}
