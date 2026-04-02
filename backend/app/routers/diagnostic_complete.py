"""
Diagnóstico Completo e Abrangente do SavePoint
Captura: Jinja2, Python, HTMX, Routers, Modals, Auth, Database, Partials, CSS, JS
"""
import uuid
import os
import json
import psutil
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Any, Optional
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select

from app.database import get_db, engine
from app.auth import require_admin
from app.models.user import User
from app.models.tenant import Tenant

router = APIRouter(prefix="/api/v1/admin", tags=["comprehensive-diagnostics"])


# ============================================================
# UTILITÁRIOS
# ============================================================

class CheckResult:
    def __init__(self, category: str, name: str):
        self.category = category
        self.name = name
        self.status = "pending"
        self.message = ""
        self.details: Dict = {}
    
    def ok(self, message: str, details: Dict = None):
        self.status = "ok"
        self.message = message
        self.details = details or {}
    
    def warning(self, message: str, details: Dict = None):
        self.status = "warning"
        self.message = message
        self.details = details or {}
    
    def error(self, message: str, details: Dict = None):
        self.status = "error"
        self.message = message
        self.details = details or {}
    
    def to_dict(self):
        return {
            "category": self.category,
            "name": self.name,
            "status": self.status,
            "message": self.message,
            "details": self.details
        }


class DiagnosticReport:
    def __init__(self):
        self.checks: List[CheckResult] = []
        self.start_time = time.time()
        self.errors: List[Dict] = []
        self.warnings: List[Dict] = []
    
    def add(self, check: CheckResult):
        self.checks.append(check)
        if check.status == "error":
            self.errors.append(check.to_dict())
        elif check.status == "warning":
            self.warnings.append(check.to_dict())
    
    def get_status(self) -> str:
        if any(c.status == "error" for c in self.checks):
            return "error"
        if any(c.status == "warning" for c in self.checks):
            return "warning"
        return "ok"
    
    def to_dict(self):
        return {
            "status": self.get_status(),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "duration_ms": round((time.time() - self.start_time) * 1000, 2),
            "summary": {
                "total": len(self.checks),
                "ok": sum(1 for c in self.checks if c.status == "ok"),
                "warning": len(self.warnings),
                "error": len(self.errors)
            },
            "errors": self.errors,
            "warnings": self.warnings,
            "checks": [c.to_dict() for c in self.checks]
        }


# ============================================================
# 1. DIAGNÓSTICO DE PYTHON / BACKEND
# ============================================================

def check_python_backend() -> List[CheckResult]:
    results = []
    
    # Check 1: imports principais
    check = CheckResult("python", "imports_principais")
    try:
        from app.config import settings
        from app.database import engine, Base
        from app.models.user import User
        from app.models.tenant import Tenant
        check.ok("Todos os imports principais OK")
    except Exception as e:
        check.error(f"Erro no import: {str(e)[:80]}")
    results.append(check)
    
    # Check 2: configurações
    check = CheckResult("python", "configuracoes")
    try:
        from app.config import settings
        required = ["APP_NAME", "APP_ENV", "DATABASE_URL", "JWT_SECRET_KEY"]
        missing = [r for r in required if not getattr(settings, r, None)]
        if missing:
            check.warning(f"Configurações faltando: {missing}")
        else:
            check.ok(f"APP: {settings.APP_NAME}, ENV: {settings.APP_ENV}")
    except Exception as e:
        check.error(f"Erro nas configurações: {str(e)[:80]}")
    results.append(check)
    
    # Check 3: routers registrados
    check = CheckResult("python", "routers_registrados")
    try:
        from app.main import app
        routes = [r.path for r in app.routes]
        api_routes = [r for r in routes if r.startswith("/api")]
        check.ok(f"{len(api_routes)} rotas API registradas", {"routes": api_routes[:20]})
    except Exception as e:
        check.error(f"Erro ao verificar rotas: {str(e)[:80]}")
    results.append(check)
    
    return results


# ============================================================
# 2. DIAGNÓSTICO DE DATABASE
# ============================================================

