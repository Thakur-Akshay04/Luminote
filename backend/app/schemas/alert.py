import uuid
from datetime import datetime
from typing import Optional

import bleach
from pydantic import BaseModel, Field, field_validator


class AlertCreate(BaseModel):
    note_id: uuid.UUID
    title: str = Field(..., min_length=1, max_length=500)
    alert_time: datetime

    @field_validator("title")
    @classmethod
    def sanitize_title(cls, v: str) -> str:
        cleaned = bleach.clean(v.strip(), tags=[], strip=True)
        if not cleaned:
            raise ValueError("Alert title cannot be empty")
        return cleaned


class AlertResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    note_id: uuid.UUID
    title: str
    alert_time: datetime
    is_notified: bool
    created_by_ai: bool
    created_at: datetime
    note_title: Optional[str] = None

    model_config = {"from_attributes": True}
