-- AlterTable
ALTER TABLE "WhatsAppMessage" ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppMessage_idempotencyKey_key" ON "WhatsAppMessage"("idempotencyKey");
