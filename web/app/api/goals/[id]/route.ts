import { NextResponse } from "next/server";

import { goalFormSchema } from "@/features/goals/schemas/goal-schema";
import { requireSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/client";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const body = goalFormSchema.parse(await request.json());

    const updated = await prisma.goal.update({
      where: {
        id,
        tenantId: user.tenantId
      },
      data: {
        accountId: body.accountId || null,
        name: body.name,
        targetAmount: body.targetAmount,
        currentAmount: body.currentAmount,
        deadline: body.deadline ? new Date(`${body.deadline}T12:00:00`) : null,
        color: body.color,
        icon: body.icon?.trim() || null,
        isCompleted: body.currentAmount >= body.targetAmount,
        completedAt: body.currentAmount >= body.targetAmount ? new Date() : null
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to update goal" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;

    await prisma.goal.delete({
      where: {
        id,
        tenantId: user.tenantId
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to delete goal" }, { status: 400 });
  }
}
