"""
Goal Service — Handles goal notifications and tracking.
"""
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.goal import Goal
from app.models.user import User
from app.services.alert_service import send_whatsapp_message


async def check_goal_notifications(goal: Goal, old_amount: Decimal, new_amount: Decimal, db: AsyncSession) -> None:
    """
    Check if any notification milestones have been reached and send alerts.
    """
    if not goal.user_id:
        return
    
    user_result = await db.execute(select(User).where(User.id == goal.user_id))
    user = user_result.scalar_one_or_none()
    if not user or not user.whatsapp_number:
        return
    
    old_pct = (old_amount / goal.target_amount * 100) if goal.target_amount > 0 else 0
    new_pct = (new_amount / goal.target_amount * 100) if goal.target_amount > 0 else 0
    
    messages = []
    
    # Check completion
    if new_amount >= goal.target_amount and old_amount < goal.target_amount:
        if goal.notify_on_complete:
            messages.append(
                f"🎉 *Meta Conquistada!*\n\n"
                f"Parabéns! Você alcançou sua meta *{goal.name}*!\n"
                f"Valor: R$ {new_amount:,.2f} de R$ {goal.target_amount:,.2f}"
            )
            goal.is_completed = True
            goal.completed_at = datetime.now(timezone.utc)
    
    # Check milestone 75%
    if new_pct >= 75 and old_pct < 75:
        if goal.notify_on_milestone_75:
            messages.append(
                f"🚀 *75% da Meta!*n\n"
                f"Sua meta *{goal.name}* está em 75%.\n"
                f"Faltam R$ {goal.target_amount - new_amount:,.2f}"
            )
    
    # Check milestone 50%
    if new_pct >= 50 and old_pct < 50:
        if goal.notify_on_milestone_50:
            messages.append(
                f"💪 *Metade do Caminho!*\n"
                f"Sua meta *{goal.name}* atingiu 50%.\n"
                f"Faltam R$ {goal.target_amount - new_amount:,.2f}"
            )
    
    # Check milestone 25%
    if new_pct >= 25 and old_pct < 25:
        if goal.notify_on_milestone_25:
            messages.append(
                f"🌟 *Primeiro Passo!*\n"
                f"Sua meta *{goal.name}* atingiu 25%.\n"
                f"Faltam R$ {goal.target_amount - new_amount:,.2f}"
            )
    
    # Send all messages
    for msg in messages:
        await send_whatsapp_message(user.whatsapp_number, msg)
    
    if messages:
        goal.last_notified_at = datetime.now(timezone.utc)
        await db.commit()


async def check_deadline_approaching(goal: Goal, db: AsyncSession) -> list[str]:
    """
    Check if goal deadline is approaching and return notification messages.
    Called by a scheduled job.
    """
    if not goal.deadline or goal.is_completed or not goal.notify_on_deadline:
        return []
    
    if not goal.user_id:
        return []
    
    user_result = await db.execute(select(User).where(User.id == goal.user_id))
    user = user_result.scalar_one_or_none()
    if not user or not user.whatsapp_number:
        return []
    
    from datetime import date, timedelta
    days_left = (goal.deadline - date.today()).days
    
    messages = []
    
    if days_left == 7:
        messages.append(
            f"⏰ *Meta com 7 dias!*\n\n"
            f"Falta 1 semana para o prazo da meta *{goal.name}*.\n"
            f"Progresso: R$ {goal.current_amount:,.2f} de R$ {goal.target_amount:,.2f}\n"
            f"Faltam: R$ {goal.target_amount - goal.current_amount:,.2f}"
        )
    elif days_left == 1:
        messages.append(
            f"🔥 *Último Dia!*\n\n"
            f"A meta *{goal.name}* vence amanhã!\n"
            f"Você está a R$ {goal.target_amount - goal.current_amount:,.2f} do objetivo"
        )
    elif days_left == 0:
        messages.append(
            f"📅 *Vence Hoje!*\n\n"
            f"O prazo para meta *{goal.name}* é hoje!\n"
            f"Progresso: {int(goal.current_amount / goal.target_amount * 100)}%"
        )
    
    for msg in messages:
        await send_whatsapp_message(user.whatsapp_number, msg)
    
    if messages:
        goal.last_notified_at = datetime.now(timezone.utc)
        await db.commit()
    
    return messages


async def add_to_goal(goal_id: uuid.UUID, amount: Decimal, db: AsyncSession) -> Goal:
    """
    Add amount to a goal and check for notifications.
    """
    result = await db.execute(select(Goal).where(Goal.id == goal_id))
    goal = result.scalar_one_or_none()
    if not goal:
        raise ValueError("Meta não encontrada")
    
    old_amount = goal.current_amount
    goal.current_amount += amount
    
    await db.commit()
    await db.refresh(goal)
    
    await check_goal_notifications(goal, old_amount, goal.current_amount, db)
    
    return goal
