-- AlterTable
ALTER TABLE "NotificationDelivery" ADD COLUMN "providerMessageId" TEXT;
ALTER TABLE "NotificationDelivery" ADD COLUMN "providerEventStatus" TEXT;
ALTER TABLE "NotificationDelivery" ADD COLUMN "providerEventAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_providerMessageId_key" ON "NotificationDelivery"("providerMessageId");
