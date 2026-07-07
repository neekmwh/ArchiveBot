import uuid
from typing import Generator, List, Optional
from fastapi import Depends, HTTPException, status, Security
from fastapi.security import APIKeyHeader
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db, set_tenant_context, set_super_admin_context
from app.db.models import User, UserRole, Tenant
from app.schemas.schemas import TokenPayload

# Support both official Authorization header and an optional X-Auth-Token header for easier API playground integration
reusable_oauth2 = APIKeyHeader(name="Authorization", auto_error=False)
x_auth_header = APIKeyHeader(name="X-Auth-Token", auto_error=False)

def get_token(
    auth_header: Optional[str] = Security(reusable_oauth2),
    alt_header: Optional[str] = Security(x_auth_header)
) -> str:
    """
    Retrieves the raw JWT token from either the standard Authorization bearer header or the custom X-Auth-Token header.
    """
    token = auth_header or alt_header
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="توکن اعتبارسنجی ارائه نشده است."
        )
    
    # Strip Bearer prefix if present
    if token.lower().startswith("bearer "):
        token = token[7:]
    
    return token

def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(get_token)
) -> User:
    """
    Decodes the JWT token, fetches the user, and dynamically registers the tenant ID inside the PostgreSQL session.
    """
    try:
        payload = jwt.decode(
            token, 
            settings.SECRET_KEY, 
            algorithms=[settings.JWT_ALGORITHM]
        )
        user_id_str: str = payload.get("sub")
        tenant_id_str: str = payload.get("tenant_id")
        
        if not user_id_str or not tenant_id_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="شناسه کاربر یا مستأجر در توکن یافت نشد."
            )
            
        token_data = TokenPayload(
            sub=user_id_str,
            tenant_id=tenant_id_str,
            role=payload.get("role")
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="امضای توکن نامعتبر یا منقضی شده است."
        )

    # Fetch User
    user_id = uuid.UUID(token_data.sub)
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="کاربر مورد نظر یافت نشد."
        )
        
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="حساب کاربری شما غیرفعال شده است."
        )

    # Dynamic context registration for Postgres Row-Level Security
    if user.role == UserRole.SUPER_ADMIN:
        set_super_admin_context(db)
    else:
        set_tenant_context(db, str(user.tenant_id))
    
    return user

class RoleChecker:
    """
    Dependency to enforce role-based access control (RBAC).
    """
    def __init__(self, allowed_roles: List[UserRole]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="سطح دسترسی شما برای انجام این عملیات کافی نیست."
            )
        return current_user
