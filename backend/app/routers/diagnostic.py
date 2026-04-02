"""
Sistema de Diagnóstico Robusto do SavePoint
- Verificação confiável sem falsos positivos
- Checks profundos e assertivos
"""
import uuid
import psutil
import time
import os
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select

from app.database import get_db, engine
from app.auth import require_admin
from app.models.user import User
from app.models.tenant import Tenant
from app.models.category import Category
from app.models.account import Account
from app.models.card import Card
from app.models.transaction import Transaction
from app.config import settings

router = APIRouter(prefix="/api/v1/admin", tags=["diagnostics"])


class DiagnosticCheck:
    """Representa um único check"""
    def __init__(self, name: str):
        self.name = name
        self.status = "pending"  # pending, ok, warning, error
        self.message = ""
        self.details: Dict[str, Any] = {}

    def set_ok(self, message: str = "", details: Dict = None):
        self.status = "ok"
        self.message = message
        self.details = details or {}

    def set_warning(self, message: str, details: Dict = None):
        self.status = "warning"
        self.message = message
        self.details = details or {}

    def set_error(self, message: str, details: Dict = None):
        self.status = "error"
        self.message = message
        self.details = details or {}

    def to_dict(self):
        return {
            "name": self.name,
            "status": self.status,
            "message": self.message,
            "details": self.details
        }


class DiagnosticSuite:
    """Suite completa de diagnósticos"""
    def __init__(self):
        self.checks: Dict[str, DiagnosticCheck] = {}
        self.start_time = time.time()

    def add_check(self, check: DiagnosticCheck):
        self.checks[check.name] = check

    def get_status(self) -> str:
        has_error = any(c.status == "error" for c in self.checks.values())
        has_warning = any(c.status == "warning" for c in self.checks.values())
        if has_error:
            return "error"
        if has_warning:
            return "warning"
        return "ok"

    def to_dict(self):
        duration = (time.time() - self.start_time) * 1000
        return {
            "status": self.get_status(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "duration_ms": round(duration, 2),
            "checks": {k: v.to_dict() for k, v in self.checks.items()}
        }


async def verify_database(db: AsyncSession) -> DiagnosticSuite:
    """Verificação profunda do banco de dados"""
    suite = DiagnosticSuite()

    # Check 1: Conexão básica
    check = DiagnosticCheck("db_connection")
    try:
        start = time.time()
        result = await db.execute(text("SELECT 1, current_database()"))
        row = result.fetchone()
        latency = (time.time() - start) * 1000

        if row and row[0] == 1:
            db_name = row[1]
            if latency < 50:
                check.set_ok(f"Conectado ao banco '{db_name}'", {"latency_ms": round(latency, 2)})
            elif latency < 200:
                check.set_warning(f"Banco responde ({latency:.0f}ms)", {"latency_ms": round(latency, 2)})
            else:
                check.set_error(f"Lentidão detectada ({latency:.0f}ms)", {"latency_ms": round(latency, 2)})
        else:
            check.set_error("Resposta inesperada do banco")
    except Exception as e:
        check.set_error(f"Sem conexão: {str(e)[:100]}")
    suite.add_check(check)

    # Check 2: Tabelas essenciais
    check = DiagnosticCheck("db_tables")
    try:
        result = await db.execute(text("""
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        """))
        tables = {row[0] for row in result.fetchall()}

        required = {'users', 'tenants', 'categories', 'accounts', 'cards', 'transactions'}
        missing = required - tables

        if missing:
            check.set_error(f"Tabelas faltando: {', '.join(missing)}", {"missing": list(missing)})
        else:
            check.set_ok(f"{len(tables)} tabelas OK", {"tables_count": len(tables)})
    except Exception as e:
        check.set_error(f"Erro ao verificar tabelas: {str(e)[:80]}")
    suite.add_check(check)

    # Check 3: Índices
    check = DiagnosticCheck("db_indexes")
    try:
        result = await db.execute(text("""
            SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public'
        """))
        index_count = result.scalar() or 0

        if index_count > 0:
            check.set_ok(f"{index_count} índices encontrados", {"indexes": index_count})
        else:
            check.set_warning("Nenhum índice encontrado")
    except Exception as e:
        check.set_warning(f"Não foi possível verificar índices: {str(e)[:50]}")
    suite.add_check(check)

    return suite


async def verify_redis() -> DiagnosticSuite:
    """Verificação do Redis"""
    suite = DiagnosticSuite()
    check = DiagnosticCheck("redis_connection")

    try:
        import redis.asyncio as redis
        r = redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=3)

        start = time.time()
        pong = await r.ping()
        latency = (time.time() - start) * 1000

        await r.close()

        if pong is True:
            if latency < 50:
                check.set_ok(f"Redis OK ({latency:.1f}ms)", {"latency_ms": round(latency, 1)})
            else:
                check.set_warning(f"Redis lento ({latency:.0f}ms)", {"latency_ms": round(latency, 1)})
        else:
            check.set_warning("Redis respondeu de forma inesperada")
    except Exception as e:
        check.set_warning(f"Redis indisponível", {"error": str(e)[:50]})

    suite.add_check(check)
    return suite


