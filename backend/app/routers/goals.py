from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict
from decimal import Decimal
from datetime import date

from app.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.goal import Goal
from app.services.goal_service import add_to_goal, check_goal_notifications

router = APIRouter(prefix="/api/v1/goals", tags=["goals"])

# Schemas
class GoalBase(BaseModel):
    name: str = Field(..., max_length=100)
    target_amount: Decimal = Field(..., gt=0)
    current_amount: Decimal = Field(default=0)
    account_id: UUID | None = None
    deadline: date | None = None
    color: str = Field(default="#3B82F6", max_length=7)
    icon: str | None = None

class GoalCreate(GoalBase):
    notify_on_complete: bool = True
    notify_on_milestone_25: bool = False
    notify_on_milestone_50: bool = False
    notify_on_milestone_75: bool = False
    notify_on_deadline: bool = True

class GoalUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    target_amount: Decimal | None = Field(default=None, gt=0)
    current_amount: Decimal | None = Field(default=None, ge=0)
    account_id: UUID | None = None
    deadline: date | None = None
    color: str | None = Field(default=None, max_length=7)
    icon: str | None = None
    notify_on_complete: bool | None = None
    notify_on_milestone_25: bool | None = None
    notify_on_milestone_50: bool | None = None
    notify_on_milestone_75: bool | None = None
    notify_on_deadline: bool | None = None

class GoalDeposit(BaseModel):
    amount: Decimal = Field(..., gt=0)
    description: str | None = None

class GoalResponse(GoalBase):
    id: UUID
    notify_on_complete: bool = True
    notify_on_milestone_25: bool = False
    notify_on_milestone_50: bool = False
    notify_on_milestone_75: bool = False
    notify_on_deadline: bool = True
    is_completed: bool = False
    completed_at: date | None = None
    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=List[GoalResponse])
async def list_goals(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Goal)
        .where(Goal.tenant_id == current_user.tenant_id)
        .order_by(Goal.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(
    goal_in: GoalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    goal = Goal(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        **goal_in.model_dump()
    )
    db.add(goal)
    await db.commit()
    await db.refresh(goal)
    return goal


@router.put("/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: UUID,
    goal_in: GoalUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.tenant_id == current_user.tenant_id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="meta não encontrada")

    old_amount = goal.current_amount
    update_data = goal_in.model_dump(exclude_unset=True)
    
    # Track if current_amount is being updated
    new_amount = update_data.get('current_amount')
    
    for key, value in update_data.items():
        setattr(goal, key, value)

    await db.commit()
    await db.refresh(goal)
    
    # Check notifications if amount changed
    if new_amount is not None and new_amount != old_amount:
        await check_goal_notifications(goal, old_amount, new_amount, db)
    
    return goal


@router.post("/{goal_id}/deposit", response_model=GoalResponse)
async def deposit_to_goal(
    goal_id: UUID,
    deposit: GoalDeposit,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deposit money to a goal."""
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.tenant_id == current_user.tenant_id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="Meta não encontrada")
    
    if goal.is_completed:
        raise HTTPException(status_code=400, detail="Meta já foi completada")
    
    old_amount = goal.current_amount
    goal.current_amount += deposit.amount
    
    await db.commit()
    await db.refresh(goal)
    
    await check_goal_notifications(goal, old_amount, goal.current_amount, db)
    
    return goal


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    goal_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Goal).where(Goal.id == goal_id, Goal.tenant_id == current_user.tenant_id)
    )
    goal = result.scalar_one_or_none()
    if not goal:
        raise HTTPException(status_code=404, detail="meta não encontrada")

    await db.delete(goal)
    await db.commit()
    return None
