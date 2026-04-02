from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from contextlib import asynccontextmanager
from sqlalchemy.exc import IntegrityError as SAIntegrityError
import time
import logging

from app.config import settings
from app.database import engine, Base
from app.routers.auth import router as auth_router
from app.routers.transactions import router as transactions_router
from app.routers.categories import router as categories_router
from app.routers.accounts_cards import accounts_router, cards_router
from app.routers.reports import router as reports_router
from app.routers.webhook import router as webhook_router
from app.routers.subscriptions import router as subscriptions_router
from app.routers.installments import router as installments_router
from app.routers.goals import router as goals_router
from app.routers.admin import router as admin_router
from app.routers.web import router as web_router
from app.routers.data import router as data_router
from app.routers.htmx import router as htmx_router

# Middleware de captura de erros
from app.middleware.error_handler import setup_error_handlers

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

ERROR_TEMPLATES = {
    400: """<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Erro 400 — SavePoint</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0f0f0f;color:#f5f5f5;min-height:100vh;display:flex;align-items:center;justify-content:center}.container{text-align:center;max-width:420px;padding:40px}.icon{width:72px;height:72px;margin:0 auto 20px;background:#ef4444;border-radius:50%;display:flex;align-items:center;justify-content:center}.icon svg{width:36px;height:36px;color:#fff}h1{font-size:1.375rem;font-weight:600;margin-bottom:10px}p{color:#888;font-size:0.9375rem;line-height:1.6;margin-bottom:24px}.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 24px;background:linear-gradient(135deg,#10B981,#059669);color:#fff;border:none;border-radius:8px;font-size:0.9375rem;font-weight:500;cursor:pointer;text-decoration:none;transition:transform .2s,box-shadow .2s}.btn:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(16,185,129,.4)}</style></head><body><div class="container"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg></div><h1>Algo deu errado</h1><p>{detail}</p><a href="javascript:history.back()" class="btn">Voltar</a></div></body></html>""",
    401: """<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Sessão Expirada — SavePoint</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0f0f0f;color:#f5f5f5;min-height:100vh;display:flex;align-items:center;justify-content:center}.container{text-align:center;max-width:420px;padding:40px}.icon{width:72px;height:72px;margin:0 auto 20px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:50%;display:flex;align-items:center;justify-content:center}.icon svg{width:36px;height:36px;color:#fff}h1{font-size:1.375rem;font-weight:600;margin-bottom:10px}p{color:#888;font-size:0.9375rem;line-height:1.6;margin-bottom:24px}.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 24px;background:linear-gradient(135deg,#10B981,#059669);color:#fff;border:none;border-radius:8px;font-size:0.9375rem;font-weight:500;cursor:pointer;text-decoration:none;transition:transform .2s,box-shadow .2s}.btn:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(16,185,129,.4)}</style></head><body><div class="container"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div><h1>Sua sessão expirou</h1><p>Por segurança, sua sessão foi encerrada. Faça login novamente para continuar.</p><a href="/login" class="btn">Fazer login</a></div></body></html>""",
    403: """<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Acesso Negado — SavePoint</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0f0f0f;color:#f5f5f5;min-height:100vh;display:flex;align-items:center;justify-content:center}.container{text-align:center;max-width:420px;padding:40px}.icon{width:72px;height:72px;margin:0 auto 20px;background:#f59e0b;border-radius:50%;display:flex;align-items:center;justify-content:center}.icon svg{width:36px;height:36px;color:#fff}h1{font-size:1.375rem;font-weight:600;margin-bottom:10px}p{color:#888;font-size:0.9375rem;line-height:1.6;margin-bottom:24px}.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 24px;background:linear-gradient(135deg,#10B981,#059669);color:#fff;border:none;border-radius:8px;font-size:0.9375rem;font-weight:500;cursor:pointer;text-decoration:none;transition:transform .2s,box-shadow .2s}.btn:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(16,185,129,.4)}</style></head><body><div class="container"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div><h1>Acesso Negado</h1><p>{detail}</p><a href="/" class="btn">Voltar ao início</a></div></body></html>""",
    404: """<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Página Não Encontrada — SavePoint</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0f0f0f;color:#f5f5f5;min-height:100vh;display:flex;align-items:center;justify-content:center}.container{text-align:center;max-width:420px;padding:40px}.icon{width:72px;height:72px;margin:0 auto 20px;background:#6b7280;border-radius:50%;display:flex;align-items:center;justify-content:center}.icon svg{width:36px;height:36px;color:#fff}h1{font-size:1.375rem;font-weight:600;margin-bottom:10px}p{color:#888;font-size:0.9375rem;line-height:1.6;margin-bottom:24px}.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 24px;background:linear-gradient(135deg,#10B981,#059669);color:#fff;border:none;border-radius:8px;font-size:0.9375rem;font-weight:500;cursor:pointer;text-decoration:none;transition:transform .2s,box-shadow .2s}.btn:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(16,185,129,.4)}</style></head><body><div class="container"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div><h1>Página Não Encontrada</h1><p>O link que você acessou não existe ou foi movido.</p><a href="/" class="btn">Voltar ao início</a></div></body></html>""",
    500: """<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Erro Interno — SavePoint</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0f0f0f;color:#f5f5f5;min-height:100vh;display:flex;align-items:center;justify-content:center}.container{text-align:center;max-width:420px;padding:40px}.icon{width:72px;height:72px;margin:0 auto 20px;background:#ef4444;border-radius:50%;display:flex;align-items:center;justify-content:center}.icon svg{width:36px;height:36px;color:#fff}h1{font-size:1.375rem;font-weight:600;margin-bottom:10px}p{color:#888;font-size:0.9375rem;line-height:1.6;margin-bottom:24px}.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:12px 24px;background:linear-gradient(135deg,#10B981,#059669);color:#fff;border:none;border-radius:8px;font-size:0.9375rem;font-weight:500;cursor:pointer;text-decoration:none;transition:transform .2s,box-shadow .2s}.btn:hover{transform:translateY(-2px);box-shadow:0 4px 12px rgba(16,185,129,.4)}</style></head><body><div class="container"><div class="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div><h1>Algo deu errado</h1><p>Estamos trabalhando para resolver. Tente novamente em alguns minutos.</p><a href="/" class="btn">Voltar ao início</a></div></body></html>""",
}


