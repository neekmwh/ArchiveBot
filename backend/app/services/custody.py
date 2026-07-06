import logging
import uuid
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.db.models import Document, CustodyTransfer, TransferStatus, User
from app.db.session import set_tenant_context

logger = logging.getLogger("contractor_crm.services.custody")

class CustodyService:
    @staticmethod
    def initiate_transfer(
        db: Session, 
        document_id: uuid.UUID, 
        sender_id: uuid.UUID, 
        receiver_id: uuid.UUID, 
        tenant_id: uuid.UUID
    ) -> CustodyTransfer:
        """
        Stage 1: Document custodian initiates custody transfer.
        Creates a PENDING transfer record.
        """
        set_tenant_context(db, str(tenant_id))
        
        # 1. Fetch document and validate
        document = db.get(Document, document_id)
        if not document or str(document.tenant_id) != str(tenant_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="سند مورد نظر یافت نشد."
            )
            
        # Verify the sender is the CURRENT physical custodian
        if str(document.physical_custodian_id) != str(sender_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="فقط شخص تحویل‌دهنده فعلی سند فیزیکی می‌تواند انتقال را آغاز کند."
            )
            
        # Verify the receiver is valid and active in the same tenant
        receiver = db.get(User, receiver_id)
        if not receiver or str(receiver.tenant_id) != str(tenant_id) or not receiver.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="کاربر تحویل‌گیرنده نامعتبر یا غیرفعال است."
            )
            
        if str(sender_id) == str(receiver_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="نمی‌توانید سند را به خودتان انتقال دهید."
            )

        # Ensure no other active PENDING transfer exists for this document
        existing_pending = db.query(CustodyTransfer).filter(
            CustodyTransfer.document_id == document_id,
            CustodyTransfer.status == TransferStatus.PENDING
        ).first()
        if existing_pending:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="یک فرآیند انتقال فعال دیگر برای این سند در جریان است."
            )

        # 2. Create the CustodyTransfer
        transfer = CustodyTransfer(
            tenant_id=tenant_id,
            document_id=document_id,
            sender_id=sender_id,
            receiver_id=receiver_id,
            status=TransferStatus.PENDING
        )
        
        db.add(transfer)
        db.commit()
        db.refresh(transfer)
        
        logger.info(f"🔄 Custody transfer initiated for document {document.internal_id} from {sender_id} to {receiver_id}")
        return transfer

    @staticmethod
    def accept_transfer(
        db: Session, 
        transfer_id: uuid.UUID, 
        receiver_id: uuid.UUID, 
        tenant_id: uuid.UUID
    ) -> CustodyTransfer:
        """
        Stage 2 (Approved): Receiver accepts custody of the physical document.
        The document's physical_custodian_id is updated to match the receiver.
        """
        set_tenant_context(db, str(tenant_id))
        
        transfer = db.get(CustodyTransfer, transfer_id)
        if not transfer or str(transfer.tenant_id) != str(tenant_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="درخواست انتقال یافت نشد."
            )
            
        if transfer.status != TransferStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="این فرآیند انتقال قبلاً نهایی شده یا لغو گردیده است."
            )
            
        if str(transfer.receiver_id) != str(receiver_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="فقط تحویل‌گیرنده تعیین‌شده می‌تواند درخواست انتقال را تایید کند."
            )

        # Fetch and update the document custodian
        document = db.get(Document, transfer.document_id)
        if not document:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="سند متناظر با این انتقال یافت نشد."
            )

        # Execute custody shift within a clean database transaction
        transfer.status = TransferStatus.APPROVED
        document.physical_custodian_id = receiver_id
        
        db.commit()
        db.refresh(transfer)
        
        logger.info(f"✅ Custody transfer APPROVED. Custodian of {document.internal_id} is now {receiver_id}")
        return transfer

    @staticmethod
    def reject_transfer(
        db: Session, 
        transfer_id: uuid.UUID, 
        receiver_id: uuid.UUID, 
        tenant_id: uuid.UUID
    ) -> CustodyTransfer:
        """
        Stage 2 (Rejected): Receiver rejects or denies receiving physical custody.
        The document's custodian remains unchanged.
        """
        set_tenant_context(db, str(tenant_id))
        
        transfer = db.get(CustodyTransfer, transfer_id)
        if not transfer or str(transfer.tenant_id) != str(tenant_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="درخواست انتقال یافت نشد."
            )
            
        if transfer.status != TransferStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="این فرآیند انتقال قبلاً نهایی شده یا لغو گردیده است."
            )
            
        if str(transfer.receiver_id) != str(receiver_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="فقط تحویل‌گیرنده تعیین‌شده می‌تواند درخواست انتقال را رد کند."
            )

        transfer.status = TransferStatus.REJECTED
        db.commit()
        db.refresh(transfer)
        
        logger.info(f"❌ Custody transfer REJECTED by receiver {receiver_id}")
        return transfer

    @staticmethod
    def cancel_transfer(
        db: Session, 
        transfer_id: uuid.UUID, 
        sender_id: uuid.UUID, 
        tenant_id: uuid.UUID
    ) -> CustodyTransfer:
        """
        Allows the Sender to cancel their initiated custody transfer before the Receiver acts on it.
        """
        set_tenant_context(db, str(tenant_id))
        
        transfer = db.get(CustodyTransfer, transfer_id)
        if not transfer or str(transfer.tenant_id) != str(tenant_id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="درخواست انتقال یافت نشد."
            )
            
        if transfer.status != TransferStatus.PENDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="این فرآیند انتقال دیگر در حالت معلق نیست."
            )
            
        if str(transfer.sender_id) != str(sender_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="فقط فرد تحویل‌دهنده می‌تواند فرآیند انتقال خود را لغو کند."
            )

        transfer.status = TransferStatus.CANCELLED
        db.commit()
        db.refresh(transfer)
        
        logger.info(f"⚠️ Custody transfer CANCELLED by sender {sender_id}")
        return transfer

custody_service = CustodyService()
