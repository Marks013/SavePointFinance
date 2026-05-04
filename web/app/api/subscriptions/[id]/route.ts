import { after, NextResponse } from "next/server";

import { subscriptionFormSchema } from "@/features/subscriptions/schemas/subscription-schema";
import { syncDueSubscriptionTransactions } from "@/lib/automation/subscriptions";
import { requireSessionUser } from "@/lib/auth/session";
import { revalidateFinanceReports } from "@/lib/cache/finance-read-models";
import { BenefitWalletRuleError, validateBenefitWalletTransaction } from "@/lib/finance/benefit-wallet";
import { resolveTransactionClassification } from "@/lib/finance/transaction-classification";
import { assertTenantTransactionReferences, TenantReferenceError } from "@/lib/finance/tenant-reference-guard";
import { captureRequestError, captureUnexpectedError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";
import { isBeforeCurrentSubscriptionMonth } from "@/lib/subscriptions/recurrence";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: Params) {
  try {
    const user = await requireSessionUser({ feature: "automation" });
    const { id } = await context.params;
    const body = subscriptionFormSchema.parse(await request.json());
    const nextBillingDate = new Date(`${body.nextBillingDate}T12:00:00`);

    if (isBeforeCurrentSubscriptionMonth(nextBillingDate)) {
      return NextResponse.json(
        { message: "Assinaturas retroativas só podem começar no mês atual. Use uma transação manual para meses anteriores." },
        { status: 400 }
      );
    }

    await assertTenantTransactionReferences({
      tenantId: user.tenantId,
      accountId: body.accountId,
      cardId: body.cardId,
      categoryId: body.categoryId
    });
    await validateBenefitWalletTransaction({
      tenantId: user.tenantId,
      type: body.type,
      paymentMethod: body.cardId ? "credit_card" : "money",
      accountId: body.accountId,
      destinationAccountId: null,
      categoryId: body.categoryId || null,
      cardId: body.cardId
    });

    const classification = await resolveTransactionClassification({
      tenantId: user.tenantId,
      type: body.type,
      description: body.name,
      paymentMethod: body.cardId ? "credit_card" : "money",
      categoryId: body.categoryId || null
    });

    await prisma.subscription.update({
      where: { id, tenantId: user.tenantId },
      data: {
        name: body.name,
        amount: body.amount,
        billingDay: body.billingDay,
        categoryId: classification.categoryId,
        accountId: body.accountId || null,
        cardId: body.cardId || null,
        nextBillingDate,
        type: body.type,
        isActive: body.isActive,
        autoTithe: body.autoTithe && body.type === "income"
      }
    });
    revalidateFinanceReports(user.tenantId);

    after(async () => {
      await syncDueSubscriptionTransactions({
        tenantId: user.tenantId,
        userId: user.id
      }).catch((error) =>
        captureUnexpectedError(error, {
          surface: "api-post-processing",
          route: `/api/subscriptions/${id}`,
          operation: "PATCH",
          feature: "subscriptions",
          tenantId: user.tenantId,
          userId: user.id,
          entityId: id,
          dedupeKey: `subscriptions:post-update-sync:${id}`
        })
      );
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (error instanceof TenantReferenceError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    if (error instanceof BenefitWalletRuleError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    captureRequestError(error, { request, feature: "subscriptions" });
    return NextResponse.json({ message: "Failed to update subscription" }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: Params) {
  try {
    const user = await requireSessionUser({ feature: "automation" });
    const { id } = await context.params;

    await prisma.subscription.delete({
      where: { id, tenantId: user.tenantId }
    });
    revalidateFinanceReports(user.tenantId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "subscriptions" });
    return NextResponse.json({ message: "Failed to delete subscription" }, { status: 400 });
  }
}
