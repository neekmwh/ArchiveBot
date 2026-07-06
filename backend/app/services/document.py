import logging
import uuid
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select, func, and_
from fastapi import HTTPException, status

from app.db.models import Document, DocumentDraft, DocumentStatus, DraftStep, User, AuditLog
from app.repositories import doc_repo, draft_repo
from app.db.session import set_tenant_context
from app.core.sanitizer import sanitize_string

logger = logging.getLogger("contractor_crm.services.document")

def get_current_jalali_year() -> int:
    """
    Returns the current Jalali (Persian Shamsi) year.
    Uses Gregorian date conversion math.
    For March 21, 2026, it will return 1405.
    """
    today = datetime.utcnow()
    g_y = today.year
    g_m = today.month
    g_d = today.day
    
    # Standard Persian New Year threshold check
    if g_m < 3 or (g_m == 3 and g_d < 21):
        return g_y - 622
    else:
        return g_y - 621

def generate_internal_id(db: Session, tenant_id: str) -> str:
    """
    Generates a sequential internal document ID for the tenant.
    Format: DOC-[JALALI_YEAR]-[SEQUENTIAL_THREE_DIGIT_COUNTER]
    Example: DOC-1405-001
    """
    # Ensure multi-tenant context is active
    set_tenant_context(db, tenant_id)
    
    year = get_current_jalali_year()
    prefix = f"DOC-{year}-"
    
    # Query count of documents for this tenant in the current Jalali year
    query = select(func.count(Document.id)).where(
        and_(
            Document.tenant_id == tenant_id,
            Document.internal_id.like(f"{prefix}%")
        )
    )
    count = db.scalar(query) or 0
    sequence_num = count + 1
    
    # Return formatted internal ID
    return f"{prefix}{sequence_num:03d}"

class DocumentService:
    @staticmethod
    def register_from_draft(db: Session, draft_id: uuid.UUID, tenant_id: uuid.UUID, current_user_id: uuid.UUID) -> Document:
        """
        Converts a step-by-step DocumentDraft into an active physical Document.
        Generates a secure sequential internal_id, performs validation, and commits the record.
        """
        set_tenant_context(db, str(tenant_id))
        
        # 1. Fetch draft
        draft = db.get(DocumentDraft, draft_id)
        if not draft or str(draft.tenant_id) != str(tenant_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="پیش‌نویس مورد نظر یافت نشد یا دسترسی مجاز نیست."
            )
            
        metadata = draft.metadata_json or {}
        
        # 2. Validate metadata fields required for formal registration
        required_fields = ["doc_type", "doc_number", "doc_date", "physical_custodian_id"]
        missing = [f for f in required_fields if not metadata.get(f)]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"اطلاعات پیش‌نویس ناقص است. فیلدهای مقابل الزامی هستند: {', '.join(missing)}"
            )
            
        # Validate that physical custodian exists in this tenant
        custodian_id = uuid.UUID(str(metadata["physical_custodian_id"]))
        custodian = db.get(User, custodian_id)
        if not custodian or str(custodian.tenant_id) != str(tenant_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="تحویل‌گیرنده فیزیکی انتخاب شده معتبر نیست."
            )

        # 3. Generate a secure, sequential internal ID
        internal_id = generate_internal_id(db, str(tenant_id))
        
        # 4. Handle project link if provided
        project_id = None
        if metadata.get("project_id"):
            project_id = uuid.UUID(str(metadata["project_id"]))

        # 5. Build formal document object (with input sanitization)
        document = Document(
            tenant_id=tenant_id,
            project_id=project_id,
            internal_id=internal_id,
            doc_number=sanitize_string(metadata.get("doc_number")),
            doc_type=sanitize_string(metadata.get("doc_type")),
            doc_date=sanitize_string(metadata.get("doc_date")),
            description=sanitize_string(metadata.get("description")),
            physical_custodian_id=custodian_id,
            scan_file_path=draft.scan_file_path,
            status=DocumentStatus.ACTIVE
        )
        
        db.add(document)
        
        # Remove the draft since it has been elevated to a formal Document
        db.delete(draft)
        db.commit()
        db.refresh(document)
        
        logger.info(f"🎉 Document successfully registered. Internal ID: {internal_id}")
        return document

    @staticmethod
    def void_document(db: Session, document_id: uuid.UUID, tenant_id: uuid.UUID) -> Document:
        """
        Marks a document as VOIDED. S3 lifecycle policies will pick this up
        later to handle long-term archival or storage pruning.
        """
        set_tenant_context(db, str(tenant_id))
        document = db.get(Document, document_id)
        
        if not document or str(document.tenant_id) != str(tenant_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="سند مورد نظر یافت نشد."
            )
            
        if document.status == DocumentStatus.VOIDED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="این سند قبلاً باطل شده است."
            )
            
        document.status = DocumentStatus.VOIDED
        db.commit()
        db.refresh(document)
        
        logger.info(f"🚫 Document {document.internal_id} has been VOIDED.")
        return document

document_service = DocumentService()
