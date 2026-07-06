import uuid
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.db.session import get_db, set_tenant_context
from app.db.models import User, Document, DocumentStatus
from app.api.deps import get_current_user
from app.services.storage import storage_service
from app.services.access import access_service

router = APIRouter()

@router.post("/upload", status_code=status.HTTP_201_CREATED)
def upload_file_to_storage(
    file: UploadFile = File(..., description="فایل اسکن یا تصویر سند"),
    project_id: Optional[str] = Form(None, description="شناسه پروژه مرتبط (در صورت وجود)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Upload pipeline entry point:
    1. Stages upload in the isolated S3 Quarantine bucket.
    2. Performs ClamAV Antivirus scan.
    3. If clean, promotes to tenant-isolated production folder structure.
    4. Cleans up Quarantine bucket.
    """
    set_tenant_context(db, str(current_user.tenant_id))
    
    # Optional project association verification
    parsed_project_id = None
    if project_id:
        try:
            parsed_project_id = uuid.UUID(project_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="شناسه پروژه نامعتبر است."
            )

    # Invoke storage pipeline
    scan_file_path = storage_service.upload_pipeline(
        upload_file=file,
        tenant_id=current_user.tenant_id,
        project_id=parsed_project_id
    )

    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "scan_file_path": scan_file_path,
        "message": "فایل با موفقیت بارگذاری، اعتبارسنجی امنیتی، و ذخیره گردید."
    }

@router.get("/view/{document_id}")
def get_document_presigned_url(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Generates a highly secure temporary URL (valid for 5 minutes) to view the document.
    Enforces tenant-isolation and explicit digital access requests checks.
    """
    set_tenant_context(db, str(current_user.tenant_id))
    
    # 1. Fetch formal document
    document = db.get(Document, document_id)
    if not document or str(document.tenant_id) != str(current_user.tenant_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="سند مورد نظر یافت نشد."
        )
        
    if document.status == DocumentStatus.VOIDED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="این سند باطل گردیده است و فایل اسکن آن قابل مشاهده نیست."
        )

    # 2. Check digital access boundaries (OWNER/ADMIN, Physical Custodian, or Approved Access Request)
    has_access = access_service.check_user_has_access(
        db=db,
        document_id=document.id,
        user_id=current_user.id,
        user_role=current_user.role,
        tenant_id=current_user.tenant_id
    )
    
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="شما دسترسی دیجیتال لازم برای مشاهده اسکن این سند را ندارید. لطفاً درخواست دسترسی ثبت نمایید."
        )

    # 3. Generate secure presigned URL
    presigned_url = storage_service.generate_presigned_url(document.scan_file_path)

    return {
        "document_id": document.id,
        "internal_id": document.internal_id,
        "scan_file_path": document.scan_file_path,
        "presigned_url": presigned_url,
        "expires_in_seconds": 300
    }
