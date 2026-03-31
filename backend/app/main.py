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


# ── Health Check Otimizado ───────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": "2.0.0",
        "environment": settings.APP_ENV
    }


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
