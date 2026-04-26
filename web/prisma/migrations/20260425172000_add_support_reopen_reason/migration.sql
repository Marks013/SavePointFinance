-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN "reopenReason" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "reopenedAt" TIMESTAMP(3);
ALTER TABLE "SupportTicket" ADD COLUMN "reopenCount" INTEGER NOT NULL DEFAULT 0;
