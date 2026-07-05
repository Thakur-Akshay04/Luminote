import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.spreadsheet import SpreadsheetCreate, SpreadsheetResponse, SpreadsheetUpdate
from app.services.auth_service import decode_token
from app.services.spreadsheet_service import (
    create_spreadsheet,
    delete_spreadsheet,
    get_spreadsheet,
    get_spreadsheets,
    update_spreadsheet,
)

router = APIRouter(prefix="/spreadsheets", tags=["spreadsheets"])


async def get_current_user(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth header")
    token = authorization.split(" ", 1)[1]
    return await decode_token(token)


@router.get("", response_model=list[SpreadsheetResponse])
async def list_spreadsheets(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_spreadsheets(uuid.UUID(user_id), db)


@router.post("", response_model=SpreadsheetResponse, status_code=201)
async def create(
    body: SpreadsheetCreate,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await create_spreadsheet(uuid.UUID(user_id), body.title, db)


@router.get("/{spreadsheet_id}", response_model=SpreadsheetResponse)
async def get_one(
    spreadsheet_id: uuid.UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await get_spreadsheet(spreadsheet_id, uuid.UUID(user_id), db)


@router.put("/{spreadsheet_id}", response_model=SpreadsheetResponse)
async def update(
    spreadsheet_id: uuid.UUID,
    body: SpreadsheetUpdate,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await update_spreadsheet(
        spreadsheet_id,
        uuid.UUID(user_id),
        body.title,
        body.workbook_data,
        body.sheets,
        body.active_sheet_id,
        db,
    )


@router.delete("/{spreadsheet_id}", status_code=204)
async def remove(
    spreadsheet_id: uuid.UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await delete_spreadsheet(spreadsheet_id, uuid.UUID(user_id), db)
