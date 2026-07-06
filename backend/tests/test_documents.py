import pytest
import uuid
from fastapi import status
from sqlalchemy.orm import Session
from app.db.models import DocumentDraft, Document, User, Project, UserRole, DraftStep

def test_document_draft_lifecycle_and_sanitization(client, db_session: Session):
    # Get a login token
    auth_resp = client.post(
        "/api/v1/auth/login",
        json={"phone_number": "09123456789", "otp_code": "1234"}
    )
    token = auth_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create a draft
    create_resp = client.post(
        "/api/v1/documents/drafts?scan_file_path=quarantine_file_xyz.pdf",
        headers=headers
    )
    assert create_resp.status_code == status.HTTP_200_OK
    draft_id = create_resp.json()["id"]

    # 2. Update Draft metadata (including XSS script payload to test input sanitization)
    custodian = db_session.query(User).filter(User.phone_number == "09128888888").first()
    
    update_payload = {
        "current_step": "CONFIRM_REGISTRATION",
        "metadata_json": {
            "doc_type": "<script>alert('xss')</script>نقشه فونداسیون",
            "doc_number": "DOC-9988",
            "doc_date": "1405/01/15",
            "description": "<b>توضیحات مهم کارگاه</b>",
            "physical_custodian_id": str(custodian.id)
        }
    }
    
    update_resp = client.put(
        f"/api/v1/documents/drafts/{draft_id}",
        json=update_payload,
        headers=headers
    )
    assert update_resp.status_code == status.HTTP_200_OK

    # 3. Register Document from Draft
    reg_resp = client.post(
        f"/api/v1/documents/drafts/{draft_id}/register",
        headers=headers
    )
    assert reg_resp.status_code == status.HTTP_200_OK
    doc_data = reg_resp.json()
    
    # 4. Assert Sanitization took place!
    # "<script>alert('xss')</script>نقشه فونداسیون" should have tags stripped/escaped
    assert "<script>" not in doc_data["doc_type"]
    assert "نقشه فونداسیون" in doc_data["doc_type"]
    
    # "<b>توضیحات مهم کارگاه</b>" should have tags stripped/escaped
    assert "<b>" not in doc_data["description"]
    assert "توضیحات مهم کارگاه" in doc_data["description"]
