import uuid
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db, set_tenant_context
from app.db.models import AccessRequest, AccessRequestStatus, User, UserRole
from app.schemas.schemas import AccessRequestResponse, AccessRequestCreate
from app.api.deps import get_current_user, RoleChecker
from app.services.access import access_service

router = APIRouter()

@router.get("/", response_model=List[AccessRequestResponse])
def list_access_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100
) -> Any:
    """
    Lists access requests for the tenant.
    Standard users see only their own requests.
    OWNER and ADMIN see all requests in the tenant.
    """
    set_tenant_context(db, str(current_user.tenant_id))
    
    if current_user.role in [UserRole.OWNER, UserRole.ADMIN]:
        query = select(AccessRequest).offset(skip).limit(limit)
    else:
        query = select(AccessRequest).where(
            AccessRequest.user_id == current_user.id
        ).offset(skip).limit(limit)
        
    return db.scalars(query).all()

@router.post("/", response_model=AccessRequestResponse)
def request_digital_access(
    payload: AccessRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Standard users can request digital view access for an active document.
    """
    return access_service.create_request(
        db=db,
        document_id=payload.document_id,
        user_id=current_user.id,
        tenant_id=current_user.tenant_id
    )

@router.put("/{request_id}/approve", response_model=AccessRequestResponse)
def approve_access_request(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.OWNER, UserRole.ADMIN]))
) -> Any:
    """
    Approves a pending digital access request. Restricted to OWNER or ADMIN.
    """
    return access_service.process_request(
        db=db,
        request_id=request_id,
        decider_id=current_user.id,
        status_action=AccessRequestStatus.APPROVED,
        tenant_id=current_user.tenant_id
    )

@router.put("/{request_id}/reject", response_model=AccessRequestResponse)
def reject_access_request(
    request_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.OWNER, UserRole.ADMIN]))
) -> Any:
    """
    Rejects a pending digital access request. Restricted to OWNER or ADMIN.
    """
    return access_service.process_request(
        db=db,
        request_id=request_id,
        decider_id=current_user.id,
        status_action=AccessRequestStatus.REJECTED,
        tenant_id=current_user.tenant_id
    )
