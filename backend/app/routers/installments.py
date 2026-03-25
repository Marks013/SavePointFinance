import uuid
from datetime import date
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from app.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.transaction import Transaction

router = APIRouter(prefix="/api/v1/installments", tags=["installments"])


def installment_group_to_dict(
    root: Transaction,
    all_installments: list[Transaction],
) -> dict:
    today = date.today()

    total_amount = sum(t.amount for t in all_installments)
    paid_amount = sum(t.amount for t in all_installments if t.date <= today)
    paid_count = sum(1 for t in all_installments if t.date <= today)

    # FIX: next_installment_date = first future installment date, not root date
    future = sorted([t for t in all_installments if t.date > today], key=lambda t: t.date)
    next_date = future[0].date.isoformat() if future else None

    # Clean description — strip the "(1/10)" suffix that was appended on create
    description = root.description
    if " (" in description and "/" in description and description.endswith(")"):
        description = description[: description.rfind(" (")]

    return {
        "id": str(root.id),
        "description": description,
        "total_amount": float(total_amount),
        "paid_amount": float(paid_amount),
        "remaining_amount": float(total_amount - paid_amount),
        "installments_total": root.installments_total,
        "installments_paid": paid_count,
        "installments_remaining": root.installments_total - paid_count,
        "next_installment_date": next_date,
        "is_finished": paid_count >= root.installments_total,
        "category_id": str(root.category_id) if root.category_id else None,
        "card_id": str(root.card_id) if root.card_id else None,
        "account_id": str(root.account_id) if root.account_id else None,
        "payment_method": root.payment_method,
        "start_date": root.date.isoformat(),
        "installments": [
            {
                "number": t.installment_number,
                "date": t.date.isoformat(),
                "amount": float(t.amount),
                "paid": t.date <= today,
            }
            for t in sorted(all_installments, key=lambda x: x.installment_number)
        ],
    }


@router.get("")
async def list_installment_groups(
    include_finished: bool = Query(False),
    card_id: Optional[uuid.UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns all installment purchase groups for the tenant.
    Groups by root transaction (parent_id IS NULL, installments_total > 1).
    """
    base_filters = [
        Transaction.tenant_id == current_user.tenant_id,
        Transaction.installments_total > 1,
        Transaction.parent_id == None,
    ]
    if card_id:
        base_filters.append(Transaction.card_id == card_id)

    roots_result = await db.execute(
        select(Transaction).where(and_(*base_filters)).order_by(Transaction.date.desc())
    )
    roots = roots_result.scalars().all()

    groups = []
    today = date.today()

    for root in roots:
        # Fetch all installments in this group (root + children)
        children_result = await db.execute(
            select(Transaction).where(
                Transaction.tenant_id == current_user.tenant_id,
                (Transaction.id == root.id) | (Transaction.parent_id == root.id),
            ).order_by(Transaction.installment_number)
        )
        all_inst = children_result.scalars().all()

        group = installment_group_to_dict(root, all_inst)

        if not include_finished and group["is_finished"]:
            continue

        groups.append(group)

    return groups


@router.get("/by-month")
async def installments_by_month(
    year: int = Query(...),
    month: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns only the installment transactions that fall in a specific month.
    Used to show what's due on the credit card bill for that month.
    """
    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

    result = await db.execute(
        select(Transaction).where(
            Transaction.tenant_id == current_user.tenant_id,
            Transaction.installments_total > 1,
            Transaction.date >= start,
            Transaction.date < end,
        ).order_by(Transaction.date.desc())
    )
    transactions = result.scalars().all()

    from app.routers.transactions import transaction_to_dict
    return {
        "year": year,
        "month": month,
        "total": len(transactions),
        "total_amount": float(sum(t.amount for t in transactions)),
        "items": [transaction_to_dict(t) for t in transactions],
    }
