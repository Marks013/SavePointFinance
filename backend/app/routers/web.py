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
    return templates.TemplateResponse("login.html", {"request": request})


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
    
    return templates.TemplateResponse("reports.html", {
        "request": request,
        "user": current_user,
        "month": month,
        "year": year,
        "month_label": get_month_label(month, year),
        "expense_breakdown": expense_breakdown,
        "monthly_labels": [],
        "monthly_income": [],
        "monthly_expense": [],
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
        "categories": [{"id": str(c.id), "name": c.name, "icon": c.icon, "type": c.type} for c in categories],
    })


@router.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    accounts = (await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id))).scalars().all()
    cards = (await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id))).scalars().all()
    
    return templates.TemplateResponse("settings.html", {
        "request": request,
        "user": current_user,
        "accounts": [{"id": str(a.id), "name": a.name, "balance": a.balance, "balance_fmt": fmt_money(a.balance), "type": a.type} for a in accounts],
        "cards": [{"id": str(c.id), "name": c.name, "limit": c.limit, "limit_fmt": fmt_money(c.limit), "type": c.type} for c in cards],
    })


@router.get("/settings/accounts/new")
async def new_account_modal(request: Request, current_user: User = Depends(require_user)):
    return templates.TemplateResponse("partials/_account_modal.html", {"request": request, "user": current_user, "account": None})


