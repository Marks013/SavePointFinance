-- CreateEnum
CREATE TYPE "PopupCampaignStatus" AS ENUM ('draft', 'active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "PopupCampaignKind" AS ENUM ('announcement', 'update', 'welcome');

-- CreateEnum
CREATE TYPE "PopupCampaignTone" AS ENUM ('calm', 'success', 'spotlight', 'warning');

-- CreateTable
CREATE TABLE "PopupCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "PopupCampaignStatus" NOT NULL DEFAULT 'draft',
    "kind" "PopupCampaignKind" NOT NULL DEFAULT 'announcement',
    "tone" "PopupCampaignTone" NOT NULL DEFAULT 'calm',
    "eyebrow" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "ctaLabel" TEXT,
    "ctaUrl" TEXT,
    "dismissLabel" TEXT NOT NULL DEFAULT 'Agora nao',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 100,
    "delayMs" INTEGER NOT NULL DEFAULT 1200,
    "autoHideMs" INTEGER,
    "dismissible" BOOLEAN NOT NULL DEFAULT true,
    "oncePerUser" BOOLEAN NOT NULL DEFAULT true,
    "maxViews" INTEGER,
    "showToNewUsers" BOOLEAN NOT NULL DEFAULT true,
    "showToReturningUsers" BOOLEAN NOT NULL DEFAULT true,
    "showToPlatformAdmins" BOOLEAN NOT NULL DEFAULT false,
    "showToTenantAdmins" BOOLEAN NOT NULL DEFAULT true,
    "showToMembers" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PopupCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopupCampaignView" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PopupCampaignView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PopupCampaign_status_startsAt_endsAt_priority_idx" ON "PopupCampaign"("status", "startsAt", "endsAt", "priority");

-- CreateIndex
CREATE INDEX "PopupCampaign_kind_status_idx" ON "PopupCampaign"("kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PopupCampaignView_campaignId_userId_key" ON "PopupCampaignView"("campaignId", "userId");

-- CreateIndex
CREATE INDEX "PopupCampaignView_userId_updatedAt_idx" ON "PopupCampaignView"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "PopupCampaignView" ADD CONSTRAINT "PopupCampaignView_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "PopupCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopupCampaignView" ADD CONSTRAINT "PopupCampaignView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
