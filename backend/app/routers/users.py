from fastapi import APIRouter, Depends, Header, HTTPException, status, UploadFile, File
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
import os
import io
from PIL import Image
from jose import jwt, JWTError
from datetime import datetime, timezone

from app.database import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.redis_client import get_redis
from app.config import settings
from app.schemas.users import ChangeEmailRequest, ChangePasswordRequest, ChangeNameRequest
from app.services.auth_service import verify_password, hash_password
from app.services.email_service import send_verification_email

router = APIRouter(prefix="/users", tags=["users"])


async def invalidate_user_sessions(user_id: str, redis) -> None:
    """Invalidate all active sessions for a user in O(1) time."""
    tokens = await redis.smembers(f"user_sessions:{user_id}")
    if tokens:
        keys_to_delete = [f"session:{user_id}:{token}" for token in tokens]
        keys_to_delete.append(f"user_sessions:{user_id}")
        await redis.delete(*keys_to_delete)


@router.post("/me/avatar", status_code=200)
async def upload_avatar(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Validate file size (max 5MB)
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image must be under 5MB"
        )

    # Validate image file using PIL
    try:
        img = Image.open(io.BytesIO(contents))
        img.verify()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image file"
        )

    # Re-open because verify() invalidates the image object state
    img = Image.open(io.BytesIO(contents))
    if img.mode != "RGB":
        img = img.convert("RGB")

    # Save to disk at /media/avatars/{user_id}.jpg
    media_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media")
    avatars_dir = os.path.join(media_dir, "avatars")
    os.makedirs(avatars_dir, exist_ok=True)
    file_path = os.path.join(avatars_dir, f"{user_id}.jpg")
    img.save(file_path, "JPEG")

    # Update avatar_url in database
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    avatar_url = f"/media/avatars/{user_id}.jpg"
    user.avatar_url = avatar_url
    await db.commit()

    # Cache avatar URL in Redis for 30 days
    redis = await get_redis()
    await redis.setex(f"avatar:{user_id}", 30 * 24 * 60 * 60, avatar_url)
    await redis.delete(f"user:{user_id}")

    # Return cached URL with a timestamp query parameter to bust browser caches
    return {"avatar_url": f"{avatar_url}?t={int(datetime.now(timezone.utc).timestamp())}"}


@router.delete("/me/avatar", status_code=200)
async def delete_avatar(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Update database column
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.avatar_url = None
    await db.commit()

    # Remove file from disk
    media_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media")
    file_path = os.path.join(media_dir, "avatars", f"{user_id}.jpg")
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            pass

    # Evict Redis cache keys
    redis = await get_redis()
    await redis.delete(f"avatar:{user_id}")
    await redis.delete(f"user:{user_id}")

    return {"message": "Avatar removed"}


@router.patch("/me/email", status_code=200)
async def change_email(
    body: ChangeEmailRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if body.new_email != body.confirm_new_email:
        raise HTTPException(status_code=422, detail="Emails do not match")

    # Load current user
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.email == body.new_email:
        raise HTTPException(status_code=400, detail="This is already your email")

    # Check if new email is already taken
    taken_result = await db.execute(select(User).where(User.email == body.new_email))
    if taken_result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="This email is already in use")

    # Store pending email changes
    user.pending_email = body.new_email
    user.email_verified = False
    await db.commit()

    # Invalidate Redis user cache
    redis = await get_redis()
    await redis.delete(f"user:{user_id}")

    # Send verification email
    await send_verification_email(user_id, body.new_email)

    return {"message": "Verification email sent"}


@router.get("/verify-email", status_code=200)
async def verify_email(
    token: str,
    db: AsyncSession = Depends(get_db)
):
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "email_verification":
            raise HTTPException(status_code=400, detail="Invalid token type")
        user_id = payload.get("sub")
        new_email = payload.get("new_email")
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    # Fetch user by id
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.pending_email != new_email:
        raise HTTPException(status_code=400, detail="Email verification mismatch")

    # Perform DB updates
    user.email = new_email
    user.pending_email = None
    user.email_verified = True
    await db.commit()

    # Invalidate Redis cache
    redis = await get_redis()
    await redis.delete(f"user:{user_id}")

    # Redirect to frontend profile with confirmation flag
    return RedirectResponse(url="http://localhost:3000/profile?email_verified=true")


@router.patch("/me/password", status_code=200)
async def change_password(
    body: ChangePasswordRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if len(body.new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    # Load current user
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Verify current password hash
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    if body.current_password == body.new_password:
        raise HTTPException(status_code=400, detail="New password must be different")

    # Hash and update
    user.password_hash = hash_password(body.new_password)
    await db.commit()

    # Invalidate all active Redis sessions
    redis = await get_redis()
    await invalidate_user_sessions(user_id, redis)
    await redis.delete(f"user:{user_id}")

    return {"message": "Password updated successfully"}


@router.patch("/me/name", status_code=200)
async def change_display_name(
    body: ChangeNameRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    name = body.display_name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name cannot be empty")
        
    if len(name) > 50:
        raise HTTPException(status_code=422, detail="Name must not exceed 50 characters")
        
    # Allowed: unicode letters, spaces, hyphens, apostrophes
    if not all(char.isalpha() or char.isspace() or char in "-'" for char in name):
        raise HTTPException(status_code=422, detail="Name contains invalid characters")
        
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.display_name = name
    await db.commit()
    
    # Invalidate Redis user cache
    redis = await get_redis()
    await redis.delete(f"user:{user_id}")
    
    return {"display_name": name}



@router.delete("/me", status_code=204)
async def delete_me(
    authorization: str = Header(...),
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await db.delete(user)
    await db.commit()

    # Clean up avatar on disk
    media_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media")
    file_path = os.path.join(media_dir, "avatars", f"{user_id}.jpg")
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception:
            pass

    # Evict sessions and caches
    redis = await get_redis()
    await invalidate_user_sessions(user_id, redis)
    await redis.delete(f"avatar:{user_id}")
    await redis.delete(f"user:{user_id}")

    # Invalidate the current session token used for request
    token = authorization.split(" ", 1)[1]
    await redis.delete(f"session:{token}")

    return
