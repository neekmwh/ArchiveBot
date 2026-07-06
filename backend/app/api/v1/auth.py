import hashlib
import hmac
import logging
from datetime import datetime, timedelta
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.core.config import settings
from app.db.session import get_db, set_tenant_context
from app.db.models import User
from app.schemas.schemas import Token, LoginRequest, TelegramAuthRequest
from app.core.rate_limit import RateLimiter

logger = logging.getLogger("contractor_crm.api.auth")
router = APIRouter()

def create_access_token(subject: str, tenant_id: str, role: str) -> str:
    """
    Utility function to sign standard JWT tokens.
    """
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "tenant_id": str(tenant_id),
        "role": str(role)
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

@router.post("/login", response_model=Token, dependencies=[Depends(RateLimiter(requests_limit=5, window_seconds=60))])
def login_with_otp(payload: LoginRequest, db: Session = Depends(get_db)) -> Any:
    """
    Login endpoint via Phone + OTP code. 
    Accepts standard OTP code '1234' for developer simulator testing.
    """
    # Find active user by phone number
    query = select(User).where(User.phone_number == payload.phone_number)
    user = db.scalar(query)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="کاربری با این شماره تلفن یافت نشد."
        )
        
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="این حساب کاربری غیرفعال است."
        )
        
    # Simulate OTP check
    if payload.otp_code != "1234" and payload.otp_code != "123456":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="کد یکبار مصرف وارد شده نامعتبر یا منقضی شده است."
        )
        
    # Set multi-tenant local session context
    set_tenant_context(db, str(user.tenant_id))
    
    # Generate Token
    access_token = create_access_token(user.id, user.tenant_id, user.role.value)
    logger.info(f"🔑 User {user.name} logged in. Tenant: {user.tenant_id}")
    
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }

@router.post("/telegram-callback", response_model=Token, dependencies=[Depends(RateLimiter(requests_limit=5, window_seconds=60))])
def telegram_auth_callback(payload: TelegramAuthRequest, db: Session = Depends(get_db)) -> Any:
    """
    Validates HMAC signature of the Telegram Widget payload.
    If match is successful, returns access JWT.
    """
    # 1. Cryptographically verify the Telegram login hash
    # To authenticate data, we calculate SHA256 of bot token to get secret key,
    # then calculate HMAC-SHA256 of data-check-string using that key.
    if not settings.TELEGRAM_BOT_TOKEN:
        # Fallback for mock environments
        logger.warning("TELEGRAM_BOT_TOKEN not set. Skipping signature check.")
    else:
        auth_data = payload.dict(exclude={"hash"})
        # Sort and build check string
        sorted_keys = sorted(auth_data.keys())
        check_list = [f"{k}={auth_data[k]}" for k in sorted_keys if auth_data[k] is not None]
        data_check_string = "\n".join(check_list)
        
        # Calculate secret key
        secret_key = hashlib.sha256(settings.TELEGRAM_BOT_TOKEN.encode()).digest()
        calculated_hash = hmac.new(
            secret_key, 
            data_check_string.encode(), 
            hashlib.sha256
        ).hexdigest()
        
        if calculated_hash != payload.hash:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="امضای تلگرام نامعتبر است. صحت داده‌ها تایید نشد."
            )

    # 2. Find corresponding user by Telegram User ID
    query = select(User).where(User.telegram_user_id == payload.id)
    user = db.scalar(query)
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="حساب تلگرام شما به سامانه متصل نشده است. ابتدا از طریق وب‌سایت اقدام کنید."
        )
        
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="حساب کاربری شما غیرفعال شده است."
        )

    # Generate JWT
    access_token = create_access_token(user.id, user.tenant_id, user.role.value)
    logger.info(f"🤖 Telegram user {user.name} logged in via widget. Tenant: {user.tenant_id}")
    
    return {
        "access_token": access_token,
        "token_type": "bearer"
    }
