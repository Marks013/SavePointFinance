import uuid
from datetime import date
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel

from app.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.subscription import Subscription, SubscriptionType
from app.models.transaction import Transaction, TransactionType, TransactionSource, PaymentMethod

router = APIRouter(prefix="/api/v1/subscriptions", tags=["subscriptions"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class SubscriptionCreate(BaseModel):
    name: str
    amount: Decimal
    billing_day: int
    category_id: Optional[uuid.UUID] = None
    account_id: Optional[uuid.UUID] = None
    card_id: Optional[uuid.UUID] = None
    next_billing_date: date
    type: str = "expense"
    is_active: bool = True
    frequency: str = "monthly"


class SubscriptionUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[Decimal] = None
    billing_day: Optional[int] = None
    category_id: Optional[uuid.UUID] = None
    account_id: Optional[uuid.UUID] = None
    card_id: Optional[uuid.UUID] = None
    is_active: Optional[bool] = None
    next_billing_date: Optional[date] = None
    type: Optional[str] = None
    frequency: Optional[str] = None


def subscription_to_dict(sub: Subscription) -> dict:
    return {
        "id": str(sub.id),
        "name": sub.name,
        "amount": float(sub.amount),
        "billing_day": sub.billing_day,
        "category_id": str(sub.category_id) if sub.category_id else None,
        "account_id": str(sub.account_id) if sub.account_id else None,
        "card_id": str(sub.card_id) if sub.card_id else None,
        "is_active": sub.is_active,
        "next_billing_date": sub.next_billing_date.isoformat(),
        "created_at": sub.created_at.isoformat(),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[dict])
async def list_subscriptions(
    active_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = select(Subscription).where(Subscription.tenant_id == current_user.tenant_id)
    if active_only:
        q = q.where(Subscription.is_active == True)
    result = await db.execute(q.order_by(Subscription.name))
    return [subscription_to_dict(s) for s in result.scalars().all()]


@router.post("/", response_model=dict, status_code=201)
async def create_subscription(
    body: SubscriptionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # BUG FIX #17: converter string → SubscriptionType enum antes de persistir
    sub_type = SubscriptionType.income if body.type == "income" else SubscriptionType.expense

    subscription = Subscription(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        name=body.name,
        amount=body.amount,
        billing_day=body.billing_day,
        category_id=body.category_id,
        account_id=body.account_id,
        card_id=body.card_id,
        next_billing_date=body.next_billing_date,
        type=sub_type,
        is_active=body.is_active,
    )
    db.add(subscription)
    await db.commit()
    await db.refresh(subscription)
    return subscription_to_dict(subscription)


@router.put("/{subscription_id}", response_model=dict)
async def update_subscription(
    subscription_id: uuid.UUID,
    body: SubscriptionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Subscription).where(
            Subscription.id == subscription_id,
            Subscription.tenant_id == current_user.tenant_id,
        )
    )
    subscription = result.scalar_one_or_none()
    if not subscription:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")

    # BUG FIX #17/#20: converter o campo 'type' de string → SubscriptionType enum
    # antes de usar setattr, pois o modelo SQLAlchemy espera enum, não string.
    # Usar setattr com string em campo SAEnum pode funcionar em algumas versões
    # do SQLAlchemy mas lança IntegrityError ou comportamento inesperado em outras.
    update_data = body.model_dump(exclude_unset=True)

    if "type" in update_data and update_data["type"] is not None:
        type_str = update_data["type"]
        update_data["type"] = (
            SubscriptionType.income if type_str == "income" else SubscriptionType.expense
        )

    # 'frequency' não é campo do modelo — remover silenciosamente para evitar AttributeError
    update_data.pop("frequency", None)

    for key, value in update_data.items():
        setattr(subscription, key, value)

    await db.commit()
    await db.refresh(subscription)
    return subscription_to_dict(subscription)


@router.delete("/{subscription_id}")
async def delete_subscription(
    subscription_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Subscription).where(
            Subscription.id == subscription_id,
            Subscription.tenant_id == current_user.tenant_id,
        )
    )
    sub = result.scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    await db.delete(sub)
    await db.commit()
    return {"message": "Assinatura excluída com sucesso."}


@router.post("/{subscription_id}/generate-transaction")
async def generate_transaction(
    subscription_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Subscription).where(
            Subscription.id == subscription_id,
            Subscription.tenant_id == current_user.tenant_id,
        )
    )
    subscription = result.scalar_one_or_none()
    if not subscription:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")

    payment_method = (
        PaymentMethod.credit_card if subscription.card_id else PaymentMethod.money
    )

    transaction = Transaction(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        date=subscription.next_billing_date,
        amount=subscription.amount,
        description=f"Assinatura: {subscription.name}",
        type=TransactionType.expense,
        payment_method=payment_method,
        category_id=subscription.category_id,
        account_id=subscription.account_id,
        card_id=subscription.card_id,
        source=TransactionSource.manual,
        notes="Gerado automaticamente via Assinaturas",
    )

    from dateutil.relativedelta import relativedelta
    subscription.next_billing_date = subscription.next_billing_date + relativedelta(months=1)

    db.add(transaction)
    await db.commit()
    await db.refresh(transaction)

    return {
        "message": "Transação gerada com sucesso.",
        "transaction_id": str(transaction.id),
        "next_billing_date": subscription.next_billing_date.isoformat(),
    }
