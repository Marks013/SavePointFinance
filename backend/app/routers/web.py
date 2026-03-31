"""
Web Router — Serves HTML pages using Jinja2 templates.
All pages are protected via require_user or require_superadmin.
"""
import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.auth import require_user, require_superadmin
from app.models.user import User
from app.models.tenant import Tenant
from app.models.transaction import Transaction
from app.models.category import Category
from app.models.account import Account
from app.models.card import Card
from app.models.subscription import Subscription
from app.models.goal import Goal
from app.template import templates

router = APIRouter(tags=["web"])


def fmt_money(amount):
    if amount is None:
        return "R$ 0,00"
    return f"R$ {amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def get_month_label(month, year):
    months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    return f"{months[month - 1]} {year}"


async def get_tenant_stats(tenant_id: uuid.UUID, db: AsyncSession) -> dict:
    now = datetime.now()
    month = now.month
    year = now.year
    
    # Income/expense for current month
    start_date = datetime(year, month, 1)
    if month == 12:
        end_date = datetime(year + 1, 1, 1)
    else:
        end_date = datetime(year, month + 1, 1)
    
    result = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.tenant_id == tenant_id,
            Transaction.type == "income",
            Transaction.date >= start_date,
            Transaction.date < end_date,
        )
    )
    income = result.scalar() or 0
    
    result = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.tenant_id == tenant_id,
            Transaction.type == "expense",
            Transaction.date >= start_date,
            Transaction.date < end_date,
        )
    )
    expense = result.scalar() or 0
    
    return {
        "income": income,
        "expense": expense,
        "balance": income - expense,
        "income_fmt": fmt_money(income),
        "expense_fmt": fmt_money(expense),
        "balance_fmt": fmt_money(income - expense),
        "month_label": get_month_label(month, year),
        "savings_rate": round((income - expense) / income * 100, 1) if income > 0 else 0,
    }


async def get_recent_transactions(tenant_id: uuid.UUID, db: AsyncSession, limit: int = 5):
    result = await db.execute(
        select(Transaction, Category)
        .join(Category, Transaction.category_id == Category.id)
        .where(Transaction.tenant_id == tenant_id)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(limit)
    )
    rows = result.all()
    return [
        {
            "id": str(tx.id),
            "description": tx.description,
            "amount": tx.amount,
            "amount_fmt": fmt_money(tx.amount),
            "type": tx.type,
            "date": tx.date,
            "category": {"name": cat.name, "icon": cat.icon} if cat else None,
        }
        for tx, cat in rows
    ]


async def get_monthly_data(tenant_id: uuid.UUID, db: AsyncSession, months: int = 6):
    now = datetime.now()
    data = []
    for i in range(months - 1, -1, -1):
        m = now.month - i
        y = now.year
        while m < 1:
            m += 12
            y -= 1
        
        start = datetime(y, m, 1)
        if m == 12:
            end = datetime(y + 1, 1, 1)
        else:
            end = datetime(y, m + 1, 1)
        
        inc = (await db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.tenant_id == tenant_id,
                Transaction.type == "income",
                Transaction.date >= start,
                Transaction.date < end,
            )
        )).scalar() or 0
        
        exp = (await db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.tenant_id == tenant_id,
                Transaction.type == "expense",
                Transaction.date >= start,
                Transaction.date < end,
            )
        )).scalar() or 0
        
        data.append({
            "label": get_month_label(m, y),
            "income": inc,
            "expense": exp,
            "income_fmt": fmt_money(inc),
            "expense_fmt": fmt_money(exp),
        })
    return data


@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})


@router.get("/register", response_class=HTMLResponse)
async def register_page(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})


@router.get("/", response_class=HTMLResponse)
async def index_page(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@router.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    stats = await get_tenant_stats(current_user.tenant_id, db)
    recent = await get_recent_transactions(current_user.tenant_id, db)
    monthly = await get_monthly_data(current_user.tenant_id, db)
    
    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "user": current_user,
        "now": datetime.now(),
        **stats,
        "recent_transactions": recent,
        "monthly_labels": [m["label"] for m in monthly],
        "monthly_income": [m["income"] for m in monthly],
        "monthly_expense": [m["expense"] for m in monthly],
    })


