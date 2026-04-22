import crypto from "node:crypto";

import { MercadoPagoConfig, Payment, PaymentRefund, PreApproval } from "mercadopago";

import { buildPublicUrl } from "@/lib/app-url";
import { serverEnv } from "@/lib/env/server";

export const MERCADO_PAGO_PROVIDER = "mercado_pago";
export const BILLING_MANAGE_PATH = "/billing";
export const BILLING_CHECKOUT_PATH = "/billing?intent=checkout";

export class BillingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigurationError";
  }
}

type SignatureFields = {
  ts: string | null;
  v1: string | null;
};

function parseSignatureHeader(value: string | null): SignatureFields {
  if (!value) {
    return { ts: null, v1: null };
  }

  const fields = value.split(",").reduce<Record<string, string>>((accumulator, entry) => {
    const [rawKey, rawValue] = entry.split("=", 2);
    const key = rawKey?.trim();
    const normalizedValue = rawValue?.trim();

    if (key && normalizedValue) {
      accumulator[key] = normalizedValue;
    }

    return accumulator;
  }, {});

  return {
    ts: fields.ts ?? null,
    v1: fields.v1 ?? null
  };
}

export function isMercadoPagoBillingEnabled() {
  return serverEnv.MP_BILLING_ENABLED === "true";
}

export function assertMercadoPagoBillingConfigured() {
  if (!isMercadoPagoBillingEnabled()) {
    throw new BillingConfigurationError("Mercado Pago billing is disabled");
  }

  if (!serverEnv.MP_ACCESS_TOKEN?.trim()) {
    throw new BillingConfigurationError("MP_ACCESS_TOKEN is not configured");
  }

  if (!serverEnv.MP_WEBHOOK_SECRET?.trim()) {
    throw new BillingConfigurationError("MP_WEBHOOK_SECRET is not configured");
  }

  if (!serverEnv.MP_PUBLIC_KEY?.trim()) {
    throw new BillingConfigurationError("MP_PUBLIC_KEY is not configured");
  }

  if (typeof serverEnv.MP_BILLING_AMOUNT !== "number") {
    throw new BillingConfigurationError("MP_BILLING_AMOUNT is not configured");
  }
}

function getMercadoPagoConfig() {
  assertMercadoPagoBillingConfigured();

  return new MercadoPagoConfig({
    accessToken: serverEnv.MP_ACCESS_TOKEN!.trim()
  });
}

export function getMercadoPagoClients() {
  const config = getMercadoPagoConfig();

  return {
    preApproval: new PreApproval(config),
    payment: new Payment(config),
    refund: new PaymentRefund(config)
  };
}

export function getMercadoPagoBillingPublicKey() {
  if (!isMercadoPagoBillingEnabled()) {
    return null;
  }

  return serverEnv.MP_PUBLIC_KEY?.trim() || null;
}

export function getMercadoPagoBillingReason(planName: string) {
  const configuredReason = serverEnv.MP_BILLING_REASON.trim();
  return configuredReason.length ? configuredReason : `Save Point Financa - ${planName}`;
}

export function getMercadoPagoBillingFrequencyConfig() {
  return {
    amount: Number(serverEnv.MP_BILLING_AMOUNT?.toFixed(2) ?? 0),
    currencyId: serverEnv.MP_BILLING_CURRENCY.trim().toUpperCase(),
    frequency: serverEnv.MP_BILLING_FREQUENCY,
    frequencyType: serverEnv.MP_BILLING_FREQUENCY_TYPE.trim()
  };
}

export function buildMercadoPagoWebhookUrl() {
  return buildPublicUrl("/api/integrations/mercadopago/webhook");
}

export function buildBillingManageUrl() {
  return buildPublicUrl(BILLING_MANAGE_PATH);
}

export function buildBillingCheckoutUrl() {
  return buildPublicUrl(BILLING_CHECKOUT_PATH);
}

export function buildMercadoPagoExternalReference(input: { tenantId: string; planId: string }) {
  return `tenant:${input.tenantId};plan:${input.planId};ref:${crypto.randomUUID()}`;
}

export function parseMercadoPagoExternalReference(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const fields = value.split(";").reduce<Record<string, string>>((accumulator, entry) => {
    const [rawKey, rawValue] = entry.split(":", 2);
    const key = rawKey?.trim();
    const fieldValue = rawValue?.trim();

    if (key && fieldValue) {
      accumulator[key] = fieldValue;
    }

    return accumulator;
  }, {});

  if (!fields.tenant || !fields.plan) {
    return null;
  }

  return {
    tenantId: fields.tenant,
    planId: fields.plan
  };
}

export function buildMercadoPagoWebhookDedupeKey(rawBody: string) {
  return crypto.createHash("sha256").update(rawBody).digest("hex");
}

export function verifyMercadoPagoWebhookSignature(input: {
  resourceId: string;
  xSignature: string | null;
  xRequestId: string | null;
}) {
  assertMercadoPagoBillingConfigured();

  const { ts, v1 } = parseSignatureHeader(input.xSignature);
  const requestId = input.xRequestId?.trim() ?? null;
  const resourceId = input.resourceId.trim().toLowerCase();

  if (!resourceId || !requestId || !ts || !v1) {
    return {
      isValid: false,
      requestId,
      signatureTs: ts
    };
  }

  const manifest = `id:${resourceId};request-id:${requestId};ts:${ts};`;
  const digest = crypto
    .createHmac("sha256", serverEnv.MP_WEBHOOK_SECRET!.trim())
    .update(manifest)
    .digest("hex");

  const digestBuffer = Buffer.from(digest, "hex");
  const signatureBuffer = Buffer.from(v1, "hex");
  const isValid =
    digestBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(digestBuffer, signatureBuffer);

  return {
    isValid,
    requestId,
    signatureTs: ts
  };
}
