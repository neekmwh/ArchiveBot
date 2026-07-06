import pytest
import uuid
from sqlalchemy.orm import Session
from app.services.audit import audit_service
from app.db.models import AuditLog

def test_cryptographic_audit_chain_integrity(db_session: Session):
    tenant_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    user_id = uuid.UUID("22222222-2222-2222-2222-222222222222")

    # Clear prior audit logs
    db_session.query(AuditLog).delete()
    db_session.commit()

    # 1. Create First Log (Genesis)
    log1 = audit_service.create_log(
        db=db_session,
        tenant_id=tenant_id,
        user_id=user_id,
        action="USER_LOGIN",
        entity_name="User",
        entity_id=user_id,
        details={"ip": "127.0.0.1"}
    )

    assert log1.previous_record_hash is not None
    assert log1.current_record_hash is not None

    # 2. Create Second Chained Log
    log2 = audit_service.create_log(
        db=db_session,
        tenant_id=tenant_id,
        user_id=user_id,
        action="DOCUMENT_VIEWED",
        entity_name="Document",
        entity_id=uuid.uuid4(),
        details={"doc_id": "doc-001"}
    )

    # Chaining check: log2 previous hash must be log1 current hash
    assert log2.previous_record_hash == log1.current_record_hash

    # 3. Verify Chain (Must be verified successfully)
    result = audit_service.verify_chain(db_session, tenant_id)
    assert result["verified"] is True
    assert result["total_verified"] == 2

    # 4. Tampering Attack! Modify log1 details in the database directly
    log1.details = {"ip": "192.168.1.1"} # Modified secretly
    db_session.commit()

    # Verify Chain again (Must detect tampering!)
    tamper_result = audit_service.verify_chain(db_session, tenant_id)
    assert tamper_result["verified"] is False
    assert "عدم تطابق امضا" in tamper_result["message"] or "عدم تطابق زنجیره" in tamper_result["message"]
    assert tamper_result["corrupted_log_id"] == str(log1.id)
