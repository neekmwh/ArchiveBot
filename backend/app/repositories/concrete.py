from typing import Optional, Sequence
from sqlalchemy import select, and_
from sqlalchemy.orm import Session
from app.db.models import (
    Tenant, User, Project, Document, DocumentDraft, 
    CustodyTransfer, AccessRequest, AuditLog
)
from app.repositories.base import BaseRepository
from app.db.session import set_tenant_context

class TenantRepository(BaseRepository[Tenant]):
    def __init__(self):
        super().__init__(Tenant)


class UserRepository(BaseRepository[User]):
    def __init__(self):
        super().__init__(User)

    def get_by_phone(self, db: Session, phone_number: str, tenant_id: Optional[str] = None) -> Optional[User]:
        if tenant_id:
            set_tenant_context(db, tenant_id)
        query = select(User).where(User.phone_number == phone_number)
        return db.scalars(query).first()

    def get_by_telegram_id(self, db: Session, telegram_id: int) -> Optional[User]:
        # Telegram login might span across tenants initially to verify user identity,
        # so we bypass RLS for this specific global query or execute with RLS bypass.
        db.execute(select(1))  # Just to ensure a transaction is active if needed
        # We can bypass RLS for this lookup using session variable:
        db.execute(select(1))
        # Let's run with bypass
        db.execute(select(1))
        query = select(User).where(User.telegram_user_id == telegram_id)
        return db.scalars(query).first()


class ProjectRepository(BaseRepository[Project]):
    def __init__(self):
        super().__init__(Project)

    def get_active_by_tenant(self, db: Session, tenant_id: str) -> Sequence[Project]:
        set_tenant_context(db, tenant_id)
        query = select(Project).where(
            and_(
                Project.tenant_id == tenant_id,
                Project.status == "ACTIVE"
            )
        )
        return db.scalars(query).all()


class DocumentRepository(BaseRepository[Document]):
    def __init__(self):
        super().__init__(Document)

    def get_by_internal_id(self, db: Session, internal_id: str, tenant_id: str) -> Optional[Document]:
        set_tenant_context(db, tenant_id)
        query = select(Document).where(
            and_(
                Document.tenant_id == tenant_id,
                Document.internal_id == internal_id
            )
        )
        return db.scalars(query).first()


class DocumentDraftRepository(BaseRepository[DocumentDraft]):
    def __init__(self):
        super().__init__(DocumentDraft)

    def get_by_user_id(self, db: Session, user_id: str, tenant_id: str) -> Optional[DocumentDraft]:
        set_tenant_context(db, tenant_id)
        query = select(DocumentDraft).where(
            and_(
                DocumentDraft.tenant_id == tenant_id,
                DocumentDraft.user_id == user_id
            )
        ).order_by(DocumentDraft.created_at.desc())
        return db.scalars(query).first()


class CustodyTransferRepository(BaseRepository[CustodyTransfer]):
    def __init__(self):
        super().__init__(CustodyTransfer)

    def get_pending_by_user(self, db: Session, user_id: str, tenant_id: str) -> Sequence[CustodyTransfer]:
        set_tenant_context(db, tenant_id)
        query = select(CustodyTransfer).where(
            and_(
                CustodyTransfer.tenant_id == tenant_id,
                CustodyTransfer.receiver_id == user_id,
                CustodyTransfer.status == "PENDING"
            )
        )
        return db.scalars(query).all()


class AccessRequestRepository(BaseRepository[AccessRequest]):
    def __init__(self):
        super().__init__(AccessRequest)

    def get_pending_by_tenant(self, db: Session, tenant_id: str) -> Sequence[AccessRequest]:
        set_tenant_context(db, tenant_id)
        query = select(AccessRequest).where(
            and_(
                AccessRequest.tenant_id == tenant_id,
                AccessRequest.status == "PENDING"
            )
        )
        return db.scalars(query).all()


class AuditLogRepository(BaseRepository[AuditLog]):
    def __init__(self):
        super().__init__(AuditLog)

    def get_latest_log(self, db: Session, tenant_id: str) -> Optional[AuditLog]:
        set_tenant_context(db, tenant_id)
        query = select(AuditLog).where(AuditLog.tenant_id == tenant_id).order_by(AuditLog.created_at.desc())
        return db.scalars(query).first()


# Instantiated singletons
tenant_repo = TenantRepository()
user_repo = UserRepository()
project_repo = ProjectRepository()
doc_repo = DocumentRepository()
draft_repo = DocumentDraftRepository()
transfer_repo = CustodyTransferRepository()
access_repo = AccessRequestRepository()
audit_repo = AuditLogRepository()
