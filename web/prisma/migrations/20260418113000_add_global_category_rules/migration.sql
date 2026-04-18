-- CreateTable
CREATE TABLE "GlobalCategoryRule" (
    "id" TEXT NOT NULL,
    "type" "CategoryType" NOT NULL,
    "categorySystemKey" TEXT NOT NULL,
    "normalizedKeyword" TEXT NOT NULL,
    "matchMode" "CategoryRuleMatchMode" NOT NULL DEFAULT 'exact_phrase',
    "priority" INTEGER NOT NULL DEFAULT 700,
    "confidence" DECIMAL(3,2),
    "acceptedCount" INTEGER NOT NULL DEFAULT 1,
    "createdFromTenantId" TEXT,
    "createdFromTransactionId" TEXT,
    "lastAcceptedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalCategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GlobalCategoryRule_type_normalizedKeyword_matchMode_key"
ON "GlobalCategoryRule"("type", "normalizedKeyword", "matchMode");

-- CreateIndex
CREATE INDEX "GlobalCategoryRule_type_isActive_priority_idx"
ON "GlobalCategoryRule"("type", "isActive", "priority");

-- CreateIndex
CREATE INDEX "GlobalCategoryRule_categorySystemKey_isActive_idx"
ON "GlobalCategoryRule"("categorySystemKey", "isActive");
