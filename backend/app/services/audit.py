import hashlib
import json
import logging
import uuid
from typing import Any, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.models import AuditLog
from app.core.config import settings
from app.db.session import set_tenant_context

logger = logging.getLogger("contractor_crm.services.audit")

class AuditService:
    @staticmethod
    def create_log(
        db: Session,
        tenant_id: uuid.UUID,
        user_id: Optional[uuid.UUID],
        action: str,
        entity_name: str,
        entity_id: Optional[uuid.UUID],
        details: Dict[str, Any]
    ) -> AuditLog:
        """
        Creates a cryptographically chained audit log entry for the tenant.
        The record is chained using:
        current_record_hash = SHA256(previous_record_hash + tenant_id + user_id + action + entity_id + details_json + salt)
        """
        set_tenant_context(db, str(tenant_id))
        
        # 1. Fetch latest log for this tenant to get previous_record_hash
        query = select(AuditLog).where(AuditLog.tenant_id == tenant_id).order_by(AuditLog.created_at.desc())
        latest_log = db.scalars(query).first()
        
        if latest_log:
            prev_hash = latest_log.current_record_hash
        else:
            # Genesis block hash for the tenant
            prev_hash = hashlib.sha256(f"genesis_{tenant_id}".encode()).hexdigest()
            
        # 2. Serialize details consistently
        serialized_details = json.dumps(details, sort_keys=True)
        
        # 3. Construct message to hash
        payload_str = (
            f"{prev_hash}|"
            f"{tenant_id}|"
            f"{user_id or 'system'}|"
            f"{action}|"
            f"{entity_name}|"
            f"{entity_id or 'none'}|"
            f"{serialized_details}|"
            f"{settings.AUDIT_LOG_SALT}"
        )
        
        curr_hash = hashlib.sha256(payload_str.encode()).hexdigest()
        
        # 4. Create AuditLog record
        log_entry = AuditLog(
            tenant_id=tenant_id,
            user_id=user_id,
            action=action,
            entity_name=entity_name,
            entity_id=entity_id,
            details=details,
            previous_record_hash=prev_hash,
            current_record_hash=curr_hash
        )
        
        db.add(log_entry)
        db.commit()
        db.refresh(log_entry)
        
        logger.info(f"🔒 Cryptographic Audit Log created. Action: {action}, Hash: {curr_hash[:8]}...")
        return log_entry

    @staticmethod
    def verify_chain(db: Session, tenant_id: uuid.UUID) -> Dict[str, Any]:
        """
        Verifies the cryptographic integrity of the entire audit chain for a tenant.
        Returns a dictionary containing the verification status and details.
        """
        set_tenant_context(db, str(tenant_id))
        
        query = select(AuditLog).where(AuditLog.tenant_id == tenant_id).order_by(AuditLog.created_at.asc())
        logs = db.scalars(query).all()
        
        if not logs:
            return {
                "verified": True,
                "message": "هیچ لاگ بررسی برای این مستأجر ثبت نشده است.",
                "total_verified": 0
            }
            
        expected_prev_hash = hashlib.sha256(f"genesis_{tenant_id}".encode()).hexdigest()
        
        for idx, log in enumerate(logs):
            # 1. Verify previous_record_hash matches expected previous hash
            if log.previous_record_hash != expected_prev_hash:
                return {
                    "verified": False,
                    "message": f"عدم تطابق زنجیره در سطر {idx + 1}. هش قبلی ذخیره شده با مقدار محاسبه شده مطابقت ندارد.",
                    "corrupted_log_id": str(log.id),
                    "expected_previous_hash": expected_prev_hash,
                    "actual_previous_hash": log.previous_record_hash
                }
                
            # 2. Recalculate current_record_hash
            serialized_details = json.dumps(log.details, sort_keys=True)
            payload_str = (
                f"{log.previous_record_hash}|"
                f"{log.tenant_id}|"
                f"{log.user_id or 'system'}|"
                f"{log.action}|"
                f"{log.entity_name}|"
                f"{log.entity_id or 'none'}|"
                f"{serialized_details}|"
                f"{settings.AUDIT_LOG_SALT}"
            )
            calculated_hash = hashlib.sha256(payload_str.encode()).hexdigest()
            
            # 3. Verify current_record_hash matches recalculation
            if log.current_record_hash != calculated_hash:
                return {
                    "verified": False,
                    "message": f"عدم تطابق امضا در سطر {idx + 1}. هش لاگ ذخیره شده دستکاری شده است.",
                    "corrupted_log_id": str(log.id),
                    "expected_current_hash": calculated_hash,
                    "actual_current_hash": log.current_record_hash
                }
                
            # Update expected_prev_hash for the next record
            expected_prev_hash = log.current_record_hash
            
        return {
            "verified": True,
            "message": "کل زنجیره بررسی با موفقیت تأیید صحت گردید. هیچ‌گونه دستکاری شناسایی نشد.",
            "total_verified": len(logs)
        }

audit_service = AuditService()
