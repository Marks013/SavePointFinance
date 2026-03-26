from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# FIX para Coolify: o frontend (savepoint.*) chama o backend (api.*) diretamente.
# Isso é uma requisição cross-origin, então CORS precisa estar configurado corretamente.
#
# ALLOWED_ORIGINS no .env deve conter o domínio do frontend:
#   ALLOWED_ORIGINS=["https://savepoint.161.153.204.226.sslip.io"]
#
# Se ALLOWED_ORIGINS contiver "*", todas as origens são permitidas (útil para debug).

allowed = settings.ALLOWED_ORIGINS

# Detecta se o wildcard foi configurado
if "*" in allowed:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,  # credentials não funciona com wildcard
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )

# ── Routers ───────────────────────────────────────────────────────────────────
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


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME, "version": "2.0.0"}
