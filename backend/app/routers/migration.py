"""
Endpoint de Migration - Apenas para Admin
Executa a migration de atualização do banco de dados
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel

from app.database import get_db
from app.auth import require_admin
from app.models.user import User

router = APIRouter(prefix="/api/v1/admin", tags=["admin-migration"])


class MigrationResponse(BaseModel):
    success: bool
    message: str
    details: dict


@router.post("/migrate", response_model=MigrationResponse)
async def run_migration_endpoint(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Executa a migration de atualização do banco de dados.
    Apenas admins podem executar.
    """
    try:
        # 1. Adicionar campos de trial
        result = await db.execute(text("""
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'tenants' AND column_name = 'trial_start'
        """))
        if not result.fetchone():
            await db.execute(text("ALTER TABLE tenants ADD COLUMN trial_start TIMESTAMP WITH TIME ZONE"))
        
        result = await db.execute(text("""
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'tenants' AND column_name = 'trial_days'
        """))
        if not result.fetchone():
            await db.execute(text("ALTER TABLE tenants ADD COLUMN trial_days INTEGER NOT NULL DEFAULT 31"))
        
        result = await db.execute(text("""
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'tenants' AND column_name = 'trial_expires_at'
        """))
        if not result.fetchone():
            await db.execute(text("ALTER TABLE tenants ADD COLUMN trial_expires_at TIMESTAMP WITH TIME ZONE"))
        
        # 2. Migrar tenants free existentes
        result = await db.execute(text("""
            UPDATE tenants 
            SET 
                trial_start = NOW(),
                trial_days = 31,
                trial_expires_at = NOW() + INTERVAL '31 days'
            WHERE plan = 'free' 
            AND trial_expires_at IS NULL
            RETURNING id
        """))
        free_updated = len(result.fetchall())
        
        # 3. Migrar tenants pro
        result = await db.execute(text("""
            UPDATE tenants 
            SET 
                trial_start = NULL,
                trial_days = 0,
                trial_expires_at = NULL,
                expires_at = NULL
            WHERE plan = 'pro'
            RETURNING id
        """))
        pro_updated = len(result.fetchall())
        
        # 4. Migrar roles
        result = await db.execute(text("""
            UPDATE users SET role = 'admin' WHERE role = 'superadmin' RETURNING id
        """))
        roles_updated = len(result.fetchall())
        
        # 5. Criar índices
        await db.execute(text("CREATE INDEX IF NOT EXISTS idx_tenants_plan ON tenants(plan)"))
        await db.execute(text("CREATE INDEX IF NOT EXISTS idx_tenants_trial_expires ON tenants(trial_expires_at) WHERE trial_expires_at IS NOT NULL"))
        await db.execute(text("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)"))
        
        await db.commit()
        
        # Stats
        result = await db.execute(text("SELECT COUNT(*), COUNT(CASE WHEN plan = 'free' THEN 1 END), COUNT(CASE WHEN plan = 'pro' THEN 1 END) FROM tenants"))
        tenant_stats = result.fetchone()
        
        result = await db.execute(text("SELECT COUNT(*), COUNT(CASE WHEN role = 'admin' THEN 1 END), COUNT(CASE WHEN role = 'member' THEN 1 END) FROM users"))
        user_stats = result.fetchone()
        
        return MigrationResponse(
            success=True,
            message="Migration executada com sucesso!",
            details={
                "tenants_updated": {
                    "free": free_updated,
                    "pro": pro_updated
                },
                "users_updated": roles_updated,
                "indexes_created": True,
                "total_tenants": tenant_stats[0],
                "total_users": user_stats[0]
            }
        )
        
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Erro na migration: {str(e)}")