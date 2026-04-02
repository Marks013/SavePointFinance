"""
Web Router — Serves HTML pages using Jinja2 templates.
All pages are protected via require_user or require_superadmin.
"""
import uuid
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.auth import require_user, require_superadmin
from app.models.user import User
from app.models.tenant import Tenant
from app.models.account import Account
from app.models.card import Card
from app.models.institution import Institution
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


async def get_tenant_stats(tenant_id: uuid.UUID, db: AsyncSession, month: int = None, year: int = None) -> dict:
    now = datetime.now()
    month = month or now.month
    year = year or now.year
    
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


async def get_recent_transactions(tenant_id: uuid.UUID, db: AsyncSession, month: int = None, year: int = None, limit: int = 5):
    now = datetime.now()
    month = month or now.month
    year = year or now.year
    
    start_date = datetime(year, month, 1)
    if month == 12:
        end_date = datetime(year + 1, 1, 1)
    else:
        end_date = datetime(year, month + 1, 1)
    
    result = await db.execute(
        select(Transaction, Category)
        .join(Category, Transaction.category_id == Category.id)
        .where(Transaction.tenant_id == tenant_id, Transaction.date >= start_date, Transaction.date < end_date)
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
    expired = request.query_params.get("expired") == "1"
    return templates.TemplateResponse("login.html", {"request": request, "session_expired": expired})


@router.post("/login", response_class=HTMLResponse)
async def login_post(request: Request, db: AsyncSession = Depends(get_db)):
    from app.models.user import User
    from app.auth import verify_password, create_access_token, create_refresh_token
    from app.routers.auth import TokenResponse
    from sqlalchemy import select
    
    form = await request.form()
    email = form.get("email", "")
    password = form.get("password", "")
    
    if not email or not password:
        return templates.TemplateResponse("login.html", {
            "request": request,
            "error": "E-mail e senha são obrigatórios",
            "email": email
        })
    
    try:
        result = await db.execute(select(User).where(User.email == email.lower()))
        user = result.scalar_one_or_none()
        
        if not user:
            return templates.TemplateResponse("login.html", {
                "request": request,
                "error": "E-mail ou senha incorretos",
                "email": email
            })
        
        if not verify_password(password, user.password_hash):
            return templates.TemplateResponse("login.html", {
                "request": request,
                "error": "Senha incorreta",
                "email": email
            })
        
        if not user.is_active:
            return templates.TemplateResponse("login.html", {
                "request": request,
                "error": "Conta inativa. Contate o administrador.",
                "email": email
            })
        
        token_data = {"sub": str(user.id), "tenant_id": str(user.tenant_id)}
        tokens = TokenResponse(
            access_token=create_access_token(token_data),
            refresh_token=create_refresh_token(token_data),
        )
        
        from fastapi.responses import RedirectResponse
        response = RedirectResponse(url="/dashboard", status_code=302)
        response.set_cookie(
            "access_token", 
            tokens.access_token, 
            httponly=True, 
            samesite="lax", 
            path="/",
            max_age=86400 * 7
        )
        response.set_cookie(
            "refresh_token", 
            tokens.refresh_token, 
            httponly=True, 
            samesite="lax", 
            path="/",
            max_age=86400 * 30
        )
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response
        
    except Exception as e:
        import traceback
        return templates.TemplateResponse("login.html", {
            "request": request,
            "error": f"Erro ao fazer login: {str(e)}",
            "email": email
        })


@router.get("/register", response_class=HTMLResponse)
async def register_page(request: Request):
    return templates.TemplateResponse("register.html", {"request": request})


@router.post("/register", response_class=HTMLResponse)
async def register_post(request: Request, db: AsyncSession = Depends(get_db)):
    from app.models.user import User
    from app.models.tenant import Tenant
    from app.models.user import UserRole
    from app.auth import hash_password, create_access_token, create_refresh_token
    from app.routers.auth import TokenResponse
    from sqlalchemy import select
    import secrets
    
    form = await request.form()
    name = form.get("name", "")
    email = form.get("email", "")
    password = form.get("password", "")
    confirm_password = form.get("confirm_password", "")
    workspace_name = form.get("workspace_name", "")
    
    if not name or not email or not password or not workspace_name:
        return templates.TemplateResponse("register.html", {
            "request": request,
            "error": "Todos os campos são obrigatórios",
            "name": name,
            "email": email,
            "workspace_name": workspace_name
        })
    
    if password != confirm_password:
        return templates.TemplateResponse("register.html", {
            "request": request,
            "error": "As senhas não conferem",
            "name": name,
            "email": email,
            "workspace_name": workspace_name
        })
    
    if len(password) < 6:
        return templates.TemplateResponse("register.html", {
            "request": request,
            "error": "A senha deve ter pelo menos 6 caracteres",
            "name": name,
            "email": email,
            "workspace_name": workspace_name
        })
    
    try:
        existing = await db.execute(select(User).where(User.email == email.lower()))
        if existing.scalar_one_or_none():
            return templates.TemplateResponse("register.html", {
                "request": request,
                "error": "Este e-mail já está cadastrado",
                "name": name,
                "email": email,
                "workspace_name": workspace_name
            })
        
        slug = workspace_name.lower().replace(" ", "-")[:40] + "-" + secrets.token_hex(4)
        tenant = Tenant(name=workspace_name, slug=slug)
        db.add(tenant)
        await db.flush()
        
        user = User(
            tenant_id=tenant.id,
            email=email.lower(),
            name=name,
            password_hash=hash_password(password),
            role=UserRole.member,
            is_active=True,
        )
        db.add(user)
        await db.flush()
        
        from app.routers.categories import _seed_defaults
        await _seed_defaults(str(tenant.id), db)
        
        await db.commit()
        
        token_data = {"sub": str(user.id), "tenant_id": str(tenant.id)}
        tokens = TokenResponse(
            access_token=create_access_token(token_data),
            refresh_token=create_refresh_token(token_data),
        )
        
        from fastapi.responses import RedirectResponse
        response = RedirectResponse(url="/dashboard", status_code=302)
        response.set_cookie(
            "access_token", 
            tokens.access_token, 
            httponly=True, 
            samesite="lax", 
            path="/",
            max_age=86400 * 7
        )
        response.set_cookie(
            "refresh_token", 
            tokens.refresh_token, 
            httponly=True, 
            samesite="lax", 
            path="/",
            max_age=86400 * 30
        )
        return response
        
    except Exception as e:
        return templates.TemplateResponse("register.html", {
            "request": request,
            "error": f"Erro ao criar conta: {str(e)}",
            "name": name,
            "email": email,
            "workspace_name": workspace_name
        })


@router.get("/", response_class=HTMLResponse)
async def index_page(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@router.get("/setup-password", response_class=HTMLResponse)
async def setup_password_page(request: Request, token: str = None):
    return templates.TemplateResponse("setup_password.html", {"request": request, "token": token})


@router.post("/setup-password")
async def setup_password_post(request: Request, db: AsyncSession = Depends(get_db)):
    form = await request.form()
    password = form.get("password", "")
    confirm = form.get("confirm", "")
    token = form.get("token", "")
    
    if password != confirm:
        return templates.TemplateResponse("setup_password.html", {
            "request": request,
            "error": "As senhas não conferem",
            "token": token
        })
    
    if len(password) < 8:
        return templates.TemplateResponse("setup_password.html", {
            "request": request,
            "error": "A senha deve ter pelo menos 8 caracteres",
            "token": token
        })
    
    from sqlalchemy import select
    from app.models.user import User
    from app.auth import hash_password
    from fastapi import HTTPException
    
    if token:
        result = await db.execute(select(User).where(User.reset_token == token))
        user = result.scalar_one_or_none()
        if not user or not user.reset_token_expires or user.reset_token_expires.replace(tzinfo=None) < datetime.now():
            return templates.TemplateResponse("setup_password.html", {
                "request": request,
                "error": "Token expirado ou inválido",
                "token": token
            })
        
        user.password_hash = hash_password(password)
        user.reset_token = None
        user.reset_token_expires = None
        await db.commit()
        
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/login?success=password_set", status_code=302)
    
    return templates.TemplateResponse("setup_password.html", {
        "request": request,
        "error": "Token necessário",
        "token": token
    })


@router.get("/dashboard", response_class=HTMLResponse)
async def dashboard_page(request: Request, month: int = None, year: int = None, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    now = datetime.now()
    month = month or now.month
    year = year or now.year
    
    stats = await get_tenant_stats(current_user.tenant_id, db, month, year)
    recent = await get_recent_transactions(current_user.tenant_id, db, month, year)
    monthly = await get_monthly_data(current_user.tenant_id, db)
    
    # Get accounts summary
    accounts_result = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id, Account.is_active == True))
    accounts = accounts_result.scalars().all()
    accounts_summary = [{"id": str(a.id), "name": a.name, "balance": float(a.balance), "balance_fmt": fmt_money(a.balance), "color": a.color} for a in accounts]
    total_balance = sum(a.balance for a in accounts)
    
    # Get active goals progress
    goals_result = await db.execute(select(Goal).where(Goal.tenant_id == current_user.tenant_id, Goal.is_active == True))
    goals = goals_result.scalars().all()
    goals_summary = [{"id": str(g.id), "name": g.name, "target": float(g.target_amount), "current": float(g.current_amount), "target_fmt": fmt_money(g.target_amount), "current_fmt": fmt_money(g.current_amount), "progress": round((g.current_amount or 0) / (g.target_amount or 1) * 100, 1), "color": g.color or "#10B981"} for g in goals[:3]]
    
    # Get upcoming subscriptions (next 7 days)
    from datetime import timedelta
    upcoming_date = now.date() + timedelta(days=7)
    subs_result = await db.execute(select(Subscription).where(Subscription.tenant_id == current_user.tenant_id, Subscription.is_active == True, Subscription.next_billing_date <= upcoming_date))
    subs = subs_result.scalars().all()
    upcoming_subs = [{"id": str(s.id), "name": s.name, "amount": float(s.amount), "amount_fmt": fmt_money(s.amount), "next_date_fmt": s.next_billing_date.strftime("%d/%m")} for s in subs[:3]]
    
    return templates.TemplateResponse("dashboard.html", {
        "request": request,
        "user": current_user,
        "now": datetime.now(),
        "month": month,
        "year": year,
        "month_label": get_month_label(month, year),
        **stats,
        "recent_transactions": recent,
        "monthly_labels": [m["label"] for m in monthly],
        "monthly_income": [m["income"] for m in monthly],
        "monthly_expense": [m["expense"] for m in monthly],
        "accounts_summary": accounts_summary,
        "total_balance": float(total_balance),
        "total_balance_fmt": fmt_money(total_balance),
        "goals_summary": goals_summary,
        "upcoming_subs": upcoming_subs,
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
                "type": s.type.value if s.type else "expense",
                "billing_day": s.billing_day,
                "next_date": s.next_billing_date.strftime("%Y-%m-%d") if s.next_billing_date else None,
                "next_date_fmt": s.next_billing_date.strftime("%d/%m/%Y") if s.next_billing_date else "-",
                "active": s.is_active,
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
    from app.models.transaction import TransactionType
    
    now = datetime.now()
    month = month or now.month
    year = year or now.year
    
    start = datetime(year, month, 1)
    end = datetime(year + 1 if month == 12 else year, (month + 1) if month < 12 else 1, 1)
    
    result = await db.execute(
        select(Category.name, func.sum(Transaction.amount).label("total"))
        .join(Category, Transaction.category_id == Category.id)
        .where(Transaction.tenant_id == current_user.tenant_id, Transaction.type == TransactionType.expense, Transaction.date >= start, Transaction.date < end)
        .group_by(Category.id, Category.name)
        .order_by(func.sum(Transaction.amount).desc())
    )
    rows = result.all()
    
    total_expense = sum(r.total for r in rows)
    
    expense_breakdown = [
        {"name": r.name, "value": r.total, "value_fmt": fmt_money(r.total), "pct": round(r.total / total_expense * 100, 1) if total_expense else 0}
        for r in rows[:8]
    ]
    
    # Get last 6 months data
    monthly_labels = []
    monthly_income = []
    monthly_expense = []
    
    for i in range(5, -1, -1):
        m = now.month - i
        y = now.year
        while m <= 0:
            m += 12
            y -= 1
        m_label = get_month_label(m, y)
        monthly_labels.append(m_label)
        
        m_start = datetime(y, m, 1)
        m_end = datetime(y, m + 1, 1) if m < 12 else datetime(y + 1, 1, 1)
        
        inc_result = await db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0))
            .where(Transaction.tenant_id == current_user.tenant_id, Transaction.type == TransactionType.income, Transaction.date >= m_start, Transaction.date < m_end)
        )
        exp_result = await db.execute(
            select(func.coalesce(func.sum(Transaction.amount), 0))
            .where(Transaction.tenant_id == current_user.tenant_id, Transaction.type == TransactionType.expense, Transaction.date >= m_start, Transaction.date < m_end)
        )
        
        monthly_income.append(float(inc_result.scalar() or 0))
        monthly_expense.append(float(exp_result.scalar() or 0))
    
    return templates.TemplateResponse("reports.html", {
        "request": request,
        "user": current_user,
        "month": month,
        "year": year,
        "month_label": get_month_label(month, year),
        "expense_breakdown": expense_breakdown,
        "monthly_labels": monthly_labels,
        "monthly_income": monthly_income,
        "monthly_expense": monthly_expense,
    })