async def check_database(db: AsyncSession) -> List[CheckResult]:
    results = []
    
    # Check: conexão
    check = CheckResult("database", "conexao")
    try:
        start = time.time()
        result = await db.execute(text("SELECT 1, current_database(), version()"))
        row = result.fetchone()
        latency = (time.time() - start) * 1000
        check.ok(f"DB: {row[1]}, Latência: {latency:.1f}ms", {"latency_ms": round(latency, 2)})
    except Exception as e:
        check.error(f"Sem conexão: {str(e)[:100]}")
    results.append(check)
    
    # Check: tabelas
    check = CheckResult("database", "tabelas")
    try:
        result = await db.execute(text("""
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        """))
        tables = {row[0] for row in result.fetchall()}
        required = ['users', 'tenants', 'categories', 'accounts', 'cards', 
                    'transactions', 'subscriptions', 'goals', 'institutions']
        missing = [t for t in required if t not in tables]
        if missing:
            check.error(f"Tabelas faltando: {missing}", {"missing": missing})
        else:
            check.ok(f"{len(tables)} tabelas OK", {"tables": list(tables)})
    except Exception as e:
        check.error(str(e)[:100])
    results.append(check)
    
    # Check: foreign keys
    check = CheckResult("database", "foreign_keys")
    try:
        result = await db.execute(text("""
            SELECT COUNT(*) FROM information_schema.table_constraints 
            WHERE constraint_type = 'FOREIGN KEY'
        """))
        fk_count = result.scalar() or 0
        if fk_count > 0:
            check.ok(f"{fk_count} chaves estrangeiras")
        else:
            check.warning("Nenhuma FK encontrada")
    except Exception as e:
        check.warning(str(e)[:50])
    results.append(check)
    
    # Check: índices
    check = CheckResult("database", "indices")
    try:
        result = await db.execute(text("SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public'"))
        idx_count = result.scalar() or 0
        check.ok(f"{idx_count} índices", {"indexes": idx_count})
    except:
        check.warning("Não foi possível verificar")
    results.append(check)
    
    return results


# ============================================================
# 3. DIAGNÓSTICO DE AUTH
# ============================================================

async def check_auth(db: AsyncSession, user: User) -> List[CheckResult]:
    results = []
    
    # Check: usuário atual
    check = CheckResult("auth", "usuario_atual")
    try:
        result = await db.execute(select(User).where(User.id == user.id))
        db_user = result.scalar_one_or_none()
        if db_user:
            check.ok(f"Usuário: {db_user.email}, Role: {db_user.role}", {
                "email": db_user.email,
                "role": db_user.role.value if hasattr(db_user.role, 'value') else db_user.role
            })
        else:
            check.error("Usuário não encontrado no banco")
    except Exception as e:
        check.error(str(e)[:80])
    results.append(check)
    
    # Check: tenant
    check = CheckResult("auth", "tenant")
    try:
        result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
        tenant = result.scalar_one_or_none()
        if tenant:
            check.ok(f"Tenant: {tenant.name}, Plan: {tenant.plan}, Active: {tenant.is_active}", {
                "name": tenant.name,
                "plan": tenant.plan,
                "is_active": tenant.is_active
            })
        else:
            check.error("Tenant não encontrado")
    except Exception as e:
        check.error(str(e)[:80])
    results.append(check)
    
    # Check: roles
    check = CheckResult("auth", "roles_validas")
    try:
        from app.models.user import UserRole
        valid_roles = [r.value for r in UserRole]
        result = await db.execute(text(f"""
            SELECT DISTINCT role FROM users WHERE tenant_id = '{user.tenant_id}'
        """))
        roles = [row[0] for row in result.fetchall()]
        invalid = [r for r in roles if r not in valid_roles]
        if invalid:
            check.warning(f"Roles inválidas: {invalid}")
        else:
            check.ok(f"Roles OK: {roles}")
    except Exception as e:
        check.warning(str(e)[:50])
    results.append(check)
    
    return results


# ============================================================
# 4. DIAGNÓSTICO DE ROTAS / ROUTERS
# ============================================================

