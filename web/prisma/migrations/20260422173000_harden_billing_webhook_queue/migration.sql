ALTER TYPE "BillingWebhookEventStatus" ADD VALUE IF NOT EXISTS 'processing';
ALTER TYPE "BillingWebhookEventStatus" ADD VALUE IF NOT EXISTS 'dead_letter';

ALTER TABLE "BillingWebhookEvent"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3);

CREATE INDEX "BillingWebhookEvent_status_nextAttemptAt_createdAt_idx"
  ON "BillingWebhookEvent"("status", "nextAttemptAt", "createdAt");
