import uuid
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.config import settings
from app.database import get_db
from app.models.user import User, UserRole

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(
        {**data, "exp": expire, "type": "access"},
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def create_refresh_token(data: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode(
        {**data, "exp": expire, "type": "refresh"},
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sua sessão expirou ou é inválida. Faça login novamente."
        )


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Get current authenticated user from token."""
    token = None
    
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    else:
        token = request.cookies.get("access_token")
    
    if not token:
        raise HTTPException(status_code=401, detail="Usuário não autenticado. Faça login para continuar.")
    
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Token de sessão inválido.")

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Token de acesso inválido ou expirado.")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuário não encontrado ou inativo")

    if user.role == UserRole.admin:
        return user

    from app.models.tenant import Tenant
    tenant_res = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = tenant_res.scalar_one_or_none()
    if tenant:
        if not tenant.is_active:
            raise HTTPException(status_code=403, detail="Conta suspensa. Contate o suporte.")
        
        # Check trial expiration for "free" plan
        if tenant.plan == "free":
            if tenant.trial_expires_at:
                now = datetime.now(timezone.utc)
                if tenant.trial_expires_at < now:
                    # Calculate days past expiration
                    days_past = (now - tenant.trial_expires_at).days
                    raise HTTPException(
                        status_code=403,
                        detail={
                            "error": "trial_expired",
                            "message": "Seu período de teste expirou. Assine o plano PRO para continuar usando o SavePoint Finance.",
                            "expired_at": tenant.trial_expires_at.isoformat(),
                        }
                    )
            else:
                # Trial not set - set it now
                from datetime import timedelta
                now = datetime.now(timezone.utc)  # FIX: define now in this scope
                tenant.trial_start = now
                tenant.trial_expires_at = now + timedelta(days=tenant.trial_days)
                await db.commit()
        
        # Check regular expiration (for any other plans with expiry)
        elif tenant.expires_at and tenant.expires_at < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=403,
                detail="Assinatura expirada. Renove para continuar usando o Save Point Finanças.",
            )

    return user


# Alias for get_current_user - both can be used as dependencies
require_user = get_current_user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.admin:
        raise HTTPException(status_code=403, detail="Acesso de administrador necessário")
    return current_user


# Alias - admin can access superadmin endpoints
require_superadmin = require_admin