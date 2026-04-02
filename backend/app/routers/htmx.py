"""
HTMX Router — Serves modal partials for HTMX requests.
All endpoints return HTML fragments for modals.
"""
import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.category import Category
from app.models.account import Account
from app.models.card import Card
from app.models.transaction import Transaction, TransactionType
from app.models.goal import Goal
from app.models.subscription import Subscription
from app.template import templates

router = APIRouter(tags=["htmx"])


def fmt_money(amount):
    if amount is None:
        return "R$ 0,00"
    return f"R$ {amount:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


# ── Transaction Modals ─────────────────────────────────────────────────────────

@router.get("/transactions/new", response_class=HTMLResponse)
async def new_transaction_modal(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """HTMX: Render new transaction modal."""
    categories = (await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id).order_by(Category.name))).scalars().all()
    accounts = (await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id).order_by(Account.name))).scalars().all()
    cards = (await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id).order_by(Card.name))).scalars().all()
    
    return templates.TemplateResponse("partials/_tx_modal.html", {
        "request": request,
        "tx": None,
        "tx_type": "expense",
        "categories": [{"id": str(c.id), "name": c.name, "icon": c.icon} for c in categories],
        "accounts": [{"id": str(a.id), "name": a.name} for a in accounts],
        "cards": [{"id": str(c.id), "name": c.name} for c in cards],
        "today": date.today().strftime("%Y-%m-%d"),
    })


@router.get("/transactions/{tx_id}/edit", response_class=HTMLResponse)
async def edit_transaction_modal(
    request: Request,
    tx_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """HTMX: Render edit transaction modal."""
    tx = (await db.execute(select(Transaction).where(Transaction.id == uuid.UUID(tx_id), Transaction.tenant_id == current_user.tenant_id))).scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=404, detail="Transação não encontrada")
    
    categories = (await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id).order_by(Category.name))).scalars().all()
    accounts = (await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id).order_by(Account.name))).scalars().all()
    cards = (await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id).order_by(Card.name))).scalars().all()
    
    return templates.TemplateResponse("partials/_tx_modal.html", {
        "request": request,
        "tx": tx,
        "categories": [{"id": str(c.id), "name": c.name, "icon": c.icon} for c in categories],
        "accounts": [{"id": str(a.id), "name": a.name} for a in accounts],
        "cards": [{"id": str(c.id), "name": c.name} for c in cards],
    })


# ── Goal Modals ───────────────────────────────────────────────────────────────

@router.get("/goals/new", response_class=HTMLResponse)
async def new_goal_modal(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """HTMX: Render new goal modal."""
    accounts = (await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id).order_by(Account.name))).scalars().all()
    
    return templates.TemplateResponse("partials/_goal_modal.html", {
        "request": request,
        "goal": None,
        "accounts": [{"id": str(a.id), "name": a.name} for a in accounts],
    })


@router.get("/goals/{goal_id}/edit", response_class=HTMLResponse)
async def edit_goal_modal(
    request: Request,
    goal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """HTMX: Render edit goal modal."""
    goal = (await db.execute(select(Goal).where(Goal.id == uuid.UUID(goal_id), Goal.tenant_id == current_user.tenant_id))).scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    
    accounts = (await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id).order_by(Account.name))).scalars().all()
    
    return templates.TemplateResponse("partials/_goal_modal.html", {
        "request": request,
        "goal": goal,
        "accounts": [{"id": str(a.id), "name": a.name} for a in accounts],
    })


