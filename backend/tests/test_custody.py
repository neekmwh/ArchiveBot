import pytest
import uuid
from sqlalchemy.orm import Session
from app.db.models import Document, CustodyTransfer, TransferStatus, User, DocumentStatus
from app.services.custody import custody_service

def test_custody_transfer_lifecycle(db_session: Session):
    tenant_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    sender_id = uuid.UUID("22222222-2222-2222-2222-222222222222") # owner
    receiver_id = uuid.UUID("44444444-4444-4444-4444-444444444444") # user

    # 1. Register a mock document
    document = Document(
        tenant_id=tenant_id,
        internal_id="DOC-TST-01",
        doc_number="12345",
        doc_type="نقشه معماری",
        doc_date="1405/01/01",
        description="تست انتقال",
        physical_custodian_id=sender_id,
        scan_file_path="s3://dummy/path.pdf",
        status=DocumentStatus.ACTIVE
    )
    db_session.add(document)
    db_session.commit()

    # 2. Initiate Transfer
    transfer = custody_service.initiate_transfer(
        db=db_session,
        document_id=document.id,
        sender_id=sender_id,
        receiver_id=receiver_id,
        tenant_id=tenant_id
    )

    assert transfer.status == TransferStatus.PENDING
    assert transfer.sender_id == sender_id
    assert transfer.receiver_id == receiver_id

    # 3. Accept Transfer
    accepted_transfer = custody_service.accept_transfer(
        db=db_session,
        transfer_id=transfer.id,
        receiver_id=receiver_id,
        tenant_id=tenant_id
    )

    # Refresh document
    db_session.refresh(document)

    assert accepted_transfer.status == TransferStatus.APPROVED
    assert document.physical_custodian_id == receiver_id