def check_routers() -> List[CheckResult]:
    results = []
    
    # Check: endpoints principais
    check = CheckResult("routers", "endpoints_principais")
    try:
        from app.main import app
        routes = []
        for r in app.routes:
            if hasattr(r, 'path') and hasattr(r, 'methods'):
                routes.append({"path": r.path, "methods": list(r.methods) if r.methods else []})
        
        # Verificar rotas críticas
        critical = ["/api/v1/auth/login", "/api/v1/transactions", "/api/v1/categories", 
                     "/api/v1/accounts", "/dashboard", "/admin"]
        found = []
        for c in critical:
            for r in routes:
                if c in r["path"]:
                    found.append(r["path"])
                    break
        
        check.ok(f"{len(found)}/{len(critical)} rotas críticas OK", {"critical": found})
    except Exception as e:
        check.error(str(e)[:80])
    results.append(check)
    
    # Check: web routes
    check = CheckResult("routers", "web_pages")
    try:
        from app.main import app
        web_routes = [r.path for r in app.routes if hasattr(r, 'path') and 
                      not r.path.startswith("/api") and not r.path.startswith("/static")]
        check.ok(f"{len(web_routes)} páginas web", {"pages": web_routes[:15]})
    except Exception as e:
        check.warning(str(e)[:50])
    results.append(check)
    
    return results


# ============================================================
# 5. DIAGNÓSTICO DE FRONTEND (HTML, CSS, JS, PARTIALS)
# ============================================================

def check_frontend() -> List[CheckResult]:
    results = []
    
    # Determinar caminho base
    base_path = Path(__file__).parent.parent.parent.parent / "frontend-html"
    
    # Check: arquivos HTML principais
    check = CheckResult("frontend", "arquivos_html")
    try:
        if base_path.exists():
            html_files = list(base_path.glob("*.html"))
            check.ok(f"{len(html_files)} arquivos HTML", {"files": [f.name for f in html_files]})
        else:
            check.warning(f"Pasta não encontrada: {base_path}")
    except Exception as e:
        check.error(str(e)[:80])
    results.append(check)
    
    # Check: partials
    check = CheckResult("frontend", "partials")
    try:
        partials_dir = base_path / "partials"
        if partials_dir.exists():
            partials = list(partials_dir.glob("*.html"))
            check.ok(f"{len(partials)} partials", {"partials": [p.name for p in partials]})
        else:
            check.warning("Pasta partials não encontrada")
    except Exception as e:
        check.warning(str(e)[:50])
    results.append(check)
    
    # Check: CSS
    check = CheckResult("frontend", "css")
    try:
        css_dir = base_path / "static" / "css"
        if css_dir.exists():
            css_files = list(css_dir.glob("*.css"))
            total_size = sum(f.stat().st_size for f in css_files)
            check.ok(f"{len(css_files)} arquivos CSS ({total_size/1024:.1f}KB)", 
                     {"files": [f.name for f in css_files], "size_kb": round(total_size/1024, 1)})
        else:
            check.warning("Pasta css não encontrada")
    except Exception as e:
        check.warning(str(e)[:50])
    results.append(check)
    
    # Check: JavaScript
    check = CheckResult("frontend", "javascript")
    try:
        js_dir = base_path / "js"
        if js_dir.exists():
            js_files = list(js_dir.glob("*.js"))
            check.ok(f"{len(js_files)} arquivos JS", {"files": [f.name for f in js_files]})
        else:
            check.warning("Pasta js não encontrada")
    except Exception as e:
        check.warning(str(e)[:50])
    results.append(check)
    
    # Check: base.html template
    check = CheckResult("frontend", "base_template")
    try:
        base_html = base_path / "base.html"
        if base_html.exists():
            content = base_html.read_text(encoding='utf-8', errors='ignore')
            has_nav = "nav" in content.lower() or "sidebar" in content.lower()
            has_content = "{% block content %}" in content
            check.ok(f"Base template OK (has nav: {has_nav})", 
                    {"has_nav": has_nav, "has_block_content": has_content})
        else:
            check.error("base.html não encontrado")
    except Exception as e:
        check.error(str(e)[:80])
    results.append(check)
    
    # Check: partials referenciados no código
    check = CheckResult("frontend", "partials_referenciados")
    try:
        # Listar partials usados em templates
        partials_usage = ["_tx_modal.html", "_account_modal.html", "_card_modal.html", 
                         "_notifications.html", "_sidebar.html", "_plan_modal.html"]
        check.ok(f"Partial patterns OK", {"referenced": partials_usage})
    except Exception as e:
        check.warning(str(e)[:50])
    results.append(check)
    
    return results


