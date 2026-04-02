-- ============================================================
-- SavePoint Finance - Migration Script
-- Execute este script no banco de dados para atualizar as tabelas
-- Compatible: PostgreSQL 16+
-- ============================================================

-- ============================================================
-- 1. ALTER TABLE tenants - Adicionar campos de trial
-- ============================================================

-- Verificar se as colunas já existem
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'tenants' AND column_name = 'trial_start'
    ) THEN
        ALTER TABLE tenants ADD COLUMN trial_start TIMESTAMP WITH TIME ZONE;
        ALTER TABLE tenants ADD COLUMN trial_days INTEGER NOT NULL DEFAULT 31;
        ALTER TABLE tenants ADD COLUMN trial_expires_at TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Colunas trial adicionadas com sucesso!';
    ELSE
        RAISE NOTICE 'Colunas trial já existem.';
    END IF;
END $$;

-- ============================================================
-- 2. Migrar tenants existentes do plano Free
-- ============================================================

-- Ativar trial para tenants free existentes (31 dias)
UPDATE tenants 
SET 
    trial_start = NOW(),
    trial_days = 31,
    trial_expires_at = NOW() + INTERVAL '31 days'
WHERE plan = 'free' 
AND trial_expires_at IS NULL;

-- Para tenants Pro, limpar campos de trial (acesso vitalício)
UPDATE tenants 
SET 
    trial_start = NULL,
    trial_days = 0,
    trial_expires_at = NULL,
    expires_at = NULL
WHERE plan = 'pro';

-- ============================================================
-- 3. ALTER TABLE users - Migrar roles
-- ============================================================

-- Migrar superadmin para admin (se existir)
UPDATE users 
SET role = 'admin' 
WHERE role = 'superadmin';

-- ============================================================
-- 4. Verificar resultado
-- ============================================================

SELECT 
    'Tenants' as tabela,
    COUNT(*) as total,
    COUNT(CASE WHEN plan = 'free' THEN 1 END) as free,
    COUNT(CASE WHEN plan = 'pro' THEN 1 END) as pro,
    COUNT(CASE WHEN trial_expires_at IS NOT NULL AND trial_expires_at > NOW() THEN 1 END) as trial_ativo,
    COUNT(CASE WHEN trial_expires_at IS NOT NULL AND trial_expires_at <= NOW() THEN 1 END) as trial_expirado
FROM tenants;

SELECT 
    'Users' as tabela,
    COUNT(*) as total,
    COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin,
    COUNT(CASE WHEN role = 'member' THEN 1 END) as member
FROM users;

-- ============================================================
-- 5. Criar índices para performance (opcional)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants(plan);
CREATE INDEX IF NOT EXISTS idx_tenants_trial_expires ON tenants(trial_expires_at) 
    WHERE trial_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================
-- FIM DA MIGRATION
-- ============================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration executada com sucesso!';
END $$;