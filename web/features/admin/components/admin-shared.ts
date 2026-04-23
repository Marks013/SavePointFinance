import { formatDateDisplay } from "@/lib/date";

export type TenantBillingSummary = {
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  preapprovalId: string | null;
  nextBillingAt: string | null;
  cancelRequestedAt: string | null;
  lastSyncedAt: string | null;
  latestPaymentStatus: string | null;
  latestPaymentId: string | null;
  queueDepth: number;
  failedWebhooks: number;
  lastFinancialRepair: {
    action: string;
    summary: string;
    createdAt: string;
  } | null;
};

export type TenantItem = {
  id: string;
  name: string;
  slug: string;
  planId: string;
  planName: string;
  planSlug: string;
  planTier: "free" | "pro";
  isActive: boolean;
  activeUsers: number;
  trialStart: string | null;
  trialDays: number;
  trialExpiresAt: string | null;
  expiresAt: string | null;
  billing: TenantBillingSummary;
};

export type UserItem = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  isPlatformAdmin?: boolean;
  isActive: boolean;
  tenant: {
    id: string;
    name: string;
    slug: string;
    accountAdminId: string | null;
    accountAdminName: string | null;
    accountAdminEmail: string | null;
    planId: string;
    planName: string;
    planSlug: string;
    planTier: "free" | "pro";
    isActive: boolean;
    trialExpiresAt: string | null;
    expiresAt: string | null;
  };
  createdAt: string;
  lastLogin: string | null;
};

export type PlanItem = {
  id: string;
  name: string;
  slug: string;
  tier: "free" | "pro";
  description: string | null;
  maxAccounts: number | null;
  maxCards: number | null;
  trialDays: number;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  tenantsCount: number;
  features: {
    whatsappAssistant: boolean;
    automation: boolean;
    pdfExport: boolean;
  };
};

export type InvitationItem = {
  id: string;
  tenantId?: string;
  email: string;
  name: string;
  role: "admin" | "member";
  inviteUrl: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

export function formatPlanLabel(plan: string) {
  return plan === "pro" ? "Premium" : "Gratuito";
}

export function formatLifecycleLabel(tenant: TenantItem) {
  if (tenant.expiresAt) {
    return `Expira em ${formatDateDisplay(tenant.expiresAt)}`;
  }

  if (tenant.planTier === "pro" && tenant.trialExpiresAt) {
    return `Avaliação até ${formatDateDisplay(tenant.trialExpiresAt)}`;
  }

  return tenant.isActive ? "Sem vencimento configurado" : "Conta inativa";
}

export function formatBillingSubscriptionLabel(status: string | null) {
  switch (status) {
    case "authorized":
      return "Assinatura ativa";
    case "payment_required":
      return "Pagamento pendente";
    case "paused":
      return "Cobrança pausada";
    case "pending":
      return "Aguardando autorização";
    case "canceled":
      return "Assinatura cancelada";
    case "expired":
      return "Assinatura expirada";
    case "rejected":
      return "Assinatura recusada";
    default:
      return "Sem assinatura Mercado Pago";
  }
}

export function formatUserTenantPlanLabel(user: UserItem) {
  if (user.tenant.expiresAt) {
    return `${user.tenant.planName} • Expirado`;
  }

  if (user.tenant.planTier === "pro" && user.tenant.trialExpiresAt) {
    return `${user.tenant.planName} • Em avaliação`;
  }

  return `${user.tenant.planName} • ${user.tenant.isActive ? "Ativo" : "Inativo"}`;
}
