import uuid
from datetime import datetime
from enum import Enum
from decimal import Decimal
from sqlalchemy import String, DateTime, ForeignKey, Numeric, func, Enum as SAEnum, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class AccountType(str, Enum):
    checking = "checking"
    savings = "savings"
    investment = "investment"
    wallet = "wallet"

class Account(Base):
    __tablename__ = "accounts"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[AccountType] = mapped_column(SAEnum(AccountType), default=AccountType.checking, nullable=False)
    balance: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="BRL", nullable=False)
    color: Mapped[str] = mapped_column(String(7), default="#10B981", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="accounts")
    transactions: Mapped[list["Transaction"]] = relationship("Transaction", back_populates="account")
