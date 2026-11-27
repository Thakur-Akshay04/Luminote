import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import and_, delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.config import settings
from app.models.alert import Alert
from app.models.note import Note
from app.pagination import decode_cursor, encode_cursor
from app.redis_client import bump_search_version, redis_delete_safe, redis_setex_safe
from app.services.ai_service import get_embedding, summarize_note_with_ai

logger = logging.getLogger(__name__)


def extract_text_from_tiptap_json(node) -> str:
    """Recursively extract plain text from a Tiptap JSON document."""
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
            title = str(alert_data.get("title", "Note Reminder"))[:500]
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
                created_by_ai=True,
            )
            db.add(new_alert)
            new_alerts.append(new_alert)
        except Exception as parse_err:
            logger.exception("Failed to parse extracted alert %s: %s", alert_data, parse_err)

    return new_alerts


def parse_note_text_content(content: str) -> str:
    """Extract readable plain text when note content is stored as Tiptap JSON."""
    stripped = content.strip()
    if not (stripped.startswith('{"') or stripped.startswith("[{")):
        return content
    try:
        data = json.loads(content)
        if isinstance(data, dict) and data.get("type") == "doc":
            extracted = extract_text_from_tiptap_json(data).strip()
            return extracted or content
    except Exception as parse_err:
        logger.debug("Content is not Tiptap JSON: %s", parse_err)
    return content


async def _process_non_text_note(
    note_id: uuid.UUID,
    user_id: uuid.UUID,
    text_content: str,
    note_type: str,
    session_factory,
) -> None:
    logger.debug("Skipping AI summary for note type '%s' (note %s)", note_type, note_id)
    embedding = await get_embedding(text_content)
    if embedding:
        async with session_factory() as db:
            await db.execute(
                update(Note).where(Note.id == note_id).values(
                    embedding=embedding,
                    updated_at=datetime.now(timezone.utc),
                )
            )
            await db.commit()
        await bump_search_version(str(user_id))


async def _run_ai_pipeline(
    note_id: uuid.UUID,
    content: str,
    session_factory,
    summary_format: str = "paragraph",
    extract_alerts: bool = True,
) -> None:
    """Background task: enrich a note with AI summary, tags, and embedding."""
    try:
        async with session_factory() as db:
            row = (
                await db.execute(
                    select(Note.note_type, Note.user_id).where(Note.id == note_id)
                )
            ).first()
            if not row:
                logger.warning("Note %s not found during AI pipeline execution", note_id)
                return
            note_type, user_id = row[0], row[1]

        text_content = parse_note_text_content(content)

        if note_type in ("audio", "checklist"):
            await _process_non_text_note(note_id, user_id, text_content, note_type, session_factory)
            return

        current_time_str = datetime.now(timezone.utc).isoformat()
        enrichment, embedding = await asyncio.gather(
            summarize_note_with_ai(
                text_content,
                summary_format=summary_format,
                extract_alerts=extract_alerts,
                current_time_str=current_time_str,
            ),
            get_embedding(text_content),
        )

        async with session_factory() as db:
            exists = (await db.execute(select(Note.id).where(Note.id == note_id))).scalar_one_or_none()
            if not exists:
                logger.warning("Note %s deleted before AI pipeline writeback", note_id)
                return

            values: dict = {
                "summary": enrichment.get("summary"),
                "tags": enrichment.get("tags", []),
                "updated_at": datetime.now(timezone.utc),
            }
            if embedding:
                values["embedding"] = embedding

            await db.execute(update(Note).where(Note.id == note_id).values(**values))
            await sync_ai_alerts(db, user_id, note_id, enrichment.get("alerts", []))
            await db.commit()

        await bump_search_version(str(user_id))
        logger.info("AI pipeline complete for note %s", note_id)
    except Exception as exc:
        logger.exception("AI pipeline failed for note %s: %s", note_id, exc)


async def _update_checklist_cache(note_id: uuid.UUID, items: list, user_id: uuid.UUID) -> None:
    cache_key = f"user:{user_id}:checklist:{note_id}"
    await redis_delete_safe(cache_key, cache_name="checklist")
    await redis_setex_safe(cache_key, settings.checklist_cache_ttl, json.dumps(items), cache_name="checklist")


def _build_note_update_values(
    note: Note,
    title: Optional[str],
    content: Optional[str],
    note_type: Optional[str],
    checklist_items: Optional[list],
    is_pinned: Optional[bool],
    is_favorite: Optional[bool],
) -> dict:
    actual_note_type = note.note_type or note_type or "text"
    values: dict = {"updated_at": datetime.now(timezone.utc), "note_type": actual_note_type}
    if title is not None:
        values["title"] = title
    if content is not None:
        values["content"] = content
    if checklist_items is not None:
        values["checklist_items"] = [
            item if isinstance(item, dict) else item.model_dump() for item in checklist_items
        ]
    if is_pinned is not None:
        values["is_pinned"] = is_pinned
    if is_favorite is not None:
        values["is_favorite"] = is_favorite
    return values


