-- CreateEnum
CREATE TYPE "InvitationKind" AS ENUM ('admin_isolated', 'shared_wallet');

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN "kind" "InvitationKind" NOT NULL DEFAULT 'admin_isolated';

-- Backfill family sharing invitations created before the kind column existed.
UPDATE "Invitation"
SET "kind" = 'shared_wallet'
WHERE "id" IN (
    SELECT "entityId"
    FROM "AdminAuditLog"
    WHERE "action" = 'sharing.invitation.created'
      AND "entityType" = 'invitation'
      AND "entityId" IS NOT NULL
);

-- CreateIndex
CREATE INDEX "Invitation_tenantId_kind_idx" ON "Invitation"("tenantId", "kind");
