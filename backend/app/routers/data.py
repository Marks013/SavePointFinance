"""
Export/Import Router — Data export and import functionality.
"""
import uuid
import csv
import io
import json
from datetime import date, datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.database import get_db
from app.auth import get_current_user, require_admin
from app.models.user import User
from app.models.transaction import Transaction, TransactionType, PaymentMethod, TransactionSource
from app.models.category import Category
from app.models.account import Account
from app.models.card import Card
from app.models.subscription import Subscription
from app.models.goal import Goal
from app.services.plan_limits import check_feature

router = APIRouter(prefix="/api/v1/data", tags=["data"])


# ── Export Schemas ────────────────────────────────────────────────────────────

class ExportRequest(BaseModel):
    format: str = "csv"  # csv or json
    include_transactions: bool = True
    include_categories: bool = True
    include_accounts: bool = True
    include_cards: bool = True
    include_subscriptions: bool = False
    include_goals: bool = False
    year: int
    month: int


@router.get("/export")
async def export_data(
    format: str = Query("csv", regex="^(csv|json)$"),
    transactions: bool = Query(True),
    categories: bool = Query(True),
    accounts: bool = Query(True),
    cards: bool = Query(True),
    subscriptions: bool = Query(False),
    goals: bool = Query(False),
    year: int = Query(None),
    month: int = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export tenant data in CSV or JSON format."""
    # Check export feature permission
    allowed, error = await check_feature(current_user.tenant_id, "export", db)
    if not allowed:
        raise HTTPException(status_code=403, detail=error)

    from datetime import datetime
    if year and month:
        start = date(year, month, 1)
        if month == 12:
            end = date(year + 1, 1, 1)
        else:
            end = date(year, month + 1, 1)
    else:
        start = None
        end = None

    data = {}

    if transactions:
        q = select(Transaction).where(Transaction.tenant_id == current_user.tenant_id)
        if start and end:
            q = q.where(Transaction.date >= start, Transaction.date < end)
        result = await db.execute(q.order_by(Transaction.date.desc()))
        data["transactions"] = [
            {
                "date": t.date.isoformat(),
                "description": t.description,
                "amount": float(t.amount),
                "type": t.type.value,
                "category": (await db.execute(select(Category).where(Category.id == t.category_id))).scalar_one_or_none().name if t.category_id else None,
                "account": (await db.execute(select(Account).where(Account.id == t.account_id))).scalar_one_or_none().name if t.account_id else None,
                "card": (await db.execute(select(Card).where(Card.id == t.card_id))).scalar_one_or_none().name if t.card_id else None,
                "notes": t.notes,
            }
            for t in result.scalars().all()
        ]

    if categories:
        result = await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id))
        data["categories"] = [
            {"name": c.name, "icon": c.icon, "color": c.color, "type": c.type.value}
            for c in result.scalars().all()
        ]

    if accounts:
        result = await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id))
        data["accounts"] = [
            {"name": a.name, "type": a.type.value, "balance": float(a.balance), "color": a.color}
            for a in result.scalars().all()
        ]

    if cards:
        result = await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id))
        data["cards"] = [
            {"name": c.name, "brand": c.brand, "limit": float(c.limit_amount), "due_day": c.due_day}
            for c in result.scalars().all()
        ]

    if subscriptions:
        result = await db.execute(select(Subscription).where(Subscription.tenant_id == current_user.tenant_id))
        data["subscriptions"] = [
            {"name": s.name, "amount": float(s.amount), "billing_day": s.billing_day, "is_active": s.is_active}
            for s in result.scalars().all()
        ]

    if goals:
        result = await db.execute(select(Goal).where(Goal.tenant_id == current_user.tenant_id))
        # FIX: Goal model usa target_amount e current_amount, não target e current
        data["goals"] = [
            {
                "name": g.name,
                "target": float(g.target_amount),
                "current": float(g.current_amount),
                "deadline": g.deadline.isoformat() if g.deadline else None,
            }
            for g in result.scalars().all()
        ]

    if format == "csv":
        # Flatten to CSV - main focus on transactions
        output = io.StringIO()
        if "transactions" in data and data["transactions"]:
            writer = csv.DictWriter(output, fieldnames=["date", "description", "amount", "type", "category", "account", "card", "notes"])
            writer.writeheader()
            for row in data["transactions"]:
                writer.writerow(row)
        else:
            output.write("No data to export")

        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=savepoint_export_{year or 'all'}_{month or 'all'}.csv"}
        )

    # JSON format
    import json
    return StreamingResponse(
        iter([json.dumps(data, indent=2, default=str)]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=savepoint_export_{year or 'all'}_{month or 'all'}.json"}
    )


# ── Import Schemas ────────────────────────────────────────────────────────────

class ImportRequest(BaseModel):
    format: str = "csv"


class ImportResult(BaseModel):
    imported: int = 0
    errors: List[str] = []


@router.post("/import", response_model=ImportResult)
async def import_transactions(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import transactions from CSV file."""
    allowed, error = await check_feature(current_user.tenant_id, "export", db)
    if not allowed:
        raise HTTPException(status_code=403, detail=error)

    if file.content_type not in ["text/csv", "application/csv", "text/plain"]:
        raise HTTPException(status_code=400, detail="Apenas arquivos CSV são permitidos.")

    content = await file.read()
    text = content.decode("utf-8")

    reader = csv.DictReader(io.StringIO(text))
    imported = 0
    errors = []

    categories = {c.name.lower(): c for c in (await db.execute(select(Category).where(Category.tenant_id == current_user.tenant_id))).scalars().all()}
    accounts = {a.name.lower(): a for a in (await db.execute(select(Account).where(Account.tenant_id == current_user.tenant_id))).scalars().all()}
    cards = {c.name.lower(): c for c in (await db.execute(select(Card).where(Card.tenant_id == current_user.tenant_id))).scalars().all()}

    for row_num, row in enumerate(reader, start=2):
        try:
            date_str = row.get("date", "").strip()
            if not date_str:
                errors.append(f"Linha {row_num}: Data obrigatória")
                continue

            try:
                tx_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                errors.append(f"Linha {row_num}: Data inválida (use YYYY-MM-DD)")
                continue

            desc = row.get("description", "").strip()
            if not desc:
                errors.append(f"Linha {row_num}: Descrição obrigatória")
                continue

            try:
                amount = abs(float(row.get("amount", "0").replace(",", "").replace("R$", "").strip()))
            except ValueError:
                errors.append(f"Linha {row_num}: Valor inválido")
                continue

            type_str = row.get("type", "expense").strip().lower()
            tx_type = TransactionType.expense if type_str == "expense" else TransactionType.income

            category = categories.get(row.get("category", "").strip().lower())
            account = accounts.get(row.get("account", "").strip().lower())
            card = cards.get(row.get("card", "").strip().lower())

            payment_method = PaymentMethod.credit_card if card else (PaymentMethod.debit_card if account else PaymentMethod.pix)

            tx = Transaction(
                tenant_id=current_user.tenant_id,
                user_id=current_user.id,
                date=tx_date,
                amount=amount,
                description=desc,
                type=tx_type,
                payment_method=payment_method,
                category_id=category.id if category else None,
                account_id=account.id if account else None,
                card_id=card.id if card else None,
                notes=row.get("notes", "").strip() or None,
                source=TransactionSource.import_csv,
            )
            db.add(tx)
            imported += 1

        except Exception as e:
            errors.append(f"Linha {row_num}: Erro - {str(e)}")

    await db.commit()
    return ImportResult(imported=imported, errors=errors[:20])  # Limit to 20 errors


@router.get("/import/template")
async def get_import_template(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get CSV template for import."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["date", "description", "amount", "type", "category", "account", "card", "notes"])
    writer.writerow(["2026-03-15", "Mercado R$ 150,00", 150.00, "expense", "Alimentação", "Nubank", "", "Compras semanal"])
    writer.writerow(["2026-03-10", "Salário", 5000.00, "income", "Salário", "Itau", "", ""])

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=savepoint_import_template.csv"}
    )
