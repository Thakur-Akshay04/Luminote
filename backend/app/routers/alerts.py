import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect, status
from sqlalchemy import and_, delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.clerk import get_current_user, verify_token
from app.database import AsyncSessionLocal, get_db
from app.limiter import limiter
from app.models.alert import Alert
from app.models.note import Note
from app.pagination import decode_timestamp_id_cursor, encode_cursor, set_pagination_headers
from app.schemas.alert import AlertCreate, AlertResponse
from app.services.note_service import get_note

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertResponse])
@limiter.limit("120/minute")
async def list_alerts(
    request: Request,
    response: Response,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: Optional[int] = Query(default=None, ge=1, le=200),
    cursor: Optional[str] = None,
):
    stmt = (
        select(Alert, Note.title.label("note_title"))
        .outerjoin(Note, Alert.note_id == Note.id)
        .where(Alert.user_id == uuid.UUID(user_id))
        .order_by(Alert.alert_time.asc(), Alert.id.asc())
    )

    if cursor:
        c_time, c_id = decode_timestamp_id_cursor(cursor)
        stmt = stmt.where(
            or_(
                Alert.alert_time > c_time,
                and_(Alert.alert_time == c_time, Alert.id > c_id),
            )
        )

    if limit is not None:
        stmt = stmt.limit(limit + 1)

    result = await db.execute(stmt)
    rows = result.all()

    has_more = limit is not None and len(rows) > limit
    if has_more and limit is not None:
        rows = rows[:limit]

    alerts = []
    for alert, note_title in rows:
        alert.note_title = note_title
        alerts.append(alert)

    next_cursor = encode_cursor(alerts[-1].alert_time.isoformat(), alerts[-1].id) if has_more and alerts else None
    set_pagination_headers(response, next_cursor, limit is not None)

    return alerts


@router.post("", response_model=AlertResponse, status_code=201)
@limiter.limit("30/minute")
async def create(
    request: Request,
    body: AlertCreate,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    note = await get_note(body.note_id, uuid.UUID(user_id), db)

    new_alert = Alert(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id),
        note_id=body.note_id,
        title=body.title,
        alert_time=body.alert_time,
        created_by_ai=False,
    )
    db.add(new_alert)
    await db.commit()
    await db.refresh(new_alert)
    new_alert.note_title = note.title
    return new_alert


@router.delete("/{alert_id}", status_code=204, responses={404: {"description": "Alert not found"}})
@limiter.limit("30/minute")
async def remove(
    request: Request,
    alert_id: uuid.UUID,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = select(Alert).where(Alert.id == alert_id, Alert.user_id == uuid.UUID(user_id))
    result = await db.execute(stmt)
    alert = result.scalar_one_or_none()

    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    await db.delete(alert)
    await db.commit()


@router.delete("", status_code=204)
@limiter.limit("30/minute")
async def clear_all(
    request: Request,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = delete(Alert).where(Alert.user_id == uuid.UUID(user_id))
    await db.execute(stmt)
    await db.commit()


@router.patch("/{alert_id}/notified", status_code=200)
@limiter.limit("60/minute")
async def mark_notified(
    request: Request,
    alert_id: uuid.UUID,
    user_id: Annotated[str, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    stmt = select(Alert).where(Alert.id == alert_id, Alert.user_id == uuid.UUID(user_id))
    result = await db.execute(stmt)
    alert = result.scalar_one_or_none()

    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.is_notified = True
    await db.commit()
    return {"status": "ok"}


@router.websocket("/ws")
async def websocket_alerts(
    websocket: WebSocket,
    token: str,
):
    try:
        async with AsyncSessionLocal() as db:
            user_id = await verify_token(token, db)
    except Exception as exc:
        logger.warning("WebSocket auth failed: %s", exc)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    manager = websocket.app.state.alert_manager
    user_uuid = uuid.UUID(user_id)
    await manager.connect(user_uuid, websocket)

    try:
        now = datetime.now(timezone.utc)
        async with AsyncSessionLocal() as db:
            stmt = (
                select(Alert, Note.title)
                .outerjoin(Note, Alert.note_id == Note.id)
                .where(
                    Alert.user_id == user_uuid,
                    Alert.alert_time <= now,
                    Alert.is_notified == False,
                )
            )
            result = await db.execute(stmt)
            due_rows = result.all()

            notified_count = 0
            for alert, note_title in due_rows:
                payload = {
                    "type": "alert",
                    "id": str(alert.id),
                    "title": alert.title,
                    "note_id": str(alert.note_id),
                    "note_title": note_title,
                    "alert_time": alert.alert_time.isoformat(),
                }
                try:
                    await websocket.send_json(payload)
                    alert.is_notified = True
                    notified_count += 1
                except Exception as send_err:
                    logger.warning("Failed to send initial alert to user %s: %s", user_uuid, send_err)

            if notified_count > 0:
                await db.commit()

        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    except Exception as err:
        logger.warning("Alerts WebSocket closed for user %s: %s", user_uuid, err)
    finally:
        manager.disconnect(user_uuid, websocket)
