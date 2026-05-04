import assert from "node:assert/strict";
import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";

for (const envFile of ["../.env", ".env", ".env.local"]) {
  const envPath = resolve(process.cwd(), envFile);

  if (existsSync(envPath)) {
    loadEnv({
      path: envPath,
      override: envFile === ".env.local"
    });
  }
}

function setDefaultEnv(key: string, value: string) {
  if (!process.env[key]?.trim()) {
    process.env[key] = value;
  }
}

process.env.MP_BILLING_ENABLED = "true";
setDefaultEnv(
  "DATABASE_URL",
  `postgresql://${process.env.POSTGRES_USER ?? "audit"}:${process.env.POSTGRES_PASSWORD ?? "auditoria"}@localhost:${process.env.POSTGRES_PORT ?? "5432"}/${process.env.POSTGRES_DB ?? "audit"}`
);
setDefaultEnv("AUTH_SECRET", "audit-secret");
setDefaultEnv("AUTOMATION_CRON_SECRET", "audit-cron-secret");
setDefaultEnv("MP_ACCESS_TOKEN", "TEST-access-token");
setDefaultEnv("MP_PUBLIC_KEY", "TEST-public-key");
setDefaultEnv("MP_WEBHOOK_SECRET", "test-webhook-secret");
setDefaultEnv("MP_BILLING_AMOUNT", "49.90");

async function main() {

  const {
    buildMercadoPagoExternalReference,
    buildMercadoPagoWebhookDedupeKey,
    parseMercadoPagoExternalReference,
    verifyMercadoPagoWebhookSignature
  } = await import("../lib/billing/mercadopago");
  const {
    extractMercadoPagoWebhookEnvelope,
    getBillingWebhookRetryDelayMs
  } = await import("../lib/billing/async-processor");

  const externalReference = buildMercadoPagoExternalReference({
    tenantId: "tenant_123",
    planId: "plan_456"
  });
  const annualExternalReference = buildMercadoPagoExternalReference({
    tenantId: "tenant_annual",
    planId: "plan_premium"
  });
  const parsedReference = parseMercadoPagoExternalReference(externalReference);
  const parsedAnnualReference = parseMercadoPagoExternalReference(annualExternalReference);

  assert.deepEqual(parsedReference, {
    tenantId: "tenant_123",
    planId: "plan_456"
  });
  assert.deepEqual(parsedAnnualReference, {
    tenantId: "tenant_annual",
    planId: "plan_premium"
  });

  const rawBody = JSON.stringify({
    type: "subscription_preapproval",
    action: "updated",
    data: {
      id: "preapp_001"
    }
  });
  const dedupeKey = buildMercadoPagoWebhookDedupeKey(rawBody);
  assert.equal(dedupeKey.length, 64);

  const ts = "1713801600";
  const requestId = "req-123";
  const manifest = `id:${"preapp_001"};request-id:${requestId};ts:${ts};`;
  const validSignature = crypto
    .createHmac("sha256", process.env.MP_WEBHOOK_SECRET!)
    .update(manifest)
    .digest("hex");
  const annualPaymentId = "998877";
  const annualPaymentManifest = `id:${annualPaymentId};request-id:${requestId};ts:${ts};`;
  const validAnnualPaymentSignature = crypto
    .createHmac("sha256", process.env.MP_WEBHOOK_SECRET!)
    .update(annualPaymentManifest)
    .digest("hex");

  const verified = verifyMercadoPagoWebhookSignature({
    resourceId: "preapp_001",
    xRequestId: requestId,
    xSignature: `ts=${ts},v1=${validSignature}`
  });
  const invalid = verifyMercadoPagoWebhookSignature({
    resourceId: "preapp_001",
    xRequestId: requestId,
    xSignature: `ts=${ts},v1=deadbeef`
  });
  const verifiedAnnualPayment = verifyMercadoPagoWebhookSignature({
    resourceId: annualPaymentId,
    xRequestId: requestId,
    xSignature: `ts=${ts},v1=${validAnnualPaymentSignature}`
  });

  assert.equal(verified.isValid, true);
  assert.equal(verifiedAnnualPayment.isValid, true);
  assert.equal(invalid.isValid, false);

  const subscriptionEnvelope = extractMercadoPagoWebhookEnvelope({
    payload: JSON.parse(rawBody),
    searchParams: new URLSearchParams()
  });
  const paymentEnvelope = extractMercadoPagoWebhookEnvelope({
    payload: {
      topic: "payment",
      data: {
        id: Number(annualPaymentId)
      }
    },
    searchParams: new URLSearchParams()
  });
  const checkoutProPaymentEnvelope = extractMercadoPagoWebhookEnvelope({
    payload: {
      type: "payment",
      action: "payment.updated",
      data: {
        id: annualPaymentId
      }
    },
    searchParams: new URLSearchParams()
  });

  assert.equal(subscriptionEnvelope.topic, "subscription_preapproval");
  assert.equal(subscriptionEnvelope.resourceId, "preapp_001");
  assert.equal(paymentEnvelope.topic, "payment");
  assert.equal(paymentEnvelope.resourceId, annualPaymentId);
  assert.equal(checkoutProPaymentEnvelope.topic, "payment");
  assert.equal(checkoutProPaymentEnvelope.resourceId, annualPaymentId);
  assert.equal(checkoutProPaymentEnvelope.action, "payment.updated");

  assert.equal(getBillingWebhookRetryDelayMs(1), 60_000);
  assert.equal(getBillingWebhookRetryDelayMs(2), 120_000);
  assert.equal(getBillingWebhookRetryDelayMs(3), 240_000);

  console.log("BILLING_WEBHOOK_E2E_SIM_OK");
  console.log(
    JSON.stringify(
      {
        externalReference,
        annualExternalReference,
        dedupeKey,
        verified,
        verifiedAnnualPayment,
        subscriptionEnvelope,
        paymentEnvelope,
        checkoutProPaymentEnvelope,
        annualCheckoutConfig: {
          amount: process.env.MP_BILLING_ANNUAL_AMOUNT ?? "fallback:monthly_x10",
          maxInstallments: process.env.MP_BILLING_ANNUAL_MAX_INSTALLMENTS ?? "12"
        },
        retryDelaysMs: [1, 2, 3].map(getBillingWebhookRetryDelayMs)
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("BILLING_WEBHOOK_E2E_SIM_FAILED");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