@router.get("/transactions", response_class=HTMLResponse)
async def transactions_page(request: Request, month: int = None, year: int = None, q: str = None, type: str = None, category_id: str = None, page: int = 1, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    now = datetime.now()
    month = month or now.month
    year = year or now.year
    
    result = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id).order_by(Category.name))
    categories = result.scalars().all()
    
    query = select(Transaction).where(Transaction.tenant_id == current_user.tenant_id)
    
    if q:
        query = query.where(Transaction.description.ilike(f"%{q}%"))
    if type:
        query = query.where(Transaction.type == type)
    if category_id:
        query = query.where(Transaction.category_id == uuid.UUID(category_id))
    
    start_date = datetime(year, month, 1)
    if month == 12:
        end_date = datetime(year + 1, 1, 1)
    else:
        end_date = datetime(year, month + 1, 1)
    
    query = query.where(Transaction.date >= start_date, Transaction.date < end_date)
    
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    pages = (total or 0) // 20 + 1
    
    query = query.order_by(Transaction.date.desc(), Transaction.id.desc()).offset((page - 1) * 20).limit(20)
    transactions = (await db.execute(query)).scalars().all()
    
    for_acc = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id))
    accounts = for_acc.scalars().all()
    
    card_res = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id))
    cards = card_res.scalars().all()
    
    return templates.TemplateResponse("transactions.html", {
        "request": request,
        "user": current_user,
        "transactions": [
            {
                "id": str(t.id),
                "description": t.description,
                "amount": t.amount,
                "amount_fmt": fmt_money(t.amount),
                "type": t.type,
                "date": t.date,
                "notes": t.notes,
                "source": t.source,
                "account_id": t.account_id,
                "card_id": t.card_id,
                "category_id": t.category_id,
                "account": {"name": a.name} if (a := next((x for x in accounts if x.id == t.account_id), None)) else None,
                "card": {"name": c.name} if (c := next((x for x in cards if x.id == t.card_id), None)) else None,
            }
            for t in transactions
        ],
        "categories": [{"id": str(c.id), "name": c.name, "icon": c.icon} for c in categories],
        "accounts": [{"id": str(a.id), "name": a.name} for a in accounts],
        "cards": [{"id": str(c.id), "name": c.name} for c in cards],
        "month": month,
        "year": year,
        "month_label": get_month_label(month, year),
        "total_pages": pages,
        "current_page": page,
    })


@router.get("/subscriptions", response_class=HTMLResponse)
async def subscriptions_page(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    result = await db.execute(select(Subscription).where(Subscription.tenant_id == current_user.tenant_id).order_by(Subscription.name))
    subscriptions = result.scalars().all()
    
    monthly_total = sum(s.amount for s in subscriptions if s.active)
    active_count = sum(1 for s in subscriptions if s.active)
    
    return templates.TemplateResponse("subscriptions.html", {
        "request": request,
        "user": current_user,
        "subscriptions": [
            {
                "id": str(s.id),
                "name": s.name,
                "amount": s.amount,
                "amount_fmt": fmt_money(s.amount),
                "type": s.subscription_type,
                "frequency": s.frequency,
                "next_date": s.next_date,
                "active": s.active,
            }
            for s in subscriptions
        ],
        "monthly_total_fmt": fmt_money(monthly_total),
        "yearly_total_fmt": fmt_money(monthly_total * 12),
        "active_count": active_count,
    })


@router.get("/installments", response_class=HTMLResponse)
async def installments_page(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    return templates.TemplateResponse("installments.html", {"request": request, "user": current_user})


@router.get("/reports", response_class=HTMLResponse)
async def reports_page(request: Request, month: int = None, year: int = None, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    now = datetime.now()
    month = month or now.month
    year = year or now.year
    
    start = datetime(year, month, 1)
    end = datetime(year + 1 if month == 12 else year, (month + 1) if month < 12 else 1, 1)
    
    result = await db.execute(
        select(Category.name, func.sum(Transaction.amount).label("total"))
        .join(Category, Transaction.category_id == Category.id)
        .where(Transaction.tenant_id == current_user.tenant_id, Transaction.type == "expense", Transaction.date >= start, Transaction.date < end)
        .group_by(Category.id, Category.name)
        .order_by(func.sum(Transaction.amount).desc())
    )
    rows = result.all()
    
    total_expense = sum(r.total for r in rows)
    
    expense_breakdown = [
        {"name": r.name, "value": r.total, "value_fmt": fmt_money(r.total), "pct": round(r.total / total_expense * 100, 1) if total_expense else 0}
        for r in rows[:8]
    ]
    
    return templates.TemplateResponse("reports.html", {
        "request": request,
        "user": current_user,
        "month": month,
        "year": year,
        "month_label": get_month_label(month, year),
        "expense_breakdown": expense_breakdown,
    })


@router.get("/goals", response_class=HTMLResponse)
async def goals_page(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    result = await db.execute(select(Goal).where(Goal.tenant_id == current_user.tenant_id).order_by(Goal.deadline))
    goals = result.scalars().all()
    
    return templates.TemplateResponse("goals.html", {
        "request": request,
        "user": current_user,
        "goals": [
            {
                "id": str(g.id),
                "name": g.name,
                "target": g.target,
                "current": g.current,
                "deadline": g.deadline,
                "color": g.color,
                "progress": round(g.current / g.target * 100, 1) if g.target else 0,
            }
            for g in goals
        ],
    })


@router.get("/categories", response_class=HTMLResponse)
async def categories_page(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    result = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id).order_by(Category.name))
    categories = result.scalars().all()
    
    return templates.TemplateResponse("categories.html", {
        "request": request,
        "user": current_user,
        "categories": [{"id": str(c.id), "name": c.name, "icon": c.icon, "type": c.tx_type} for c in categories],
    })


@router.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    accounts = (await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id))).scalars().all()
    cards = (await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id))).scalars().all()
    
    return templates.TemplateResponse("settings.html", {
        "request": request,
        "user": current_user,
        "accounts": [{"id": str(a.id), "name": a.name, "balance": a.balance, "balance_fmt": fmt_money(a.balance), "type": a.account_type} for a in accounts],
        "cards": [{"id": str(c.id), "name": c.name, "limit": c.limit, "limit_fmt": fmt_money(c.limit), "type": c.card_type} for c in cards],
    })


