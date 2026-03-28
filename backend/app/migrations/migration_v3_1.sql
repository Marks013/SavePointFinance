-- ═══════════════════════════════════════════════════════════
-- Save Point Finanças v3.1 — Migration
-- Execute ONCE on your production database
-- ═══════════════════════════════════════════════════════════

-- 1. tithe_enabled no usuário (já existia, garantir default)
ALTER TABLE users ADD COLUMN IF NOT EXISTS tithe_enabled BOOLEAN DEFAULT TRUE;

-- 2. is_recurring em transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE;

-- 3. group_id em transactions (para excluir todas as parcelas)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS group_id UUID;
CREATE INDEX IF NOT EXISTS ix_transactions_group_id ON transactions(group_id);

-- 4. Tipo na tabela subscriptions (income/expense) — já existe no model, garantir enum
-- Se precisar adicionar o tipo na tabela:
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'subscriptiontype'
  ) THEN
    CREATE TYPE subscriptiontype AS ENUM ('income', 'expense');
  END IF;
END$$;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS type subscriptiontype DEFAULT 'expense';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- 5. Criar categoria "Outros" para tenants que não têm
INSERT INTO categories (id, tenant_id, name, icon, color, type, keywords, is_default, created_at)
SELECT
  gen_random_uuid(),
  t.id,
  'Outros',
  '📦',
  '#6B7280',
  'expense',
  '{}',
  true,
  NOW()
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM categories c
  WHERE c.tenant_id = t.id AND LOWER(c.name) LIKE 'outros%'
);

-- Verificar
SELECT 'Migration completed successfully' AS status;
