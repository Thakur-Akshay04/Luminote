"""
Feature 2 — Audio Recording & Transcription: upload audio, transcribe on-demand via Groq Whisper.
"""
import asyncio
import glob
import logging
import os
import uuid
from typing import Annotated

import aiofiles
import groq
import magic
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from app.auth.clerk import get_current_user
from app.config import settings
from app.database import get_db
from app.groq_client import client
from app.limiter import limiter
from app.models.note import Note
from app.redis_client import bump_search_version, redis_delete_safe, redis_get_safe, redis_setex_safe
from app.services.credit_service import check_and_deduct_credits, ensure_sufficient_credits
from app.services.file_security import ALLOWED_AUDIO_TYPES, MAX_FILE_SIZE, validate_file
from app.services.note_service import get_note
from app.services.resilience import CircuitBreakerOpenError, groq_breaker, is_retryable_provider_error

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["audio"])

MEDIA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "media", "audio")


class AudioUploadResponse(BaseModel):
    media_url: str


class TranscriptResponse(BaseModel):
    transcript: str


def get_audio_extension(mime: str, filename: str) -> str:
    mime_map = {
        "audio/webm": ".webm",
        "video/webm": ".webm",
        "video/x-matroska": ".webm",
        "application/x-matroska": ".webm",
        "audio/ogg": ".ogg",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/mp4": ".mp4",
        "video/mp4": ".mp4",
        "audio/aac": ".aac",
        "audio/m4a": ".m4a",
        "audio/x-m4a": ".m4a",
        "audio/mpeg": ".mp3",
        "audio/mp3": ".mp3",
    }
    if mime in mime_map:
        return mime_map[mime]

    _, ext = os.path.splitext(filename)
    if ext and len(ext) <= 5:
        return ext.lower()
    return ".webm"


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=8),
    retry=retry_if_exception(is_retryable_provider_error),
    reraise=True,
)
async def _transcribe_with_retry(audio_bytes: bytes, filename: str = "recording.webm"):
    async def _invoke():
        return await asyncio.wait_for(
            client.audio.transcriptions.create(
                file=(filename, audio_bytes),
                model=settings.groq_whisper_model,
                language="en",
            ),
            timeout=20.0,
        )

    return await groq_breaker.call(_invoke)


@router.post("/{note_id}/audio", response_model=AudioUploadResponse, status_code=200)
@limiter.limit("20/minute")
async def upload_audio(
    request: Request,
    note_id: uuid.UUID,
    file: Annotated[UploadFile, File(...)],
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Upload audio, validate magic bytes, save to disk, update media_url, and invalidate cache."""
    await get_note(note_id, uuid.UUID(user_id), db)

    audio_bytes, safe_name = await validate_file(file, ALLOWED_AUDIO_TYPES, max_size=MAX_FILE_SIZE)
    mime = magic.from_buffer(audio_bytes, mime=True)
    ext = get_audio_extension(mime, safe_name)

    os.makedirs(MEDIA_DIR, exist_ok=True)
    for existing in glob.glob(os.path.join(MEDIA_DIR, f"{note_id}.*")):
        try:
            os.remove(existing)
        except OSError:
            pass

    file_path = os.path.join(MEDIA_DIR, f"{note_id}{ext}")
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(audio_bytes)

    media_url = f"/media/audio/{note_id}{ext}"

    await db.execute(
        update(Note).where(Note.id == note_id, Note.user_id == uuid.UUID(user_id)).values(
            media_url=media_url,
            note_type="audio",
        )
    )
    await db.commit()

    await redis_delete_safe(f"user:{user_id}:transcript:{note_id}", cache_name="transcript")
    return AudioUploadResponse(media_url=media_url)


@router.post("/{note_id}/transcribe", response_model=TranscriptResponse)
@limiter.limit("10/minute")
async def transcribe_audio(
    request: Request,
    note_id: uuid.UUID,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    force: bool = False,
):
    """Transcribe saved audio file on-demand via Groq Whisper, charging credits only on success."""
    note = await get_note(note_id, uuid.UUID(user_id), db)

    cache_key = f"user:{user_id}:transcript:{note_id}"
    if not force:
        cached_text = await redis_get_safe(cache_key, cache_name="transcript")
        if cached_text:
            return TranscriptResponse(transcript=cached_text)

        if note.transcript:
            await redis_setex_safe(cache_key, settings.media_cache_ttl, note.transcript, cache_name="transcript")
            return TranscriptResponse(transcript=note.transcript)

    # Check sufficient credits upfront, deduct ONLY after transcription succeeds
    await ensure_sufficient_credits(user_id, "transcription", cost=10, db=db)

    matching_files = glob.glob(os.path.join(MEDIA_DIR, f"{note_id}.*"))
    if not matching_files:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audio recording not found. Please record audio first.",
        )
    file_path = matching_files[0]
    filename = os.path.basename(file_path)

    try:
        async with aiofiles.open(file_path, "rb") as f:
            audio_bytes = await f.read()
    except Exception as exc:
        logger.exception("Failed to read audio file %s: %s", file_path, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error",
        )

    # Close read transaction before external Whisper call
    await db.commit()

    try:
        transcription = await _transcribe_with_retry(audio_bytes, filename=filename)
        transcript_text = transcription.text.strip()
    except CircuitBreakerOpenError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Transcription service temporarily unavailable — please try again shortly",
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="AI service timed out")
    except (groq.BadRequestError, groq.UnprocessableEntityError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported or invalid audio payload for transcription",
        )
    except Exception as exc:
        logger.exception("Groq Whisper transcription error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Transcription service unavailable — please try again",
        )

    await db.execute(
        update(Note).where(Note.id == note_id, Note.user_id == uuid.UUID(user_id)).values(
            transcript=transcript_text
        )
    )
    await check_and_deduct_credits(user_id, "transcription", cost=10, db=db)

    await redis_setex_safe(cache_key, settings.media_cache_ttl, transcript_text, cache_name="transcript")
    await bump_search_version(user_id)

    return TranscriptResponse(transcript=transcript_text)
