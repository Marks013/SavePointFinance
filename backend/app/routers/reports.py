import uuid
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, extract
from app.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.transaction import Transaction, TransactionType
from app.models.category import Category

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])


@router.get("/summary")
async def get_summary(
    year: int = Query(...),
    month: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Monthly summary: total income, expenses, balance."""
    start = date(year, month, 1)
    end = date(year, month + 1 if month < 12 else 1, 1) if month < 12 else date(year + 1, 1, 1)

    base = [Transaction.tenant_id == current_user.tenant_id, Transaction.date >= start, Transaction.date < end]

    income_q = await db.execute(select(func.sum(Transaction.amount)).where(*base, Transaction.type == TransactionType.income))
    expense_q = await db.execute(select(func.sum(Transaction.amount)).where(*base, Transaction.type == TransactionType.expense))

    income = float(income_q.scalar() or 0)
    expenses = float(expense_q.scalar() or 0)

    # Budget Gauge (Nível de Atenção)
    cats_q = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id, Category.monthly_limit > 0))
    limit_cats = cats_q.scalars().all()
    limit_planned = sum(float(c.monthly_limit) for c in limit_cats)
    
    limit_used = 0.0
    if limit_cats:
        cat_ids = [c.id for c in limit_cats]
        used_q = await db.execute(select(func.sum(Transaction.amount)).where(*base, Transaction.type == TransactionType.expense, Transaction.category_id.in_(cat_ids)))
        limit_used = float(used_q.scalar() or 0)

    return {
        "year": year,
        "month": month,
        "income": income,
        "expenses": expenses,
        "balance": income - expenses,
        "limit_planned": limit_planned,
        "limit_used": limit_used,
    }


@router.get("/monthly-evolution")
async def get_monthly_evolution(
    months: int = Query(12, ge=1, le=24),
    future_months: int = Query(0, ge=0, le=12),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Last N months income vs expenses + Future projections."""
    # Past Months Data
    result = await db.execute(
        select(
            extract("year", Transaction.date).label("year"),
            extract("month", Transaction.date).label("month"),
            Transaction.type,
            func.sum(Transaction.amount).label("total"),
        )
        .where(Transaction.tenant_id == current_user.tenant_id)
        .group_by("year", "month", Transaction.type)
        .order_by("year", "month")
    )
    rows = result.all()

    data: dict = {}
    for row in rows:
        key = f"{int(row.year)}-{int(row.month):02d}"
        if key not in data:
            data[key] = {"period": key, "income": 0.0, "expenses": 0.0, "projected": False}
        if row.type == TransactionType.income:
            data[key]["income"] = float(row.total)
        elif row.type == TransactionType.expense:
            data[key]["expenses"] = float(row.total)

    periods = sorted(data.values(), key=lambda x: x["period"])[-months:]

    # Future Projection Calculation
    if future_months > 0:
        from app.models.subscription import Subscription
        import calendar
        from dateutil.relativedelta import relativedelta
        
        today = date.today()
        # Get active subs
        subs_q = await db.execute(select(Subscription).where(Subscription.tenant_id == current_user.tenant_id, Subscription.is_active == True))
        active_subs = subs_q.scalars().all()
        subs_expense = sum(float(s.amount) for s in active_subs if s.type == TransactionType.expense)
        subs_income = sum(float(s.amount) for s in active_subs if s.type == TransactionType.income)

        # Averages for unpredictable
        avg_expense = sum(p["expenses"] for p in periods[-3:]) / min(3, max(1, len(periods))) if periods else 0
        avg_income = sum(p["income"] for p in periods[-3:]) / min(3, max(1, len(periods))) if periods else 0

        for i in range(1, future_months + 1):
            future_date = today + relativedelta(months=i)
            key = f"{future_date.year}-{future_date.month:02d}"
            periods.append({
                "period": key,
                "income": avg_income + subs_income,
                "expenses": avg_expense + subs_expense,
                "projected": True
            })

    return periods


@router.get("/by-category")
async def get_by_category(
    year: int = Query(...),
    month: int = Query(...),
    type: TransactionType = Query(TransactionType.expense),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Spending by category for pie/donut chart."""
    start = date(year, month, 1)
    end = date(year, month + 1 if month < 12 else 1, 1) if month < 12 else date(year + 1, 1, 1)

    result = await db.execute(
        select(
            Category.id,
            Category.name,
            Category.color,
            Category.icon,
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("count"),
        )
        .join(Transaction, Transaction.category_id == Category.id)
        .where(
            Transaction.tenant_id == current_user.tenant_id,
            Transaction.type == type,
            Transaction.date >= start,
            Transaction.date < end,
        )
        .group_by(Category.id, Category.name, Category.color, Category.icon)
        .order_by(func.sum(Transaction.amount).desc())
    )

    return [
        {"category_id": str(r.id), "name": r.name, "color": r.color, "icon": r.icon, "total": float(r.total), "count": r.count}
        for r in result.all()
    ]


@router.get("/top-transactions")
async def get_top_transactions(
    year: int = Query(...),
    month: int = Query(...),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Top N largest expenses in a given month."""
    start = date(year, month, 1)
    end = date(year, month + 1 if month < 12 else 1, 1) if month < 12 else date(year + 1, 1, 1)

    result = await db.execute(
        select(Transaction)
        .where(Transaction.tenant_id == current_user.tenant_id, Transaction.type == TransactionType.expense, Transaction.date >= start, Transaction.date < end)
        .order_by(Transaction.amount.desc())
        .limit(limit)
    )
    transactions = result.scalars().all()
    return [{"id": str(t.id), "description": t.description, "amount": float(t.amount), "date": t.date.isoformat(), "category_id": str(t.category_id) if t.category_id else None} for t in transactions]


@router.get("/cards-usage")
async def get_cards_usage(
    year: int = Query(...),
    month: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Credit Card Invoice Summary for Dashboard."""
    from app.models.card import Card
    from sqlalchemy.orm import selectinload

    start = date(year, month, 1)
    end = date(year, month + 1 if month < 12 else 1, 1) if month < 12 else date(year + 1, 1, 1)

    cards_res = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id))
    cards = cards_res.scalars().all()

    usage = []
    for card in cards:
        spent_q = await db.execute(
            select(func.sum(Transaction.amount)).where(
                Transaction.tenant_id == current_user.tenant_id,
                Transaction.card_id == card.id,
                Transaction.date >= start,
                Transaction.date < end
            )
        )
        spent = float(spent_q.scalar() or 0.0)
        usage.append({
            "id": str(card.id),
            "name": card.name,
            "brand": card.brand,
            "last4": card.last4,
            "limit": float(card.limit_amount),
            "spent": spent,
            "color": card.color
        })

    return usage
