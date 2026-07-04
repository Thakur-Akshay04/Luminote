from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from app.database import get_db
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UpdatePasswordRequest
from app.services.auth_service import login_user, register_user, decode_token, hash_password, verify_password
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


async def get_current_user(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid auth header")
    token = authorization.split(" ", 1)[1]
    return await decode_token(token)


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    user = await register_user(body.email, body.password, db)
    # Auto-login after register
    _, token = await login_user(body.email, body.password, db)
    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        email=user.email,
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    user, token = await login_user(body.email, body.password, db)
    return TokenResponse(
        access_token=token,
        user_id=str(user.id),
        email=user.email,
    )


@router.put("/password", status_code=200)
async def change_password(
    body: UpdatePasswordRequest,
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect current password")
        
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"message": "Password changed successfully"}


@router.delete("/account", status_code=204)
async def delete_account(
    authorization: str = Header(...),
    user_id: str = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    await db.delete(user)
    await db.commit()
    
    from app.redis_client import get_redis
    redis = await get_redis()
    token = authorization.split(" ", 1)[1]
    await redis.delete(f"session:{token}")
    return
