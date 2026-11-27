import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
import mimetypes
import os
import secrets
import time
import uuid
from typing import Dict, List

import aiofiles
from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, StreamingResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware

from app.config import settings
from app.database import AsyncSessionLocal, check_db_health, init_db, sample_pool_metrics
from app.limiter import limiter
from app.models.alert import Alert
from app.models.note import Note
from app.observability import metrics, request_id_ctx, setup_logging
from app.redis_client import check_redis_health, close_redis, get_redis
from app.routers import alerts, audio, auth, checklist, notes, payments, search, tasks, users
from app.services.resilience import close_http_client

log_fmt = "json" if settings.env.lower() == "production" and settings.log_format == "text" else settings.log_format
setup_logging(log_format=log_fmt, log_level=settings.log_level)
logger = logging.getLogger("luminote")


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[uuid.UUID, List[WebSocket]] = {}

    async def connect(self, user_id: uuid.UUID, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.setdefault(user_id, []).append(websocket)

    def disconnect(self, user_id: uuid.UUID, websocket: WebSocket):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def broadcast_to_user(self, user_id: uuid.UUID, message: dict) -> bool:
        conns = self.active_connections.get(user_id)
        if not conns:
            return False
        sent = False
        for connection in list(conns):
            try:
                await connection.send_json(message)
                sent = True
            except Exception:
                pass
        return sent


async def check_alerts_loop(manager: ConnectionManager):
    """Poll due alerts only for users with active WebSockets on this worker."""
    while True:
        try:
            await asyncio.sleep(5)
            connected_users = list(manager.active_connections.keys())
            if not connected_users:
                continue

            now = datetime.now(timezone.utc)
            async with AsyncSessionLocal() as db:
                stmt = (
                    select(Alert, Note.title)
                    .outerjoin(Note, Alert.note_id == Note.id)
                    .where(
                        Alert.user_id.in_(connected_users),
                        Alert.alert_time <= now,
                        Alert.is_notified == False,
                    )
                    .with_for_update(of=Alert, skip_locked=True)
                )
                result = await db.execute(stmt)
                due_rows = result.all()

                notified_count = 0
                for alert, note_title in due_rows:
                    payload = {
                        "type": "alert",
                        "id": str(alert.id),
                        "title": alert.title,
                        "note_id": str(alert.note_id),
                        "note_title": note_title,
                        "alert_time": alert.alert_time.isoformat(),
                    }
                    if await manager.broadcast_to_user(alert.user_id, payload):
                        alert.is_notified = True
                        notified_count += 1

                if notified_count > 0:
                    await db.commit()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("Error in check_alerts_loop: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database...")
    try:
        await init_db()
        logger.info("Database initialized successfully.")
    except Exception as exc:
        logger.error("Failed to initialize database: %s", exc)

    try:
        from app.auth.clerk import get_jwks

        await get_jwks()
        logger.info("Clerk JWKS pre-fetched successfully.")
    except Exception as exc:
        logger.warning("Failed to pre-fetch Clerk JWKS on startup: %s", exc)

    media_base = os.path.join(os.path.dirname(os.path.dirname(__file__)), "media")
    os.makedirs(os.path.join(media_base, "audio"), exist_ok=True)
    os.makedirs(os.path.join(media_base, "uploads"), exist_ok=True)
    os.makedirs(os.path.join(media_base, "avatars"), exist_ok=True)

    app.state.alert_manager = ConnectionManager()
    app.state.alerts_task = asyncio.create_task(check_alerts_loop(app.state.alert_manager))
    yield
    app.state.alerts_task.cancel()
    try:
        await app.state.alerts_task
    except asyncio.CancelledError:
        pass
    await close_http_client()
    await close_redis()


app = FastAPI(
    title="Luminote API",
    version="1.0.0",
    description="AI-Powered Notes — summarization, semantic search, and Q&A",
    lifespan=lifespan,
)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def custom_rate_limit_handler(request: Request, exc: RateLimitExceeded):
    metrics.inc_counter("http_rate_limited_total", {"path": request.url.path})
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"detail": "Rate limit exceeded. Please slow down."},
        headers={"Retry-After": "60"},
    )