@router.post("/settings/accounts/new")
async def create_account(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.routers.accounts_cards import create_account as api_create_account, AccountCreate
    from app.services.plan_limits import check_limit
    
    form = await request.form()
    name = form.get("name", "").strip()
    
    if not name:
        from fastapi.responses import JSONResponse
        return JSONResponse(content={"error": "Nome da conta é obrigatório"}, status_code=400)
    
    allowed, error = await check_limit(current_user.tenant_id, "accounts", db)
    if not allowed:
        from fastapi.responses import JSONResponse
        return JSONResponse(content={"error": error}, status_code=403)
    
    try:
        body = AccountCreate(
            name=name,
            type=form.get("type", "checking"),
            balance=float(form.get("balance", 0) or 0),
            currency=form.get("currency", "BRL"),
            color=form.get("color", "#10B981"),
        )
        from app.routers.accounts_cards import account_to_dict
        account = await api_create_account(body=body, db=db, current_user=current_user)
        return templates.TemplateResponse("partials/_account_modal.html", {"request": request, "user": current_user, "account": account_to_dict(account), "success": True})
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.get("/settings/cards/new")
async def new_card_modal(request: Request, current_user: User = Depends(require_user)):
    return templates.TemplateResponse("partials/_card_modal.html", {"request": request, "user": current_user, "card": None})


@router.post("/settings/cards/new")
async def create_card(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.routers.accounts_cards import create_card as api_create_card, CardCreate
    from app.services.plan_limits import check_limit
    
    form = await request.form()
    allowed, error = await check_limit(current_user.tenant_id, "cards", db)
    if not allowed:
        from fastapi.responses import JSONResponse
        return JSONResponse(content={"error": error}, status_code=403)
    
    try:
        body = CardCreate(
            name=form.get("name", ""),
            card_type=form.get("type", "credit"),
            limit=float(form.get("limit", 0) or 0),
            color=form.get("color", "#3B82F6"),
        )
        from app.routers.accounts_cards import card_to_dict
        card = await api_create_card(body=body, db=db, current_user=current_user)
        return templates.TemplateResponse("partials/_card_modal.html", {"request": request, "user": current_user, "card": card_to_dict(card), "success": True})
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.post("/transactions/new")
async def create_transaction(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.routers.transactions import create_transaction as api_create_transaction, TransactionCreate
    
    form = await request.form()
    try:
        body = TransactionCreate(
            description=form.get("description", ""),
            amount=float(form.get("amount", 0) or 0),
            type=form.get("type", "expense"),
            date=datetime.fromisoformat(form.get("date", datetime.now().isoformat())),
            category_id=uuid.UUID(form.get("category_id")) if form.get("category_id") else None,
            account_id=uuid.UUID(form.get("account_id")) if form.get("account_id") else None,
            card_id=uuid.UUID(form.get("card_id")) if form.get("card_id") else None,
        )
        tx = await api_create_transaction(body=body, db=db, current_user=current_user)
        from app.routers.htmx import transaction_to_dict
        return templates.TemplateResponse("partials/_tx_modal.html", {"request": request, "user": current_user, "tx": transaction_to_dict(tx), "success": True})
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.post("/transactions/{tx_id}/edit")
async def edit_transaction(tx_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.routers.transactions import update_transaction, TransactionUpdate
    
    form = await request.form()
    try:
        body = TransactionUpdate(
            description=form.get("description", ""),
            amount=float(form.get("amount", 0) or 0),
            type=form.get("type", "expense"),
            date=datetime.fromisoformat(form.get("date", datetime.now().isoformat())),
            category_id=uuid.UUID(form.get("category_id")) if form.get("category_id") else None,
            account_id=uuid.UUID(form.get("account_id")) if form.get("account_id") else None,
            card_id=uuid.UUID(form.get("card_id")) if form.get("card_id") else None,
        )
        tx = await update_transaction(tx_id=uuid.UUID(tx_id), body=body, db=db, current_user=current_user)
        from app.routers.htmx import transaction_to_dict
        return templates.TemplateResponse("partials/_tx_modal.html", {"request": request, "user": current_user, "tx": transaction_to_dict(tx), "success": True})
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.post("/categories/new")
async def create_category(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.routers.categories import create_category as api_create_category, CategoryCreate
    
    form = await request.form()
    try:
        body = CategoryCreate(
            name=form.get("name", ""),
            icon=form.get("icon", "folder"),
            type=form.get("type", "expense"),
        )
        cat = await api_create_category(body=body, db=db, current_user=current_user)
        return templates.TemplateResponse("partials/_cat_modal.html", {"request": request, "user": current_user, "cat": {"id": str(cat.id), "name": cat.name, "icon": cat.icon, "type": cat.type}, "success": True})
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.post("/categories/{cat_id}/edit")
async def edit_category(cat_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.routers.categories import update_category, CategoryUpdate
    
    form = await request.form()
    try:
        body = CategoryUpdate(
            name=form.get("name", ""),
            icon=form.get("icon", "folder"),
            type=form.get("type", "expense"),
        )
        cat = await update_category(cat_id=uuid.UUID(cat_id), body=body, db=db, current_user=current_user)
        return templates.TemplateResponse("partials/_cat_modal.html", {"request": request, "user": current_user, "cat": {"id": str(cat.id), "name": cat.name, "icon": cat.icon, "type": cat.type}, "success": True})
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.get("/goals/new")
async def new_goal_modal(request: Request, current_user: User = Depends(require_user)):
    return templates.TemplateResponse("partials/_goal_modal.html", {"request": request, "user": current_user, "goal": None})


@router.post("/goals/new")
async def create_goal(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.routers.goals import create_goal as api_create_goal, GoalCreate
    
    form = await request.form()
    try:
        body = GoalCreate(
            name=form.get("name", ""),
            target_amount=float(form.get("target_amount", 0) or 0),
            deadline=datetime.fromisoformat(form.get("deadline")) if form.get("deadline") else None,
        )
        goal = await api_create_goal(body=body, db=db, current_user=current_user)
        return templates.TemplateResponse("partials/_goal_modal.html", {"request": request, "user": current_user, "goal": {"id": str(goal.id), "name": goal.name, "target_amount": float(goal.target_amount), "current_amount": float(goal.current_amount), "deadline": goal.deadline}, "success": True})
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.get("/goals/{goal_id}/edit")
async def edit_goal_modal(goal_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.routers.goals import get_goal
    goal = await get_goal(goal_id=uuid.UUID(goal_id), db=db, current_user=current_user)
    return templates.TemplateResponse("partials/_goal_modal.html", {"request": request, "user": current_user, "goal": {"id": str(goal.id), "name": goal.name, "target_amount": float(goal.target_amount), "current_amount": float(goal.current_amount), "deadline": goal.deadline}})


@router.post("/goals/{goal_id}/edit")
async def edit_goal(goal_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.routers.goals import update_goal, GoalUpdate
    
    form = await request.form()
    try:
        body = GoalUpdate(
            name=form.get("name", ""),
            target_amount=float(form.get("target_amount", 0) or 0),
            deadline=datetime.fromisoformat(form.get("deadline")) if form.get("deadline") else None,
        )
        goal = await update_goal(goal_id=uuid.UUID(goal_id), body=body, db=db, current_user=current_user)
        return templates.TemplateResponse("partials/_goal_modal.html", {"request": request, "user": current_user, "goal": {"id": str(goal.id), "name": goal.name, "target_amount": float(goal.target_amount), "current_amount": float(goal.current_amount), "deadline": goal.deadline}, "success": True})
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.post("/goals/{goal_id}/deposit")
async def deposit_goal(goal_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.routers.goals import deposit_to_goal
    
    form = await request.form()
    try:
        amount = float(form.get("amount", 0) or 0)
        goal = await deposit_to_goal(goal_id=uuid.UUID(goal_id), amount=amount, db=db, current_user=current_user)
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/goals?success=deposit", status_code=302)
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.get("/subscriptions/new")
async def new_subscription_modal(request: Request, current_user: User = Depends(require_user)):
    return templates.TemplateResponse("partials/_sub_modal.html", {"request": request, "user": current_user, "sub": None})


@router.post("/subscriptions/new")
async def create_subscription(request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.routers.subscriptions import create_subscription as api_create_subscription, SubscriptionCreate
    
    form = await request.form()
    try:
        body = SubscriptionCreate(
            name=form.get("name", ""),
            amount=float(form.get("amount", 0) or 0),
            frequency=form.get("frequency", "monthly"),
            category_id=uuid.UUID(form.get("category_id")) if form.get("category_id") else None,
            next_billing_date=datetime.fromisoformat(form.get("next_billing_date")) if form.get("next_billing_date") else None,
        )
        sub = await api_create_subscription(body=body, db=db, current_user=current_user)
        return templates.TemplateResponse("partials/_sub_modal.html", {"request": request, "user": current_user, "sub": {"id": str(sub.id), "name": sub.name, "amount": float(sub.amount), "frequency": sub.frequency}, "success": True})
    except Exception as e:
        from fastapi.responses import JSONResponse
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.get("/subscriptions/{sub_id}/edit")
async def edit_subscription_modal(sub_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.routers.subscriptions import get_subscription
    sub = await get_subscription(sub_id=uuid.UUID(sub_id), db=db, current_user=current_user)
    return templates.TemplateResponse("partials/_sub_modal.html", {"request": request, "user": current_user, "sub": {"id": str(sub.id), "name": sub.name, "amount": float(sub.amount), "frequency": sub.frequency, "category_id": str(sub.category_id) if sub.category_id else None, "next_billing_date": sub.next_billing_date}})


@router.post("/subscriptions/{sub_id}/edit")
async def edit_subscription(sub_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(require_user)):
    from app.routers.subscriptions import update_subscription, SubscriptionUpdate
    
    form = await request.form()
    try:
        body = SubscriptionUpdate(
            name=form.get("name", ""),
            amount=float(form.get("amount", 0) or 0),
            frequency=form.get("frequency", "monthly"),
            category_id=uuid.UUID(form.get("category_id")) if form.get("category_id") else None,
            next_billing_date=datetime.fromisoformat(form.get("next_billing_date")) if form.get("next_billing_date") else None,
        )
        sub = await update_subscription(sub_id=uuid.UUID(sub_id), body=body, db=db, current_user=current_user)
        return templates.TemplateResponse("partials/_sub_modal.html", {"request": request, "user": current_user, "sub": {"id": str(sub.id), "name": sub.name, "amount": float(sub.amount), "frequency": sub.frequency}, "success": True})
    except Exception as e:
        from fastapi.responses import JSONResponse
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
    
    prefs = await db.execute(select(UserPreferences).where(UserPreferences.user_id == current_user.id))
    prefs_obj = prefs.scalar_one_or_none()
    
    if prefs_obj:
        prefs_obj.email_notifications = email_notif
        prefs_obj.monthly_reports = monthly_report
        prefs_obj.budget_alerts = budget_alerts
        prefs_obj.due_reminders = due_reminders
    else:
        prefs_obj = UserPreferences(
            user_id=current_user.id,
            email_notifications=email_notif,
            monthly_reports=monthly_report,
            budget_alerts=budget_alerts,
            due_reminders=due_reminders,
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
