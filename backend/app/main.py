"""
main.py — FastAPI app entry point

Configurado para Coolify + Oracle Cloud:
  - ProxyHeadersMiddleware: lê X-Forwarded-For / X-Forwarded-Proto do Traefik
  - TrustedHostMiddleware: aceita o domínio do Coolify
  - Cookies com secure=True quando atrás do Traefik (HTTPS)
  - CORS apenas para origens configuradas
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.exceptions import HTTPException
from contextlib import asynccontextmanager
from pathlib import Path

from app.config import settings
from app.database import engine, Base

# ── Routers ───────────────────────────────────────────────────────────────────
from app.routers.views          import router as views_router
from app.routers.views_settings import router as views_settings_router

BASE_DIR = Path(__file__).resolve().parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Cria tabelas na inicialização (idempotente)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version="3.1.0",
    docs_url="/api/docs"     if not settings.is_production else None,
    redoc_url="/api/redoc"   if not settings.is_production else None,
    openapi_url="/api/openapi.json" if not settings.is_production else None,
    lifespan=lifespan,
)


# ── Middleware: Headers de proxy (Traefik do Coolify) ────────────────────────
# DEVE ser o primeiro middleware — lê X-Forwarded-For e X-Forwarded-Proto
# para que request.url.scheme == "https" e request.client.host seja o IP real
from starlette.middleware.base import BaseHTTPMiddleware

class ProxyHeadersMiddleware(BaseHTTPMiddleware):
    """
    Confia nos headers de proxy do Traefik.
    Necessário para:
      - Cookies secure=True funcionarem (scheme precisa ser 'https')
      - Logs com IP real do cliente
      - Redirect correto de HTTP → HTTPS
    """
    async def dispatch(self, request: Request, call_next):
        # X-Forwarded-Proto: https (enviado pelo Traefik)
        forwarded_proto = request.headers.get("X-Forwarded-Proto")
        if forwarded_proto:
            request.scope["scheme"] = forwarded_proto

        # X-Forwarded-For: IP real do cliente
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            client_ip = forwarded_for.split(",")[0].strip()
            if request.scope.get("client"):
                request.scope["client"] = (client_ip, request.scope["client"][1])

        return await call_next(request)

app.add_middleware(ProxyHeadersMiddleware)


# ── Middleware: Hosts confiáveis ──────────────────────────────────────────────
# Aceita o domínio definido no Coolify + localhost para health checks internos
# Se ALLOWED_ORIGINS estiver vazio, aceita qualquer host (menos seguro)
_trusted_hosts = ["*"]  # fallback permissivo
if settings.ALLOWED_ORIGINS:
    # Extrai somente os hostnames das origens configuradas
    import re
    _trusted_hosts = []
    for origin in settings.ALLOWED_ORIGINS:
        match = re.match(r"https?://([^/]+)", origin)
        if match:
            _trusted_hosts.append(match.group(1))
    _trusted_hosts.extend(["localhost", "127.0.0.1", "savepoint_app"])
    if not _trusted_hosts:
        _trusted_hosts = ["*"]

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=_trusted_hosts,
)


# ── Middleware: CORS ──────────────────────────────────────────────────────────
# Necessário para a API JSON (/api/v1/) consumida por clientes externos
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "HX-Request", "HX-Target",
                   "HX-Trigger", "HX-Current-URL"],
)


# ── Exception handler: redireciona HTTP exceptions com Location ───────────────
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    # Redireciona (3xx)
    if exc.status_code in (301, 302, 303, 307, 308) and exc.headers.get("Location"):
        return RedirectResponse(url=exc.headers["Location"], status_code=exc.status_code)

    # HTMX: retorna erro como JSON que o frontend pode exibir como toast
    if request.headers.get("HX-Request"):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    # Fallback: JSON padrão
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


# ── Static files ──────────────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

# ── Templates ─────────────────────────────────────────────────────────────────
app.state.templates = Jinja2Templates(directory=BASE_DIR / "templates")

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(views_router)
app.include_router(views_settings_router)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/health", tags=["infra"])
async def health():
    """
    Endpoint de health check usado pelo:
      - Docker healthcheck (docker-compose.yml)
      - Coolify para verificar se o app está rodando
      - Traefik para remover instâncias doentes do load balancer
    """
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": "3.1.0",
        "env": settings.APP_ENV,
    }


# ── Startup log ───────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup_log():
    import logging
    logger = logging.getLogger("uvicorn.error")
    logger.info(f"🚀 {settings.APP_NAME} v3.1.0 iniciando")
    logger.info(f"   Ambiente: {settings.APP_ENV}")
    logger.info(f"   Cookies seguros: {settings.SECURE_COOKIES}")
    logger.info(f"   CORS origins: {settings.ALLOWED_ORIGINS or 'qualquer'}")
    logger.info(f"   IA (Anthropic): {'✅ configurada' if settings.ANTHROPIC_API_KEY else '❌ sem chave'}")
