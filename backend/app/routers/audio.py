"""
Feature 2 — Audio Recording & Transcription: upload audio, transcribe via Groq Whisper.

POST /notes/{note_id}/audio — validate audio, save to disk, transcribe, cache result
"""
import logging
import os
import uuid

import aiofiles
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.groq_client import client
from app.models.note import Note
from app.redis_client import get_redis
from app.services.auth_service import decode_token
from app.services.note_service import get_note

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["audio"])

MEDIA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media", "audio")
# Max upload size: 10 MB
MAX_AUDIO_SIZE = 10 * 1024 * 1024
ALLOWED_AUDIO_TYPES = {
    "audio/webm", "audio/ogg", "audio/wav", "audio/mpeg",
    "audio/mp4", "audio/flac", "audio/x-wav", "audio/mp3",
    "video/webm",  # some browsers report webm audio as video/webm
}


async def get_current_user(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth header")
    token = authorization.split(" ", 1)[1]
    return await decode_token(token)


from pydantic import BaseModel

class TranscriptResponse(BaseModel):
    transcript: str


@router.post("/{note_id}/audio", response_model=TranscriptResponse, status_code=200)
async def upload_audio(
    note_id: uuid.UUID,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload audio for transcription via Groq Whisper.

    - Validates note exists and belongs to authenticated user
    - Validates file is a valid audio format — rejects non-audio uploads with 400
    - Saves to /media/audio/{note_id}.webm — overwrites if exists — O(1) write
    - Sends to Groq Whisper (whisper-large-v3) for transcription
    - On Groq error, returns 502 "Transcription service unavailable"
    - Saves transcript to transcript column by primary key — O(log n)
    - Caches in Redis: transcript:{note_id} TTL 7 days — O(1)
    - Invalidates stale cache before write
    """
    # Validate note ownership — returns 404 if not found
    await get_note(note_id, uuid.UUID(user_id), db)

    # Validate file type — O(1)
    content_type = file.content_type or ""
    if content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid audio format: {content_type}. Expected audio file."
        )

    # Read file bytes and validate size
    audio_bytes = await file.read()
    if len(audio_bytes) > MAX_AUDIO_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file exceeds 10MB limit"
        )
    if len(audio_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Audio file is empty"
        )

    # Ensure media directory exists
    os.makedirs(MEDIA_DIR, exist_ok=True)

    # Determine file extension from content type
    ext = "webm"
    if "wav" in content_type:
        ext = "wav"
    elif "mpeg" in content_type or "mp3" in content_type:
        ext = "mp3"
    elif "flac" in content_type:
        ext = "flac"

    # Save to disk — O(1) write (overwrites if exists)
    file_path = os.path.join(MEDIA_DIR, f"{note_id}.{ext}")
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(audio_bytes)

    # Send to Groq Whisper for transcription
    try:
        transcription = await client.audio.transcriptions.create(
            file=(f"{note_id}.{ext}", audio_bytes),
            model=settings.groq_whisper_model,
            language="en",
        )
        transcript_text = transcription.text.strip()
    except Exception as e:
        logger.error("Groq Whisper transcription error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Transcription service unavailable — please try again"
        )

    # Save transcript to DB by primary key — O(log n)
    await db.execute(
        update(Note).where(Note.id == note_id).values(transcript=transcript_text)
    )
    await db.commit()

    # Invalidate stale cache, then set new value — O(1) Redis operations
    redis = await get_redis()
    cache_key = f"transcript:{note_id}"
    await redis.delete(cache_key)
    await redis.setex(cache_key, settings.media_cache_ttl, transcript_text)

    return TranscriptResponse(transcript=transcript_text)
