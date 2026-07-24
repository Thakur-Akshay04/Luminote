import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator


class ChecklistItem(BaseModel):
    """Single checklist item — validates id, text, checked fields."""
    id: str
    text: str
    checked: bool


class NoteCreate(BaseModel):
    title: Optional[str] = None
    content: str
    note_type: Optional[str] = "text"
    is_pinned: Optional[bool] = False
    is_favorite: Optional[bool] = False
    summary_format: Optional[str] = "paragraph"
    extract_alerts: Optional[bool] = True


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    note_type: Optional[str] = None
    checklist_items: Optional[list[ChecklistItem]] = None
    is_pinned: Optional[bool] = None
    is_favorite: Optional[bool] = None
    summary_format: Optional[str] = None
    extract_alerts: Optional[bool] = None

    @field_validator("checklist_items", mode="before")
    @classmethod
    def validate_checklist_items(cls, v: Any) -> Any:
        """Validate all items have id, text, and checked — return 422 if malformed."""
        if v is None:
            return v
        if not isinstance(v, list):
            raise ValueError("checklist_items must be a JSON array")
        for i, item in enumerate(v):
            if not isinstance(item, dict):
                raise ValueError(f"Item at index {i} must be an object")
            for field in ("id", "text", "checked"):
                if field not in item:
                    raise ValueError(f"Item at index {i} missing required field: {field}")
        return v


class NoteResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: Optional[str] = None
    content: str
    summary: Optional[str] = None
    tags: Optional[list[str]] = None
    note_type: Optional[str] = "text"
    media_url: Optional[str] = None
    transcript: Optional[str] = None
    checklist_items: Optional[list[dict]] = None
    chat_history: Optional[list[dict]] = None
    is_pinned: bool = False
    is_favorite: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AskRequest(BaseModel):
    question: str


class AskResponse(BaseModel):
    answer: str
    note_id: uuid.UUID
    chat_history: Optional[list[dict]] = None


class SummarizeRequest(BaseModel):
    format: str = "paragraph"  # "paragraph", "bullets", "actions"
    extract_alerts: bool = True


from app.schemas.alert import AlertResponse

class SummarizeResponse(BaseModel):
    note: NoteResponse
    alerts: list[AlertResponse]


class AIActionRequest(BaseModel):
    action: str  # "rewrite" | "translate" | "tone" | "grammar" | "simplify" | "expand"
    text: str
    param: Optional[str] = None


class AIActionResponse(BaseModel):
    result: str

