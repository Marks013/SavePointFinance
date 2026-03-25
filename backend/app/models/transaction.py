import uuid
from datetime import datetime, date
from decimal import Decimal
from enum import Enum
from sqlalchemy import String, DateTime, Date, ForeignKey, Numeric, Text, func, Enum as SAEnum, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class TransactionType(str, Enum):
    income = "income"
    expense = "expense"
    transfer = "transfer"


class TransactionSource(str, Enum):
    manual = "manual"
    whatsapp = "whatsapp"
    import_csv = "import_csv"
    import_ofx = "import_ofx"


class PaymentMethod(str, Enum):
    pix = "pix"
    money = "money"
    credit_card = "credit_card"
    debit_card = "debit_card"
    transfer = "transfer"


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    card_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("cards.id", ondelete="SET NULL"), nullable=True)

    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    type: Mapped[TransactionType] = mapped_column(SAEnum(TransactionType), nullable=False, index=True)
    source: Mapped[TransactionSource] = mapped_column(SAEnum(TransactionSource), default=TransactionSource.manual, nullable=False)
    payment_method: Mapped[PaymentMethod] = mapped_column(SAEnum(PaymentMethod), default=PaymentMethod.money, nullable=False)
    
    installments_total: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    installment_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=True)

    ai_classified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ai_confidence: Mapped[float | None] = mapped_column(Numeric(3, 2), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="transactions")
    user: Mapped["User | None"] = relationship("User", back_populates="transactions")
    category: Mapped["Category | None"] = relationship("Category", back_populates="transactions")
    account: Mapped["Account | None"] = relationship("Account", back_populates="transactions")
    card: Mapped["Card | None"] = relationship("Card", back_populates="transactions")
