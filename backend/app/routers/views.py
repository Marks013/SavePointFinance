"""
views.py — HTML page router for the Save Point Finanças monolith.

Mudanças v3.1:
- Dízimo: 1 transação por mês, atualizada a cada nova receita com dízimo marcado
- Receita fixa: cria Subscription (type=income) em vez de 12 transações
- PIX: obriga vinculação com conta bancária
- Cartão crédito/débito: obriga vinculação com cartão cadastrado
- Categoria "Outros": fallback automático para transações sem categoria
- Dashboard: limite disponível + fatura do mês por cartão + bloco de dízimo
- Relatórios: comparativo, por cartão/conta, print
"""

import uuid
import json
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, Form, Query, Request, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_

from app.database import get_db
from app.auth import (
    COOKIE_NAME, create_access_token, create_refresh_token,
    _set_auth_cookies, _delete_auth_cookies,
    get_current_user_cookie, get_optional_user_cookie,
    hash_password, verify_password, require_superadmin_cookie,
)
from app.models.user import User, UserRole
from app.models.tenant import Tenant
from app.models.category import Category, CategoryType
from app.models.transaction import Transaction, TransactionType, TransactionSource, PaymentMethod
from app.models.account import Account, AccountType
from app.models.card import Card
from app.models.subscription import Subscription, SubscriptionType
from app.models.goal import Goal

router = APIRouter(tags=["views"])


# ── Template helper ───────────────────────────────────────────────────────────

def tmpl(request: Request):
    return request.app.state.templates


def _is_htmx(request: Request) -> bool:
    return request.headers.get("HX-Request") == "true"


def _toast_headers(message: str, kind: str = "success") -> dict:
    return {"HX-Trigger": json.dumps({"sp:toast": {"message": message, "kind": kind}})}


def _htmx_redirect(request: Request, url: str, message: str = "", kind: str = "success"):
    from fastapi import Response as _Resp
    if _is_htmx(request):
        headers = {"HX-Redirect": url}
        if message:
            headers["HX-Trigger"] = json.dumps({"sp:toast": {"message": message, "kind": kind}})
        return _Resp(status_code=200, headers=headers)
    return RedirectResponse(url, status_code=303)


def _fmt_brl(value) -> str:
    try:
        v = float(value or 0)
        return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    except Exception:
        return "R$ 0,00"


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_or_create_outros(tenant_id: uuid.UUID, db: AsyncSession) -> uuid.UUID | None:
    """Retorna/cria a categoria 'Outros' para o tenant."""
    result = await db.execute(
        select(Category).where(
            Category.tenant_id == tenant_id,
            Category.name.ilike("outros%"),
        ).limit(1)
    )
    cat = result.scalar_one_or_none()
    if cat:
        return cat.id
    cat = Category(
        tenant_id=tenant_id,
        name="Outros",
        type=CategoryType.expense,
        icon="📦",
        color="#6B7280",
        keywords=[],
        is_default=True,
    )
    db.add(cat)
    await db.flush()
    return cat.id


async def _update_or_create_tithe(
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    income_amount: Decimal,
    income_date: date,
    db: AsyncSession,
) -> None:
    """
    Cria/atualiza o único lançamento de Dízimo do mês.
    O dízimo = 10% da receita que incidiu. É sempre 1 transação por mês.
    """
    tithe_amount = income_amount * Decimal("0.10")
    month_start = date(income_date.year, income_date.month, 1)
    if income_date.month == 12:
        month_end = date(income_date.year + 1, 1, 1)
    else:
        month_end = date(income_date.year, income_date.month + 1, 1)

    existing = await db.execute(
        select(Transaction).where(
            Transaction.tenant_id == tenant_id,
            Transaction.description == "Dízimo",
            Transaction.type == TransactionType.expense,
            Transaction.date >= month_start,
            Transaction.date < month_end,
        )
    )
    tithe_tx = existing.scalar_one_or_none()
    if tithe_tx:
        tithe_tx.amount += tithe_amount
    else:
        db.add(Transaction(
            tenant_id=tenant_id,
            user_id=user_id,
            date=income_date,
            amount=tithe_amount,
            description="Dízimo",
            type=TransactionType.expense,
            payment_method=PaymentMethod.pix,
            source=TransactionSource.manual,
        ))


# ── Root redirect ─────────────────────────────────────────────────────────────

@router.get("/", response_class=HTMLResponse)
async def root(user: User | None = Depends(get_optional_user_cookie)):
    if user:
        return RedirectResponse("/dashboard", status_code=302)
    return RedirectResponse("/login", status_code=302)


# ══════════════════════════════════════════════════════════════════════════════
# AUTH PAGES
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/login", response_class=HTMLResponse)
async def login_page(request: Request, user: User | None = Depends(get_optional_user_cookie)):
    if user:
        return RedirectResponse("/dashboard", status_code=302)
    return tmpl(request).TemplateResponse("login.html", {"request": request, "error": None})


@router.post("/login", response_class=HTMLResponse)
async def login_submit(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.email == email.lower()))
    user = result.scalar_one_or_none()

    if not user or not verify_password(password, user.password_hash):
        if _is_htmx(request):
            return tmpl(request).TemplateResponse(
                "partials/_login_form.html",
                {"request": request, "error": "E-mail ou senha incorretos."},
                status_code=401,
            )
        return tmpl(request).TemplateResponse(
            "login.html",
            {"request": request, "error": "E-mail ou senha incorretos."},
            status_code=401,
        )

    token_data = {"sub": str(user.id), "tenant_id": str(user.tenant_id)}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    response = RedirectResponse("/dashboard", status_code=303)
    _set_auth_cookies(response, access_token, refresh_token)
    return response


@router.get("/register", response_class=HTMLResponse)
async def register_page(request: Request, user: User | None = Depends(get_optional_user_cookie)):
    if user:
        return RedirectResponse("/dashboard", status_code=302)
    return tmpl(request).TemplateResponse("register.html", {"request": request, "error": None})


