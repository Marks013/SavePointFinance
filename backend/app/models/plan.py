"""
Modelos para Planos de Assinatura e Gestão de Limites
"""
import uuid
from datetime import datetime
from decimal import Decimal
from enum import Enum
from sqlalchemy import String, DateTime, Boolean, Integer, Numeric, Text, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.database import Base


class PlanPeriod(str, Enum):
    """Período de cobrança"""
    MONTHLY = "monthly"
    YEARLY = "yearly"
    LIFETIME = "lifetime"
    TRIAL = "trial"


class Plan(Base):
    """
    Planos disponíveis para assinatura.
    """
    __tablename__ = "plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Informações do plano
    name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(30), nullable=False, unique=True)
    description: Mapped[str] = mapped_column(String(255), nullable=True)
    
    # Preço
    price_monthly: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"))
    price_yearly: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"))
    
    # Período
    period: Mapped[PlanPeriod] = mapped_column(String(20), default=PlanPeriod.MONTHLY)
    
    # Limites
    max_users: Mapped[int] = mapped_column(Integer, default=1)
    max_transactions: Mapped[int] = mapped_column(Integer, default=-1)  # -1 = ilimitado
    max_accounts: Mapped[int] = mapped_column(Integer, default=-1)
    max_cards: Mapped[int] = mapped_column(Integer, default=-1)
    max_categories: Mapped[int] = mapped_column(Integer, default=-1)
    max_goals: Mapped[int] = mapped_column(Integer, default=-1)
    max_storage_mb: Mapped[int] = mapped_column(Integer, default=100)  # MB
    
    # Features (booleanas)
    feature_ai_classification: Mapped[bool] = mapped_column(Boolean, default=True)
    feature_whatsapp: Mapped[bool] = mapped_column(Boolean, default=False)
    feature_export_csv: Mapped[bool] = mapped_column(Boolean, default=False)
    feature_export_pdf: Mapped[bool] = mapped_column(Boolean, default=False)
    feature_import_csv: Mapped[bool] = mapped_column(Boolean, default=False)
    feature_recurring: Mapped[bool] = mapped_column(Boolean, default=False)
    feature_goals: Mapped[bool] = mapped_column(Boolean, default=False)
    feature_budget: Mapped[bool] = mapped_column(Boolean, default=False)
    feature_dashboard_custom: Mapped[bool] = mapped_column(Boolean, default=False)
    feature_api_access: Mapped[bool] = mapped_column(Boolean, default=False)
    feature_priority_support: Mapped[bool] = mapped_column(Boolean, default=False)
    feature_white_label: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_popular: Mapped[bool] = mapped_column(Boolean, default=False)
    trial_days: Mapped[int] = mapped_column(Integer, default=0)
    
    # Metadados
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacionamentos
    subscriptions: Mapped[list["TenantPlan"]] = relationship("TenantPlan", back_populates="plan")


class TenantPlan(Base):
    """
    Assinatura ativa de um tenant em um plano.
    """
    __tablename__ = "tenant_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    
    # Referências
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("plans.id"), nullable=False)
    
    # Status da assinatura
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_trial: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Datas
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Informações de pagamento
    payment_method: Mapped[str] = mapped_column(String(20), nullable=True)  # card, pix, bank_transfer
    payment_id: Mapped[str] = mapped_column(String(100), nullable=True)  # ID no gateway
    last_payment_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    next_payment_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # metadata adicional
    extra_data: Mapped[dict] = mapped_column(JSONB, default={})
    
    # Metadados
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacionamentos
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="subscription")
    plan: Mapped[Plan] = relationship("Plan", back_populates="subscriptions")
    
    # Índices
    __table_args__ = (
        Index('idx_tenant_plan_active', 'tenant_id', 'is_active'),
    )


