import uuid
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db, set_tenant_context
from app.db.models import AuditLog, User, UserRole
from app.schemas.schemas import AuditLogResponse
from app.api.deps import RoleChecker

router = APIRouter()

@router.get("/", response_model=List[AuditLogResponse])
def list_audit_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.OWNER, UserRole.ADMIN])),
    skip: int = 0,
    limit: int = 100
) -> Any:
    """
    Retrieves system audit logs. Restricted to OWNER or ADMIN. (Scoped by RLS by default).
    """
    set_tenant_context(db, str(current_user.tenant_id))
    
    query = select(AuditLog).order_by(AuditLog.created_at.desc()).offset(skip).limit(limit)
    logs = db.scalars(query).all()
    return logs

@router.post("/verify")
def verify_audit_logs_chain(
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.OWNER, UserRole.ADMIN]))
) -> Any:
    """
    Verifies the cryptographic chain integrity of all audit logs for the current tenant.
    """
    set_tenant_context(db, str(current_user.tenant_id))
    from app.services.audit import audit_service
    return audit_service.verify_chain(db, current_user.tenant_id)

