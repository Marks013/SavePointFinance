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
    """Create a new workspace (tenant) + admin user."""
    # BUG FIX: Prevent duplicate users — normalize email to lower-case
    existing = await db.execute(select(User).where(User.email == body.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Este e-mail já está cadastrado. Tente fazer login ou recuperar sua senha.",
        )

    slug = body.workspace_name.lower().replace(" ", "-")[:40] + "-" + secrets.token_hex(4)
    tenant = Tenant(name=body.workspace_name, slug=slug)
    db.add(tenant)
    await db.flush()  # get tenant.id

    user = User(
        tenant_id=tenant.id,
        email=body.email.lower(),
        name=body.name,
        password_hash=hash_password(body.password),
        role=UserRole.admin,
    )
    db.add(user)
    await db.commit()

    # Auto-seed default categories for the new workspace
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

    # Check tenant subscription (superadmin bypasses)
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
async def me(current_user: User = Depends(get_current_user)):
    return {
        "id": str(current_user.id),
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "tenant_id": str(current_user.tenant_id),
    }


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """
    Generate a password-reset token.
    In production: send via e-mail. For now the token is also returned in the
    response (visible on screen) so the system is usable without SMTP.
    """
    result = await db.execute(select(User).where(User.email == body.email.lower()))
    user = result.scalar_one_or_none()

    # Always respond 200 to prevent user enumeration
    if not user:
        return {
            "message": "Se este e-mail estiver cadastrado você receberá as instruções."
        }

    token = secrets.token_urlsafe(32)
    user.reset_token = token
    user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=2)
    await db.commit()

    return {
        "message": "Token de redefinição gerado.",
        # ⚠️ Remove `reset_token` from the response when SMTP is configured.
        "reset_token": token,
        "expires_in_minutes": 120,
    }


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.reset_token == body.token))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="Token inválido.")
    if not user.reset_token_expires or user.reset_token_expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token expirado. Solicite um novo.")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="A senha deve ter no mínimo 6 caracteres.")

    user.password_hash = hash_password(body.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    await db.commit()
    return {"message": "Senha redefinida com sucesso. Faça login com a nova senha."}


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Senha atual incorreta.")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="A nova senha deve ter no mínimo 6 caracteres.")
    current_user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"message": "Senha alterada com sucesso."}


@router.post("/invite")
async def create_invite(
    email: EmailStr,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(status_code=403, detail="Apenas admins podem convidar usuários.")

    # Check max users for this tenant
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

    # Prevent duplicate registration
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


@router.post("/invite/accept", response_model=TokenResponse, status_code=201)
async def accept_invite(body: InviteAcceptRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Invite).where(Invite.token == body.token, Invite.used == False)
    )
    invite = result.scalar_one_or_none()
    if not invite or invite.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Convite inválido ou expirado.")

    # Prevent duplicate
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
