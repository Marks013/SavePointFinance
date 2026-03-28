"""
auth.py — Autenticação JWT via cookie httpOnly

Mudança v3.1: cookie secure=True quando SECURE_COOKIES=true (produção Coolify/HTTPS).
"""

import uuid
from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.config import settings
from app.database import get_db
from app.models.user import User, UserRole

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)

COOKIE_NAME = "sp_token"

# Cookie duration
ACCESS_MAX_AGE  = 60 * settings.ACCESS_TOKEN_EXPIRE_MINUTES
REFRESH_MAX_AGE = 60 * 60 * 24 * settings.REFRESH_TOKEN_EXPIRE_DAYS


# ── Password helpers ──────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── Token helpers ─────────────────────────────────────────────────────────────

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
            detail="Token inválido ou expirado",
        )


def _set_auth_cookies(response, access_token: str, refresh_token: str) -> None:
    """
    Define os cookies de autenticação com as configurações corretas de segurança.

    Em produção (Coolify + HTTPS):
      - secure=True  → cookie só vai por HTTPS
      - samesite=lax → protege contra CSRF em navegações cross-site
      - httponly=True → JavaScript não acessa o cookie

    Em desenvolvimento local (HTTP):
      - secure=False  → permite funcionar sem HTTPS
    """
    secure = settings.SECURE_COOKIES

    response.set_cookie(
        key=COOKIE_NAME,
        value=access_token,
        httponly=True,
        samesite="lax",
        secure=secure,
        max_age=ACCESS_MAX_AGE,
        path="/",
    )
    response.set_cookie(
        key="sp_refresh",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=secure,
        max_age=REFRESH_MAX_AGE,
        path="/",
    )


def _delete_auth_cookies(response) -> None:
    """Remove os cookies de autenticação."""
    response.delete_cookie(COOKIE_NAME, path="/")
    response.delete_cookie("sp_refresh", path="/")


# ── Bearer (JSON API) auth ────────────────────────────────────────────────────

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Autenticação necessária")
    payload = decode_token(credentials.credentials)
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Tipo de token inválido")
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Token malformado")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuário não encontrado ou inativo")

    if user.role == UserRole.superadmin:
        return user

    await _check_tenant(user, db)
    return user


# ── Cookie (HTML views) auth ──────────────────────────────────────────────────

async def _resolve_user_from_token(token: str, db: AsyncSession) -> User | None:
    """Decodifica JWT e carrega usuário do banco."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        return None

    if payload.get("type") != "access":
        return None

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        return None

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        return None

    if user.role != UserRole.superadmin:
        try:
            await _check_tenant(user, db)
        except HTTPException:
            return None

    return user


async def _check_tenant(user: User, db: AsyncSession) -> None:
    """Verifica se o tenant do usuário está ativo e não expirou."""
    from app.models.tenant import Tenant
    tenant_res = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = tenant_res.scalar_one_or_none()
    if not tenant or not tenant.is_active:
        raise HTTPException(status_code=403, detail="Conta suspensa.")
    if tenant.expires_at and tenant.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=403, detail="Assinatura expirada.")


async def get_current_user_cookie(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    """Dependency para rotas HTML: lê JWT do cookie httpOnly."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise _redirect_to_login(request)

    user = await _resolve_user_from_token(token, db)
    if not user:
        raise _redirect_to_login(request)

    return user


async def get_optional_user_cookie(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Como get_current_user_cookie mas retorna None em vez de redirecionar."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    return await _resolve_user_from_token(token, db)


def _redirect_to_login(request: Request):
    """Redireciona para /login — funciona para browser e HTMX."""
    if request.headers.get("HX-Request"):
        raise HTTPException(
            status_code=200,
            headers={"HX-Redirect": "/login"},
            detail="Login necessário",
        )
    raise HTTPException(status_code=302, headers={"Location": "/login"})


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in (UserRole.admin, UserRole.superadmin):
        raise HTTPException(status_code=403, detail="Acesso de administrador necessário")
    return current_user


async def require_superadmin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.superadmin:
        raise HTTPException(status_code=403, detail="Acesso restrito ao super-administrador")
    return current_user


async def require_superadmin_cookie(current_user: User = Depends(get_current_user_cookie)) -> User:
    if current_user.role != UserRole.superadmin:
        raise HTTPException(status_code=303, headers={"Location": "/dashboard"})
    return current_user


# ── Exports para views.py ─────────────────────────────────────────────────────
__all__ = [
    "COOKIE_NAME",
    "hash_password", "verify_password",
    "create_access_token", "create_refresh_token", "decode_token",
    "_set_auth_cookies", "_delete_auth_cookies",
    "get_current_user", "get_current_user_cookie",
    "get_optional_user_cookie",
    "require_admin", "require_superadmin", "require_superadmin_cookie",
]
