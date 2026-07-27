import os
import magic
from fastapi import HTTPException, UploadFile, status

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_AUDIO_TYPES = {
    "audio/webm", "audio/ogg", "audio/wav", "audio/mpeg",
    "audio/mp4", "audio/flac", "audio/x-wav", "audio/mp3",
    "audio/aac", "audio/m4a", "audio/x-m4a", "audio/x-matroska",
    "video/webm", "video/mp4", "video/x-matroska",
    "application/octet-stream", "application/x-matroska",
}


async def validate_file(file: UploadFile, allowed_types: set, max_size: int = MAX_FILE_SIZE) -> tuple[bytes, str]:
    """Validate file upload by checking content bytes with python-magic.

    - Enforces max size limit.
    - Validates MIME type from buffer bytes (not client header or extension).
    - Sanitizes filename to prevent path traversal attacks.
    """
    contents = await file.read()
    if len(contents) > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large — max {max_size // (1024 * 1024)}MB"
        )
    if len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File is empty"
        )

    # Validate MIME type from file content
    mime = magic.from_buffer(contents, mime=True)
    is_audio_allowed = (
        mime in allowed_types or
        (allowed_types == ALLOWED_AUDIO_TYPES and (
            mime.startswith("audio/") or
            mime.startswith("video/") or
            mime in {"application/octet-stream", "application/x-matroska"}
        ))
    )
    if not is_audio_allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type: {mime}"
        )

    # Sanitize filename — strip path traversal characters
    raw_filename = file.filename or "file"
    safe_name = os.path.basename(raw_filename).replace("..", "").replace("/", "").replace("\\", "")
    if not safe_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename"
        )

    await file.seek(0)
    return contents, safe_name