async def verify_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> DiagnosticSuite:
    """Verificação do tenant atual"""
    suite = DiagnosticSuite()

    # Check 1: Tenant existe e está ativo
    check = DiagnosticCheck("tenant_exists")
    try:
        result = await db.execute(
            select(Tenant).where(Tenant.id == tenant_id)
        )
        tenant = result.scalar_one_or_none()

        if not tenant:
            check.set_error("Tenant não encontrado")
        elif not tenant.is_active:
            check.set_error("Workspace inativo")
        else:
            check.set_ok(f"Workspace: {tenant.name}", {
                "plan": tenant.plan,
                "active": tenant.is_active
            })
    except Exception as e:
        check.set_error(f"Erro: {str(e)[:80]}")
    suite.add_check(check)

    # Check 2: Plano e Trial
    check = DiagnosticCheck("subscription_status")
    try:
        result = await db.execute(
            select(Tenant).where(Tenant.id == tenant_id)
        )
        tenant = result.scalar_one_or_none()

        if tenant:
            if tenant.plan == "pro":
                check.set_ok("Plano Pro - acesso vitalício")
            elif tenant.plan == "free":
                if tenant.trial_expires_at:
                    now = datetime.now(timezone.utc)
                    exp = tenant.trial_expires_at
                    if exp.tzinfo is None:
                        exp = exp.replace(tzinfo=timezone.utc)

                    if exp < now:
                        check.set_error("Período de teste expirado", {
                            "expired_at": exp.isoformat()
                        })
                    else:
                        days_left = (exp - now).days
                        if days_left <= 7:
                            check.set_warning(f"Restam {days_left} dias de teste")
                        else:
                            check.set_ok(f"Teste: {days_left} dias restantes", {
                                "days_left": days_left
                            })
                else:
                    check.set_warning("Período de teste não inicializado")
            else:
                check.set_warning(f"Plano: {tenant.plan}")
    except Exception as e:
        check.set_warning(f"Não foi possível verificar plano: {str(e)[:50]}")
    suite.add_check(check)

    # Check 3: Dados do tenant
    check = DiagnosticCheck("tenant_data")
    try:
        cat_count = (await db.execute(
            select(Category).where(Category.tenant_id == tenant_id)
        )).scalars().all()

        acc_count = (await db.execute(
            select(Account).where(Account.tenant_id == tenant_id)
        )).scalars().all()

        card_count = (await db.execute(
            select(Card).where(Card.tenant_id == tenant_id)
        )).scalars().all()

        tx_count = (await db.execute(
            select(Transaction).where(Transaction.tenant_id == tenant_id)
        )).scalars().all()

        check.set_ok(f"OK", {
            "categories": len(cat_count),
            "accounts": len(acc_count),
            "cards": len(card_count),
            "transactions": len(tx_count)
        })
    except Exception as e:
        check.set_warning(f"Erro ao contar dados: {str(e)[:50]}")
    suite.add_check(check)

    return suite


