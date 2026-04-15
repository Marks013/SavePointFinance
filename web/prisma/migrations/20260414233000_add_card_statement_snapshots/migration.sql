-- CreateEnum
CREATE TYPE "StatementMonthAnchor" AS ENUM (
    'close_month',
    'previous_month'
);

-- AlterTable
ALTER TABLE "Card"
ADD COLUMN "statementMonthAnchor" "StatementMonthAnchor" NOT NULL DEFAULT 'close_month';

-- Preserve the legacy behavior for existing cards until they are explicitly reviewed.
UPDATE "Card"
SET "statementMonthAnchor" = CASE
    WHEN "closeDay" > 15 THEN 'close_month'::"StatementMonthAnchor"
    ELSE 'previous_month'::"StatementMonthAnchor"
END;

-- AlterTable
ALTER TABLE "Transaction"
ADD COLUMN IF NOT EXISTS "competence" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Transaction"
ADD COLUMN "statementCloseDate" TIMESTAMP(3),
ADD COLUMN "statementDueDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Transaction_tenantId_cardId_competence_idx"
ON "Transaction"("tenantId", "cardId", "competence");

-- CreateIndex
CREATE INDEX "Transaction_tenantId_statementDueDate_idx"
ON "Transaction"("tenantId", "statementDueDate");
