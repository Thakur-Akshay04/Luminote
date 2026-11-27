import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

import aiofiles
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.clerk import get_current_user
from app.database import get_db
from app.limiter import limiter
from app.models.note import Note
from app.pagination import set_pagination_headers
from app.redis_client import bump_search_version
from app.schemas.note import (
    AIActionRequest,
    AIActionResponse,
    AskRequest,
    AskResponse,
    NoteCreate,
    NoteResponse,
    NoteUpdate,
    SummarizeRequest,
    SummarizeResponse,
)
from app.services.ai_service import ask_question, execute_ai_action, summarize_note_with_ai
from app.services.credit_service import check_and_deduct_credits, ensure_sufficient_credits
from app.services.note_service import (
    create_note,
    delete_note,
    get_note,
    get_notes,
    parse_note_text_content,
    sync_ai_alerts,
    update_note,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("", response_model=list[NoteResponse])
@limiter.limit("120/minute")
async def list_notes(
    request: Request,
    response: Response,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    tag: Optional[str] = None,
    note_type: Optional[str] = None,
    is_favorite: Optional[bool] = None,
    is_pinned: Optional[bool] = None,
    limit: Optional[int] = Query(default=None, ge=1, le=200),
    cursor: Optional[str] = None,
):
    notes, next_cursor = await get_notes(
        uuid.UUID(user_id),
        tag,
        note_type,
        db,
        is_favorite=is_favorite,
        is_pinned=is_pinned,
        limit=limit,
        cursor=cursor,
    )
    set_pagination_headers(response, next_cursor, limit is not None)
    return notes


@router.post("", response_model=NoteResponse, status_code=201)
@limiter.limit("30/minute")
async def create(
    request: Request,
    body: NoteCreate,
    background_tasks: BackgroundTasks,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await create_note(
        uuid.UUID(user_id),
        body.title,
        body.content,
        db,
        background_tasks,
        note_type=body.note_type,
        is_pinned=body.is_pinned,
        is_favorite=body.is_favorite,
        summary_format=body.summary_format,
        extract_alerts=body.extract_alerts,
    )


@router.get("/{note_id}", response_model=NoteResponse)
@limiter.limit("30/minute")
async def get_one(
    request: Request,
    note_id: uuid.UUID,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await get_note(note_id, uuid.UUID(user_id), db)


@router.put("/{note_id}", response_model=NoteResponse)
@limiter.limit("30/minute")
async def update(
    request: Request,
    note_id: uuid.UUID,
    body: NoteUpdate,
    background_tasks: BackgroundTasks,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await update_note(
        note_id,
        uuid.UUID(user_id),
        body.title,
        body.content,
        db,
        background_tasks,
        note_type=body.note_type,
        checklist_items=body.checklist_items,
        is_pinned=body.is_pinned,
        is_favorite=body.is_favorite,
        summary_format=body.summary_format,
        extract_alerts=body.extract_alerts,
    )


@router.delete("/{note_id}", status_code=204)
@limiter.limit("30/minute")
async def remove(
    request: Request,
    note_id: uuid.UUID,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await delete_note(note_id, uuid.UUID(user_id), db)


@router.post("/{note_id}/ask", response_model=AskResponse)
@limiter.limit("10/minute")
async def ask(
    request: Request,
    note_id: uuid.UUID,
    body: AskRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    uid = uuid.UUID(user_id)
    note = await get_note(note_id, uid, db)
    await ensure_sufficient_credits(user_id, "qa", cost=2, db=db)

    prior_history = list(note.chat_history) if note.chat_history else []
    text_content = parse_note_text_content(note.content)

    # End read transaction before slow external AI call so no DB locks/tx stay open
    await db.commit()

    answer = await ask_question(text_content, body.question, prior_history)

    # Lock note row during writeback to prevent concurrent Q&A turns overwriting each other
    locked_res = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == uid).with_for_update()
    )
    locked_note = locked_res.scalar_one_or_none()
    if not locked_note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    updated_history = list(locked_note.chat_history) if locked_note.chat_history else []
    updated_history.append({"role": "user", "content": body.question})
    updated_history.append({"role": "assistant", "content": answer})
    locked_note.chat_history = updated_history
    locked_note.updated_at = datetime.now(timezone.utc)

    await check_and_deduct_credits(user_id, "qa", cost=2, db=db)
    return AskResponse(answer=answer, note_id=note_id, chat_history=locked_note.chat_history)


@router.post("/{note_id}/summarize", response_model=SummarizeResponse)
@limiter.limit("10/minute")
async def summarize(
    request: Request,
    note_id: uuid.UUID,
    body: SummarizeRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    uid = uuid.UUID(user_id)
    note = await get_note(note_id, uid, db)
    if note.note_type == "audio":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="AI summarization is disabled for voice notes.",
        )

    await ensure_sufficient_credits(user_id, "summarize", cost=5, db=db)
    text_content = parse_note_text_content(note.content)
    await db.commit()

    current_time_str = datetime.now(timezone.utc).isoformat()
    enrichment = await summarize_note_with_ai(
        content=text_content,
        summary_format=body.format,
        extract_alerts=body.extract_alerts,
        current_time_str=current_time_str,
    )

    locked_res = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == uid).with_for_update()
    )
    locked_note = locked_res.scalar_one_or_none()
    if not locked_note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    locked_note.summary = enrichment.get("summary")
    locked_note.tags = enrichment.get("tags", [])
    locked_note.updated_at = datetime.now(timezone.utc)

    new_alerts = []
    if body.extract_alerts:
        new_alerts = await sync_ai_alerts(db, uid, note_id, enrichment.get("alerts", []))

    await check_and_deduct_credits(user_id, "summarize", cost=5, db=db)
    await db.refresh(locked_note)
    await bump_search_version(user_id)

    for alert in new_alerts:
        alert.note_title = locked_note.title

    return {
        "note": locked_note,
        "alerts": new_alerts,
    }


@router.post("/upload-image")
@limiter.limit("10/minute")
async def upload_image(
    request: Request,
    file: Annotated[UploadFile, File(...)],
    user_id: Annotated[str, Depends(get_current_user)],
):
    from app.services.file_security import ALLOWED_IMAGE_TYPES, validate_file

    contents, safe_name = await validate_file(file, ALLOWED_IMAGE_TYPES, max_size=10 * 1024 * 1024)

    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in {".png", ".jpg", ".jpeg", ".webp"}:
        ext = ".png"

    filename = f"{uuid.uuid4()}{ext}"

    media_base = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media")
    upload_dir = os.path.realpath(os.path.join(media_base, "uploads"))
    os.makedirs(upload_dir, exist_ok=True)

    file_path = os.path.realpath(os.path.join(upload_dir, filename))
    if not file_path.startswith(upload_dir + os.sep):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file path")

    try:
        async with aiofiles.open(file_path, "wb") as buffer:
            await buffer.write(contents)
    except Exception as exc:
        logger.exception("Failed to save uploaded image: %s", exc)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")

    return {"url": f"/media/uploads/{filename}"}


@router.post("/{note_id}/ai-action", response_model=AIActionResponse)
@limiter.limit("10/minute")
async def ai_action(
    request: Request,
    note_id: uuid.UUID,
    body: AIActionRequest,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await get_note(note_id, uuid.UUID(user_id), db)
    await ensure_sufficient_credits(user_id, "ai_action", cost=3, db=db)
    await db.commit()

    result = await execute_ai_action(action=body.action, text=body.text, param=body.param)
    await check_and_deduct_credits(user_id, "ai_action", cost=3, db=db)

    return AIActionResponse(result=result)
