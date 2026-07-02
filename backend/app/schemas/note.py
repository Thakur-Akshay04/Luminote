import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class NoteCreate(BaseModel):
    title: Optional[str] = None
    content: str


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None


class NoteResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: Optional[str]
    content: str
    summary: Optional[str]
    tags: Optional[list[str]]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str
    note_id: uuid.UUID


class SummarizeRequest(BaseModel):
    format: str = "paragraph"  # "paragraph", "bullets", "actions"
    extract_alerts: bool = True


from app.schemas.alert import AlertResponse

class SummarizeResponse(BaseModel):
    note: NoteResponse
    alerts: list[AlertResponse]