# ── Middleware Security Pipeline (strict execution order) ───────────────────

if settings.env.lower() == "production":
    app.add_middleware(HTTPSRedirectMiddleware)


class RequestSizeLimitMiddleware:
    """ASGI middleware enforcing max request body size even for chunked transfers."""

    def __init__(self, app, max_bytes: int = settings.max_request_body_bytes):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        content_length_raw = headers.get(b"content-length")
        if content_length_raw:
            try:
                if int(content_length_raw) > self.max_bytes:
                    resp = JSONResponse(status_code=413, content={"detail": "Request too large"})
                    await resp(scope, receive, send)
                    return
            except ValueError:
                resp = JSONResponse(status_code=400, content={"detail": "Invalid Content-Length header"})
                await resp(scope, receive, send)
                return

        received_bytes = 0

        async def limited_receive():
            nonlocal received_bytes
            message = await receive()
            if message["type"] == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > self.max_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="Request too large",
                    )
            return message

        try:
            await self.app(scope, limited_receive, send)
        except HTTPException as exc:
            if exc.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE:
                resp = JSONResponse(status_code=413, content={"detail": "Request too large"})
                await resp(scope, receive, send)
                return
            raise


app.add_middleware(RequestSizeLimitMiddleware, max_bytes=settings.max_request_body_bytes)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["X-Content-Type-Options"] = "nosniff"
        if not request.url.path.startswith("/media/"):
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Cache-Control"] = "no-store"
        else:
            response.headers["Cache-Control"] = "public, max-age=86400"
        return response


app.add_middleware(SecurityHeadersMiddleware)


class TimeoutMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            return await asyncio.wait_for(call_next(request), timeout=settings.request_timeout_seconds)
        except asyncio.TimeoutError:
            metrics.inc_counter("http_timeouts_total", {"path": request.url.path})
            return JSONResponse(status_code=504, content={"detail": "Request timed out"})


app.add_middleware(TimeoutMiddleware)


class ConnectionThrottlingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path.startswith("/media/") or request.url.path in ("/health", "/metrics"):
            return await call_next(request)

        try:
            redis = await get_redis()
            ip = request.client.host if request.client else "127.0.0.1"
            key = f"throttle:{ip}"
            count = await redis.incr(key)
            if count == 1:
                await redis.expire(key, 60)
            if count > 200:
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Too many requests"},
                    headers={"Retry-After": "60"},
                )
        except Exception as exc:
            logger.warning("IP throttling check skipped due to Redis error: %s", exc)

        return await call_next(request)


app.add_middleware(ConnectionThrottlingMiddleware)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())[:8]
        token = request_id_ctx.set(req_id)
        start = time.perf_counter()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-ID"] = req_id
            return response
        finally:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            metrics.inc_counter(
                "http_requests_total",
                {"method": request.method, "status": str(status_code)},
            )
            metrics.observe_latency("http_request_duration_ms", duration_ms)
            logger.info(
                "%s %s -> %d (%.2fms)",
                request.method,
                request.url.path,
                status_code,
                duration_ms,
            )
            request_id_ctx.reset(token)


app.add_middleware(RequestLoggingMiddleware)


allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
if settings.frontend_url and settings.frontend_url not in allowed_origins:
    allowed_origins.append(settings.frontend_url)

cors_kwargs: dict = {
    "allow_origins": allowed_origins,
    "allow_credentials": True,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
    "expose_headers": ["X-Next-Cursor", "X-Has-More", "X-Request-ID"],
}
if settings.env.lower() != "production":
    cors_kwargs["allow_origin_regex"] = r"https?://(localhost|127\.0\.0\.1)(:\d+)?"

app.add_middleware(CORSMiddleware, **cors_kwargs)


# ── Global Exception Handlers ────────────────────────────────────────────────

@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    metrics.inc_counter("db_errors_total")
    logger.exception("Database exception occurred: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=getattr(exc, "headers", None),
        )
    metrics.inc_counter("unhandled_errors_total")
    logger.exception("Unhandled server exception: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"},
    )


