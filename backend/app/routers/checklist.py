"""
Feature 3 — To-do Checklist: targeted JSONB update for toggling single checklist items.

PATCH /notes/{note_id}/checklist/{item_index} — toggle checked via jsonb_set — O(log n)
"""
import logging
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.auth.clerk import get_current_user
from app.database import get_db
from app.redis_client import get_redis
from app.services.note_service import get_note

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["checklist"])


class ToggleRequest(BaseModel):
    checked: bool


@router.patch("/{note_id}/checklist/{item_index}")
async def toggle_checklist_item(
    note_id: uuid.UUID,
    item_index: int,
    body: ToggleRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Toggle a single checklist item's checked state using targeted JSONB update.

    Uses jsonb_set for O(log n) update — no full array rewrite.
    Invalidates Redis cache after write — O(1).
    """
    # Validate note ownership — returns 404 if not found
    note = await get_note(note_id, uuid.UUID(user_id), db)

    # Validate checklist_items exists and index is in range — O(1)
    if not note.checklist_items or not isinstance(note.checklist_items, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Note has no checklist items")
    if item_index < 0 or item_index >= len(note.checklist_items):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item index out of range")

    # Targeted JSONB update using jsonb_set — O(log n), no full array rewrite
    stmt = text("""
        UPDATE notes
        SET checklist_items = jsonb_set(
            checklist_items,
            ARRAY[:idx, 'checked'],
            to_jsonb(CAST(:checked AS boolean))
        ),
        updated_at = NOW()
        WHERE id = :note_id AND user_id = :user_id
    """)
    await db.execute(stmt, {
        "idx": str(item_index),
        "checked": body.checked,
        "note_id": str(note_id),
        "user_id": user_id,
    })
    await db.commit()

    # Invalidate Redis cache — O(1)
    redis = await get_redis()
    cache_key = f"checklist:{note_id}"
    await redis.delete(cache_key)

    return {"status": "ok", "index": item_index, "checked": body.checked}
