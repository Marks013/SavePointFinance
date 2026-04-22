import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import type { BillingOverview } from "@/features/billing/types";
import { PermissionError, isAuthError, isPermissionError } from "@/lib/observability/errors";
import { prisma } from "@/lib/prisma/client";

import { getBillingSessionAccess } from "./access";
import { logBillingAdminAudit } from "./audit";
import {
  BILLING_CHECKOUT_PATH,
  BILLING_MANAGE_PATH,
  MERCADO_PAGO_PROVIDER,
  BillingConfigurationError,
  buildBillingCheckoutUrl,
  buildBillingManageUrl,
  buildMercadoPagoExternalReference,
  getMercadoPagoBillingFrequencyConfig,
  getMercadoPagoBillingPublicKey,
  getMercadoPagoBillingReason,
  getMercadoPagoClients,
  isMercadoPagoBillingEnabled,
  parseMercadoPagoExternalReference
} from "./mercadopago";
import { BillingPlanError, getFallbackFreePlan, resolveBillablePlan } from "./plans";

type BillingAccess = Awaited<ReturnType<typeof getBillingSessionAccess>>;
type BillingDbClient = typeof prisma | Prisma.TransactionClient;

type CheckoutSubscriptionInput = {
  planId?: string | null;
  cardToken: string;
  paymentMethodId: string;
  issuerId?: string | null;
  installments?: number | null;
  payer?: {
    email?: string | null;
    identification?: {
      type?: string | null;
      number?: string | null;
    } | null;
  } | null;
  metadata?: Record<string, unknown>;
};

type MercadoPagoSubscriptionResource = {
  id?: string;
  auto_recurring?: {
    currency_id?: string;
    frequency?: number;
    frequency_type?: string;
    transaction_amount?: number;
  };
  back_url?: string;
  date_created?: string | number;
  external_reference?: string;
  init_point?: string;
  last_modified?: string | number;
  next_payment_date?: string | number;
  payer_email?: string;
  payer_id?: number;
  reason?: string;
  status?: string;
  summarized?: Prisma.JsonValue;
};

type MercadoPagoPaymentResource = {
  id?: number;
  external_reference?: string;
  date_approved?: string | null;
  date_created?: string | null;
  status?: string;
  status_detail?: string;
  currency_id?: string;
  transaction_amount?: number;
  transaction_amount_refunded?: number;
  refunds?: Array<{
    id?: number;
    status?: string;
    date_created?: string | null;
  }>;
};

export class BillingError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "BillingError";
    this.statusCode = statusCode;
  }
}

function parseMercadoPagoDate(value: string | number | null | undefined) {
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "string" && value.trim().length) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}

function normalizeBillingSubscriptionStatus(value: string | null | undefined) {
  switch (value?.toLowerCase()) {
    case "authorized":
    case "active":
      return "authorized" as const;
    case "paused":
      return "paused" as const;
    case "cancelled":
    case "canceled":
      return "canceled" as const;
    case "expired":
      return "expired" as const;
    case "payment_required":
      return "payment_required" as const;
    case "rejected":
      return "rejected" as const;
    case "pending":
    default:
      return "pending" as const;
  }
}

function normalizeBillingPaymentStatus(value: string | null | undefined) {
  switch (value?.toLowerCase()) {
    case "approved":
      return "approved" as const;
    case "authorized":
      return "authorized" as const;
    case "refunded":
      return "refunded" as const;
    case "cancelled":
    case "canceled":
      return "canceled" as const;
    case "rejected":
      return "rejected" as const;
    case "in_process":
      return "in_process" as const;
    case "pending":
    default:
      return "pending" as const;
  }
}

function formatSubscriptionStatusLabel(status: string, subscribed: boolean) {
  switch (status) {
    case "authorized":
      return "Assinatura ativa";
    case "paused":
      return "Cobrança pausada";
    case "payment_required":
      return "Pagamento necessário";
    case "pending":
      return "Aguardando autorização";
    case "canceled":
      return subscribed ? "Cancelada com acesso vigente" : "Cancelada";
    case "expired":
      return "Expirada";
    case "rejected":
      return "Recusada";
    default:
      return subscribed ? "Ativa" : "Sem assinatura";
  }
}

