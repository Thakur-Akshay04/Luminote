import asyncio
import os
import uuid
import logging
import httpx
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.user import User
from app.config import settings

logger = logging.getLogger(__name__)

security = HTTPBearer()

# Cache JWKS after first fetch — O(1) on all subsequent requests
_jwks_cache = None
_jwks_lock = asyncio.Lock()


async def get_jwks():
    global _jwks_cache

    # Fast path — already cached
    if _jwks_cache:
        return _jwks_cache

    # Slow path — acquire lock so only ONE coroutine fetches from Clerk
    async with _jwks_lock:
        # Re-check inside the lock (another coroutine may have populated it)
        if _jwks_cache:
            return _jwks_cache

        jwks_url = settings.clerk_jwks_url or os.getenv("CLERK_JWKS_URL")
        if not jwks_url:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="CLERK_JWKS_URL is not configured"
            )

        timeout = httpx.Timeout(connect=10.0, read=10.0, write=5.0, pool=5.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                res = await client.get(jwks_url)
                res.raise_for_status()
                _jwks_cache = res.json()
        except httpx.ConnectTimeout:
            logger.error("Timed out connecting to Clerk JWKS endpoint: %s", jwks_url)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication service unavailable — please try again"
            )
        except httpx.HTTPError as exc:
            logger.exception("Failed to fetch Clerk JWKS: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Authentication service unavailable — please try again"
            )

    return _jwks_cache


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
        user.email = user.email or email
        user.name = user.name or name
        user.display_name = user.display_name or display_name

    await db.commit()
    await db.refresh(user)
    return user


async def verify_token(token: str, db: AsyncSession) -> str:
    jwks = await get_jwks()

    payload = jwt.decode(
        token,
        jwks,
        algorithms=["RS256"],
        options={"verify_aud": False}
    )

    clerk_user_id = payload.get("sub")
    if not clerk_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing sub"
        )

    user = await sync_user_to_db(clerk_user_id, payload, db)
    return str(user.id)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> str:
    token = credentials.credentials
    try:
        return await verify_token(token, db)
    except JWTError as e:
        logger.warning(f"Clerk JWT verification error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token — please sign in again"
        )
