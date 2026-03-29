import uuid
from datetime import datetime
from decimal import Decimal
from enum import Enum
from sqlalchemy import String, DateTime, ForeignKey, Numeric, Integer, func, Boolean, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class CardType(str, Enum):
    credit = "credit"
    debit = "debit"
    both = "both"

class Card(Base):
    __tablename__ = "cards"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    last4: Mapped[str | None] = mapped_column(String(4), nullable=True)
    brand: Mapped[str] = mapped_column(String(30), default="Visa", nullable=False)
    card_type: Mapped[CardType] = mapped_column(SAEnum(CardType), default=CardType.credit, nullable=False)
    limit_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), default=Decimal("0.00"), nullable=False)
    due_day: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    close_day: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    color: Mapped[str] = mapped_column(String(7), default="#374151", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="cards", lazy="joined")
    transactions: Mapped[list["Transaction"]] = relationship("Transaction", back_populates="card", lazy="joined")
