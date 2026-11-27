from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import settings

# Shared rate limiter using Redis with automatic in-memory fallback on Redis outage
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.redis_url,
    storage_options={
        "socket_connect_timeout": settings.redis_socket_timeout,
        "socket_timeout": settings.redis_socket_timeout,
    },
    default_limits=["100/minute"],
    in_memory_fallback_enabled=True,
    swallow_errors=True,
)
