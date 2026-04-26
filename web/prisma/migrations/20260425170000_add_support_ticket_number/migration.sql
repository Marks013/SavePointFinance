-- CreateSequence
CREATE SEQUENCE "SupportTicket_ticketNumber_seq";

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN "ticketNumber" INTEGER;

-- Backfill existing tickets in chronological order.
WITH numbered AS (
  SELECT "id", row_number() OVER (ORDER BY "createdAt", "id") AS rn
  FROM "SupportTicket"
)
UPDATE "SupportTicket"
SET "ticketNumber" = numbered.rn
FROM numbered
WHERE "SupportTicket"."id" = numbered."id";

-- Sync sequence with current max value.
SELECT setval(
  '"SupportTicket_ticketNumber_seq"',
  GREATEST(COALESCE((SELECT MAX("ticketNumber") FROM "SupportTicket"), 1), 1),
  (SELECT COUNT(*) > 0 FROM "SupportTicket")
);

-- Apply default and constraints after backfill.
ALTER TABLE "SupportTicket" ALTER COLUMN "ticketNumber" SET DEFAULT nextval('"SupportTicket_ticketNumber_seq"');
ALTER TABLE "SupportTicket" ALTER COLUMN "ticketNumber" SET NOT NULL;
ALTER SEQUENCE "SupportTicket_ticketNumber_seq" OWNED BY "SupportTicket"."ticketNumber";

-- CreateIndex
CREATE UNIQUE INDEX "SupportTicket_ticketNumber_key" ON "SupportTicket"("ticketNumber");
