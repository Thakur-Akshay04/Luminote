import asyncio
import logging
import time
from typing import Any, Awaitable, Callable, TypeVar

import groq
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


def is_permanent_provider_error(exc: BaseException) -> bool:
    """Classify request-specific client/input errors (400/404/422) that should neither retry nor trip breakers."""
    if isinstance(exc, HTTPException) and 400 <= exc.status_code < 500:
        return True
    if isinstance(exc, (groq.BadRequestError, groq.UnprocessableEntityError)):
        return True
    if isinstance(exc, groq.APIStatusError) and exc.status_code in (400, 404, 422):
        return True
    if isinstance(exc, httpx.HTTPStatusError) and exc.response is not None and exc.response.status_code in (400, 404, 422):
        return True
    return False


def is_retryable_provider_error(exc: BaseException) -> bool:
    """
    Retry only transient Exception subclasses.
    Excludes asyncio.CancelledError / non-Exception control flow, open breakers, and 400/422 input errors.
    """
    if not isinstance(exc, Exception):
        return False
    if isinstance(exc, CircuitBreakerOpenError):
        return False
    if is_permanent_provider_error(exc):
        return False
    return True


class CircuitBreaker:
    """
    Generation-aware async circuit breaker (closed -> open -> half_open).

    - Tracks generations so late completions from pre-open requests cannot close an open circuit.
    - Limits half-open state to a single in-flight probe request.
    """

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
        self._generation = 0
        self._half_open_in_flight = False
        self._lock = asyncio.Lock()
        metrics.set_gauge("circuit_breaker_state", 0.0, {"service": self.name})

    @property
    def state(self) -> str:
        return self._state

    @property
    def generation(self) -> int:
        return self._generation

    def _set_state(self, new_state: str) -> None:
        if self._state != new_state:
            logger.warning("Circuit breaker '%s' transitioned %s -> %s", self.name, self._state, new_state)
        self._state = new_state
        if new_state == "open":
            self._generation += 1
        metrics.set_gauge("circuit_breaker_state", self._STATE_VALUES[new_state], {"service": self.name})

    async def allow_request(self) -> int:
        async with self._lock:
            if self._state == "open":
                elapsed = time.monotonic() - self._opened_at
                if elapsed >= self.recovery_timeout:
                    self._set_state("half_open")
                    self._half_open_in_flight = True
                    return self._generation
                metrics.inc_counter("circuit_breaker_rejected_total", {"service": self.name})
                raise CircuitBreakerOpenError(self.name, self.recovery_timeout - elapsed)

            if self._state == "half_open":
                if self._half_open_in_flight:
                    metrics.inc_counter("circuit_breaker_rejected_total", {"service": self.name})
                    raise CircuitBreakerOpenError(self.name, 1.0)
                self._half_open_in_flight = True
                return self._generation

            return self._generation

    async def record_success(self, generation: int | None = None) -> None:
        async with self._lock:
            if generation is not None and generation != self._generation:
                return
            self._failure_count = 0
            self._half_open_in_flight = False
            if self._state != "closed":
                self._set_state("closed")

    async def record_failure(self, generation: int | None = None) -> None:
        async with self._lock:
            if generation is not None and generation != self._generation:
                return
            self._half_open_in_flight = False
            self._failure_count += 1
            if self._state == "half_open" or self._failure_count >= self.failure_threshold:
                self._opened_at = time.monotonic()
                self._set_state("open")

    async def release_probe(self, generation: int) -> None:
        """Release half-open reservation on cancellation or permanent client error without tripping."""
        async with self._lock:
            if generation == self._generation and self._state == "half_open":
                self._half_open_in_flight = False

    async def call(self, fn: Callable[[], Awaitable[T]]) -> T:
        generation = await self.allow_request()
        try:
            result = await fn()
        except CircuitBreakerOpenError:
            raise
        except Exception as exc:
            if is_permanent_provider_error(exc):
                await self.release_probe(generation)
            else:
                await self.record_failure(generation)
            raise
        except BaseException:
            await self.release_probe(generation)
            raise
        await self.record_success(generation)
        return result


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


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=8),
    retry=retry_if_exception(is_retryable_provider_error),
    reraise=True,
)
async def _call_groq_chat_with_retry(
    messages: list[Any],
    model: str,
    temperature: float = 0.3,
    max_tokens: int = 1024,
    timeout: float = 20.0,
):
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

    return await groq_breaker.call(_invoke)


async def call_groq_chat(
    messages: list[Any],
    model: str,
    temperature: float = 0.3,
    max_tokens: int = 1024,
    timeout: float = 20.0,
):
    """Shared Groq chat completion helper with circuit breaker, timeout, and non-retrying fast fail."""
    try:
        return await _call_groq_chat_with_retry(
            messages=messages,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
            timeout=timeout,
        )
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
    except (groq.BadRequestError, groq.UnprocessableEntityError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid input for AI processing",
        )
