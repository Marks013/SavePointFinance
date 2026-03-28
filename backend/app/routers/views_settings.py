"""views_settings.py — Extra GET endpoints for settings modal forms."""
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Form, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.auth import get_current_user_cookie, verify_password, hash_password
from app.models.user import User
from app.models.account import Account, AccountType
from app.models.card import Card
from app.models.category import Category
from app.models.goal import Goal
from app.routers.views import tmpl, _toast_headers, _fmt_brl

router = APIRouter(tags=["views-settings"])

# ── Account modals ────────────────────────────────────────────────────────────
@router.get("/settings/accounts/new-form", response_class=HTMLResponse)
async def acc_new_form(request: Request, _: User = Depends(get_current_user_cookie)):
    return tmpl(request).TemplateResponse("partials/_account_modal.html", {"request": request, "acc": None})

@router.get("/settings/accounts/{acc_id}/edit-form", response_class=HTMLResponse)
async def acc_edit_form(request: Request, acc_id: uuid.UUID,
                        current_user: User = Depends(get_current_user_cookie),
                        db: AsyncSession = Depends(get_db)):
    q = await db.execute(select(Account).where(Account.id == acc_id, Account.tenant_id == current_user.tenant_id))
    return tmpl(request).TemplateResponse("partials/_account_modal.html",
                                          {"request": request, "acc": q.scalar_one_or_none()})

@router.put("/settings/accounts/{acc_id}", response_class=HTMLResponse)
async def account_update_form(request: Request, acc_id: uuid.UUID,
                               name: str = Form(...), acc_type: str = Form(..., alias="type"),
                               balance: float = Form(default=0), color: str = Form(default="#10B981"),
                               current_user: User = Depends(get_current_user_cookie),
                               db: AsyncSession = Depends(get_db)):
    from decimal import Decimal
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
    response.headers["HX-Trigger-After-Swap"] = '{"sp:closeModal": true}'
    return response

# ── Card modals ───────────────────────────────────────────────────────────────
@router.get("/settings/cards/new-form", response_class=HTMLResponse)
async def card_new_form(request: Request, _: User = Depends(get_current_user_cookie)):
    return tmpl(request).TemplateResponse("partials/_card_modal.html", {"request": request, "card": None})

@router.get("/settings/cards/{card_id}/edit-form", response_class=HTMLResponse)
async def card_edit_form(request: Request, card_id: uuid.UUID,
                          current_user: User = Depends(get_current_user_cookie),
                          db: AsyncSession = Depends(get_db)):
    q = await db.execute(select(Card).where(Card.id == card_id, Card.tenant_id == current_user.tenant_id))
    return tmpl(request).TemplateResponse("partials/_card_modal.html",
                                          {"request": request, "card": q.scalar_one_or_none()})

@router.put("/settings/cards/{card_id}", response_class=HTMLResponse)
async def card_update_form(request: Request, card_id: uuid.UUID,
                            name: str = Form(...), brand: str = Form(default="Visa"),
                            last4: Optional[str] = Form(default=None),
                            limit_amount: float = Form(default=0),
                            due_day: int = Form(default=10), close_day: int = Form(default=3),
                            color: str = Form(default="#374151"),
                            current_user: User = Depends(get_current_user_cookie),
                            db: AsyncSession = Depends(get_db)):
    from decimal import Decimal
    q = await db.execute(select(Card).where(Card.id == card_id, Card.tenant_id == current_user.tenant_id))
    card = q.scalar_one_or_none()
    if card:
        card.name = name; card.brand = brand; card.last4 = last4 or None
        card.limit_amount = Decimal(str(limit_amount))
        card.due_day = due_day; card.close_day = close_day; card.color = color
        await db.commit()
    cards_q = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id).order_by(Card.name))
    ctx = {"request": request, "cards": cards_q.scalars().all(), "fmt": _fmt_brl}
    response = tmpl(request).TemplateResponse("partials/_cards_table.html", ctx)
    response.headers.update(_toast_headers("Cartão atualizado"))
    response.headers["HX-Trigger-After-Swap"] = '{"sp:closeModal": true}'
    return response

# ── Preferences ───────────────────────────────────────────────────────────────
@router.post("/settings/toggle-tithe")
async def toggle_tithe(request: Request, enabled: bool = Query(...),
                        current_user: User = Depends(get_current_user_cookie),
                        db: AsyncSession = Depends(get_db)):
    current_user.tithe_enabled = enabled
    await db.commit()
    return JSONResponse(content={"success": True})

@router.post("/settings/change-password", response_class=HTMLResponse)
async def change_password(request: Request,
                           current_password: str = Form(...),
                           new_password: str = Form(...),
                           current_user: User = Depends(get_current_user_cookie),
                           db: AsyncSession = Depends(get_db)):
    if not verify_password(current_password, current_user.password_hash):
        return JSONResponse(status_code=400, content={"detail": "Senha atual incorreta."})
    if len(new_password) < 6:
        return JSONResponse(status_code=400, content={"detail": "Mínimo 6 caracteres."})
    current_user.password_hash = hash_password(new_password)
    await db.commit()
    return HTMLResponse(content="", status_code=200)

# ── Subscription modal ────────────────────────────────────────────────────────
@router.get("/subscriptions/new-form", response_class=HTMLResponse)
async def sub_new_form(request: Request, current_user: User = Depends(get_current_user_cookie),
                        db: AsyncSession = Depends(get_db)):
    from datetime import date
    cats_q  = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id))
    cards_q = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id))
    return tmpl(request).TemplateResponse("partials/_sub_modal.html", {
        "request": request,
        "cats": cats_q.scalars().all(),
        "cards": cards_q.scalars().all(),
        "today": date.today().isoformat(),
    })

# ── Goal modals ───────────────────────────────────────────────────────────────
@router.get("/goals/new-form", response_class=HTMLResponse)
async def goal_new_form(request: Request, current_user: User = Depends(get_current_user_cookie),
                         db: AsyncSession = Depends(get_db)):
    from datetime import date
    from app.models.account import Account
    accts_q = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id))
    return tmpl(request).TemplateResponse("partials/_goal_modal.html", {
        "request": request, "goal": None,
        "accounts": accts_q.scalars().all(),
        "today": date.today().isoformat(),
    })

@router.get("/goals/{goal_id}/edit-form", response_class=HTMLResponse)
async def goal_edit_form(request: Request, goal_id: uuid.UUID,
                          current_user: User = Depends(get_current_user_cookie),
                          db: AsyncSession = Depends(get_db)):
    from datetime import date
    from app.models.account import Account
    q = await db.execute(select(Goal).where(Goal.id == goal_id, Goal.tenant_id == current_user.tenant_id))
    accts_q = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id))
    return tmpl(request).TemplateResponse("partials/_goal_modal.html", {
        "request": request, "goal": q.scalar_one_or_none(),
        "accounts": accts_q.scalars().all(),
        "today": date.today().isoformat(),
    })

@router.get("/goals/{goal_id}/deposit-form", response_class=HTMLResponse)
async def goal_deposit_form(request: Request, goal_id: uuid.UUID,
                             current_user: User = Depends(get_current_user_cookie),
                             db: AsyncSession = Depends(get_db)):
    q = await db.execute(select(Goal).where(Goal.id == goal_id, Goal.tenant_id == current_user.tenant_id))
    return tmpl(request).TemplateResponse("partials/_goal_deposit_modal.html", {
        "request": request, "goal": q.scalar_one_or_none(),
    })