@router.post("/register", response_class=HTMLResponse)
async def register_submit(
    request: Request,
    workspace_name: str = Form(...),
    name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    import secrets as _secrets
    existing = await db.execute(select(User).where(User.email == email.lower()))
    if existing.scalar_one_or_none():
        return tmpl(request).TemplateResponse(
            "register.html",
            {"request": request, "error": "E-mail já cadastrado. Tente fazer login."},
            status_code=400,
        )

    slug = workspace_name.lower().replace(" ", "-")[:40] + "-" + _secrets.token_hex(4)
    tenant = Tenant(name=workspace_name, slug=slug)
    db.add(tenant)
    await db.flush()

    user = User(
        tenant_id=tenant.id, email=email.lower(), name=name,
        password_hash=hash_password(password), role=UserRole.admin,
    )
    db.add(user)
    await db.flush()

    default_cats = [
        {"name": "Alimentação",    "type": CategoryType.expense, "icon": "🍔", "color": "#EF4444", "keywords": ["ifood", "restaurante"]},
        {"name": "Transporte",     "type": CategoryType.expense, "icon": "🚗", "color": "#3B82F6", "keywords": ["uber", "gasolina"]},
        {"name": "Moradia",        "type": CategoryType.expense, "icon": "🏠", "color": "#10B981", "keywords": ["aluguel", "condomínio"]},
        {"name": "Saúde",          "type": CategoryType.expense, "icon": "💊", "color": "#8B5CF6", "keywords": ["farmácia", "médico"]},
        {"name": "Lazer",          "type": CategoryType.expense, "icon": "🎬", "color": "#F59E0B", "keywords": ["netflix", "cinema"]},
        {"name": "Educação",       "type": CategoryType.expense, "icon": "📚", "color": "#06B6D4", "keywords": ["escola", "curso"]},
        {"name": "Vestuário",      "type": CategoryType.expense, "icon": "👕", "color": "#EC4899", "keywords": ["roupa", "calçado"]},
        {"name": "Assinaturas",    "type": CategoryType.expense, "icon": "🔄", "color": "#6366F1", "keywords": ["spotify", "streaming"]},
        {"name": "Outros",         "type": CategoryType.expense, "icon": "📦", "color": "#6B7280", "keywords": [], "is_default": True},
        {"name": "Salário",        "type": CategoryType.income,  "icon": "💰", "color": "#22C55E", "keywords": ["salário"]},
        {"name": "Freelance",      "type": CategoryType.income,  "icon": "💻", "color": "#06B6D4", "keywords": ["freelance"]},
        {"name": "Investimentos",  "type": CategoryType.income,  "icon": "📈", "color": "#F59E0B", "keywords": ["dividendo", "rendimento"]},
    ]
    for c in default_cats:
        db.add(Category(
            tenant_id=tenant.id, name=c["name"], type=c["type"],
            icon=c.get("icon", "tag"), color=c.get("color", "#6B7280"),
            keywords=c.get("keywords", []), is_default=c.get("is_default", True),
        ))
    await db.commit()

    token_data = {"sub": str(user.id), "tenant_id": str(tenant.id)}
    access_token  = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    response = RedirectResponse("/dashboard", status_code=303)
    _set_auth_cookies(response, access_token, refresh_token)
    return response


@router.get("/logout")
async def logout():
    response = RedirectResponse("/login", status_code=302)
    _delete_auth_cookies(response)
    return response


# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/dashboard", response_class=HTMLResponse)
async def dashboard(
    request: Request,
    year: int = Query(default=None),
    month: int = Query(default=None),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now()
    if not year:
        year = now.year
    if not month:
        month = now.month

    prev_month = month - 1 if month > 1 else 12
    prev_year = year if month > 1 else year - 1
    next_month = month + 1 if month < 12 else 1
    next_year = year if month < 12 else year + 1

    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    base_f = [Transaction.tenant_id == current_user.tenant_id, Transaction.date >= start, Transaction.date < end]

    income_q  = await db.execute(select(func.sum(Transaction.amount)).where(*base_f, Transaction.type == TransactionType.income))
    expense_q = await db.execute(select(func.sum(Transaction.amount)).where(*base_f, Transaction.type == TransactionType.expense))
    income    = float(income_q.scalar() or 0)
    expenses  = float(expense_q.scalar() or 0)

    # ── Dízimo ──
    tithe_suggested = 0.0
    tithe_paid = 0.0
    tithe_pending = 0.0
    if current_user.tithe_enabled:
        tithe_q = await db.execute(
            select(func.sum(Transaction.amount)).where(
                *base_f,
                Transaction.description == "Dízimo",
                Transaction.type == TransactionType.expense,
            )
        )
        tithe_paid = float(tithe_q.scalar() or 0)
        # Calcula 10% das receitas (excluindo o próprio dízimo)
        income_no_tithe_q = await db.execute(
            select(func.sum(Transaction.amount)).where(
                *base_f,
                Transaction.type == TransactionType.income,
            )
        )
        income_for_tithe = float(income_no_tithe_q.scalar() or 0)
        tithe_suggested = income_for_tithe * 0.10
        tithe_pending = max(0, tithe_suggested - tithe_paid)

    # ── Budget gauge ──
    cats_q = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id, Category.monthly_limit > 0))
    limit_cats = cats_q.scalars().all()
    limit_planned = sum(float(c.monthly_limit) for c in limit_cats)
    limit_used = 0.0
    if limit_cats:
        cat_ids = [c.id for c in limit_cats]
        used_q = await db.execute(select(func.sum(Transaction.amount)).where(*base_f, Transaction.type == TransactionType.expense, Transaction.category_id.in_(cat_ids)))
        limit_used = float(used_q.scalar() or 0)

    gauge_pct = int(min(100, (limit_used / limit_planned * 100))) if limit_planned > 0 else 0

    # ── Assinaturas ──
    subs_q = await db.execute(select(Subscription).where(Subscription.tenant_id == current_user.tenant_id, Subscription.is_active == True))
    active_subs = subs_q.scalars().all()

    # ── Transações recentes ──
    cats_all_q = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id))
    cats_map = {str(c.id): c for c in cats_all_q.scalars().all()}

    recent_q = await db.execute(
        select(Transaction)
        .where(Transaction.tenant_id == current_user.tenant_id, Transaction.date >= start, Transaction.date < end)
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .limit(8)
    )
    recent_txs = recent_q.scalars().all()

    # ── Evolução mensal ──
    evo_q = await db.execute(
        select(
            func.extract("year", Transaction.date).label("y"),
            func.extract("month", Transaction.date).label("m"),
            Transaction.type,
            func.sum(Transaction.amount).label("total"),
        )
        .where(Transaction.tenant_id == current_user.tenant_id)
        .group_by("y", "m", Transaction.type)
        .order_by("y", "m")
    )
    evo_raw: dict = {}
    for row in evo_q.all():
        key = f"{int(row.y)}-{int(row.m):02d}"
        if key not in evo_raw:
            evo_raw[key] = {"income": 0.0, "expenses": 0.0}
        if row.type == TransactionType.income:
            evo_raw[key]["income"] = float(row.total)
        else:
            evo_raw[key]["expenses"] = float(row.total)

    # ── Donut por categoria ──
    cat_donut_q = await db.execute(
        select(
            func.coalesce(Category.name, "Outros").label("name"),
            func.coalesce(Category.color, "#6B7280").label("color"),
            func.sum(Transaction.amount).label("total"),
        )
        .outerjoin(Category, Transaction.category_id == Category.id)
        .where(Transaction.tenant_id == current_user.tenant_id, Transaction.type == TransactionType.expense, Transaction.date >= start, Transaction.date < end)
        .group_by(func.coalesce(Category.name, "Outros"), func.coalesce(Category.color, "#6B7280"))
        .order_by(func.sum(Transaction.amount).desc())
        .limit(8)
    )
    cat_donut = [{"name": r.name, "color": r.color, "total": float(r.total)} for r in cat_donut_q.all()]

    # ── Cartões: limite disponível + fatura do mês ──
    cards_q = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id))
    cards = cards_q.scalars().all()
    cards_usage = []
    for card in cards:
        # Fatura do mês atual (TODAS as transações do mês neste cartão)
        invoice_q = await db.execute(
            select(func.sum(Transaction.amount)).where(
                Transaction.tenant_id == current_user.tenant_id,
                Transaction.card_id == card.id,
                Transaction.date >= start,
                Transaction.date < end,
            )
        )
        invoice_month = float(invoice_q.scalar() or 0)

        # Total comprometido (parcelas futuras ainda em aberto)
        future_start = date(now.year, now.month, 1)
        compromised_q = await db.execute(
            select(func.sum(Transaction.amount)).where(
                Transaction.tenant_id == current_user.tenant_id,
                Transaction.card_id == card.id,
                Transaction.date >= future_start,
            )
        )
        total_compromised = float(compromised_q.scalar() or 0)

        # Limite disponível = limite - total comprometido futuro
        available_limit = max(0.0, float(card.limit_amount) - total_compromised)
        limit_used_pct = int(min(100, total_compromised / float(card.limit_amount) * 100)) if float(card.limit_amount) > 0 else 0

        cards_usage.append({
            "name": card.name,
            "last4": card.last4,
            "color": card.color,
            "limit": float(card.limit_amount),
            "invoice_month": invoice_month,
            "total_compromised": total_compromised,
            "available_limit": available_limit,
            "limit_used_pct": limit_used_pct,
            "due_day": card.due_day,
        })

    context = {
        "request": request,
        "user": current_user,
        "year": year, "month": month,
        "prev_year": prev_year, "prev_month": prev_month,
        "next_year": next_year, "next_month": next_month,
        "income": income, "expenses": expenses, "balance": income - expenses,
        "tithe_suggested": tithe_suggested,
        "tithe_paid": tithe_paid,
        "tithe_pending": tithe_pending,
        "gauge_pct": gauge_pct,
        "limit_planned": limit_planned, "limit_used": limit_used,
        "active_subs_count": len(active_subs),
        "active_subs_monthly": sum(float(s.amount) for s in active_subs if s.type == SubscriptionType.expense),
        "recent_txs": recent_txs,
        "cats_map": cats_map,
        "cat_donut_json": json.dumps(cat_donut),
        "evo_data_json": json.dumps(list(evo_raw.values())[-12:]),
        "evo_labels_json": json.dumps(list(evo_raw.keys())[-12:]),
        "cards_usage": cards_usage,
        "fmt": _fmt_brl,
    }

    if _is_htmx(request):
        context["month_names"] = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
        response = tmpl(request).TemplateResponse("partials/_dashboard_full.html", context)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response
    return tmpl(request).TemplateResponse("dashboard.html", context)


