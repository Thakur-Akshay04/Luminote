import asyncio
import logging
import time
from typing import Any, Awaitable, Callable, TypeVar

import httpx
from fastapi import HTTPException, status
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from app.observability import metrics

logger = logging.getLogger(__name__)
T = TypeVar("T")


class CircuitBreakerOpenError(Exception):
    """Raised when an external service circuit breaker is open."""

    def __init__(self, service_name: str, retry_after: float):
        self.service_name = service_name
        self.retry_after = retry_after
        super().__init__(f"Circuit breaker open for {service_name}; retry after {retry_after:.1f}s")


class CircuitBreaker:
    """Lightweight async-safe circuit breaker (closed -> open -> half_open)."""

    _STATE_VALUES = {"closed": 0.0, "half_open": 1.0, "open": 2.0}

    def __init__(
        self,
        name: str,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
    ) -> None:
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self._failure_count = 0
        self._state = "closed"
        self._opened_at = 0.0
        self._lock = asyncio.Lock()
        metrics.set_gauge("circuit_breaker_state", 0.0, {"service": self.name})

    @property
    def state(self) -> str:
        return self._state

    def _set_state(self, new_state: str) -> None:
        if self._state != new_state:
            logger.warning("Circuit breaker '%s' transitioned %s -> %s", self.name, self._state, new_state)
        self._state = new_state
        metrics.set_gauge("circuit_breaker_state", self._STATE_VALUES[new_state], {"service": self.name})

    async def allow_request(self) -> None:
        async with self._lock:
            if self._state == "open":
                elapsed = time.monotonic() - self._opened_at
                if elapsed >= self.recovery_timeout:
                    self._set_state("half_open")
                else:
                    metrics.inc_counter("circuit_breaker_rejected_total", {"service": self.name})
                    raise CircuitBreakerOpenError(self.name, self.recovery_timeout - elapsed)

    async def record_success(self) -> None:
        async with self._lock:
            self._failure_count = 0
            if self._state != "closed":
                self._set_state("closed")

    async def record_failure(self) -> None:
        async with self._lock:
            self._failure_count += 1
            if self._state == "half_open" or self._failure_count >= self.failure_threshold:
                self._opened_at = time.monotonic()
                self._set_state("open")

    async def call(self, fn: Callable[[], Awaitable[T]]) -> T:
        await self.allow_request()
        try:
            result = await fn()
            await self.record_success()
            return result
        except CircuitBreakerOpenError:
            raise
        except Exception:
            await self.record_failure()
            raise


groq_breaker = CircuitBreaker("groq", failure_threshold=5, recovery_timeout=30.0)
hf_breaker = CircuitBreaker("huggingface", failure_threshold=3, recovery_timeout=60.0)
razorpay_breaker = CircuitBreaker("razorpay", failure_threshold=5, recovery_timeout=30.0)


_http_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    """Return a shared, connection-pooled httpx.AsyncClient."""
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=15.0, write=10.0, pool=5.0),
            limits=httpx.Limits(max_connections=30, max_keepalive_connections=15),
        )
    return _http_client


async def close_http_client() -> None:
    """Close the shared httpx.AsyncClient cleanly on shutdown."""
    global _http_client
    if _http_client is not None and not _http_client.is_closed:
        await _http_client.aclose()
        _http_client = None


def _is_retryable_exception(exc: BaseException) -> bool:
    """Do not retry when circuit breaker is open or client sent invalid input (4xx)."""
    if isinstance(exc, CircuitBreakerOpenError):
        return False
    if isinstance(exc, HTTPException) and 400 <= exc.status_code < 500:
        return False
    return True


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=8),
    retry=retry_if_exception(_is_retryable_exception),
    reraise=True,
)
async def call_groq_chat(
    messages: list[Any],
    model: str,
    temperature: float = 0.3,
    max_tokens: int = 1024,
    timeout: float = 20.0,
):
    """Shared Groq chat completion helper with circuit breaker, timeout, and retries."""
    from app.groq_client import client

    async def _invoke():
        return await asyncio.wait_for(
            client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            ),
            timeout=timeout,
        )

    try:
        return await groq_breaker.call(_invoke)
    except CircuitBreakerOpenError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service temporarily unavailable — please try again shortly",
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="AI service timed out",
        )
