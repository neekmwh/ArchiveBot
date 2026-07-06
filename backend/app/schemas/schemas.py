import uuid
from datetime import datetime
from typing import Optional, Any, Dict, List
from pydantic import BaseModel, Field, EmailStr
from app.db.models import UserRole, ProjectStatus, DocumentStatus, DraftStep, TransferStatus, AccessRequestStatus

# ==============================================================================
# Shared/Base Schemas
# ==============================================================================

class TenantBase(BaseModel):
    name: str = Field(..., max_length=255, description="نام شرکت یا مستأجر")
    is_active: bool = True

class TenantCreate(TenantBase):
    pass

class TenantUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None

class TenantResponse(TenantBase):
    id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==============================================================================
# User Schemas
# ==============================================================================

class UserBase(BaseModel):
    name: str = Field(..., max_length=255, description="نام و نام خانوادگی")
    phone_number: str = Field(..., max_length=20, description="شماره تلفن همراه")
    telegram_user_id: Optional[int] = Field(None, description="شناسه عددی تلگرام")
    role: UserRole = Field(UserRole.USER, description="نقش کاربر در سیستم")
    is_active: bool = True

class UserCreate(UserBase):
    tenant_id: uuid.UUID

class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = None
    telegram_user_id: Optional[int] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None

class UserResponse(UserBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==============================================================================
# Project Schemas
# ==============================================================================

class ProjectBase(BaseModel):
    name: str = Field(..., max_length=255, description="نام پروژه پیمانکاری")
    status: ProjectStatus = ProjectStatus.ACTIVE

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[ProjectStatus] = None

class ProjectResponse(ProjectBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==============================================================================
# Document Schemas
# ==============================================================================

class DocumentBase(BaseModel):
    project_id: Optional[uuid.UUID] = None
    doc_number: Optional[str] = Field(None, max_length=100)
    doc_type: Optional[str] = Field(None, max_length=100)
    doc_date: Optional[str] = Field(None, max_length=20, description="تاریخ هجری شمسی")
    description: Optional[str] = Field(None, max_length=1000)
    physical_custodian_id: uuid.UUID
    scan_file_path: str = Field(..., max_length=500)
    status: DocumentStatus = DocumentStatus.ACTIVE

class DocumentCreate(DocumentBase):
    internal_id: Optional[str] = Field(None, description="شناسه داخلی سند. در صورت خالی بودن، خودکار تولید می‌شود.")

class DocumentUpdate(BaseModel):
    project_id: Optional[uuid.UUID] = None
    doc_number: Optional[str] = None
    doc_type: Optional[str] = None
    doc_date: Optional[str] = None
    description: Optional[str] = None
    physical_custodian_id: Optional[uuid.UUID] = None
    status: Optional[DocumentStatus] = None

class DocumentResponse(DocumentBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    internal_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==============================================================================
# Document Draft Schemas (Telegram/Web Step-by-Step Registration)
# ==============================================================================

class DocumentDraftBase(BaseModel):
    scan_file_path: str
    metadata_json: Dict[str, Any] = Field(default_factory=dict)
    current_step: DraftStep = DraftStep.UPLOAD_FILE

class DocumentDraftCreate(DocumentDraftBase):
    pass

class DocumentDraftUpdate(BaseModel):
    metadata_json: Optional[Dict[str, Any]] = None
    current_step: Optional[DraftStep] = None

class DocumentDraftResponse(DocumentDraftBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==============================================================================
# Custody Transfer Schemas
# ==============================================================================

class CustodyTransferBase(BaseModel):
    document_id: uuid.UUID
    receiver_id: uuid.UUID

class CustodyTransferCreate(CustodyTransferBase):
    pass

class CustodyTransferUpdate(BaseModel):
    status: TransferStatus

class CustodyTransferResponse(CustodyTransferBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    sender_id: uuid.UUID
    status: TransferStatus
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==============================================================================
# Access Request Schemas
# ==============================================================================

class AccessRequestBase(BaseModel):
    document_id: uuid.UUID

class AccessRequestCreate(AccessRequestBase):
    pass

class AccessRequestUpdate(BaseModel):
    status: AccessRequestStatus

class AccessRequestResponse(AccessRequestBase):
    id: uuid.UUID
    tenant_id: uuid.UUID
    user_id: uuid.UUID
    status: AccessRequestStatus
    decided_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==============================================================================
# Audit Log Schemas
# ==============================================================================

class AuditLogResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    action: str
    entity_name: str
    entity_id: Optional[uuid.UUID] = None
    details: Dict[str, Any]
    previous_record_hash: str
    current_record_hash: str
    created_at: datetime

    class Config:
        from_attributes = True


# ==============================================================================
# Authentication & Token Schemas
# ==============================================================================

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenPayload(BaseModel):
    sub: Optional[str] = None  # user_id
    tenant_id: Optional[str] = None
    role: Optional[str] = None

class LoginRequest(BaseModel):
    phone_number: str = Field(..., description="شماره همراه کاربر")
    otp_code: str = Field(..., description="کد یکبار مصرف ارسالی")

class TelegramAuthRequest(BaseModel):
    id: int = Field(..., description="شناسه کاربری تلگرام")
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: int = Field(..., description="زمان مهر زمانی ورود")
    hash: str = Field(..., description="امضای بررسی صحت داده‌های ارسالی از سمت تلگرام")
