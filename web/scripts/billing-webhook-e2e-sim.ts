import assert from "node:assert/strict";
import crypto from "node:crypto";

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
  const parsedReference = parseMercadoPagoExternalReference(externalReference);

  assert.deepEqual(parsedReference, {
    tenantId: "tenant_123",
    planId: "plan_456"
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

  assert.equal(verified.isValid, true);
  assert.equal(invalid.isValid, false);

  const subscriptionEnvelope = extractMercadoPagoWebhookEnvelope({
    payload: JSON.parse(rawBody),
    searchParams: new URLSearchParams()
  });
  const paymentEnvelope = extractMercadoPagoWebhookEnvelope({
    payload: {
      topic: "payment",
      data: {
        id: 998877
      }
    },
    searchParams: new URLSearchParams()
  });

  assert.equal(subscriptionEnvelope.topic, "subscription_preapproval");
  assert.equal(subscriptionEnvelope.resourceId, "preapp_001");
  assert.equal(paymentEnvelope.topic, "payment");
  assert.equal(paymentEnvelope.resourceId, "998877");

  assert.equal(getBillingWebhookRetryDelayMs(1), 60_000);
  assert.equal(getBillingWebhookRetryDelayMs(2), 120_000);
  assert.equal(getBillingWebhookRetryDelayMs(3), 240_000);

  console.log("BILLING_WEBHOOK_E2E_SIM_OK");
  console.log(
    JSON.stringify(
      {
        externalReference,
        dedupeKey,
        verified,
        subscriptionEnvelope,
        paymentEnvelope,
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
