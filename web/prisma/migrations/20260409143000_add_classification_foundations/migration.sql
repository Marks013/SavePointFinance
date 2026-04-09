-- CreateEnum
CREATE TYPE "ClassificationSource" AS ENUM (
    'manual_input',
    'manual_rule',
    'category_keyword',
    'global_context',
    'ai_learned',
    'ai_runtime',
    'fallback',
    'unknown'
);

-- CreateEnum
CREATE TYPE "CategoryRuleSource" AS ENUM (
    'manual',
    'ai_learned',
    'imported'
);

-- CreateEnum
CREATE TYPE "CategoryRuleMatchMode" AS ENUM (
    'exact_phrase',
    'contains_phrase'
);

-- AlterTable
ALTER TABLE "Category"
ADD COLUMN "systemKey" TEXT;

-- AlterTable
ALTER TABLE "Transaction"
ADD COLUMN "classificationSource" "ClassificationSource" NOT NULL DEFAULT 'unknown',
ADD COLUMN "classificationKeyword" TEXT,
ADD COLUMN "classificationReason" TEXT,
ADD COLUMN "classificationVersion" INTEGER NOT NULL DEFAULT 2;

-- Backfill default categories by canonical system key
UPDATE "Category"
SET "systemKey" = CASE
    WHEN "type" = 'income' AND "name" = 'Salário' THEN 'salario'
    WHEN "type" = 'income' AND "name" = 'Freelance e serviços' THEN 'freelance-servicos'
    WHEN "type" = 'income' AND "name" = 'Rendimentos' THEN 'rendimentos'
    WHEN "type" = 'income' AND "name" = 'Reembolso' THEN 'reembolso'
    WHEN "type" = 'income' AND "name" = 'Vendas' THEN 'vendas'
    WHEN "type" = 'income' AND "name" = 'Transferências recebidas' THEN 'transferencias-recebidas'
    WHEN "type" = 'income' AND "name" = 'Outras receitas' THEN 'outras-receitas'
    WHEN "type" = 'expense' AND "name" = 'Supermercado' THEN 'supermercado'
    WHEN "type" = 'expense' AND "name" = 'Feira e hortifruti' THEN 'feira-hortifruti'
    WHEN "type" = 'expense' AND "name" = 'Restaurantes' THEN 'restaurantes'
    WHEN "type" = 'expense' AND "name" = 'Delivery' THEN 'delivery'
    WHEN "type" = 'expense' AND "name" = 'Café e padaria' THEN 'cafe-padaria'
    WHEN "type" = 'expense' AND "name" = 'Combustível' THEN 'combustivel'
    WHEN "type" = 'expense' AND "name" = 'Transporte' THEN 'transporte'
    WHEN "type" = 'expense' AND "name" = 'Apps de mobilidade' THEN 'apps-mobilidade'
    WHEN "type" = 'expense' AND "name" = 'Moradia' THEN 'moradia'
    WHEN "type" = 'expense' AND "name" = 'Condomínio' THEN 'condominio'
    WHEN "type" = 'expense' AND "name" = 'Energia elétrica' THEN 'energia-eletrica'
    WHEN "type" = 'expense' AND "name" = 'Água e saneamento' THEN 'agua-saneamento'
    WHEN "type" = 'expense' AND "name" = 'Internet e telefonia' THEN 'internet-telefonia'
    WHEN "type" = 'expense' AND "name" = 'Saúde' THEN 'saude'
    WHEN "type" = 'expense' AND "name" = 'Farmácia' THEN 'farmacia'
    WHEN "type" = 'expense' AND "name" = 'Educação' THEN 'educacao'
    WHEN "type" = 'expense' AND "name" = 'Streaming e assinaturas' THEN 'streaming-assinaturas'
    WHEN "type" = 'expense' AND "name" = 'Lazer' THEN 'lazer'
    WHEN "type" = 'expense' AND "name" = 'Pets' THEN 'pets'
    WHEN "type" = 'expense' AND "name" = 'Impostos e taxas' THEN 'impostos-taxas'
    WHEN "type" = 'expense' AND "name" = 'Tarifas bancárias' THEN 'tarifas-bancarias'
    WHEN "type" = 'expense' AND "name" = 'Dízimo' THEN 'dizimo'
    WHEN "type" = 'expense' AND "name" = 'Compras online' THEN 'compras-online'
    WHEN "type" = 'expense' AND "name" = 'Vestuário' THEN 'vestuario'
    WHEN "type" = 'expense' AND "name" = 'Viagem' THEN 'viagem'
    WHEN "type" = 'expense' AND "name" = 'Outras despesas' THEN 'outras-despesas'
    ELSE "systemKey"
END
WHERE "systemKey" IS NULL;

-- CreateTable
CREATE TABLE "CategoryRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "type" "CategoryType" NOT NULL,
    "normalizedKeyword" TEXT NOT NULL,
    "matchMode" "CategoryRuleMatchMode" NOT NULL DEFAULT 'exact_phrase',
    "source" "CategoryRuleSource" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "confidence" DECIMAL(3,2),
    "createdFromTransactionId" TEXT,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "lastMatchedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Category_tenantId_type_systemKey_idx" ON "Category"("tenantId", "type", "systemKey");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryRule_tenantId_type_normalizedKeyword_source_matchMode_key"
ON "CategoryRule"("tenantId", "type", "normalizedKeyword", "source", "matchMode");

-- CreateIndex
CREATE INDEX "CategoryRule_tenantId_type_isActive_priority_idx"
ON "CategoryRule"("tenantId", "type", "isActive", "priority");

-- CreateIndex
CREATE INDEX "CategoryRule_categoryId_isActive_idx"
ON "CategoryRule"("categoryId", "isActive");

-- AddForeignKey
ALTER TABLE "CategoryRule"
ADD CONSTRAINT "CategoryRule_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryRule"
ADD CONSTRAINT "CategoryRule_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
