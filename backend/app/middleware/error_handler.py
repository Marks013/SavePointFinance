"""
Middleware de Captura de Erros
- Captura todos os erros não tratados
- Log estruturado automático
- Não afeta performance em produção
"""
import traceback
import json
import time
from datetime import datetime, timezone
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from app.services.audit_logger import audit_logger


class ErrorCaptureMiddleware(BaseHTTPMiddleware):
    """
    Middleware que captura erros automaticamente
    Não interfere no fluxo normal - apenas loga se algo der errado
    """
    
    def __init__(self, app: ASGIApp):
        super().__init__(app)
        # R paths que não devem ser logados (muito barulhentos)
        self.skip_paths = {
            "/health",
            "/docs",
            "/openapi.json",
            "/redoc",
            "/favicon.ico",
            "/static/",
            "/css/",
            "/js/",
            "/images/",
            "/health",
        }
    
    async def dispatch(self, request: Request, call_next):
        # Skip para paths estáticos e saúde
        if any(request.url.path.startswith(p) for p in self.skip_paths):
            return await call_next(request)
        
        start_time = time.time()
        
        try:
            response = await call_next(request)
            
            # Log de 请求 com status de erro (4xx ou 5xx)
            duration = (time.time() - start_time) * 1000
            
            if response.status_code >= 400:
                # Capturar apenas erros relevantes (não 401/403 frequentemente)
                if response.status_code not in [401, 403, 404]:
                    audit_logger.warning(
                        category="http_error",
                        action=f"status_{response.status_code}",
                        message=f"{request.method} {request.url.path} -> {response.status_code}",
                        endpoint=request.url.path,
                        method=request.method,
                        status_code=str(response.status_code),
                        duration_ms=duration
                    )
            
            return response
            
        except Exception as e:
            duration = (time.time() - start_time) * 100
            
            # Capturar exceção completa
            error_trace = traceback.format_exc()
            
            # Log de erro crítico
            audit_logger.error(
                category="unhandled_exception",
                action="exception_raised",
                message=f"{type(e).__name__}: {str(e)}",
                error=e,
                endpoint=request.url.path,
                method=request.method,
                duration_ms=duration
            )
            
            # Re-lançar para o handler de erros do FastAPI
            raise


def setup_error_handlers(app):
    """Configurar handlers de erro globais"""
    
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse
    from fastapi.exceptions import RequestValidationError
    from starlette.exceptions import HTTPException as StarletteHTTPException
    
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        # Não loggar 401/403/404 frequentemente
        if exc.status_code in [401, 403, 404]:
            return JSONResponse(
                status_code=exc.status_code,
                content={"detail": exc.detail}
            )
        
        audit_logger.warning(
            category="http_exception",
            action=f"http_{exc.status_code}",
            message=exc.detail or "Erro HTTP",
            endpoint=request.url.path,
            method=request.method,
            status_code=str(exc.status_code)
        )
        
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "detail": exc.detail,
                "status_code": exc.status_code
            }
        )
    
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        audit_logger.warning(
            category="validation_error",
            action="request_validation",
            message=f"Validação falhou: {len(exc.errors())} erros",
            endpoint=request.url.path,
            method=request.method,
            details={"errors": exc.errors()}
        )
        
        return JSONResponse(
            status_code=422,
            content={
                "detail": "Erro de validação",
                "errors": exc.errors()
            }
        )
    
    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        # Capturar exceção não tratada
        error_trace = traceback.format_exc()
        
        audit_logger.error(
            category="unhandled_error",
            action="exception_handler",
            message=f"{type(exc).__name__}: {str(exc)}",
            error=exc,
            endpoint=request.url.path,
            method=request.method
        )
        
        # Em produção, não revelar detalhes internos
        from app.config import settings
        if settings.APP_ENV == "production":
            return JSONResponse(
                status_code=500,
                content={
                    "detail": "Erro interno do servidor",
                    "error_code": "INTERNAL_ERROR"
                }
            )
        else:
            return JSONResponse(
                status_code=500,
                content={
                    "detail": str(exc),
                    "error_type": type(exc).__name__,
                    "trace": error_trace
                }
            )