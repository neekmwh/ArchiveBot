import logging
import os
import uuid
from sqlalchemy.orm import Session
from sqlalchemy import select, text
from alembic.config import Config
from alembic import command

from app.core.config import settings
from app.db.session import engine, SessionLocal
from app.db.rls import apply_rls_policies
from app.db.models import Tenant, User, Project, Document, UserRole, ProjectStatus, DocumentStatus

logger = logging.getLogger("contractor_crm.init_db")

def run_alembic_migrations() -> None:
    """
    Programmatically runs Alembic migrations to upgrade the schema to 'head'.
    """
    logger.info("Checking database migrations...")
    try:
        # Find path to alembic.ini
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        alembic_ini_path = os.path.join(base_dir, "alembic.ini")
        
        alembic_cfg = Config(alembic_ini_path)
        alembic_cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
        
        command.upgrade(alembic_cfg, "head")
        logger.info("🎉 Database migrations completed successfully.")
    except Exception as e:
        logger.error(f"❌ Failed to run database migrations: {str(e)}")
        raise e

def seed_initial_data(db: Session) -> None:
    """
    Seeds initial tenants, users, projects, and documents matched with the frontend simulator.
    """
    logger.info("Checking database seeding...")
    
    # 1. Check if we already have tenants
    has_tenants = db.scalars(select(Tenant)).first() is not None
    if has_tenants:
        logger.info("Database already seeded. Skipping initial data seed.")
        return
        
    logger.info("Seeding initial mock data corresponding to frontend types...")
    
    # Seeding Tenants
    tenant1_id = uuid.UUID('32808c1a-8b1b-4b10-8000-000000000001')
    tenant2_id = uuid.UUID('32808c1a-8b1b-4b10-8000-000000000002')
    
    tenant1 = Tenant(
        id=tenant1_id,
        name="پیمانکاری عمارت شرق",
        is_active=True
    )
    tenant2 = Tenant(
        id=tenant2_id,
        name="سازه‌گستر آریا کاران",
        is_active=True
    )
    db.add_all([tenant1, tenant2])
    db.flush() # Generate foreign keys context
    
    # Seeding Users (Tenant 1)
    u1_t1 = User(
        id=uuid.UUID('32808c1a-8b1b-4b10-8001-000000000001'),
        tenant_id=tenant1_id,
        name="علیرضا رضایی",
        phone_number="09121112222",
        telegram_user_id=123456789,
        role=UserRole.OWNER,
        is_active=True
    )
    u2_t1 = User(
        id=uuid.UUID('32808c1a-8b1b-4b10-8001-000000000002'),
        tenant_id=tenant1_id,
        name="مریم احمدی",
        phone_number="09123334444",
        telegram_user_id=987654321,
        role=UserRole.ADMIN,
        is_active=True
    )
    u3_t1 = User(
        id=uuid.UUID('32808c1a-8b1b-4b10-8001-000000000003'),
        tenant_id=tenant1_id,
        name="حسین سلیمانی",
        phone_number="09125556666",
        telegram_user_id=555666777,
        role=UserRole.USER,
        is_active=True
    )
    u4_t1 = User(
        id=uuid.UUID('32808c1a-8b1b-4b10-8001-000000000004'),
        tenant_id=tenant1_id,
        name="سهراب سپهری",
        phone_number="09127778888",
        telegram_user_id=None,
        role=UserRole.USER,
        is_active=True
    )

    # Seeding Users (Tenant 2)
    u1_t2 = User(
        id=uuid.UUID('32808c1a-8b1b-4b10-8002-000000000001'),
        tenant_id=tenant2_id,
        name="بابک رادمنش",
        phone_number="09181112222",
        telegram_user_id=888888888,
        role=UserRole.OWNER,
        is_active=True
    )
    u2_t2 = User(
        id=uuid.UUID('32808c1a-8b1b-4b10-8002-000000000002'),
        tenant_id=tenant2_id,
        name="نازنین کریمی",
        phone_number="09183334444",
        telegram_user_id=777777777,
        role=UserRole.ADMIN,
        is_active=True
    )
    u3_t2 = User(
        id=uuid.UUID('32808c1a-8b1b-4b10-8002-000000000003'),
        tenant_id=tenant2_id,
        name="علی موسوی",
        phone_number="09185556666",
        telegram_user_id=None,
        role=UserRole.USER,
        is_active=True
    )
    db.add_all([u1_t1, u2_t1, u3_t1, u4_t1, u1_t2, u2_t2, u3_t2])
    db.flush()

    # Seeding Projects (Tenant 1)
    p1_t1 = Project(
        id=uuid.UUID('32808c1a-8b1b-4b10-8003-000000000001'),
        tenant_id=tenant1_id,
        name="برج باغ نیاوران",
        status=ProjectStatus.ACTIVE
    )
    p2_t1 = Project(
        id=uuid.UUID('32808c1a-8b1b-4b10-8003-000000000002'),
        tenant_id=tenant1_id,
        name="پروژه تونل رسالت",
        status=ProjectStatus.ACTIVE
    )
    p3_t1 = Project(
        id=uuid.UUID('32808c1a-8b1b-4b10-8003-000000000003'),
        tenant_id=tenant1_id,
        name="مجتمع تجاری پلاس",
        status=ProjectStatus.ARCHIVED
    )

    # Seeding Projects (Tenant 2)
    p1_t2 = Project(
        id=uuid.UUID('32808c1a-8b1b-4b10-8004-000000000001'),
        tenant_id=tenant2_id,
        name="احداث بزرگراه تهران شمال",
        status=ProjectStatus.ACTIVE
    )
    p2_t2 = Project(
        id=uuid.UUID('32808c1a-8b1b-4b10-8004-000000000002'),
        tenant_id=tenant2_id,
        name="تسطیح اراضی فاز ۴ پردیس",
        status=ProjectStatus.ACTIVE
    )
    db.add_all([p1_t1, p2_t1, p3_t1, p1_t2, p2_t2])
    db.flush()

    # Seeding Documents (Tenant 1)
    doc1 = Document(
        id=uuid.UUID('32808c1a-8b1b-4b10-8005-000000000001'),
        tenant_id=tenant1_id,
        project_id=p1_t1.id,
        internal_id="DOC-1405-001",
        doc_number="N-1055-B",
        doc_type="صورت وضعیت شماره ۱ کارگاهی",
        doc_date="1405/02/10",
        description="صورت وضعیت تایید شده بخش ابنیه فونداسیون نیاوران",
        physical_custodian_id=u1_t1.id,
        scan_file_path=f"s3://contractor-crm-storage/{tenant1_id}/{p1_t1.id}/doc_0001_14050210.pdf",
        status=DocumentStatus.ACTIVE
    )
    doc2 = Document(
        id=uuid.UUID('32808c1a-8b1b-4b10-8005-000000000002'),
        tenant_id=tenant1_id,
        project_id=p2_t1.id,
        internal_id="DOC-1405-002",
        doc_number="TX-440-C",
        doc_type="قرارداد پیمانکاری دست دوم آرماتوربندی",
        doc_date="1405/03/15",
        description="قرارداد امضا شده با اکیپ پیمانکاری سلیمی",
        physical_custodian_id=u2_t1.id,
        scan_file_path=f"s3://contractor-crm-storage/{tenant1_id}/{p2_t1.id}/doc_0002_14050315.pdf",
        status=DocumentStatus.ACTIVE
    )
    db.add_all([doc1, doc2])
    db.commit()
    logger.info("🎉 Database successfully seeded with original CRM data.")

def init_db() -> None:
    """
    Main entry point for database initialization.
    Runs Alembic schema upgrades, applies RLS policies, and seeds initial dataset.
    """
    logger.info("Initializing Database...")
    run_alembic_migrations()
    
    db = SessionLocal()
    try:
        # Before applying policies, let's enable RLS bypass on current session to allow seeding
        db.execute(text("SET LOCAL app.bypass_rls = 'true'"))
        seed_initial_data(db)
        apply_rls_policies(db)
    except Exception as e:
        logger.error(f"❌ Error during database initialization sequence: {str(e)}")
        raise e
    finally:
        db.close()
