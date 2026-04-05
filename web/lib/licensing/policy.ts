import type { TenantPlan } from "@prisma/client";

export type LicenseFeature = "whatsappAssistant" | "automation" | "pdfExport";

export type TenantLicenseTarget = {
  plan: TenantPlan;
  maxUsers: number;
  isActive: boolean;
  trialExpiresAt: Date | null;
  expiresAt: Date | null;
};

type PlanPolicy = {
  label: string;
  maxUsers: number | null;
  maxAccounts: number | null;
  maxCards: number | null;
  features: Record<LicenseFeature, boolean>;
};

export type TenantLicenseStatus = "free" | "premium" | "trial" | "expired" | "inactive";

export type TenantLicenseState = {
  plan: TenantPlan;
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

const PLAN_POLICIES: Record<TenantPlan, PlanPolicy> = {
  free: {
    label: "Gratuito",
    maxUsers: 1,
    maxAccounts: 1,
    maxCards: 1,
    features: {
      whatsappAssistant: false,
      automation: false,
      pdfExport: false
    }
  },
  pro: {
    label: "Premium",
    maxUsers: null,
    maxAccounts: null,
    maxCards: null,
    features: {
      whatsappAssistant: true,
      automation: true,
      pdfExport: true
    }
  }
};

function resolveEffectiveLimit(configuredLimit: number, planLimit: number | null) {
  if (planLimit === null) {
    return Math.max(1, configuredLimit || 1);
  }

  return Math.max(1, Math.min(planLimit, configuredLimit || planLimit));
}

export function getPlanPolicy(plan: TenantPlan) {
  return PLAN_POLICIES[plan];
}

export function resolveTenantLicenseState(tenant: TenantLicenseTarget, now = new Date()): TenantLicenseState {
  const planPolicy = getPlanPolicy(tenant.plan);
  const isExpired = Boolean(tenant.expiresAt && tenant.expiresAt < now);
  const isTrial =
    tenant.plan === "pro" &&
    Boolean(tenant.trialExpiresAt && tenant.trialExpiresAt >= now && !tenant.expiresAt);

  let status: TenantLicenseStatus = tenant.plan === "pro" ? "premium" : "free";
  let statusLabel = tenant.plan === "pro" ? "Plano Premium" : "Plano Gratuito";

  if (!tenant.isActive) {
    status = "inactive";
    statusLabel = "Organização inativa";
  } else if (isExpired) {
    status = "expired";
    statusLabel = "Licença expirada";
  } else if (isTrial) {
    status = "trial";
    statusLabel = "Avaliação Premium";
  }

  return {
    plan: tenant.plan,
    planLabel: planPolicy.label,
    status,
    statusLabel,
    canAccessApp: tenant.isActive && !isExpired,
    isPremium: tenant.plan === "pro",
    isTrial,
    effectiveLimits: {
      users: resolveEffectiveLimit(tenant.maxUsers, planPolicy.maxUsers),
      accounts: planPolicy.maxAccounts,
      cards: planPolicy.maxCards
    },
    features: {
      ...planPolicy.features
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
