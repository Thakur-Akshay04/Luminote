import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from typing import Dict, List

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.database import AsyncSessionLocal, init_db
from app.models.alert import Alert
from app.models.note import Note
from app.redis_client import close_redis
from app.routers import alerts, auth, notes, search

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


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
            logging.getLogger(__name__).error(f"Error in check_alerts_loop: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logging.getLogger(__name__).info("Initializing database...")
    await init_db()

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(notes.router)
app.include_router(search.router)
app.include_router(alerts.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "luminote-api"}
