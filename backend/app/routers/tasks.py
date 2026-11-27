"""
Feature 3 — AI Task Extraction router.
"""
import json
import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.clerk import get_current_user
from app.database import get_db
from app.limiter import limiter
from app.services.ai_tasks import extract_tasks
from app.services.credit_service import check_and_deduct_credits, ensure_sufficient_credits
from app.services.note_service import get_note

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["tasks"])


@router.post("/{note_id}/extract-tasks")
@limiter.limit("10/minute")
async def extract_note_tasks(
    request: Request,
    note_id: uuid.UUID,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Extract action items from note content using AI."""
    note = await get_note(note_id, uuid.UUID(user_id), db)

    content_to_extract = note.content
    if note.note_type == "checklist" and note.content:
        try:
            data = json.loads(note.content)
            if isinstance(data, dict) and "ai_context" in data:
                content_to_extract = data["ai_context"]
        except json.JSONDecodeError:
            pass

    if not content_to_extract or not content_to_extract.strip():
        return {"tasks": []}

    await ensure_sufficient_credits(user_id, "task_extraction", cost=3, db=db)
    await db.commit()

    try:
        tasks = await extract_tasks(content_to_extract)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Task extraction failed for note %s: %s", note_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not extract tasks — please try again",
        )

    await check_and_deduct_credits(user_id, "task_extraction", cost=3, db=db)
    return {"tasks": tasks}
