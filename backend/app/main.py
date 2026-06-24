import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.redis_client import close_redis
from app.routers import auth, notes, search

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logging.getLogger(__name__).info("Initializing database...")
    await init_db()
    yield
    # Shutdown
    await close_redis()


app = FastAPI(
    title="Notiq API",
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


@app.get("/health")
async def health():
    return {"status": "ok", "service": "notiq-api"}
