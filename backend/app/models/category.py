import uuid
from datetime import datetime
from enum import Enum
from sqlalchemy import String, DateTime, ForeignKey, Numeric, Boolean, func, Enum as SAEnum, ARRAY, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class CategoryType(str, Enum):
    income = "income"
    expense = "expense"


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    icon: Mapped[str] = mapped_column(String(50), default="tag", nullable=False)
    color: Mapped[str] = mapped_column(String(7), default="#6B7280", nullable=False)
    type: Mapped[CategoryType] = mapped_column(SAEnum(CategoryType), default=CategoryType.expense, nullable=False)
    keywords: Mapped[list[str]] = mapped_column(ARRAY(Text), default=[], nullable=False)
    monthly_limit: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="categories")
    parent: Mapped["Category | None"] = relationship("Category", remote_side="Category.id")
    transactions: Mapped[list["Transaction"]] = relationship("Transaction", back_populates="category")
