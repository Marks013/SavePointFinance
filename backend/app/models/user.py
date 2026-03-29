import uuid
from datetime import datetime
from typing import Optional
from enum import Enum
from sqlalchemy import String, DateTime, ForeignKey, Boolean, func, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class UserRole(str, Enum):
    superadmin = "superadmin"
    admin = "admin"
    member = "member"

class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole), default=UserRole.member, nullable=False)
    whatsapp_number: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    tithe_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reset_token: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    reset_token_expires: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="users")
    transactions: Mapped[list["Transaction"]] = relationship("Transaction", back_populates="user")
    whatsapp_accounts: Mapped[list["WhatsAppUser"]] = relationship("WhatsAppUser", back_populates="user", cascade="all, delete-orphan")
    audit_logs: Mapped[list["AuditLog"]] = relationship("AuditLog", back_populates="user")
