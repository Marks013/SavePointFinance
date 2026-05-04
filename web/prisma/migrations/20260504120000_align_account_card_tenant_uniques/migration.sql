WITH ranked_accounts AS (
  SELECT
    "id",
    row_number() OVER (PARTITION BY "tenantId", "name" ORDER BY "createdAt", "id") AS duplicate_rank
  FROM "FinancialAccount"
)
UPDATE "FinancialAccount" AS account
SET "name" = CONCAT(account."name", ' #', ranked_accounts.duplicate_rank)
FROM ranked_accounts
WHERE account."id" = ranked_accounts."id"
  AND ranked_accounts.duplicate_rank > 1;

DROP INDEX IF EXISTS "FinancialAccount_ownerUserId_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "FinancialAccount_tenantId_name_key" ON "FinancialAccount"("tenantId", "name");

WITH ranked_cards AS (
  SELECT
    "id",
    row_number() OVER (PARTITION BY "tenantId", "name" ORDER BY "createdAt", "id") AS duplicate_rank
  FROM "Card"
)
UPDATE "Card" AS card
SET "name" = CONCAT(card."name", ' #', ranked_cards.duplicate_rank)
FROM ranked_cards
WHERE card."id" = ranked_cards."id"
  AND ranked_cards.duplicate_rank > 1;

DROP INDEX IF EXISTS "Card_ownerUserId_name_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Card_tenantId_name_key" ON "Card"("tenantId", "name");
