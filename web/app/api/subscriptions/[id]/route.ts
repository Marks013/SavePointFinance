import { NextResponse } from "next/server";

import { subscriptionFormSchema } from "@/features/subscriptions/schemas/subscription-schema";
import { requireSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/client";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;
    const body = subscriptionFormSchema.parse(await request.json());

    await prisma.subscription.update({
      where: { id, tenantId: user.tenantId, userId: user.id },
      data: {
        name: body.name,
        amount: body.amount,
        billingDay: body.billingDay,
        categoryId: body.categoryId || null,
        accountId: body.accountId || null,
        cardId: body.cardId || null,
        nextBillingDate: new Date(`${body.nextBillingDate}T12:00:00`),
        type: body.type,
        isActive: body.isActive,
        autoTithe: body.autoTithe && body.type === "income"
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to update subscription" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: Params) {
  try {
    const user = await requireSessionUser();
    const { id } = await context.params;

    await prisma.subscription.delete({
      where: { id, tenantId: user.tenantId, userId: user.id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to delete subscription" }, { status: 400 });
  }
}
