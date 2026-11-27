from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.clerk import get_current_user
from app.database import get_db
from app.limiter import limiter
from app.observability import audit_log
from app.services.auth_service import delete_user_and_cleanup

router = APIRouter(prefix="/auth", tags=["auth"])


@router.delete("/account", status_code=204, responses={404: {"description": "User not found"}})
@limiter.limit("5/minute")
async def delete_account(
    request: Request,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    authorization: Annotated[str | None, Header()] = None,
):
    await delete_user_and_cleanup(user_id, db, authorization)
    audit_log(
        "account_deleted",
        user_id=user_id,
        ip=request.client.host if request.client else None,
        via="/auth/account",
    )
