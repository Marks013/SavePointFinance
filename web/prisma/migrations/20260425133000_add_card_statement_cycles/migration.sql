CREATE TABLE "CardStatementCycle" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "month" TEXT NOT NULL,
  "closeDate" TIMESTAMP(3) NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CardStatementCycle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CardStatementCycle_tenantId_cardId_month_key"
ON "CardStatementCycle"("tenantId", "cardId", "month");

CREATE INDEX "CardStatementCycle_tenantId_cardId_closeDate_idx"
ON "CardStatementCycle"("tenantId", "cardId", "closeDate");

ALTER TABLE "CardStatementCycle"
ADD CONSTRAINT "CardStatementCycle_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CardStatementCycle"
ADD CONSTRAINT "CardStatementCycle_cardId_fkey"
FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;
