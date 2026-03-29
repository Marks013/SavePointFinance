"""
Modelo de Auditoria - Log de todas as ações no sistema
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Text, Index, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, Mapped
from app.database import Base


class AuditLog(Base):
    """
    Armazena todas as ações realizadas no sistema para auditoria.
    """
    __tablename__ = "audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Quem realizou a ação
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=True)
    
    # Tipo de ação
    action = Column(String(50), nullable=False, index=True)  # create, update, delete, login, logout, etc
    resource = Column(String(50), nullable=False, index=True)  # transaction, user, category, etc
    resource_id = Column(UUID(as_uuid=True), nullable=True)
    
    # Detalhes
    description = Column(Text, nullable=True)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    
    # IP e User Agent
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    
    # Metadados
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True)
    
    # Relacionamentos
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="audit_logs")
    user: Mapped["User"] = relationship("User", back_populates="audit_logs")
    
    # Índices para performance
    __table_args__ = (
        Index('idx_audit_tenant_created', 'tenant_id', 'created_at'),
        Index('idx_audit_user_created', 'user_id', 'created_at'),
        Index('idx_audit_resource', 'resource', 'resource_id'),
    )


class AuditService:
    """
    Serviço para registrar ações de auditoria.
    """
    
    @staticmethod
    async def log(
        db,
        action: str,
        resource: str,
        resource_id: uuid.UUID = None,
        user_id: uuid.UUID = None,
        tenant_id: uuid.UUID = None,
        description: str = None,
        old_value: dict = None,
        new_value: dict = None,
        ip_address: str = None,
        user_agent: str = None,
    ):
        """Registra uma ação de auditoria"""
        import json
        
        log_entry = AuditLog(
            user_id=user_id,
            tenant_id=tenant_id,
            action=action,
            resource=resource,
            resource_id=resource_id,
            description=description,
            old_value=json.dumps(old_value) if old_value else None,
            new_value=json.dumps(new_value) if new_value else None,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        db.add(log_entry)
        await db.flush()
        return log_entry
    
    # Ações pré-definidas
    ACTION_CREATE = "create"
    ACTION_UPDATE = "update"
    ACTION_DELETE = "delete"
    ACTION_LOGIN = "login"
    ACTION_LOGOUT = "logout"
    ACTION_VIEW = "view"
    ACTION_EXPORT = "export"
    ACTION_IMPORT = "import"
    
    # Recursos
    RESOURCE_USER = "user"
    RESOURCE_TENANT = "tenant"
    RESOURCE_TRANSACTION = "transaction"
    RESOURCE_CATEGORY = "category"
    RESOURCE_ACCOUNT = "account"
    RESOURCE_CARD = "card"
    RESOURCE_SUBSCRIPTION = "subscription"
    RESOURCE_GOAL = "goal"
    RESOURCE_SETTINGS = "settings"
    RESOURCE_WHATSAPP = "whatsapp"
