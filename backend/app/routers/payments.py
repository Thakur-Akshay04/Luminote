import base64
import logging
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
import razorpay

from app.auth.clerk import get_current_user
from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.models.credit_transaction import (
    CreditTransaction,
    CreditTransactionStatus,
    CreditTransactionType,
)
from app.models.user import User

logger = logging.getLogger(__name__)


def _sanitize_log_data(data: str | None) -> str:
    """
    Sanitize user-controlled untrusted input before logging to prevent Log Injection (CRLF Injection).
    Validates alphanumeric/hyphen/underscore format or encodes with Base64.
    """
    if not data:
        return ""
    cleaned = data.replace("\r", "").replace("\n", "").strip()
    if cleaned.replace("_", "").replace("-", "").isalnum():
        return cleaned
    return base64.b64encode(data.encode("utf-8")).decode("utf-8")


router = APIRouter(prefix="/payments", tags=["payments"])

# ── Server-Side Fixed Package Configuration ──────────────────────────────────
# Security rule: Never accept amount or credit count from the client request.
PACKAGES = {
    "starter": {"credits": 100, "amount_paise": 4900, "name": "Starter Pack"},
    "pro": {"credits": 500, "amount_paise": 19900, "name": "Pro Pack"},
    "power": {"credits": 1500, "amount_paise": 49900, "name": "Power Pack"},
}


class CreateOrderRequest(BaseModel):
    credit_package: Literal["starter", "pro", "power"] = Field(
        ..., description="Server-validated package key"
    )


class CreateOrderResponse(BaseModel):
    order_id: str
    amount: int
    currency: str
    razorpay_key_id: str


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def get_razorpay_client() -> razorpay.Client:
    """Initialize Razorpay SDK client with timeout and credentials."""
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        logger.error("Razorpay API credentials missing in environment variables.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Payment service configuration error — missing Razorpay credentials",
        )
    client = razorpay.Client(
        auth=(settings.razorpay_key_id, settings.razorpay_key_secret)
    )
    client.set_app_details({"title": "Luminote", "version": "1.0.0"})
    return client


@router.get("/packages")
async def get_packages():
    """Return available credit packages and public Razorpay key ID."""
    return {
        "packages": PACKAGES,
        "razorpay_key_id": settings.razorpay_key_id,
    }


