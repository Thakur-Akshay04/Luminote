import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class SpreadsheetCreate(BaseModel):
    title: str = "Untitled Spreadsheet"


class SpreadsheetUpdate(BaseModel):
    title: Optional[str] = None
    workbook_data: Optional[Any] = None
    sheets: Optional[Any] = None
    active_sheet_id: Optional[str] = None


class SpreadsheetResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    workbook_data: Optional[Any] = None
    sheets: Optional[Any] = None
    active_sheet_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
