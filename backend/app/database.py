import logging
from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings
from app.observability import metrics

logger = logging.getLogger(__name__)


def _build_connect_args(database_url: str) -> dict[str, Any]:
    """Build asyncpg timeout and TLS options when using PostgreSQL."""
    if "asyncpg" not in database_url:
        return {}
    args: dict[str, Any] = {
        "command_timeout": settings.db_command_timeout,
        "server_settings": {
            "statement_timeout": str(settings.db_statement_timeout_ms),
            "idle_in_transaction_session_timeout": str(settings.db_idle_in_tx_timeout_ms),
        },
    }
    if settings.db_ssl_require:
        args["ssl"] = "require"
    return args


def _build_engine():
    is_sqlite = settings.database_url.startswith("sqlite")
    kwargs: dict[str, Any] = {
        "echo": False,
        "pool_pre_ping": True,
    }
    if not is_sqlite:
        kwargs.update(
            {
                "pool_size": settings.db_pool_size,
                "max_overflow": settings.db_max_overflow,
                "pool_timeout": settings.db_pool_timeout,
                "pool_recycle": settings.db_pool_recycle,
                "connect_args": _build_connect_args(settings.database_url),
            }
        )
    return create_async_engine(settings.database_url, **kwargs)


engine = _build_engine()


def _attach_pool_metrics() -> None:
    """Track SQLAlchemy pool usage gauges for observability."""
    sync_pool = engine.sync_engine.pool

    def _update_gauges() -> None:
        if hasattr(sync_pool, "checkedout"):
            metrics.set_gauge("db_pool_checked_out", float(sync_pool.checkedout()))
        if hasattr(sync_pool, "overflow"):
            metrics.set_gauge("db_pool_overflow", float(sync_pool.overflow()))
        if hasattr(sync_pool, "size"):
            metrics.set_gauge("db_pool_size", float(sync_pool.size()))

    @event.listens_for(engine.sync_engine, "checkout")
    def _on_checkout(dbapi_conn, conn_record, conn_proxy):
        _update_gauges()

    @event.listens_for(engine.sync_engine, "checkin")
    def _on_checkin(dbapi_conn, conn_record):
        _update_gauges()


_attach_pool_metrics()

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a database session and guarantees cleanup."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def check_db_health() -> bool:
    """Run a lightweight connectivity check against PostgreSQL."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.warning("Database health check failed: %s", exc)
        return False


async def init_db() -> None:
    """Create tables, enable pgvector, and apply idempotent schema/index migrations when enabled."""
    if not settings.run_db_migrations:
        logger.info("RUN_DB_MIGRATIONS=false — skipping startup DDL (runtime least-privilege mode).")
        return

    async with engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        from app.models import alert, credit_transaction, note, user  # noqa: F401 — register models

        await conn.run_sync(Base.metadata.create_all)

        # Ensure embedding column matches 384 dims
        try:
            result = await conn.execute(
                text(
                    "SELECT atttypmod FROM pg_attribute WHERE attrelid = 'notes'::regclass AND attname = 'embedding'"
                )
            )
            row = result.fetchone()
            if row and row[0] != 384:
                await conn.execute(text("DROP INDEX IF EXISTS idx_notes_embedding_hnsw"))
                await conn.execute(text("ALTER TABLE notes DROP COLUMN IF EXISTS embedding"))
                await conn.execute(text("ALTER TABLE notes ADD COLUMN embedding vector(384)"))
        except Exception as exc:
            logger.debug("Embedding column dimension check skipped: %s", exc)

        migration_stmts = [
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id TEXT UNIQUE",
            "CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users (clerk_user_id)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT",
            """
            DO $$
            BEGIN
              IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='password_hash') THEN
                ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
              END IF;
            END $$;
            """,
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT true",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(50)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_balance INTEGER NOT NULL DEFAULT 50",
            """
            DO $$
            BEGIN
              IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_user_credit_balance_non_negative') THEN
                ALTER TABLE users ADD CONSTRAINT chk_user_credit_balance_non_negative CHECK (credit_balance >= 0);
              END IF;
            END $$;
            """,
            "ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_type VARCHAR(20) DEFAULT 'text'",
            "UPDATE notes SET note_type = 'text' WHERE note_type IS NULL OR note_type = 'drawing'",
            "ALTER TABLE notes ALTER COLUMN note_type SET DEFAULT 'text'",
            "ALTER TABLE notes ALTER COLUMN note_type SET NOT NULL",
            "ALTER TABLE notes ADD COLUMN IF NOT EXISTS media_url TEXT",
            "ALTER TABLE notes ADD COLUMN IF NOT EXISTS transcript TEXT",
            "ALTER TABLE notes ADD COLUMN IF NOT EXISTS checklist_items JSONB",
            "ALTER TABLE notes ADD COLUMN IF NOT EXISTS chat_history JSONB",
            "ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false",
            "ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false",
            "CREATE INDEX IF NOT EXISTS idx_notes_note_type ON notes (note_type)",
            "CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes (is_pinned)",
            "CREATE INDEX IF NOT EXISTS idx_notes_favorite ON notes (is_favorite)",
            "CREATE INDEX IF NOT EXISTS idx_notes_user_pinned_updated ON notes (user_id, is_pinned DESC, updated_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_notes_tags_gin ON notes USING GIN (tags)",
            "CREATE INDEX IF NOT EXISTS idx_notes_checklist ON notes USING GIN (checklist_items)",
            "CREATE INDEX IF NOT EXISTS idx_notes_embedding_hnsw ON notes USING hnsw (embedding vector_cosine_ops)",
            "CREATE INDEX IF NOT EXISTS idx_alerts_pending_due ON alerts (alert_time) WHERE is_notified = false",
            "CREATE INDEX IF NOT EXISTS idx_alerts_user_time ON alerts (user_id, alert_time ASC)",
            "CREATE INDEX IF NOT EXISTS idx_credit_tx_user_created ON credit_transactions (user_id, created_at DESC)",
            """
            CREATE OR REPLACE FUNCTION immutable_array_to_string(arr TEXT[], sep TEXT)
            RETURNS TEXT AS $$
                SELECT array_to_string(arr, sep);
            $$ LANGUAGE sql IMMUTABLE
            """,
            """
            CREATE INDEX IF NOT EXISTS idx_notes_fts ON notes USING gin ((
                setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                setweight(to_tsvector('english', coalesce(content, '')), 'B') ||
                setweight(to_tsvector('english', coalesce(immutable_array_to_string(tags, ' '), '')), 'A')
            ))
            """,
        ]
        for stmt in migration_stmts:
            cleaned = stmt.strip()
            if cleaned:
                await conn.execute(text(cleaned))