@router.get("/options", response_class=HTMLResponse)
async def options_page(request: Request, current_user: User = Depends(require_user)):
    return templates.TemplateResponse("options.html", {"request": request, "user": current_user})


@router.get("/export", response_class=HTMLResponse)
async def export_page(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.services.plan_limits import check_feature, get_tenant_limits, PLAN_LIMITS
    allowed, error = await check_feature(current_user.tenant_id, "export", db)
    limits = await get_tenant_limits(current_user.tenant_id, db)
    
    is_free = limits == PLAN_LIMITS["free"]
    
    return templates.TemplateResponse("export.html", {
        "request": request,
        "user": current_user,
        "can_export": allowed,
        "plan_name": "Free" if is_free else ("Pro" if limits.get("max_users", 1) <= 5 else "Enterprise"),
    })


@router.get("/import", response_class=HTMLResponse)
async def import_page(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.services.plan_limits import check_feature, get_tenant_limits, PLAN_LIMITS
    allowed, error = await check_feature(current_user.tenant_id, "export", db)
    limits = await get_tenant_limits(current_user.tenant_id, db)
    
    is_free = limits == PLAN_LIMITS["free"]
    
    return templates.TemplateResponse("import.html", {
        "request": request,
        "user": current_user,
        "can_import": allowed,
        "plan_name": "Free" if is_free else ("Pro" if limits.get("max_users", 1) <= 5 else "Enterprise"),
    })


# Admin pages

@router.get("/admin", response_class=HTMLResponse)
async def admin_page(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_superadmin)):
    tenants = (await db.execute(select(Tenant).order_by(Tenant.created_at.desc()).limit(50))).scalars().all()
    all_users = (await db.execute(select(User).order_by(User.created_at.desc()).limit(50))).scalars().all()
    
    total_tenants = (await db.execute(select(func.count()).select_from(Tenant))).scalar()
    active_users = (await db.execute(select(func.count()).select_from(User).where(User.is_active == True))).scalar()
    total_tx = (await db.execute(select(func.count()).select_from(Transaction))).scalar()
    
    return templates.TemplateResponse("admin.html", {
        "request": request,
        "user": current_user,
        "tenants": [
            {
                "id": str(t.id),
                "name": t.name,
                "plan": t.plan,
                "active": t.is_active,
                "created_at": t.created_at,
                "member_count": (await db.execute(select(func.count()).select_from(User).where(User.tenant_id == t.id))).scalar() or 1,
            }
            for t in tenants
        ],
        "all_users": [
            {
                "id": str(u.id),
                "name": u.name,
                "email": u.email,
                "role": u.role.value if hasattr(u.role, 'value') else u.role,
                "active": u.is_active,
                "last_login": u.last_login,
                "tenant_name": (await db.execute(select(Tenant).where(Tenant.id == u.tenant_id))).scalar_one_or_none().name if u.tenant_id else None,
            }
            for u in all_users
        ],
        "system_stats": {
            "total_tenants": total_tenants,
            "active_users": active_users,
            "transactions_30d": total_tx,
            "mrr_fmt": "R$ 0",
        },
    })


@router.get("/admin/tenants/{tenant_id}", response_class=HTMLResponse)
async def admin_tenant_detail(request: Request, tenant_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_superadmin)):
    tenant = (await db.execute(select(Tenant).where(Tenant.id == uuid.UUID(tenant_id)))).scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")
    
    users = (await db.execute(select(User).where(User.tenant_id == tenant.id))).scalars().all()
    accounts = (await db.execute(select(Account).where(Account.tenant_id == tenant.id))).scalars().all()
    categories = (await db.execute(select(Category).where(Category.tenant_id == tenant.id))).scalars().all()
    
    from app.routers.admin import PLAN_FEATURES
    
    return templates.TemplateResponse("admin.html", {
        "request": request,
        "user": current_user,
        "tenants": [{"id": str(tenant.id), "name": tenant.name, "plan": tenant.plan, "active": tenant.is_active, "created_at": tenant.created_at, "member_count": len(users)}],
        "tenant_detail": {
            "id": str(tenant.id),
            "name": tenant.name,
            "plan": tenant.plan,
            "max_users": tenant.max_users,
            "expires_at": tenant.expires_at,
        },
        "available_plans": [{"id": pid, **features} for pid, features in PLAN_FEATURES.items()],
        "user_count": len(users),
        "account_count": len(accounts),
        "category_count": len(categories),
        "current_plan": tenant.plan,
    })
