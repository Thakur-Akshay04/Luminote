import base64
from datetime import datetime
from typing import Optional
import uuid

from fastapi import HTTPException, Response, status


def encode_cursor(*parts: object) -> str:
    """Encode composite keyset pagination fields into an opaque URL-safe cursor."""
    payload = "|".join(str(p) for p in parts)
    return base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii")


def decode_cursor(cursor: str, expected_parts: int) -> list[str]:
    """Decode an opaque cursor and validate its part count."""
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        parts = raw.split("|", expected_parts - 1)
        if len(parts) != expected_parts:
            raise ValueError("Part count mismatch")
        return parts
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pagination cursor")


def decode_timestamp_id_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    """Decode a `(timestamp, uuid)` keyset pagination cursor."""
    try:
        ts_s, id_s = decode_cursor(cursor, 2)
        return datetime.fromisoformat(ts_s), uuid.UUID(id_s)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid pagination cursor")


def set_pagination_headers(
    response: Response,
    next_cursor: Optional[str],
    limit_applied: bool,
) -> None:
    """Attach standard keyset pagination headers without breaking array response bodies."""
    if next_cursor:
        response.headers["X-Next-Cursor"] = next_cursor
        response.headers["X-Has-More"] = "true"
    elif limit_applied:
        response.headers["X-Has-More"] = "false"
