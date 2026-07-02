from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+asyncpg://notiq:notiq_secret@localhost:5432/notiq_db"
    redis_url: str = "redis://localhost:6379"
    groq_api_key: str = ""
    openai_api_key: str = ""
    jwt_secret: str = "changeme"
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 7

    # AI cache TTLs (seconds)
    ai_cache_ttl: int = 7 * 24 * 60 * 60   # 7 days
    search_cache_ttl: int = 10 * 60          # 10 minutes
    session_ttl: int = 7 * 24 * 60 * 60     # 7 days


settings = Settings()
