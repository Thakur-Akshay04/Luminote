import asyncio
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from typing import Dict, List

from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware

from app.config import settings
from app.database import AsyncSessionLocal, init_db
from app.limiter import limiter
from app.models.alert import Alert
from app.models.note import Note
from app.redis_client import close_redis, get_redis
from app.routers import alerts, audio, auth, checklist, drawing, notes, search, tasks, users

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("luminote")


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[uuid.UUID, List[WebSocket]] = {}

    async def connect(self, user_id: uuid.UUID, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, user_id: uuid.UUID, websocket: WebSocket):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def broadcast_to_user(self, user_id: uuid.UUID, message: dict):
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass


async def check_alerts_loop(manager: ConnectionManager):
    from datetime import datetime, timezone
    while True:
        try:
            await asyncio.sleep(5)  # Check every 5 seconds
            now = datetime.now(timezone.utc)
            async with AsyncSessionLocal() as db:
                stmt = (
                    select(Alert, Note.title)
                    .outerjoin(Note, Alert.note_id == Note.id)
                    .where(Alert.alert_time <= now, Alert.is_notified == False)
                )
                result = await db.execute(stmt)
                due_rows = result.all()

                for row in due_rows:
                    alert, note_title = row
                    payload = {
                        "type": "alert",
                        "id": str(alert.id),
                        "title": alert.title,
                        "note_id": str(alert.note_id),
                        "note_title": note_title,
                        "alert_time": alert.alert_time.isoformat(),
                    }
                    await manager.broadcast_to_user(alert.user_id, payload)
                    alert.is_notified = True

                if due_rows:
                    await db.commit()
        except Exception as e:
            logger.exception("Error in check_alerts_loop: %s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Initializing database...")
    await init_db()

    # Ensure media directories exist
    media_base = os.path.join(os.path.dirname(os.path.dirname(__file__)), "media")
    os.makedirs(os.path.join(media_base, "drawings"), exist_ok=True)
    os.makedirs(os.path.join(media_base, "audio"), exist_ok=True)
    os.makedirs(os.path.join(media_base, "uploads"), exist_ok=True)
    os.makedirs(os.path.join(media_base, "avatars"), exist_ok=True)

    # Setup connection manager and start background alert checker
    app.state.alert_manager = ConnectionManager()
    app.state.alerts_task = asyncio.create_task(check_alerts_loop(app.state.alert_manager))
    yield
    # Shutdown
    app.state.alerts_task.cancel()
    await close_redis()


app = FastAPI(
    title="Luminote API",
    version="1.0.0",
    description="AI-Powered Notes — summarization, semantic search, and Q&A",
    lifespan=lifespan,
)

# SlowAPI Limiter state & handler
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def custom_rate_limit_handler(request: Request, exc: RateLimitExceeded):
    response = _rate_limit_exceeded_handler(request, exc)
    response.headers["Retry-After"] = "60"
    return response


# ── Middleware Security Pipeline (strict execution order) ───────────────────

# 1. CORS Middleware — explicit origin whitelist
allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://luminote.yourdomain.com",
]
if settings.frontend_url and settings.frontend_url not in allowed_origins:
    allowed_origins.append(settings.frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# 2. HTTPS Redirect Middleware (production only)
if os.getenv("ENV") == "production":
    app.add_middleware(HTTPSRedirectMiddleware)


# 3. Request Size Limit Middleware (DDoS protection — reject > 10MB)
class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > 10 * 1024 * 1024:  # 10MB
            return JSONResponse(status_code=413, content={"detail": "Request too large"})
        return await call_next(request)

app.add_middleware(RequestSizeLimitMiddleware)


# 4. HTTP Security Headers Middleware (HSTS, nosniff, frame protection, no-store cache)
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Cache-Control"] = "no-store"
        return response

app.add_middleware(SecurityHeadersMiddleware)


# 5. Timeout Middleware (30s global request timeout protection)
class TimeoutMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            return await asyncio.wait_for(call_next(request), timeout=30.0)
        except asyncio.TimeoutError:
            return JSONResponse(
                status_code=504,
                content={"detail": "Request timed out"}
            )

app.add_middleware(TimeoutMiddleware)


# 6. IP Throttling Middleware (200 requests/min connection ceiling via Redis)
class ConnectionThrottlingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Exclude static files and health checks from heavy IP throttling
        if request.url.path.startswith("/media/") or request.url.path == "/health":
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
                    headers={"Retry-After": "60"}
                )
        except Exception as e:
            logger.warning("IP throttling check skipped due to Redis error: %s", e)

        return await call_next(request)

app.add_middleware(ConnectionThrottlingMiddleware)


# 7. Request Logging & Audit Middleware (Scrubs authorization/tokens/passwords/keys)
class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())[:8]
        start = time.time()

        response = await call_next(request)

        duration = round((time.time() - start) * 1000, 2)
        # Never log Authorization header, tokens, or body payloads
        logger.info(
            f"[{request_id}] {request.method} {request.url.path} "
            f"→ {response.status_code} ({duration}ms)"
        )
        return response

app.add_middleware(RequestLoggingMiddleware)


# ── Global Exception Handlers (Prevent raw database error disclosure) ─────

@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.exception("Database exception occurred: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"}
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    if isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
            headers=getattr(exc, "headers", None)
        )
    logger.exception("Unhandled server exception: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error"}
    )


# ── Routers ────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(notes.router)
app.include_router(search.router)
app.include_router(alerts.router)
app.include_router(drawing.router)
app.include_router(audio.router)
app.include_router(checklist.router)
app.include_router(tasks.router)

# Static file serving for /media/
media_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "media")
os.makedirs(media_path, exist_ok=True)
app.mount("/media", StaticFiles(directory=media_path), name="media")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "luminote-api"}
