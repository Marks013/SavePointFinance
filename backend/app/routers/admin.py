"""
Admin Router — Accessible ONLY by users with role=superadmin.
Loaded as a separate router; all endpoints require require_superadmin dependency.
Frontend: admin.html (separate page, not linked in the user navbar).
"""
import uuid
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, EmailStr, validator

from app.database import get_db
from app.auth import require_superadmin, hash_password
from app.models.user import User, UserRole
from app.models.tenant import Tenant

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

# ── Plan constants ────────────────────────────────────────────────────────────────
PLAN_FEATURES = {
    "free": {
        "name": "Free",
        "price": 0,
        "max_users": 1,
        "max_accounts": 3,
        "max_categories": 10,
        "features": ["3 contas", "100 transações/mês", "Relatórios básicos"],
    },
    "pro": {
        "name": "Pro",
        "price": 19.90,
        "max_users": 5,
        "max_accounts": 999,
        "max_categories": 999,
        "features": ["Contas ilimitadas", "Transações ilimitadas", "Relatórios avançados", "Exportação", "IA classifier"],
    },
    "enterprise": {
        "name": "Enterprise",
        "price": 49.90,
        "max_users": 999,
        "max_accounts": 999,
        "max_categories": 999,
        "features": ["Tudo no Pro", "Multi-usuários", "API acesso", "Suporte prioritário", "Whatsapp bot"],
    },
}


# ── Schemas ───────────────────────────────────────────────────────────────────

class TenantUpdate(BaseModel):
    name: Optional[str] = None
    plan: Optional[str] = None
    max_users: Optional[int] = None
    is_active: Optional[bool] = None
    expires_at: Optional[datetime] = None


class UserAdminUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    new_password: Optional[str] = None


class CreateSuperadminRequest(BaseModel):
    name: str
    email: EmailStr
    password: str
    secret_key: str


class PlanChangeRequest(BaseModel):
    plan: str
    expires_at: Optional[datetime] = None
    
    @validator("plan")
    def validate_plan(cls, v):
        if v not in PLAN_FEATURES:
            raise ValueError(f"Plano inválido. Opções: {', '.join(PLAN_FEATURES.keys())}")
        return v


class PlanResponse(BaseModel):
    id: str
    name: str
    price: float
    max_users: int
    max_accounts: int
    max_categories: int
    features: List[str]


# ── Plan endpoints ───────────────────────────────────────────────────────────────

@router.get("/plans", response_model=List[PlanResponse])
async def list_plans(
    _: User = Depends(require_superadmin),
):
    """List all available plans with their features."""
    return [
        PlanResponse(id=plan_id, **features)
        for plan_id, features in PLAN_FEATURES.items()
    ]


