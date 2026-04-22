import { serverEnv } from "@/lib/env/server";
import { prisma } from "@/lib/prisma/client";

export class BillingPlanError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "BillingPlanError";
    this.statusCode = statusCode;
  }
}

function parseConfiguredBillingAmount() {
  const rawValue = typeof serverEnv.MP_BILLING_AMOUNT === "number" ? String(serverEnv.MP_BILLING_AMOUNT) : undefined;

  if (!rawValue) {
    return null;
  }

  return Number(serverEnv.MP_BILLING_AMOUNT!.toFixed(2));
}

export function getConfiguredBillingAmount() {
  return parseConfiguredBillingAmount();
}

export function getConfiguredBillingCurrency() {
  return serverEnv.MP_BILLING_CURRENCY.trim().toUpperCase();
}

export async function listBillablePlans() {
  const plans = await prisma.plan.findMany({
    where: {
      isActive: true,
      tier: "pro",
      trialDays: 0
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });

  const amount = getConfiguredBillingAmount();
  const currencyId = getConfiguredBillingCurrency();

  return plans.map((plan) => ({
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
    amount,
    currencyId
  }));
}

export async function resolveBillablePlan(planId?: string | null) {
  const plans = await listBillablePlans();
  const amount = getConfiguredBillingAmount();

  if (!plans.length) {
    throw new BillingPlanError("Nenhum plano pago ativo foi encontrado para billing", 404);
  }

  if (amount === null) {
    throw new BillingPlanError("MP_BILLING_AMOUNT is not configured", 500);
  }

  if (planId) {
    const matchingPlan = plans.find((plan) => plan.id === planId);

    if (!matchingPlan) {
      throw new BillingPlanError("Plano selecionado não está disponível para cobrança", 404);
    }

    return matchingPlan;
  }

  const configuredPlan = plans.find((plan) => plan.slug === serverEnv.MP_BILLING_PLAN_SLUG);
  return configuredPlan ?? plans[0]!;
}

export async function getFallbackFreePlan() {
  return prisma.plan.findFirst({
    where: {
      isActive: true,
      tier: "free"
    },
    orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }, { name: "asc" }]
  });
}
