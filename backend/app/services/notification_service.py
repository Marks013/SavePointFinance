from datetime import datetime, timedelta
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.notification import Notification
from app.models.card import Card
from app.models.goal import Goal
from app.models.subscription import Subscription


async def create_notification(
    db: AsyncSession,
    tenant_id: str,
    user_id: str,
    title: str,
    message: str,
    notif_type: str = "info",
    link: str = None
) -> Notification:
    notification = Notification(
        tenant_id=tenant_id,
        user_id=user_id,
        title=title,
        message=message,
        type=notif_type,
        link=link,
    )
    db.add(notification)
    await db.commit()
    return notification


async def check_card_due_notifications(db: AsyncSession, tenant_id: str, user_id: str) -> list[Notification]:
    notifications = []
    today = datetime.now().date()
    
    result = await db.execute(
        select(Card).where(Card.tenant_id == tenant_id, Card.is_active == True)
    )
    cards = result.scalars().all()
    
    for card in cards:
        due_date = today.replace(day=card.due_day) if card.due_day else None
        if due_date:
            days_until = (due_date - today).days
            
            if days_until == 3:
                notif = await create_notification(
                    db, tenant_id, user_id,
                    f"Fatura do {card.name} vence em 3 dias",
                    f"Não esqueça de pagar a fatura do cartão {card.name}",
                    "warning",
                    "/settings"
                )
                notifications.append(notif)
            elif days_until == 0:
                notif = await create_notification(
                    db, tenant_id, user_id,
                    f"Fatura do {card.name} vence hoje!",
                    f"O pagamento da fatura do cartão {card.name} deve ser feito hoje",
                    "error",
                    "/settings"
                )
                notifications.append(notif)
            elif days_until == 1:
                notif = await create_notification(
                    db, tenant_id, user_id,
                    f"Fatura do {card.name} vence amanhã",
                    f"Último dia para pagar a fatura do cartão {card.name}",
                    "warning",
                    "/settings"
                )
                notifications.append(notif)
    
    return notifications


async def check_goal_notifications(db: AsyncSession, tenant_id: str, user_id: str) -> list[Notification]:
    notifications = []
    
    result = await db.execute(
        select(Goal).where(Goal.tenant_id == tenant_id, Goal.is_active == True)
    )
    goals = result.scalars().all()
    
    for goal in goals:
        if goal.target_amount and goal.current_amount >= goal.target_amount:
            existing = await db.execute(
                select(Notification).where(
                    Notification.tenant_id == tenant_id,
                    Notification.title.like(f"%{goal.name}%"),
                    Notification.message.like("%meta alcançada%")
                )
            )
            if not existing.scalar_one_or_none():
                notif = await create_notification(
                    db, tenant_id, user_id,
                    f"🎉 Meta alcançada: {goal.name}!",
                    f"Você alcançou sua meta de R$ {goal.target_amount:,.2f} para {goal.name}",
                    "success",
                    "/goals"
                )
                notifications.append(notif)
        
        if goal.deadline:
            days_until = (goal.deadline.date() - datetime.now().date()).days
            if days_until == 7 and goal.current_amount < goal.target_amount:
                notif = await create_notification(
                    db, tenant_id, user_id,
                    f"Meta {goal.name} vence em 1 semana",
                    f"Sobram 7 dias para atingir sua meta de R$ {goal.target_amount:,.2f}",
                    "info",
                    "/goals"
                )
                notifications.append(notif)
    
    return notifications


async def check_subscription_due_notifications(db: AsyncSession, tenant_id: str, user_id: str) -> list[Notification]:
    notifications = []
    today = datetime.now().date()
    
    result = await db.execute(
        select(Subscription).where(Subscription.tenant_id == tenant_id, Subscription.is_active == True)
    )
    subs = result.scalars().all()
    
    for sub in subs:
        if sub.next_billing_date:
            days_until = (sub.next_billing_date.date() - today).days
            
            if days_until == 2:
                notif = await create_notification(
                    db, tenant_id, user_id,
                    f"Assinatura {sub.name} renovada em 2 dias",
                    f"A assinatura de R$ {sub.amount:,.2f} será debitada em breve",
                    "info",
                    "/subscriptions"
                )
                notifications.append(notif)
            elif days_until == 0:
                notif = await create_notification(
                    db, tenant_id, user_id,
                    f"Assinatura {sub.name} foi renovada",
                    f"Valor de R$ {sub.amount:,.2f} foi debitado",
                    "success",
                    "/subscriptions"
                )
                notifications.append(notif)
    
    return notifications


async def generate_all_notifications(db: AsyncSession, tenant_id: str, user_id: str) -> dict:
    card_notifs = await check_card_due_notifications(db, tenant_id, user_id)
    goal_notifs = await check_goal_notifications(db, tenant_id, user_id)
    sub_notifs = await check_subscription_due_notifications(db, tenant_id, user_id)
    
    return {
        "cards": len(card_notifs),
        "goals": len(goal_notifs),
        "subscriptions": len(sub_notifs),
        "total": len(card_notifs) + len(goal_notifs) + len(sub_notifs)
    }