def get_error_html(status_code: int, detail: str = None) -> str:
    template = ERROR_TEMPLATES.get(status_code, ERROR_TEMPLATES[500])
    if detail:
        detail = detail[:200] + "..." if len(detail) > 200 else detail
    else:
        detail = "Tente novamente mais tarde."
    return template.replace("{detail}", detail)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ─────────────────────────────────────────────────────────────────
    # FIX: Race condition ao iniciar com múltiplos workers (--workers 2)
    #
    # Problema: Cada worker uvicorn executa o lifespan de forma independente
    # e simultaneamente. O primeiro worker cria os ENUM types do PostgreSQL
    # (ex: userrole, categorytype, etc.) com sucesso. O segundo worker tenta
    # fazer o mesmo e recebe IntegrityError: "already exists".
    #
    # Solução: Capturar SAIntegrityError durante create_all e continuar se o
    # schema já foi criado por outro worker. Isso é seguro porque:
    # 1. Se o primeiro worker criou tudo com sucesso, o schema está correto.
    # 2. O segundo worker não precisa criar nada — apenas continuar.
    # ─────────────────────────────────────────────────────────────────
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except SAIntegrityError as e:
        err_str = str(e).lower()
        if "already exists" in err_str or "duplicate" in err_str or "unique" in err_str:
            logger.info("📋 Schema já inicializado por outro worker — continuando normalmente.")
        else:
            logger.error(f"❌ Erro fatal ao criar schema: {e}")
            raise

    # Seed default institutions if none exist
    from app.models.institution import Institution
    from app.database import AsyncSessionLocal
    from sqlalchemy import select, func
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Institution))
        all_institutions = list(result.scalars().all())

        # Remove duplicates by name, keeping the first one
        seen = set()
        to_delete = []
        for inst in all_institutions:
            if inst.name in seen:
                to_delete.append(inst.id)
            else:
                seen.add(inst.name)

        if to_delete:
            from sqlalchemy import delete
            await db.execute(delete(Institution).where(Institution.id.in_(to_delete)))
            await db.commit()
            logger.info(f"✅ Removed {len(to_delete)} duplicate institutions")

        result = await db.execute(select(Institution.name))
        existing_names = {r[0] for r in result.all()}

        default_institutions = [
            Institution(name="Nubank",           code="260", color="#820AD1", type="fintech"),
            Institution(name="PicPay",           code="380", color="#11FF00", type="wallet"),
            Institution(name="PagSeguro",        code="273", color="#00D4A1", type="fintech"),
            Institution(name="Mercado Pago",     code="323", color="#7946F5", type="wallet"),
            Institution(name="Inter",            code="077", color="#FF7A00", type="fintech"),
            Institution(name="C6 Bank",          code="336", color="#000000", type="fintech"),
            Institution(name="Itaú",             code="607", color="#EC7000", type="bank"),
            Institution(name="Bradesco",         code="237", color="#0F2F63", type="bank"),
            Institution(name="Banco do Brasil",  code="001", color="#FFD100", type="bank"),
            Institution(name="Santander",        code="033", color="#EC1C24", type="bank"),
            Institution(name="Caixa",            code="104", color="#0079D7", type="bank"),
            Institution(name="Banco Safra",      code="422", color="#005C34", type="bank"),
            Institution(name="Banrisul",         code="041", color="#005C34", type="bank"),
            Institution(name="Sicoob",           code="756", color="#00A651", type="bank"),
            Institution(name="Sicredi",          code="748", color="#1B4F71", type="bank"),
            Institution(name="PayPal",           code="380", color="#003087", type="wallet"),
            Institution(name="Shopee Pay",       code="380", color="#FF5722", type="wallet"),
            Institution(name="Google Pay",       code="380", color="#4285F4", type="wallet"),
            Institution(name="Apple Pay",        code="380", color="#000000", type="wallet"),
            Institution(name="BTG Pactual",      code="208", color="#009CDE", type="broker"),
            Institution(name="Rico",             code="177", color="#F40612", type="broker"),
            Institution(name="XP Investimentos", code="102", color="#009145", type="broker"),
            Institution(name="Clear",            code="105", color="#00A2E8", type="broker"),
            Institution(name="Toro",             code="178", color="#00D39E", type="broker"),
            Institution(name="Warren",           code="314", color="#F5353F", type="broker"),
        ]
        added = 0
        for inst in default_institutions:
            if inst.name not in existing_names:
                db.add(inst)
                added += 1
        if added:
            await db.commit()
            logger.info(f"✅ Added {added} default institutions")

    logger.info("✅ SavePoint Finance started")
    yield
    logger.info("👋 SavePoint Finance shutting down")