# ══════════════════════════════════════════════════════════════════════════════
# TRANSACTIONS
# ══════════════════════════════════════════════════════════════════════════════

async def _load_tx_context(current_user, db, year, month, skip, limit, type_f, cat_f, search):
    now = datetime.now()
    if not year:
        year = now.year
    if not month:
        month = now.month

    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

    filters = [
        Transaction.tenant_id == current_user.tenant_id,
        Transaction.date >= start,
        Transaction.date < end,
    ]
    filters.append(or_(Transaction.installments_total == 1, Transaction.installment_number == 1))
    if type_f:
        filters.append(Transaction.type == type_f)
    if cat_f:
        filters.append(Transaction.category_id == uuid.UUID(cat_f))
    if search:
        filters.append(Transaction.description.ilike(f"%{search}%"))

    total_q = await db.execute(select(func.count()).select_from(Transaction).where(and_(*filters)))
    total = total_q.scalar()

    txs_q = await db.execute(
        select(Transaction).where(and_(*filters))
        .order_by(Transaction.date.desc(), Transaction.created_at.desc())
        .offset(skip).limit(limit)
    )
    txs = txs_q.scalars().all()

    cats_q = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id))
    cats = cats_q.scalars().all()
    cats_map = {str(c.id): c for c in cats}

    accounts_q = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id))
    cards_q = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id))

    page_income  = sum(t.amount for t in txs if t.type == TransactionType.income)
    page_expense = sum(t.amount for t in txs if t.type == TransactionType.expense)

    return {
        "year": year, "month": month, "skip": skip, "limit": limit, "total": total,
        "txs": txs, "cats": cats, "cats_map": cats_map,
        "accounts": accounts_q.scalars().all(),
        "cards": cards_q.scalars().all(),
        "type_f": type_f or "", "cat_f": cat_f or "", "search": search or "",
        "page_income": float(page_income), "page_expense": float(page_expense),
        "fmt": _fmt_brl,
    }


@router.get("/transactions", response_class=HTMLResponse)
async def transactions_page(
    request: Request,
    year: int = Query(default=None),
    month: int = Query(default=None),
    skip: int = Query(default=0),
    limit: int = Query(default=50),
    type: Optional[str] = Query(default=None),
    category_id: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    ctx = await _load_tx_context(current_user, db, year, month, skip, limit, type, category_id, search)
    ctx["request"] = request
    ctx["user"] = current_user

    if _is_htmx(request):
        if year or month:
            return tmpl(request).TemplateResponse("partials/_tx_body.html", ctx)
        return tmpl(request).TemplateResponse("partials/_tx_table.html", ctx)
    return tmpl(request).TemplateResponse("transactions.html", ctx)


@router.get("/transactions/new", response_class=HTMLResponse)
async def tx_new_modal(
    request: Request,
    redirect_to: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    cats_q = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id).order_by(Category.type, Category.name))
    accts_q = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id, Account.is_active == True))
    cards_q = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id, Card.is_active == True))
    accts = accts_q.scalars().all()
    cards = cards_q.scalars().all()
    return tmpl(request).TemplateResponse("partials/_tx_modal.html", {
        "request": request,
        "tx": None,
        "cats": cats_q.scalars().all(),
        "accounts": accts,
        "cards": cards,
        "has_accounts": len(accts) > 0,
        "has_cards": len(cards) > 0,
        "today": date.today().isoformat(),
        "redirect_to": redirect_to,
        "tithe_enabled": current_user.tithe_enabled,
    })


@router.get("/transactions/{tx_id}/edit", response_class=HTMLResponse)
async def tx_edit_modal(
    request: Request,
    tx_id: uuid.UUID,
    redirect_to: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    tx_q = await db.execute(select(Transaction).where(Transaction.id == tx_id, Transaction.tenant_id == current_user.tenant_id))
    tx = tx_q.scalar_one_or_none()
    cats_q = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id).order_by(Category.type, Category.name))
    accts_q = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id))
    cards_q = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id))
    accts = accts_q.scalars().all()
    cards = cards_q.scalars().all()
    return tmpl(request).TemplateResponse("partials/_tx_modal.html", {
        "request": request, "tx": tx,
        "cats": cats_q.scalars().all(),
        "accounts": accts,
        "cards": cards,
        "has_accounts": len(accts) > 0,
        "has_cards": len(cards) > 0,
        "today": date.today().isoformat(),
        "redirect_to": redirect_to,
        "tithe_enabled": current_user.tithe_enabled,
    })


