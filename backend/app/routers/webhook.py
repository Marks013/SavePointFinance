import json
from datetime import datetime
from fastapi import APIRouter, Request, HTTPException, Depends, BackgroundTasks, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from redis.asyncio import Redis

from app.database import get_db
from app.config import settings
from app.models.user import User
from app.models.category import Category, CategoryType
from app.models.transaction import Transaction, TransactionSource, TransactionType
from app.services.ai_service import analyze_transaction
from app.services.alert_service import check_and_send_alert, send_whatsapp_message

router = APIRouter(prefix="/api/v1/webhook", tags=["whatsapp-webhook"])


async def get_redis():
    redis = await Redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        yield redis
    finally:
        await redis.close()


@router.get("")
async def verify_webhook(request: Request):
    """
    Meta Webhook Verification.
    Allows WhatsApp Cloud API to verify the endpoint.
    """
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode and token:
        if mode == "subscribe" and token == settings.META_VERIFY_TOKEN:
            return Response(content=challenge, media_type="text/plain")
        else:
            raise HTTPException(status_code=403, detail="Verification failed")
    raise HTTPException(status_code=400, detail="Missing hub parameters")


@router.post("")
async def receive_message(
    request: Request,
    background_tasks: BackgroundTasks
):
    """
    Main webhook entry to process messages. Runs background tasks for speed.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Meta Webhook parsing structure
    # body -> entry -> changes -> value -> messages
    try:
        entry = body["entry"][0]
        changes = entry["changes"][0]
        value = changes["value"]
        messages = value.get("messages", [])
        if not messages:
            return {"status": "ignored"}
        
        message = messages[0]
        from_number = message["from"]  # WhatsApp ID of the sender
        text = message.get("text", {}).get("body", "").strip()
    except (KeyError, IndexError):
        return {"status": "ignored"}

    if not text:
        return {"status": "ignored"}

    # Run core logic in background task to immediately ack Meta Cloud API (200 OK required fast)
    background_tasks.add_task(process_whatsapp_message, from_number, text)
    return {"status": "processing"}


async def process_whatsapp_message(from_number: str, text: str):
    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        async with Redis.from_url(settings.REDIS_URL, decode_responses=True) as redis:
            # Lookup User
            res = await db.execute(select(User).where(User.whatsapp_number == from_number, User.is_active == True))
    user = res.scalar_one_or_none()
    if not user:
        await send_whatsapp_message(from_number, "❌ Número não vinculado. Cadastre seu WhatsApp no painel do Save Point Finanças.")
        return

    tenant_id = user.tenant_id

    # Check for Redis state (pending category)
    state_key = f"pending_tx:{from_number}"
    pending_state = await redis.get(state_key)

    if pending_state:
        # A transaction was waiting for category assignment
        state_data = json.loads(pending_state)
        # Attempt to find or create category matching `text`
        cat_res = await db.execute(
            select(Category).where(
                Category.tenant_id == tenant_id,
                Category.name.ilike(f"%{text}%")
            ).limit(1)
        )
        cat = cat_res.scalar_one_or_none()
        
        if not cat:
            cat = Category(
                tenant_id=tenant_id,
                name=text,
                type=CategoryType.expense,
                color="#6B7280"
            )
            db.add(cat)
            await db.commit()
            await db.refresh(cat)
            await send_whatsapp_message(from_number, f"✨ Categoria '{text}' criada com sucesso!")

        # Create the transaction
        tx = Transaction(
            tenant_id=tenant_id,
            user_id=user.id,
            date=datetime.now(),
            amount=state_data["value"],
            description=state_data["description"],
            type=TransactionType(state_data["type"]),
            category_id=cat.id,
            source=TransactionSource.whatsapp
        )
        db.add(tx)
        await db.commit()
        await redis.delete(state_key)

        sign = "-" if tx.type == TransactionType.expense else "+"
        await send_whatsapp_message(from_number, f"✅ Adicionado:\n{sign}R$ {tx.amount:,.2f} — {tx.description} ({cat.name})")

        # Background Limit Checking Alert!
        await check_and_send_alert(str(user.id), str(tenant_id), from_number, str(cat.id), db)
        return

    # Normal Flow: Use Haiku AI
    # Load all categories for tenant
    cats_res = await db.execute(select(Category).where(Category.tenant_id == tenant_id))
    cats_list = [{"id": str(c.id), "name": c.name, "type": c.type.value} for c in cats_res.scalars().all()]

    ai_result = await analyze_transaction(text, cats_list)
    val = float(ai_result.get("value", 0))
    desc = ai_result.get("description", "Gasto via WhatsApp")
    cat_id = ai_result.get("category_id")

    if not val or val <= 0:
        await send_whatsapp_message(from_number, "❓ Não encontrei nenhum valor numérioc válido. Tente: 'Gastei 50 com ifood'")
        return

    if not cat_id:
        # AI didn't find category, set pending state
        await redis.setex(state_key, 300, json.dumps({
            "value": val,
            "description": desc,
            "type": ai_result.get("type", "expense")
        }))
        await send_whatsapp_message(from_number, f"Identifiquei o gasto: R$ {val:,.2f} em '{desc}'.\n\nPorem, não encontrei uma categoria que se encaixe.\nQual categoria devo associar? (Ou digite o nome de uma nova categoria para eu criar).")
        return

    # Cat ID found, valid Create
    tx = Transaction(
        tenant_id=tenant_id,
        user_id=user.id,
        date=datetime.now(),
        amount=val,
        description=desc,
        type=TransactionType(ai_result.get("type", "expense")),
        category_id=cat_id,
        source=TransactionSource.whatsapp
    )
    db.add(tx)
    await db.commit()

    # Get cat name
    cat_final_res = await db.execute(select(Category).where(Category.id == cat_id))
    cat_final = cat_final_res.scalar_one()

    sign = "-" if tx.type == TransactionType.expense else "+"
    await send_whatsapp_message(from_number, f"✅ Adicionado:\n{sign}R$ {tx.amount:,.2f} — {tx.description} ({cat_final.name})")

    # Limit Checking
    await check_and_send_alert(str(user.id), str(tenant_id), from_number, str(cat_id), db)
