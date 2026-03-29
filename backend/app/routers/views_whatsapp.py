"""
Router para integração WhatsApp Business API
Webhooks e endpoints de comando
"""
import os
import json
import asyncio
from fastapi import APIRouter, Request, Query, HTTPException, Depends
from fastapi.responses import PlainTextResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.whatsapp_service import WhatsAppService, WhatsAppCommandHandler
from app.config import settings

router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])

wa_service = WhatsAppService()


@router.get("/webhook")
async def verify_webhook(
    mode: str = Query(...),
    token: str = Query(...),
    challenge: str = Query(None)
):
    """
    Endpoint de verificação do webhook (GET).
    Chamado pelo Meta ao configurar o webhook.
    """
    is_valid, response_challenge = wa_service.verify_webhook(mode, token, challenge or "")
    
    if is_valid:
        return PlainTextResponse(content=response_challenge, status_code=200)
    else:
        raise HTTPException(status_code=403, detail="Verification failed")


async def get_db_session():
    """Dependency to get DB session"""
    async for db in get_db():
        yield db


@router.post("/webhook")
async def receive_webhook(request: Request, db: AsyncSession = Depends(get_db_session)):
    """
    Endpoint principal para receber mensagens (POST).
    """
    
    body = await request.json()
    
    # Log para debug
    print(f"[WhatsApp Webhook] Received: {json.dumps(body, indent=2)}")
    
    # Processa entradas
    if "entry" in body:
        for entry in body["entry"]:
            if "changes" in entry:
                for change in entry["changes"]:
                    if "value" in change:
                        value = change["value"]
                        
                        # Verifica tipo de mensagem
                        if "messages" in value:
                            await process_messages(value["messages"], db)
                        
                        # Status de entrega
                        if "statuses" in value:
                            # Mensagem entregue/lida/erro
                            pass
    
    return JSONResponse(content={"status": "ok"}, status_code=200)


async def process_messages(messages: list, db: AsyncSession):
    """ Processa mensagens recebidas """
    handler = WhatsAppCommandHandler(db)
    
    for message in messages:
        # Ignora mensagens de sistema
        if message.get("type") != "text":
            continue
        
        from_number = message.get("from")
        message_text = message.get("text", {}).get("body", "")
        message_id = message.get("id")
        
        if not from_number or not message_text:
            continue
        
        # Marca como lido
        if message_id:
            asyncio.create_task(wa_service.mark_message_read(message_id))
        
        # Processa comando
        response = await handler.process_message(from_number, message_text, message_id)
        
        # Envia resposta
        if response:
            normalized_phone = handler.normalize_phone(from_number)
            await wa_service.send_text_message(normalized_phone, response)


@router.post("/send")
async def send_message(
    to: str,
    message: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Endpoint para enviar mensagem manual (para testes).
    """
    
    handler = WhatsAppCommandHandler(db)
    normalized_phone = handler.normalize_phone(to)
    
    result = await wa_service.send_text_message(normalized_phone, message)
    
    return JSONResponse(content=result)


@router.post("/link")
async def link_account(
    phone: str,
    cpf: str,
    db: AsyncSession = Depends(get_db_session)
):
    """
    Endpoint para iniciar vinculação (pode ser chamado pelo app).
    """
    
    handler = WhatsAppCommandHandler(db)
    
    # Envia mensagem de vinculação
    normalized_phone = handler.normalize_phone(phone)
    
    message = (
        f"🔗 *Vincular Conta Save Point*\n\n"
        f"Para confirmar, responda com:\n"
        f"*vincular {cpf}*"
    )
    
    result = await wa_service.send_text_message(normalized_phone, message)
    
    return JSONResponse(content={"status": "sent", "result": result})


@router.get("/status/{phone}")
async def check_status(
    phone: str,
    db: AsyncSession = Depends(get_db_session)
):
    """ Verifica status de vinculação do usuário """
    from app.models.whatsapp import WhatsAppUser
    from sqlalchemy import select
    
    handler = WhatsAppCommandHandler(db)
    normalized_phone = handler.normalize_phone(phone)
    
    result = await db.execute(
        select(WhatsAppUser).where(WhatsAppUser.phone_number == normalized_phone)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        return JSONResponse(content={"linked": False})
    
    return JSONResponse(content={
        "linked": True,
        "verified": user.is_verified,
        "cpf": user.cpf[-4:] if user.cpf else None,
        "last_message": user.last_message_at.isoformat() if user.last_message_at else None
    })
