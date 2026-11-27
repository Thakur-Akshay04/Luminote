import asyncio
import logging
import os
import time
import uuid

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.observability import audit_log
from app.services.resilience import get_http_client

logger = logging.getLogger(__name__)

security = HTTPBearer()

# Cache JWKS after first fetch — O(1) on all subsequent requests
_jwks_cache = None
_jwks_lock = asyncio.Lock()


async def get_jwks(retries: int = 3, backoff_factor: float = 0.5, force_refresh: bool = False):
    global _jwks_cache

    if _jwks_cache and not force_refresh:
        return _jwks_cache

    async with _jwks_lock:
        if _jwks_cache and not force_refresh:
            return _jwks_cache

        jwks_url = settings.clerk_jwks_url or os.getenv("CLERK_JWKS_URL")
        if not jwks_url:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Authentication service is not configured",
            )

        client = get_http_client()
        timeout = httpx.Timeout(connect=10.0, read=10.0, write=5.0, pool=5.0)
        last_exception = None

        for attempt in range(1, retries + 1):
            try:
                res = await client.get(jwks_url, timeout=timeout)
                res.raise_for_status()
                _jwks_cache = res.json()
                return _jwks_cache
            except (httpx.ConnectTimeout, httpx.HTTPError, httpx.RequestError) as exc:
                last_exception = exc
                logger.warning(
                    "Attempt %d/%d failed to fetch Clerk JWKS: %s",
                    attempt,
                    retries,
                    exc,
                )
                if attempt < retries:
                    await asyncio.sleep(backoff_factor * (2 ** (attempt - 1)))

        if _jwks_cache:
            logger.warning("Using stale JWKS cache following failed refresh")
            return _jwks_cache

        logger.error("All %d attempts to fetch Clerk JWKS failed: %s", retries, last_exception)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable — please try again",
        )


def _extract_user_info(payload: dict) -> tuple[str, str, str]:
    email = payload.get("email") or payload.get("email_address") or ""
    first_name = payload.get("first_name") or ""
    last_name = payload.get("last_name") or ""
    name = f"{first_name} {last_name}".strip() or (email.split("@")[0] if email else "")
    display_name = payload.get("display_name") or name
    return email, name, display_name


async def _find_existing_user(clerk_user_id: str, email: str, db: AsyncSession) -> User | None:
    result = await db.execute(select(User).where(User.clerk_user_id == clerk_user_id))
    user = result.scalar_one_or_none()
    if user or not email:
        return user

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user:
        user.clerk_user_id = clerk_user_id
    return user


async def sync_user_to_db(clerk_user_id: str, payload: dict, db: AsyncSession) -> User:
    """Find or create local user for Clerk subject, handling concurrent first-login races."""
    email, name, display_name = _extract_user_info(payload)
    user = await _find_existing_user(clerk_user_id, email, db)

    if not user:
        user = User(
            id=uuid.uuid4(),
            clerk_user_id=clerk_user_id,
            email=email,
            name=name,
            display_name=display_name,
            email_verified=True,
        )
        db.add(user)
    else:
        changed = False
        if not user.email and email:
            user.email = email
            changed = True
        if not user.name and name:
            user.name = name
            changed = True
        if not user.display_name and display_name:
            user.display_name = display_name
            changed = True
        if not changed and user.clerk_user_id == clerk_user_id:
            return user

    try:
        await db.commit()
        await db.refresh(user)
        return user
    except IntegrityError:
        await db.rollback()
        existing = await _find_existing_user(clerk_user_id, email, db)
        if existing:
            return existing
        raise


async def verify_token(token: str, db: AsyncSession) -> str:
    jwks = await get_jwks()

    try:
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except JWTError:
        jwks = await get_jwks(force_refresh=True)
        payload = jwt.decode(
            token,
            jwks,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )

    now = time.time()
    exp = payload.get("exp", 0)
    if exp and exp < (now - 60):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        )

    clerk_user_id = payload.get("sub")
    if not clerk_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing sub",
        )

    user = await sync_user_to_db(clerk_user_id, payload, db)
    return str(user.id)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> str:
    token = credentials.credentials
    try:
        return await verify_token(token, db)
    except HTTPException as exc:
        audit_log("auth_failed", outcome="failure", status_code=exc.status_code, reason=exc.detail)
        logger.warning("Clerk auth HTTP error (%d): %s", exc.status_code, exc.detail)
        raise
    except JWTError as exc:
        audit_log("auth_failed", outcome="failure", reason="invalid_jwt")
        logger.warning("Clerk JWT verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token — please sign in again",
        )
    except Exception as exc:
        audit_log("auth_failed", outcome="failure", reason="verification_error")
        logger.warning("Clerk auth verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token — please sign in again",
        )