function isManagedSubscriptionStatus(status: string) {
  return status === "authorized" || status === "paused" || status === "payment_required" || status === "canceled";
}

function isCancellableSubscriptionStatus(status: string) {
  return status === "authorized" || status === "paused" || status === "payment_required";
}

async function getLatestBillingSubscription(db: BillingDbClient, tenantId: string) {
  return db.billingSubscription.findFirst({
    where: {
      tenantId
    },
    orderBy: [{ createdAt: "desc" }]
  });
}

async function getLatestRefundablePayment(db: BillingDbClient, billingSubscriptionId: string) {
  return db.billingPayment.findFirst({
    where: {
      billingSubscriptionId,
      status: {
        in: ["approved", "authorized"]
      }
    },
    orderBy: [{ createdAt: "desc" }]
  });
}

async function applyTenantLicenseFromSubscription(db: BillingDbClient, input: {
  tenantId: string;
  planId: string;
  status: string;
  nextBillingAt: Date | null;
}) {
  const now = new Date();
  const fallbackFreePlan = await getFallbackFreePlan();
  const isPaidWindowActive = Boolean(input.nextBillingAt && input.nextBillingAt > now);
  const shouldKeepPaidPlan =
    input.status === "authorized" ||
    input.status === "paused" ||
    input.status === "payment_required" ||
    isPaidWindowActive;

  await db.tenant.update({
    where: {
      id: input.tenantId
    },
    data: {
      planId: shouldKeepPaidPlan ? input.planId : fallbackFreePlan?.id ?? input.planId,
      trialStart: null,
      trialDays: 0,
      trialExpiresAt: null,
      expiresAt: shouldKeepPaidPlan ? input.nextBillingAt : null,
      isActive: true
    }
  });
}

async function upsertBillingSubscriptionFromResource(
  db: BillingDbClient,
  input: {
    resource: MercadoPagoSubscriptionResource;
    fallbackTenantId: string;
    fallbackPlanId: string;
  }
) {
  const externalReference =
    input.resource.external_reference?.trim() ||
    buildMercadoPagoExternalReference({
      tenantId: input.fallbackTenantId,
      planId: input.fallbackPlanId
    });
  const parsedReference = parseMercadoPagoExternalReference(externalReference);
  const tenantId = parsedReference?.tenantId ?? input.fallbackTenantId;
  const planId = parsedReference?.planId ?? input.fallbackPlanId;
  const status = normalizeBillingSubscriptionStatus(input.resource.status);
  const now = new Date();
  const metadata: Prisma.InputJsonObject = {
    checkoutUrl: input.resource.init_point ?? null,
    providerStatus: input.resource.status ?? null,
    payerId: input.resource.payer_id?.toString() ?? null,
    summarized: input.resource.summarized ?? null,
    backUrl: input.resource.back_url ?? buildBillingManageUrl()
  };

  const subscription = await db.billingSubscription.upsert({
    where: {
      externalReference
    },
    update: {
      tenantId,
      planId,
      mercadoPagoPreapprovalId: input.resource.id ?? null,
      payerEmail: input.resource.payer_email ?? "",
      status,
      reason: input.resource.reason ?? "Assinatura Mercado Pago",
      amount: input.resource.auto_recurring?.transaction_amount ?? 0,
      currencyId: input.resource.auto_recurring?.currency_id ?? "BRL",
      frequency: input.resource.auto_recurring?.frequency ?? 1,
      frequencyType: input.resource.auto_recurring?.frequency_type ?? "months",
      nextBillingAt: parseMercadoPagoDate(input.resource.next_payment_date),
      startedAt:
        status === "authorized"
          ? parseMercadoPagoDate(input.resource.date_created) ?? now
          : undefined,
      lastSyncedAt: now,
      canceledAt: status === "canceled" ? now : null,
      metadata
    },
    create: {
      tenantId,
      planId,
      provider: MERCADO_PAGO_PROVIDER,
      externalReference,
      mercadoPagoPreapprovalId: input.resource.id ?? null,
      payerEmail: input.resource.payer_email ?? "",
      status,
      reason: input.resource.reason ?? "Assinatura Mercado Pago",
      amount: input.resource.auto_recurring?.transaction_amount ?? 0,
      currencyId: input.resource.auto_recurring?.currency_id ?? "BRL",
      frequency: input.resource.auto_recurring?.frequency ?? 1,
      frequencyType: input.resource.auto_recurring?.frequency_type ?? "months",
      nextBillingAt: parseMercadoPagoDate(input.resource.next_payment_date),
      startedAt: status === "authorized" ? parseMercadoPagoDate(input.resource.date_created) ?? now : null,
      lastSyncedAt: now,
      canceledAt: status === "canceled" ? now : null,
      metadata
    }
  });

  await applyTenantLicenseFromSubscription(db, {
    tenantId: subscription.tenantId,
    planId: subscription.planId,
    status: subscription.status,
    nextBillingAt: subscription.nextBillingAt
  });

  return subscription;
}

