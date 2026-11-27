import logging
import secrets

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

    # Runtime environment
    env: str = "development"
    log_level: str = "INFO"
    log_format: str = "text"

    # Database — no hardcoded credentials; must be provided via environment
    database_url: str = "postgresql+asyncpg://localhost:5432/notiq_db"
    run_db_migrations: bool = True
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_pool_timeout: int = 10
    db_pool_recycle: int = 1800
    db_command_timeout: float = 15.0
    db_statement_timeout_ms: int = 15000
    db_idle_in_tx_timeout_ms: int = 30000
    db_ssl_require: bool = False

    # Redis
    redis_url: str = "redis://localhost:6379"
    redis_max_connections: int = 50
    redis_socket_timeout: float = 3.0

    # API keys — must be provided via environment, no defaults
    groq_api_key: str = ""
    hf_api_key: str = ""

    # AI model configuration
    groq_whisper_model: str = "whisper-large-v3-turbo"
    groq_task_model: str = "openai/gpt-oss-120b"

    # JWT — secret generated securely in dev if not provided via env; required in production
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 7

    # Clerk Authentication
    clerk_secret_key: str = ""
    clerk_jwks_url: str = ""

    # Razorpay Payment Gateway
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    razorpay_timeout_seconds: float = 15.0

    # Email / SendGrid
    sendgrid_api_key: str = ""
    sendgrid_from_email: str = "noreply@luminote.com"

    # URLs
    frontend_url: str = "http://localhost:3000"
    backend_url: str = "http://localhost:8000"

    # Request limits & timeouts
    request_timeout_seconds: float = 30.0
    max_request_body_bytes: int = 10 * 1024 * 1024
    metrics_token: str = ""

    # AI cache TTLs (seconds)
    ai_cache_ttl: int = 7 * 24 * 60 * 60       # 7 days
    search_cache_ttl: int = 10 * 60              # 10 minutes
    session_ttl: int = 7 * 24 * 60 * 60         # 7 days
    media_cache_ttl: int = 7 * 24 * 60 * 60     # 7 days (transcripts)
    checklist_cache_ttl: int = 1 * 24 * 60 * 60  # 1 day

    def model_post_init(self, __context: object) -> None:
        """Ensure jwt_secret is populated securely and enforce production requirements."""
        if not self.jwt_secret:
            if self.env.lower() == "production":
                raise ValueError("JWT_SECRET environment variable must be set when ENV=production")
            object.__setattr__(self, "jwt_secret", _generate_jwt_secret())


settings = Settings()