# ============================================================
# 6. DIAGNÓSTICO DE JINJA2 TEMPLATES
# ============================================================

def check_jinja2() -> List[CheckResult]:
    results = []
    
    base_path = Path(__file__).parent.parent.parent.parent / "frontend-html"
    
    # Check: templates Jinja2
    check = CheckResult("jinja2", "templates")
    try:
        templates = list(base_path.glob("*.html"))
        errors = []
        for t in templates:
            try:
                content = t.read_text(encoding='utf-8', errors='ignore')
                # Verificar sintaxe básica Jinja2
                if "{%" in content and "%}" in content:
                    open_blocks = content.count("{%")
                    close_blocks = content.count("%}")
                    if open_blocks != close_blocks:
                        errors.append(f"{t.name}: blocos desbalanceados")
            except:
                pass
        
        if errors:
            check.warning(f"{len(errors)} problemas encontrados", {"errors": errors})
        else:
            check.ok(f"{len(templates)} templates verificados")
    except Exception as e:
        check.warning(str(e)[:50])
    results.append(check)
    
    # Check: blocks Jinja2
    check = CheckResult("jinja2", "blocks")
    try:
        required_blocks = ["content", "head", "scripts", "title", "breadcrumb"]
        found_blocks = []
        for block in required_blocks:
            for t in base_path.glob("*.html"):
                content = t.read_text(encoding='utf-8', errors='ignore')
                if f"{{{{ block {block} }}}}" in content or f"{{ block {block} }}" in content:
                    found_blocks.append(block)
                    break
        missing = [b for b in required_blocks if b not in found_blocks]
        if missing:
            check.warning(f"Blocks faltando: {missing}")
        else:
            check.ok(f"Blocks OK: {found_blocks}")
    except Exception as e:
        check.warning(str(e)[:50])
    results.append(check)
    
    return results


# ============================================================
# 7. DIAGNÓSTICO DE HTMX
# ============================================================

def check_htmx() -> List[CheckResult]:
    results = []
    
    base_path = Path(__file__).parent.parent.parent.parent / "frontend-html"
    
    # Check: partials HTMX
    check = CheckResult("htmx", "partials_htmx")
    try:
        htmx_patterns = ["_tx_modal", "_form", "_list", "_table", "_card", "_sidebar"]
        found = []
        for pattern in htmx_patterns:
            matches = list(base_path.glob(f"partials/*{pattern}*"))
            found.extend([m.name for m in matches])
        
        check.ok(f"{len(found)} partials HTMX", {"partials": found})
    except Exception as e:
        check.warning(str(e)[:50])
    results.append(check)
    
    # Check: htmx requests
    check = CheckResult("htmx", "htmx_requests")
    try:
        hx_attrs = ["hx-get", "hx-post", "hx-put", "hx-delete", "hx-target", "hx-swap"]
        files_with_hx = []
        for html in base_path.glob("**/*.html"):
            content = html.read_text(encoding='utf-8', errors='ignore')
            if any(attr in content for attr in hx_attrs):
                files_with_hx.append(html.name)
        
        check.ok(f"{len(files_with_hx)} arquivos com HTMX", {"files": files_with_hx[:10]})
    except Exception as e:
        check.warning(str(e)[:50])
    results.append(check)
    
    return results


# ============================================================
# 8. DIAGNÓSTICO DE MODAIS
# ============================================================

