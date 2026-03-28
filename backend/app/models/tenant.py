import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Integer, func, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class Tenant(Base):
    __tablename__ = "tenants"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(60), unique=True, nullable=False, index=True)
    plan: Mapped[str] = mapped_column(String(30), default="trial", nullable=False)
    max_users: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    users: Mapped[list["User"]] = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    categories: Mapped[list["Category"]] = relationship("Category", back_populates="tenant", cascade="all, delete-orphan")
    accounts: Mapped[list["Account"]] = relationship("Account", back_populates="tenant", cascade="all, delete-orphan")
    cards: Mapped[list["Card"]] = relationship("Card", back_populates="tenant", cascade="all, delete-orphan")
    transactions: Mapped[list["Transaction"]] = relationship("Transaction", back_populates="tenant", cascade="all, delete-orphan")
    subscriptions: Mapped[list["Subscription"]] = relationship("Subscription", back_populates="tenant", cascade="all, delete-orphan")
    goals: Mapped[list["Goal"]] = relationship("Goal", back_populates="tenant", cascade="all, delete-orphan")
