"""
Migration script para atualizar o banco de dados do SavePoint.
Execute via: python -m app.migrations.migration_v1
"""
import asyncio
from datetime import datetime, timezone, timedelta
from sqlalchemy import text
from app.database import engine, AsyncSessionLocal


async def run_migration():
    """Executa a migration de更新 do banco de dados."""
    
    print("=" * 60)
    print("SavePoint Finance - Migration v1")
    print("=" * 60)
    
    async with engine.begin() as conn:
        # ============================================================
        # 1. Adicionar campos de trial na tabela tenants
        # ============================================================
        
        # Verificar e adicionar trial_start
        result = await conn.execute(text("""
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'tenants' AND column_name = 'trial_start'
        """))
        if not result.fetchone():
            await conn.execute(text("ALTER TABLE tenants ADD COLUMN trial_start TIMESTAMP WITH TIME ZONE"))
            print("✓ Coluna trial_start adicionada")
        else:
            print("✓ Coluna trial_start já existe")
        
        # Verificar e adicionar trial_days
        result = await conn.execute(text("""
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'tenants' AND column_name = 'trial_days'
        """))
        if not result.fetchone():
            await conn.execute(text("ALTER TABLE tenants ADD COLUMN trial_days INTEGER NOT NULL DEFAULT 31"))
            print("✓ Coluna trial_days adicionada")
        else:
            print("✓ Coluna trial_days já existe")
        
        # Verificar e adicionar trial_expires_at
        result = await conn.execute(text("""
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'tenants' AND column_name = 'trial_expires_at'
        """))
        if not result.fetchone():
            await conn.execute(text("ALTER TABLE tenants ADD COLUMN trial_expires_at TIMESTAMP WITH TIME ZONE"))
            print("✓ Coluna trial_expires_at adicionada")
        else:
            print("✓ Coluna trial_expires_at já existe")
        
        # ============================================================
        # 2. Migrar tenants existentes do plano Free
        # ============================================================
        
        # Ativar trial para tenants free existentes
        result = await conn.execute(text("""
            UPDATE tenants 
            SET 
                trial_start = NOW(),
                trial_days = 31,
                trial_expires_at = NOW() + INTERVAL '31 days'
            WHERE plan = 'free' 
            AND trial_expires_at IS NULL
            RETURNING id, name
        """))
        updated_free = result.fetchall()
        print(f"✓ {len(updated_free)} tenants Free atualizados com trial")
        
        # Para tenants Pro, limpar campos de trial
        result = await conn.execute(text("""
            UPDATE tenants 
            SET 
                trial_start = NULL,
                trial_days = 0,
                trial_expires_at = NULL,
                expires_at = NULL
            WHERE plan = 'pro'
            RETURNING id
        """))
        updated_pro = result.fetchall()
        print(f"✓ {len(updated_pro)} tenants Pro atualizados (sem expiração)")
        
        # ============================================================
        # 3. Migrar roles de superadmin para admin
        # ============================================================
        
        result = await conn.execute(text("""
            UPDATE users 
            SET role = 'admin' 
            WHERE role = 'superadmin'
            RETURNING id, email
        """))
        updated_roles = result.fetchall()
        print(f"✓ {len(updated_roles)} usuários atualizados de superadmin para admin")
        
        # ============================================================
        # 4. Verificar resultado
        # ============================================================
        
        result = await conn.execute(text("""
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN plan = 'free' THEN 1 END) as free,
                COUNT(CASE WHEN plan = 'pro' THEN 1 END) as pro
            FROM tenants
        """))
        tenant_stats = result.fetchone()
        
        result = await conn.execute(text("""
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin,
                COUNT(CASE WHEN role = 'member' THEN 1 END) as member
            FROM users
        """))
        user_stats = result.fetchone()
        
        print("\n" + "=" * 60)
        print("RESULTADO DA MIGRATION")
        print("=" * 60)
        print(f"Tenants: {tenant_stats[0]} (Free: {tenant_stats[1]}, Pro: {tenant_stats[2]})")
        print(f"Users: {user_stats[0]} (Admin: {user_stats[1]}, Member: {user_stats[2]})")
        
        # Verificar trial ativo
        result = await conn.execute(text("""
            SELECT COUNT(*) FROM tenants 
            WHERE trial_expires_at IS NOT NULL AND trial_expires_at > NOW()
        """))
        trial_ativo = result.scalar()
        
        result = await conn.execute(text("""
            SELECT COUNT(*) FROM tenants 
            WHERE trial_expires_at IS NOT NULL AND trial_expires_at <= NOW()
        """))
        trial_expirado = result.scalar()
        
        print(f"Trial Ativo: {trial_ativo}, Expirado: {trial_expirado}")
        
        # ============================================================
        # 5. Criar índices para performance
        # ============================================================
        
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants(plan)"))
        await conn.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_tenants_trial_expires 
            ON tenants(trial_expires_at) 
            WHERE trial_expires_at IS NOT NULL
        """))
        await conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)"))
        print("✓ Índices criados")
        
        print("\n" + "=" * 60)
        print("MIGRATION CONCLUÍDA COM SUCESSO!")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_migration())