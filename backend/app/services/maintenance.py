"""
Database maintenance & retention utilities.

Run manually or via scheduled cron:
    python -m app.services.maintenance
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.alert import Alert
from app.models.credit_transaction import (
    CreditTransaction,
    CreditTransactionStatus,
    PaymentIdempotencyKey,
)

logger = logging.getLogger(__name__)


async def purge_stale_records(
    db: AsyncSession,
    alert_retention_days: int = 90,
    pending_tx_retention_days: int = 30,
) -> dict[str, int]:
    """Delete old notified alerts and expired abandoned pending payment orders."""
    now = datetime.now(timezone.utc)
    alert_cutoff = now - timedelta(days=alert_retention_days)
    tx_cutoff = now - timedelta(days=pending_tx_retention_days)

    alert_res = await db.execute(
        delete(Alert).where(Alert.is_notified == True, Alert.alert_time < alert_cutoff)
    )
    tx_res = await db.execute(
        delete(CreditTransaction).where(
            CreditTransaction.status == CreditTransactionStatus.PENDING,
            CreditTransaction.created_at < tx_cutoff,
        )
    )
    idem_res = await db.execute(
        delete(PaymentIdempotencyKey).where(PaymentIdempotencyKey.created_at < tx_cutoff)
    )
    await db.commit()

    purged = {
        "alerts_purged": int(alert_res.rowcount or 0),
        "pending_transactions_purged": int(tx_res.rowcount or 0),
        "idempotency_keys_purged": int(idem_res.rowcount or 0),
    }
    logger.info("Maintenance purge completed: %s", purged)
    return purged


async def refresh_table_statistics(db: AsyncSession) -> None:
    """Update PostgreSQL planner statistics for core tables."""
    for table in ("users", "notes", "alerts", "credit_transactions", "payment_idempotency_keys"):
        await db.execute(text(f"ANALYZE {table}"))
    await db.commit()


async def main() -> None:
    async with AsyncSessionLocal() as db:
        await purge_stale_records(db)
        await refresh_table_statistics(db)


if __name__ == "__main__":
    asyncio.run(main())
