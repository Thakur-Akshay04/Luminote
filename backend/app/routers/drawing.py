"""
Feature 1 — Freehand Drawing: save/load drawing images for notes.

POST /notes/{note_id}/drawing — decode base64 PNG, validate, save to disk + DB, cache URL
GET  /notes/{note_id}/drawing — cache-first fetch of drawing URL
"""
import base64
import io
import logging
import os
import uuid

import aiofiles
from fastapi import APIRouter, Depends, Header, HTTPException, status
from PIL import Image
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.note import Note
from app.redis_client import get_redis
from app.services.auth_service import decode_token
from app.services.note_service import get_note

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["drawing"])

MEDIA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media", "drawings")
# Max upload size: 10 MB
MAX_IMAGE_SIZE = 10 * 1024 * 1024


async def get_current_user(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth header")
    token = authorization.split(" ", 1)[1]
    return await decode_token(token)


from pydantic import BaseModel

class DrawingRequest(BaseModel):
    image: str  # base64-encoded PNG data URL or raw base64


class DrawingResponse(BaseModel):
    media_url: str


@router.post("/{note_id}/drawing", response_model=DrawingResponse, status_code=200)
async def save_drawing(
    note_id: uuid.UUID,
    body: DrawingRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save a freehand drawing as base64 PNG for a note.

    - Validates note exists and belongs to authenticated user (404/403)
    - Decodes base64 PNG and validates it is a valid image via Pillow
    - Saves to /media/drawings/{note_id}.png — overwrites if exists
    - Updates media_url in notes table by primary key — O(log n)
    - Caches the image URL in Redis: drawing:{note_id} TTL 7 days — O(1)
    """
    # Validate note ownership — returns 404 if not found (get_note checks user_id)
    await get_note(note_id, uuid.UUID(user_id), db)

    # Strip data URL prefix if present
    raw_b64 = body.image
    if "," in raw_b64:
        raw_b64 = raw_b64.split(",", 1)[1]

    # Validate base64 size before decoding — O(1)
    if len(raw_b64) > MAX_IMAGE_SIZE * 4 // 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image exceeds 10MB limit")

    # Decode base64
    try:
        image_bytes = base64.b64decode(raw_b64)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid base64 encoding")

    # Validate it is a valid PNG image using Pillow — O(1) header check
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.verify()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid image format")

    # Ensure media directory exists
    os.makedirs(MEDIA_DIR, exist_ok=True)

    # Save to disk — O(1) write (overwrites if exists)
    file_path = os.path.join(MEDIA_DIR, f"{note_id}.png")
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(image_bytes)

    # Build the URL
    media_url = f"/media/drawings/{note_id}.png"

    # Update media_url in DB by primary key — O(log n)
    await db.execute(
        update(Note).where(Note.id == note_id).values(media_url=media_url)
    )
    await db.commit()

    # Invalidate stale cache, then set new value — O(1) Redis operations
    redis = await get_redis()
    cache_key = f"drawing:{note_id}"
    await redis.delete(cache_key)
    await redis.setex(cache_key, settings.media_cache_ttl, media_url)

    return DrawingResponse(media_url=media_url)


@router.get("/{note_id}/drawing", response_model=DrawingResponse)
async def get_drawing(
    note_id: uuid.UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get drawing URL for a note.

    - Check Redis cache first — O(1)
    - On miss, fetch from DB by primary key — O(log n)
    """
    # Validate note ownership
    note = await get_note(note_id, uuid.UUID(user_id), db)

    # Check Redis cache first — O(1)
    redis = await get_redis()
    cache_key = f"drawing:{note_id}"
    cached_url = await redis.get(cache_key)
    if cached_url:
        return DrawingResponse(media_url=cached_url)

    # Cache miss — fetch from DB (already loaded via get_note) — O(log n)
    if not note.media_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No drawing found for this note")

    # Populate cache — O(1)
    await redis.setex(cache_key, settings.media_cache_ttl, note.media_url)

    return DrawingResponse(media_url=note.media_url)