@router.post("/transactions", response_class=HTMLResponse)
async def tx_create(
    request: Request,
    tx_date: str = Form(..., alias="date"),
    amount: float = Form(...),
    description: str = Form(...),
    tx_type: str = Form(..., alias="type"),
    payment_method: str = Form(...),
    category_id: Optional[str] = Form(default=None),
    account_id: Optional[str] = Form(default=None),
    card_id: Optional[str] = Form(default=None),
    notes: Optional[str] = Form(default=None),
    installments: int = Form(default=1),
    is_recurring: bool = Form(default=False),
    apply_tithe: bool = Form(default=True),
    year: int = Form(default=None),
    month: int = Form(default=None),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    import calendar as _cal

    # ── Validação: PIX exige conta bancária ──
    if payment_method == "pix" and not account_id:
        accts_q = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id, Account.is_active == True))
        accts = accts_q.scalars().all()
        cats_q = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id).order_by(Category.type, Category.name))
        cards_q = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id))
        return tmpl(request).TemplateResponse("partials/_tx_modal.html", {
            "request": request, "tx": None,
            "cats": cats_q.scalars().all(),
            "accounts": accts,
            "cards": cards_q.scalars().all(),
            "has_accounts": len(accts) > 0,
            "has_cards": True,
            "today": tx_date,
            "redirect_to": None,
            "tithe_enabled": current_user.tithe_enabled,
            "error": "Pix requer uma conta bancária vinculada. Selecione uma conta ou cadastre em 'Contas'.",
            "error_field": "account_id",
        }, status_code=400)

    # ── Validação: Cartão crédito/débito exige cartão cadastrado ──
    if payment_method in ("credit_card", "debit_card") and not card_id:
        cards_q = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id, Card.is_active == True))
        cards = cards_q.scalars().all()
        if len(cards) == 0:
            # Sem cartões cadastrados
            accts_q = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id))
            cats_q = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id).order_by(Category.type, Category.name))
            return tmpl(request).TemplateResponse("partials/_tx_modal.html", {
                "request": request, "tx": None,
                "cats": cats_q.scalars().all(),
                "accounts": accts_q.scalars().all(),
                "cards": [],
                "has_accounts": True,
                "has_cards": False,
                "today": tx_date,
                "redirect_to": None,
                "tithe_enabled": current_user.tithe_enabled,
                "error": "Nenhum cartão cadastrado. Acesse 'Cartões & Parcelas' para adicionar.",
                "error_field": "card_id",
            }, status_code=400)
        else:
            accts_q = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id))
            cats_q = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id).order_by(Category.type, Category.name))
            return tmpl(request).TemplateResponse("partials/_tx_modal.html", {
                "request": request, "tx": None,
                "cats": cats_q.scalars().all(),
                "accounts": accts_q.scalars().all(),
                "cards": cards,
                "has_accounts": True,
                "has_cards": True,
                "today": tx_date,
                "redirect_to": None,
                "tithe_enabled": current_user.tithe_enabled,
                "error": "Selecione um cartão para continuar.",
                "error_field": "card_id",
            }, status_code=400)

    base_date = date.fromisoformat(tx_date)

    # ── Classificação inteligente (3 camadas) ──
    cat_uuid = uuid.UUID(category_id) if category_id else None
    if not cat_uuid:
        from app.services.ai_classifier import classify_smart
        cat_uuid = await classify_smart(description, tx_type, str(current_user.tenant_id), db)
        # Camada 3: fallback para "Outros"
        if not cat_uuid:
            cat_uuid = await _get_or_create_outros(current_user.tenant_id, db)

    # ── Receita fixa recorrente → cria Subscription (funciona como assinatura) ──
    if tx_type == "income" and is_recurring:
        sub = Subscription(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            name=description,
            type=SubscriptionType.income,
            amount=Decimal(str(amount)),
            billing_day=base_date.day,
            next_billing_date=base_date,
            category_id=cat_uuid,
            account_id=uuid.UUID(account_id) if account_id else None,
            is_active=True,
        )
        db.add(sub)
        # Cria a primeira transação para o mês atual
        first_tx = Transaction(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            date=base_date,
            amount=Decimal(str(amount)),
            description=description,
            type=TransactionType.income,
            payment_method=PaymentMethod(payment_method),
            category_id=cat_uuid,
            account_id=uuid.UUID(account_id) if account_id else None,
            source=TransactionSource.manual,
            is_recurring=True,
            notes=notes,
        )
        db.add(first_tx)
        await db.flush()

        # Dízimo sobre a receita fixa (1 transação por mês, atualizada)
        if apply_tithe and current_user.tithe_enabled:
            await _update_or_create_tithe(
                current_user.tenant_id, current_user.id,
                Decimal(str(amount)), base_date, db,
            )

        await db.commit()
        now = datetime.now()
        ctx = await _load_tx_context(current_user, db, year or now.year, month or now.month, 0, 50, None, None, None)
        ctx["request"] = request
        response = tmpl(request).TemplateResponse("partials/_tx_table.html", ctx)
        response.headers.update(_toast_headers("Receita fixa criada como assinatura! 📅"))
        response.headers["HX-Trigger-After-Swap"] = json.dumps({"sp:closeModal": True})
        return response

    # ── Transação normal (parcelada ou à vista) ──
    def add_months(d: date, n: int) -> date:
        m = d.month - 1 + n
        y = d.year + m // 12
        m = m % 12 + 1
        day = min(d.day, _cal.monthrange(y, m)[1])
        return date(y, m, day)

    per_amount = Decimal(str(amount / installments)) if installments > 1 else Decimal(str(amount))
    parent_id = None
    group_id = uuid.uuid4() if installments > 1 else None

    for i in range(installments):
        tx_d = add_months(base_date, i)
        desc = f"{description} ({i+1}/{installments})" if installments > 1 else description
        tx = Transaction(
            tenant_id=current_user.tenant_id,
            user_id=current_user.id,
            date=tx_d,
            amount=per_amount,
            description=desc,
            type=TransactionType(tx_type),
            payment_method=PaymentMethod(payment_method),
            category_id=cat_uuid,
            account_id=uuid.UUID(account_id) if account_id else None,
            card_id=uuid.UUID(card_id) if card_id else None,
            notes=notes,
            source=TransactionSource.manual,
            installments_total=installments,
            installment_number=i + 1,
            parent_id=parent_id,
            group_id=group_id,
            is_recurring=False,
        )
        db.add(tx)
        await db.flush()
        if i == 0:
            parent_id = tx.id

    # ── Dízimo sobre receita única ──
    if tx_type == "income" and apply_tithe and current_user.tithe_enabled:
        await _update_or_create_tithe(
            current_user.tenant_id, current_user.id,
            Decimal(str(amount)), base_date, db,
        )

    await db.commit()

    now = datetime.now()
    ctx = await _load_tx_context(current_user, db, year or now.year, month or now.month, 0, 50, None, None, None)
    ctx["request"] = request
    label = f"{installments}x parceladas" if installments > 1 else "Transação criada"
    response = tmpl(request).TemplateResponse("partials/_tx_table.html", ctx)
    response.headers.update(_toast_headers(label))
    response.headers["HX-Trigger-After-Swap"] = json.dumps({"sp:closeModal": True})
    return response


