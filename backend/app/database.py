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
        try:
            result = await conn.execute(
                __import__("sqlalchemy").text(
                    "SELECT atttypmod FROM pg_attribute WHERE attrelid = 'notes'::regclass AND attname = 'embedding'"
                )
            )
            row = result.fetchone()
            if row and row[0] != 384:
                await conn.execute(__import__("sqlalchemy").text("DROP INDEX IF EXISTS idx_notes_embedding_hnsw"))
                await conn.execute(__import__("sqlalchemy").text("ALTER TABLE notes DROP COLUMN IF EXISTS embedding"))
                await conn.execute(__import__("sqlalchemy").text("ALTER TABLE notes ADD COLUMN embedding vector(384)"))
        except Exception:
            pass

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
            "ALTER TABLE notes ADD COLUMN IF NOT EXISTS note_type VARCHAR(20) DEFAULT 'text'",
            "ALTER TABLE notes ADD COLUMN IF NOT EXISTS media_url TEXT",
            "ALTER TABLE notes ADD COLUMN IF NOT EXISTS transcript TEXT",
            "ALTER TABLE notes ADD COLUMN IF NOT EXISTS checklist_items JSONB",
            "ALTER TABLE notes ADD COLUMN IF NOT EXISTS chat_history JSONB",
            "ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false",
            "ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false",
            "CREATE INDEX IF NOT EXISTS idx_notes_note_type ON notes (note_type)",
            "CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes (is_pinned)",
            "CREATE INDEX IF NOT EXISTS idx_notes_favorite ON notes (is_favorite)",
            "CREATE INDEX IF NOT EXISTS idx_notes_checklist ON notes USING GIN (checklist_items)",
            "CREATE INDEX IF NOT EXISTS idx_notes_embedding_hnsw ON notes USING hnsw (embedding vector_cosine_ops)",
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
            """
        ]
        for stmt in migration_stmts:
            stmt = stmt.strip()
            if stmt:
                await conn.execute(__import__("sqlalchemy").text(stmt))

