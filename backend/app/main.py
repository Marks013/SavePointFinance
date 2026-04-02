from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
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

# Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables on startup (idempotent)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
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
        
        # Now check what's left and add missing ones
        existing_names = {i.name for i in all_institutions if i.name not in seen or i.name not in [j.name for j in to_delete]}
        
        result = await db.execute(select(Institution.name))
        existing_names = {r[0] for r in result.all()}
        
        default_institutions = [
            # Fintechs
            Institution(name="Nubank", code="260", color="#820AD1", type="fintech"),
            Institution(name="PicPay", code="380", color="#11FF00", type="wallet"),
            Institution(name="PagSeguro", code="273", color="#00D4A1", type="fintech"),
            Institution(name="Mercado Pago", code="323", color="#7946F5", type="wallet"),
            Institution(name="Inter", code="077", color="#FF7A00", type="fintech"),
            Institution(name="C6 Bank", code="336", color="#000000", type="fintech"),
            Institution(name="Nuconta", code="260", color="#820AD1", type="fintech"),
            # Bancos tradicionais
            Institution(name="Itaú", code="607", color="#EC7000", type="bank"),
            Institution(name="Bradesco", code="237", color="#0F2F63", type="bank"),
            Institution(name="Banco do Brasil", code="001", color="#FFD100", type="bank"),
            Institution(name="Santander", code="033", color="#EC1C24", type="bank"),
            Institution(name="Caixa", code="104", color="#0079D7", type="bank"),
            Institution(name="Banco Safra", code="422", color="#005C34", type="bank"),
            Institution(name="Banrisul", code="041", color="#005C34", type="bank"),
            Institution(name="Sicoob", code="756", color="#00A651", type="bank"),
            Institution(name="Sicredi", code="748", color="#1B4F71", type="bank"),
            # Carteiras digitais
            Institution(name="PayPal", code="380", color="#003087", type="wallet"),
            Institution(name="Shopee Pay", code="380", color="#FF5722", type="wallet"),
            Institution(name="Google Pay", code="380", color="#4285F4", type="wallet"),
            Institution(name="Apple Pay", code="380", color="#000000", type="wallet"),
            # Corretoras
            Institution(name="BTG Pactual", code="208", color="#009CDE", type="broker"),
            Institution(name="Rico", code="177", color="#F40612", type="broker"),
            Institution(name="XP Investimentos", code="102", color="#009145", type="broker"),
            Institution(name="Clear", code="105", color="#00A2E8", type="broker"),
            Institution(name="Toro", code="178", color="#00D39E", type="broker"),
            Institution(name="Warren", code="314", color="#F5353F", type="broker"),
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

# ── Middleware de Performance ───────────────────────────────────────────────

# Gzip compression for API responses
app.add_middleware(GZipMiddleware, minimum_size=500)

# CORS - seguro e restritivo
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "HX-Request", "HX-Trigger"],
)


# ── Request Logging & Performance ───────────────────────────────────────────

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.perf_counter()
    
    response = await call_next(request)
    
    duration = (time.perf_counter() - start_time) * 1000
    
    # Log apenas em desenvolvimento ou se demorar mais de 500ms
    if settings.APP_ENV == "development" or duration > 500:
        logger.info(
            f"{request.method} {request.url.path} - {response.status_code} - {duration:.1f}ms"
        )
    
    # Headers de performance
    response.headers["X-Process-Time"] = f"{duration:.1f}ms"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    
    return response


# ── Error Handler Global ───────────────────────────────────────────────────

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"❌ Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Erro interno do servidor. Tente novamente mais tarde.",
            "code": "INTERNAL_ERROR"
        }
    )


# ── Routers ───────────────────────────────────────────────────────────────────

# Public/user routers
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

# Admin router (superadmin only)
app.include_router(admin_router)

# Web pages router
app.include_router(web_router)

# Data export/import router
app.include_router(data_router)

# HTMX partials router
app.include_router(htmx_router)


# Health Check Otimizado

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": "2.0.0",
        "environment": settings.APP_ENV
    }


@app.exception_handler(405)
async def method_not_allowed_handler(request: Request, exc):
    return JSONResponse(
        status_code=405,
        content={
            "detail": "Método não permitido. Ação não disponível para esta funcionalidade.",
            "code": "METHOD_NOT_ALLOWED"
        }
    )


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    return JSONResponse(
        status_code=404,
        content={
            "detail": "Página não encontrada.",
            "code": "NOT_FOUND"
        }
    )


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc):
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Erro interno do servidor. Tente novamente mais tarde.",
            "code": "INTERNAL_ERROR"
        }
    )


@app.get("/health/ready")
async def health_ready():
    """Health check para kubernetes/load balancer"""
    try:
        # Teste rápido de DB
        from app.database import engine
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "error": str(e)}
        )


# Import adicional para health check
from sqlalchemy import text