@router.put("/transactions/{tx_id}", response_class=HTMLResponse)
async def tx_update(
    request: Request,
    tx_id: uuid.UUID,
    tx_date: str = Form(..., alias="date"),
    amount: float = Form(...),
    description: str = Form(...),
    tx_type: str = Form(..., alias="type"),
    payment_method: str = Form(...),
    category_id: Optional[str] = Form(default=None),
    account_id: Optional[str] = Form(default=None),
    card_id: Optional[str] = Form(default=None),
    notes: Optional[str] = Form(default=None),
    redirect_to: Optional[str] = Form(default=None),
    year: int = Form(default=None),
    month: int = Form(default=None),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    tx_q = await db.execute(select(Transaction).where(Transaction.id == tx_id, Transaction.tenant_id == current_user.tenant_id))
    tx = tx_q.scalar_one_or_none()
    if tx:
        tx.date = date.fromisoformat(tx_date)
        tx.amount = Decimal(str(amount))
        tx.description = description
        tx.type = TransactionType(tx_type)
        tx.payment_method = PaymentMethod(payment_method)
        tx.category_id = uuid.UUID(category_id) if category_id else None
        tx.account_id = uuid.UUID(account_id) if account_id else None
        tx.card_id = uuid.UUID(card_id) if card_id else None
        tx.notes = notes
        await db.commit()

    now = datetime.now()
    ctx = await _load_tx_context(current_user, db, year or now.year, month or now.month, 0, 50, None, None, None)
    ctx["request"] = request
    response = tmpl(request).TemplateResponse("partials/_tx_table.html", ctx)
    response.headers.update(_toast_headers("Transação atualizada"))
    response.headers["HX-Trigger-After-Swap"] = json.dumps({"sp:closeModal": True})
    return response


@router.delete("/transactions/{tx_id}", response_class=HTMLResponse)
async def tx_delete(
    request: Request,
    tx_id: uuid.UUID,
    delete_all: bool = Query(default=False),
    from_page: str = Query(default=None),
    year: int = Query(default=None),
    month: int = Query(default=None),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    tx_q = await db.execute(select(Transaction).where(Transaction.id == tx_id, Transaction.tenant_id == current_user.tenant_id))
    tx = tx_q.scalar_one_or_none()
    if tx:
        if delete_all and tx.group_id:
            siblings_q = await db.execute(
                select(Transaction).where(Transaction.group_id == tx.group_id, Transaction.tenant_id == current_user.tenant_id)
            )
            for t in siblings_q.scalars().all():
                await db.delete(t)
        else:
            await db.delete(tx)
        await db.commit()

    now = datetime.now()
    ctx = await _load_tx_context(current_user, db, year or now.year, month or now.month, 0, 50, None, None, None)
    ctx["request"] = request
    response = tmpl(request).TemplateResponse("partials/_tx_table.html", ctx)
    response.headers.update(_toast_headers("Transação excluída", "warning"))
    return response


# ══════════════════════════════════════════════════════════════════════════════
# CATEGORIES
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/categories", response_class=HTMLResponse)
async def categories_page(
    request: Request,
    tab: str = Query(default="expense"),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    cats_q = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id).order_by(Category.type, Category.name))
    cats = cats_q.scalars().all()
    ctx = {"request": request, "user": current_user, "cats": cats, "tab": tab}
    if _is_htmx(request):
        return tmpl(request).TemplateResponse("partials/_cat_table.html", ctx)
    return tmpl(request).TemplateResponse("categories.html", ctx)


@router.get("/categories/new", response_class=HTMLResponse)
async def cat_new_modal(request: Request, current_user: User = Depends(get_current_user_cookie)):
    return tmpl(request).TemplateResponse("partials/_cat_modal.html", {"request": request, "cat": None})


@router.get("/categories/{cat_id}/edit", response_class=HTMLResponse)
async def cat_edit_modal(request: Request, cat_id: uuid.UUID, current_user: User = Depends(get_current_user_cookie), db: AsyncSession = Depends(get_db)):
    cat_q = await db.execute(select(Category).where(Category.id == cat_id, Category.tenant_id == current_user.tenant_id))
    return tmpl(request).TemplateResponse("partials/_cat_modal.html", {"request": request, "cat": cat_q.scalar_one_or_none()})


@router.post("/categories", response_class=HTMLResponse)
async def cat_create(
    request: Request,
    name: str = Form(...),
    cat_type: str = Form(..., alias="type"),
    icon: str = Form(default="tag"),
    color: str = Form(default="#6B7280"),
    keywords: str = Form(default=""),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    kw = [k.strip() for k in keywords.split(",") if k.strip()]
    dup = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id, Category.name.ilike(name.strip())))
    if dup.scalar_one_or_none():
        return tmpl(request).TemplateResponse("partials/_cat_modal.html", {"request": request, "cat": None, "error": "Já existe uma categoria com este nome."}, status_code=400)
    cat = Category(tenant_id=current_user.tenant_id, name=name.strip(), type=CategoryType(cat_type), icon=icon, color=color, keywords=kw)
    db.add(cat)
    await db.commit()

    cats_q = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id).order_by(Category.type, Category.name))
    ctx = {"request": request, "user": current_user, "cats": cats_q.scalars().all(), "tab": cat_type}
    response = tmpl(request).TemplateResponse("partials/_cat_table.html", ctx)
    response.headers.update(_toast_headers("Categoria criada"))
    response.headers["HX-Trigger-After-Swap"] = json.dumps({"sp:closeModal": True})
    return response


@router.put("/categories/{cat_id}", response_class=HTMLResponse)
async def cat_update(
    request: Request,
    cat_id: uuid.UUID,
    name: str = Form(...),
    cat_type: str = Form(..., alias="type"),
    icon: str = Form(default="tag"),
    color: str = Form(default="#6B7280"),
    keywords: str = Form(default=""),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    cat_q = await db.execute(select(Category).where(Category.id == cat_id, Category.tenant_id == current_user.tenant_id))
    cat = cat_q.scalar_one_or_none()
    if cat:
        cat.name = name.strip(); cat.type = CategoryType(cat_type)
        cat.icon = icon; cat.color = color
        cat.keywords = [k.strip() for k in keywords.split(",") if k.strip()]
        await db.commit()
    cats_q = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id).order_by(Category.type, Category.name))
    ctx = {"request": request, "user": current_user, "cats": cats_q.scalars().all(), "tab": cat_type}
    response = tmpl(request).TemplateResponse("partials/_cat_table.html", ctx)
    response.headers.update(_toast_headers("Categoria atualizada"))
    response.headers["HX-Trigger-After-Swap"] = json.dumps({"sp:closeModal": True})
    return response


@router.delete("/categories/{cat_id}", response_class=HTMLResponse)
async def cat_delete(
    request: Request,
    cat_id: uuid.UUID,
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    cat_q = await db.execute(select(Category).where(Category.id == cat_id, Category.tenant_id == current_user.tenant_id))
    cat = cat_q.scalar_one_or_none()
    error = None
    if cat:
        if cat.is_default:
            error = "Categorias padrão não podem ser excluídas."
        else:
            tx_chk = await db.execute(select(Transaction).where(Transaction.category_id == cat_id).limit(1))
            if tx_chk.scalar_one_or_none():
                error = "Categoria em uso. Remova as transações primeiro."
            else:
                await db.delete(cat); await db.commit()
    cats_q = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id).order_by(Category.type, Category.name))
    ctx = {"request": request, "user": current_user, "cats": cats_q.scalars().all(), "tab": "expense"}
    response = tmpl(request).TemplateResponse("partials/_cat_table.html", ctx)
    response.headers.update(_toast_headers(error if error else "Categoria excluída", "error" if error else "warning"))
    return response


# ══════════════════════════════════════════════════════════════════════════════
# SETTINGS (Accounts & Cards)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/settings", response_class=HTMLResponse)
async def settings_page(
    request: Request,
    tab: str = Query(default="accounts"),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    accts_q = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id).order_by(Account.name))
    cards_q = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id).order_by(Card.name))
    ctx = {
        "request": request, "user": current_user, "tab": tab,
        "accounts": accts_q.scalars().all(),
        "cards": cards_q.scalars().all(),
        "fmt": _fmt_brl,
        "account_types": AccountType,
    }
    return tmpl(request).TemplateResponse("settings.html", ctx)


@router.post("/settings/accounts", response_class=HTMLResponse)
async def account_create(
    request: Request,
    name: str = Form(...),
    acc_type: str = Form(..., alias="type"),
    balance: float = Form(default=0),
    color: str = Form(default="#10B981"),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    db.add(Account(tenant_id=current_user.tenant_id, name=name, type=AccountType(acc_type), balance=Decimal(str(balance)), color=color))
    await db.commit()
    accts_q = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id).order_by(Account.name))
    ctx = {"request": request, "accounts": accts_q.scalars().all(), "fmt": _fmt_brl}
    response = tmpl(request).TemplateResponse("partials/_accounts_table.html", ctx)
    response.headers.update(_toast_headers("Conta criada"))
    response.headers["HX-Trigger-After-Swap"] = json.dumps({"sp:closeModal": True})
    return response


