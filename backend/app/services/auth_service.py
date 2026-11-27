from datetime import datetime, timedelta, timezone
import os
import uuid

import bcrypt
from fastapi import HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.redis_client import get_redis, redis_delete_safe


def hash_password(password: str) -> str:
    pwd_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def decode_token(token: str) -> str:
    """Decode JWT and verify it exists in Redis. Returns user_id string."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if not isinstance(user_id, str) or not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        uuid.UUID(user_id)
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    redis = await get_redis()
    stored = await redis.get(f"session:{user_id}:{token}")
    if not stored:
        stored = await redis.get(f"session:{token}")
    if not stored:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    return user_id


async def invalidate_user_sessions(user_id: str, redis=None) -> None:
    """Invalidate all active sessions for a user in O(1) time."""
    try:
        r = redis or await get_redis()
        tokens = await r.smembers(f"user_sessions:{user_id}")
        if tokens:
            keys_to_delete = [f"session:{user_id}:{token}" for token in tokens]
            keys_to_delete.append(f"user_sessions:{user_id}")
            await r.delete(*keys_to_delete)
    except Exception:
        pass


def remove_avatar_file(user_id: str) -> None:
    """Safely remove a user's avatar file from disk if present."""
    media_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media")
    avatars_dir = os.path.realpath(os.path.join(media_dir, "avatars"))
    candidate = os.path.realpath(os.path.join(avatars_dir, f"{user_id}.jpg"))
    if not candidate.startswith(avatars_dir + os.sep):
        return
    if os.path.exists(candidate):
        try:
            os.remove(candidate)
        except OSError:
            pass


async def delete_user_and_cleanup(
    user_id: str,
    db: AsyncSession,
    authorization: str | None = None,
) -> None:
    """Delete user record, avatar on disk, and all Redis sessions/caches."""
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    await db.delete(user)
    await db.commit()

    remove_avatar_file(user_id)
    await invalidate_user_sessions(user_id)
    await redis_delete_safe(
        f"user:{user_id}:avatar",
        f"user:{user_id}",
        f"user:{user_id}:search_ver",
        cache_name="user_cleanup",
    )

    if authorization and " " in authorization:
        token = authorization.split(" ", 1)[1]
        await redis_delete_safe(f"session:{token}", cache_name="user_cleanup")


async def register_user(email: str, password: str, name: str | None, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(id=uuid.uuid4(), email=email, name=name, password_hash=hash_password(password))
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def login_user(email: str, password: str, db: AsyncSession) -> tuple[User, str]:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not user.password_hash or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    token = create_access_token(str(user.id))
    redis = await get_redis()
    await redis.setex(f"session:{user.id}:{token}", settings.session_ttl, str(user.id))
    await redis.sadd(f"user_sessions:{user.id}", token)  # type: ignore
    await redis.expire(f"user_sessions:{user.id}", settings.session_ttl)

    return user, token
