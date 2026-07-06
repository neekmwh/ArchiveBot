import uuid
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, or_

from app.db.session import get_db, set_tenant_context
from app.db.models import CustodyTransfer, User, UserRole, TransferStatus
from app.schemas.schemas import CustodyTransferResponse, CustodyTransferCreate
from app.api.deps import get_current_user
from app.services.custody import custody_service

router = APIRouter()

@router.get("/", response_model=List[CustodyTransferResponse])
def list_transfers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100
) -> Any:
    """
    Lists custody transfers of the current tenant.
    For standard users, returns only transfers where they are sender or receiver.
    For OWNER/ADMIN, returns all transfers.
    """
    set_tenant_context(db, str(current_user.tenant_id))
    
    if current_user.role in [UserRole.OWNER, UserRole.ADMIN]:
        query = select(CustodyTransfer).offset(skip).limit(limit)
    else:
        query = select(CustodyTransfer).where(
            or_(
                CustodyTransfer.sender_id == current_user.id,
                CustodyTransfer.receiver_id == current_user.id
            )
        ).offset(skip).limit(limit)
        
    return db.scalars(query).all()

@router.post("/", response_model=CustodyTransferResponse)
def initiate_custody_transfer(
    payload: CustodyTransferCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Stage 1: Initiates a custody transfer request for a physical document.
    """
    return custody_service.initiate_transfer(
        db=db,
        document_id=payload.document_id,
        sender_id=current_user.id,
        receiver_id=payload.receiver_id,
        tenant_id=current_user.tenant_id
    )

@router.put("/{transfer_id}/accept", response_model=CustodyTransferResponse)
def accept_custody_transfer(
    transfer_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Stage 2 (Approved): Receiver accepts physical custody of the document.
    """
    return custody_service.accept_transfer(
        db=db,
        transfer_id=transfer_id,
        receiver_id=current_user.id,
        tenant_id=current_user.tenant_id
    )

@router.put("/{transfer_id}/reject", response_model=CustodyTransferResponse)
def reject_custody_transfer(
    transfer_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Stage 2 (Rejected): Receiver rejects receiving physical custody.
    """
    return custody_service.reject_transfer(
        db=db,
        transfer_id=transfer_id,
        receiver_id=current_user.id,
        tenant_id=current_user.tenant_id
    )

@router.put("/{transfer_id}/cancel", response_model=CustodyTransferResponse)
def cancel_custody_transfer(
    transfer_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Allows the Sender to cancel a pending transfer request.
    """
    return custody_service.cancel_transfer(
        db=db,
        transfer_id=transfer_id,
        sender_id=current_user.id,
        tenant_id=current_user.tenant_id
    )