def encode_note_cursor(note: Note) -> str:
    return encode_cursor(int(bool(note.is_pinned)), note.updated_at.isoformat(), note.id)


def decode_note_cursor(cursor: str) -> tuple[bool, datetime, uuid.UUID]:
    try:
        pinned_s, ts_s, id_s = decode_cursor(cursor, 3)
        return bool(int(pinned_s)), datetime.fromisoformat(ts_s), uuid.UUID(id_s)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pagination cursor")


async def create_note(
    user_id: uuid.UUID,
    title: Optional[str],
    content: str,
    db: AsyncSession,
    background_tasks,
    note_type: Optional[str] = "text",
    checklist_items: Optional[list] = None,
    media_url: Optional[str] = None,
    transcript: Optional[str] = None,
    is_pinned: Optional[bool] = False,
    is_favorite: Optional[bool] = False,
    summary_format: Optional[str] = None,
    extract_alerts: Optional[bool] = None,
) -> Note:
    note = Note(
        user_id=user_id,
        title=title,
        content=content,
        note_type=note_type or "text",
        media_url=media_url,
        transcript=transcript,
        is_pinned=is_pinned or False,
        is_favorite=is_favorite or False,
        checklist_items=[
            item if isinstance(item, dict) else item.model_dump() for item in checklist_items
        ]
        if checklist_items
        else None,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    await bump_search_version(str(user_id))

    from app.database import AsyncSessionLocal

    background_tasks.add_task(
        _run_ai_pipeline,
        note.id,
        content,
        AsyncSessionLocal,
        summary_format or "paragraph",
        extract_alerts if extract_alerts is not None else True,
    )

    return note


async def get_notes(
    user_id: uuid.UUID,
    tag: Optional[str],
    note_type: Optional[str],
    db: AsyncSession,
    is_favorite: Optional[bool] = None,
    is_pinned: Optional[bool] = None,
    limit: Optional[int] = None,
    cursor: Optional[str] = None,
) -> tuple[list[Note], Optional[str]]:
    """Fetch user notes without over-fetching heavy embedding vectors, with optional keyset pagination."""
    stmt = (
        select(Note)
        .options(defer(Note.embedding))
        .where(Note.user_id == user_id)
        .order_by(Note.is_pinned.desc(), Note.updated_at.desc(), Note.id.desc())
    )
    if tag:
        stmt = stmt.where(Note.tags.contains([tag]))
    if note_type:
        stmt = stmt.where(Note.note_type == note_type)
    if is_favorite is True:
        stmt = stmt.where(Note.is_favorite == True)
    if is_pinned is True:
        stmt = stmt.where(Note.is_pinned == True)

    if cursor:
        c_pinned, c_updated, c_id = decode_note_cursor(cursor)
        same_group = and_(
            Note.is_pinned == c_pinned,
            or_(
                Note.updated_at < c_updated,
                and_(Note.updated_at == c_updated, Note.id < c_id),
            ),
        )
        if c_pinned:
            stmt = stmt.where(or_(Note.is_pinned == False, same_group))
        else:
            stmt = stmt.where(same_group)

    if limit is not None:
        stmt = stmt.limit(limit + 1)

    result = await db.execute(stmt)
    notes = list(result.scalars().all())

    next_cursor: Optional[str] = None
    if limit is not None and len(notes) > limit:
        notes = notes[:limit]
        next_cursor = encode_note_cursor(notes[-1])

    return notes, next_cursor


async def get_note(note_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> Note:
    result = await db.execute(
        select(Note)
        .options(defer(Note.embedding))
        .where(Note.id == note_id, Note.user_id == user_id)
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
    is_pinned: Optional[bool] = None,
    is_favorite: Optional[bool] = None,
    summary_format: Optional[str] = None,
    extract_alerts: Optional[bool] = None,
) -> Note:
    note = await get_note(note_id, user_id, db)
    content_changed = content is not None and content != note.content

    values = _build_note_update_values(
        note, title, content, note_type, checklist_items, is_pinned, is_favorite
    )

    await db.execute(update(Note).where(Note.id == note_id, Note.user_id == user_id).values(**values))
    await db.commit()
    await db.refresh(note)
    await bump_search_version(str(user_id))

    if checklist_items is not None:
        await _update_checklist_cache(note_id, values["checklist_items"], user_id)

    if content_changed and content is not None:
        from app.database import AsyncSessionLocal

        background_tasks.add_task(
            _run_ai_pipeline,
            note.id,
            content,
            AsyncSessionLocal,
            summary_format or "paragraph",
            extract_alerts if extract_alerts is not None else True,
        )

    return note


async def delete_note(note_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> None:
    result = await db.execute(select(Note.id).where(Note.id == note_id, Note.user_id == user_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    await db.execute(delete(Note).where(Note.id == note_id, Note.user_id == user_id))
    await db.commit()
    await bump_search_version(str(user_id))