app = FastAPI(
    title=settings.APP_NAME,
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────────

app.add_middleware(GZipMiddleware, minimum_size=500)

from app.middleware.error_handler import ErrorCaptureMiddleware
app.add_middleware(ErrorCaptureMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "HX-Request", "HX-Trigger"],
)


# ── Request Logging ───────────────────────────────────────────────────────────

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.perf_counter()
    response = await call_next(request)
    duration = (time.perf_counter() - start_time) * 1000

    if settings.APP_ENV == "development" or duration > 500:
        logger.info(
            f"{request.method} {request.url.path} - {response.status_code} - {duration:.1f}ms"
        )

    response.headers["X-Process-Time"] = f"{duration:.1f}ms"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response


# ── Global Exception Handlers ─────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"❌ Unhandled exception: {exc}", exc_info=True)
    is_api  = request.url.path.startswith("/api")
    is_htmx = request.headers.get("HX-Request") == "true"

    if not is_api and not is_htmx:
        return HTMLResponse(
            status_code=500,
            content=get_error_html(500, f"Erro interno: {str(exc)[:100]}")
        )
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)[:200], "code": "INTERNAL_ERROR"}
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    is_api  = request.url.path.startswith("/api")
    is_htmx = request.headers.get("HX-Request") == "true"

    if not is_api and not is_htmx:
        return HTMLResponse(
            status_code=exc.status_code,
            content=get_error_html(exc.status_code, exc.detail)
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "code": f"HTTP_{exc.status_code}"}
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    is_api  = request.url.path.startswith("/api")
    is_htmx = request.headers.get("HX-Request") == "true"

    if not is_api and not is_htmx:
        return HTMLResponse(
            status_code=422,
            content=get_error_html(400, "Dados inválidos. Verifique os campos preenchidos.")
        )
    return JSONResponse(
        status_code=422,
        content={"detail": "Dados inválidos", "errors": exc.errors()}
    )


# ── Routers ───────────────────────────────────────────────────────────────────
# API JSON routers
app.include_router(auth_router)
app.include_router(transactions_router)
app.include_router(categories_router)
app.include_router(accounts_router)
app.include_router(cards_router)
app.include_router(reports_router)
app.include_router(webhook_router)
app.include_router(subscriptions_router)
app.include_router(installments_router)
app.include_router(goals_router)
app.include_router(admin_router)

# Migration / diagnostic routers
from app.routers.migration import router as migration_router
app.include_router(migration_router)

from app.routers.diagnostic import router as diagnostic_router
app.include_router(diagnostic_router)

from app.routers.diagnostic_complete import router as diagnostic_complete_router
app.include_router(diagnostic_complete_router)

# Web SSR pages router — deve vir ANTES do htmx_router
app.include_router(web_router)

# Data export/import
app.include_router(data_router)

# HTMX partials router — deve vir DEPOIS do web_router
app.include_router(htmx_router)


# ── Health Check ──────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": "2.0.0",
        "environment": settings.APP_ENV,
    }


@app.get("/health/ready")
async def health_ready():
    """Health check para kubernetes/load balancer"""
    try:
        from app.database import engine
        from sqlalchemy import text
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "error": str(e)}
        )


# Import para health check
from sqlalchemy import text