export async function syncMercadoPagoSubscriptionById(preapprovalId: string) {
  const existingSubscription = await prisma.billingSubscription.findFirst({
    where: {
      mercadoPagoPreapprovalId: preapprovalId
    }
  });

  if (!existingSubscription) {
    return null;
  }

  const { preApproval } = getMercadoPagoClients();
  const resource = (await preApproval.get({
    id: preapprovalId
  })) as MercadoPagoSubscriptionResource;

  return upsertBillingSubscriptionFromResource(prisma, {
    resource,
    fallbackTenantId: existingSubscription.tenantId,
    fallbackPlanId: existingSubscription.planId
  });
}

export async function syncMercadoPagoPaymentById(paymentId: string) {
  const { payment } = getMercadoPagoClients();
  const resource = (await payment.get({
    id: paymentId
  })) as MercadoPagoPaymentResource;
  const parsedReference = parseMercadoPagoExternalReference(resource.external_reference);

  if (!parsedReference) {
    return null;
  }

  let subscription =
    (await prisma.billingSubscription.findFirst({
      where: {
        externalReference: resource.external_reference ?? undefined
      }
    })) ?? null;

  if (!subscription) {
    const candidateSubscriptions = await prisma.billingSubscription.findMany({
      where: {
        tenantId: parsedReference.tenantId,
        planId: parsedReference.planId
      },
      orderBy: [{ createdAt: "desc" }],
      take: 2
    });

    if (candidateSubscriptions.length === 1) {
      subscription = candidateSubscriptions[0];
    }
  }

  if (!subscription) {
    return null;
  }

  const status = normalizeBillingPaymentStatus(resource.status);
  const refundedAt =
    status === "refunded"
      ? parseMercadoPagoDate(resource.refunds?.[0]?.date_created ?? null) ?? new Date()
      : null;

  const paymentRecord = await prisma.billingPayment.upsert({
    where: {
      providerPaymentId: String(resource.id)
    },
    update: {
      status,
      amount: resource.transaction_amount ?? Number(subscription.amount),
      currencyId: resource.currency_id ?? subscription.currencyId,
      approvedAt: parseMercadoPagoDate(resource.date_approved) ?? null,
      refundedAt,
      refundStatus: resource.refunds?.[0]?.status ?? null,
      rawPayload: resource as unknown as Prisma.InputJsonValue
    },
    create: {
      tenantId: subscription.tenantId,
      billingSubscriptionId: subscription.id,
      providerPaymentId: String(resource.id),
      status,
      amount: resource.transaction_amount ?? Number(subscription.amount),
      currencyId: resource.currency_id ?? subscription.currencyId,
      approvedAt: parseMercadoPagoDate(resource.date_approved) ?? null,
      refundedAt,
      refundStatus: resource.refunds?.[0]?.status ?? null,
      rawPayload: resource as unknown as Prisma.InputJsonValue
    }
  });

  if (subscription.mercadoPagoPreapprovalId) {
    await syncMercadoPagoSubscriptionById(subscription.mercadoPagoPreapprovalId);
  }

  return paymentRecord;
}

