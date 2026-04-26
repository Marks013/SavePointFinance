-- AlterTable
ALTER TABLE "PopupCampaign" ADD COLUMN "targetUserId" TEXT;

-- CreateIndex
CREATE INDEX "PopupCampaign_targetUserId_status_idx" ON "PopupCampaign"("targetUserId", "status");
