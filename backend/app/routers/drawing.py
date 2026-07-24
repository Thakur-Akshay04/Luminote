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
from app.auth.clerk import get_current_user
from app.database import get_db
from app.models.note import Note
from app.redis_client import get_redis
from app.services.note_service import get_note

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["drawing"])

MEDIA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media", "drawings")
# Max upload size: 10 MB
MAX_IMAGE_SIZE = 10 * 1024 * 1024

from typing import List, Optional, Annotated
from pydantic import BaseModel

class DrawingRequest(BaseModel):
    image: str  # base64-encoded PNG data URL or raw base64


class SwitchDrawingRequest(BaseModel):
    version: int


class DrawingResponse(BaseModel):
    media_url: Optional[str] = None
    versions: List[str] = []


def get_version_files(note_id: uuid.UUID) -> list[str]:
    """Returns absolute paths of all version files for a note_id, ordered by version number."""
    if not os.path.exists(MEDIA_DIR):
        return []
    prefix = f"{note_id}_v"
    files = []
    for f in os.listdir(MEDIA_DIR):
        if f.startswith(prefix) and f.endswith(".png"):
            parts = f[len(prefix):-4]
            if parts.isdigit():
                files.append((int(parts), f))
    files.sort(key=lambda x: x[0])
    return [os.path.join(MEDIA_DIR, f[1]) for f in files]


def _renumber_drawing_versions(note_id: uuid.UUID, version_number: int) -> None:
    prefix = f"{note_id}_v"
    for f in sorted(os.listdir(MEDIA_DIR)):
        if f.startswith(prefix) and f.endswith(".png"):
            parts = f[len(prefix):-4]
            if parts.isdigit() and int(parts) > version_number:
                v = int(parts)
                old_path = os.path.join(MEDIA_DIR, f)
                new_path = os.path.join(MEDIA_DIR, f"{prefix}{v - 1}.png")
                os.rename(old_path, new_path)


def _calculate_new_active_version_url(media_url: str | None, version_number: int, note_id: uuid.UUID) -> str | None:
    if not media_url:
        return None
    parts = media_url.split("_v")
    if len(parts) <= 1 or not parts[-1].endswith(".png"):
        return None
    v_str = parts[-1][:-4]
    if not v_str.isdigit():
        return None

    active_version = int(v_str)
    if active_version > version_number:
        new_active = active_version - 1
    elif active_version == version_number:
        test_path = os.path.join(MEDIA_DIR, f"{note_id}_v{active_version}.png")
        if os.path.exists(test_path):
            new_active = active_version
        else:
            new_active = active_version - 1 if active_version - 1 >= 1 else None
    else:
        new_active = active_version

    return f"/media/drawings/{note_id}_v{new_active}.png" if new_active is not None else None


async def migrate_legacy_drawing(note_id: uuid.UUID, db: AsyncSession) -> None:
    """Migrates a legacy drawing (note_id.png) to note_id_v1.png if it exists."""
    os.makedirs(MEDIA_DIR, exist_ok=True)
    old_file_path = os.path.join(MEDIA_DIR, f"{note_id}.png")
    if os.path.exists(old_file_path):
        new_file_path = os.path.join(MEDIA_DIR, f"{note_id}_v1.png")
        if not os.path.exists(new_file_path):
            os.rename(old_file_path, new_file_path)
            # Update db media_url to point to the migrated file
            new_media_url = f"/media/drawings/{note_id}_v1.png"
            await db.execute(
                update(Note).where(Note.id == note_id).values(media_url=new_media_url, note_type="drawing")
            )
            await db.commit()
            
            # Invalidate stale cache
            redis = await get_redis()
            cache_key = f"drawing:{note_id}"
            await redis.delete(cache_key)
            await redis.setex(cache_key, settings.media_cache_ttl, new_media_url)