async function createBillingOverview(access: BillingAccess): Promise<BillingOverview> {
  const subscription = await getLatestBillingSubscription(prisma, access.tenantId);
  const subscribed =
    access.license.plan === "pro" &&
    (access.license.canAccessApp || Boolean(access.tenant.expiresAt && access.tenant.expiresAt > new Date()));
  const subscriptionStatus = subscription?.status ?? (subscribed ? "authorized" : "inactive");
  const canManageSelfService = access.canManageBilling && !access.isPlatformAdmin;

  return {
    plan: {
      name: access.license.planLabel,
      code: access.license.plan,
      status: access.license.status,
      statusLabel: access.license.statusLabel,
      features: access.license.features,
      limits: access.license.effectiveLimits
    },
    subscription: {
      provider: subscription ? MERCADO_PAGO_PROVIDER : null,
      status: subscriptionStatus,
      statusLabel: formatSubscriptionStatusLabel(subscriptionStatus, subscribed),
      subscribed,
      cancelAtPeriodEnd: Boolean(subscription?.cancelRequestedAt),
      canceledAt: subscription?.canceledAt?.toISOString() ?? null,
      currentPeriodEnd:
        subscription?.nextBillingAt?.toISOString() ??
        access.tenant.expiresAt?.toISOString() ??
        null,
      trialEndsAt: access.tenant.trialExpiresAt?.toISOString() ?? null,
      checkoutUrl:
        canManageSelfService && !subscribed && isMercadoPagoBillingEnabled() ? BILLING_CHECKOUT_PATH : null,
      portalUrl:
        canManageSelfService && subscription && isManagedSubscriptionStatus(subscription.status)
          ? BILLING_MANAGE_PATH
          : null,
      canCheckout: canManageSelfService && !subscribed && isMercadoPagoBillingEnabled(),
      canManage:
        canManageSelfService && subscription ? isManagedSubscriptionStatus(subscription.status) : false,
      canCancel:
        canManageSelfService && subscription ? isCancellableSubscriptionStatus(subscription.status) : false
    },
    permissions: {
      canManageBilling: access.canManageBilling,
      isAccountAdmin: access.role === "admin",
      isPlatformAdmin: access.isPlatformAdmin
    }
  };
}

export async function getBillingOverviewForSession() {
  const access = await getBillingSessionAccess();
  return createBillingOverview(access);
}

export async function startBillingCheckoutForSession() {
  const access = await getBillingSessionAccess({
    requireManager: true
  });

  if (access.isPlatformAdmin) {
    throw new BillingError("O superadmin não deve iniciar billing por este fluxo", 403);
  }

  if (!isMercadoPagoBillingEnabled()) {
    throw new BillingError("Billing do Mercado Pago está desabilitado no ambiente", 409);
  }

  await logBillingAdminAudit({
    actor: access,
    action: "billing.checkout.started",
    summary: `Checkout de billing iniciado para a conta ${access.tenant.name}`,
    metadata: {
      tenantName: access.tenant.name
    }
  });

  return {
    url: buildBillingCheckoutUrl(),
    message: "Checkout iniciado"
  };
}

export async function openBillingPortalForSession() {
  const access = await getBillingSessionAccess({
    requireManager: true
  });

  if (access.isPlatformAdmin) {
    throw new BillingError("O superadmin visualiza billing, mas não gerencia por este fluxo", 403);
  }

  await logBillingAdminAudit({
    actor: access,
    action: "billing.portal.opened",
    summary: `Gerenciamento de billing acessado para a conta ${access.tenant.name}`,
    metadata: {
      tenantName: access.tenant.name
    }
  });

  return {
    url: buildBillingManageUrl(),
    message: "Gerenciamento aberto"
  };
}