# ── Routers ────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(notes.router)
app.include_router(search.router)
app.include_router(alerts.router)
app.include_router(audio.router)
app.include_router(checklist.router)
app.include_router(tasks.router)
app.include_router(payments.router)


@app.api_route("/media/{path:path}", methods=["GET", "HEAD", "OPTIONS"])
async def serve_media(path: str, request: Request):
    if request.method == "OPTIONS":
        return Response(
            status_code=200,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Max-Age": "86400",
            },
        )

    media_base = os.path.realpath(os.path.join(os.path.dirname(os.path.dirname(__file__)), "media"))
    safe_relative_path = os.path.normpath(path).lstrip("/")
    file_path = os.path.realpath(os.path.join(media_base, safe_relative_path))

    if not file_path.startswith(media_base + os.sep):
        raise HTTPException(status_code=403, detail="Forbidden")

    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="File not found")

    file_size = os.path.getsize(file_path)

    content_type, _ = mimetypes.guess_type(file_path)
    if not content_type:
        content_type = "application/octet-stream"

    ext_types = {
        ".webm": "audio/webm",
        ".ogg": "audio/ogg",
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
    }
    for ext, mime in ext_types.items():
        if file_path.endswith(ext):
            content_type = mime
            break

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Type": content_type,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "*",
    }

    if request.method == "HEAD":
        headers["Content-Length"] = str(file_size)
        return Response(status_code=200, headers=headers, media_type=content_type)

    range_header = request.headers.get("range")
    if not range_header or not range_header.startswith("bytes="):
        async def full_file_iterator():
            async with aiofiles.open(file_path, "rb") as f:
                while chunk := await f.read(64 * 1024):
                    yield chunk

        headers["Content-Length"] = str(file_size)
        return StreamingResponse(full_file_iterator(), status_code=200, headers=headers, media_type=content_type)

    try:
        _, range_val = range_header.split("=", 1)
        start_str, end_str = range_val.split("-", 1)
        start_str, end_str = start_str.strip(), end_str.strip()

        if start_str:
            start = int(start_str)
            end = int(end_str) if end_str else file_size - 1
        else:
            start = file_size - int(end_str)
            end = file_size - 1

        if start < 0 or start >= file_size or end < start:
            raise ValueError()

        if end >= file_size:
            end = file_size - 1
    except ValueError:
        return StreamingResponse(
            iter([]),
            status_code=416,
            headers={
                "Content-Range": f"bytes */{file_size}",
                "Accept-Ranges": "bytes",
                "Access-Control-Allow-Origin": "*",
            },
        )

    content_length = (end - start) + 1
    headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
    headers["Content-Length"] = str(content_length)

    async def file_chunk_iterator(start_pos: int, length: int):
        async with aiofiles.open(file_path, "rb") as f:
            await f.seek(start_pos)
            remaining = length
            chunk_size = 64 * 1024
            while remaining > 0:
                chunk = await f.read(min(chunk_size, remaining))
                if not chunk:
                    break
                remaining -= len(chunk)
                yield chunk

    return StreamingResponse(
        file_chunk_iterator(start, content_length),
        status_code=206,
        headers=headers,
        media_type=content_type,
    )


@app.get("/health")
async def health():
    db_ok, redis_ok = await asyncio.gather(check_db_health(), check_redis_health())
    payload = {
        "status": "ok" if (db_ok and redis_ok) else "degraded",
        "service": "luminote-api",
        "checks": {
            "database": "up" if db_ok else "down",
            "redis": "up" if redis_ok else "down",
        },
    }
    code = status.HTTP_200_OK if db_ok else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(status_code=code, content=payload)


@app.get("/metrics", response_class=PlainTextResponse)
async def prometheus_metrics(request: Request):
    if settings.metrics_token:
        auth_header = request.headers.get("Authorization", "")
        expected = f"Bearer {settings.metrics_token}"
        if not secrets.compare_digest(auth_header, expected):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    sample_pool_metrics()
    return PlainTextResponse(metrics.render_prometheus(), media_type="text/plain; version=0.0.4")