@router.get("/goals/{goal_id}/deposit", response_class=HTMLResponse)
async def deposit_goal_modal(
    request: Request,
    goal_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """HTMX: Render deposit to goal modal."""
    goal = (await db.execute(select(Goal).where(Goal.id == uuid.UUID(goal_id), Goal.tenant_id == current_user.tenant_id))).scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    
    return templates.TemplateResponse("partials/_goal_deposit_modal.html", {
        "request": request,
        "goal": goal,
    })


# ── Category Modals ───────────────────────────────────────────────────────────

@router.get("/categories/new", response_class=HTMLResponse)
async def new_category_modal(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """HTMX: Render new category modal."""
    return templates.TemplateResponse("partials/_cat_modal.html", {
        "request": request,
        "category": None,
    })


@router.get("/categories/{cat_id}/edit", response_class=HTMLResponse)
async def edit_category_modal(
    request: Request,
    cat_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """HTMX: Render edit category modal."""
    cat = (await db.execute(select(Category).where(Category.id == uuid.UUID(cat_id), Category.tenant_id == current_user.tenant_id))).scalar_one_or_none()
    if not cat:
        raise HTTPException(status_code=404, detail="Categoria não encontrada")
    
    return templates.TemplateResponse("partials/_cat_modal.html", {
        "request": request,
        "category": cat,
    })


# ── Account/Cards Modals ─────────────────────────────────────────────────────

@router.get("/settings/accounts/new", response_class=HTMLResponse)
async def new_account_modal(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """HTMX: Render new account modal."""
    return templates.TemplateResponse("partials/_account_modal.html", {
        "request": request,
        "account": None,
    })


@router.get("/settings/accounts/{acc_id}/edit", response_class=HTMLResponse)
async def edit_account_modal(
    request: Request,
    acc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """HTMX: Render edit account modal."""
    acc = (await db.execute(select(Account).where(Account.id == uuid.UUID(acc_id), Account.tenant_id == current_user.tenant_id))).scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Conta não encontrada")
    
    return templates.TemplateResponse("partials/_account_modal.html", {
        "request": request,
        "account": acc,
    })


@router.get("/settings/cards/new", response_class=HTMLResponse)
async def new_card_modal(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """HTMX: Render new card modal."""
    return templates.TemplateResponse("partials/_card_modal.html", {
        "request": request,
        "card": None,
    })


@router.get("/settings/cards/{card_id}/edit", response_class=HTMLResponse)
async def edit_card_modal(
    request: Request,
    card_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """HTMX: Render edit card modal."""
    card = (await db.execute(select(Card).where(Card.id == uuid.UUID(card_id), Card.tenant_id == current_user.tenant_id))).scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Cartão não encontrado")
    
    return templates.TemplateResponse("partials/_card_modal.html", {
        "request": request,
        "card": card,
    })


# ── Subscription Modals ──────────────────────────────────────────────────────

@router.get("/subscriptions/new", response_class=HTMLResponse)
async def new_subscription_modal(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """HTMX: Render new subscription modal."""
    categories = (await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id).order_by(Category.name))).scalars().all()
    accounts = (await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id).order_by(Account.name))).scalars().all()
    
    return templates.TemplateResponse("partials/_sub_modal.html", {
        "request": request,
        "subscription": None,
        "categories": [{"id": str(c.id), "name": c.name} for c in categories],
        "accounts": [{"id": str(a.id), "name": a.name} for a in accounts],
    })


@router.get("/subscriptions/{sub_id}/edit", response_class=HTMLResponse)
async def edit_subscription_modal(
    request: Request,
    sub_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """HTMX: Render edit subscription modal."""
    sub = (await db.execute(select(Subscription).where(Subscription.id == uuid.UUID(sub_id), Subscription.tenant_id == current_user.tenant_id))).scalar_one_or_none()
    if not sub:
        raise HTTPException(status_code=404, detail="Assinatura não encontrada")
    
    categories = (await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id).order_by(Category.name))).scalars().all()
    accounts = (await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id).order_by(Account.name))).scalars().all()
    
    return templates.TemplateResponse("partials/_sub_modal.html", {
        "request": request,
        "subscription": sub,
        "categories": [{"id": str(c.id), "name": c.name} for c in categories],
        "accounts": [{"id": str(a.id), "name": a.name} for a in accounts],
    })


# ── Installments Modals ────────────────────────────────────────────────────────

@router.get("/installments/{inst_id}/edit", response_class=HTMLResponse)
async def edit_installment_modal(
    request: Request,
    inst_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """HTMX: Render edit installment modal."""
    # This would need to fetch the installment data
    return HTMLResponse("<!-- installment edit modal -->")
