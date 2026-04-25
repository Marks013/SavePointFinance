import { after, NextResponse } from "next/server";

import { subscriptionFormSchema } from "@/features/subscriptions/schemas/subscription-schema";
import { syncDueSubscriptionTransactions } from "@/lib/automation/subscriptions";
import { requireSessionUser } from "@/lib/auth/session";
import { revalidateFinanceReports } from "@/lib/cache/finance-read-models";
import { BenefitWalletRuleError, validateBenefitWalletTransaction } from "@/lib/finance/benefit-wallet";
import { resolveTransactionClassification } from "@/lib/finance/transaction-classification";
import { assertTenantTransactionReferences, TenantReferenceError } from "@/lib/finance/tenant-reference-guard";
import { getMonthRange, normalizeMonthKey } from "@/lib/month";
import { captureRequestError, captureUnexpectedError } from "@/lib/observability/sentry";
import { prisma } from "@/lib/prisma/client";
import { getSubscriptionBillingDate } from "@/lib/subscriptions/recurrence";

function readAccountUsage(account: unknown) {
  return (account as { usage?: "standard" | "benefit_food" }).usage ?? "standard";
}

function getProjectedOccurrenceDate(subscription: { nextBillingDate: Date; billingDay: number }, month: string) {
  const nextBillingMonth = subscription.nextBillingDate.toISOString().slice(0, 7);

  if (month === nextBillingMonth) {
    return subscription.nextBillingDate;
  }

  if (month < nextBillingMonth) {
    return null;
  }

  const [year, monthNumber] = month.split("-").map(Number);
  return getSubscriptionBillingDate(Number(year), Number(monthNumber) - 1, subscription.billingDay);
}

export async function GET(request: Request) {
  try {
    const user = await requireSessionUser();
    await syncDueSubscriptionTransactions({
      tenantId: user.tenantId,
      userId: user.id
    });
    const { searchParams } = new URL(request.url);
    const month = normalizeMonthKey(searchParams.get("month"));
    const monthRange = month ? getMonthRange(month) : null;
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
    const monthlyTransactions =
      month && subscriptions.length > 0
        ? await prisma.transaction.findMany({
            where: {
              tenantId: user.tenantId,
              subscriptionId: {
                in: subscriptions.map((subscription) => subscription.id)
              },
              date: {
                gte: monthRange!.start,
                lte: monthRange!.end
              }
            },
            select: {
              subscriptionId: true,
              date: true
            },
            orderBy: [{ date: "asc" }, { createdAt: "asc" }]
          })
        : [];
    const transactionBySubscriptionId = new Map(
      monthlyTransactions
        .filter((transaction): transaction is typeof transaction & { subscriptionId: string } => Boolean(transaction.subscriptionId))
        .map((transaction) => [transaction.subscriptionId, transaction])
    );

    const items = subscriptions
      .map((subscription) => {
        const generatedTransaction = transactionBySubscriptionId.get(subscription.id) ?? null;
        const projectedOccurrenceDate = month ? getProjectedOccurrenceDate(subscription, month) : null;
        const includeInActiveMonth =
          !monthRange ||
          Boolean(generatedTransaction) || Boolean(projectedOccurrenceDate);

        if (!includeInActiveMonth) {
          return null;
        }

        return {
          activeMonthDate: generatedTransaction?.date.toISOString() ?? projectedOccurrenceDate?.toISOString() ?? null,
          activeMonthGenerated: monthRange ? Boolean(generatedTransaction) : null,
          activeMonthTransactionDate: generatedTransaction?.date.toISOString() ?? null,
          id: subscription.id,
          name: subscription.name,
          amount: Number(subscription.amount),
          billingDay: subscription.billingDay,
          nextBillingDate: subscription.nextBillingDate.toISOString(),
          type: subscription.type,
          isActive: subscription.isActive,
          autoTithe: subscription.autoTithe,
          category: subscription.category ? { id: subscription.category.id, name: subscription.category.name } : null,
          account: subscription.account
            ? { id: subscription.account.id, name: subscription.account.name, usage: readAccountUsage(subscription.account) }
            : null,
          card: subscription.card ? { id: subscription.card.id, name: subscription.card.name } : null
        };
      })
      .filter((subscription): subscription is NonNullable<typeof subscription> => subscription !== null);

    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    captureRequestError(error, { request, feature: "subscriptions" });
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

    const subscription = await prisma.subscription.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        name: body.name,
        amount: body.amount,
        billingDay: body.billingDay,
        categoryId: classification.categoryId,
        accountId: body.accountId || null,
        cardId: body.cardId || null,
        nextBillingDate: new Date(`${body.nextBillingDate}T12:00:00`),
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
          route: "/api/subscriptions",
          operation: "POST",
          feature: "subscriptions",
          tenantId: user.tenantId,
          userId: user.id,
          dedupeKey: "subscriptions:post-create-sync"
        })
      );
    });

    return NextResponse.json({ id: subscription.id }, { status: 201 });
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
    return NextResponse.json({ message: "Failed to create subscription" }, { status: 400 });
  }
}
