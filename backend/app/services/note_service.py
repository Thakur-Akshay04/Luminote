import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.note import Note
from app.services.ai_service import get_ai_enrichment, get_embedding

logger = logging.getLogger(__name__)


async def _run_ai_pipeline(note_id: uuid.UUID, content: str, session_factory) -> None:
    """Background task: enrich a note with AI summary, tags, and embedding."""
    try:
        enrichment, embedding = await asyncio.gather(
            get_ai_enrichment(content),
            get_embedding(content),
        )

        async with session_factory() as db:
            values: dict = {
                "summary": enrichment.get("summary"),
                "tags": enrichment.get("tags", []),
                "updated_at": datetime.now(timezone.utc),
            }
            if embedding:
                values["embedding"] = embedding

            await db.execute(update(Note).where(Note.id == note_id).values(**values))
            await db.commit()

        logger.info("AI pipeline complete for note %s", note_id)
    except Exception as e:
        logger.error("AI pipeline failed for note %s: %s", note_id, e)


async def create_note(
    user_id: uuid.UUID,
    title: Optional[str],
    content: str,
    db: AsyncSession,
    background_tasks,
) -> Note:
    note = Note(
        id=uuid.uuid4(),
        user_id=user_id,
        title=title,
        content=content,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)

    # Schedule AI enrichment in the background
    from app.database import AsyncSessionLocal
    background_tasks.add_task(_run_ai_pipeline, note.id, content, AsyncSessionLocal)

    return note


async def get_notes(
    user_id: uuid.UUID,
    tag: Optional[str],
    db: AsyncSession,
) -> list[Note]:
    stmt = select(Note).where(Note.user_id == user_id).order_by(Note.updated_at.desc())
    if tag:
        stmt = stmt.where(Note.tags.any(tag))
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_note(note_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Note:
    from fastapi import HTTPException, status

    result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    return note


async def update_note(
    note_id: uuid.UUID,
    user_id: uuid.UUID,
    title: Optional[str],
    content: Optional[str],
    db: AsyncSession,
    background_tasks,
) -> Note:
    note = await get_note(note_id, user_id, db)

    content_changed = content is not None and content != note.content

    values: dict = {"updated_at": datetime.now(timezone.utc)}
    if title is not None:
        values["title"] = title
    if content is not None:
        values["content"] = content

    await db.execute(update(Note).where(Note.id == note_id).values(**values))
    await db.commit()
    await db.refresh(note)

    if content_changed:
        from app.database import AsyncSessionLocal
        background_tasks.add_task(_run_ai_pipeline, note.id, content, AsyncSessionLocal)

    return note


async def delete_note(note_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> None:
    from fastapi import HTTPException, status

    result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user_id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    await db.execute(delete(Note).where(Note.id == note_id))
    await db.commit()
