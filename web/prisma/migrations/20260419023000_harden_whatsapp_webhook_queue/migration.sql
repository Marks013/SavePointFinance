-- Harden WhatsApp webhook queue durability and transaction idempotency.
ALTER TABLE "Transaction"
  ADD COLUMN "externalMessageId" TEXT;

CREATE UNIQUE INDEX "Transaction_externalMessageId_key"
  ON "Transaction"("externalMessageId");

ALTER TABLE "WebhookEvent"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "processedAt" TIMESTAMP(3);

CREATE INDEX "WebhookEvent_provider_status_nextAttemptAt_idx"
  ON "WebhookEvent"("provider", "status", "nextAttemptAt");
