import { NextResponse } from "next/server";

import { subscriptionFormSchema } from "@/features/subscriptions/schemas/subscription-schema";
import { syncDueSubscriptionTransactions } from "@/lib/automation/subscriptions";
import { requireSessionUser } from "@/lib/auth/session";
import { assertTenantTransactionReferences, TenantReferenceError } from "@/lib/finance/tenant-reference-guard";
import { prisma } from "@/lib/prisma/client";

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    void request;
    await syncDueSubscriptionTransactions({
      tenantId: user.tenantId,
      userId: user.id
    });
    const subscriptions = await prisma.subscription.findMany({
      where: {
        tenantId: user.tenantId
      },
      include: {
        category: true,
        account: true,
        card: true
      },
      orderBy: [{ isActive: "desc" }, { nextBillingDate: "asc" }, { name: "asc" }]
    });

    return NextResponse.json({
      items: subscriptions.map((subscription) => ({
        id: subscription.id,
        name: subscription.name,
        amount: Number(subscription.amount),
        billingDay: subscription.billingDay,
        nextBillingDate: subscription.nextBillingDate.toISOString(),
        type: subscription.type,
        isActive: subscription.isActive,
        autoTithe: subscription.autoTithe,
        category: subscription.category ? { id: subscription.category.id, name: subscription.category.name } : null,
        account: subscription.account ? { id: subscription.account.id, name: subscription.account.name } : null,
        card: subscription.card ? { id: subscription.card.id, name: subscription.card.name } : null
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({ message: "Failed to load subscriptions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser();
    const body = subscriptionFormSchema.parse(await request.json());

    await assertTenantTransactionReferences({
      tenantId: user.tenantId,
      accountId: body.accountId,
      cardId: body.cardId,
      categoryId: body.categoryId
    });

    const subscription = await prisma.subscription.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
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

    return NextResponse.json({ id: subscription.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof TenantReferenceError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    return NextResponse.json({ message: "Failed to create subscription" }, { status: 400 });
  }
}