class PlanFeature:
    """Helper para verificar features"""
    
    @staticmethod
    def can_use(plan: Plan, feature: str) -> bool:
        """Verifica se um plano possui uma feature"""
        feature_map = {
            'ai_classification': plan.feature_ai_classification,
            'whatsapp': plan.feature_whatsapp,
            'export_csv': plan.feature_export_csv,
            'export_pdf': plan.feature_export_pdf,
            'import_csv': plan.feature_import_csv,
            'recurring': plan.feature_recurring,
            'goals': plan.feature_goals,
            'budget': plan.feature_budget,
            'dashboard_custom': plan.feature_dashboard_custom,
            'api_access': plan.feature_api_access,
            'priority_support': plan.feature_priority_support,
            'white_label': plan.feature_white_label,
        }
        return feature_map.get(feature, False)
    
    @staticmethod
    def check_limit(plan: Plan, resource: str, current: int) -> tuple[bool, str]:
        """
        Verifica se o limite foi excedido.
        Retorna (pode_usar, mensagem)
        """
        limits = {
            'users': plan.max_users,
            'transactions': plan.max_transactions,
            'accounts': plan.max_accounts,
            'cards': plan.max_cards,
            'categories': plan.max_categories,
            'goals': plan.max_goals,
        }
        
        limit = limits.get(resource, -1)
        
        # -1 significa ilimitado
        if limit == -1:
            return True, ""
        
        if current >= limit:
            return False, f"Limite atingido! Seu plano {plan.name} permite até {limit} {resource}."
        
        return True, ""


def get_default_plans() -> list[dict]:
    """Retorna os planos padrão do sistema"""
    return [
        {
            "name": "Gratuito",
            "slug": "free",
            "description": "Para quem está começando",
            "price_monthly": Decimal("0.00"),
            "price_yearly": Decimal("0.00"),
            "period": PlanPeriod.LIFETIME,
            "max_users": 1,
            "max_transactions": 100,
            "max_accounts": 2,
            "max_cards": 2,
            "max_categories": 10,
            "max_goals": 0,
            "feature_ai_classification": True,
            "feature_whatsapp": False,
            "feature_export_csv": False,
            "feature_export_pdf": False,
            "feature_import_csv": False,
            "feature_recurring": False,
            "feature_goals": False,
            "feature_budget": False,
            "feature_dashboard_custom": False,
            "feature_api_access": False,
            "feature_priority_support": False,
            "feature_white_label": False,
            "is_active": True,
            "is_popular": False,
            "trial_days": 0,
        },
        {
            "name": "Básico",
            "slug": "basic",
            "description": "Para uso pessoal",
            "price_monthly": Decimal("19.90"),
            "price_yearly": Decimal("199.00"),
            "period": PlanPeriod.MONTHLY,
            "max_users": 1,
            "max_transactions": -1,
            "max_accounts": 5,
            "max_cards": 5,
            "max_categories": 30,
            "max_goals": 3,
            "feature_ai_classification": True,
            "feature_whatsapp": False,
            "feature_export_csv": True,
            "feature_export_pdf": False,
            "feature_import_csv": True,
            "feature_recurring": True,
            "feature_goals": True,
            "feature_budget": True,
            "feature_dashboard_custom": False,
            "feature_api_access": False,
            "feature_priority_support": False,
            "feature_white_label": False,
            "is_active": True,
            "is_popular": False,
            "trial_days": 7,
        },
        {
            "name": "Pro",
            "slug": "pro",
            "description": "Para famílias e pequenos negócios",
            "price_monthly": Decimal("39.90"),
            "price_yearly": Decimal("399.00"),
            "period": PlanPeriod.MONTHLY,
            "max_users": 5,
            "max_transactions": -1,
            "max_accounts": 15,
            "max_cards": 10,
            "max_categories": -1,
            "max_goals": 10,
            "feature_ai_classification": True,
            "feature_whatsapp": True,
            "feature_export_csv": True,
            "feature_export_pdf": True,
            "feature_import_csv": True,
            "feature_recurring": True,
            "feature_goals": True,
            "feature_budget": True,
            "feature_dashboard_custom": True,
            "feature_api_access": False,
            "feature_priority_support": True,
            "feature_white_label": False,
            "is_active": True,
            "is_popular": True,
            "trial_days": 14,
        },
        {
            "name": "Empresarial",
            "slug": "enterprise",
            "description": "Para empresas e-contadores",
            "price_monthly": Decimal("99.90"),
            "price_yearly": Decimal("999.00"),
            "period": PlanPeriod.MONTHLY,
            "max_users": -1,
            "max_transactions": -1,
            "max_accounts": -1,
            "max_cards": -1,
            "max_categories": -1,
            "max_goals": -1,
            "feature_ai_classification": True,
            "feature_whatsapp": True,
            "feature_export_csv": True,
            "feature_export_pdf": True,
            "feature_import_csv": True,
            "feature_recurring": True,
            "feature_goals": True,
            "feature_budget": True,
            "feature_dashboard_custom": True,
            "feature_api_access": True,
            "feature_priority_support": True,
            "feature_white_label": True,
            "is_active": True,
            "is_popular": False,
            "trial_days": 30,
        },
    ]
