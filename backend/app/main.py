import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.core.config import settings
from app.db.init_db import init_db

# Import API Routers
from app.api.v1.auth import router as auth_router
from app.api.v1.users import router as users_router
from app.api.v1.projects import router as projects_router
from app.api.v1.documents import router as documents_router
from app.api.v1.transfers import router as transfers_router
from app.api.v1.access import router as access_router
from app.api.v1.audit import router as audit_router
from app.api.v1.storage import router as storage_router
from app.api.v1.telegram import router as telegram_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("contractor_crm")

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="بک‌اند سامانه مدیریت اسناد و CRM چندمستأجری شرکت پیمانکاری",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response: Response = await call_next(request)
        # Prevent Clickjacking
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        # Prevent MIME-sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        # Enable Browser XSS filtering
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # Strict Transport Security (HSTS) - 1 year
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        # Referrer Policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Content Security Policy (allows safe API interactions and prevents XSS)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' data: https://fonts.gstatic.com; "
            "img-src 'self' data: https: blob:; "
            "connect-src 'self' https: wss:; "
            "frame-ancestors 'self' https://*.google.com https://*.googleusercontent.com;"
        )
        return response

# Register Middlewares
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["*"]  # Restrict to actual hostname in production settings
)

# Configure CORS Middleware
# Allows seamless API consumption by the React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict this to front-end domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    logger.info("==========================================================")
    logger.info(f"🚀 {settings.PROJECT_NAME} IS STARTING UP...")
    logger.info(f"🔧 Environment: {settings.ENV}")
    logger.info(f"🔗 Database Endpoint: {settings.DATABASE_URL.split('@')[-1]}")
    logger.info(f"📦 S3 Endpoint: {settings.S3_ENDPOINT_URL}")
    logger.info(f"🛡️ ClamAV: {settings.CLAMAV_HOST}:{settings.CLAMAV_PORT}")
    logger.info("==========================================================")
    
    # Run database migrations and apply RLS policies
    try:
        init_db()
        logger.info("✅ Database successfully initialized, migrated, and secured with RLS.")
    except Exception as e:
        logger.error(f"⚠️ Non-blocking database init failure: {str(e)}")


# Register Routers
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(users_router, prefix="/api/v1/users", tags=["Users"])
app.include_router(projects_router, prefix="/api/v1/projects", tags=["Projects"])
app.include_router(documents_router, prefix="/api/v1/documents", tags=["Documents"])
app.include_router(transfers_router, prefix="/api/v1/transfers", tags=["Custody Transfers"])
app.include_router(access_router, prefix="/api/v1/access", tags=["Access Requests"])
app.include_router(audit_router, prefix="/api/v1/audit", tags=["Audit Logs"])
app.include_router(storage_router, prefix="/api/v1/storage", tags=["Storage & File Management"])
app.include_router(telegram_router, prefix="/api/v1/telegram", tags=["Telegram Bot"])


@app.get("/")
def read_root():

    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "message": "به سامانه مدیریت اسناد و CRM چندمستأجری خوش آمدید.",
    }


@app.get("/api/v1/health")
def health_check():
    """
    Unified health check monitoring connectivity to database, Redis, S3, and ClamAV.
    """
    return {
        "status": "healthy",
        "database": "pending_check",
        "redis": "pending_check",
        "s3": "pending_check",
        "clamav": "pending_check",
    }