@router.post("/tenants/{tenant_id}/plan")
async def change_tenant_plan(
    tenant_id: uuid.UUID,
    body: PlanChangeRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    """Change tenant plan with proper validation and limits."""
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")
    
    old_plan = tenant.plan
    new_plan = body.plan
    
    plan_info = PLAN_FEATURES[new_plan]
    
    # Check user count vs new plan limit
    user_count_result = await db.execute(
        select(func.count(User.id)).where(
            User.tenant_id == tenant_id, User.is_active == True
        )
    )
    user_count = user_count_result.scalar() or 0
    
    if user_count > plan_info["max_users"]:
        raise HTTPException(
            status_code=400,
            detail=f"Este plano suporta até {plan_info['max_users']} usuário(s), mas o workspace tem {user_count} usuário(s) ativo(s). Upgrade primeiro os usuários para um plano superior."
        )
    
    # Check account count vs new plan limit
    from app.models.account import Account
    acc_count_result = await db.execute(
        select(func.count(Account.id)).where(Account.tenant_id == tenant_id)
    )
    account_count = acc_count_result.scalar() or 0
    
    if account_count > plan_info["max_accounts"]:
        raise HTTPException(
            status_code=400,
            detail=f"Este plano suporta até {plan_info['max_accounts']} conta(s), mas o workspace tem {account_count} conta(s). Remova contas primeiro para fazer o downgrade."
        )
    
    # Check category count vs new plan limit
    from app.models.category import Category
    cat_count_result = await db.execute(
        select(func.count(Category.id)).where(Category.tenant_id == tenant_id)
    )
    category_count = cat_count_result.scalar() or 0
    
    if category_count > plan_info["max_categories"]:
        raise HTTPException(
            status_code=400,
            detail=f"Este plano suporta até {plan_info['max_categories']} categoria(s), mas o workspace tem {category_count} categoria(s). Remova categorias primeiro para fazer o downgrade."
        )
    
    # Apply plan change
    tenant.plan = new_plan
    tenant.max_users = plan_info["max_users"]
    
    # Handle expiration
    if body.expires_at:
        tenant.expires_at = body.expires_at
    elif body.expires_at is None and old_plan == "free" and new_plan != "free":
        # First paid plan: set expiration to 30 days from now
        tenant.expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    
    await db.commit()
    await db.refresh(tenant)
    
    return {
        "id": str(tenant.id),
        "name": tenant.name,
        "plan": tenant.plan,
        "max_users": tenant.max_users,
        "expires_at": tenant.expires_at.isoformat() if tenant.expires_at else None,
        "message": f"Plano alterado de '{old_plan}' para '{new_plan}' com sucesso.",
    }


# ── Tenant endpoints ──────────────────────────────────────────────────────────

@router.get("/tenants")
async def list_tenants(
    search: Optional[str] = None,
    active_only: bool = False,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    q = select(Tenant)
    if search:
        q = q.where(Tenant.name.ilike(f"%{search}%"))
    if active_only:
        q = q.where(Tenant.is_active == True)

    total_q = await db.execute(select(func.count()).select_from(Tenant))
    total = total_q.scalar()

    result = await db.execute(q.order_by(Tenant.created_at.desc()).offset(skip).limit(limit))
    tenants = result.scalars().all()

    output = []
    for t in tenants:
        user_count = await db.execute(
            select(func.count(User.id)).where(
                User.tenant_id == t.id, User.is_active == True
            )
        )
        output.append({
            "id": str(t.id),
            "name": t.name,
            "slug": t.slug,
            "plan": t.plan,
            "max_users": t.max_users,
            "active_users": user_count.scalar() or 0,
            "is_active": t.is_active,
            "expires_at": t.expires_at.isoformat() if t.expires_at else None,
            "created_at": t.created_at.isoformat(),
        })
    return {"total": total, "items": output}


@router.get("/tenants/{tenant_id}")
async def get_tenant(
    tenant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")

    users_result = await db.execute(
        select(User).where(User.tenant_id == tenant_id).order_by(User.name)
    )
    users = users_result.scalars().all()

    from app.models.account import Account
    from app.models.category import Category
    
    user_count = await db.execute(
        select(func.count(User.id)).where(User.tenant_id == tenant_id, User.is_active == True)
    )
    acc_count = await db.execute(
        select(func.count(Account.id)).where(Account.tenant_id == tenant_id)
    )
    cat_count = await db.execute(
        select(func.count(Category.id)).where(Category.tenant_id == tenant_id)
    )

    return {
        "id": str(tenant.id),
        "name": tenant.name,
        "slug": tenant.slug,
        "plan": tenant.plan,
        "max_users": tenant.max_users,
        "is_active": tenant.is_active,
        "expires_at": tenant.expires_at.isoformat() if tenant.expires_at else None,
        "created_at": tenant.created_at.isoformat(),
        "user_count": user_count.scalar() or 0,
        "account_count": acc_count.scalar() or 0,
        "category_count": cat_count.scalar() or 0,
        "available_plans": [
            {"id": pid, **features} for pid, features in PLAN_FEATURES.items()
        ],
        "users": [
            {
                "id": str(u.id),
                "name": u.name,
                "email": u.email,
                "role": u.role,
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat(),
            }
            for u in users
        ],
    }


@router.patch("/tenants/{tenant_id}")
async def update_tenant(
    tenant_id: uuid.UUID,
    body: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tenant, field, value)

    await db.commit()
    await db.refresh(tenant)
    return {
        "id": str(tenant.id),
        "name": tenant.name,
        "plan": tenant.plan,
        "max_users": tenant.max_users,
        "is_active": tenant.is_active,
        "expires_at": tenant.expires_at.isoformat() if tenant.expires_at else None,
        "message": "Workspace atualizado com sucesso.",
    }


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Workspace não encontrado")
    await db.delete(tenant)
    await db.commit()
    return {"message": "Workspace excluído com sucesso."}


# ── User endpoints ────────────────────────────────────────────────────────────

@router.get("/users")
async def list_all_users(
    search: Optional[str] = None,
    tenant_id: Optional[uuid.UUID] = None,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    q = select(User)
    if search:
        q = q.where(User.email.ilike(f"%{search}%") | User.name.ilike(f"%{search}%"))
    if tenant_id:
        q = q.where(User.tenant_id == tenant_id)

    total_q = await db.execute(select(func.count()).select_from(User))
    total = total_q.scalar()

    result = await db.execute(q.order_by(User.created_at.desc()).offset(skip).limit(limit))
    users = result.scalars().all()

    return {
        "total": total,
        "items": [
            {
                "id": str(u.id),
                "name": u.name,
                "email": u.email,
                "role": u.role,
                "tenant_id": str(u.tenant_id),
                "is_active": u.is_active,
                "created_at": u.created_at.isoformat(),
                "last_login": u.last_login.isoformat() if u.last_login else None,
                "login_count": u.login_count or 0,
            }
            for u in users
        ],
    }


@router.patch("/users/{user_id}")
async def update_user_admin(
    user_id: uuid.UUID,
    body: UserAdminUpdate,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_superadmin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    dump = body.model_dump(exclude_unset=True)
    new_password = dump.pop("new_password", None)

    # Validate email uniqueness
    if "email" in dump:
        dup = await db.execute(
            select(User).where(User.email == dump["email"].lower(), User.id != user_id)
        )
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="E-mail já em uso por outro usuário.")
        dump["email"] = dump["email"].lower()

    for field, value in dump.items():
        setattr(user, field, value)

    if new_password:
        if len(new_password) < 6:
            raise HTTPException(status_code=400, detail="Senha deve ter no mínimo 6 caracteres.")
        user.password_hash = hash_password(new_password)

    await db.commit()
    await db.refresh(user)
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "is_active": user.is_active,
        "message": "Usuário atualizado com sucesso.",
    }


@router.delete("/users/{user_id}")
async def delete_user_admin(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(require_superadmin),
):
    if user_id == current_admin.id:
        raise HTTPException(status_code=400, detail="Você não pode excluir sua própria conta.")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    await db.delete(user)
    await db.commit()
    return {"message": "Usuário excluído com sucesso."}


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def platform_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_superadmin),
):
    total_tenants = (await db.execute(select(func.count()).select_from(Tenant))).scalar()
    active_tenants = (
        await db.execute(select(func.count()).select_from(Tenant).where(Tenant.is_active == True))
    ).scalar()
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar()
    active_users = (
        await db.execute(
            select(func.count()).select_from(User).where(User.is_active == True)
        )
    ).scalar()

    from app.models.transaction import Transaction
    total_tx = (await db.execute(select(func.count()).select_from(Transaction))).scalar()

    # Expiring soon (within 30 days)
    now = datetime.now(timezone.utc)
    from datetime import timedelta
    expiring_soon = (
        await db.execute(
            select(func.count()).select_from(Tenant).where(
                Tenant.expires_at != None,
                Tenant.expires_at > now,
                Tenant.expires_at < now + timedelta(days=30),
                Tenant.is_active == True,
            )
        )
    ).scalar()

    expired = (
        await db.execute(
            select(func.count()).select_from(Tenant).where(
                Tenant.expires_at != None,
                Tenant.expires_at < now,
                Tenant.is_active == True,
            )
        )
    ).scalar()

    return {
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "total_users": total_users,
        "active_users": active_users,
        "total_transactions": total_tx,
        "expiring_soon_30d": expiring_soon,
        "expired_tenants": expired,
        "plans_breakdown": {
            "free": (await db.execute(select(func.count()).select_from(Tenant).where(Tenant.plan == "free"))).scalar() or 0,
            "pro": (await db.execute(select(func.count()).select_from(Tenant).where(Tenant.plan == "pro"))).scalar() or 0,
            "enterprise": (await db.execute(select(func.count()).select_from(Tenant).where(Tenant.plan == "enterprise"))).scalar() or 0,
        },
        "roles_breakdown": {
            "superadmin": (await db.execute(select(func.count()).select_from(User).where(User.role == UserRole.superadmin))).scalar() or 0,
            "admin": (await db.execute(select(func.count()).select_from(User).where(User.role == UserRole.admin))).scalar() or 0,
            "member": (await db.execute(select(func.count()).select_from(User).where(User.role == UserRole.member))).scalar() or 0,
        },
    }


# ── Bootstrap superadmin (run ONCE) ──────────────────────────────────────────

@router.post("/bootstrap", status_code=201, include_in_schema=False)
async def bootstrap_superadmin(
    body: CreateSuperadminRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    One-time endpoint to create the first superadmin.
    Requires a SECRET_KEY env var to prevent unauthorized use.
    Disable or remove after first use.
    """
    from app.config import settings
    if body.secret_key != settings.SECRET_KEY:
        raise HTTPException(status_code=403, detail="Chave secreta incorreta.")

    existing = await db.execute(select(User).where(User.role == UserRole.superadmin))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400, detail="Super-administrador já existe."
        )

    # Superadmin gets its own tenant (platform workspace)
    slug = "platform-admin-" + secrets.token_hex(4)
    tenant = Tenant(name="Platform Admin", slug=slug)
    db.add(tenant)
    await db.flush()

    user = User(
        tenant_id=tenant.id,
        email=body.email.lower(),
        name=body.name,
        password_hash=hash_password(body.password),
        role=UserRole.superadmin,
    )
    db.add(user)
    await db.commit()
    return {"message": "Super-administrador criado com sucesso.", "email": user.email}
