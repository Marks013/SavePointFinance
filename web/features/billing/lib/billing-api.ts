import { ensureApiResponse } from "@/lib/observability/http";

import type {
  BillingActionResponse,
  BillingOverview,
  BillingProfileSnapshot
} from "@/features/billing/types";

function resolveCanManageBilling(profile: BillingProfileSnapshot) {
  return profile.isPlatformAdmin || profile.role === "admin" || Boolean(profile.sharing?.canManage);
}

function buildFallbackSubscription(profile: BillingProfileSnapshot): BillingOverview["subscription"] {
  const isSubscribed = profile.license.plan === "pro";
  const canManageBilling = resolveCanManageBilling(profile);
  const canRunSelfServiceActions = canManageBilling && !profile.isPlatformAdmin;

  return {
    provider: null,
    status: profile.license.status,
    statusLabel: profile.license.statusLabel,
    subscribed: isSubscribed,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    currentPeriodEnd: null,
    trialEndsAt: null,
    checkoutUrl: null,
    portalUrl: null,
    canCheckout: canRunSelfServiceActions && !isSubscribed,
    canManage: canRunSelfServiceActions && isSubscribed,
    canCancel: canRunSelfServiceActions && isSubscribed
  };
}

function normalizeBillingOverview(
  payload: Partial<BillingOverview>,
  profile: BillingProfileSnapshot
): BillingOverview {
  const canManageBilling = resolveCanManageBilling(profile);
  const fallbackSubscription = buildFallbackSubscription(profile);

  return {
    plan: {
      name: payload.plan?.name ?? profile.license.planLabel,
      code: payload.plan?.code ?? profile.license.plan,
      status: payload.plan?.status ?? profile.license.status,
      statusLabel: payload.plan?.statusLabel ?? profile.license.statusLabel,
      features: payload.plan?.features ?? profile.license.features,
      limits: payload.plan?.limits ?? profile.license.limits
    },
    subscription: {
      ...fallbackSubscription,
      ...payload.subscription,
      provider: payload.subscription?.provider ?? fallbackSubscription.provider,
      checkoutUrl: payload.subscription?.checkoutUrl ?? fallbackSubscription.checkoutUrl,
      portalUrl: payload.subscription?.portalUrl ?? fallbackSubscription.portalUrl,
      canCheckout: payload.subscription?.canCheckout ?? fallbackSubscription.canCheckout,
      canManage: payload.subscription?.canManage ?? fallbackSubscription.canManage,
      canCancel: payload.subscription?.canCancel ?? fallbackSubscription.canCancel
    },
    permissions: {
      canManageBilling,
      isAccountAdmin: profile.role === "admin",
      isPlatformAdmin: profile.isPlatformAdmin,
      ...payload.permissions
    }
  };
}

export function buildBillingOverviewFallback(profile: BillingProfileSnapshot): BillingOverview {
  return normalizeBillingOverview({}, profile);
}

export async function getBillingOverview(profile: BillingProfileSnapshot) {
  const response = await fetch("/api/billing", {
    cache: "no-store"
  });

  if (response.status === 404 || response.status === 405) {
    return buildBillingOverviewFallback(profile);
  }

  await ensureApiResponse(response, {
    fallbackMessage: "Falha ao carregar billing",
    method: "GET",
    path: "/api/billing"
  });

  return normalizeBillingOverview((await response.json()) as Partial<BillingOverview>, profile);
}

async function performBillingAction(path: string, fallbackMessage: string) {
  const response = await fetch(path, {
    method: "POST"
  });
  await ensureApiResponse(response, {
    fallbackMessage,
    method: "POST",
    path
  });

  return (await response.json().catch(() => ({}))) as BillingActionResponse;
}

export function startBillingCheckout() {
  return performBillingAction("/api/billing/checkout", "Falha ao iniciar checkout");
}

export function openBillingPortal() {
  return performBillingAction("/api/billing/portal", "Falha ao abrir gerenciamento da assinatura");
}

export function cancelBillingSubscription() {
  return performBillingAction("/api/billing/cancel", "Falha ao cancelar assinatura");
}
