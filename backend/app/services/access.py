import logging
import uuid
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.db.models import Document, AccessRequest, AccessRequestStatus, User, UserRole
from app.db.session import set_tenant_context

logger = logging.getLogger("contractor_crm.services.access")

class AccessService:
    @staticmethod
    def create_request(
        db: Session, 
        document_id: uuid.UUID, 
        user_id: uuid.UUID, 
        tenant_id: uuid.UUID
    ) -> AccessRequest:
        """
        Creates a new PENDING access request for a digital document.
        """
        set_tenant_context(db, str(tenant_id))
        
        # Verify document exists
        document = db.get(Document, document_id)
        if not document or str(document.tenant_id) != str(tenant_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="سند مورد نظر یافت نشد."
            )
            
        # Check if they are already the physical custodian (no need for digital request)
        if str(document.physical_custodian_id) == str(user_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="شما تحویل‌گیرنده فیزیکی این سند هستید و هم‌اکنون به آن دسترسی کامل دارید."
            )
            
        # Check if a pending or approved access request already exists
        existing = db.query(AccessRequest).filter(
            AccessRequest.tenant_id == tenant_id,
            AccessRequest.document_id == document_id,
            AccessRequest.user_id == user_id
        ).first()
        
        if existing:
            if existing.status == AccessRequestStatus.PENDING:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="درخواست دسترسی برای این سند قبلاً ثبت شده و در حال بررسی است."
                )
            elif existing.status == AccessRequestStatus.APPROVED:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="دسترسی شما به این سند قبلاً تأیید شده است."
                )
                
        # Create a new AccessRequest
        request = AccessRequest(
            tenant_id=tenant_id,
            document_id=document_id,
            user_id=user_id,
            status=AccessRequestStatus.PENDING
        )
        
        db.add(request)
        db.commit()
        db.refresh(request)
        
        logger.info(f"🔑 Access request created for document {document_id} by user {user_id}")
        return request

    @staticmethod
    def process_request(
        db: Session, 
        request_id: uuid.UUID, 
        decider_id: uuid.UUID, 
        status_action: AccessRequestStatus, 
        tenant_id: uuid.UUID
    ) -> AccessRequest:
        """
        Approves or Rejects a pending access request. Must be called by OWNER or ADMIN.
        """
        set_tenant_context(db, str(tenant_id))
        
        # Fetch request
        req = db.get(AccessRequest, request_id)
        if not req or str(req.tenant_id) != str(tenant_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="درخواست دسترسی مورد نظر یافت نشد."
            )
            
        if req.status != AccessRequestStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="این درخواست دسترسی قبلاً تعیین تکلیف شده است."
            )
            
        # Verify status action is valid (APPROVED or REJECTED)
        if status_action not in [AccessRequestStatus.APPROVED, AccessRequestStatus.REJECTED]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="وضعیت انتخاب شده برای تعیین تکلیف مجاز نیست."
            )
            
        # Update request
        req.status = status_action
        req.decided_by = decider_id
        
        db.commit()
        db.refresh(req)
        
        logger.info(f"⚖️ Access request {request_id} was {status_action.value} by {decider_id}")
        return req

    @staticmethod
    def check_user_has_access(
        db: Session, 
        document_id: uuid.UUID, 
        user_id: uuid.UUID, 
        user_role: UserRole, 
        tenant_id: uuid.UUID
    ) -> bool:
        """
        Determines if a user is authorized to view/download a document's digital scan.
        OWNER and ADMIN have global view access within their tenant.
        USERs must either:
          - Be the current physical custodian of the document
          - Have an APPROVED AccessRequest for the document
        """
        set_tenant_context(db, str(tenant_id))
        
        # 1. OWNER and ADMIN bypass individual access checks for their tenant
        if user_role in [UserRole.OWNER, UserRole.ADMIN]:
            return True
            
        # 2. Check if user is the physical custodian
        doc = db.get(Document, document_id)
        if not doc or str(doc.tenant_id) != str(tenant_id):
            return False
            
        if str(doc.physical_custodian_id) == str(user_id):
            return True
            
        # 3. Check for APPROVED AccessRequest
        has_approved_request = db.query(AccessRequest).filter(
            AccessRequest.tenant_id == tenant_id,
            AccessRequest.document_id == document_id,
            AccessRequest.user_id == user_id,
            AccessRequest.status == AccessRequestStatus.APPROVED
        ).first() is not None
        
        return has_approved_request

access_service = AccessService()
