import uuid
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.account import Account, AccountType
from app.models.card import Card
from app.services.plan_limits import check_limit, check_feature

accounts_router = APIRouter(prefix="/api/v1/accounts", tags=["accounts"])
cards_router = APIRouter(prefix="/api/v1/cards", tags=["cards"])


# ---- ACCOUNTS ----

class AccountCreate(BaseModel):
    name: str
    type: AccountType = AccountType.checking
    balance: Decimal = Decimal("0.00")
    currency: str = "BRL"
    color: str = "#10B981"
    institution_id: Optional[uuid.UUID] = None


def account_to_dict(a: Account) -> dict:
    return {
        "id": str(a.id),
        "name": a.name,
        "type": a.type,
        "balance": float(a.balance),
        "currency": a.currency,
        "color": a.color,
        "institution_id": str(a.institution_id) if a.institution_id else None,
        "is_active": a.is_active,
    }


@accounts_router.get("")
async def list_accounts(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id).order_by(Account.name))
    return [account_to_dict(a) for a in result.scalars().all()]


@accounts_router.post("", status_code=201)
async def create_account(body: AccountCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    allowed, error = await check_limit(current_user.tenant_id, "accounts", db)
    if not allowed:
        raise HTTPException(status_code=403, detail=error)
    
    account = Account(**body.model_dump(), tenant_id=current_user.tenant_id)
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account_to_dict(account)


@accounts_router.put("/{account_id}")
async def update_account(account_id: uuid.UUID, body: AccountCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Account).where(Account.id == account_id, Account.tenant_id == current_user.tenant_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    await db.commit()
    await db.refresh(account)
    return account_to_dict(account)


@accounts_router.delete("/{account_id}")
async def delete_account(account_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Account).where(Account.id == account_id, Account.tenant_id == current_user.tenant_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Conta não encontrada")
    await db.delete(account)
    await db.commit()
    return {"message": "Conta excluída com sucesso."}


# ---- CARDS ----

class CardCreate(BaseModel):
    name: str
    brand: str = "Visa"
    last4: Optional[str] = None
    limit_amount: Decimal = Decimal("0.00")
    due_day: int = 10
    close_day: int = 3
    color: str = "#374151"
    institution_id: Optional[uuid.UUID] = None


def card_to_dict(c: Card) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "brand": c.brand,
        "last4": c.last4,
        "limit_amount": float(c.limit_amount),
        "due_day": c.due_day,
        "close_day": c.close_day,
        "color": c.color,
        "institution_id": str(c.institution_id) if c.institution_id else None,
        "is_active": c.is_active,
    }


@cards_router.get("")
async def list_cards(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id).order_by(Card.name))
    return [card_to_dict(c) for c in result.scalars().all()]


@cards_router.post("", status_code=201)
async def create_card(body: CardCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    allowed, error = await check_limit(current_user.tenant_id, "cards", db)
    if not allowed:
        raise HTTPException(status_code=403, detail=error)
    
    card = Card(**body.model_dump(), tenant_id=current_user.tenant_id)
    db.add(card)
    await db.commit()
    await db.refresh(card)
    return card_to_dict(card)


@cards_router.put("/{card_id}")
async def update_card(card_id: uuid.UUID, body: CardCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Card).where(Card.id == card_id, Card.tenant_id == current_user.tenant_id))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Cartão não encontrado")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(card, field, value)
    await db.commit()
    await db.refresh(card)
    return card_to_dict(card)


@cards_router.delete("/{card_id}")
async def delete_card(card_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Card).where(Card.id == card_id, Card.tenant_id == current_user.tenant_id))
    card = result.scalar_one_or_none()
    if not card:
        raise HTTPException(status_code=404, detail="Cartão não encontrado")
    await db.delete(card)
    await db.commit()
    return {"message": "Cartão excluído com sucesso."}
