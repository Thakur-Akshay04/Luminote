import asyncio
import json
import logging
import uuid
from typing import Annotated, Literal, Optional

import razorpay
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.observability import audit_log, sanitize_log_value
from app.pagination import decode_timestamp_id_cursor, encode_cursor, set_pagination_headers
from app.redis_client import redis_get_safe, redis_setex_safe
from app.services.resilience import CircuitBreakerOpenError, razorpay_breaker

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["payments"])

# Server-side fixed packages — never accept price or credit count from client
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
    razorpay_order_id: str = Field(..., min_length=1, max_length=128)
    razorpay_payment_id: str = Field(..., min_length=1, max_length=128)
    razorpay_signature: str = Field(..., min_length=1, max_length=256)


def get_razorpay_client() -> razorpay.Client:
    """Initialize Razorpay SDK client cleanly without disclosing internal config state."""
    if not settings.razorpay_key_id or not settings.razorpay_key_secret:
        logger.error("Razorpay API credentials missing in environment configuration.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment service temporarily unavailable",
        )
    client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
    client.set_app_details({"title": "Luminote", "version": "1.0.0"})
    return client


async def _run_razorpay_call(fn, *args, **kwargs):
    """Run blocking Razorpay SDK call in a thread with timeout and circuit breaker."""

    async def _invoke():
        return await asyncio.wait_for(
            asyncio.to_thread(fn, *args, **kwargs),
            timeout=settings.razorpay_timeout_seconds,
        )

    try:
        return await razorpay_breaker.call(_invoke)
    except CircuitBreakerOpenError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment gateway temporarily unavailable — please try again shortly",
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Payment gateway timed out",
        )


async def _atomic_complete_purchase(
    db: AsyncSession,
    tx_filter,
    payment_id: str,
) -> tuple[bool, int | None, uuid.UUID | None]:
    """
    Atomically transition a PENDING CreditTransaction to COMPLETED and credit the user.

    Returns (transitioned_now, credited_amount, user_id).
    Guarantees exactly-once credit addition even when /verify and /webhook race concurrently.
    """
    try:
        res = await db.execute(
            update(CreditTransaction)
            .where(tx_filter, CreditTransaction.status == CreditTransactionStatus.PENDING)
            .values(
                razorpay_payment_id=payment_id,
                status=CreditTransactionStatus.COMPLETED,
            )
            .returning(CreditTransaction.amount, CreditTransaction.user_id)
        )
        row = res.first()
        if row is None:
            return False, None, None

        credited_amount, tx_user_id = row[0], row[1]
        await db.execute(
            update(User)
            .where(User.id == tx_user_id)
            .values(credit_balance=User.credit_balance + credited_amount)
        )
        await db.commit()
        return True, credited_amount, tx_user_id
    except IntegrityError:
        await db.rollback()
        return False, None, None


@router.get("/packages")
@limiter.limit("60/minute")
async def get_packages(request: Request):
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
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key", max_length=128)] = None,
):
    """Create a Razorpay order and pending CreditTransaction with optional Idempotency-Key support."""
    package = PACKAGES.get(body.credit_package)
    if not package:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid package selected")

    idem_cache_key: str | None = None
    if idempotency_key:
        idem_cache_key = f"user:{user_id}:order_idem:{body.credit_package}:{idempotency_key}"
        cached = await redis_get_safe(idem_cache_key, cache_name="payment_idem")
        if cached:
            return CreateOrderResponse(**json.loads(cached))

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
        razorpay_order = await _run_razorpay_call(client.order.create, data=order_payload)  # type: ignore[attr-defined]
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to create Razorpay order for user %s: %s", user_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment gateway communication error",
        )

    order_id = razorpay_order["id"]

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

    response_payload = CreateOrderResponse(
        order_id=order_id,
        amount=package["amount_paise"],
        currency="INR",
        razorpay_key_id=settings.razorpay_key_id,
    )
    if idem_cache_key:
        await redis_setex_safe(
            idem_cache_key, 24 * 60 * 60, response_payload.model_dump_json(), cache_name="payment_idem"
        )

    audit_log(
        "payment_order_created",
        user_id=user_id,
        ip=request.client.host if request.client else None,
        order_id=order_id,
        package=body.credit_package,
        credits=package["credits"],
    )
    return response_payload


