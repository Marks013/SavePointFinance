import { NextResponse } from "next/server";

import { goalFormSchema } from "@/features/goals/schemas/goal-schema";
import { requireSessionUser } from "@/lib/auth/session";
import { assertTenantAccountReference, TenantReferenceError } from "@/lib/finance/tenant-reference-guard";
import { captureRequestError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    const goals = await prisma.goal.findMany({
      where: {
        tenantId: user.tenantId
      },
      include: {
        account: true
      },
      orderBy: [{ isCompleted: "asc" }, { createdAt: "desc" }]
    });

    return NextResponse.json({
      items: goals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        targetAmount: Number(goal.targetAmount),
        currentAmount: Number(goal.currentAmount),
        deadline: goal.deadline?.toISOString() ?? null,
        color: goal.color,
        icon: goal.icon,
        isCompleted: goal.isCompleted,
        progress: Number(goal.targetAmount) > 0 ? Number(goal.currentAmount) / Number(goal.targetAmount) : 0,
        account: goal.account
          ? {
              id: goal.account.id,
              name: goal.account.name
            }
          : null
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "goals" });
    return NextResponse.json({ message: "Failed to load goals" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = goalFormSchema.parse(await request.json());

    await assertTenantAccountReference(user.tenantId, body.accountId);

    const goal = await prisma.goal.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
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

    return NextResponse.json(
      {
        id: goal.id,
        name: goal.name
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof TenantReferenceError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    captureRequestError(error, { request, feature: "goals" });
    return NextResponse.json({ message: "Failed to create goal" }, { status: 400 });
  }
}
