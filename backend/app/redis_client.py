import asyncio
import logging
import redis.asyncio as aioredis

from app.config import settings
from app.observability import metrics

logger = logging.getLogger(__name__)

_redis_pool: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """Return the shared Redis connection pool with bounded connections and timeouts."""
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=settings.redis_max_connections,
            socket_timeout=settings.redis_socket_timeout,
            socket_connect_timeout=settings.redis_socket_timeout,
            health_check_interval=30,
            retry_on_timeout=True,
        )
    await asyncio.sleep(0)
    return _redis_pool


async def close_redis() -> None:
    """Close the Redis pool cleanly on shutdown."""
    global _redis_pool
    if _redis_pool is not None:
        await _redis_pool.aclose()
        _redis_pool = None


async def check_redis_health() -> bool:
    """Ping Redis to verify connectivity."""
    try:
        redis = await get_redis()
        return bool(await redis.ping())  # type: ignore[misc]
    except Exception as exc:
        logger.warning("Redis health check failed: %s", exc)
        return False


async def redis_get_safe(key: str, cache_name: str = "generic") -> str | None:
    """Best-effort Redis GET that degrades gracefully on outages."""
    try:
        redis = await get_redis()
        val = await redis.get(key)
        if val is not None:
            metrics.inc_counter("cache_hits_total", {"cache": cache_name})
        else:
            metrics.inc_counter("cache_misses_total", {"cache": cache_name})
        return val
    except Exception as exc:
        metrics.inc_counter("cache_errors_total", {"cache": cache_name})
        logger.warning("Redis GET degraded for %s: %s", cache_name, exc)
        return None


async def redis_setex_safe(key: str, ttl: int, value: str, cache_name: str = "generic") -> None:
    """Best-effort Redis SETEX that degrades gracefully on outages."""
    try:
        redis = await get_redis()
        await redis.setex(key, ttl, value)
    except Exception as exc:
        metrics.inc_counter("cache_errors_total", {"cache": cache_name})
        logger.warning("Redis SETEX degraded for %s: %s", cache_name, exc)


async def redis_delete_safe(*keys: str, cache_name: str = "generic") -> None:
    """Best-effort Redis DELETE that degrades gracefully on outages."""
    if not keys:
        return
    try:
        redis = await get_redis()
        await redis.delete(*keys)
    except Exception as exc:
        metrics.inc_counter("cache_errors_total", {"cache": cache_name})
        logger.warning("Redis DELETE degraded for %s: %s", cache_name, exc)


async def get_search_version(user_id: str) -> str:
    """Return per-user search cache generation version (O(1) invalidation)."""
    val = await redis_get_safe(f"user:{user_id}:search_ver", cache_name="search_ver")
    return val or "0"


async def bump_search_version(user_id: str) -> None:
    """Increment per-user search cache version so stale search results expire in O(1)."""
    try:
        redis = await get_redis()
        key = f"user:{user_id}:search_ver"
        await redis.incr(key)
        await redis.expire(key, settings.search_cache_ttl * 2)
    except Exception as exc:
        logger.warning("Failed to bump search version for user %s: %s", user_id, exc)
