"""
Sistema de Logging Estruturado do SavePoint
- Não interfere na performance (apenas logged em DEBUG)
- Formato JSON para fácil parsing
- Categorização de erros
"""
import logging
import json
import traceback
import uuid
from datetime import datetime, timezone
from typing import Optional, Any
from functools import wraps
from fastapi import Request
from sqlalchemy import Column, String, DateTime, Text, JSON
from app.database import Base

# Logger configurado
logger = logging.getLogger("savepoint")
logger.setLevel(logging.DEBUG)


class LogLevel:
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class AuditLog(Base):
    """Tabela de auditoria para logs estruturados"""
    __tablename__ = "app_audit_logs"
    __table_args__ = {"extend_existing": True}
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    timestamp = Column(DateTime(timezone=True), default=datetime.now(timezone.utc), index=True)
    level = Column(String(20), index=True)
    category = Column(String(50), index=True)  # auth, transaction, payment, etc.
    action = Column(String(100), index=True)
    user_id = Column(String(36), nullable=True, index=True)
    tenant_id = Column(String(36), nullable=True, index=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    endpoint = Column(String(255), nullable=True)
    method = Column(String(10), nullable=True)
    status_code = Column(String(10), nullable=True)
    message = Column(Text, nullable=False)
    details = Column(JSON, nullable=True)
    error_trace = Column(Text, nullable=True)
    request_data = Column(JSON, nullable=True)
    response_data = Column(JSON, nullable=True)
    duration_ms = Column(String(20), nullable=True)


class DiagnosticLogger:
    """Classe principal para logging estruturado"""
    
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._setup_logger()
        return cls._instance
    
    def _setup_logger(self):
        """Configura o logger com handler customizado"""
        # Handler que não bloqueia (non-blocking)
        handler = logging.StreamHandler()
        handler.setLevel(logging.DEBUG)
        
        # Formato JSON para produção
        formatter = logging.Formatter('%(message)s')
        handler.setFormatter(formatter)
        
        logger.addHandler(handler)
        logger.propagate = False
    
    def _log(
        self,
        level: str,
        category: str,
        action: str,
        message: str,
        user_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
        endpoint: Optional[str] = None,
        method: Optional[str] = None,
        status_code: Optional[int] = None,
        details: Optional[dict] = None,
        error_trace: Optional[str] = None,
        request_data: Optional[dict] = None,
        duration_ms: Optional[float] = None,
    ):
        """Método interno de logging"""
        # Structured log object
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "category": category,
            "action": action,
            "message": message,
            "user_id": user_id,
            "tenant_id": tenant_id,
            "endpoint": endpoint,
            "method": method,
            "status_code": status_code,
            "details": details,
            "error_trace": error_trace,
            "duration_ms": duration_ms,
        }
        
        # Log no console em modo DEBUG
        if logger.isEnabledFor(getattr(logging, level.upper(), logging.DEBUG)):
            logger.log(getattr(logging, level.upper()), json.dumps(log_entry))
        
        return log_entry
    
    def debug(self, category: str, action: str, message: str, **kwargs):
        return self._log(LogLevel.DEBUG, category, action, message, **kwargs)
    
    def info(self, category: str, action: str, message: str, **kwargs):
        return self._log(LogLevel.INFO, category, action, message, **kwargs)
    
    def warning(self, category: str, action: str, message: str, **kwargs):
        return self._log(LogLevel.WARNING, category, action, message, **kwargs)
    
    def error(
        self,
        category: str,
        action: str,
        message: str,
        error: Optional[Exception] = None,
        **kwargs
    ):
        error_trace = traceback.format_exc() if error else None
        return self._log(
            LogLevel.ERROR, 
            category, 
            action, 
            message,
            error_trace=error_trace,
            **kwargs
        )
    
    def critical(
        self,
        category: str,
        action: str,
        message: str,
        error: Optional[Exception] = None,
        **kwargs
    ):
        error_trace = traceback.format_exc() if error else None
        return self._log(
            LogLevel.CRITICAL, 
            category, 
            action, 
            message,
            error_trace=error_trace,
            **kwargs
        )


# Instância global
audit_logger = DiagnosticLogger()


def log_action(
    category: str,
    action: str,
    message: str = "",
    level: str = LogLevel.INFO
):
    """
    Decorator para logar automaticamente funções/endpoints
    Não afeta performance em produção (apenas adiciona metadata)
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            start_time = datetime.now(timezone.utc)
            
            # Extrair request se disponível
            request = kwargs.get('request')
            user = kwargs.get('current_user')
            
            user_id = str(user.id) if user else None
            tenant_id = str(user.tenant_id) if user and hasattr(user, 'tenant_id') else None
            endpoint = request.url.path if request else None
            method = request.method if request else None
            ip = request.client.host if request and request.client else None
            
            try:
                result = await func(*args, **kwargs)
                
                # Log de sucesso
                duration = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
                audit_logger.info(
                    category=category,
                    action=action,
                    message=message or f"{action} executada com sucesso",
                    user_id=user_id,
                    tenant_id=tenant_id,
                    endpoint=endpoint,
                    method=method,
                    duration_ms=duration
                )
                
                return result
                
            except Exception as e:
                duration = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
                
                # Log de erro
                audit_logger.error(
                    category=category,
                    action=action,
                    message=str(e),
                    error=e,
                    user_id=user_id,
                    tenant_id=tenant_id,
                    endpoint=endpoint,
                    method=method,
                    duration_ms=duration
                )
                
                raise
        
        return wrapper
    return decorator


# Funções helper para uso rápido
def log_auth(action: str, message: str, **kwargs):
    audit_logger.info("auth", action, message, **kwargs)

def log_transaction(action: str, message: str, **kwargs):
    audit_logger.info("transaction", action, message, **kwargs)

def log_payment(action: str, message: str, **kwargs):
    audit_logger.info("payment", action, message, **kwargs)

def log_user(action: str, message: str, **kwargs):
    audit_logger.info("user", action, message, **kwargs)

def log_system(action: str, message: str, **kwargs):
    audit_logger.info("system", action, message, **kwargs)

def log_error(category: str, action: str, message: str, error: Exception = None, **kwargs):
    audit_logger.error(category, action, message, error=error, **kwargs)