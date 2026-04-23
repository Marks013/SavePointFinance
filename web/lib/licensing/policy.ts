import type { TenantPlan } from "@prisma/client";

export type LicenseFeature = "whatsappAssistant" | "automation" | "pdfExport";

export type TenantLicenseTarget = {
  isActive: boolean;
  trialExpiresAt: Date | null;
  expiresAt: Date | null;
  planConfig: {
    id: string;
    name: string;
    slug: string;
    tier: TenantPlan;
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

export function resolveTenantLicenseState(tenant: TenantLicenseTarget, now = new Date()): TenantLicenseState {
  const tier = tenant.planConfig.tier;
  const isTrialPlan = tier === "pro" && tenant.planConfig.trialDays > 0;
  const isTrialExpired = Boolean(isTrialPlan && tenant.trialExpiresAt && tenant.trialExpiresAt < now && !tenant.expiresAt);
  const isExpired = Boolean((tenant.expiresAt && tenant.expiresAt < now) || isTrialExpired);
  const isTrial =
    isTrialPlan &&
    Boolean(tenant.trialExpiresAt && tenant.trialExpiresAt >= now && !tenant.expiresAt);

  let status: TenantLicenseStatus = tier === "pro" ? "premium" : "free";
  let statusLabel = tier === "pro" ? "Plano Premium" : "Plano Gratuito";

  if (!tenant.isActive || !tenant.planConfig.isActive) {
    status = "inactive";
    statusLabel = !tenant.planConfig.isActive ? "Plano inativo" : "Organização inativa";
  } else if (isExpired) {
    status = "expired";
    statusLabel = isTrialExpired ? "Avaliação expirada" : "Licença expirada";
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
      users: null,
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