@router.post("/create-order", response_model=CreateOrderResponse, status_code=201)
@limiter.limit("10/hour")
async def create_order(
    request: Request,
    body: CreateOrderRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Create a Razorpay order and insert a pending CreditTransaction in DB.
    
    Security Controls:
    - Auth required via Clerk JWT
    - Rate limited to 10 orders/hour per user to prevent order spam
    - Amount derived strictly server-side from fixed PACKAGES dict
    """
    package = PACKAGES.get(body.credit_package)
    if not package:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid package selected"
        )

    client = get_razorpay_client()
    uid = uuid.UUID(user_id)

    order_payload = {
        "amount": package["amount_paise"],
        "currency": "INR",
        "receipt": f"rcpt_{uuid.uuid4().hex[:12]}",
        "notes": {
            "user_id": user_id,
            "credit_package": body.credit_package,
            "credits": str(package["credits"]),
        },
    }

    try:
        razorpay_order = client.order.create(data=order_payload)  # type: ignore[attr-defined]
    except Exception as exc:
        logger.exception("Failed to create Razorpay order for user %s: %s", user_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment gateway communication error",
        )

    order_id = razorpay_order["id"]

    # Insert pending transaction row
    pending_tx = CreditTransaction(
        id=uuid.uuid4(),
        user_id=uid,
        type=CreditTransactionType.PURCHASE,
        amount=package["credits"],
        razorpay_order_id=order_id,
        status=CreditTransactionStatus.PENDING,
    )
    db.add(pending_tx)
    await db.commit()

    logger.info(
        "Created pending Razorpay order %s for user %s (Package: %s, Credits: %d)",
        order_id, user_id, body.credit_package, package["credits"]
    )

    return CreateOrderResponse(
        order_id=order_id,
        amount=package["amount_paise"],
        currency="INR",
        razorpay_key_id=settings.razorpay_key_id,
    )


@router.post("/verify", status_code=200)
@limiter.limit("20/minute")
async def verify_payment(
    request: Request,
    body: VerifyPaymentRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Verify payment signature client-side checkout callback.
    
    Security & Reliability Controls:
    - HMAC signature check via Razorpay SDK with RAZORPAY_KEY_SECRET
    - DB transaction wrapping status update + balance increment
    - DB unique constraint on razorpay_payment_id for replay protection
    - Idempotency handling if payment was already credited by webhook
    """
    client = get_razorpay_client()
    uid = uuid.UUID(user_id)

    # 1. Verify Payment Signature
    try:
        client.utility.verify_payment_signature(  # type: ignore[attr-defined]
            {
                "razorpay_order_id": body.razorpay_order_id,
                "razorpay_payment_id": body.razorpay_payment_id,
                "razorpay_signature": body.razorpay_signature,
            }
        )
    except Exception as exc:
        logger.warning(
            "Payment signature verification failed for user %s, order %s: %s",
            user_id, _sanitize_log_data(body.razorpay_order_id), exc
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid payment signature",
        )

    # 2. Check if this payment ID has ALREADY been processed (Idempotency check)
    stmt = select(CreditTransaction).where(
        CreditTransaction.razorpay_payment_id == body.razorpay_payment_id
    )
    existing_tx_res = await db.execute(stmt)
    existing_tx = existing_tx_res.scalar_one_or_none()

    if existing_tx and existing_tx.status == CreditTransactionStatus.COMPLETED:
        # Fetch current user balance
        user_res = await db.execute(select(User).where(User.id == uid))
        user = user_res.scalar_one_or_none()
        balance = user.credit_balance if user else 0
        logger.info(
            "Payment %s already completed for order %s (idempotent response)",
            _sanitize_log_data(body.razorpay_payment_id), _sanitize_log_data(body.razorpay_order_id)
        )
        return {
            "status": "success",
            "message": "Payment already verified",
            "credit_balance": balance,
        }

    # 3. Find pending transaction for this order
    order_stmt = select(CreditTransaction).where(
        CreditTransaction.razorpay_order_id == body.razorpay_order_id,
        CreditTransaction.user_id == uid,
    )
    tx_res = await db.execute(order_stmt)
    tx = tx_res.scalar_one_or_none()

    if not tx:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order transaction not found",
        )

    if tx.status == CreditTransactionStatus.COMPLETED:
        user_res = await db.execute(select(User).where(User.id == uid))
        user = user_res.scalar_one_or_none()
        return {
            "status": "success",
            "message": "Payment already verified",
            "credit_balance": user.credit_balance if user else 0,
        }

    # 4. Atomic DB Transaction: update transaction status & increment credit balance
    tx.razorpay_payment_id = body.razorpay_payment_id
    tx.status = CreditTransactionStatus.COMPLETED

    user_update_res = await db.execute(
        update(User)
        .where(User.id == uid)
        .values(credit_balance=User.credit_balance + tx.amount)
        .returning(User.credit_balance)
    )
    new_balance_row = user_update_res.first()
    new_balance = new_balance_row[0] if new_balance_row else 0

    await db.commit()

    logger.info(
        "Successfully verified payment %s for order %s. Credited %d credits to user %s. New balance: %d",
        _sanitize_log_data(body.razorpay_payment_id), _sanitize_log_data(body.razorpay_order_id), tx.amount, user_id, new_balance
    )

    return {
        "status": "success",
        "message": "Payment verified and credits added",
        "credit_balance": new_balance,
    }


