import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.note import Note
from app.models.alert import Alert
from app.redis_client import get_redis
from app.services.ai_service import get_embedding, summarize_note_with_ai


logger = logging.getLogger(__name__)


def extract_text_from_tiptap_json(node) -> str:
    if not node:
        return ""
    if isinstance(node, str):
        return node
    if isinstance(node, dict):
        if "text" in node and isinstance(node["text"], str):
            return node["text"]
        if "content" in node:
            return extract_text_from_tiptap_json(node["content"])
    if isinstance(node, list):
        return " ".join(extract_text_from_tiptap_json(child) for child in node if child)
    return ""


async def sync_ai_alerts(
    db: AsyncSession,
    user_id: uuid.UUID,
    note_id: uuid.UUID,
    alerts_data: list[dict],
) -> list[Alert]:
    """Delete previous AI alerts for this note and insert new AI-extracted alerts."""
    await db.execute(delete(Alert).where(Alert.note_id == note_id, Alert.created_by_ai == True))

    new_alerts = []
    for alert_data in alerts_data:
        try:
            title = alert_data.get("title", "Note Reminder")
            date_str = alert_data.get("date")
            if not date_str:
                continue
            time_str = alert_data.get("time", "09:00:00")
            alert_time = datetime.fromisoformat(f"{date_str}T{time_str}").replace(tzinfo=timezone.utc)

            new_alert = Alert(
                id=uuid.uuid4(),
                user_id=user_id,
                note_id=note_id,
                title=title,
                alert_time=alert_time,
                created_by_ai=True
            )
            db.add(new_alert)
            new_alerts.append(new_alert)
        except Exception as parse_err:
            logger.error("Failed to parse extracted alert %s: %s", alert_data, parse_err)

    return new_alerts


async def _run_ai_pipeline(note_id: uuid.UUID, content: str, session_factory) -> None:
    """Background task: enrich a note with AI summary, tags, and embedding."""
    try:
        # Check note_type first to avoid using model for voice (audio) and drawing features
        async with session_factory() as db:
            note = await db.get(Note, note_id)
            if not note:
                logger.warning("Note %s not found during AI pipeline execution", note_id)
                return
            note_type = note.note_type
            user_id = note.user_id

        text_content = content
        if content.strip().startswith('{"') or content.strip().startswith('[{'):
            try:
                data = json.loads(content)
                if isinstance(data, dict) and data.get("type") == "doc":
                    extracted = extract_text_from_tiptap_json(data).strip()
                    if extracted:
                        text_content = extracted
            except Exception as parse_err:
                logger.error("Failed to parse content as Tiptap JSON in AI pipeline: %s", parse_err)

        if note_type in ("audio", "drawing"):
            logger.info("Skipping AI summary task using model for note type '%s' (note %s)", note_type, note_id)
            embedding = await get_embedding(text_content)
            if embedding:
                async with session_factory() as db:
                    await db.execute(
                        update(Note).where(Note.id == note_id).values(
                            embedding=embedding,
                            updated_at=datetime.now(timezone.utc)
                        )
                    )
                    await db.commit()
            return

        current_time_str = datetime.now(timezone.utc).isoformat()
        enrichment, embedding = await asyncio.gather(
            summarize_note_with_ai(text_content, summary_format="paragraph", extract_alerts=True, current_time_str=current_time_str),
            get_embedding(text_content),
        )

        async with session_factory() as db:
            note = await db.get(Note, note_id)
            if not note:
                logger.warning("Note %s not found during AI pipeline execution", note_id)
                return

            values: dict = {
                "summary": enrichment.get("summary"),
                "tags": enrichment.get("tags", []),
                "updated_at": datetime.now(timezone.utc),
            }
            if embedding:
                values["embedding"] = embedding

            await db.execute(update(Note).where(Note.id == note_id).values(**values))

            # Sync AI Alerts
            await sync_ai_alerts(db, user_id, note_id, enrichment.get("alerts", []))

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
    note_type: Optional[str] = None,
) -> Note:
    note = Note(
        id=uuid.uuid4(),
        user_id=user_id,
        title=title,
        content=content,
        note_type=note_type or "text",
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
    note_type: Optional[str],
    db: AsyncSession,
) -> list[Note]:
    stmt = select(Note).where(Note.user_id == user_id).order_by(Note.updated_at.desc())
    if tag:
        stmt = stmt.where(Note.tags.contains([tag]))
    if note_type:
        stmt = stmt.where(Note.note_type == note_type)
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
    note_type: Optional[str] = None,
    checklist_items: Optional[list] = None,
) -> Note:
    note = await get_note(note_id, user_id, db)

    content_changed = content is not None and content != note.content

    values: dict = {"updated_at": datetime.now(timezone.utc)}
    if title is not None:
        values["title"] = title
    if content is not None:
        values["content"] = content
    if note_type is not None:
        values["note_type"] = note_type
    if checklist_items is not None:
        # Store as JSONB list — validated upstream by Pydantic
        values["checklist_items"] = [item if isinstance(item, dict) else item.model_dump() for item in checklist_items]

    await db.execute(update(Note).where(Note.id == note_id).values(**values))
    await db.commit()
    await db.refresh(note)

    # Invalidate checklist cache if items were updated — O(1)
    if checklist_items is not None:
        try:
            redis = await get_redis()
            await redis.delete(f"checklist:{note_id}")
            # Cache new value — O(1)
            cache_val = json.dumps(values["checklist_items"])
            await redis.setex(f"checklist:{note_id}", settings.checklist_cache_ttl, cache_val)
        except Exception as e:
            logger.warning("Redis checklist cache update failed: %s", e)

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
