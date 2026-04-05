import type { TenantPlan } from "@prisma/client";

export type LicenseFeature = "whatsappAssistant" | "automation" | "pdfExport";

export type TenantLicenseTarget = {
  maxUsers: number | null;
  isActive: boolean;
  trialExpiresAt: Date | null;
  expiresAt: Date | null;
  planConfig: {
    id: string;
    name: string;
    slug: string;
    tier: TenantPlan;
    maxUsers: number | null;
    maxAccounts: number | null;
    maxCards: number | null;
    whatsappAssistant: boolean;
    automation: boolean;
    pdfExport: boolean;
    trialDays: number;
    isActive: boolean;
  };
};

export type TenantLicenseStatus = "free" | "premium" | "trial" | "expired" | "inactive";

export type TenantLicenseState = {
  plan: TenantPlan;
  planId: string;
  planName: string;
  planSlug: string;
  planLabel: string;
  status: TenantLicenseStatus;
  statusLabel: string;
  canAccessApp: boolean;
  isPremium: boolean;
  isTrial: boolean;
  effectiveLimits: {
    users: number | null;
    accounts: number | null;
    cards: number | null;
  };
  features: Record<LicenseFeature, boolean>;
};

function resolveEffectiveUsers(tenantLimit: number | null, planLimit: number | null) {
  if (tenantLimit === null || tenantLimit === undefined) {
    return planLimit;
  }

  if (planLimit === null || planLimit === undefined) {
    return Math.max(1, tenantLimit);
  }

  return Math.max(1, Math.min(planLimit, tenantLimit));
}

export function resolveTenantLicenseState(tenant: TenantLicenseTarget, now = new Date()): TenantLicenseState {
  const tier = tenant.planConfig.tier;
  const isExpired = Boolean(tenant.expiresAt && tenant.expiresAt < now);
  const isTrial =
    tier === "pro" &&
    tenant.planConfig.trialDays > 0 &&
    Boolean(tenant.trialExpiresAt && tenant.trialExpiresAt >= now && !tenant.expiresAt);

  let status: TenantLicenseStatus = tier === "pro" ? "premium" : "free";
  let statusLabel = tier === "pro" ? "Plano Premium" : "Plano Gratuito";

  if (!tenant.isActive || !tenant.planConfig.isActive) {
    status = "inactive";
    statusLabel = !tenant.planConfig.isActive ? "Plano inativo" : "Organização inativa";
  } else if (isExpired) {
    status = "expired";
    statusLabel = "Licença expirada";
  } else if (isTrial) {
    status = "trial";
    statusLabel = "Avaliação Premium";
  }

  return {
    plan: tier,
    planId: tenant.planConfig.id,
    planName: tenant.planConfig.name,
    planSlug: tenant.planConfig.slug,
    planLabel: tenant.planConfig.name,
    status,
    statusLabel,
    canAccessApp: tenant.isActive && tenant.planConfig.isActive && !isExpired,
    isPremium: tier === "pro",
    isTrial,
    effectiveLimits: {
      users: resolveEffectiveUsers(tenant.maxUsers, tenant.planConfig.maxUsers),
      accounts: tenant.planConfig.maxAccounts,
      cards: tenant.planConfig.maxCards
    },
    features: {
      whatsappAssistant: tenant.planConfig.whatsappAssistant,
      automation: tenant.planConfig.automation,
      pdfExport: tenant.planConfig.pdfExport
    }
  };
}

export function getLicenseBlockedReason(license: TenantLicenseState) {
  if (license.status === "inactive") {
    return "inactive";
  }

  if (license.status === "expired") {
    return "expired";
  }

  return null;
}