@router.put("/settings/accounts/{acc_id}", response_class=HTMLResponse)
async def account_update(
    request: Request, acc_id: uuid.UUID,
    name: str = Form(...), acc_type: str = Form(..., alias="type"),
    balance: float = Form(default=0), color: str = Form(default="#10B981"),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    q = await db.execute(select(Account).where(Account.id == acc_id, Account.tenant_id == current_user.tenant_id))
    acc = q.scalar_one_or_none()
    if acc:
        acc.name = name; acc.type = AccountType(acc_type)
        acc.balance = Decimal(str(balance)); acc.color = color
        await db.commit()
    accts_q = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id).order_by(Account.name))
    ctx = {"request": request, "accounts": accts_q.scalars().all(), "fmt": _fmt_brl}
    response = tmpl(request).TemplateResponse("partials/_accounts_table.html", ctx)
    response.headers.update(_toast_headers("Conta atualizada"))
    response.headers["HX-Trigger-After-Swap"] = json.dumps({"sp:closeModal": True})
    return response


@router.delete("/settings/accounts/{acc_id}", response_class=HTMLResponse)
async def account_delete(
    request: Request, acc_id: uuid.UUID,
    current_user: User = Depends(get_current_user_cookie), db: AsyncSession = Depends(get_db),
):
    q = await db.execute(select(Account).where(Account.id == acc_id, Account.tenant_id == current_user.tenant_id))
    acc = q.scalar_one_or_none()
    if acc:
        await db.delete(acc); await db.commit()
    accts_q = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id).order_by(Account.name))
    ctx = {"request": request, "accounts": accts_q.scalars().all(), "fmt": _fmt_brl}
    response = tmpl(request).TemplateResponse("partials/_accounts_table.html", ctx)
    response.headers.update(_toast_headers("Conta excluída", "warning"))
    return response


@router.post("/settings/cards", response_class=HTMLResponse)
async def card_create(
    request: Request,
    name: str = Form(...), brand: str = Form(default="Visa"),
    last4: Optional[str] = Form(default=None),
    limit_amount: float = Form(default=0),
    due_day: int = Form(default=10), close_day: int = Form(default=3),
    color: str = Form(default="#374151"),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    db.add(Card(
        tenant_id=current_user.tenant_id, name=name, brand=brand,
        last4=last4 or None, limit_amount=Decimal(str(limit_amount)),
        due_day=due_day, close_day=close_day, color=color,
    ))
    await db.commit()
    cards_q = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id).order_by(Card.name))
    ctx = {"request": request, "cards": cards_q.scalars().all(), "fmt": _fmt_brl}
    response = tmpl(request).TemplateResponse("partials/_cards_table.html", ctx)
    response.headers.update(_toast_headers("Cartão criado"))
    response.headers["HX-Trigger-After-Swap"] = json.dumps({"sp:closeModal": True})
    return response


@router.delete("/settings/cards/{card_id}", response_class=HTMLResponse)
async def card_delete(
    request: Request, card_id: uuid.UUID,
    current_user: User = Depends(get_current_user_cookie), db: AsyncSession = Depends(get_db),
):
    q = await db.execute(select(Card).where(Card.id == card_id, Card.tenant_id == current_user.tenant_id))
    card = q.scalar_one_or_none()
    if card:
        await db.delete(card); await db.commit()
    cards_q = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id).order_by(Card.name))
    ctx = {"request": request, "cards": cards_q.scalars().all(), "fmt": _fmt_brl}
    response = tmpl(request).TemplateResponse("partials/_cards_table.html", ctx)
    response.headers.update(_toast_headers("Cartão excluído", "warning"))
    return response


# ══════════════════════════════════════════════════════════════════════════════
# GOALS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/goals", response_class=HTMLResponse)
async def goals_page(
    request: Request,
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    goals_q = await db.execute(select(Goal).where(Goal.tenant_id == current_user.tenant_id).order_by(Goal.created_at.desc()))
    accts_q = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id))
    goals = goals_q.scalars().all()
    accts = accts_q.scalars().all()
    accts_map = {str(a.id): a for a in accts}
    total_saved  = sum(float(g.current_amount) for g in goals)
    total_needed = sum(max(0, float(g.target_amount) - float(g.current_amount)) for g in goals)
    completed    = sum(1 for g in goals if float(g.current_amount) >= float(g.target_amount))
    ctx = {
        "request": request, "user": current_user,
        "goals": goals, "accounts": accts, "accts_map": accts_map,
        "total_saved": total_saved, "total_needed": total_needed,
        "completed": completed, "fmt": _fmt_brl, "today": date.today().isoformat(),
    }
    return tmpl(request).TemplateResponse("goals.html", ctx)


