import logging
from sqlalchemy.orm import Session
from sqlalchemy import text

logger = logging.getLogger("contractor_crm.rls")

RLS_TABLES = [
    "users",
    "projects",
    "documents",
    "document_drafts",
    "custody_transfers",
    "access_requests",
    "audit_logs"
]

def get_rls_sql_commands() -> list[str]:
    """
    Generates the SQL commands required to enable RLS and apply multi-tenant isolation policies.
    """
    commands = []
    for table in RLS_TABLES:
        # Enable RLS
        commands.append(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
        commands.append(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;")
        
        # Drop existing policy if exists to make it idempotent
        commands.append(f"DROP POLICY IF EXISTS {table}_tenant_isolation ON {table};")
        
        # Create policy that matches either the app.bypass_rls flag or the active tenant_id
        policy_sql = f"""
        CREATE POLICY {table}_tenant_isolation ON {table}
        FOR ALL
        USING (
            current_setting('app.bypass_rls', true) = 'true'
            OR tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        );
        """
        commands.append(policy_sql.strip())
        
    return commands

def apply_rls_policies(db: Session) -> None:
    """
    Executes the RLS SQL commands on the given database session.
    """
    logger.info("Applying Row-Level Security (RLS) policies on PostgreSQL...")
    try:
        commands = get_rls_sql_commands()
        for cmd in commands:
            db.execute(text(cmd))
        db.commit()
        logger.info("🎉 RLS policies successfully applied and forced on all multi-tenant tables.")
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Failed to apply RLS policies: {str(e)}")
        raise e
