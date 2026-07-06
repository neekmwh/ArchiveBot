import uuid
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import select, and_

from app.db.session import get_db, set_tenant_context
from app.db.models import Document, DocumentDraft, User, UserRole, DocumentStatus, DraftStep
from app.schemas.schemas import DocumentResponse, DocumentCreate, DocumentUpdate, DocumentDraftResponse, DocumentDraftUpdate
from app.api.deps import get_current_user, RoleChecker
from app.services.document import document_service
from app.services.access import access_service

router = APIRouter()

@router.get("/", response_model=List[DocumentResponse])
def list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    project_id: Optional[uuid.UUID] = None,
    skip: int = 0,
    limit: int = 100
) -> Any:
    """
    Lists all documents of the current tenant.
    Standard users see only the documents they physically hold, OR documents for which they have approved access.
    OWNER and ADMIN see all documents in the tenant.
    """
    set_tenant_context(db, str(current_user.tenant_id))
    
    if current_user.role in [UserRole.OWNER, UserRole.ADMIN]:
        # Global view
        query = select(Document)
        if project_id:
            query = query.where(Document.project_id == project_id)
        query = query.offset(skip).limit(limit)
        return db.scalars(query).all()
    else:
        # User-specific view: physical custody OR approved digital access request
        # For simplicity of joining, let's filter in Python or construct a union query.
        # Let's perform a database query that matches physical_custodian_id OR has approved access_request
        from app.db.models import AccessRequest, AccessRequestStatus
        
        # Select documents physically held
        physically_held_query = select(Document).where(
            and_(
                Document.tenant_id == current_user.tenant_id,
                Document.physical_custodian_id == current_user.id
            )
        )
        held_docs = db.scalars(physically_held_query).all()
        
        # Select documents digitally authorized
        authorized_query = select(Document).join(AccessRequest).where(
            and_(
                AccessRequest.tenant_id == current_user.tenant_id,
                AccessRequest.user_id == current_user.id,
                AccessRequest.status == AccessRequestStatus.APPROVED
            )
        )
        auth_docs = db.scalars(authorized_query).all()
        
        # Combine and deduplicate
        combined = {doc.id: doc for doc in (held_docs + auth_docs)}
        
        if project_id:
            return [doc for doc in combined.values() if doc.project_id == project_id][skip:skip+limit]
        return list(combined.values())[skip:skip+limit]

@router.get("/{document_id}", response_model=DocumentResponse)
def get_document_by_id(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Retrieves a single document, verifying permissions.
    """
    set_tenant_context(db, str(current_user.tenant_id))
    document = db.get(Document, document_id)
    
    if not document or str(document.tenant_id) != str(current_user.tenant_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="سند مورد نظر یافت نشد."
        )
        
    # Enforce digital security boundary
    has_access = access_service.check_user_has_access(
        db, 
        document_id=document.id, 
        user_id=current_user.id, 
        user_role=current_user.role, 
        tenant_id=current_user.tenant_id
    )
    
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="شما دسترسی دیجیتال لازم برای مشاهده این سند را ندارید. لطفاً درخواست دسترسی ثبت کنید."
        )
        
    return document

@router.post("/drafts", response_model=DocumentDraftResponse)
def create_draft(
    scan_file_path: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Starts a new document registration draft.
    Typically triggered by uploading a scan in Web UI or uploading a document image in Telegram.
    """
    set_tenant_context(db, str(current_user.tenant_id))
    
    draft = DocumentDraft(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        scan_file_path=scan_file_path,
        metadata_json={},
        current_step=DraftStep.UPLOAD_FILE
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return draft

@router.get("/drafts/active", response_model=Optional[DocumentDraftResponse])
def get_active_user_draft(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Retrieves the most recent active draft for the current user.
    """
    set_tenant_context(db, str(current_user.tenant_id))
    query = select(DocumentDraft).where(
        and_(
            DocumentDraft.tenant_id == current_user.tenant_id,
            DocumentDraft.user_id == current_user.id
        )
    ).order_by(DocumentDraft.created_at.desc())
    return db.scalars(query).first()

@router.put("/drafts/{draft_id}", response_model=DocumentDraftResponse)
def update_draft(
    draft_id: uuid.UUID,
    payload: DocumentDraftUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Updates the step-by-step metadata or current step of a registration draft.
    """
    set_tenant_context(db, str(current_user.tenant_id))
    draft = db.get(DocumentDraft, draft_id)
    
    if not draft or str(draft.tenant_id) != str(current_user.tenant_id) or str(draft.user_id) != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="پیش‌نویس مورد نظر یافت نشد."
        )
        
    if payload.metadata_json is not None:
        # Merge dictionaries to keep sequential state intact
        merged = dict(draft.metadata_json)
        merged.update(payload.metadata_json)
        draft.metadata_json = merged
        
    if payload.current_step is not None:
        draft.current_step = payload.current_step
        
    db.commit()
    db.refresh(draft)
    return draft

@router.post("/drafts/{draft_id}/register", response_model=DocumentResponse)
def register_document(
    draft_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """
    Converts the draft into an official active document.
    """
    return document_service.register_from_draft(
        db=db,
        draft_id=draft_id,
        tenant_id=current_user.tenant_id,
        current_user_id=current_user.id
    )

@router.put("/{document_id}/void", response_model=DocumentResponse)
def void_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([UserRole.OWNER, UserRole.ADMIN]))
) -> Any:
    """
    Voids an existing active document. (OWNER/ADMIN only).
    """
    return document_service.void_document(
        db=db,
        document_id=document_id,
        tenant_id=current_user.tenant_id
    )
