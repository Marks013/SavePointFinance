-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN "closedAt" TIMESTAMP(3);
ALTER TABLE "SupportTicket" ADD COLUMN "closedByAdminUserId" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "rating" INTEGER;
ALTER TABLE "SupportTicket" ADD COLUMN "ratingProblemResolved" BOOLEAN;
ALTER TABLE "SupportTicket" ADD COLUMN "ratingReason" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "ratingImprovement" TEXT;
ALTER TABLE "SupportTicket" ADD COLUMN "ratedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "SupportTicket_rating_ratedAt_idx" ON "SupportTicket"("rating", "ratedAt");
