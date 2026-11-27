import io
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Header, HTTPException, Request, UploadFile, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.clerk import get_current_user
from app.config import settings
from app.database import get_db
from app.limiter import limiter
from app.models.user import User
from app.observability import audit_log
from app.redis_client import redis_delete_safe, redis_setex_safe
from app.schemas.users import ChangeEmailRequest, ChangeNameRequest, ChangePasswordRequest
from app.services.auth_service import (
    delete_user_and_cleanup,
    hash_password,
    invalidate_user_sessions,
    remove_avatar_file,
    verify_password,
)
from app.services.email_service import send_verification_email

router = APIRouter(prefix="/users", tags=["users"])

USER_NOT_FOUND_DETAIL = "User not found"


def _safe_path(base_dir: str, filename: str) -> str:
    """Resolve `filename` inside `base_dir` and raise 400 if path escapes the base."""
    resolved = os.path.realpath(os.path.join(base_dir, filename))
    real_base = os.path.realpath(base_dir)
    if not resolved.startswith(real_base + os.sep) and resolved != real_base:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file path",
        )
    return resolved


@router.get("/me", status_code=200)
@limiter.limit("60/minute")
async def get_me(
    request: Request,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND_DETAIL)

    return {
        "id": str(user.id),
        "clerk_user_id": user.clerk_user_id,
        "email": user.email,
        "name": user.name,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "credit_balance": user.credit_balance,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


@router.post(
    "/me/avatar",
    status_code=200,
    responses={
        400: {"description": "Invalid image file"},
        404: {"description": USER_NOT_FOUND_DETAIL},
        413: {"description": "Image must be under 5MB"},
    },
)
@limiter.limit("10/minute")
async def upload_avatar(
    request: Request,
    file: Annotated[UploadFile, File(...)],
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    from app.services.file_security import ALLOWED_IMAGE_TYPES, validate_file

    contents, _ = await validate_file(file, ALLOWED_IMAGE_TYPES, max_size=5 * 1024 * 1024)

    try:
        img = Image.open(io.BytesIO(contents))
        img.verify()
        img = Image.open(io.BytesIO(contents))
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid image file")

    if img.mode != "RGB":
        img = img.convert("RGB")

    media_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media")
    avatars_dir = os.path.join(media_dir, "avatars")
    os.makedirs(avatars_dir, exist_ok=True)
    file_path = _safe_path(avatars_dir, f"{user_id}.jpg")
    img.save(file_path, "JPEG")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND_DETAIL)

    avatar_url = f"/media/avatars/{user_id}.jpg"
    user.avatar_url = avatar_url
    await db.commit()

    await redis_setex_safe(f"user:{user_id}:avatar", 30 * 24 * 60 * 60, avatar_url, cache_name="avatar")
    await redis_delete_safe(f"user:{user_id}", cache_name="user")

    return {"avatar_url": f"{avatar_url}?t={int(datetime.now(timezone.utc).timestamp())}"}


@router.delete(
    "/me/avatar",
    status_code=200,
    responses={404: {"description": USER_NOT_FOUND_DETAIL}},
)
@limiter.limit("10/minute")
async def delete_avatar(
    request: Request,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND_DETAIL)

    user.avatar_url = None
    await db.commit()

    remove_avatar_file(user_id)
    await redis_delete_safe(f"user:{user_id}:avatar", f"user:{user_id}", cache_name="avatar")

    return {"message": "Avatar removed"}


@router.patch(
    "/me/email",
    status_code=200,
    responses={
        400: {"description": "This is already your email"},
        404: {"description": USER_NOT_FOUND_DETAIL},
        409: {"description": "This email is already in use"},
        422: {"description": "Emails do not match"},
    },
)
@limiter.limit("5/minute")
async def change_email(
    request: Request,
    body: ChangeEmailRequest,
    background_tasks: BackgroundTasks,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if body.new_email != body.confirm_new_email:
        raise HTTPException(status_code=422, detail="Emails do not match")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND_DETAIL)

    if user.email == body.new_email:
        raise HTTPException(status_code=400, detail="This is already your email")

    taken_result = await db.execute(select(User).where(User.email == body.new_email))
    if taken_result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="This email is already in use")

    user.pending_email = body.new_email
    user.email_verified = False
    await db.commit()

    await redis_delete_safe(f"user:{user_id}", cache_name="user")
    background_tasks.add_task(send_verification_email, user_id, body.new_email)
    audit_log(
        "email_change_requested",
        user_id=user_id,
        ip=request.client.host if request.client else None,
    )

    return {"message": "Verification email sent"}


