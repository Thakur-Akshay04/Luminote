import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import DateTime, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Spreadsheet(Base):
    __tablename__ = "spreadsheets"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False, default="Untitled Spreadsheet")

    # Full workbook data: cells, formatting, merges per sheet
    # Structure: { "sheetId": { "cells": { "A1": CellData }, "columnWidths": {}, "rowHeights": {}, "mergedCells": [], "frozenRows": 0, "frozenCols": 0 } }
    workbook_data: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True, default=dict)

    # Sheet metadata: [{ "id": str, "name": str, "index": int }]
    sheets: Mapped[Optional[Any]] = mapped_column(JSONB, nullable=True)

    active_sheet_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
      )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
