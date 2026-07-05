import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.spreadsheet import Spreadsheet


def _default_sheet_id() -> str:
    return str(uuid.uuid4())


def _make_default_workbook(sheet_id: str) -> dict:
    """Return an empty workbook with one blank sheet."""
    return {
        sheet_id: {
            "cells": {},
            "columnWidths": {},
            "rowHeights": {},
            "mergedCells": [],
            "frozenRows": 0,
            "frozenCols": 0,
        }
    }


async def get_spreadsheets(user_id: uuid.UUID, db: AsyncSession) -> list[Spreadsheet]:
    result = await db.execute(
        select(Spreadsheet)
        .where(Spreadsheet.user_id == user_id)
        .order_by(Spreadsheet.updated_at.desc())
    )
    return list(result.scalars().all())


async def get_spreadsheet(
    spreadsheet_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> Spreadsheet:
    result = await db.execute(
        select(Spreadsheet).where(
            Spreadsheet.id == spreadsheet_id, Spreadsheet.user_id == user_id
        )
    )
    spreadsheet = result.scalar_one_or_none()
    if not spreadsheet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Spreadsheet not found")
    return spreadsheet


async def create_spreadsheet(
    user_id: uuid.UUID, title: str, db: AsyncSession
) -> Spreadsheet:
    sheet_id = _default_sheet_id()
    spreadsheet = Spreadsheet(
        user_id=user_id,
        title=title,
        workbook_data=_make_default_workbook(sheet_id),
        sheets=[{"id": sheet_id, "name": "Sheet1", "index": 0}],
        active_sheet_id=sheet_id,
    )
    db.add(spreadsheet)
    await db.commit()
    await db.refresh(spreadsheet)
    return spreadsheet


async def update_spreadsheet(
    spreadsheet_id: uuid.UUID,
    user_id: uuid.UUID,
    title: Optional[str],
    workbook_data: Optional[dict],
    sheets: Optional[list],
    active_sheet_id: Optional[str],
    db: AsyncSession,
) -> Spreadsheet:
    spreadsheet = await get_spreadsheet(spreadsheet_id, user_id, db)
    if title is not None:
        spreadsheet.title = title
    if workbook_data is not None:
        spreadsheet.workbook_data = workbook_data
    if sheets is not None:
        spreadsheet.sheets = sheets
    if active_sheet_id is not None:
        spreadsheet.active_sheet_id = active_sheet_id
    spreadsheet.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(spreadsheet)
    return spreadsheet


async def delete_spreadsheet(
    spreadsheet_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> None:
    spreadsheet = await get_spreadsheet(spreadsheet_id, user_id, db)
    await db.delete(spreadsheet)
    await db.commit()
