import pytest
import uuid
import sys
import os
from typing import Generator
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from unittest.mock import MagicMock

# Ensure we can import app properly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Mock boto3 and pyclamd before importing anything from app that instantiates them
sys.modules['boto3'] = MagicMock()
sys.modules['pyclamd'] = MagicMock()
sys.modules['botocore'] = MagicMock()
sys.modules['botocore.client'] = MagicMock()
sys.modules['botocore.exceptions'] = MagicMock()

from app.main import app
from app.db.session import Base, get_db
from app.db.models import Tenant, User, UserRole, Project, Document, DocumentStatus, DocumentDraft, DraftStep
from app.services.storage import storage_service

# SQLite database for testing (in-memory)
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    
    # 1. Clean previous runs
    session.query(Document).delete()
    session.query(DocumentDraft).delete()
    session.query(Project).delete()
    session.query(User).delete()
    session.query(Tenant).delete()
    session.commit()

    # 2. Seed common test data
    tenant_id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    tenant = Tenant(
        id=tenant_id,
        name="پیمانکاری آریا",
        schema_name="tenant_aria"
    )
    session.add(tenant)
    session.commit()
    
    owner_id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    owner = User(
        id=owner_id,
        tenant_id=tenant_id,
        name="مدیر پیمانکاری",
        phone_number="09123456789",
        role=UserRole.OWNER,
        is_active=True
    )
    
    admin_id = uuid.UUID("33333333-3333-3333-3333-333333333333")
    admin = User(
        id=admin_id,
        tenant_id=tenant_id,
        name="ادمین پیمانکاری",
        phone_number="09129999999",
        role=UserRole.ADMIN,
        is_active=True
    )
    
    user_id = uuid.UUID("44444444-4444-4444-4444-444444444444")
    user = User(
        id=user_id,
        tenant_id=tenant_id,
        name="مهندس کارگاه",
        phone_number="09128888888",
        role=UserRole.USER,
        is_active=True
    )
    
    session.add_all([owner, admin, user])
    session.commit()

    # Create dummy mock structures on storage_service to avoid boto3 runtime exceptions
    storage_service.s3_client = MagicMock()
    storage_service.main_bucket = "contractor-crm-storage"
    storage_service.quarantine_bucket = "contractor-crm-quarantine"
    # Make ClamAV scan mock always return clean (True, None)
    storage_service.scan_file_for_viruses = MagicMock(return_value=(True, None))

    yield session
    
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    # Override get_db dependency
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
            
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
