import type { Prisma, PrismaClient, TenantPlan } from "@prisma/client";

type PlanDefinition = {
  slug: string;
  name: string;
  tier: TenantPlan;
  description: string;
  maxUsers: number | null;
  maxAccounts: number | null;
  maxCards: number | null;
  whatsappAssistant: boolean;
  automation: boolean;
  pdfExport: boolean;
  trialDays: number;
  sortOrder: number;
};

type PlanClient = PrismaClient | Prisma.TransactionClient;

export const DEFAULT_PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    slug: "gratuito-essencial",
    name: "Gratuito Essencial",
    tier: "free",
    description: "Plano base com limites reduzidos e recursos premium desativados.",
    maxUsers: null,
    maxAccounts: 1,
    maxCards: 1,
    whatsappAssistant: false,
    automation: false,
    pdfExport: false,
    trialDays: 0,
    sortOrder: 10
  },
  {
    slug: "premium-completo",
    name: "Premium Completo",
    tier: "pro",
    description: "Plano completo com WhatsApp, automações e exportação em PDF.",
    maxUsers: null,
    maxAccounts: null,
    maxCards: null,
    whatsappAssistant: true,
    automation: true,
    pdfExport: true,
    trialDays: 0,
    sortOrder: 20
  },
  {
    slug: "avaliacao-premium-14-dias",
    name: "Avaliação Premium 14 dias",
    tier: "pro",
    description: "Versão de avaliação com recursos premium liberados por 14 dias.",
    maxUsers: null,
    maxAccounts: null,
    maxCards: null,
    whatsappAssistant: true,
    automation: true,
    pdfExport: true,
    trialDays: 14,
    sortOrder: 30
  }
];

export async function ensureDefaultPlans(prisma: PlanClient) {
  for (const definition of DEFAULT_PLAN_DEFINITIONS) {
    const existing = await prisma.plan.findUnique({
      where: {
        slug: definition.slug
      },
      select: {
        id: true
      }
    });

    if (existing) {
      continue;
    }

    await prisma.plan.create({
      data: {
        slug: definition.slug,
        name: definition.name,
        tier: definition.tier,
        description: definition.description,
        maxUsers: definition.maxUsers,
        maxAccounts: definition.maxAccounts,
        maxCards: definition.maxCards,
        whatsappAssistant: definition.whatsappAssistant,
        automation: definition.automation,
        pdfExport: definition.pdfExport,
        trialDays: definition.trialDays,
        isDefault: true,
        isActive: true,
        sortOrder: definition.sortOrder
      }
    });
  }
}

export async function getDefaultPlanBySlug(prisma: PlanClient, slug: string) {
  return prisma.plan.findUnique({
    where: {
      slug
    }
  });
}

export async function getPreferredBootstrapPlan(prisma: PlanClient) {
  const [premium, free] = await Promise.all([
    getDefaultPlanBySlug(prisma, "premium-completo"),
    getDefaultPlanBySlug(prisma, "gratuito-essencial")
  ]);

  return premium ?? free;
}

export function applyPlanDefaultsToTenant(plan: {
  id: string;
  maxUsers: number | null;
  trialDays: number;
}) {
  const now = new Date();
  const hasTrial = plan.trialDays > 0;

  return {
    planId: plan.id,
    maxUsers: null,
    trialStart: hasTrial ? now : null,
    trialDays: plan.trialDays,
    trialExpiresAt: hasTrial ? new Date(now.getTime() + plan.trialDays * 24 * 60 * 60 * 1000) : null
  };
}

