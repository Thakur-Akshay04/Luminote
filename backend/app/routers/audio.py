"""
Feature 2 — Audio Recording & Transcription: upload audio as mp3, transcribe on-demand via Groq Whisper.

POST  /notes/{note_id}/audio — save audio as .mp3 on disk + DB, invalidate cache
POST  /notes/{note_id}/transcribe — transcribe saved .mp3 via Groq Whisper, cache result
"""
import logging
import os
import uuid

import aiofiles
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.groq_client import client
from app.auth.clerk import get_current_user
from app.models.note import Note
from app.redis_client import get_redis
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


from pydantic import BaseModel

class AudioUploadResponse(BaseModel):
    media_url: str


class TranscriptResponse(BaseModel):
    transcript: str


@router.post("/{note_id}/audio", response_model=AudioUploadResponse, status_code=200)
async def upload_audio(
    note_id: uuid.UUID,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Upload audio, save directly as .mp3 file, update media_url.

    - Validates note exists and belongs to authenticated user.
    - Saves to /media/audio/{note_id}.mp3 — overwrites if exists.
    - Updates media_url in notes table.
    - Invalidates stale transcript cache.
    """
    # Validate note ownership
    await get_note(note_id, uuid.UUID(user_id), db)

    # Validate file type
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

    # Save to disk as .mp3 — O(1) write (overwrites if exists)
    file_path = os.path.join(MEDIA_DIR, f"{note_id}.mp3")
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(audio_bytes)

    media_url = f"/media/audio/{note_id}.mp3"

    # Update media_url in DB by primary key — O(log n)
    await db.execute(
        update(Note).where(Note.id == note_id).values(media_url=media_url)
    )
    await db.commit()

    # Invalidate stale transcript cache
    redis = await get_redis()
    cache_key = f"transcript:{note_id}"
    await redis.delete(cache_key)

    return AudioUploadResponse(media_url=media_url)


@router.post("/{note_id}/transcribe", response_model=TranscriptResponse)
async def transcribe_audio(
    note_id: uuid.UUID,
    force: bool = False,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Transcribe already saved .mp3 file for a note via Groq Whisper on-demand.

    - Check Redis cache first.
    - If cache miss, read .mp3 file from disk.
    - Transcribe using Groq Whisper.
    - Save transcript to DB and cache.
    """
    # Validate note ownership
    note = await get_note(note_id, uuid.UUID(user_id), db)

    # Check cache first
    redis = await get_redis()
    cache_key = f"transcript:{note_id}"
    if not force:
        cached_text = await redis.get(cache_key)
        if cached_text:
            return TranscriptResponse(transcript=cached_text)

        # Check DB transcript if already present
        if note.transcript:
            await redis.setex(cache_key, settings.media_cache_ttl, note.transcript)
            return TranscriptResponse(transcript=note.transcript)

    # Read .mp3 file from disk
    file_path = os.path.join(MEDIA_DIR, f"{note_id}.mp3")
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audio recording not found. Please record audio first."
        )

    try:
        async with aiofiles.open(file_path, "rb") as f:
            audio_bytes = await f.read()
    except Exception as e:
        logger.error("Failed to read audio file %s: %s", file_path, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to read audio file from disk"
        )

    # Send to Groq Whisper for transcription
    try:
        transcription = await client.audio.transcriptions.create(
            file=("recording.mp3", audio_bytes),
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

    # Save transcript to DB
    await db.execute(
        update(Note).where(Note.id == note_id).values(transcript=transcript_text)
    )
    await db.commit()

    # Populate cache
    await redis.setex(cache_key, settings.media_cache_ttl, transcript_text)

    return TranscriptResponse(transcript=transcript_text)
