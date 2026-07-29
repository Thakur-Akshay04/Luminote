import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class CreditTransactionType(str, enum.Enum):
    PURCHASE = "purchase"
    USAGE = "usage"
    REFUND = "refund"
    BONUS = "bonus"


class CreditTransactionStatus(str, enum.Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[CreditTransactionType] = mapped_column(
        Enum(CreditTransactionType, name="credit_transaction_type"), nullable=False
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    razorpay_order_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True, index=True
    )
    razorpay_payment_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True, index=True
    )
    feature: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[CreditTransactionStatus] = mapped_column(
        Enum(CreditTransactionStatus, name="credit_transaction_status"),
        default=CreditTransactionStatus.PENDING,
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        nullable=False,
    )
