import uuid
from datetime import datetime
from enum import Enum
from sqlalchemy import String, DateTime, func, Enum as SAEnum, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class InstitutionType(str, Enum):
    bank = "bank"
    fintech = "fintech"
    wallet = "wallet"
    broker = "broker"
    other = "other"


class Institution(Base):
    __tablename__ = "institutions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str | None] = mapped_column(String(10), nullable=True)  # ISPB or similar
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    color: Mapped[str] = mapped_column(String(7), default="#6B7280", nullable=False)
    type: Mapped[InstitutionType] = mapped_column(SAEnum(InstitutionType), default=InstitutionType.bank, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    accounts: Mapped[list["Account"]] = relationship("Account", back_populates="institution")
    cards: Mapped[list["Card"]] = relationship("Card", back_populates="institution")