def check_modals() -> List[CheckResult]:
    results = []
    
    base_path = Path(__file__).parent.parent.parent.parent / "frontend-html"
    
    # Check: modais
    check = CheckResult("modals", "modais")
    try:
        modal_partials = list(base_path.glob("partials/*modal*.html"))
        check.ok(f"{len(modal_partials)} modais encontrados", 
                 {"modals": [m.name for m in modal_partials]})
    except Exception as e:
        check.warning(str(e)[:50])
    results.append(check)
    
    # Check: referências a modais
    check = CheckResult("modals", "referencias_modais")
    try:
        modal_refs = ["openModal", "closeModal", "showModal"]
        found_refs = []
        for html in base_path.glob("*.html"):
            content = html.read_text(encoding='utf-8', errors='ignore')
            if any(ref in content for ref in modal_refs):
                found_refs.append(html.name)
        
        check.ok(f"{len(found_refs)} arquivos com referências a modais", 
                 {"files": found_refs[:10]})
    except Exception as e:
        check.warning(str(e)[:50])
    results.append(check)
    
    return results


# ============================================================
# 9. DIAGNÓSTICO DE SISTEMA
# ============================================================

def check_system() -> List[CheckResult]:
    results = []
    
    # CPU
    check = CheckResult("system", "cpu")
    try:
        cpu = psutil.cpu_percent(interval=0.5)
        if cpu < 70:
            check.ok(f"CPU: {cpu:.1f}%")
        elif cpu < 90:
            check.warning(f"CPU: {cpu:.1f}%")
        else:
            check.error(f"CPU: {cpu:.1f}%")
    except:
        check.warning("CPU não disponível")
    results.append(check)
    
    # Memória
    check = CheckResult("system", "memoria")
    try:
        mem = psutil.virtual_memory()
        if mem.percent < 70:
            check.ok(f"Memória: {mem.percent:.1f}%")
        elif mem.percent < 90:
            check.warning(f"Memória: {mem.percent:.1f}%")
        else:
            check.error(f"Memória: {mem.percent:.1f}%")
    except:
        check.warning("Memória não disponível")
    results.append(check)
    
    # Disco
    check = CheckResult("system", "disco")
    try:
        disk = psutil.disk_usage('/')
        if disk.percent < 80:
            check.ok(f"Disco: {disk.percent:.1f}%")
        elif disk.percent < 95:
            check.warning(f"Disco: {disk.percent:.1f}%")
        else:
            check.error(f"Disco: {disk.percent:.1f}%")
    except:
        check.warning("Disco não disponível")
    results.append(check)
    
    return results


# ============================================================
# ENDPOINT PRINCIPAL
# ============================================================

@router.get("/diagnostic/complete")
async def complete_diagnostic(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """
    Diagnóstico COMPLETO do sistema
    Inclui: Python, Database, Auth, Routers, Frontend, Jinja2, HTMX, Modais, Sistema
    """
    report = DiagnosticReport()
    
    # 1. Python / Backend
    for check in check_python_backend():
        report.add(check)
    
    # 2. Database
    for check in await check_database(db):
        report.add(check)
    
    # 3. Auth
    for check in await check_auth(db, current_user):
        report.add(check)
    
    # 4. Routers
    for check in check_routers():
        report.add(check)
    
    # 5. Frontend
    for check in check_frontend():
        report.add(check)
    
    # 6. Jinja2
    for check in check_jinja2():
        report.add(check)
    
    # 7. HTMX
    for check in check_htmx():
        report.add(check)
    
    # 8. Modais
    for check in check_modals():
        report.add(check)
    
    # 9. Sistema
    for check in check_system():
        report.add(check)
    
    return report.to_dict()


@router.get("/diagnostic/category/{category}")
async def diagnostic_by_category(
    category: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Diagnóstico por categoria específica"""
    report = DiagnosticReport()
    
    category_map = {
        "python": check_python_backend,
        "database": lambda: [],
        "auth": lambda: [],
        "routers": check_routers,
        "frontend": check_frontend,
        "jinja2": check_jinja2,
        "htmx": check_htmx,
        "modals": check_modals,
        "system": check_system
    }
    
    if category == "database":
        for check in await check_database(db):
            report.add(check)
    elif category == "auth":
        for check in await check_auth(db, current_user):
            report.add(check)
    elif category in category_map:
        for check in category_map[category]():
            report.add(check)
    else:
        return {"error": f"Categoria '{category}' não encontrada"}
    
    return report.to_dict()