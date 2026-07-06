import logging
import uuid
import pyclamd
import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import ClientError
from fastapi import HTTPException, status, UploadFile
from typing import Optional, Tuple

from app.core.config import settings

logger = logging.getLogger("contractor_crm.services.storage")

class StorageService:
    def __init__(self):
        # Initialize the S3 client with compatibility configs for MinIO and AWS S3
        self.s3_client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
            region_name=settings.S3_REGION,
            config=BotoConfig(signature_version="s3v4"),
        )
        self.main_bucket = settings.S3_MAIN_BUCKET
        self.quarantine_bucket = settings.S3_QUARANTINE_BUCKET

    def ensure_buckets_exist(self) -> None:
        """
        Guarantees that both the Main storage bucket and the Quarantine bucket exist.
        Runs lazily on startup or first upload to prevent initialization race conditions.
        """
        for bucket in [self.main_bucket, self.quarantine_bucket]:
            try:
                self.s3_client.head_bucket(Bucket=bucket)
            except ClientError as e:
                error_code = e.response.get("Error", {}).get("Code")
                if error_code == "404" or error_code == "NoSuchBucket":
                    logger.info(f"Bucket '{bucket}' not found. Creating bucket...")
                    try:
                        self.s3_client.create_bucket(Bucket=bucket)
                        logger.info(f"🎉 Bucket '{bucket}' successfully created.")
                    except Exception as create_err:
                        logger.error(f"❌ Failed to create bucket '{bucket}': {str(create_err)}")
                else:
                    logger.error(f"⚠️ Unexpected S3 client error when heading '{bucket}': {str(e)}")

    def scan_file_for_viruses(self, file_bytes: bytes) -> Tuple[bool, Optional[str]]:
        """
        Sends file byte-stream to the ClamAV daemon for scanning.
        Returns (is_clean: bool, infection_details: Optional[str]).
        """
        try:
            # Initialize connection to ClamAV network socket
            cd = pyclamd.ClamdNetworkSocket(host=settings.CLAMAV_HOST, port=settings.CLAMAV_PORT)
            
            # Simple ping test to verify daemon is responsive
            cd.ping()
            
            scan_result = cd.scan_stream(file_bytes)
            if scan_result is None:
                return True, None
            
            # scan_result format is usually: {'stream': ('FOUND', 'Eicar-Signature')}
            infection = str(scan_result)
            logger.warning(f"🚨 SECURITY ALERT: ClamAV detected virus/malicious content in upload: {infection}")
            return False, infection
            
        except pyclamd.ConnectionError:
            # Safe fail-open/fail-closed behavior depending on environment.
            # In a secure production environment we MUST fail-closed to prevent zero-day bypasses.
            logger.error("❌ Cannot connect to ClamAV Antivirus Daemon. Connection refused.")
            if settings.is_development:
                logger.warning("⚠️ Running in development mode. Allowing upload to bypass ClamAV offline state.")
                return True, None
            return False, "سامانه آنتی‌ویروس در دسترس نیست. بارگذاری به دلایل امنیتی لغو شد."
        except Exception as e:
            logger.error(f"❌ Unexpected ClamAV error: {str(e)}")
            return False, str(e)

    def upload_pipeline(
        self, 
        upload_file: UploadFile, 
        tenant_id: uuid.UUID, 
        project_id: Optional[uuid.UUID] = None
    ) -> str:
        """
        Secure multi-stage upload pipeline:
        Stage 1: Ensure buckets exist.
        Stage 2: Write raw upload to the isolated Quarantine bucket.
        Stage 3: Read file bytes and stream to ClamAV Antivirus scanner.
        Stage 4: If scan fails/infected -> Delete immediately from Quarantine and raise HTTP 400.
        Stage 5: If clean -> Promote/Copy file from Quarantine to the production tenant bucket path.
        Stage 6: Clean up Quarantine and return the secure storage path.
        """
        self.ensure_buckets_exist()
        
        # Read the upload into memory
        file_bytes = upload_file.file.read()
        file_size = len(file_bytes)
        
        # Restrict uploads larger than 50MB for general document handling safety
        if file_size > 50 * 1024 * 1024:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="حداکثر حجم مجاز بارگذاری سند ۵۰ مگابایت می‌باشد."
            )

        # Generate a secure unique identifier for quarantine storage
        file_uuid = uuid.uuid4()
        extension = upload_file.filename.split(".")[-1] if "." in upload_file.filename else "pdf"
        quarantine_key = f"quarantine_{file_uuid}.{extension}"

        # 1. Upload to Quarantine Bucket
        try:
            self.s3_client.put_object(
                Bucket=self.quarantine_bucket,
                Key=quarantine_key,
                Body=file_bytes,
                ContentType=upload_file.content_type or "application/pdf"
            )
            logger.info(f"📥 File {upload_file.filename} staged in Quarantine bucket as {quarantine_key}")
        except Exception as e:
            logger.error(f"❌ Failed to write file to Quarantine bucket: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="خطا در ذخیره‌سازی اولیه سند در قرنطینه."
            )

        # 2. ClamAV Scanning
        is_clean, error_or_infection = self.scan_file_for_viruses(file_bytes)
        if not is_clean:
            # Delete infected file from quarantine immediately
            try:
                self.s3_client.delete_object(Bucket=self.quarantine_bucket, Key=quarantine_key)
            except Exception as del_err:
                logger.error(f"⚠️ Failed to purge infected file from quarantine: {str(del_err)}")
                
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"امنیت سند تایید نشد: محتوای آلوده یا مشکوک شناسایی شد. ({error_or_infection})"
            )

        # 3. Promote to production tenant bucket
        # Layout path matching: s3://contractor-crm-storage/{tenant_id}/{project_id or general}/{uuid}.{extension}
        proj_part = str(project_id) if project_id else "general"
        production_key = f"{tenant_id}/{proj_part}/{file_uuid}.{extension}"

        try:
            # Copy from quarantine to main production bucket
            self.s3_client.copy_object(
                Bucket=self.main_bucket,
                CopySource={"Bucket": self.quarantine_bucket, "Key": quarantine_key},
                Key=production_key
            )
            
            # Delete original from quarantine
            self.s3_client.delete_object(Bucket=self.quarantine_bucket, Key=quarantine_key)
            
            logger.info(f"🚀 File promoted to Main bucket: {production_key}")
            return f"s3://{self.main_bucket}/{production_key}"
            
        except Exception as e:
            logger.error(f"❌ Failed to promote clean file to main bucket: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="خطا در انتقال سند از قرنطینه به بایگانی اصلی."
            )

    def generate_presigned_url(self, s3_uri: str) -> str:
        """
        Generates a highly secure presigned URL for downloading/viewing a file.
        Enforces a strict 5-minute (300 seconds) expiration window.
        """
        if not s3_uri.startswith(f"s3://{self.main_bucket}/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="فرمت شناسه ذخیره‌سازی سند نامعتبر است."
            )
            
        key = s3_uri.replace(f"s3://{self.main_bucket}/", "")
        
        try:
            url = self.s3_client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.main_bucket, "Key": key},
                ExpiresIn=300  # 5 minutes expiry as required by Phase 4 constraints
            )
            return url
        except Exception as e:
            logger.error(f"❌ Failed to generate presigned URL for key '{key}': {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="خطا در تولید پیوند موقت نمایش سند."
            )

    def prune_voided_document(self, s3_uri: str) -> bool:
        """
        Archiving / Hard-purging of VOIDED documents.
        This represents the long-term lifecycle management action.
        """
        if not s3_uri.startswith(f"s3://{self.main_bucket}/"):
            return False
            
        key = s3_uri.replace(f"s3://{self.main_bucket}/", "")
        
        try:
            # For legal auditing we might copy to a separate archived key and then delete,
            # or apply immediate object deletion depending on business requirements.
            archive_key = f"voided_archive/{key}"
            
            # Copy to archive
            self.s3_client.copy_object(
                Bucket=self.main_bucket,
                CopySource={"Bucket": self.main_bucket, "Key": key},
                Key=archive_key
            )
            # Delete original
            self.s3_client.delete_object(Bucket=self.main_bucket, Key=key)
            logger.info(f"♻️ Voided document {key} successfully moved to long-term archive: {archive_key}")
            return True
        except Exception as e:
            logger.error(f"⚠️ Lifecycle management failed for voided document key '{key}': {str(e)}")
            return False

storage_service = StorageService()