@router.get(
    "/verify-email",
    status_code=200,
    responses={
        400: {"description": "Invalid or expired token"},
        404: {"description": USER_NOT_FOUND_DETAIL},
    },
)
@limiter.limit("5/minute")
async def verify_email(
    request: Request,
    token: str,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("type") != "email_verification":
            raise HTTPException(status_code=400, detail="Invalid token type")
        user_id = payload.get("sub")
        new_email = payload.get("new_email")
    except JWTError:
        audit_log("email_verify_failed", ip=request.client.host if request.client else None, outcome="failure")
        raise HTTPException(status_code=400, detail="Invalid or expired token")

    if not user_id or not new_email:
        raise HTTPException(status_code=400, detail="Invalid token payload")

    if not re.match(r"^[^@\s]+@[^@\s.]+\.[^@\s.]+$", new_email):
        raise HTTPException(status_code=400, detail="Invalid email address in token")

    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.id == uid))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND_DETAIL)

    if user.pending_email != new_email:
        raise HTTPException(status_code=400, detail="Email verification mismatch")

    user.email = new_email
    user.pending_email = None
    user.email_verified = True
    await db.commit()

    await redis_delete_safe(f"user:{user_id}", cache_name="user")
    audit_log("email_verified", user_id=user_id, ip=request.client.host if request.client else None)

    return RedirectResponse(url=f"{settings.frontend_url}/profile?email_verified=true")


@router.patch(
    "/me/password",
    status_code=200,
    responses={
        400: {"description": "New password must be different"},
        401: {"description": "Current password is incorrect"},
        404: {"description": USER_NOT_FOUND_DETAIL},
        422: {"description": "Password must be at least 8 characters"},
    },
)
@limiter.limit("5/minute")
async def change_password(
    request: Request,
    body: ChangePasswordRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND_DETAIL)

    if not user.password_hash or not verify_password(body.current_password, user.password_hash):
        audit_log(
            "password_change_failed",
            user_id=user_id,
            ip=request.client.host if request.client else None,
            outcome="failure",
        )
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    if body.current_password == body.new_password:
        raise HTTPException(status_code=400, detail="New password must be different")

    user.password_hash = hash_password(body.new_password)
    await db.commit()

    await invalidate_user_sessions(user_id)
    await redis_delete_safe(f"user:{user_id}", cache_name="user")
    audit_log("password_changed", user_id=user_id, ip=request.client.host if request.client else None)

    return {"message": "Password updated successfully"}


@router.patch(
    "/me/name",
    status_code=200,
    responses={
        404: {"description": USER_NOT_FOUND_DETAIL},
        422: {"description": "Validation error for display name"},
    },
)
@limiter.limit("10/minute")
async def change_display_name(
    request: Request,
    body: ChangeNameRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail=USER_NOT_FOUND_DETAIL)

    user.display_name = body.display_name
    await db.commit()

    await redis_delete_safe(f"user:{user_id}", cache_name="user")
    return {"display_name": body.display_name}


@router.delete(
    "/me",
    status_code=204,
    responses={404: {"description": USER_NOT_FOUND_DETAIL}},
)
@limiter.limit("5/minute")
async def delete_me(
    request: Request,
    authorization: Annotated[str, Header(...)],
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await delete_user_and_cleanup(user_id, db, authorization)
    audit_log(
        "account_deleted",
        user_id=user_id,
        ip=request.client.host if request.client else None,
        via="/users/me",
    )