@router.post("/verify", status_code=200)
@limiter.limit("20/minute")
async def verify_payment(
    request: Request,
    body: VerifyPaymentRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Verify Razorpay payment signature and atomically credit user once."""
    client = get_razorpay_client()
    uid = uuid.UUID(user_id)

    try:
        await _run_razorpay_call(
            client.utility.verify_payment_signature,  # type: ignore[attr-defined]
            {
                "razorpay_order_id": body.razorpay_order_id,
                "razorpay_payment_id": body.razorpay_payment_id,
                "razorpay_signature": body.razorpay_signature,
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        audit_log(
            "payment_verify_failed",
            user_id=user_id,
            ip=request.client.host if request.client else None,
            outcome="failure",
            order_id=body.razorpay_order_id,
        )
        logger.warning(
            "Payment signature verification failed for user %s, order %s: %s",
            user_id,
            sanitize_log_value(body.razorpay_order_id),
            exc,
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payment signature")

    # Fast-path idempotency check
    existing = (
        await db.execute(
            select(CreditTransaction).where(
                CreditTransaction.razorpay_payment_id == body.razorpay_payment_id
            )
        )
    ).scalar_one_or_none()
    if existing and existing.status == CreditTransactionStatus.COMPLETED:
        bal = (await db.execute(select(User.credit_balance).where(User.id == uid))).scalar_one_or_none() or 0
        return {"status": "success", "message": "Payment already verified", "credit_balance": bal}

    tx = (
        await db.execute(
            select(CreditTransaction).where(
                CreditTransaction.razorpay_order_id == body.razorpay_order_id,
                CreditTransaction.user_id == uid,
            )
        )
    ).scalar_one_or_none()
    if not tx:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order transaction not found")

    transitioned, credited, _ = await _atomic_complete_purchase(
        db,
        and_(
            CreditTransaction.id == tx.id,
            CreditTransaction.user_id == uid,
        ),
        body.razorpay_payment_id,
    )

    bal = (await db.execute(select(User.credit_balance).where(User.id == uid))).scalar_one_or_none() or 0
    if not transitioned:
        return {"status": "success", "message": "Payment already verified", "credit_balance": bal}

    audit_log(
        "payment_verified",
        user_id=user_id,
        ip=request.client.host if request.client else None,
        order_id=body.razorpay_order_id,
        payment_id=body.razorpay_payment_id,
        credits=credited,
    )
    return {
        "status": "success",
        "message": "Payment verified and credits added",
        "credit_balance": bal,
    }


@router.post("/webhook", status_code=200)
@limiter.limit("120/minute")
async def razorpay_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_razorpay_signature: Annotated[str | None, Header(alias="X-Razorpay-Signature")] = None,
):
    """Authoritative server-to-server Razorpay webhook endpoint with atomic idempotency."""
    if not x_razorpay_signature or not settings.razorpay_webhook_secret:
        logger.warning("Webhook rejected: missing signature header or webhook secret")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing signature header or webhook secret",
        )

    raw_body = await request.body()
    client = get_razorpay_client()

    try:
        await _run_razorpay_call(
            client.utility.verify_webhook_signature,  # type: ignore[attr-defined]
            raw_body.decode("utf-8"),
            x_razorpay_signature,
            settings.razorpay_webhook_secret,
        )
    except HTTPException:
        raise
    except Exception as exc:
        audit_log(
            "payment_webhook_invalid_sig",
            ip=request.client.host if request.client else None,
            outcome="failure",
        )
        logger.warning("Razorpay webhook signature verification failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook signature")

    payload = await request.json()
    event = payload.get("event")
    logger.info("Received Razorpay webhook event: %s", sanitize_log_value(event))

    if event != "payment.captured":
        return {"status": "ignored", "event": event}

    payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    order_id = payment_entity.get("order_id")
    payment_id = payment_entity.get("id")

    if not order_id or not payment_id:
        logger.warning("Webhook payment entity missing order_id or payment_id")
        return {"status": "invalid_payload"}

    existing_tx = (
        await db.execute(
            select(CreditTransaction).where(CreditTransaction.razorpay_payment_id == payment_id)
        )
    ).scalar_one_or_none()
    if existing_tx and existing_tx.status == CreditTransactionStatus.COMPLETED:
        return {"status": "already_processed"}

    tx = (
        await db.execute(
            select(CreditTransaction).where(CreditTransaction.razorpay_order_id == order_id)
        )
    ).scalar_one_or_none()
    if not tx:
        logger.warning("Webhook received for unknown order_id %s", sanitize_log_value(order_id))
        return {"status": "order_not_found"}
    if tx.status == CreditTransactionStatus.COMPLETED:
        return {"status": "already_completed"}

    transitioned, credited, tx_user_id = await _atomic_complete_purchase(
        db,
        CreditTransaction.id == tx.id,
        payment_id,
    )
    if not transitioned:
        return {"status": "already_processed"}

    audit_log(
        "payment_webhook_captured",
        user_id=str(tx_user_id),
        ip=request.client.host if request.client else None,
        order_id=order_id,
        payment_id=payment_id,
        credits=credited,
    )
    return {"status": "success", "order_id": order_id, "payment_id": payment_id}


@router.get("/history", status_code=200)
@limiter.limit("30/minute")
async def get_transaction_history(
    request: Request,
    response: Response,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=50, ge=1, le=200),
    cursor: Optional[str] = None,
):
    """Return user's credit transaction history with keyset pagination."""
    uid = uuid.UUID(user_id)
    stmt = (
        select(CreditTransaction)
        .where(CreditTransaction.user_id == uid)
        .order_by(CreditTransaction.created_at.desc(), CreditTransaction.id.desc())
    )
    if cursor:
        c_created, c_id = decode_timestamp_id_cursor(cursor)
        stmt = stmt.where(
            or_(
                CreditTransaction.created_at < c_created,
                and_(CreditTransaction.created_at == c_created, CreditTransaction.id < c_id),
            )
        )

    stmt = stmt.limit(limit + 1)
    res = await db.execute(stmt)
    transactions = list(res.scalars().all())

    has_more = len(transactions) > limit
    if has_more:
        transactions = transactions[:limit]
    next_cursor = encode_cursor(transactions[-1].created_at.isoformat(), transactions[-1].id) if has_more and transactions else None
    set_pagination_headers(response, next_cursor, True)

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
