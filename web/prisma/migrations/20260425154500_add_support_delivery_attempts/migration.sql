-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN "deliveryAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SupportTicket" ADD COLUMN "lastDeliveryAttemptAt" TIMESTAMP(3);
