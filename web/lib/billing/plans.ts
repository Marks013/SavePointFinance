import { prisma } from "@/lib/prisma/client";
import { serverEnv } from "@/lib/env/server";
import { getBillingSettings } from "./settings";

export class BillingPlanError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "BillingPlanError";
    this.statusCode = statusCode;
  }
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

  const billingSettings = await getBillingSettings();
  const amount = billingSettings.monthlyAmount;
  const currencyId = billingSettings.currencyId;

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

  if (!plans.length) {
    throw new BillingPlanError("Nenhum plano pago ativo foi encontrado para billing", 404);
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
