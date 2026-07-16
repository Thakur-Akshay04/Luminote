import uuid
import json
from typing import Optional
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.note import AskRequest, AskResponse, NoteCreate, NoteResponse, NoteUpdate, SummarizeRequest, SummarizeResponse
from app.services.ai_service import ask_question, summarize_note_with_ai
from app.services.auth_service import decode_token
from app.services.note_service import (
    create_note,
    delete_note,
    get_note,
    get_notes,
    update_note,
    sync_ai_alerts,
)

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


router = APIRouter(prefix="/notes", tags=["notes"])


async def get_current_user(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth header")
    token = authorization.split(" ", 1)[1]
    return await decode_token(token)


@router.get("", response_model=list[NoteResponse])
async def list_notes(
    tag: Optional[str] = None,
    note_type: Optional[str] = None,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    notes = await get_notes(uuid.UUID(user_id), tag, note_type, db)
    return notes


@router.post("", response_model=NoteResponse, status_code=201)
async def create(
    body: NoteCreate,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_note(
        uuid.UUID(user_id),
        body.title,
        body.content,
        db,
        background_tasks,
        note_type=body.note_type,
    )


@router.get("/{note_id}", response_model=NoteResponse)
async def get_one(
    note_id: uuid.UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_note(note_id, uuid.UUID(user_id), db)


@router.put("/{note_id}", response_model=NoteResponse)
async def update(
    note_id: uuid.UUID,
    body: NoteUpdate,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await update_note(
        note_id, uuid.UUID(user_id), body.title, body.content, db, background_tasks,
        note_type=body.note_type,
        checklist_items=body.checklist_items,
    )


@router.delete("/{note_id}", status_code=204)
async def remove(
    note_id: uuid.UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await delete_note(note_id, uuid.UUID(user_id), db)


@router.post("/{note_id}/ask", response_model=AskResponse)
async def ask(
    note_id: uuid.UUID,
    body: AskRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone

    note = await get_note(note_id, uuid.UUID(user_id), db)

    # Safely clone or initialize local list
    history = list(note.chat_history) if note.chat_history else []
    
    # Append new user message
    user_msg = {"role": "user", "content": body.question}
    history.append(user_msg)
    
    # Extract text from Tiptap JSON if applicable
    text_content = note.content
    if note.content.strip().startswith('{"') or note.content.strip().startswith('[{'):
        try:
            data = json.loads(note.content)
            if isinstance(data, dict) and data.get("type") == "doc":
                extracted = extract_text_from_tiptap_json(data).strip()
                if extracted:
                    text_content = extracted
        except Exception:
            pass

    # Call Groq Q&A with previous history (excluding user_msg because ask_question appends it)
    answer = await ask_question(text_content, body.question, history[:-1])
    
    # Append assistant response
    assistant_msg = {"role": "assistant", "content": answer}
    history.append(assistant_msg)
    
    # Save updates via direct attribute reassignment (triggers dirty state automatically)
    note.chat_history = history
    note.updated_at = datetime.now(timezone.utc)
    await db.commit()
    
    return AskResponse(answer=answer, note_id=note_id, chat_history=note.chat_history)


@router.post("/{note_id}/summarize", response_model=SummarizeResponse)
async def summarize(
    note_id: uuid.UUID,
    body: SummarizeRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone
    
    note = await get_note(note_id, uuid.UUID(user_id), db)
    if note.note_type in ("audio", "drawing"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="AI summarization is disabled for voice and drawing notes."
        )
    current_time_str = datetime.now(timezone.utc).isoformat()
    
    text_content = note.content
    if note.content.strip().startswith('{"') or note.content.strip().startswith('[{'):
        try:
            data = json.loads(note.content)
            if isinstance(data, dict) and data.get("type") == "doc":
                extracted = extract_text_from_tiptap_json(data).strip()
                if extracted:
                    text_content = extracted
        except Exception:
            pass

    enrichment = await summarize_note_with_ai(
        content=text_content,
        format=body.format,
        extract_alerts=body.extract_alerts,
        current_time_str=current_time_str
    )
    
    note.summary = enrichment.get("summary")
    note.tags = enrichment.get("tags", [])
    note.updated_at = datetime.now(timezone.utc)
    
    new_alerts = []
    if body.extract_alerts:
        new_alerts = await sync_ai_alerts(db, uuid.UUID(user_id), note_id, enrichment.get("alerts", []))
                
    await db.commit()
    await db.refresh(note)
    
    # Attach note title to returned alerts for validation serialization mapping
    for a in new_alerts:
        a.note_title = note.title
        
    return {
        "note": note,
        "alerts": new_alerts
    }


@router.post("/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
):
    import os
    import shutil

    # Validate that it is an image
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be an image"
        )
    
    # Generate unique filename
    filename_str = file.filename or "image.png"
    ext = os.path.splitext(filename_str)[1] or ".png"
    filename = f"{uuid.uuid4()}{ext}"
    
    media_base = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media")
    upload_dir = os.path.join(media_base, "uploads")
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, filename)
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        logger.error("Failed to save uploaded image: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save image"
        )
    
    return {"url": f"/media/uploads/{filename}"}
