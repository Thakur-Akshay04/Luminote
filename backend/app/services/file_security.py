import os
import magic
from fastapi import HTTPException, UploadFile, status

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
_READ_CHUNK_SIZE = 64 * 1024  # 64KB bounded chunk reads

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_AUDIO_EXTENSIONS = {".webm", ".ogg", ".wav", ".mp3", ".mp4", ".m4a", ".aac", ".flac", ".mkv"}
ALLOWED_AUDIO_TYPES = {
    "audio/webm", "audio/ogg", "audio/wav", "audio/mpeg",
    "audio/mp4", "audio/flac", "audio/x-wav", "audio/mp3",
    "audio/aac", "audio/m4a", "audio/x-m4a", "audio/x-matroska",
    "video/webm", "video/mp4", "video/x-matroska",
    "application/x-matroska",
}


async def _read_bounded(file: UploadFile, max_size: int) -> bytes:
    """Read upload stream in bounded chunks to prevent memory exhaustion on oversized payloads."""
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(_READ_CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > max_size:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File too large — max {max_size // (1024 * 1024)}MB",
            )
        chunks.append(chunk)
    return b"".join(chunks)


async def validate_file(file: UploadFile, allowed_types: set, max_size: int = MAX_FILE_SIZE) -> tuple[bytes, str]:
    """Validate file upload by streaming bounded bytes and verifying magic MIME type."""
    contents = await _read_bounded(file, max_size)
    if len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is empty",
        )

    # Sanitize filename — strip path traversal characters
    raw_filename = file.filename or "file"
    safe_name = os.path.basename(raw_filename).replace("..", "").replace("/", "").replace("\\", "")
    if not safe_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename",
        )

    # Validate MIME type from file content bytes
    mime = magic.from_buffer(contents, mime=True)
    _, ext = os.path.splitext(safe_name)
    is_audio_check = allowed_types == ALLOWED_AUDIO_TYPES
    is_allowed = (
        mime in allowed_types
        or (
            is_audio_check
            and (
                mime.startswith("audio/")
                or mime.startswith("video/")
                or (mime == "application/octet-stream" and ext.lower() in ALLOWED_AUDIO_EXTENSIONS)
            )
        )
    )
    if not is_allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported or invalid file type",
        )

    await file.seek(0)
    return contents, safe_name
