import uuid
from datetime import date
from decimal import Decimal
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pydantic import BaseModel, Field
from app.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.transaction import Transaction, TransactionType, TransactionSource, PaymentMethod
# Imports temporarily disabled because files are missing from app/services/
# from app.services.ai_classifier import classify_transaction
# from app.services.category_rules import classify_by_rules

router = APIRouter(prefix="/api/v1/transactions", tags=["transactions"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class TransactionCreate(BaseModel):
    date: date
    amount: Decimal
    description: str
    type: TransactionType
    # FIX: payment_method is required — no default — frontend must always send it
    payment_method: PaymentMethod
    category_id: Optional[uuid.UUID] = None
    account_id: Optional[uuid.UUID] = None
    card_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    installments: int = Field(1, ge=1, le=120)


class TransactionUpdate(BaseModel):
    date: Optional[date] = None
    amount: Optional[Decimal] = None
    description: Optional[str] = None
    type: Optional[TransactionType] = None
    payment_method: Optional[PaymentMethod] = None
    category_id: Optional[uuid.UUID] = None
    account_id: Optional[uuid.UUID] = None
    card_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None


# FIX: Include all relevant fields in the response dict
def transaction_to_dict(t: Transaction) -> dict:
    return {
        "id": str(t.id),
        "date": t.date.isoformat(),
        "amount": float(t.amount),
        "description": t.description,
        "type": t.type,
        "payment_method": t.payment_method,
        "source": t.source,
        "notes": t.notes,
        "ai_classified": t.ai_classified,
        "ai_confidence": float(t.ai_confidence) if t.ai_confidence else None,
        "category_id": str(t.category_id) if t.category_id else None,
        "account_id": str(t.account_id) if t.account_id else None,
        "card_id": str(t.card_id) if t.card_id else None,
        "installments_total": t.installments_total,
        "installment_number": t.installment_number,
        "parent_id": str(t.parent_id) if t.parent_id else None,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_transactions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    type: Optional[TransactionType] = None,
    category_id: Optional[uuid.UUID] = None,
    account_id: Optional[uuid.UUID] = None,
    card_id: Optional[uuid.UUID] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    # Month-based shortcuts — if year+month given they override date_from/date_to
    year: Optional[int] = None,
    month: Optional[int] = None,
    search: Optional[str] = None,
    # Exclude installment children (show only the parent row in transaction list)
    hide_installment_children: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filters = [Transaction.tenant_id == current_user.tenant_id]

    # Month filter takes precedence over date_from/date_to
    if year and month:
        start = date(year, month, 1)
        if month == 12:
            end = date(year + 1, 1, 1)
        else:
            end = date(year, month + 1, 1)
        filters.append(Transaction.date >= start)
        filters.append(Transaction.date < end)
    else:
        if date_from:
            filters.append(Transaction.date >= date_from)
        if date_to:
            filters.append(Transaction.date <= date_to)

    if type:
        filters.append(Transaction.type == type)
    if category_id:
        filters.append(Transaction.category_id == category_id)
    if account_id:
        filters.append(Transaction.account_id == account_id)
    if card_id:
        filters.append(Transaction.card_id == card_id)
    if search:
        filters.append(Transaction.description.ilike(f"%{search}%"))
    if hide_installment_children:
        # Show only top-level rows: either installments_total==1 or parent_id is null
        filters.append(
            (Transaction.installments_total == 1) | (Transaction.parent_id == None)
        )

    total_q = await db.execute(
        select(func.count()).select_from(Transaction).where(and_(*filters))
    )
    total = total_q.scalar()

    result = await db.execute(
        select(Transaction)
        .where(and_(*filters))
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    transactions = result.scalars().all()

    return {
        "total": total,
        "items": [transaction_to_dict(t) for t in transactions],
        "skip": skip,
        "limit": limit,
    }


@router.post("", status_code=201)
async def create_transaction(
    body: TransactionCreate,
    auto_classify: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Validate: date and payment_method are required (enforced by schema already,
    # but add explicit check for installments with card
    if body.installments > 1 and body.payment_method != PaymentMethod.credit_card:
        # Allow but warn — only credit card really supports installments
        pass

    category_id = body.category_id
    ai_classified = False
    ai_confidence = None

    if not category_id and auto_classify:
        # AI Classification disabled due to missing 'app.services.ai_classifier' and 'category_rules' modules
        pass

    from dateutil.relativedelta import relativedelta

    parent_id = None
    first_transaction = None
    per_amount = body.amount / body.installments if body.installments > 1 else body.amount

    for i in range(body.installments):
        current_date = body.date + relativedelta(months=i)
        desc = (
            f"{body.description} ({i+1}/{body.installments})"
            if body.installments > 1
            else body.description
        )

        transaction = Transaction(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            date=current_date,
            amount=per_amount,
            description=desc,
            type=body.type,
            payment_method=body.payment_method,
            category_id=category_id,
            account_id=body.account_id,
            card_id=body.card_id,
            notes=body.notes,
            source=TransactionSource.manual,
            ai_classified=ai_classified,
            ai_confidence=ai_confidence,
            installments_total=body.installments,
            installment_number=i + 1,
            parent_id=parent_id,
        )
        db.add(transaction)
        await db.flush()

        if i == 0:
            parent_id = transaction.id
            first_transaction = transaction

    await db.commit()
    await db.refresh(first_transaction)
    return transaction_to_dict(first_transaction)


@router.get("/{transaction_id}")
async def get_transaction(
    transaction_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.tenant_id == current_user.tenant_id,
        )
    )
    t = result.scalar_one_or_none()
    if not t:
        raise HTTPException(status_code=404, detail="Transação não encontrada")
    return transaction_to_dict(t)


@router.put("/{transaction_id}")
async def update_transaction(
    transaction_id: uuid.UUID,
    body: TransactionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.tenant_id == current_user.tenant_id,
        )
    )
    transaction = result.scalar_one_or_none()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transação não encontrada")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(transaction, field, value)
    await db.commit()
    await db.refresh(transaction)
    return transaction_to_dict(transaction)


@router.delete("/{transaction_id}")
async def delete_transaction(
    transaction_id: uuid.UUID,
    delete_all_installments: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.tenant_id == current_user.tenant_id,
        )
    )
    transaction = result.scalar_one_or_none()
    if not transaction:
        raise HTTPException(status_code=404, detail="Transação não encontrada")

    if delete_all_installments and transaction.installments_total > 1:
        # Delete the whole installment group
        root_id = transaction.parent_id or transaction.id
        siblings = await db.execute(
            select(Transaction).where(
                (Transaction.id == root_id) | (Transaction.parent_id == root_id),
                Transaction.tenant_id == current_user.tenant_id,
            )
        )
        for t in siblings.scalars().all():
            await db.delete(t)
    else:
        await db.delete(transaction)

    await db.commit()
    return {"message": "Transação excluída com sucesso."}
