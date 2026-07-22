import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth.clerk import get_current_user, verify_token
from app.models.alert import Alert
from app.models.note import Note
from app.schemas.alert import AlertCreate, AlertResponse
from app.services.note_service import get_note

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertResponse])
async def list_alerts(
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Alert, Note.title.label("note_title"))
        .outerjoin(Note, Alert.note_id == Note.id)
        .where(Alert.user_id == uuid.UUID(user_id))
        .order_by(Alert.alert_time.asc())
    )
    result = await db.execute(stmt)
    
    alerts = []
    for row in result.all():
        alert, note_title = row
        alert.note_title = note_title
        alerts.append(alert)
        
    return alerts


@router.post("", response_model=AlertResponse, status_code=201)
async def create(
    body: AlertCreate,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Verify note ownership
    note = await get_note(body.note_id, uuid.UUID(user_id), db)
    
    new_alert = Alert(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id),
        note_id=body.note_id,
        title=body.title,
        alert_time=body.alert_time,
        created_by_ai=False
    )
    db.add(new_alert)
    await db.commit()
    await db.refresh(new_alert)
    new_alert.note_title = note.title
    return new_alert


@router.delete("/{alert_id}", status_code=204)
async def remove(
    alert_id: uuid.UUID,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Alert).where(Alert.id == alert_id, Alert.user_id == uuid.UUID(user_id))
    result = await db.execute(stmt)
    alert = result.scalar_one_or_none()
    
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
        
    await db.delete(alert)
    await db.commit()


@router.websocket("/ws")
async def websocket_alerts(
    websocket: WebSocket,
    token: str,
    db: AsyncSession = Depends(get_db)
):
    try:
        user_id = await verify_token(token, db)
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    manager = websocket.app.state.alert_manager
    user_uuid = uuid.UUID(user_id)
    await manager.connect(user_uuid, websocket)

    try:
        while True:
            # Keep WebSocket open, wait for any message (ping/heartbeat) from client
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_uuid, websocket)
