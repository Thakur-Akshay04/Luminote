import secrets
import logging

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


def _generate_jwt_secret() -> str:
    """Generate a cryptographically secure random JWT secret and log a warning."""
    logger.warning(
        "JWT_SECRET is not set! A random secret has been generated for this session. "
        "This means all existing tokens will be invalidated on restart. "
        "Set the JWT_SECRET environment variable for production use."
    )
    return secrets.token_urlsafe(64)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database — no hardcoded credentials; must be provided via environment
    database_url: str = "postgresql+asyncpg://localhost:5432/notiq_db"
    redis_url: str = "redis://localhost:6379"

    # API keys — must be provided via environment, no defaults
    groq_api_key: str = ""
    hf_api_key: str = ""

    # AI model configuration
    groq_whisper_model: str = "whisper-large-v3-turbo"
    groq_task_model: str = "qwen/qwen3.6-27b"

    # JWT — secret generated securely if not provided via env
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 7

    # AI cache TTLs (seconds)
    ai_cache_ttl: int = 7 * 24 * 60 * 60       # 7 days
    search_cache_ttl: int = 10 * 60              # 10 minutes
    session_ttl: int = 7 * 24 * 60 * 60         # 7 days
    media_cache_ttl: int = 7 * 24 * 60 * 60     # 7 days (drawings, transcripts)
    checklist_cache_ttl: int = 1 * 24 * 60 * 60  # 1 day

    def model_post_init(self, __context: object) -> None:
        """Ensure jwt_secret is always populated with a secure value."""
        if not self.jwt_secret:
            object.__setattr__(self, "jwt_secret", _generate_jwt_secret())


settings = Settings()
