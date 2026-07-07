import uuid
from datetime import datetime
from enum import Enum as PyEnum
from typing import Optional, Dict, Any
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Integer, BigInteger, JSON, text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base

# ==============================================================================
# PyEnum Definitions for Database Models
# ==============================================================================

class UserRole(str, PyEnum):
    SUPER_ADMIN = "SUPER_ADMIN"
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    USER = "USER"

class ProjectStatus(str, PyEnum):
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"

class DocumentStatus(str, PyEnum):
    ACTIVE = "ACTIVE"
    VOIDED = "VOIDED"

class DraftStep(str, PyEnum):
    UPLOAD_FILE = "UPLOAD_FILE"
    SELECT_PROJECT = "SELECT_PROJECT"
    ENTER_DOC_TYPE = "ENTER_DOC_TYPE"
    ENTER_DOC_NUMBER = "ENTER_DOC_NUMBER"
    ENTER_DOC_DATE = "ENTER_DOC_DATE"
    ENTER_DESCRIPTION = "ENTER_DESCRIPTION"
    SELECT_CUSTODIAN = "SELECT_CUSTODIAN"
    CONFIRM_REGISTRATION = "CONFIRM_REGISTRATION"

class TransferStatus(str, PyEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"

class AccessRequestStatus(str, PyEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


# ==============================================================================
# SQLAlchemy Models
# ==============================================================================

class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_suspended: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    license_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    license_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    license_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    users: Mapped[list["User"]] = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    projects: Mapped[list["Project"]] = relationship("Project", back_populates="tenant", cascade="all, delete-orphan")
    documents: Mapped[list["Document"]] = relationship("Document", back_populates="tenant", cascade="all, delete-orphan")
    document_drafts: Mapped[list["DocumentDraft"]] = relationship("DocumentDraft", back_populates="tenant", cascade="all, delete-orphan")
    custody_transfers: Mapped[list["CustodyTransfer"]] = relationship("CustodyTransfer", back_populates="tenant", cascade="all, delete-orphan")
    access_requests: Mapped[list["AccessRequest"]] = relationship("AccessRequest", back_populates="tenant", cascade="all, delete-orphan")
    audit_logs: Mapped[list["AuditLog"]] = relationship("AuditLog", back_populates="tenant", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    telegram_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, unique=True)
    role: Mapped[UserRole] = mapped_column(String(50), default=UserRole.USER, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="users")
    custodian_documents: Mapped[list["Document"]] = relationship("Document", back_populates="custodian")
    sent_transfers: Mapped[list["CustodyTransfer"]] = relationship("CustodyTransfer", foreign_keys="[CustodyTransfer.sender_id]", back_populates="sender")
    received_transfers: Mapped[list["CustodyTransfer"]] = relationship("CustodyTransfer", foreign_keys="[CustodyTransfer.receiver_id]", back_populates="receiver")
    access_requests: Mapped[list["AccessRequest"]] = relationship("AccessRequest", foreign_keys="[AccessRequest.user_id]", back_populates="user")
    decided_access_requests: Mapped[list["AccessRequest"]] = relationship("AccessRequest", foreign_keys="[AccessRequest.decided_by]", back_populates="decider")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[ProjectStatus] = mapped_column(String(50), default=ProjectStatus.ACTIVE, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="projects")
    documents: Mapped[list["Document"]] = relationship("Document", back_populates="project")


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        UniqueConstraint("tenant_id", "internal_id", name="uq_tenant_internal_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    internal_id: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. DOC-1405-001
    doc_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    doc_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    doc_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # Hijri Date: 1405/05/01
    description: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    physical_custodian_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    scan_file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[DocumentStatus] = mapped_column(String(50), default=DocumentStatus.ACTIVE, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="documents")
    project: Mapped[Optional["Project"]] = relationship("Project", back_populates="documents")
    custodian: Mapped["User"] = relationship("User", back_populates="custodian_documents")
    custody_transfers: Mapped[list["CustodyTransfer"]] = relationship("CustodyTransfer", back_populates="document", cascade="all, delete-orphan")
    access_requests: Mapped[list["AccessRequest"]] = relationship("AccessRequest", back_populates="document", cascade="all, delete-orphan")


class DocumentDraft(Base):
    __tablename__ = "document_drafts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    scan_file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    metadata_json: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    current_step: Mapped[DraftStep] = mapped_column(String(50), default=DraftStep.UPLOAD_FILE, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="document_drafts")
    user: Mapped["User"] = relationship("User")


class CustodyTransfer(Base):
    __tablename__ = "custody_transfers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    sender_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    receiver_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[TransferStatus] = mapped_column(String(50), default=TransferStatus.PENDING, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="custody_transfers")
    document: Mapped["Document"] = relationship("Document", back_populates="custody_transfers")
    sender: Mapped["User"] = relationship("User", foreign_keys=[sender_id], back_populates="sent_transfers")
    receiver: Mapped["User"] = relationship("User", foreign_keys=[receiver_id], back_populates="received_transfers")


class AccessRequest(Base):
    __tablename__ = "access_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    document_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[AccessRequestStatus] = mapped_column(String(50), default=AccessRequestStatus.PENDING, nullable=False)
    decided_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="access_requests")
    document: Mapped["Document"] = relationship("Document", back_populates="access_requests")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id], back_populates="access_requests")
    decider: Mapped[Optional["User"]] = relationship("User", foreign_keys=[decided_by], back_populates="decided_access_requests")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_name: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    details: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    previous_record_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    current_record_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="audit_logs")
    user: Mapped[Optional["User"]] = relationship("User")