@router.get("/goals", response_class=HTMLResponse)
async def goals_page(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    try:
        result = await db.execute(select(Goal).where(Goal.tenant_id == current_user.tenant_id).order_by(Goal.deadline))
        goals = result.scalars().all()
        
        return templates.TemplateResponse("goals.html", {
            "request": request,
            "user": current_user,
            "goals": [
                {
                    "id": str(g.id),
                    "name": g.name,
                    "target": g.target_amount,
                    "target_fmt": fmt_money(g.target_amount),
                    "current": g.current_amount,
                    "current_fmt": fmt_money(g.current_amount),
                    "remaining": g.target_amount - g.current_amount if g.target_amount and g.current_amount else 0,
                    "remaining_fmt": fmt_money((g.target_amount or 0) - (g.current_amount or 0)),
                    "deadline": g.deadline.strftime("%Y-%m-%d") if g.deadline else None,
                    "deadline_fmt": g.deadline.strftime("%d/%m/%Y") if g.deadline else "-",
                    "color": g.color or "#10B981",
                    "progress": round((g.current_amount or 0) / (g.target_amount or 1) * 100, 1) if g.target_amount else 0,
                }
                for g in goals
            ],
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/categories", response_class=HTMLResponse)
async def categories_page(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    try:
        result = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id).order_by(Category.name))
        categories = result.scalars().all()
        
        income_cats = [c for c in categories if c.type == "income"]
        expense_cats = [c for c in categories if c.type == "expense"]
        
        return templates.TemplateResponse("categories.html", {
            "request": request,
            "user": current_user,
            "categories": [{"id": str(c.id), "name": c.name, "icon": c.icon, "type": c.type} for c in categories],
            "income_categories": [{"id": str(c.id), "name": c.name, "icon": c.icon, "type": c.type} for c in income_cats],
            "expense_categories": [{"id": str(c.id), "name": c.name, "icon": c.icon, "type": c.type} for c in expense_cats],
            "active_tab": "expense",
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    try:
        accounts = (await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id))).scalars().all()
        cards = (await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id))).scalars().all()
        institutions = (await db.execute(select(Institution).where(Institution.is_active == True).order_by(Institution.name))).scalars().all()
        institution_map = {str(i.id): i.name for i in institutions}
        
        net_worth = sum(a.balance for a in accounts)
        
        return templates.TemplateResponse("settings.html", {
            "request": request,
            "user": current_user,
            "net_worth": float(net_worth),
            "net_worth_fmt": fmt_money(net_worth),
            "accounts": [{"id": str(a.id), "name": a.name, "balance": a.balance, "balance_fmt": fmt_money(a.balance), "type": a.type, "institution_id": str(a.institution_id) if a.institution_id else None, "institution_name": institution_map.get(str(a.institution_id), "") if a.institution_id else ""} for a in accounts],
            "cards": [{"id": str(c.id), "name": c.name, "last4": c.last4, "brand": c.brand, "limit": float(c.limit_amount), "limit_fmt": fmt_money(c.limit_amount), "due_day": c.due_day, "color": c.color, "institution_id": str(c.institution_id) if c.institution_id else None, "institution_name": institution_map.get(str(c.institution_id), "") if c.institution_id else "", "used": 0, "used_fmt": "R$ 0,00", "available_fmt": fmt_money(c.limit_amount), "type": c.brand} for c in cards],
            "institutions": [{"id": str(i.id), "name": i.name} for i in institutions],
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/settings/accounts/new")
async def new_account_modal(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    inst_result = await db.execute(select(Institution).where(Institution.is_active == True).order_by(Institution.name))
    return templates.TemplateResponse("partials/_account_modal.html", {"request": request, "user": current_user, "account": None, "institutions": [{"id": str(i.id), "name": i.name} for i in inst_result.scalars().all()]})


@router.post("/settings/accounts/new")
async def create_account(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from fastapi.responses import JSONResponse
    from app.routers.accounts_cards import AccountCreate, AccountType, account_to_dict
    from app.services.plan_limits import check_limit
    from app.models.account import Account
    
    form = await request.form()
    name = form.get("name", "").strip()
    
    if not name:
        return JSONResponse(content={"error": "Nome da conta é obrigatório"}, status_code=400)
    
    allowed, error = await check_limit(current_user.tenant_id, "accounts", db)
    if not allowed:
        return JSONResponse(content={"error": error}, status_code=403)
    
    try:
        acc_type = form.get("type", "checking")
        try:
            account_type = AccountType(acc_type)
        except ValueError:
            account_type = AccountType.checking
        
        inst_id = form.get("institution_id")
        body = AccountCreate(
            name=name,
            type=account_type,
            balance=Decimal(str(form.get("balance", 0) or 0)),
            currency=form.get("currency", "BRL"),
            color=form.get("color", "#10B981"),
            institution_id=uuid.UUID(inst_id) if inst_id else None,
        )
        account = Account(**body.model_dump(), tenant_id=current_user.tenant_id)
        db.add(account)
        await db.commit()
        await db.refresh(account)
        return templates.TemplateResponse("partials/_account_modal.html", {"request": request, "user": current_user, "account": account_to_dict(account), "success": True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.post("/settings/accounts/{account_id}/delete")
async def delete_account(account_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from fastapi.responses import JSONResponse
    from app.routers.accounts_cards import delete_account as api_delete_account
    from sqlalchemy import select
    from app.models.account import Account
    
    result = await db.execute(select(Account).where(Account.id == account_id, Account.tenant_id == current_user.tenant_id))
    account = result.scalar_one_or_none()
    if not account:
        return JSONResponse(content={"error": "Conta não encontrada"}, status_code=404)
    
    try:
        await api_delete_account(account_id=account_id, db=db, current_user=current_user)
        return JSONResponse(content={"success": True, "message": "Conta excluída com sucesso"})
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.post("/settings/cards/{card_id}/delete")
async def delete_card(card_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from fastapi.responses import JSONResponse
    from app.routers.accounts_cards import delete_card as api_delete_card
    from app.models.card import Card
    
    result = await db.execute(select(Card).where(Card.id == card_id, Card.tenant_id == current_user.tenant_id))
    card = result.scalar_one_or_none()
    if not card:
        return JSONResponse(content={"error": "Cartão não encontrado"}, status_code=404)
    
    try:
        await api_delete_card(card_id=card_id, db=db, current_user=current_user)
        return JSONResponse(content={"success": True, "message": "Cartão excluído com sucesso"})
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.get("/settings/cards/new")
async def new_card_modal(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    inst_result = await db.execute(select(Institution).where(Institution.is_active == True).order_by(Institution.name))
    return templates.TemplateResponse("partials/_card_modal.html", {
        "request": request,
        "user": current_user,
        "card": None,
        "institutions": [{"id": str(i.id), "name": i.name} for i in inst_result.scalars().all()],
    })


@router.get("/settings/cards/{card_id}/edit")
async def edit_card_modal(card_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.models.institution import Institution
    from app.routers.accounts_cards import card_to_dict
    from app.models.card import Card
    card_result = await db.execute(select(Card).where(Card.id == uuid.UUID(card_id), Card.tenant_id == current_user.tenant_id))
    card = card_result.scalar_one_or_none()
    if not card:
        return JSONResponse(content={"error": "Cartão não encontrado"}, status_code=404)
    inst_result = await db.execute(select(Institution).where(Institution.is_active == True).order_by(Institution.name))
    return templates.TemplateResponse("partials/_card_modal.html", {
        "request": request,
        "user": current_user,
        "card": card_to_dict(card),
        "institutions": inst_result.scalars().all(),
    })


@router.post("/settings/cards/new")
async def create_card(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from fastapi.responses import JSONResponse
    from app.routers.accounts_cards import CardCreate, card_to_dict
    from app.models.card import Card
    from app.models.institution import Institution
    from app.services.plan_limits import check_limit
    
    form = await request.form()
    allowed, error = await check_limit(current_user.tenant_id, "cards", db)
    if not allowed:
        inst_result = await db.execute(select(Institution).where(Institution.is_active == True).order_by(Institution.name))
        return templates.TemplateResponse("partials/_card_modal.html", {
            "request": request, "user": current_user, "card": None,
            "institutions": inst_result.scalars().all(),
            "error": error,
        })
    
    try:
        inst_id = form.get("institution_id")
        body = CardCreate(
            name=form.get("name", ""),
            brand=form.get("brand", "Visa"),
            last4=form.get("last_four", "") or None,
            limit_amount=Decimal(str(form.get("limit", 0) or 0)),
            due_day=int(form.get("due_day", 10) or 10),
            close_day=int(form.get("close_day", 3) or 3),
            color=form.get("color", "#3B82F6"),
            institution_id=uuid.UUID(inst_id) if inst_id else None,
        )
        card = Card(**body.model_dump(), tenant_id=current_user.tenant_id)
        db.add(card)
        await db.commit()
        await db.refresh(card)
        return templates.TemplateResponse("partials/_card_modal.html", {"request": request, "user": current_user, "card": card_to_dict(card), "success": True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        inst_result = await db.execute(select(Institution).where(Institution.is_active == True).order_by(Institution.name))
        return templates.TemplateResponse("partials/_card_modal.html", {
            "request": request, "user": current_user, "card": None,
            "institutions": inst_result.scalars().all(),
            "error": str(e),
        })


@router.post("/transactions/new")
async def create_transaction(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from fastapi.responses import JSONResponse
    from app.routers.transactions import create_transaction as api_create_transaction, TransactionCreate, TransactionType, PaymentMethod
    from app.models.transaction import TransactionType as TT, PaymentMethod as PM
    from app.models.user import UserPreferences
    
    form = await request.form()
    try:
        tx_type = TT(form.get("type", "expense"))
    except ValueError:
        tx_type = TT.expense
    
    source = form.get("source", "cash")
    source_to_payment = {
        "pix": PM.pix,
        "bank": PM.transfer,
        "credit_card": PM.credit_card,
        "debit_card": PM.debit_card,
        "cash": PM.money,
        "other": PM.money,
    }
    pay_method = source_to_payment.get(source, PM.money)
        
    date_str = form.get("date", datetime.now().date().isoformat())
    tx_date = datetime.strptime(date_str, "%Y-%m-%d").date() if isinstance(date_str, str) else date_str
    
    # Check auto_tithe preference
    auto_tithe = False
    prefs_result = await db.execute(select(UserPreferences).where(UserPreferences.user_id == current_user.id))
    prefs = prefs_result.scalar_one_or_none()
    if prefs:
        auto_tithe = prefs.auto_tithe
    
    # Check if tithe checkbox is unchecked (form sends "on" when checked)
    tithe_enabled = form.get("tithe") in ("1", "on", "true")
    
    try:
        body = TransactionCreate(
            description=form.get("description", ""),
            amount=Decimal(str(form.get("amount", 0) or 0)),
            type=tx_type,
            payment_method=pay_method,
            date=tx_date,
            category_id=uuid.UUID(form.get("category_id")) if form.get("category_id") else None,
            account_id=uuid.UUID(form.get("account_id")) if form.get("account_id") else None,
            card_id=uuid.UUID(form.get("card_id")) if form.get("card_id") else None,
            installments=int(form.get("installments", 1) or 1),
            calculate_tithe=tithe_enabled or (auto_tithe and tx_type == TT.income),
        )
        tx = await api_create_transaction(body=body, db=db, current_user=current_user)
        return templates.TemplateResponse("partials/_tx_modal.html", {"request": request, "user": current_user, "tx": tx, "success": True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.post("/transactions/{tx_id}/edit")
async def edit_transaction(tx_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from fastapi.responses import JSONResponse
    from app.routers.transactions import update_transaction, TransactionUpdate
    from app.models.transaction import TransactionType as TT, PaymentMethod as PM
    
    form = await request.form()
    try:
        tx_type = TT(form.get("type", "expense"))
    except ValueError:
        tx_type = TT.expense
    
    source = form.get("source", "cash")
    source_to_payment = {
        "pix": PM.pix,
        "bank": PM.transfer,
        "credit_card": PM.credit_card,
        "debit_card": PM.debit_card,
        "cash": PM.money,
        "other": PM.money,
    }
    pay_method = source_to_payment.get(source, PM.money)
        
    date_str = form.get("date", datetime.now().date().isoformat())
    tx_date = datetime.strptime(date_str, "%Y-%m-%d").date() if isinstance(date_str, str) else date_str
        
    try:
        body = TransactionUpdate(
            description=form.get("description", ""),
            amount=Decimal(str(form.get("amount", 0) or 0)),
            type=tx_type,
            payment_method=pay_method,
            date=tx_date,
            category_id=uuid.UUID(form.get("category_id")) if form.get("category_id") else None,
            account_id=uuid.UUID(form.get("account_id")) if form.get("account_id") else None,
            card_id=uuid.UUID(form.get("card_id")) if form.get("card_id") else None,
            notes=form.get("notes") or None,
        )
        tx = await update_transaction(tx_id=uuid.UUID(tx_id), body=body, db=db, current_user=current_user)
        return templates.TemplateResponse("partials/_tx_modal.html", {"request": request, "user": current_user, "tx": tx, "success": True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.post("/categories/new")
async def create_category(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from fastapi.responses import JSONResponse
    from app.routers.categories import create_category as api_create_category, CategoryCreate, CategoryType
    
    form = await request.form()
    try:
        cat_type = CategoryType(form.get("type", "expense"))
    except ValueError:
        cat_type = CategoryType.expense
        
    try:
        body = CategoryCreate(
            name=form.get("name", ""),
            icon=form.get("icon", "folder"),
            color=form.get("color", "#6B7280"),
            type=cat_type,
        )
        cat_data = await api_create_category(body=body, db=db, current_user=current_user)
        return templates.TemplateResponse("partials/_cat_modal.html", {"request": request, "user": current_user, "cat": cat_data, "success": True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.post("/categories/{cat_id}/edit")
async def edit_category(cat_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from fastapi.responses import JSONResponse
    from app.routers.categories import update_category, CategoryUpdate, CategoryType
    
    form = await request.form()
    try:
        cat_type = CategoryType(form.get("type", "expense"))
    except ValueError:
        cat_type = CategoryType.expense
        
    try:
        body = CategoryUpdate(
            name=form.get("name", ""),
            icon=form.get("icon", "folder"),
            color=form.get("color", "#6B7280"),
            type=cat_type,
        )
        cat_data = await update_category(cat_id=uuid.UUID(cat_id), body=body, db=db, current_user=current_user)
        return templates.TemplateResponse("partials/_cat_modal.html", {"request": request, "user": current_user, "cat": cat_data, "success": True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.get("/goals/new")
async def new_goal_modal(request: Request, current_user: User = Depends(require_user)):
    return templates.TemplateResponse("partials/_goal_modal.html", {"request": request, "user": current_user, "goal": None})


@router.post("/goals/new")
async def create_goal(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from fastapi.responses import JSONResponse
    from app.routers.goals import create_goal as api_create_goal, GoalCreate
    
    form = await request.form()
    try:
        deadline_str = form.get("deadline")
        deadline = None
        if deadline_str:
            deadline = datetime.strptime(deadline_str, "%Y-%m-%d").date()
        
        body = GoalCreate(
            name=form.get("name", ""),
            target_amount=Decimal(str(form.get("target_amount", 0) or 0)),
            deadline=deadline,
        )
        goal = await api_create_goal(body=body, db=db, current_user=current_user)
        return templates.TemplateResponse("partials/_goal_modal.html", {"request": request, "user": current_user, "goal": {"id": str(goal.id), "name": goal.name, "target_amount": float(goal.target_amount), "current_amount": float(goal.current_amount), "deadline": goal.deadline}, "success": True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.get("/goals/{goal_id}/edit")
async def edit_goal_modal(goal_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.routers.goals import get_goal
    goal = await get_goal(goal_id=uuid.UUID(goal_id), db=db, current_user=current_user)
    return templates.TemplateResponse("partials/_goal_modal.html", {"request": request, "user": current_user, "goal": {"id": str(goal.id), "name": goal.name, "target_amount": float(goal.target_amount), "current_amount": float(goal.current_amount), "deadline": goal.deadline}})


@router.post("/goals/{goal_id}/edit")
async def edit_goal(goal_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from fastapi.responses import JSONResponse
    from app.routers.goals import update_goal, GoalUpdate
    
    form = await request.form()
    try:
        deadline_str = form.get("deadline")
        deadline = None
        if deadline_str:
            deadline = datetime.strptime(deadline_str, "%Y-%m-%d").date()
        
        body = GoalUpdate(
            name=form.get("name", ""),
            target_amount=Decimal(str(form.get("target_amount", 0) or 0)) if form.get("target_amount") else None,
            current_amount=Decimal(str(form.get("current_amount", 0) or 0)) if form.get("current_amount") else None,
            deadline=deadline,
        )
        goal = await update_goal(goal_id=uuid.UUID(goal_id), body=body, db=db, current_user=current_user)
        return templates.TemplateResponse("partials/_goal_modal.html", {"request": request, "user": current_user, "goal": {"id": str(goal.id), "name": goal.name, "target_amount": float(goal.target_amount), "current_amount": float(goal.current_amount), "deadline": goal.deadline}, "success": True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.post("/goals/{goal_id}/deposit")
async def deposit_goal(goal_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from fastapi.responses import JSONResponse, RedirectResponse
    from app.routers.goals import deposit_to_goal
    
    form = await request.form()
    try:
        amount = Decimal(str(form.get("amount", 0) or 0))
        goal = await deposit_to_goal(goal_id=uuid.UUID(goal_id), amount=amount, db=db, current_user=current_user)
        return RedirectResponse(url="/goals?success=deposit", status_code=302)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.get("/subscriptions/new")
async def new_subscription_modal(request: Request, current_user: User = Depends(require_user)):
    return templates.TemplateResponse("partials/_sub_modal.html", {"request": request, "user": current_user, "sub": None})


@router.post("/subscriptions/new")
async def create_subscription(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from fastapi.responses import JSONResponse
    from app.routers.subscriptions import create_subscription as api_create_subscription, SubscriptionCreate
    
    form = await request.form()
    billing_date_str = form.get("next_billing_date")
    billing_date = None
    if billing_date_str:
        billing_date = datetime.strptime(billing_date_str, "%Y-%m-%d").date()
    else:
        billing_date = datetime.now().date()
        
    try:
        body = SubscriptionCreate(
            name=form.get("name", ""),
            amount=Decimal(str(form.get("amount", 0) or 0)),
            billing_day=int(form.get("billing_day", 1) or 1),
            category_id=uuid.UUID(form.get("category_id")) if form.get("category_id") else None,
            next_billing_date=billing_date,
        )
        sub = await api_create_subscription(body=body, db=db, current_user=current_user)
        return templates.TemplateResponse("partials/_sub_modal.html", {"request": request, "user": current_user, "sub": sub, "success": True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.get("/subscriptions/{sub_id}/edit")
async def edit_subscription_modal(sub_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.routers.subscriptions import get_subscription
    sub = await get_subscription(sub_id=uuid.UUID(sub_id), db=db, current_user=current_user)
    return templates.TemplateResponse("partials/_sub_modal.html", {"request": request, "user": current_user, "sub": {"id": str(sub.id), "name": sub.name, "amount": float(sub.amount), "frequency": sub.frequency, "category_id": str(sub.category_id) if sub.category_id else None, "next_billing_date": sub.next_billing_date}})


@router.post("/subscriptions/{sub_id}/edit")
async def edit_subscription(sub_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from fastapi.responses import JSONResponse
    from app.routers.subscriptions import update_subscription, SubscriptionUpdate
    
    form = await request.form()
    billing_date_str = form.get("next_billing_date")
    billing_date = None
    if billing_date_str:
        billing_date = datetime.strptime(billing_date_str, "%Y-%m-%d").date()
        
    try:
        body = SubscriptionUpdate(
            name=form.get("name", ""),
            amount=Decimal(str(form.get("amount", 0) or 0)) if form.get("amount") else None,
            billing_day=int(form.get("billing_day", 1) or 1) if form.get("billing_day") else None,
            category_id=uuid.UUID(form.get("category_id")) if form.get("category_id") else None,
            is_active=form.get("is_active") in ("1", "on", "true"),
            next_billing_date=billing_date,
        )
        sub = await update_subscription(sub_id=uuid.UUID(sub_id), body=body, db=db, current_user=current_user)
        return templates.TemplateResponse("partials/_sub_modal.html", {"request": request, "user": current_user, "sub": sub, "success": True})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.get("/options", response_class=HTMLResponse)
async def options_page(request: Request, current_user: User = Depends(require_user)):
    return templates.TemplateResponse("options.html", {"request": request, "user": current_user})


@router.post("/options/profile")
async def options_profile(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    form = await request.form()
    name = form.get("name", "")
    email = form.get("email", "")
    
    current_user.name = name
    current_user.email = email.lower()
    await db.commit()
    
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/options?success=profile", status_code=302)


@router.post("/options/password")
async def options_password(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.auth import verify_password, hash_password
    from fastapi import HTTPException
    
    form = await request.form()
    current_password = form.get("current_password", "")
    new_password = form.get("new_password", "")
    confirm_password = form.get("confirm_password", "")
    
    if not verify_password(current_password, current_user.password_hash):
        return templates.TemplateResponse("options.html", {
            "request": request,
            "user": current_user,
            "error_password": "Senha atual incorreta"
        })
    
    if new_password != confirm_password:
        return templates.TemplateResponse("options.html", {
            "request": request,
            "user": current_user,
            "error_password": "As senhas não conferem"
        })
    
    if len(new_password) < 8:
        return templates.TemplateResponse("options.html", {
            "request": request,
            "user": current_user,
            "error_password": "A nova senha deve ter pelo menos 8 caracteres"
        })
    
    current_user.password_hash = hash_password(new_password)
    await db.commit()
    
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/options?success=password", status_code=302)


@router.post("/options/notifications")
async def options_notifications(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.models.user import UserPreferences
    
    form = await request.form()
    email_notif = form.get("email_notif") == "1"
    monthly_report = form.get("monthly_report") == "1"
    budget_alerts = form.get("budget_alerts") == "1"
    due_reminders = form.get("due_reminders") == "1"
    auto_tithe = form.get("auto_tithe") == "1"
    
    prefs = await db.execute(select(UserPreferences).where(UserPreferences.user_id == current_user.id))
    prefs_obj = prefs.scalar_one_or_none()
    
    if prefs_obj:
        prefs_obj.email_notifications = email_notif
        prefs_obj.monthly_reports = monthly_report
        prefs_obj.budget_alerts = budget_alerts
        prefs_obj.due_reminders = due_reminders
        prefs_obj.auto_tithe = auto_tithe
    else:
        prefs_obj = UserPreferences(
            user_id=current_user.id,
            email_notifications=email_notif,
            monthly_reports=monthly_report,
            budget_alerts=budget_alerts,
            due_reminders=due_reminders,
            auto_tithe=auto_tithe,
        )
        db.add(prefs_obj)
    
    await db.commit()
    
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/options?success=notifications", status_code=302)


@router.post("/options/preferences")
async def options_preferences(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.models.user import UserPreferences
    
    form = await request.form()
    currency = form.get("currency", "BRL")
    date_format = form.get("date_format", "DD/MM/YYYY")
    
    prefs = await db.execute(select(UserPreferences).where(UserPreferences.user_id == current_user.id))
    prefs_obj = prefs.scalar_one_or_none()
    
    if prefs_obj:
        prefs_obj.currency = currency
        prefs_obj.date_format = date_format
    else:
        prefs_obj = UserPreferences(
            user_id=current_user.id,
            currency=currency,
            date_format=date_format,
        )
        db.add(prefs_obj)
    
    await db.commit()
    
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/options?success=preferences", status_code=302)


@router.post("/options/workspace")
async def options_workspace(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    form = await request.form()
    workspace_name = form.get("workspace_name", "")
    
    tenant = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant_obj = tenant.scalar_one_or_none()
    
    if tenant_obj:
        tenant_obj.name = workspace_name
        await db.commit()
    
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/options?success=workspace", status_code=302)


@router.get("/export", response_class=HTMLResponse)
async def export_page(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.services.plan_limits import check_feature, get_tenant_limits, PLAN_LIMITS
    allowed, error = await check_feature(current_user.tenant_id, "export", db)
    limits = await get_tenant_limits(current_user.tenant_id, db)
    
    is_free = limits == PLAN_LIMITS["free"]
    
    from datetime import date
    today = date.today()
    first_day = date(today.year, 1, 1)
    
    return templates.TemplateResponse("export.html", {
        "request": request,
        "user": current_user,
        "can_export": allowed,
        "plan_error": error,
        "plan_name": "Free" if is_free else ("Pro" if limits.get("max_users", 1) <= 5 else "Enterprise"),
        "date_from": first_day.isoformat(),
        "date_to": today.isoformat(),
        "data_type": "all",
    })


@router.get("/import", response_class=HTMLResponse)
async def import_page(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.services.plan_limits import check_feature, get_tenant_limits, PLAN_LIMITS
    allowed, error = await check_feature(current_user.tenant_id, "export", db)
    limits = await get_tenant_limits(current_user.tenant_id, db)
    
    is_free = limits == PLAN_LIMITS["free"]
    
    from datetime import date
    today = date.today()
    first_day = date(today.year, 1, 1)
    
    return templates.TemplateResponse("import.html", {
        "request": request,
        "user": current_user,
        "can_import": allowed,
        "plan_error": error,
        "plan_name": "Free" if is_free else ("Pro" if limits.get("max_users", 1) <= 5 else "Enterprise"),
        "date_from": first_day.isoformat(),
        "date_to": today.isoformat(),
    })


@router.post("/import")
async def import_post(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from fastapi import UploadFile, File
    from app.services.plan_limits import check_feature
    from app.routers.data import import_transactions
    
    allowed, error = await check_feature(current_user.tenant_id, "export", db)
    if not allowed:
        return templates.TemplateResponse("import.html", {
            "request": request,
            "user": current_user,
            "can_import": False,
            "error": error
        })
    
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" not in content_type and "application/octet-stream" not in content_type:
        return templates.TemplateResponse("import.html", {
            "request": request,
            "user": current_user,
            "can_import": True,
            "error": "Formato inválido"
        })
    
    try:
        reader = await request.form()
        file = reader.get("file")
        
        if not file:
            return templates.TemplateResponse("import.html", {
                "request": request,
                "user": current_user,
                "can_import": True,
                "error": "Nenhum arquivo selecionado"
            })
        
        filename = file.filename if hasattr(file, 'filename') else "import.csv"
        file_content = await file.read() if hasattr(file, 'read') else b""
        
        class FakeFile:
            def __init__(self, filename, content):
                self.filename = filename
                self._content = content
                self._position = 0
            
            async def read(self, n=-1):
                if n == -1:
                    result = self._content[self._position:]
                    self._position = len(self._content)
                    return result
                result = self._content[self._position:self._position+n]
                self._position += n
                return result
            
            @property
            def content_type(self):
                return "text/csv"
        
        fake_file = FakeFile(filename, file_content)
        result = await import_transactions(file=fake_file, db=db, current_user=current_user)
        
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=f"/transactions?success=imported&count={result.imported}", status_code=302)
    except Exception as e:
        return templates.TemplateResponse("import.html", {
            "request": request,
            "user": current_user,
            "can_import": True,
            "error": f"Erro ao importar: {str(e)}"
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


@router.post("/admin/settings")
async def admin_settings_post(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_superadmin)):
    form = await request.form()
    
    from app.config import settings
    import json
    
    current_config = {}
    if settings.SYSTEM_CONFIG:
        import ast
        try:
            current_config = ast.literal_eval(settings.SYSTEM_CONFIG) if isinstance(settings.SYSTEM_CONFIG, str) else settings.SYSTEM_CONFIG
        except:
            current_config = {}
    
    current_config["maintenance_mode"] = form.get("maintenance_mode") == "on"
    current_config["open_registration"] = form.get("open_registration") == "on"
    current_config["ai_classifier"] = form.get("ai_classifier") == "on"
    current_config["whatsapp_bot"] = form.get("whatsapp_bot") == "on"
    
    settings.SYSTEM_CONFIG = json.dumps(current_config)
    
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/admin?success=settings", status_code=302)


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


# ---- NOTIFICATIONS ----

@router.get("/notifications")
async def get_notifications(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.models.notification import Notification
    from app.services.notification_service import generate_all_notifications
    
    # Generate notifications if none exist
    existing = await db.execute(
        select(Notification).where(Notification.user_id == current_user.id).limit(1)
    )
    if not existing.scalar_one_or_none():
        await generate_all_notifications(db, str(current_user.tenant_id), str(current_user.id))
    
    notifications = (await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(20)
    )).scalars().all()
    
    unread_count = sum(1 for n in notifications if not n.is_read)
    
    return templates.TemplateResponse("partials/_notifications.html", {
        "request": request,
        "user": current_user,
        "notifications": [
            {
                "id": str(n.id),
                "title": n.title,
                "message": n.message,
                "type": n.type,
                "is_read": n.is_read,
                "link": n.link,
                "created_at": n.created_at.strftime("%d/%m/%Y %H:%M"),
            }
            for n in notifications
        ],
        "unread_count": unread_count,
    })


@router.post("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.models.notification import Notification
    from fastapi.responses import JSONResponse
    
    result = await db.execute(
        select(Notification).where(Notification.id == notification_id, Notification.user_id == current_user.id)
    )
    notification = result.scalar_one_or_none()
    
    if notification:
        notification.is_read = True
        await db.commit()
    
    return JSONResponse(content={"success": True})


@router.post("/notifications/read-all")
async def mark_all_notifications_read(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.models.notification import Notification
    from fastapi.responses import JSONResponse
    
    await db.execute(
        Notification.__table__.update()
        .where(Notification.user_id == current_user.id, Notification.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    
    return JSONResponse(content={"success": True})
