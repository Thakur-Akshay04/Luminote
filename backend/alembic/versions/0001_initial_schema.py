"""Initial schema and performance indexes

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-11-27
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE INDEX IF NOT EXISTS idx_notes_user_pinned_updated ON notes (user_id, is_pinned DESC, updated_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_notes_tags_gin ON notes USING GIN (tags)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_notes_checklist ON notes USING GIN (checklist_items)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_notes_embedding_hnsw ON notes USING hnsw (embedding vector_cosine_ops)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_alerts_pending_due ON alerts (alert_time) WHERE is_notified = false")
    op.execute("CREATE INDEX IF NOT EXISTS idx_alerts_user_time ON alerts (user_id, alert_time ASC)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_credit_tx_user_created ON credit_transactions (user_id, created_at DESC)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_credit_tx_user_created")
    op.execute("DROP INDEX IF EXISTS idx_alerts_user_time")
    op.execute("DROP INDEX IF EXISTS idx_alerts_pending_due")
    op.execute("DROP INDEX IF EXISTS idx_notes_embedding_hnsw")
    op.execute("DROP INDEX IF EXISTS idx_notes_checklist")
    op.execute("DROP INDEX IF EXISTS idx_notes_tags_gin")
    op.execute("DROP INDEX IF EXISTS idx_notes_user_pinned_updated")
