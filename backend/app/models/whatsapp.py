"""
Modelo para integração WhatsApp - Vincula número de telefone ao usuário
"""
import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.database import Base


class WhatsAppUser(Base):
    """
    Armazena o vínculo entre número WhatsApp e usuário do sistema.
    """
    __tablename__ = "whatsapp_users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Número WhatsApp (formato: 5511999999999)
    phone_number = Column(String(20), unique=True, nullable=False, index=True)
    
    # Informações do usuário vinculado
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    # Status do vínculo
    is_verified = Column(Boolean, default=False)
    verification_code = Column(String(6), nullable=True)
    verification_expires = Column(DateTime, nullable=True)
    
    # CPF usado na verificação
    cpf = Column(String(11), nullable=True)
    
    # Preferências de notificação
    notify_transactions = Column(Boolean, default=True)
    notify_bills = Column(Boolean, default=True)
    notify_goals = Column(Boolean, default=False)
    
    # Metadados
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_message_at = Column(DateTime, nullable=True)
    
    # Relações
    tenant = relationship("Tenant", back_populates="whatsapp_users")
    user = relationship("User", back_populates="whatsapp_accounts")
    
    # Histórico de comandos
    commands = relationship("WhatsAppCommand", back_populates="whatsapp_user", cascade="all, delete-orphan")


class WhatsAppCommand(Base):
    """
    Armazena histórico de comandos executados via WhatsApp.
    """
    __tablename__ = "whatsapp_commands"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    whatsapp_user_id = Column(UUID(as_uuid=True), ForeignKey("whatsapp_users.id"), nullable=False)
    
    # Tipo de comando
    command_type = Column(String(50), nullable=False)  # expense, income, balance, list, help, etc
    
    # Dados do comando (JSON)
    command_data = Column(Text, nullable=True)
    
    # Resultado
    success = Column(Boolean, default=False)
    response_message = Column(Text, nullable=True)
    
    # Metadados
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relações
    whatsapp_user = relationship("WhatsAppUser", back_populates="commands")


class WhatsAppSession(Base):
    """
    Gerencia sessões ativas de comando (para fluxos multi-passo).
    """
    __tablename__ = "whatsapp_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    whatsapp_user_id = Column(UUID(as_uuid=True), ForeignKey("whatsapp_users.id"), nullable=False)
    
    # Tipo de sessão (ex: add_expense, add_income)
    session_type = Column(String(50), nullable=False)
    
    # Dados temporários da sessão (JSON)
    session_data = Column(Text, nullable=True)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Expiração (padrão: 10 minutos)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
