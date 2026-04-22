CREATE TYPE "BillingSubscriptionStatus" AS ENUM (
  'pending',
  'authorized',
  'paused',
  'canceled',
  'expired',
  'payment_required',
  'rejected'
);

CREATE TYPE "BillingWebhookEventStatus" AS ENUM (
  'pending',
  'processed',
  'ignored',
  'failed'
);

CREATE TYPE "BillingPaymentStatus" AS ENUM (
  'pending',
  'approved',
  'authorized',
  'refunded',
  'rejected',
  'canceled',
  'in_process'
);

CREATE TABLE "BillingSubscription" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'mercado_pago',
  "externalReference" TEXT NOT NULL,
  "mercadoPagoPreapprovalId" TEXT,
  "payerEmail" TEXT NOT NULL,
  "status" "BillingSubscriptionStatus" NOT NULL DEFAULT 'pending',
  "reason" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "currencyId" TEXT NOT NULL DEFAULT 'BRL',
  "frequency" INTEGER NOT NULL DEFAULT 1,
  "frequencyType" TEXT NOT NULL DEFAULT 'months',
  "nextBillingAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "lastSyncedAt" TIMESTAMP(3),
  "cancelRequestedAt" TIMESTAMP(3),
  "canceledAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingPayment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "billingSubscriptionId" TEXT NOT NULL,
  "providerPaymentId" TEXT NOT NULL,
  "status" "BillingPaymentStatus" NOT NULL DEFAULT 'pending',
  "amount" DECIMAL(10,2) NOT NULL,
  "currencyId" TEXT NOT NULL DEFAULT 'BRL',
  "approvedAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "refundStatus" TEXT,
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BillingPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingWebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'mercado_pago',
  "topic" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "action" TEXT,
  "requestId" TEXT,
  "signatureTs" TEXT,
  "dedupeKey" TEXT NOT NULL,
  "payload" JSONB,
  "status" "BillingWebhookEventStatus" NOT NULL DEFAULT 'pending',
  "error" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingSubscription_externalReference_key" ON "BillingSubscription"("externalReference");
CREATE UNIQUE INDEX "BillingSubscription_mercadoPagoPreapprovalId_key" ON "BillingSubscription"("mercadoPagoPreapprovalId");
CREATE INDEX "BillingSubscription_tenantId_createdAt_idx" ON "BillingSubscription"("tenantId", "createdAt");
CREATE INDEX "BillingSubscription_tenantId_status_idx" ON "BillingSubscription"("tenantId", "status");
CREATE INDEX "BillingSubscription_planId_createdAt_idx" ON "BillingSubscription"("planId", "createdAt");

CREATE UNIQUE INDEX "BillingPayment_providerPaymentId_key" ON "BillingPayment"("providerPaymentId");
CREATE INDEX "BillingPayment_tenantId_createdAt_idx" ON "BillingPayment"("tenantId", "createdAt");
CREATE INDEX "BillingPayment_billingSubscriptionId_createdAt_idx" ON "BillingPayment"("billingSubscriptionId", "createdAt");

CREATE UNIQUE INDEX "BillingWebhookEvent_dedupeKey_key" ON "BillingWebhookEvent"("dedupeKey");
CREATE INDEX "BillingWebhookEvent_provider_topic_createdAt_idx" ON "BillingWebhookEvent"("provider", "topic", "createdAt");
CREATE INDEX "BillingWebhookEvent_resourceId_createdAt_idx" ON "BillingWebhookEvent"("resourceId", "createdAt");

ALTER TABLE "BillingSubscription"
  ADD CONSTRAINT "BillingSubscription_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingSubscription"
  ADD CONSTRAINT "BillingSubscription_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingPayment"
  ADD CONSTRAINT "BillingPayment_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingPayment"
  ADD CONSTRAINT "BillingPayment_billingSubscriptionId_fkey"
  FOREIGN KEY ("billingSubscriptionId") REFERENCES "BillingSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