@router.post("/webhook", status_code=200)
async def razorpay_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_razorpay_signature: Annotated[str | None, Header(alias="X-Razorpay-Signature")] = None,
):
    """
    Server-to-server Razorpay webhook endpoint (Authoritative ground truth).
    
    Security & Reliability Controls:
    - NO Clerk auth (called asynchronously by Razorpay servers)
    - HMAC-SHA256 signature verification with RAZORPAY_WEBHOOK_SECRET
    - Only processes 'payment.captured' events
    - Idempotent: safe to run if /verify already processed the payment
    - Never discloses secret keys or sensitive raw card details
    """
    if not x_razorpay_signature or not settings.razorpay_webhook_secret:
        logger.warning("Webhook rejected: missing signature header or server secret")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing signature header or webhook secret",
        )

    raw_body = await request.body()
    client = get_razorpay_client()

    try:
        client.utility.verify_webhook_signature(  # type: ignore[attr-defined]
            raw_body.decode("utf-8"),
            x_razorpay_signature,
            settings.razorpay_webhook_secret,
        )
    except Exception as exc:
        logger.warning("Razorpay webhook signature verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook signature",
        )

    payload = await request.json()
    event = payload.get("event")
    logger.info("Received Razorpay webhook event: %s", _sanitize_log_data(event))

    if event != "payment.captured":
        # Acknowledge non-captured events quickly
        return {"status": "ignored", "event": event}

    payment_entity = (
        payload.get("payload", {})
        .get("payment", {})
        .get("entity", {})
    )
    order_id = payment_entity.get("order_id")
    payment_id = payment_entity.get("id")

    if not order_id or not payment_id:
        logger.warning("Webhook payment entity missing order_id or payment_id")
        return {"status": "invalid_payload"}

    # 1. Idempotency Check: check if already completed
    stmt = select(CreditTransaction).where(
        CreditTransaction.razorpay_payment_id == payment_id
    )
    res = await db.execute(stmt)
    existing_tx = res.scalar_one_or_none()

    if existing_tx and existing_tx.status == CreditTransactionStatus.COMPLETED:
        logger.info("Webhook payment %s already processed (idempotent)", _sanitize_log_data(payment_id))
        return {"status": "already_processed"}

    # 2. Find pending transaction by order_id
    order_stmt = select(CreditTransaction).where(
        CreditTransaction.razorpay_order_id == order_id
    )
    tx_res = await db.execute(order_stmt)
    tx = tx_res.scalar_one_or_none()

    if not tx:
        logger.warning("Webhook received for unknown order_id %s", _sanitize_log_data(order_id))
        return {"status": "order_not_found"}

    if tx.status == CreditTransactionStatus.COMPLETED:
        logger.info("Webhook order %s already completed", _sanitize_log_data(order_id))
        return {"status": "already_completed"}

    # 3. Update status and credit balance atomically
    tx.razorpay_payment_id = payment_id
    tx.status = CreditTransactionStatus.COMPLETED

    await db.execute(
        update(User)
        .where(User.id == tx.user_id)
        .values(credit_balance=User.credit_balance + tx.amount)
    )
    await db.commit()

    logger.info(
        "Webhook successfully processed payment %s for order %s. Added %d credits to user %s",
        _sanitize_log_data(payment_id), _sanitize_log_data(order_id), tx.amount, tx.user_id
    )

    return {"status": "success", "order_id": order_id, "payment_id": payment_id}


@router.get("/history", status_code=200)
@limiter.limit("30/minute")
async def get_transaction_history(
    request: Request,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Return user's credit transaction history (purchases, usage, bonuses)."""
    uid = uuid.UUID(user_id)
    stmt = (
        select(CreditTransaction)
        .where(CreditTransaction.user_id == uid)
        .order_by(CreditTransaction.created_at.desc())
        .limit(50)
    )
    res = await db.execute(stmt)
    transactions = res.scalars().all()

    return [
        {
            "id": str(tx.id),
            "type": tx.type.value if hasattr(tx.type, "value") else str(tx.type),
            "amount": tx.amount,
            "feature": tx.feature,
            "status": tx.status.value if hasattr(tx.status, "value") else str(tx.status),
            "created_at": tx.created_at.isoformat() if tx.created_at else None,
        }
        for tx in transactions
    ]
