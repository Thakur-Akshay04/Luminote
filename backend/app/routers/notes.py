import uuid
from typing import Optional
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status
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
)
from app.models.alert import Alert

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["notes"])


async def get_current_user(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth header")
    token = authorization.split(" ", 1)[1]
    return await decode_token(token)


@router.get("", response_model=list[NoteResponse])
async def list_notes(
    tag: Optional[str] = None,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    notes = await get_notes(uuid.UUID(user_id), tag, db)
    return notes


@router.post("", response_model=NoteResponse, status_code=201)
async def create(
    body: NoteCreate,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_note(uuid.UUID(user_id), body.title, body.content, db, background_tasks)


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
        note_id, uuid.UUID(user_id), body.title, body.content, db, background_tasks
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
    note = await get_note(note_id, uuid.UUID(user_id), db)
    answer = await ask_question(note.content, body.question)
    return AskResponse(answer=answer, note_id=note_id)


@router.post("/{note_id}/summarize", response_model=SummarizeResponse)
async def summarize(
    note_id: uuid.UUID,
    body: SummarizeRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone
    from sqlalchemy import delete
    
    note = await get_note(note_id, uuid.UUID(user_id), db)
    current_time_str = datetime.now(timezone.utc).isoformat()
    
    enrichment = await summarize_note_with_ai(
        content=note.content,
        format=body.format,
        extract_alerts=body.extract_alerts,
        current_time_str=current_time_str
    )
    
    note.summary = enrichment.get("summary")
    note.tags = enrichment.get("tags", [])
    note.updated_at = datetime.now(timezone.utc)
    
    new_alerts = []
    if body.extract_alerts:
        # Delete old AI alerts
        await db.execute(delete(Alert).where(Alert.note_id == note_id, Alert.created_by_ai == True))
        
        for alert_data in enrichment.get("alerts", []):
            try:
                title = alert_data.get("title", "Note Reminder")
                date_str = alert_data.get("date")
                if not date_str:
                    continue
                time_str = alert_data.get("time", "09:00:00")
                alert_time = datetime.fromisoformat(f"{date_str}T{time_str}").replace(tzinfo=timezone.utc)
                
                new_alert = Alert(
                    id=uuid.uuid4(),
                    user_id=uuid.UUID(user_id),
                    note_id=note_id,
                    title=title,
                    alert_time=alert_time,
                    created_by_ai=True
                )
                db.add(new_alert)
                new_alerts.append(new_alert)
            except Exception as parse_err:
                logger.error("Failed to parse extracted alert %s: %s", alert_data, parse_err)
                
    await db.commit()
    await db.refresh(note)
    
    # Attach note title to returned alerts for validation serialization mapping
    for a in new_alerts:
        a.note_title = note.title
        
    return {
        "note": note,
        "alerts": new_alerts
    }
