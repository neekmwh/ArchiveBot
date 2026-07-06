from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from app.core.config import settings

# Create database engine
engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def set_tenant_context(db: Session, tenant_id: str) -> None:
    """
    Sets the current tenant context for the transaction.
    This session variable is utilized by PostgreSQL Row-Level Security (RLS) policies.
    """
    # Check if a transaction is active. If not, start one.
    if not db.in_transaction():
        db.begin()
    try:
        db.execute(
            text("SET LOCAL app.current_tenant_id = :tenant_id"),
            {"tenant_id": str(tenant_id)}
        )
    except Exception as e:
        # Support SQLite in-memory database fallback for pytest unit testing
        if "sqlite" in str(db.bind.url):
            pass
        else:
            raise

def clear_tenant_context(db: Session) -> None:
    """
    Clears the current tenant context.
    """
    try:
        db.execute(text("RESET app.current_tenant_id"))
    except Exception as e:
        if "sqlite" in str(db.bind.url):
            pass
        else:
            raise

def get_db():
    """
    FastAPI dependency that yields a database session and handles rollback/close.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