export async function createRecurringBillingSubscriptionForSession(input: CheckoutSubscriptionInput) {
  const access = await getBillingSessionAccess({
    requireManager: true
  });

  if (access.isPlatformAdmin) {
    throw new BillingError("O superadmin não deve contratar assinatura por este fluxo", 403);
  }

  if (!isMercadoPagoBillingEnabled()) {
    throw new BillingError("Billing do Mercado Pago está desabilitado no ambiente", 409);
  }

  const plan = await resolveBillablePlan(input.planId);
  const existingSubscription = await prisma.billingSubscription.findFirst({
    where: {
      tenantId: access.tenantId,
      status: {
        in: ["authorized", "paused", "payment_required"]
      }
    },
    orderBy: [{ createdAt: "desc" }]
  });

  if (existingSubscription) {
    throw new BillingError("A conta já possui uma assinatura ativa ou pendente de regularização", 409);
  }

  const { preApproval } = getMercadoPagoClients();
  const billingConfig = getMercadoPagoBillingFrequencyConfig();
  const payerEmail = input.payer?.email?.trim() || access.email.trim();
  const externalReference = buildMercadoPagoExternalReference({
    tenantId: access.tenantId,
    planId: plan.id
  });
  const resource = (await preApproval.create({
    body: {
      auto_recurring: {
        frequency: billingConfig.frequency,
        frequency_type: billingConfig.frequencyType,
        transaction_amount: plan.amount!,
        currency_id: plan.currencyId
      },
      back_url: buildBillingManageUrl(),
      card_token_id: input.cardToken,
      external_reference: externalReference,
      payer_email: payerEmail,
      reason: getMercadoPagoBillingReason(plan.name),
      status: "authorized"
    },
    requestOptions: {
      idempotencyKey: randomUUID()
    }
  })) as MercadoPagoSubscriptionResource;

  if (!resource.id) {
    throw new BillingError("Mercado Pago não retornou uma assinatura válida", 502);
  }

  const subscription = await upsertBillingSubscriptionFromResource(prisma, {
    resource: {
      ...resource,
      external_reference: resource.external_reference ?? externalReference,
      payer_email: resource.payer_email ?? payerEmail,
      reason: resource.reason ?? getMercadoPagoBillingReason(plan.name),
      auto_recurring: resource.auto_recurring ?? {
        transaction_amount: plan.amount!,
        currency_id: plan.currencyId,
        frequency: billingConfig.frequency,
        frequency_type: billingConfig.frequencyType
      }
    },
    fallbackTenantId: access.tenantId,
    fallbackPlanId: plan.id
  });

  await prisma.billingSubscription.update({
    where: {
      id: subscription.id
    },
    data: {
      metadata: {
        ...((subscription.metadata ?? {}) as Prisma.JsonObject),
        paymentMethodId: input.paymentMethodId,
        issuerId: input.issuerId ?? null,
        installments: input.installments ?? null,
        checkoutMetadata: (input.metadata ?? null) as Prisma.InputJsonValue
      }
    }
  });

  await logBillingAdminAudit({
    actor: access,
    action: "billing.subscription.created",
    entityId: subscription.id,
    summary: `Assinatura criada para a conta ${access.tenant.name}`,
    metadata: {
      provider: MERCADO_PAGO_PROVIDER,
      planId: plan.id,
      planSlug: plan.slug,
      amount: plan.amount,
      currencyId: plan.currencyId,
      mercadoPagoPreapprovalId: subscription.mercadoPagoPreapprovalId
    }
  });

  return {
    url: buildBillingManageUrl(),
    message: "Assinatura criada com sucesso",
    billing: await createBillingOverview(access)
  };
}