@router.post("/{note_id}/drawing", response_model=DrawingResponse, status_code=200)
async def save_drawing(
    note_id: uuid.UUID,
    body: DrawingRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Save a new version of the drawing for a note.

    - Validates note exists and belongs to authenticated user (404/403)
    - Decodes base64 PNG and validates it is a valid image via Pillow
    - Saves to /media/drawings/{note_id}_v{next_version}.png
    - Updates media_url in notes table to the new version path
    - Caches the image URL in Redis: drawing:{note_id} TTL 7 days
    """
    # Validate note ownership — returns 404 if not found (get_note checks user_id)
    await get_note(note_id, uuid.UUID(user_id), db)

    # Migrate legacy if exists
    await migrate_legacy_drawing(note_id, db)

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

    # Determine the next version number
    version_files = get_version_files(note_id)
    if version_files:
        last_file = os.path.basename(version_files[-1])
        v_str = last_file[len(f"{note_id}_v"):-4]
        next_version = int(v_str) + 1 if v_str.isdigit() else 1
    else:
        next_version = 1

    file_path = os.path.join(MEDIA_DIR, f"{note_id}_v{next_version}.png")
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(image_bytes)

    # Build the URL
    media_url = f"/media/drawings/{note_id}_v{next_version}.png"

    # Update media_url and note_type in DB by primary key — O(log n)
    await db.execute(
        update(Note).where(Note.id == note_id).values(media_url=media_url, note_type="drawing")
    )
    await db.commit()

    # Invalidate stale cache, then set new value — O(1) Redis operations
    redis = await get_redis()
    cache_key = f"drawing:{note_id}"
    await redis.delete(cache_key)
    await redis.setex(cache_key, settings.media_cache_ttl, media_url)

    # Get updated versions
    new_version_files = get_version_files(note_id)
    versions = [f"/media/drawings/{os.path.basename(p)}" for p in new_version_files]

    return DrawingResponse(media_url=media_url, versions=versions)


@router.get("/{note_id}/drawing", response_model=DrawingResponse)
async def get_drawing(
    note_id: uuid.UUID,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get drawing versions and active URL for a note."""
    # Migrate legacy if exists
    await migrate_legacy_drawing(note_id, db)

    # Validate note ownership and fetch updated note
    note = await get_note(note_id, uuid.UUID(user_id), db)

    # Get all version files
    version_files = get_version_files(note_id)
    versions = [f"/media/drawings/{os.path.basename(p)}" for p in version_files]

    return DrawingResponse(
        media_url=note.media_url,
        versions=versions
    )


@router.post("/{note_id}/drawing/switch", response_model=DrawingResponse)
async def switch_drawing_version(
    note_id: uuid.UUID,
    body: SwitchDrawingRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Switch active drawing version."""
    # Validate note ownership
    await get_note(note_id, uuid.UUID(user_id), db)

    # Migrate legacy if exists
    await migrate_legacy_drawing(note_id, db)

    target_file = f"{note_id}_v{body.version}.png"
    target_path = os.path.join(MEDIA_DIR, target_file)
    if not os.path.exists(target_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Version {body.version} not found")

    media_url = f"/media/drawings/{target_file}"

    # Update database
    await db.execute(
        update(Note).where(Note.id == note_id).values(media_url=media_url, note_type="drawing")
    )
    await db.commit()

    # Update cache
    redis = await get_redis()
    cache_key = f"drawing:{note_id}"
    await redis.delete(cache_key)
    await redis.setex(cache_key, settings.media_cache_ttl, media_url)

    # Get versions
    version_files = get_version_files(note_id)
    versions = [f"/media/drawings/{os.path.basename(p)}" for p in version_files]

    return DrawingResponse(
        media_url=media_url,
        versions=versions
    )


@router.delete("/{note_id}/drawing/version/{version_number}", response_model=DrawingResponse)
async def delete_drawing_version(
    note_id: uuid.UUID,
    version_number: int,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Delete a specific version of the drawing and renumber subsequent versions."""
    # Migrate legacy if exists
    await migrate_legacy_drawing(note_id, db)

    # Validate note ownership
    note = await get_note(note_id, uuid.UUID(user_id), db)

    target_file = f"{note_id}_v{version_number}.png"
    target_path = os.path.join(MEDIA_DIR, target_file)
    if not os.path.exists(target_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Version {version_number} not found")

    # Delete the target file
    os.remove(target_path)

    # Renumber remaining versions and calculate new active media URL
    _renumber_drawing_versions(note_id, version_number)
    new_media_url = _calculate_new_active_version_url(note.media_url, version_number, note_id)

    # Update database
    await db.execute(
        update(Note).where(Note.id == note_id).values(media_url=new_media_url, note_type="drawing")
    )
    await db.commit()

    # Update cache
    redis = await get_redis()
    cache_key = f"drawing:{note_id}"
    await redis.delete(cache_key)
    if new_media_url:
        await redis.setex(cache_key, settings.media_cache_ttl, new_media_url)

    # Get updated versions
    version_files = get_version_files(note_id)
    versions = [f"/media/drawings/{os.path.basename(p)}" for p in version_files]

    return DrawingResponse(
        media_url=new_media_url,
        versions=versions
    )
