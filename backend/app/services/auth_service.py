from datetime import datetime, timedelta, timezone
import hashlib
import os
import uuid

import bcrypt
from fastapi import HTTPException, status
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User
from app.redis_client import get_redis, redis_delete_safe, validate_redis_key


def _hash_session_token(token: str) -> str:
    """Hash bearer tokens with SHA-256 before using them in Redis session keys."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


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
    """Decode JWT and verify its hashed session exists in Redis. Returns user_id string."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if not isinstance(user_id, str) or not user_id:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        uid_str = str(uuid.UUID(user_id))
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    token_hash = _hash_session_token(token)
    redis = await get_redis()
    stored = await redis.get(validate_redis_key(f"session:{uid_str}:{token_hash}"))
    if not stored:
        stored = await redis.get(validate_redis_key(f"session:{token_hash}"))
    if not stored:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")

    return uid_str


async def invalidate_user_sessions(user_id: str, redis=None) -> None:
    """Invalidate all active sessions for a user in O(1) time."""
    try:
        uid_str = str(uuid.UUID(user_id))
        r = redis or await get_redis()
        sessions_set_key = validate_redis_key(f"user_sessions:{uid_str}")
        token_hashes = await r.smembers(sessions_set_key)
        if token_hashes:
            keys_to_delete = [
                validate_redis_key(f"session:{uid_str}:{token_hash}") for token_hash in token_hashes
            ]
            keys_to_delete.append(sessions_set_key)
            await r.delete(*keys_to_delete)
    except Exception:
        pass


def remove_avatar_file(user_id: str) -> None:
    """Safely remove a user's avatar file from disk if present."""
    uid_str = str(uuid.UUID(user_id))
    media_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media")
    avatars_dir = os.path.realpath(os.path.join(media_dir, "avatars"))
    candidate = os.path.realpath(os.path.join(avatars_dir, f"{uid_str}.jpg"))
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
    uid = uuid.UUID(user_id)
    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    canonical_uid = str(user.id)
    await db.delete(user)
    await db.commit()

    remove_avatar_file(canonical_uid)
    await invalidate_user_sessions(canonical_uid)
    await redis_delete_safe(
        f"user:{canonical_uid}:avatar",
        f"user:{canonical_uid}",
        f"user:{canonical_uid}:search_ver",
        cache_name="user_cleanup",
    )

    if authorization and " " in authorization:
        token = authorization.split(" ", 1)[1].strip()
        if token:
            token_hash = _hash_session_token(token)
            await redis_delete_safe(f"session:{token_hash}", cache_name="user_cleanup")


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

    uid_str = str(user.id)
    token = create_access_token(uid_str)
    token_hash = _hash_session_token(token)
    redis = await get_redis()
    await redis.setex(validate_redis_key(f"session:{uid_str}:{token_hash}"), settings.session_ttl, uid_str)
    sessions_set_key = validate_redis_key(f"user_sessions:{uid_str}")
    await redis.sadd(sessions_set_key, token_hash)  # type: ignore
    await redis.expire(sessions_set_key, settings.session_ttl)

    return user, token
