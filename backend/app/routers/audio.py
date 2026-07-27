"""
Feature 2 — Audio Recording & Transcription: upload audio as mp3, transcribe on-demand via Groq Whisper.

POST  /notes/{note_id}/audio — save audio as .mp3 on disk + DB, invalidate cache
POST  /notes/{note_id}/transcribe — transcribe saved .mp3 via Groq Whisper, cache result
"""
import logging
import os
import uuid
from typing import Annotated

import aiofiles
from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile, status
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


import asyncio
from tenacity import retry, stop_after_attempt, wait_exponential
from app.services.file_security import validate_file, ALLOWED_AUDIO_TYPES, MAX_FILE_SIZE


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=8), reraise=True)
async def _transcribe_with_retry(audio_bytes: bytes):
    return await asyncio.wait_for(
        client.audio.transcriptions.create(
            file=("recording.mp3", audio_bytes),
            model=settings.groq_whisper_model,
            language="en",
        ),
        timeout=20.0
    )


@router.post("/{note_id}/audio", response_model=AudioUploadResponse, status_code=200)
async def upload_audio(
    note_id: uuid.UUID,
    file: Annotated[UploadFile, File(...)],
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Upload audio, save directly as .mp3 file, update media_url.

    - Validates note exists and belongs to authenticated user.
    - Validates MIME type from buffer bytes with python-magic.
    - Saves to /media/audio/{note_id}.mp3 — overwrites if exists.
    - Updates media_url in notes table.
    - Invalidates stale transcript cache.
    """
    # Validate note ownership
    await get_note(note_id, uuid.UUID(user_id), db)

    # Validate file size, magic MIME type from content bytes, and sanitize filename
    audio_bytes, _ = await validate_file(file, ALLOWED_AUDIO_TYPES, max_size=MAX_FILE_SIZE)

    # Ensure media directory exists
    os.makedirs(MEDIA_DIR, exist_ok=True)

    # Save to disk as .mp3 — O(1) write (overwrites if exists)
    file_path = os.path.join(MEDIA_DIR, f"{note_id}.mp3")
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(audio_bytes)

    media_url = f"/media/audio/{note_id}.mp3"

    # Update media_url and note_type in DB by primary key — O(log n)
    await db.execute(
        update(Note).where(Note.id == note_id).values(media_url=media_url, note_type="audio")
    )
    await db.commit()

    # Invalidate stale user-scoped transcript cache
    redis = await get_redis()
    cache_key = f"user:{user_id}:transcript:{note_id}"
    await redis.delete(cache_key)

    return AudioUploadResponse(media_url=media_url)


@router.post("/{note_id}/transcribe", response_model=TranscriptResponse)
async def transcribe_audio(
    note_id: uuid.UUID,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    force: bool = False,
):
    """Transcribe already saved .mp3 file for a note via Groq Whisper on-demand.

    - Check user-scoped Redis cache first.
    - If cache miss, read .mp3 file from disk.
    - Transcribe using Groq Whisper with retry & timeout.
    - Save transcript to DB and cache.
    """
    # Validate note ownership
    note = await get_note(note_id, uuid.UUID(user_id), db)

    # Check cache first — user ID scoped
    redis = await get_redis()
    cache_key = f"user:{user_id}:transcript:{note_id}"
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
        logger.exception("Failed to read audio file %s: %s", file_path, e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )

    # Send to Groq Whisper for transcription with retry & timeout
    try:
        transcription = await _transcribe_with_retry(audio_bytes)
        transcript_text = transcription.text.strip()
    except asyncio.TimeoutError:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="AI service timed out")
    except Exception as e:
        logger.exception("Groq Whisper transcription error: %s", e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Transcription service unavailable — please try again"
        )

    # Save transcript to DB
    await db.execute(
        update(Note).where(Note.id == note_id).values(transcript=transcript_text)
    )
    await db.commit()

    # Populate user-scoped cache
    await redis.setex(cache_key, settings.media_cache_ttl, transcript_text)

    return TranscriptResponse(transcript=transcript_text)

