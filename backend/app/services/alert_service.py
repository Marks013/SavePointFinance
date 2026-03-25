import httpx
from datetime import datetime
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import settings
from app.models.category import Category
from app.models.transaction import Transaction, TransactionType
from app.models.alert_log import AlertLog


async def send_whatsapp_message(to_number: str, text: str):
    """Sends a text message via Meta WhatsApp Cloud API."""
    url = f"https://graph.facebook.com/v17.0/{settings.META_PHONE_ID}/messages"
    headers = {
        "Authorization": f"Bearer {settings.META_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "text",
        "text": {"body": text}
    }
    async with httpx.AsyncClient() as client:
        try:
            await client.post(url, json=payload, headers=headers, timeout=10.0)
        except Exception as e:
            print(f"[Meta API Error] {e}")


async def check_and_send_alert(user_id: str, tenant_id: str, to_number: str, category_id: str, db: AsyncSession):
    """
    Background Task: 
    Checks if month expenses in category exceeded monthly_limit.
    Sends alert only once per month.
    """
    now = datetime.now()
    month = now.month
    year = now.year

    # 1. Check if category has limit
    cat_res = await db.execute(select(Category).where(Category.id == category_id))
    cat = cat_res.scalar_one_or_none()
    if not cat or not cat.monthly_limit or cat.monthly_limit <= 0:
        return

    # 2. Check if we already alerted this month
    alert_res = await db.execute(
        select(AlertLog).where(
            and_(
                AlertLog.category_id == category_id,
                AlertLog.tenant_id == tenant_id,
                AlertLog.month == month,
                AlertLog.year == year
            )
        )
    )
    if alert_res.scalar_one_or_none():
        return  # Already alerted

    # 3. Sum expenses for this month
    sum_res = await db.execute(
        select(func.sum(Transaction.amount)).where(
            and_(
                Transaction.tenant_id == tenant_id,
                Transaction.category_id == category_id,
                Transaction.type == TransactionType.expense,
                func.extract('month', Transaction.date) == month,
                func.extract('year', Transaction.date) == year
            )
        )
    )
    total_spent = float(sum_res.scalar() or 0.0)

    # 4. Trigger alert if exceeded
    if total_spent >= cat.monthly_limit:
        msg = (
            f"⚠️ *Alerta de Limite*\n\n"
            f"Você ultrapassou o limite mensal definido para a categoria *{cat.name}*.\n"
            f"Limite: R$ {cat.monthly_limit:,.2f}\n"
            f"Gasto Atual: R$ {total_spent:,.2f}"
        )
        await send_whatsapp_message(to_number, msg)
        
        # Log alert
        alert = AlertLog(
            tenant_id=tenant_id,
            category_id=category_id,
            month=month,
            year=year
        )
        db.add(alert)
        await db.commit()
