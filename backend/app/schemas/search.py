import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class SearchRequest(BaseModel):
    query: str


class SearchResultItem(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: Optional[str] = None
    content: str
    summary: Optional[str] = None
    tags: Optional[list[str]] = None
    similarity: float
    created_at: datetime
    updated_at: datetime


class SearchResponse(BaseModel):
    results: list[SearchResultItem]
    cached: bool = False
