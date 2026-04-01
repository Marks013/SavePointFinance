import uuid
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel, EmailStr
from app.database import get_db
from app.models.user import User, Invite, UserRole
from app.models.tenant import Tenant
from app.auth import (
    hash_password, verify_password,
    create_access_token, create_refresh_token,
    decode_token, get_current_user,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    workspace_name: str
    name: str
    email: EmailStr
    password: str
    confirm_password: str
    
    def model_post_init(self, __context):
        if self.password != self.confirm_password:
            raise HTTPException(
                status_code=400,
                detail="As senhas não conferem. Por favor, digite a mesma senha nos dois campos.",
            )
        if len(self.password) < 6:
            raise HTTPException(
                status_code=400,
                detail="A senha deve ter pelo menos 6 caracteres.",
            )


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class InviteAcceptRequest(BaseModel):
    token: str
    name: str
    password: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Create a new workspace (tenant) + member user."""
    existing = await db.execute(select(User).where(User.email == body.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Este e-mail já está cadastrado. Tente fazer login ou recuperar sua senha.",
        )

    slug = body.workspace_name.lower().replace(" ", "-")[:40] + "-" + secrets.token_hex(4)
    tenant = Tenant(name=body.workspace_name, slug=slug)
    db.add(tenant)
    await db.flush()

    user = User(
        tenant_id=tenant.id,
        email=body.email.lower(),
        name=body.name,
        password_hash=hash_password(body.password),
        role=UserRole.member,
    )
    db.add(user)
    await db.commit()

    from app.routers.categories import _seed_defaults
    await _seed_defaults(str(tenant.id), db)

    token_data = {"sub": str(user.id), "tenant_id": str(tenant.id)}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="E-mail ou senha incorretos")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Conta inativa. Contate o administrador.")

    if user.role != UserRole.superadmin:
        tenant_res = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
        tenant = tenant_res.scalar_one_or_none()
        if tenant:
            if not tenant.is_active:
                raise HTTPException(status_code=403, detail="Conta suspensa. Contate o suporte.")
            if tenant.expires_at and tenant.expires_at < datetime.now(timezone.utc):
                raise HTTPException(
                    status_code=403,
                    detail="Assinatura expirada. Entre em contato para renovar.",
                )

    # Track login statistics
    user.last_login = datetime.now(timezone.utc)
    user.login_count += 1
    await db.commit()

    token_data = {"sub": str(user.id), "tenant_id": str(user.tenant_id)}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(refresh_token: str, db: AsyncSession = Depends(get_db)):
    payload = decode_token(refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Tipo de token inválido")
    token_data = {"sub": payload["sub"], "tenant_id": payload["tenant_id"]}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.get("/me")
async def get_me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant = result.scalar_one_or_none()
    return {
        "id": str(current_user.id),
        "name": current_user.name,
        "email": current_user.email,
        "role": current_user.role.value if hasattr(current_user.role, 'value') else current_user.role,
        "tenant_id": str(current_user.tenant_id),
        "tenant_name": tenant.name if tenant else None,
        "tenant_plan": tenant.plan if tenant else None,
    }


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Request password reset link."""
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()
    if not user:
        return {"message": "Se o e-mail existir, você receberá um link de recuperação."}
    
    user.reset_token = secrets.token_urlsafe(32)
    user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=24)
    await db.commit()
    
    # TODO: Send email with reset link
    return {"message": "Se o e-mail existir, você receberá um link de recuperação."}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Reset password using token."""
    result = await db.execute(select(User).where(User.reset_token == body.token))
    user = result.scalar_one_or_none()
    if not user or not user.reset_token_expires or user.reset_token_expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token expirado ou inválido. Faça login novamente.")
    
    user.password_hash = hash_password(body.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    await db.commit()
    
    return {"message": "Senha alterada com sucesso."}


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Change own password."""
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Senha atual incorreta.")
    
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Nova senha deve ter pelo menos 6 caracteres.")
    
    current_user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"message": "Senha alterada com sucesso."}


