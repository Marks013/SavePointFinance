"""
config.py — Configurações da aplicação

Preparado para:
  - Coolify + Oracle Cloud Free Tier (ARM64 / x86_64)
  - HTTPS via Traefik do Coolify (SSL termination no proxy)
  - Cookies httpOnly + Secure
  - Headers de proxy confiáveis (X-Forwarded-For, X-Forwarded-Proto)
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from typing import List, Any, Optional
import json


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────────────
    APP_NAME: str = "Save Point Finanças"
    APP_ENV: str = "production"

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    # ── Segurança ────────────────────────────────────────────────────
    SECRET_KEY: str
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Cookies seguros (True em produção com HTTPS via Coolify/Traefik)
    # O Coolify SEMPRE usa HTTPS, então este valor deve ser "true" em prod
    SECURE_COOKIES: bool = True

    # ── CORS ─────────────────────────────────────────────────────────
    # Aceita: string CSV, JSON array ou lista Python
    ALLOWED_ORIGINS: Any = ""

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Any) -> List[str]:
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return []
            if v.startswith("["):
                return json.loads(v)
            # Comma-separated
            return [i.strip() for i in v.split(",") if i.strip()]
        return []

    # ── Banco de dados ────────────────────────────────────────────────
    # DATABASE_URL é injetado diretamente pelo docker-compose.yml
    # construído a partir de POSTGRES_* — não precisa definir no .env
    DATABASE_URL: Optional[str] = None
    POSTGRES_DB:       str = "savepoint"
    POSTGRES_USER:     str = "savepoint"
    POSTGRES_PASSWORD: str = "U35mOyNY"
    POSTGRES_HOST:     str = "postgres"   # nome do container Docker

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def assemble_db_url(cls, v: Optional[str], info) -> str:
        if v:
            return v
        data = info.data
        user = data.get("POSTGRES_USER", "savepoint")
        pwd  = data.get("POSTGRES_PASSWORD", "U35mOyNY")
        host = data.get("POSTGRES_HOST", "postgres")
        db   = data.get("POSTGRES_DB", "savepoint")
        return f"postgresql+asyncpg://{user}:{pwd}@{host}:5432/{db}"

    # ── Redis ─────────────────────────────────────────────────────────
    # REDIS_URL também é injetado pelo docker-compose.yml
    REDIS_URL:      Optional[str] = None
    REDIS_PASSWORD: str = ""
    REDIS_HOST:     str = "redis"   # nome do container Docker

    @field_validator("REDIS_URL", mode="before")
    @classmethod
    def assemble_redis_url(cls, v: Optional[str], info) -> str:
        if v:
            return v
        pwd  = info.data.get("REDIS_PASSWORD", "U35mOyNY")
        host = info.data.get("REDIS_HOST", "redis")
        auth = f":{pwd}@" if pwd else ""
        return f"redis://{auth}{host}:6379/0"

    # ── IA / APIs externas ────────────────────────────────────────────
    ANTHROPIC_API_KEY: str = ""

    # ── WhatsApp (Meta Cloud API) ─────────────────────────────────────
    META_TOKEN:        str = ""
    META_PHONE_ID:     str = ""
    WHATSAPP_VERIFY_TOKEN: str = "savepoint_whatsapp_verify"

    # ── Backup Backblaze B2 ───────────────────────────────────────────
    B2_APPLICATION_KEY_ID: str = ""
    B2_APPLICATION_KEY:    str = ""
    B2_BUCKET_NAME:        str = "savepoint-backups"
    BACKUP_RETENTION_DAYS: int = 30


settings = Settings()
