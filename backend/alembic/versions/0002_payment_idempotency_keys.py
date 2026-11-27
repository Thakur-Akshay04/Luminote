"""Add durable payment idempotency table

Revision ID: 0002_payment_idempotency_keys
Revises: 0001_initial_schema
Create Date: 2026-11-27
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_payment_idempotency_keys"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "payment_idempotency_keys",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("credit_package", sa.String(length=32), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("razorpay_order_id", sa.String(length=255), nullable=True),
        sa.Column("response_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "credit_package",
            "idempotency_key",
            name="uq_payment_idempotency_user_pkg_key",
        ),
    )
    op.create_index(
        "ix_payment_idempotency_keys_user_id",
        "payment_idempotency_keys",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_payment_idempotency_keys_user_id", table_name="payment_idempotency_keys")
    op.drop_table("payment_idempotency_keys")
