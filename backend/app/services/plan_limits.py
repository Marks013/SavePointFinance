"""
Plan Limits Helper — Validates resource creation against tenant plan limits.
"""
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.tenant import Tenant


PLAN_LIMITS = {
    "free": {
        "max_users": 1,
        "max_accounts": 3,
        "max_categories": 10,
        "max_cards": 2,
        "max_transactions_per_month": 100,
        "ai_classifier": False,
        "export": False,
        "whatsapp_alerts": False,
    },
    "pro": {
        "max_users": 5,
        "max_accounts": 999,
        "max_categories": 999,
        "max_cards": 999,
        "max_transactions_per_month": 999999,
        "ai_classifier": True,
        "export": True,
        "whatsapp_alerts": True,
    },
}


async def get_tenant_limits(tenant_id: uuid.UUID, db: AsyncSession) -> dict:
    """Get the plan limits for a tenant."""
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        return PLAN_LIMITS["free"]
    return PLAN_LIMITS.get(tenant.plan, PLAN_LIMITS["free"])


async def check_limit(tenant_id: uuid.UUID, resource_type: str, db: AsyncSession) -> tuple[bool, str]:
    """
    Check if tenant can create a new resource of the given type.
    Returns (allowed, error_message).
    """
    limits = await get_tenant_limits(tenant_id, db)
    max_key = f"max_{resource_type}"
    
    if max_key not in limits:
        return True, ""  # No limit for this resource
    
    max_count = limits[max_key]
    if max_count >= 999:
        return True, ""  # Unlimited
    
    # Count current resources
    if resource_type == "accounts":
        from app.models.account import Account
        result = await db.execute(select(func.count(Account.id)).where(Account.tenant_id == tenant_id))
    elif resource_type == "cards":
        from app.models.card import Card
        result = await db.execute(select(func.count(Card.id)).where(Card.tenant_id == tenant_id))
    elif resource_type == "transactions":
        from app.models.transaction import Transaction
        result = await db.execute(select(func.count(Transaction.id)).where(Transaction.tenant_id == tenant_id))
    elif resource_type == "categories":
        from app.models.category import Category
        result = await db.execute(select(func.count(Category.id)).where(Category.tenant_id == tenant_id))
    elif resource_type == "users":
        from app.models.user import User
        result = await db.execute(select(func.count(User.id)).where(User.tenant_id == tenant_id))
    else:
        return True, ""
    
    current_count = result.scalar() or 0
    
    if current_count >= max_count:
        plan_name = "Free" if limits == PLAN_LIMITS["free"] else "Pro"
        return False, f"Limite do plano {plan_name} atingido: máximo de {max_count} {resource_type}. Faça upgrade para continuar."
    
    return True, ""


async def check_feature(tenant_id: uuid.UUID, feature: str, db: AsyncSession) -> tuple[bool, str]:
    """
    Check if tenant has access to a specific feature.
    Returns (allowed, error_message).
    """
    limits = await get_tenant_limits(tenant_id, db)
    
    if feature in limits:
        if limits[feature]:
            return True, ""
        plan_name = "Free" if limits == PLAN_LIMITS["free"] else "Pro"
        return False, f"Funcionalidade disponível apenas no plano Pro. Faça upgrade do seu plano para usar."
    
    return True, ""


async def check_transaction_limit(tenant_id: uuid.UUID, db: AsyncSession, month: int = None, year: int = None) -> tuple[bool, str]:
    """Check if tenant can add more transactions this month."""
    from datetime import date as date_type
    from app.models.transaction import Transaction

    now = date_type.today()
    month = month or now.month
    year = year or now.year

    limits = await get_tenant_limits(tenant_id, db)
    max_tx = limits.get("max_transactions_per_month", 100)

    if max_tx >= 999999:
        return True, ""

    start = date_type(year, month, 1)
    end = date_type(year + 1, 1, 1) if month == 12 else date_type(year, month + 1, 1)
    
    result = await db.execute(
        select(func.count(Transaction.id)).where(
            Transaction.tenant_id == tenant_id,
            Transaction.date >= start,
            Transaction.date < end,
        )
    )
    current_count = result.scalar() or 0
    
    if current_count >= max_tx:
        plan_name = "Free" if limits == PLAN_LIMITS["free"] else "Pro"
        return False, f"Limite do plano {plan_name} atingido: {max_tx} transações/mês. Upgrade para transações ilimitadas."
    
    return True, ""
