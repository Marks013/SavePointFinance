from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_NAME: str = "Save Point Finanças"
    APP_ENV: str = "development"
    SECRET_KEY: str = "change_me"
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000"]

    DATABASE_URL: str = "postgresql+asyncpg://savepoint:changeme@localhost:5432/savepoint"
    REDIS_URL: str = "redis://localhost:6379/0"

    JWT_SECRET_KEY: str = "change_me_jwt"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    ANTHROPIC_API_KEY: str = ""

    META_TOKEN: str = ""
    META_PHONE_ID: str = ""
    META_VERIFY_TOKEN: str = "SavePoint_Verify_Token"


settings = Settings()
