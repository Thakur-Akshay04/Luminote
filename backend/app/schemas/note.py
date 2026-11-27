import uuid
from datetime import datetime
from typing import Any, Literal, Optional

import bleach
from pydantic import BaseModel, Field, field_validator

from app.schemas.alert import AlertResponse

NoteType = Literal["text", "checklist", "audio"]
SummaryFormat = Literal["paragraph", "bullets", "actions"]
AIActionType = Literal["rewrite", "translate", "tone", "grammar", "simplify", "expand"]


class ChecklistItem(BaseModel):
    """Single checklist item — validates id, text, checked fields."""

    id: str = Field(..., min_length=1, max_length=128)
    text: str = Field(..., max_length=1000)
    checked: bool

    @field_validator("text")
    @classmethod
    def sanitize_text(cls, v: str) -> str:
        return bleach.clean(v, tags=[], strip=True) if v else v


class NoteBaseMixin(BaseModel):
    @field_validator("title", check_fields=False)
    @classmethod
    def sanitize_title(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            return bleach.clean(v, tags=[], strip=True)
        return v


class NoteCreate(NoteBaseMixin):
    title: Optional[str] = Field(default=None, max_length=500)
    content: str = Field(..., max_length=500_000)
    note_type: Optional[NoteType] = "text"
    is_pinned: Optional[bool] = False
    is_favorite: Optional[bool] = False
    summary_format: Optional[SummaryFormat] = "paragraph"
    extract_alerts: Optional[bool] = True


class NoteUpdate(NoteBaseMixin):
    title: Optional[str] = Field(default=None, max_length=500)
    content: Optional[str] = Field(default=None, max_length=500_000)
    note_type: Optional[NoteType] = None
    checklist_items: Optional[list[ChecklistItem]] = Field(default=None, max_length=500)
    is_pinned: Optional[bool] = None
    is_favorite: Optional[bool] = None
    summary_format: Optional[SummaryFormat] = None
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
    question: str = Field(..., min_length=1, max_length=4000)


class AskResponse(BaseModel):
    answer: str
    note_id: uuid.UUID
    chat_history: Optional[list[dict]] = None


class SummarizeRequest(BaseModel):
    format: SummaryFormat = "paragraph"
    extract_alerts: bool = True


class SummarizeResponse(BaseModel):
    note: NoteResponse
    alerts: list[AlertResponse]


class AIActionRequest(BaseModel):
    action: AIActionType
    text: str = Field(..., min_length=1, max_length=20_000)
    param: Optional[str] = Field(default=None, max_length=100)


class AIActionResponse(BaseModel):
    result: str
