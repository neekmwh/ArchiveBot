import os
from typing import List
from dotenv import load_dotenv

# Load .env file if it exists
load_dotenv()

class Settings:
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "Contractor CRM Backend")
    ENV: str = os.getenv("ENV", "development")
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"
    
    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "super_secret_jwt_signing_key_change_me_in_production_102030")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    
    # Telegram Bot
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_BOT_HMAC_SECRET: str = os.getenv("TELEGRAM_BOT_HMAC_SECRET", "secure_telegram_bot_pairing_verification_secret_9988")
    
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "postgresql+psycopg2://postgres:postgres_password_1020@db:5432/contractor_crm"
    )
    
    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379/0")
    
    # S3 Storage
    S3_ENDPOINT_URL: str = os.getenv("S3_ENDPOINT_URL", "http://minio:9000")
    S3_ACCESS_KEY: str = os.getenv("S3_ACCESS_KEY", "minioadmin")
    S3_SECRET_KEY: str = os.getenv("S3_SECRET_KEY", "minioadmin_secret")
    S3_REGION: str = os.getenv("S3_REGION", "us-east-1")
    
    S3_MAIN_BUCKET: str = os.getenv("S3_MAIN_BUCKET", "contractor-crm-storage")
    S3_QUARANTINE_BUCKET: str = os.getenv("S3_QUARANTINE_BUCKET", "contractor-crm-quarantine")
    
    # ClamAV
    CLAMAV_HOST: str = os.getenv("CLAMAV_HOST", "clamav")
    CLAMAV_PORT: int = int(os.getenv("CLAMAV_PORT", "3310"))
    
    # Audit Logs Cryptochain
    AUDIT_LOG_SALT: str = os.getenv("AUDIT_LOG_SALT", "cryptographic_audit_chain_block_salt_key_0102")

    @property
    def is_development(self) -> bool:
        return self.ENV == "development"

settings = Settings()
