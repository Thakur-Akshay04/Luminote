"""
Feature 3 — AI Task Extraction router.

POST /notes/{note_id}/extract-tasks — extract tasks from note content using AI
"""
import logging
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.clerk import get_current_user
from app.database import get_db
from app.services.note_service import get_note
from app.services.ai_tasks import extract_tasks

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["tasks"])


@router.post("/{note_id}/extract-tasks")
async def extract_note_tasks(
    note_id: uuid.UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Extract action items from note content using AI.

    Calls Groq with the task extraction system prompt.
    Returns extracted tasks for frontend to merge with existing checklist.
    """
    # Validate note ownership
    note = await get_note(note_id, uuid.UUID(user_id), db)

    content_to_extract = note.content
    if note.note_type == "checklist" and note.content:
        import json
        try:
            data = json.loads(note.content)
            if isinstance(data, dict) and "ai_context" in data:
                content_to_extract = data["ai_context"]
        except json.JSONDecodeError:
            pass

    if not content_to_extract or not content_to_extract.strip():
        return {"tasks": []}

    try:
        tasks = await extract_tasks(content_to_extract)
        return {"tasks": tasks}
    except Exception as e:
        logger.error("Task extraction failed for note %s: %s", note_id, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not extract tasks — please try again"
        )