export async function cancelBillingSubscriptionForSession() {
  const access = await getBillingSessionAccess({
    requireManager: true
  });

  if (access.isPlatformAdmin) {
    throw new BillingError("O superadmin não deve cancelar billing por este fluxo", 403);
  }

  const subscription = await prisma.billingSubscription.findFirst({
    where: {
      tenantId: access.tenantId,
      status: {
        in: ["authorized", "paused", "payment_required"]
      }
    },
    orderBy: [{ createdAt: "desc" }]
  });

  if (!subscription) {
    throw new BillingError("Nenhuma assinatura ativa foi encontrada para esta conta", 404);
  }

  const startedAt = subscription.startedAt ?? subscription.createdAt;
  const withinRefundWindow = Date.now() - startedAt.getTime() <= 7 * 24 * 60 * 60 * 1000;
  const refundablePayment =
    withinRefundWindow && subscription.id
      ? await getLatestRefundablePayment(prisma, subscription.id)
      : null;

  const { preApproval, refund } = getMercadoPagoClients();

  if (subscription.mercadoPagoPreapprovalId) {
    await preApproval.update({
      id: subscription.mercadoPagoPreapprovalId,
      body: {
        status: "cancelled"
      },
      requestOptions: {
        idempotencyKey: randomUUID()
      }
    });
  }

  if (refundablePayment) {
    await refund.create({
      payment_id: refundablePayment.providerPaymentId,
      body: {},
      requestOptions: {
        idempotencyKey: randomUUID()
      }
    });
  }

  const nextBillingAt = refundablePayment ? null : subscription.nextBillingAt;
  const updatedSubscription = await prisma.billingSubscription.update({
    where: {
      id: subscription.id
    },
    data: {
      status: "canceled",
      cancelRequestedAt: new Date(),
      canceledAt: new Date(),
      nextBillingAt,
      lastSyncedAt: new Date(),
      metadata: {
        ...((subscription.metadata ?? {}) as Prisma.JsonObject),
        refundedInSevenDayWindow: Boolean(refundablePayment)
      }
    }
  });

  if (refundablePayment) {
    await prisma.billingPayment.update({
      where: {
        id: refundablePayment.id
      },
      data: {
        status: "refunded",
        refundedAt: new Date(),
        refundStatus: "requested"
      }
    });
  }

  await logBillingAdminAudit({
    actor: access,
    action: refundablePayment ? "billing.refund.requested" : "billing.subscription.canceled",
    entityId: updatedSubscription.id,
    summary: refundablePayment
      ? `Assinatura cancelada com reembolso solicitado para a conta ${access.tenant.name}`
      : `Assinatura cancelada para a conta ${access.tenant.name}`,
    metadata: {
      provider: MERCADO_PAGO_PROVIDER,
      mercadoPagoPreapprovalId: updatedSubscription.mercadoPagoPreapprovalId,
      refundRequested: Boolean(refundablePayment),
      refundablePaymentId: refundablePayment?.providerPaymentId ?? null,
      withinRefundWindow
    }
  });

  await applyTenantLicenseFromSubscription(prisma, {
    tenantId: updatedSubscription.tenantId,
    planId: updatedSubscription.planId,
    status: updatedSubscription.status,
    nextBillingAt: updatedSubscription.nextBillingAt
  });

  return {
    message: refundablePayment
      ? "Assinatura cancelada e pagamento enviado para reembolso dentro da janela legal"
      : "Assinatura cancelada. Os recursos premium seguem até o fim do ciclo vigente, se houver",
    billing: await createBillingOverview(access)
  };
}

export async function getBillingCheckoutPageData() {
  const access = await getBillingSessionAccess({
    requireManager: true
  });
  const plan = await resolveBillablePlan();

  return {
    access,
    publicKey: getMercadoPagoBillingPublicKey(),
    amount: plan.amount,
    currencyId: plan.currencyId,
    planName: plan.name
  };
}

export function toBillingRouteStatus(error: unknown) {
  if (error instanceof BillingError || error instanceof BillingPlanError) {
    return error.statusCode;
  }

  if (error instanceof BillingConfigurationError) {
    return 500;
  }

  if (isAuthError(error)) {
    return 401;
  }

  if (isPermissionError(error) || error instanceof PermissionError) {
    return 403;
  }

  return 500;
}
