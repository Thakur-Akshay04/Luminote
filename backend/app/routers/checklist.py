"""
Feature 3 — To-do Checklist: targeted JSONB update for toggling single checklist items.
"""
import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.clerk import get_current_user
from app.database import get_db
from app.limiter import limiter
from app.redis_client import bump_search_version, redis_delete_safe
from app.services.note_service import get_note

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["checklist"])


class ToggleRequest(BaseModel):
    checked: bool


@router.patch("/{note_id}/checklist/{item_index}")
@limiter.limit("30/minute")
async def toggle_checklist_item(
    request: Request,
    note_id: uuid.UUID,
    item_index: int,
    body: ToggleRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Toggle a single checklist item's checked state using targeted JSONB update."""
    note = await get_note(note_id, uuid.UUID(user_id), db)

    if not note.checklist_items or not isinstance(note.checklist_items, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Note has no checklist items")
    if item_index < 0 or item_index >= len(note.checklist_items):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item index out of range")

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
    await db.execute(
        stmt,
        {
            "idx": str(item_index),
            "checked": body.checked,
            "note_id": str(note_id),
            "user_id": user_id,
        },
    )
    await db.commit()

    await redis_delete_safe(f"user:{user_id}:checklist:{note_id}", cache_name="checklist")
    await bump_search_version(user_id)

    return {"status": "ok", "index": item_index, "checked": body.checked}
