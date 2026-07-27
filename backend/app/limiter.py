from slowapi import Limiter
from slowapi.util import get_remote_address
from app.config import settings

# Shared rate limiter instance using Redis backend
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.redis_url,
    default_limits=["100/minute"]
)
