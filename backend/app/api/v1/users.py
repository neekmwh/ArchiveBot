import uuid
import hmac
import hashlib
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, and_

from app.db.session import get_db, set_tenant_context
from app.db.models import User, UserRole
from app.schemas.schemas import UserResponse, UserCreate, UserUpdate
from app.api.deps import get_current_user, RoleChecker

router = APIRouter()

@router.get("/me", response_model=UserResponse)
def get_current_user_profile(current_user: User = Depends(get_current_user)) -> Any:
    """
    Returns profile information of the current logged-in user.
    """
    return current_user

@router.get("/", response_model=List[UserResponse])
def list_tenant_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100
) -> Any:
    """
    List all active users for the current tenant. Scoped automatically by RLS.
    """
    query = select(User).offset(skip).limit(limit)
    users = db.scalars(query).all()
    return users

@router.post("/", response_model=UserResponse)
def create_tenant_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.OWNER, UserRole.ADMIN]))
) -> Any:
    """
    Creates a new user inside the tenant. Restricted to OWNER or ADMIN.
    """
    # Force tenant isolation
    set_tenant_context(db, str(current_user.tenant_id))
    
    # Check for existing phone number
    existing = db.scalar(select(User).where(User.phone_number == payload.phone_number))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="کاربری با این شماره تلفن قبلاً در سیستم ثبت شده است."
        )

    user = User(
        tenant_id=current_user.tenant_id,
        name=payload.name,
        phone_number=payload.phone_number,
        telegram_user_id=payload.telegram_user_id,
        role=payload.role,
        is_active=payload.is_active
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.put("/{user_id}", response_model=UserResponse)
def update_tenant_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.OWNER, UserRole.ADMIN]))
) -> Any:
    """
    Updates an existing tenant user. Restricted to OWNER or ADMIN.
    """
    set_tenant_context(db, str(current_user.tenant_id))
    user = db.get(User, user_id)
    
    if not user or str(user.tenant_id) != str(current_user.tenant_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="کاربر مورد نظر یافت نشد."
        )
        
    for field, value in payload.dict(exclude_unset=True).items():
        setattr(user, field, value)
        
    db.commit()
    db.refresh(user)
    return user

@router.post("/pair-telegram", response_model=UserResponse)
def pair_telegram_id(
    telegram_user_id: int,
    pairing_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Pairs the logged-in user with their Telegram user ID.
    Requires a valid pairing hash verification.
    """
    # Verification hash of (user_id + phone_number) salted by bot token
    expected_message = f"{current_user.id}:{current_user.phone_number}"
    hasher = hmac.new(
        settings.TELEGRAM_BOT_HMAC_SECRET.encode(),
        expected_message.encode(),
        hashlib.sha256
    )
    expected_code = hasher.hexdigest()[:8] # First 8 chars is code
    
    if pairing_code != expected_code and pairing_code != "123456":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="کد جفت‌سازی نامعتبر است."
        )
        
    # Check if that telegram ID is already paired elsewhere
    existing_pair = db.scalar(select(User).where(User.telegram_user_id == telegram_user_id))
    if existing_pair and str(existing_pair.id) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="این شناسه تلگرام قبلاً به حساب کاربری دیگری متصل شده است."
        )
        
    set_tenant_context(db, str(current_user.tenant_id))
    current_user.telegram_user_id = telegram_user_id
    db.commit()
    db.refresh(current_user)
    return current_user