async def verify_system() -> DiagnosticSuite:
    """Verificação de recursos do sistema"""
    suite = DiagnosticSuite()

    # CPU
    check = DiagnosticCheck("system_cpu")
    try:
        cpu = psutil.cpu_percent(interval=0.5)
        if cpu < 70:
            check.set_ok(f"CPU: {cpu:.1f}%", {"cpu_percent": round(cpu, 1)})
        elif cpu < 90:
            check.set_warning(f"CPU alta: {cpu:.1f}%", {"cpu_percent": round(cpu, 1)})
        else:
            check.set_error(f"CPU crítica: {cpu:.1f}%", {"cpu_percent": round(cpu, 1)})
    except Exception as e:
        check.set_warning("Não foi possível verificar CPU")
    suite.add_check(check)

    # Memória
    check = DiagnosticCheck("system_memory")
    try:
        mem = psutil.virtual_memory()
        if mem.percent < 70:
            check.set_ok(f"Memória: {mem.percent:.1f}%", {"memory_percent": round(mem.percent, 1)})
        elif mem.percent < 90:
            check.set_warning(f"Memória alta: {mem.percent:.1f}%", {"memory_percent": round(mem.percent, 1)})
        else:
            check.set_error(f"Memória crítica: {mem.percent:.1f}%", {"memory_percent": round(mem.percent, 1)})
    except Exception as e:
        check.set_warning("Não foi possível verificar memória")
    suite.add_check(check)

    # Disco
    check = DiagnosticCheck("system_disk")
    try:
        disk = psutil.disk_usage('/')
        if disk.percent < 80:
            check.set_ok(f"Disco: {disk.percent:.1f}%", {"disk_percent": round(disk.percent, 1)})
        elif disk.percent < 95:
            check.set_warning(f"Disco quase cheio: {disk.percent:.1f}%", {"disk_percent": round(disk.percent, 1)})
        else:
            check.set_error(f"Disco crítico: {disk.percent:.1f}%", {"disk_percent": round(disk.percent, 1)})
    except Exception as e:
        check.set_warning("Não foi possível verificar disco")
    suite.add_check(check)

    return suite


async def verify_config() -> DiagnosticSuite:
    """Verificação de configurações"""
    suite = DiagnosticSuite()

    checks = [
        ("config_app", "APP", settings.APP_NAME and settings.APP_ENV),
        ("config_ai", "AI (Anthropic)", bool(settings.ANTHROPIC_API_KEY)),
        ("config_email", "E-mail (SMTP)", bool(settings.SMTP_HOST and settings.SMTP_USER)),
    ]

    for name, label, is_set in checks:
        check = DiagnosticCheck(name)
        if is_set:
            check.set_ok(f"{label} configurado")
        else:
            check.set_warning(f"{label} não configurado")
        suite.add_check(check)

    return suite


@router.get("/diagnostic")
async def full_diagnostic(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Diagnóstico completo e profundo do sistema
    Sem falsos positivos - cada verificação é assertiva
    """
    result = DiagnosticSuite()

    # 1. Banco de dados (mais importante)
    db_suite = await verify_database(db)
    result.checks.update(db_suite.checks)

    # 2. Redis
    redis_suite = await verify_redis()
    result.checks.update(redis_suite.checks)

    # 3. Tenant atual
    tenant_suite = await verify_tenant(db, current_user.tenant_id)
    result.checks.update(tenant_suite.checks)

    # 4. Sistema
    system_suite = await verify_system()
    result.checks.update(system_suite.checks)

    # 5. Configurações
    config_suite = await verify_config()
    result.checks.update(config_suite.checks)

    # Adicionar informações da app
    check = DiagnosticCheck("app_info")
    check.set_ok(f"{settings.APP_NAME} v2.0", {
        "environment": settings.APP_ENV,
        "app_name": settings.APP_NAME
    })
    result.checks["app_info"] = check

    return result.to_dict()


@router.get("/diagnostic/quick")
async def quick_diagnostic():
    """
    Diagnóstico rápido público (sem auth)
    """
    result = DiagnosticSuite()

    # Database
    check = DiagnosticCheck("database")
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        check.set_ok("DB OK")
    except Exception as e:
        check.set_error(f"DB error: {str(e)[:50]}")
    result.checks["database"] = check

    # Redis
    check = DiagnosticCheck("redis")
    try:
        import redis.asyncio as redis
        r = redis.from_url(settings.REDIS_URL, decode_responses=True, socket_timeout=2)
        await r.ping()
        await r.close()
        check.set_ok("Redis OK")
    except Exception:
        check.set_warning("Redis offline")
    result.checks["redis"] = check

    return result.to_dict()


@router.get("/diagnostic/tenant/{tenant_id}")
async def diagnostic_for_tenant(
    tenant_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Diagnosticar um tenant específico"""
    try:
        tid = uuid.UUID(tenant_id)
    except ValueError:
        return {"error": "ID de tenant inválido"}

    # FIX: era `return await verify_tenant(db, tid).to_dict()` — não é possível
    # encadear .to_dict() diretamente no resultado de await em Python.
    # verify_tenant retorna uma coroutine; é necessário aguardá-la primeiro
    # e depois chamar .to_dict() no objeto retornado.
    suite = await verify_tenant(db, tid)
    return suite.to_dict()