@router.post("/goals", response_class=HTMLResponse)
async def goal_create(
    request: Request,
    name: str = Form(...), target_amount: float = Form(...),
    current_amount: float = Form(default=0),
    account_id: Optional[str] = Form(default=None),
    deadline: Optional[str] = Form(default=None),
    color: str = Form(default="#3B82F6"), icon: str = Form(default="🎯"),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    db.add(Goal(
        tenant_id=current_user.tenant_id, name=name,
        target_amount=Decimal(str(target_amount)),
        current_amount=Decimal(str(current_amount)),
        account_id=uuid.UUID(account_id) if account_id else None,
        deadline=date.fromisoformat(deadline) if deadline else None,
        color=color, icon=icon,
    ))
    await db.commit()
    return _htmx_redirect(request, "/goals", "Meta criada! 🎯")


@router.put("/goals/{goal_id}", response_class=HTMLResponse)
async def goal_update(
    request: Request, goal_id: uuid.UUID,
    name: str = Form(...), target_amount: float = Form(...),
    current_amount: float = Form(default=0),
    account_id: Optional[str] = Form(default=None),
    deadline: Optional[str] = Form(default=None),
    color: str = Form(default="#3B82F6"), icon: str = Form(default="🎯"),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    q = await db.execute(select(Goal).where(Goal.id == goal_id, Goal.tenant_id == current_user.tenant_id))
    goal = q.scalar_one_or_none()
    if goal:
        goal.name = name; goal.target_amount = Decimal(str(target_amount))
        goal.current_amount = Decimal(str(current_amount))
        goal.account_id = uuid.UUID(account_id) if account_id else None
        goal.deadline = date.fromisoformat(deadline) if deadline else None
        goal.color = color; goal.icon = icon
        await db.commit()
    return _htmx_redirect(request, "/goals", "Meta atualizada")


@router.delete("/goals/{goal_id}", response_class=HTMLResponse)
async def goal_delete(
    request: Request, goal_id: uuid.UUID,
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    q = await db.execute(select(Goal).where(Goal.id == goal_id, Goal.tenant_id == current_user.tenant_id))
    goal = q.scalar_one_or_none()
    if goal:
        await db.delete(goal); await db.commit()
    return _htmx_redirect(request, "/goals", "Meta excluída", "warning")


# ══════════════════════════════════════════════════════════════════════════════
# OPTIONS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/options", response_class=HTMLResponse)
async def options_page(request: Request, current_user: User = Depends(get_current_user_cookie)):
    return tmpl(request).TemplateResponse("options.html", {"request": request, "user": current_user})


# ══════════════════════════════════════════════════════════════════════════════
# INSTALLMENTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/installments", response_class=HTMLResponse)
async def installments_page(
    request: Request,
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    today = date.today()
    cards_q = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id))
    cards = cards_q.scalars().all()
    cards_map = {str(c.id): c for c in cards}

    txs_q = await db.execute(
        select(Transaction).where(
            Transaction.tenant_id == current_user.tenant_id,
            Transaction.installments_total > 1
        ).order_by(Transaction.date.desc())
    )
    txs = txs_q.scalars().all()

    recurring_q = await db.execute(
        select(Transaction).where(
            Transaction.tenant_id == current_user.tenant_id,
            Transaction.is_recurring == True,
            Transaction.type == TransactionType.income,
        ).order_by(Transaction.date.desc())
    )
    recurring_income = recurring_q.scalars().all()

    installments_by_card = {}
    for t in txs:
        if t.card_id:
            if t.card_id not in installments_by_card:
                installments_by_card[t.card_id] = []
            installments_by_card[t.card_id].append(t)

    for card_id in installments_by_card:
        installments_by_card[card_id].sort(key=lambda x: x.installment_number)

    ctx = {
        "request": request, "user": current_user,
        "cards": cards, "cards_map": cards_map,
        "txs": txs, "installments_by_card": installments_by_card,
        "recurring_income": recurring_income,
        "current_month": today.month, "current_year": today.year, "today": today.day,
        "fmt": _fmt_brl,
    }
    return tmpl(request).TemplateResponse("installments.html", ctx)


# ══════════════════════════════════════════════════════════════════════════════
# SUBSCRIPTIONS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/subscriptions", response_class=HTMLResponse)
async def subscriptions_page(
    request: Request,
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    subs_q  = await db.execute(select(Subscription).where(Subscription.tenant_id == current_user.tenant_id).order_by(Subscription.name))
    cats_q  = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id))
    cards_q = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id))

    cats = cats_q.scalars().all()
    cards = cards_q.scalars().all()
    cats_map  = {str(c.id): c for c in cats}
    cards_map = {str(c.id): c for c in cards}
    subs  = subs_q.scalars().all()
    active_expenses = [s for s in subs if s.is_active and s.type == SubscriptionType.expense]
    active_incomes  = [s for s in subs if s.is_active and s.type == SubscriptionType.income]

    today_d = date.today()
    for s in subs:
        if s.billing_day:
            if today_d.day <= s.billing_day:
                s.next_billing_date = date(today_d.year, today_d.month, s.billing_day)
            else:
                next_month = today_d.month + 1 if today_d.month < 12 else 1
                next_year = today_d.year if today_d.month < 12 else today_d.year + 1
                s.next_billing_date = date(next_year, next_month, s.billing_day)
        try:
            s.days_until = (s.next_billing_date - today_d).days
        except Exception:
            s.days_until = None

    upcoming = sorted([s for s in active_expenses], key=lambda s: s.next_billing_date)
    next_due_name = upcoming[0].name if upcoming else None
    next_due_date = upcoming[0].next_billing_date.strftime("%d/%m") if upcoming else None

    ctx = {
        "request": request, "user": current_user,
        "subs": subs,
        "cats_map": cats_map, "cards_map": cards_map,
        "monthly_expense": sum(float(s.amount) for s in active_expenses),
        "monthly_income": sum(float(s.amount) for s in active_incomes),
        "active_expense_count": len(active_expenses),
        "active_income_count": len(active_incomes),
        "next_due_name": next_due_name,
        "next_due_date": next_due_date,
        "fmt": _fmt_brl,
    }
    return tmpl(request).TemplateResponse("subscriptions.html", ctx)


