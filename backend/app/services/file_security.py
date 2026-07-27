import os
import magic
from fastapi import HTTPException, UploadFile, status

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_AUDIO_TYPES = {
    "audio/webm", "audio/ogg", "audio/wav", "audio/mpeg",
    "audio/mp4", "audio/flac", "audio/x-wav", "audio/mp3",
    "video/webm"
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
    if mime not in allowed_types:
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
