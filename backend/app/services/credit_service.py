import logging
import uuid
from fastapi import HTTPException, status
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.credit_transaction import (
    CreditTransaction,
    CreditTransactionType,
    CreditTransactionStatus,
)

logger = logging.getLogger(__name__)


async def check_and_deduct_credits(
    user_id: str | uuid.UUID,
    feature: str,
    cost: int,
    db: AsyncSession
) -> int:
    """
    Atomic credit deduction with DB row-level check (UPDATE...WHERE credit_balance >= cost).
    
    Prevents race conditions where two simultaneous requests check balance before either deducts,
    leading to negative balances. DB-level check constraint also guarantees balance >= 0.
    
    Raises 402 PAYMENT REQUIRED if user has insufficient credits.
    Returns the new credit balance.
    """
    uid = uuid.UUID(user_id) if isinstance(user_id, str) else user_id

    result = await db.execute(
        update(User)
        .where(User.id == uid, User.credit_balance >= cost)
        .values(credit_balance=User.credit_balance - cost)
        .returning(User.credit_balance)
    )
    row = result.first()
    if row is None:
        logger.warning(
            "Insufficient credits for user %s attempting feature '%s' (cost: %d)",
            user_id, feature, cost
        )
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "error": "insufficient_credits",
                "message": f"Not enough credits for {feature}. Required: {cost} credits.",
                "feature": feature,
                "cost": cost,
            }
        )

    new_balance = row[0]

    # Record usage transaction
    tx = CreditTransaction(
        id=uuid.uuid4(),
        user_id=uid,
        type=CreditTransactionType.USAGE,
        amount=-cost,
        feature=feature,
        status=CreditTransactionStatus.COMPLETED,
    )
    db.add(tx)
    await db.commit()

    logger.info(
        "Deducted %d credits for feature '%s' from user %s. New balance: %d",
        cost, feature, user_id, new_balance
    )
    return new_balance