@router.post("/invite")
async def create_invite(
    email: EmailStr,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create an invite link for a new user."""
    if current_user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(status_code=403, detail="Apenas admins podem convidar usuários.")

    count_res = await db.execute(
        select(func.count(User.id)).where(
            User.tenant_id == current_user.tenant_id,
            User.is_active == True,
        )
    )
    active_count = count_res.scalar() or 0

    tenant_res = await db.execute(select(Tenant).where(Tenant.id == current_user.tenant_id))
    tenant = tenant_res.scalar_one_or_none()
    if tenant and active_count >= tenant.max_users:
        raise HTTPException(
            status_code=400,
            detail=f"Limite de {tenant.max_users} usuários atingido. Faça upgrade do plano.",
        )

    existing = await db.execute(select(User).where(User.email == email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Este e-mail já possui uma conta.")

    token = secrets.token_urlsafe(48)
    invite = Invite(
        tenant_id=current_user.tenant_id,
        email=email.lower(),
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(invite)
    await db.commit()
    return {"invite_token": token, "email": email, "expires_in_days": 7}


@router.get("/invites")
async def list_invites(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List active invites for this tenant."""
    if current_user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(status_code=403, detail="Apenas admins podem listar convites.")
    
    result = await db.execute(
        select(Invite).where(
            Invite.tenant_id == current_user.tenant_id,
            Invite.used == False,
            Invite.expires_at > datetime.now(timezone.utc),
        ).order_by(Invite.created_at.desc())
    )
    invites = result.scalars().all()
    
    return [
        {
            "id": str(i.id),
            "email": i.email,
            "token": i.token,
            "expires_at": i.expires_at.isoformat(),
            "created_at": i.created_at.isoformat(),
        }
        for i in invites
    ]


@router.delete("/invites/{invite_id}")
async def revoke_invite(
    invite_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke an invite."""
    if current_user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(status_code=403, detail="Apenas admins podem revogar convites.")
    
    result = await db.execute(
        select(Invite).where(Invite.id == invite_id, Invite.tenant_id == current_user.tenant_id)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(status_code=404, detail="Convite não encontrado.")
    
    await db.delete(invite)
    await db.commit()
    return {"message": "Convite revogado com sucesso."}


@router.post("/invite/accept", response_model=TokenResponse, status_code=201)
async def accept_invite(body: InviteAcceptRequest, db: AsyncSession = Depends(get_db)):
    """Accept an invite and create account."""
    result = await db.execute(
        select(Invite).where(Invite.token == body.token, Invite.used == False)
    )
    invite = result.scalar_one_or_none()
    if not invite or invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Convite inválido ou expirado.")

    existing = await db.execute(select(User).where(User.email == invite.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="E-mail já cadastrado.")

    user = User(
        tenant_id=invite.tenant_id,
        email=invite.email,
        name=body.name,
        password_hash=hash_password(body.password),
        role=UserRole.member,
    )
    db.add(user)
    invite.used = True
    await db.commit()

    token_data = {"sub": str(user.id), "tenant_id": str(user.tenant_id)}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.get("/users")
async def list_tenant_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all users in the current tenant."""
    result = await db.execute(
        select(User).where(User.tenant_id == current_user.tenant_id).order_by(User.name)
    )
    users = result.scalars().all()
    
    return [
        {
            "id": str(u.id),
            "name": u.name,
            "email": u.email,
            "role": u.role.value if hasattr(u.role, 'value') else u.role,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat(),
            "last_login": u.last_login.isoformat() if u.last_login else None,
            "login_count": u.login_count or 0,
        }
        for u in users
    ]


@router.patch("/users/{user_id}/role")
async def update_user_role(
    user_id: uuid.UUID,
    new_role: UserRole,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update user role within tenant. Admins can promote members."""
    # Get target user
    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # Verify same tenant
    if target_user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Usuário de outro workspace")
    
    # Only admins can change roles
    if current_user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(status_code=403, detail="Apenas admins podem alterar funções")
    
    # Superadmin can set any role
    if current_user.role == UserRole.superadmin:
        target_user.role = new_role
    else:
        # Tenant admin can only promote members to admin, not superadmin
        if new_role == UserRole.superadmin:
            raise HTTPException(status_code=403, detail="Não é possível atribuir superadmin")
        if target_user.role == UserRole.superadmin:
            raise HTTPException(status_code=403, detail="Não é possível alterar superadmin")
        target_user.role = new_role
    
    await db.commit()
    return {"message": "Função atualizada", "role": target_user.role.value}


@router.patch("/users/{user_id}/active")
async def toggle_user_active(
    user_id: uuid.UUID,
    is_active: bool,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Activate or deactivate a user within tenant."""
    # Get target user
    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    if not target_user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # Verify same tenant
    if target_user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Usuário de outro workspace")
    
    # Only admins can change active status
    if current_user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(status_code=403, detail="Apenas admins podem ativar/desativar usuários")
    
    # Cannot deactivate yourself
    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Não é possível desativar sua própria conta")
    
    target_user.is_active = is_active
    await db.commit()
    return {"message": f"Usuário {'ativado' if is_active else 'desativado'}"}
