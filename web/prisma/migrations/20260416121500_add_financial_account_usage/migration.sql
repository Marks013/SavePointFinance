CREATE TYPE "FinancialAccountUsage" AS ENUM ('standard', 'benefit_food');

ALTER TABLE "FinancialAccount"
ADD COLUMN "usage" "FinancialAccountUsage" NOT NULL DEFAULT 'standard';
