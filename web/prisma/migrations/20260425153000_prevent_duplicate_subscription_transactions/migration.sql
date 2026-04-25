-- Keep the first generated transaction per subscription/date before enforcing idempotency.
DELETE FROM "Transaction"
WHERE "id" IN (
    SELECT "id"
    FROM (
        SELECT
            "id",
            ROW_NUMBER() OVER (
                PARTITION BY "tenantId", "subscriptionId", "date"
                ORDER BY "createdAt" ASC, "id" ASC
            ) AS "duplicateRank"
        FROM "Transaction"
        WHERE "subscriptionId" IS NOT NULL
    ) ranked
    WHERE ranked."duplicateRank" > 1
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_tenantId_subscriptionId_date_key" ON "Transaction"("tenantId", "subscriptionId", "date");