@router.post("/subscriptions", response_class=HTMLResponse)
async def sub_create(
    request: Request,
    name: str = Form(...), amount: float = Form(...),
    billing_day: int = Form(...), next_billing_date: str = Form(...),
    sub_type: str = Form(default="expense", alias="type"),
    category_id: Optional[str] = Form(default=None),
    card_id: Optional[str] = Form(default=None),
    account_id: Optional[str] = Form(default=None),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    db.add(Subscription(
        tenant_id=current_user.tenant_id, user_id=current_user.id,
        name=name, amount=Decimal(str(amount)), billing_day=billing_day,
        type=SubscriptionType(sub_type),
        next_billing_date=date.fromisoformat(next_billing_date),
        category_id=uuid.UUID(category_id) if category_id else None,
        card_id=uuid.UUID(card_id) if card_id else None,
        account_id=uuid.UUID(account_id) if account_id else None,
    ))
    await db.commit()
    return _htmx_redirect(request, "/subscriptions", "Assinatura/receita criada ✅")


@router.delete("/subscriptions/{sub_id}", response_class=HTMLResponse)
async def sub_delete(
    request: Request, sub_id: uuid.UUID,
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    q = await db.execute(select(Subscription).where(Subscription.id == sub_id, Subscription.tenant_id == current_user.tenant_id))
    sub = q.scalar_one_or_none()
    if sub:
        await db.delete(sub); await db.commit()
    return _htmx_redirect(request, "/subscriptions", "Excluído", "warning")


# ══════════════════════════════════════════════════════════════════════════════
# REPORTS — Avançado
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/reports", response_class=HTMLResponse)
async def reports_page(
    request: Request,
    year: int = Query(default=None),
    month: int = Query(default=None),
    current_user: User = Depends(get_current_user_cookie),
    db: AsyncSession = Depends(get_db),
):
    now = datetime.now()
    if not year: year = now.year
    if not month: month = now.month

    start = date(year, month, 1)
    end = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)

    prev_m = month - 1 if month > 1 else 12
    prev_y = year if month > 1 else year - 1
    prev_start = date(prev_y, prev_m, 1)
    prev_end = start

    base_f = [Transaction.tenant_id == current_user.tenant_id, Transaction.date >= start, Transaction.date < end]
    prev_f  = [Transaction.tenant_id == current_user.tenant_id, Transaction.date >= prev_start, Transaction.date < prev_end]

    # ── Mês atual ──
    income_q  = await db.execute(select(func.sum(Transaction.amount)).where(*base_f, Transaction.type == TransactionType.income))
    expense_q = await db.execute(select(func.sum(Transaction.amount)).where(*base_f, Transaction.type == TransactionType.expense))
    income    = float(income_q.scalar() or 0)
    expenses  = float(expense_q.scalar() or 0)

    # ── Mês anterior ──
    prev_income_q  = await db.execute(select(func.sum(Transaction.amount)).where(*prev_f, Transaction.type == TransactionType.income))
    prev_expense_q = await db.execute(select(func.sum(Transaction.amount)).where(*prev_f, Transaction.type == TransactionType.expense))
    prev_income    = float(prev_income_q.scalar() or 0)
    prev_expenses  = float(prev_expense_q.scalar() or 0)

    # Variação percentual
    def pct_change(current, previous):
        if previous == 0: return None
        return round((current - previous) / previous * 100, 1)

    income_change  = pct_change(income, prev_income)
    expense_change = pct_change(expenses, prev_expenses)

    # ── Gastos por categoria (com Outros para sem categoria) ──
    cat_q = await db.execute(
        select(
            func.coalesce(Category.name, "Outros").label("name"),
            func.coalesce(Category.color, "#6B7280").label("color"),
            func.sum(Transaction.amount).label("total"),
            func.count(Transaction.id).label("cnt"),
        )
        .outerjoin(Category, Transaction.category_id == Category.id)
        .where(Transaction.tenant_id == current_user.tenant_id, Transaction.type == TransactionType.expense, Transaction.date >= start, Transaction.date < end)
        .group_by(func.coalesce(Category.name, "Outros"), func.coalesce(Category.color, "#6B7280"))
        .order_by(func.sum(Transaction.amount).desc())
    )
    cat_breakdown = [{"name": r.name, "color": r.color, "total": float(r.total), "cnt": r.cnt} for r in cat_q.all()]

    # Mês anterior por categoria
    prev_cat_q = await db.execute(
        select(
            func.coalesce(Category.name, "Outros").label("name"),
            func.sum(Transaction.amount).label("total"),
        )
        .outerjoin(Category, Transaction.category_id == Category.id)
        .where(Transaction.tenant_id == current_user.tenant_id, Transaction.type == TransactionType.expense, Transaction.date >= prev_start, Transaction.date < prev_end)
        .group_by(func.coalesce(Category.name, "Outros"))
    )
    prev_cat_map = {r.name: float(r.total) for r in prev_cat_q.all()}
    for c in cat_breakdown:
        c["prev_total"] = prev_cat_map.get(c["name"], 0)
        c["change"] = pct_change(c["total"], c["prev_total"])

    # ── Gastos por cartão ──
    cards_q = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id))
    cards = cards_q.scalars().all()
    card_spending = []
    for card in cards:
        spent_q = await db.execute(
            select(func.sum(Transaction.amount)).where(
                Transaction.tenant_id == current_user.tenant_id,
                Transaction.card_id == card.id,
                Transaction.date >= start, Transaction.date < end,
            )
        )
        spent = float(spent_q.scalar() or 0)
        if spent > 0:
            card_spending.append({
                "name": card.name, "last4": card.last4,
                "color": card.color, "amount": spent,
                "limit": float(card.limit_amount),
                "pct": int(min(100, spent / float(card.limit_amount) * 100)) if float(card.limit_amount) > 0 else 0,
            })
    card_spending.sort(key=lambda x: x["amount"], reverse=True)

    # ── Gastos por conta ──
    accounts_q = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id))
    accounts = accounts_q.scalars().all()
    account_spending = []
    for acc in accounts:
        spent_q = await db.execute(
            select(func.sum(Transaction.amount)).where(
                Transaction.tenant_id == current_user.tenant_id,
                Transaction.account_id == acc.id,
                Transaction.type == TransactionType.expense,
                Transaction.date >= start, Transaction.date < end,
            )
        )
        income_acc_q = await db.execute(
            select(func.sum(Transaction.amount)).where(
                Transaction.tenant_id == current_user.tenant_id,
                Transaction.account_id == acc.id,
                Transaction.type == TransactionType.income,
                Transaction.date >= start, Transaction.date < end,
            )
        )
        spent  = float(spent_q.scalar() or 0)
        earned = float(income_acc_q.scalar() or 0)
        if spent > 0 or earned > 0:
            account_spending.append({
                "name": acc.name, "color": acc.color,
                "spent": spent, "earned": earned,
                "balance": earned - spent,
            })

    # ── Top 10 transações do mês ──
    top_q = await db.execute(
        select(Transaction).where(*base_f, Transaction.type == TransactionType.expense)
        .order_by(Transaction.amount.desc()).limit(10)
    )

    # ── Evolução mensal ──
    evo_q = await db.execute(
        select(func.extract("year", Transaction.date).label("y"), func.extract("month", Transaction.date).label("m"), Transaction.type, func.sum(Transaction.amount).label("total"))
        .where(Transaction.tenant_id == current_user.tenant_id)
        .group_by("y", "m", Transaction.type).order_by("y", "m")
    )
    evo_raw: dict = {}
    for row in evo_q.all():
        key = f"{int(row.y)}-{int(row.m):02d}"
        if key not in evo_raw:
            evo_raw[key] = {"income": 0.0, "expenses": 0.0}
        if row.type == TransactionType.income:
            evo_raw[key]["income"] = float(row.total)
        else:
            evo_raw[key]["expenses"] = float(row.total)

    # ── Dízimo do mês ──
    tithe_q = await db.execute(
        select(func.sum(Transaction.amount)).where(
            Transaction.tenant_id == current_user.tenant_id,
            Transaction.description == "Dízimo",
            Transaction.type == TransactionType.expense,
            Transaction.date >= start, Transaction.date < end,
        )
    )
    tithe_paid = float(tithe_q.scalar() or 0)

    ctx = {
        "request": request, "user": current_user,
        "year": year, "month": month,
        "income": income, "expenses": expenses, "balance": income - expenses,
        "prev_income": prev_income, "prev_expenses": prev_expenses,
        "income_change": income_change, "expense_change": expense_change,
        "cat_breakdown": cat_breakdown,
        "cat_json": json.dumps(cat_breakdown),
        "top_txs": top_q.scalars().all(),
        "card_spending": card_spending,
        "account_spending": account_spending,
        "tithe_paid": tithe_paid,
        "tithe_suggested": income * 0.10,
        "evo_data_json": json.dumps(list(evo_raw.values())[-12:]),
        "evo_labels_json": json.dumps(list(evo_raw.keys())[-12:]),
        "fmt": _fmt_brl,
    }
    if _is_htmx(request):
        return tmpl(request).TemplateResponse("partials/_reports_body.html", ctx)
    return tmpl(request).TemplateResponse("reports.html", ctx)


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/admin", response_class=HTMLResponse)
async def admin_page(
    request: Request,
    current_user: User = Depends(require_superadmin_cookie),
    db: AsyncSession = Depends(get_db),
):
    total_tenants  = (await db.execute(select(func.count()).select_from(Tenant))).scalar()
    active_tenants = (await db.execute(select(func.count()).select_from(Tenant).where(Tenant.is_active == True))).scalar()
    total_users    = (await db.execute(select(func.count()).select_from(User))).scalar()
    total_tx       = (await db.execute(select(func.count()).select_from(Transaction))).scalar()

    tenants_q = await db.execute(select(Tenant).order_by(Tenant.created_at.desc()).limit(50))
    tenants = tenants_q.scalars().all()

    ctx = {
        "request": request, "user": current_user,
        "total_tenants": total_tenants, "active_tenants": active_tenants,
        "total_users": total_users, "total_tx": total_tx,
        "tenants": tenants,
    }
    return tmpl(request).TemplateResponse("admin.html", ctx)


@router.patch("/admin/tenants/{tenant_id}", response_class=HTMLResponse)
async def admin_update_tenant(
    request: Request, tenant_id: uuid.UUID,
    plan: str = Form(default=None), max_users: int = Form(default=None),
    is_active: str = Form(default=None), expires_at: Optional[str] = Form(default=None),
    current_user: User = Depends(require_superadmin_cookie),
    db: AsyncSession = Depends(get_db),
):
    q = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = q.scalar_one_or_none()
    if tenant:
        if plan is not None: tenant.plan = plan
        if max_users is not None: tenant.max_users = max_users
        if is_active is not None: tenant.is_active = is_active == "true"
        if expires_at:
            tenant.expires_at = datetime.fromisoformat(expires_at).replace(tzinfo=timezone.utc)
        elif expires_at == "":
            tenant.expires_at = None
        await db.commit()

    response = Response(status_code=200)
    response.headers.update(_toast_headers("Workspace atualizado"))
    return response
