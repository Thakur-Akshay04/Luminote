from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Create all tables, enable pgvector extension, and run migrations."""
    async with engine.begin() as conn:
        await conn.execute(
            __import__("sqlalchemy").text("CREATE EXTENSION IF NOT EXISTS vector")
        )
        from app.models import user, note, alert  # noqa: F401 — register models
        await conn.run_sync(Base.metadata.create_all)

        # ── Schema migration for Features 1–4 (idempotent) ───────────────────
        migration_sql = """
        ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_type VARCHAR(20) DEFAULT 'text';
        ALTER TABLE notes ADD COLUMN IF NOT EXISTS media_url TEXT;
        ALTER TABLE notes ADD COLUMN IF NOT EXISTS transcript TEXT;
        ALTER TABLE notes ADD COLUMN IF NOT EXISTS checklist_items JSONB;
        ALTER TABLE notes ADD COLUMN IF NOT EXISTS chat_history JSONB;
        CREATE INDEX IF NOT EXISTS idx_notes_note_type ON notes (note_type);
        CREATE INDEX IF NOT EXISTS idx_notes_checklist ON notes USING GIN (checklist_items);
        """
        for stmt in migration_sql.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                await conn.execute(__import__("sqlalchemy").text(stmt))

