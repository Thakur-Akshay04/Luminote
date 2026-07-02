import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AlertCreate(BaseModel):
    note_id: uuid.UUID
    title: str
    alert_time: datetime


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
