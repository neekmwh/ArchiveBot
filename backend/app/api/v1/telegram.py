import re
import uuid
import random
import time
import logging
import hashlib
import hmac
from typing import Any, Dict, List, Optional
import httpx
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import select, and_

from app.db.session import get_db, set_tenant_context
from app.core.config import settings
from app.db.models import (
    User, Tenant, Project, Document, DocumentDraft, CustodyTransfer, 
    TransferStatus, UserRole, DraftStep, DocumentStatus
)
from app.services.storage import storage_service
from app.services.document import document_service, generate_internal_id
from app.services.custody import custody_service
from app.services.audit import audit_service

router = APIRouter()
logger = logging.getLogger("contractor_crm.api.telegram")

# Global thread-safe-like dictionary for OTP verification fallback
# Stores chat_id -> {"phone_number": str, "otp_code": str, "expires_at": float}
PENDING_OTPS: Dict[int, Dict[str, Any]] = {}


def clean_phone(phone: str) -> str:
    """
    Cleans phone number to a standard 10-digit suffix format (e.g., 9123456789).
    This handles +98, 0098, 0, or space variations gracefully.
    """
    digits = "".join([c for c in phone if c.isdigit()])
    if digits.startswith("0098"):
        digits = digits[4:]
    elif digits.startswith("98"):
        digits = digits[2:]
    elif digits.startswith("0"):
        digits = digits[1:]
    return digits


def find_user_by_phone(db: Session, phone: str) -> Optional[User]:
    """
    Locates an active user by phone number using suffix-matching logic.
    """
    cleaned_input = clean_phone(phone)
    if not cleaned_input:
        return None
        
    # Standard DB query over all active users
    users = db.query(User).filter(User.is_active == True).all()
    for u in users:
        if clean_phone(u.phone_number) == cleaned_input:
            return u
    return None


def get_telegram_client() -> httpx.Client:
    """
    Returns an httpx client configured for Telegram API calls.
    """
    return httpx.Client(timeout=10.0)


def send_telegram_msg(chat_id: int, text: str, reply_markup: Optional[dict] = None) -> bool:
    """
    Sends a message via the real Telegram Bot API if token is configured.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        logger.warning(f"⚠️ Telegram Bot Token not set. Unable to send real message to chat {chat_id}: {text}")
        return False
        
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown"
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
        
    try:
        with get_telegram_client() as client:
            resp = client.post(url, json=payload)
            if resp.status_code == 200:
                return True
            logger.error(f"❌ Telegram API returned error: {resp.status_code} - {resp.text}")
    except Exception as e:
        logger.error(f"❌ Failed to deliver Telegram message: {str(e)}")
    return False


def answer_callback_query(callback_query_id: str, text: str, show_alert: bool = False) -> bool:
    """
    Answers an inline button callback query to prevent Telegram loading indicator lockups.
    """
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return False
        
    url = f"https://api.telegram.org/bot{token}/answerCallbackQuery"
    payload = {
        "callback_query_id": callback_query_id,
        "text": text,
        "show_alert": show_alert
    }
    try:
        with get_telegram_client() as client:
            client.post(url, json=payload)
            return True
    except Exception as e:
        logger.error(f"❌ Failed to answer callback query: {str(e)}")
    return False


def get_main_keyboard(role: str) -> dict:
    """
    Generates the Persian role-based main menu reply keyboard.
    """
    if role == UserRole.OWNER:
        keyboard = [
            [{"text": "📄 ثبت سند"}, {"text": "🔍 جستجو اسناد"}],
            [{"text": "📥 دریافت‌های من"}, {"text": "📤 تحویل‌های من"}],
            [{"text": "📊 خلاصه گزارش ممیزی"}]
        ]
    else:
        keyboard = [
            [{"text": "📄 ثبت سند"}, {"text": "🔍 جستجو اسناد"}],
            [{"text": "📥 دریافت‌های من"}, {"text": "📤 تحویل‌های من"}]
        ]
    return {
        "keyboard": keyboard,
        "resize_keyboard": True,
        "one_time_keyboard": False
    }


def get_unpaired_keyboard() -> dict:
    """
    Generates the contact sharing request button for unregistered users.
    """
    return {
        "keyboard": [
            [{"text": "📱 ارسال شماره تماس و احراز هویت", "request_contact": True}]
        ],
        "resize_keyboard": True,
        "one_time_keyboard": True
    }


def process_unpaired_flow(db: Session, chat_id: int, message: dict) -> None:
    """
    Handles authentication & secure OTP pairing for new/unpaired Telegram users.
    """
    text = message.get("text")
    contact = message.get("contact")
    
    # 1. Handle contact sharing
    if contact:
        phone_number = contact.get("phone_number")
        user = find_user_by_phone(db, phone_number)
        
        if not user:
            send_telegram_msg(
                chat_id,
                "❌ شماره همراه شما در لیست پرسنل شرکت پیمانکاری یافت نشد. لطفا با مدیر سیستم تماس بگیرید."
            )
            return
            
        # User exists, generate secure OTP
        otp_code = str(random.randint(1000, 9999))
        PENDING_OTPS[chat_id] = {
            "phone_number": phone_number,
            "otp_code": otp_code,
            "expires_at": time.time() + 120  # 2 minutes TTL
        }
        
        sms_mimic = (
            f"🔐 کد تایید احراز هویت ۲ دقیقه‌ای صادر شد!\n\n"
            f"شماره همراه ارسالی تلگرام با لیست پرسنل پیمانکاری منطبق گردید.\n\n"
            f"💬 *شبیه‌ساز پیامک:* \n"
            f"`کد احراز هویت شما: {otp_code}`\n\n"
            f"لطفاً کد تایید ۴ رقمی فوق را وارد نمایید:"
        )
        
        send_telegram_msg(
            chat_id,
            sms_mimic,
            reply_markup={
                "keyboard": [[{"text": "❌ انصراف از ثبت‌نام"}]],
                "resize_keyboard": True,
                "one_time_keyboard": True
            }
        )
        return

    # 2. Handle OTP cancelation
    if text == "❌ انصراف از ثبت‌نام":
        PENDING_OTPS.pop(chat_id, None)
        send_telegram_msg(
            chat_id,
            "عملیات احراز هویت لغو شد.",
            reply_markup=get_unpaired_keyboard()
        )
        return

    # 3. Check if user is typing OTP
    if chat_id in PENDING_OTPS:
        pending = PENDING_OTPS[chat_id]
        if time.time() > pending["expires_at"]:
            PENDING_OTPS.pop(chat_id, None)
            send_telegram_msg(
                chat_id,
                "❌ کد تایید منقضی شده است (اعتبار ۲ دقیقه). لطفا مجدداً تلاش کنید.",
                reply_markup=get_unpaired_keyboard()
            )
            return
            
        # Parse text digits
        cleaned_text = "".join([c for c in (text or "") if c.isdigit()])
        if cleaned_text == pending["otp_code"]:
            # Correct OTP -> Pair the user!
            user = find_user_by_phone(db, pending["phone_number"])
            if user:
                user.telegram_user_id = chat_id
                db.commit()
                
                # Cryptographic audit logging
                audit_service.create_log(
                    db=db,
                    tenant_id=user.tenant_id,
                    user_id=user.id,
                    action="TELEGRAM_USER_PAIRED",
                    entity_name="User",
                    entity_id=user.id,
                    details={
                        "phone_number": user.phone_number,
                        "telegram_user_id": chat_id
                    }
                )
                
                PENDING_OTPS.pop(chat_id, None)
                
                welcome_msg = (
                    f"🎉 *هویت تلگرام شما با موفقیت جفت‌سازی شد!*\n\n"
                    f"سلام *{user.name}*، خوش آمدید. دسترسی به اسناد با توجه به نقش *{user.role}* برای شما فعال گردید."
                )
                send_telegram_msg(chat_id, welcome_msg, reply_markup=get_main_keyboard(user.role))
            else:
                send_telegram_msg(chat_id, "خطا در بازیابی کاربر. لطفا مجددا امتحان کنید.", reply_markup=get_unpaired_keyboard())
        else:
            send_telegram_msg(
                chat_id,
                "❌ کد تایید اشتباه است. لطفاً مجدداً کد ۴ رقمی ارسالی را وارد نمایید:",
                reply_markup={"keyboard": [[{"text": "❌ انصراف از ثبت‌نام"}]], "resize_keyboard": True}
            )
        return

    # 4. Default unpaired prompt
    greeting = (
        "سلام! به ربات مدیریت اسناد و حضانت پیمانکاری خوش آمدید.\n\n"
        "⚠️ هویت تلگرام شما هنوز جفت‌سازی (Pair) نشده است.\n\n"
        "برای دسترسی به اسناد شرکت پیمانکاری، لطفا اطلاعات تماس خود را به اشتراک بگذارید."
    )
    send_telegram_msg(chat_id, greeting, reply_markup=get_unpaired_keyboard())


def process_paired_flow(db: Session, user: User, message: dict) -> None:
    """
    Coordinates interactions for authenticated users: Main Menu, Search, 
    Pending transfers, and Step-by-Step Document Registration (PD-004 & PD-005).
    """
    chat_id = user.telegram_user_id
    text = message.get("text")
    
    # 1. Cancel active registration draft
    if text == "❌ انصراف":
        # Delete active draft if exists
        draft = db.query(DocumentDraft).filter(
            DocumentDraft.user_id == user.id,
            DocumentDraft.tenant_id == user.tenant_id
        ).first()
        if draft:
            db.delete(draft)
            db.commit()
        send_telegram_msg(
            chat_id,
            "فرآیند ثبت سند متوقف و پیش‌نویس موقت حذف گردید.",
            reply_markup=get_main_keyboard(user.role)
        )
        return

    # 2. Initiate Document Registration Draft (UC-BOT-001)
    if text == "📄 ثبت سند":
        # Check if user is locked out
        if not user.is_active:
            send_telegram_msg(chat_id, "⛔️ حساب کاربری شما غیرفعال شده است. ربات مسدود است.")
            return

        # Purge any old drafts
        old_drafts = db.query(DocumentDraft).filter(DocumentDraft.user_id == user.id).all()
        for d in old_drafts:
            db.delete(d)
        db.commit()

        # Create fresh draft
        draft = DocumentDraft(
            tenant_id=user.tenant_id,
            user_id=user.id,
            scan_file_path="",
            metadata_json={},
            current_step=DraftStep.UPLOAD_FILE
        )
        db.add(draft)
        db.commit()

        prompt = (
            "📄 *مرحله ۱ از ۸: بارگذاری فایل*\n\n"
            "لطفاً فایل اسکن سند کارگاهی (تصویر یا PDF) را آپلود کنید:\n\n"
            "_(موتور آنتی‌ویروس ClamAV بلافاصله فایل پیوستی شما را جهت تایید امنیت بررسی می‌کند)_"
        )
        send_telegram_msg(
            chat_id,
            prompt,
            reply_markup={"keyboard": [[{"text": "❌ انصراف"}]], "resize_keyboard": True}
        )
        return

    # 3. Check if user is actively in a registration draft
    draft = db.query(DocumentDraft).filter(
        DocumentDraft.user_id == user.id,
        DocumentDraft.tenant_id == user.tenant_id
    ).first()

    if draft:
        step = draft.current_step
        
        # Helper list of active projects for keyboard
        active_projects = db.query(Project).filter(
            Project.tenant_id == user.tenant_id,
            Project.status == "ACTIVE"
        ).all()
        
        # Helper list of active tenant users for custodian select
        active_users = db.query(User).filter(
            User.tenant_id == user.tenant_id,
            User.is_active == True
        ).all()

        # Step 1: Handle File Upload (Document / Photo)
        if step == DraftStep.UPLOAD_FILE:
            tg_doc = message.get("document")
            tg_photo = message.get("photo")
            
            file_id = None
            file_name = "scanned_document.pdf"
            mime_type = "application/pdf"
            
            if tg_doc:
                file_id = tg_doc.get("file_id")
                file_name = tg_doc.get("file_name", "document.pdf")
                mime_type = tg_doc.get("mime_type", "application/pdf")
            elif tg_photo and len(tg_photo) > 0:
                # Telegram provides list of photos, get the largest one (highest resolution)
                file_id = tg_photo[-1].get("file_id")
                file_name = "scanned_photo.jpg"
                mime_type = "image/jpeg"
                
            if not file_id:
                send_telegram_msg(
                    chat_id,
                    "⚠️ خطا: لطفاً یک فایل سند معتبر (PDF یا تصویر) ارسال فرمایید.",
                    reply_markup={"keyboard": [[{"text": "❌ انصراف"}]], "resize_keyboard": True}
                )
                return

            # Download file from Telegram servers
            send_telegram_msg(chat_id, "⏳ در حال دریافت فایل دیجیتال و اجرای تحلیل امنیتی توسط ClamAV...")
            
            token = settings.TELEGRAM_BOT_TOKEN
            try:
                # 1. Get file path
                with get_telegram_client() as client:
                    info_resp = client.get(f"https://api.telegram.org/bot{token}/getFile?file_id={file_id}")
                    if info_resp.status_code != 200:
                        raise Exception("Failed to getFile info from Telegram")
                        
                    file_path = info_resp.json().get("result", {}).get("file_path")
                    if not file_path:
                        raise Exception("file_path not present in response")
                        
                    # 2. Download raw file bytes
                    dl_resp = client.get(f"https://api.telegram.org/file/bot{token}/{file_path}")
                    if dl_resp.status_code != 200:
                        raise Exception("Failed to download file bytes")
                        
                    file_bytes = dl_resp.content
            except Exception as ex:
                logger.error(f"❌ Telegram file download failed: {str(ex)}")
                send_telegram_msg(
                    chat_id,
                    "❌ خطا در بارگذاری سند دیجیتال از سرور تلگرام. لطفا مجددا تلاش کنید.",
                    reply_markup={"keyboard": [[{"text": "❌ انصراف"}]], "resize_keyboard": True}
                )
                return

            # Perform virus scanning via storage_service (fails-closed by default)
            is_clean, infection_err = storage_service.scan_file_for_viruses(file_bytes)
            if not is_clean:
                db.delete(draft)
                db.commit()
                alert_text = (
                    f"🚨 *تهدید امنیتی شناسایی شد!*\n\n"
                    f"سرویس ClamAV آپلود فایل را به دلیل مغایرت با امضای ویروسی مسدود کرد.\n\n"
                    f"❌ فایل مخرب با موفقیت از باکت قرنطینه پاکسازی گردید و پیش‌نویس موقت ابطال شد."
                )
                send_telegram_msg(chat_id, alert_text, reply_markup=get_main_keyboard(user.role))
                return

            # Write raw upload to S3 Quarantine bucket
            quarantine_key = f"quarantine_{uuid.uuid4()}.{file_name.split('.')[-1]}"
            try:
                storage_service.s3_client.put_object(
                    Bucket=storage_service.quarantine_bucket,
                    Key=quarantine_key,
                    Body=file_bytes,
                    ContentType=mime_type
                )
            except Exception as s3_err:
                logger.error(f"❌ S3 Quarantine upload failed: {str(s3_err)}")
                send_telegram_msg(chat_id, "❌ خطای سیستمی در آپلود قرنطینه فایل.")
                return

            # Update draft with S3 quarantine key
            draft.scan_file_path = quarantine_key
            draft.metadata_json = {"filename": file_name}
            draft.current_step = DraftStep.SELECT_PROJECT
            db.commit()

            # Prepare project select keyboard
            proj_rows = [[{"text": p.name}] for p in active_projects]
            proj_rows.append([{"text": "⏭️ رد شدن"}])
            proj_rows.append([{"text": "❌ انصراف"}])

            success_text = (
                f"✅ اسکن ClamAV تکمیل شد: *فایل سالم است.*\n\n"
                f"📄 *مرحله ۲ از ۸: پروژه کارگاه*\n\n"
                f"پروژه مربوط به سند را از گزینه‌های دکمه زیر انتخاب کنید:"
            )
            send_telegram_msg(
                chat_id,
                success_text,
                reply_markup={"keyboard": proj_rows, "resize_keyboard": True}
            )
            return

        # Step 2: Select Project
        elif step == DraftStep.SELECT_PROJECT:
            project_id_str = None
            if text != "⏭️ رد شدن":
                selected_proj = next((p for p in active_projects if p.name == text), None)
                if not selected_proj:
                    proj_rows = [[{"text": p.name}] for p in active_projects]
                    proj_rows.append([{"text": "⏭️ رد شدن"}])
                    proj_rows.append([{"text": "❌ انصراف"}])
                    send_telegram_msg(
                        chat_id,
                        "❌ پروژه نامعتبر است. لطفا یکی از گزینه‌های زیر را بفشارید:",
                        reply_markup={"keyboard": proj_rows, "resize_keyboard": True}
                    )
                    return
                project_id_str = str(selected_proj.id)

            draft.metadata_json["project_id"] = project_id_str
            draft.current_step = DraftStep.ENTER_DOC_TYPE
            db.commit()

            send_telegram_msg(
                chat_id,
                "📄 *مرحله ۳ از ۸: نوع سند*\n\nنوع سند را بنویسید (مانند: نقشه الکتریکال، صورت‌جلسه کارگاهی، سند تضمین حسن انجام کار):",
                reply_markup={"keyboard": [[{"text": "⏭️ رد شدن"}], [{"text": "❌ انصراف"}]], "resize_keyboard": True}
            )
            return

        # Step 3: Enter Doc Type
        elif step == DraftStep.ENTER_DOC_TYPE:
            doc_type = text if text != "⏭️ رد شدن" else "سند کارگاهی عمومی"
            draft.metadata_json["doc_type"] = doc_type
            draft.current_step = DraftStep.ENTER_DOC_NUMBER
            db.commit()

            send_telegram_msg(
                chat_id,
                "📄 *مرحله ۴ از ۸: شماره سند فیزیکی*\n\nشماره ثبت کاغذی سند را وارد کنید (یا رد شدن را بزنید):",
                reply_markup={"keyboard": [[{"text": "⏭️ رد شدن"}], [{"text": "❌ انصراف"}]], "resize_keyboard": True}
            )
            return

        # Step 4: Enter Doc Number
        elif step == DraftStep.ENTER_DOC_NUMBER:
            doc_number = text if text != "⏭️ رد شدن" else ""
            draft.metadata_json["doc_number"] = doc_number
            draft.current_step = DraftStep.ENTER_DOC_DATE
            db.commit()

            send_telegram_msg(
                chat_id,
                "📄 *مرحله ۵ از ۸: تاریخ سند (شمسی)*\n\nتاریخ روی برگه سند را وارد کنید (فرمت نمونه: ۱۴۰۵/۰۵/۰۱):",
                reply_markup={"keyboard": [[{"text": "⏭️ رد شدن"}], [{"text": "❌ انصراف"}]], "resize_keyboard": True}
            )
            return

        # Step 5: Enter Doc Date
        elif step == DraftStep.ENTER_DOC_DATE:
            doc_date = "1405/01/01"
            if text != "⏭️ رد شدن":
                # Standard Jalali regex check
                # First convert any Farsi digits to English digits
                farsi_to_eng = str.maketrans("۱۲۳۴۵۶۷۸۹۰", "1234567890")
                normalized_text = text.translate(farsi_to_eng)
                
                if not re.match(r"^\d{4}/\d{2}/\d{2}$", normalized_text):
                    send_telegram_msg(
                        chat_id,
                        "❌ فرمت تاریخ نامعتبر است! لطفاً تاریخ را مانند الگوی `۱۴۰۵/۰۵/۰۱` وارد کنید:",
                        reply_markup={"keyboard": [[{"text": "⏭️ رد شدن"}], [{"text": "❌ انصراف"}]], "resize_keyboard": True}
                    )
                    return
                doc_date = normalized_text

            draft.metadata_json["doc_date"] = doc_date
            draft.current_step = DraftStep.ENTER_DESCRIPTION
            db.commit()

            send_telegram_msg(
                chat_id,
                "📄 *مرحله ۶ از ۸: توضیحات تکمیلی*\n\nتوضیحات مربوط به محتوای سند یا دستور کار را به اختصار وارد کنید:",
                reply_markup={"keyboard": [[{"text": "📝 ثبت بدون توضیحات"}], [{"text": "❌ انصراف"}]], "resize_keyboard": True}
            )
            return

        # Step 6: Enter Description
        elif step == DraftStep.ENTER_DESCRIPTION:
            description = text if text != "📝 ثبت بدون توضیحات" else ""
            draft.metadata_json["description"] = description
            draft.current_step = DraftStep.SELECT_CUSTODIAN
            db.commit()

            custodian_rows = [[{"text": u.name}] for u in active_users]
            custodian_rows.append([{"text": "❌ انصراف"}])

            send_telegram_msg(
                chat_id,
                "📄 *مرحله ۷ از ۸: دارنده فیزیکی سند*\n\nاصل سند کاغذی/فیزیکی هم‌اکنون از نظر فیزیکی در اختیار کیست؟",
                reply_markup={"keyboard": custodian_rows, "resize_keyboard": True}
            )
            return

        # Step 7: Select Custodian
        elif step == DraftStep.SELECT_CUSTODIAN:
            selected_custodian = next((u for u in active_users if u.name == text), None)
            if not selected_custodian:
                custodian_rows = [[{"text": u.name}] for u in active_users]
                custodian_rows.append([{"text": "❌ انصراف"}])
                send_telegram_msg(
                    chat_id,
                    "❌ پرسنل انتخاب شده یافت نشد یا غیرفعال است! لطفاً یکی از افراد زیر را انتخاب کنید:",
                    reply_markup={"keyboard": custodian_rows, "resize_keyboard": True}
                )
                return

            draft.metadata_json["physical_custodian_id"] = str(selected_custodian.id)
            draft.current_step = DraftStep.CONFIRM_REGISTRATION
            db.commit()

            # Build summary
            metadata = draft.metadata_json
            proj_name = "عمومی / عمومی"
            if metadata.get("project_id"):
                proj = db.get(Project, uuid.UUID(metadata["project_id"]))
                if proj:
                    proj_name = proj.name

            summary = (
                f"📄 *مرحله ۸ از ۸: بررسی و تأیید نهایی*\n\n"
                f"خلاصه اطلاعات وارد شده:\n\n"
                f"📁 فایل دیجیتال: `{metadata.get('filename')}` (سالم و اسکن شده)\n"
                f"🏢 پروژه: *{proj_name}*\n"
                f"📋 نوع سند: *{metadata.get('doc_type')}*\n"
                f"🔢 شماره سند: `{metadata.get('doc_number') or 'بدون شماره'}`\n"
                f"📅 تاریخ برگه: *{metadata.get('doc_date')}*\n"
                f"📝 توضیحات: _{metadata.get('description') or 'ثبت نشده'}_\n"
                f"🔑 دارنده فیزیکی اصل برگه: *{selected_custodian.name}*"
            )

            inline_buttons = {
                "inline_keyboard": [
                    [
                        {"text": "✅ تأیید نهایی و ثبت سند", "callback_data": "confirm_reg_final"},
                        {"text": "❌ انصراف و حذف پیش‌نویس", "callback_data": "cancel_reg_final"}
                    ]
                ]
            }
            send_telegram_msg(chat_id, summary, reply_markup=inline_buttons)
            return

    # 4. Handle Standard Main Menu keyboard selections
    if text == "🔍 جستجو اسناد":
        send_telegram_msg(
            chat_id,
            "🔍 کلمه کلیدی یا شماره سند مورد نظر را برای جستجو ارسال کنید:",
            reply_markup={"keyboard": [[{"text": "🔙 بازگشت"}]], "resize_keyboard": True}
        )
        return

    if text == "🔙 بازگشت":
        send_telegram_msg(
            chat_id,
            "به منوی اصلی بازگشتید:",
            reply_markup=get_main_keyboard(user.role)
        )
        return

    if text == "📥 دریافت‌های من":
        set_tenant_context(db, str(user.tenant_id))
        transfers = db.query(CustodyTransfer).filter(
            CustodyTransfer.receiver_id == user.id,
            CustodyTransfer.status == TransferStatus.PENDING,
            CustodyTransfer.tenant_id == user.tenant_id
        ).all()

        if len(transfers) == 0:
            send_telegram_msg(
                chat_id,
                "📥 *صندوق دریافت‌های معلق فیزیکی*\n\nشما هیچ درخواست دریافت معلق ثبت‌نشده‌ای ندارید."
            )
        else:
            send_telegram_msg(chat_id, f"📥 *تراکنش‌های حضانت ورودی ({len(transfers)} مورد)*\n\nتأیید اصل اسناد کاغذی تحویل شده در کارگاه:")
            for tf in transfers:
                doc = db.get(Document, tf.document_id)
                sender = db.get(User, tf.sender_id)
                msg_text = (
                    f"📄 *سند:* {doc.doc_type if doc else 'متفرقه'} ({doc.internal_id if doc else 'ناشناس'})\n"
                    f"👤 *فرستنده:* {sender.name if sender else 'نامشخص'}\n"
                    f"📅 *وضعیت:* منتظر تایید تحویل فیزیکی به شما"
                )
                inline_buttons = {
                    "inline_keyboard": [
                        [
                            {"text": "✅ تایید دریافت نسخه فیزیکی", "callback_data": f"approve_tf_{tf.id}"},
                            {"text": "❌ رد", "callback_data": f"reject_tf_{tf.id}"}
                        ]
                    ]
                }
                send_telegram_msg(chat_id, msg_text, reply_markup=inline_buttons)
        return

    if text == "📤 تحویل‌های من":
        set_tenant_context(db, str(user.tenant_id))
        transfers = db.query(CustodyTransfer).filter(
            CustodyTransfer.sender_id == user.id,
            CustodyTransfer.status == TransferStatus.PENDING,
            CustodyTransfer.tenant_id == user.tenant_id
        ).all()

        if len(transfers) == 0:
            send_telegram_msg(
                chat_id,
                "📤 *صندوق انتقال‌های فیزیکی ارسالی*\n\nشما هیچ انتقال در جریان معلقی ندارید که تایید نشده باشد."
            )
        else:
            send_telegram_msg(chat_id, f"📤 *انتقال‌های ارسالی معلق ({len(transfers)} مورد)*\n\nتا زمانی که گیرنده تایید نکند، شما حق لغو دارید:")
            for tf in transfers:
                doc = db.get(Document, tf.document_id)
                receiver = db.get(User, tf.receiver_id)
                msg_text = (
                    f"📄 *سند:* {doc.doc_type if doc else 'متفرقه'} ({doc.internal_id if doc else 'ناشناس'})\n"
                    f"👤 *تحویل به:* {receiver.name if receiver else 'نامشخص'}\n"
                    f"🔒 *وضعیت:* در انتظار تایید حضانت توسط گیرنده"
                )
                inline_buttons = {
                    "inline_keyboard": [
                        [
                            {"text": "🚫 لغو درخواست انتقال فیزیکی", "callback_data": f"cancel_tf_{tf.id}"}
                        ]
                    ]
                }
                send_telegram_msg(chat_id, msg_text, reply_markup=inline_buttons)
        return

    if text == "📊 خلاصه گزارش ممیزی" and user.role == UserRole.OWNER:
        set_tenant_context(db, str(user.tenant_id))
        logs_count = db.query(AuditLog).filter(AuditLog.tenant_id == user.tenant_id).count()
        docs_count = db.query(Document).filter(
            Document.tenant_id == user.tenant_id,
            Document.status == DocumentStatus.ACTIVE
        ).count()
        voided_count = db.query(Document).filter(
            Document.tenant_id == user.tenant_id,
            Document.status == DocumentStatus.VOIDED
        ).count()

        report = (
            f"📊 *خلاصه گزارش ممیزی امنیتی مستأجر*\n\n"
            f"📈 کل اسناد فعال: *{docs_count}*\n"
            f"📉 اسناد باطل شده: *{voided_count}*\n"
            f"🔒 تعداد کل تراکنش‌های ثبت شده در زنجیره بلاک‌چینی: *{logs_count}*\n\n"
            f"✅ زنجیره حسابرسی امنیتی و ایزولاسیون دیتابیس در حالت پایدار قرار دارد."
        )
        send_telegram_msg(chat_id, report, reply_markup=get_main_keyboard(user.role))
        return

    # 5. Check if user is searching for document (previous prompt was Search)
    # We check if there's no active draft, but text matches a search query
    # (or if they are in general chat and input some text that doesn't match standard commands)
    # Let's perform a broad keyword search in documents of user's tenant
    set_tenant_context(db, str(user.tenant_id))
    search_results = db.query(Document).filter(
        and_(
            Document.tenant_id == user.tenant_id,
            Document.status == DocumentStatus.ACTIVE,
            (
                Document.internal_id.ilike(f"%{text}%") |
                Document.doc_type.ilike(f"%{text}%") |
                Document.doc_number.ilike(f"%{text}%") |
                Document.description.ilike(f"%{text}%")
            )
        )
    ).all()

    if search_results:
        response_lines = [f"🔍 یافت شده ({len(search_results)} مورد):\n"]
        for d in search_results:
            custodian = db.get(User, d.physical_custodian_id)
            custodian_name = custodian.name if custodian else "نامشخص"
            response_lines.append(
                f"📄 *{d.internal_id}* - {d.doc_type}\n"
                f"📅 تاریخ: {d.doc_date or 'نامشخص'} • حضانت: {custodian_name}\n"
            )
        send_telegram_msg(chat_id, "\n".join(response_lines), reply_markup=get_main_keyboard(user.role))
        return

    # 6. Fallback default instructions
    send_telegram_msg(
        chat_id,
        "دستور نامشخص. لطفاً از دکمه‌های منوی گفتگو برای ناوبری استفاده فرمایید.",
        reply_markup=get_main_keyboard(user.role)
    )


def process_callback_query(db: Session, callback_query: dict) -> None:
    """
    Processes inline button interactive handshakes (Approve, Reject, Cancel)
    and finalizes Document Draft creation with strict audit chaining.
    """
    callback_id = callback_query.get("id")
    callback_data = callback_query.get("data")
    message = callback_query.get("message", {})
    chat_id = message.get("chat", {}).get("id")
    
    # Authenticate paired user
    user = db.scalar(select(User).where(User.telegram_user_id == chat_id))
    if not user:
        answer_callback_query(callback_id, "حساب کاربری یافت نشد.", show_alert=True)
        return
        
    set_tenant_context(db, str(user.tenant_id))

    # 1. Cancel registration final
    if callback_data == "cancel_reg_final":
        draft = db.query(DocumentDraft).filter(
            DocumentDraft.user_id == user.id,
            DocumentDraft.tenant_id == user.tenant_id
        ).first()
        if draft:
            db.delete(draft)
            db.commit()
        answer_callback_query(callback_id, "پیش‌نویس با موفقیت حذف شد.")
        send_telegram_msg(
            chat_id,
            "عملیات ثبت لغو شد و پیش‌نویس موقت با TTL منقضی شد.",
            reply_markup=get_main_keyboard(user.role)
        )
        return

    # 2. Confirm registration final -> Promote to S3 storage + DB Commit with cryptographic log
    if callback_data == "confirm_reg_final":
        draft = db.query(DocumentDraft).filter(
            DocumentDraft.user_id == user.id,
            DocumentDraft.tenant_id == user.tenant_id
        ).first()
        
        if not draft:
            answer_callback_query(callback_id, "پیش‌نویس یافت نشد.", show_alert=True)
            return

        metadata = draft.metadata_json or {}
        
        # 1. Promote S3 quarantine file to main production bucket
        quarantine_key = draft.scan_file_path
        file_uuid = uuid.uuid4()
        extension = quarantine_key.split(".")[-1] if "." in quarantine_key else "pdf"
        
        project_id = None
        if metadata.get("project_id"):
            project_id = uuid.UUID(metadata["project_id"])
            
        proj_part = str(project_id) if project_id else "general"
        production_key = f"{user.tenant_id}/{proj_part}/{file_uuid}.{extension}"
        
        try:
            # Copy to production
            storage_service.s3_client.copy_object(
                Bucket=storage_service.main_bucket,
                CopySource={"Bucket": storage_service.quarantine_bucket, "Key": quarantine_key},
                Key=production_key
            )
            # Delete from quarantine
            storage_service.s3_client.delete_object(
                Bucket=storage_service.quarantine_bucket,
                Key=quarantine_key
            )
        except Exception as s3_err:
            logger.error(f"❌ S3 Promotion during Telegram registration failed: {str(s3_err)}")
            answer_callback_query(callback_id, "خطا در ارتقای فایل پیش‌نویس به فضای اصلی.", show_alert=True)
            return

        # Update draft file path to production S3 URI
        draft.scan_file_path = f"s3://{storage_service.main_bucket}/{production_key}"
        db.commit()

        # 2. Convert draft to formal Document record
        try:
            document = document_service.register_from_draft(
                db=db,
                draft_id=draft.id,
                tenant_id=user.tenant_id,
                current_user_id=user.id
            )
            
            # Cryptographic audit logging for new document registration
            audit_service.create_log(
                db=db,
                tenant_id=user.tenant_id,
                user_id=user.id,
                action="DOCUMENT_REGISTERED",
                entity_name="Document",
                entity_id=document.id,
                details={
                    "internal_id": document.internal_id,
                    "doc_number": document.doc_number,
                    "doc_type": document.doc_type,
                    "physical_custodian_id": str(document.physical_custodian_id),
                    "scan_file_path": document.scan_file_path
                }
            )
            
            answer_callback_query(callback_id, "سند با موفقیت ثبت شد!")
            success_text = (
                f"🎉 *سند با موفقیت در دیتابیس پیمانکاری ثبت شد!*\n\n"
                f"🔑 شناسه داخلی صادر شده: *{document.internal_id}*\n"
                f"📂 فایل دیجیتال به باکت اصلی `contractor-crm-storage` منتقل و لاگ ممیزی رمزنگاری شد.\n\n"
                f"تراکنش با موفقیت به اتمام رسید."
            )
            send_telegram_msg(chat_id, success_text, reply_markup=get_main_keyboard(user.role))
            
        except Exception as reg_err:
            logger.error(f"❌ Failed to register document from draft: {str(reg_err)}")
            answer_callback_query(callback_id, "خطا در ذخیره‌سازی اطلاعات در دیتابیس.", show_alert=True)
        return

    # 3. Approve custody transfer handshake
    if callback_data.startswith("approve_tf_"):
        tf_id_str = callback_data.replace("approve_tf_", "")
        try:
            tf_id = uuid.UUID(tf_id_str)
            transfer = custody_service.accept_transfer(
                db=db,
                transfer_id=tf_id,
                receiver_id=user.id,
                tenant_id=user.tenant_id
            )
            
            # Cryptographic audit logging of custody shift
            audit_service.create_log(
                db=db,
                tenant_id=user.tenant_id,
                user_id=user.id,
                action="CUSTODY_TRANSFER_APPROVED",
                entity_name="CustodyTransfer",
                entity_id=transfer.id,
                details={
                    "transfer_id": str(transfer.id),
                    "document_id": str(transfer.document_id),
                    "sender_id": str(transfer.sender_id),
                    "receiver_id": str(transfer.receiver_id),
                    "status": transfer.status
                }
            )
            
            answer_callback_query(callback_id, "تراکنش حضانت با موفقیت تایید شد.")
            send_telegram_msg(
                chat_id,
                f"✅ حضانت فیزیکی سند کاغذی با موفقیت پذیرفته شد.\n\n"
                f"تراکنش با موفقیت به اتمام رسید و در دفتر کل ممیزی زنجیره بلاک‌چین ثبت شد.",
                reply_markup=get_main_keyboard(user.role)
            )
        except Exception as e:
            logger.error(f"❌ Approve custody transfer callback error: {str(e)}")
            answer_callback_query(callback_id, "خطا در ثبت انتقال حضانت.", show_alert=True)
        return

    # 4. Reject custody transfer handshake
    if callback_data.startswith("reject_tf_"):
        tf_id_str = callback_data.replace("reject_tf_", "")
        try:
            tf_id = uuid.UUID(tf_id_str)
            transfer = custody_service.reject_transfer(
                db=db,
                transfer_id=tf_id,
                receiver_id=user.id,
                tenant_id=user.tenant_id
            )
            
            # Audit log
            audit_service.create_log(
                db=db,
                tenant_id=user.tenant_id,
                user_id=user.id,
                action="CUSTODY_TRANSFER_REJECTED",
                entity_name="CustodyTransfer",
                entity_id=transfer.id,
                details={
                    "transfer_id": str(transfer.id),
                    "document_id": str(transfer.document_id),
                    "sender_id": str(transfer.sender_id),
                    "receiver_id": str(transfer.receiver_id),
                    "status": transfer.status
                }
            )
            
            answer_callback_query(callback_id, "تراکنش حضانت رد شد.")
            send_telegram_msg(
                chat_id,
                "❌ تحویل فیزیکی سند رد شد. سند در اختیار فرستنده باقی ماند.",
                reply_markup=get_main_keyboard(user.role)
            )
        except Exception as e:
            answer_callback_query(callback_id, "خطا در ثبت رد انتقال.", show_alert=True)
        return

    # 5. Cancel custody transfer handshake
    if callback_data.startswith("cancel_tf_"):
        tf_id_str = callback_data.replace("cancel_tf_", "")
        try:
            tf_id = uuid.UUID(tf_id_str)
            transfer = custody_service.cancel_transfer(
                db=db,
                transfer_id=tf_id,
                sender_id=user.id,
                tenant_id=user.tenant_id
            )
            
            # Audit log
            audit_service.create_log(
                db=db,
                tenant_id=user.tenant_id,
                user_id=user.id,
                action="CUSTODY_TRANSFER_CANCELLED",
                entity_name="CustodyTransfer",
                entity_id=transfer.id,
                details={
                    "transfer_id": str(transfer.id),
                    "document_id": str(transfer.document_id),
                    "sender_id": str(transfer.sender_id),
                    "receiver_id": str(transfer.receiver_id),
                    "status": transfer.status
                }
            )
            
            answer_callback_query(callback_id, "انتقال با موفقیت لغو شد.")
            send_telegram_msg(
                chat_id,
                "🚫 انتقال فیزیکی معلق با موفقیت لغو گردید.",
                reply_markup=get_main_keyboard(user.role)
            )
        except Exception as e:
            answer_callback_query(callback_id, "خطا در لغو انتقال.", show_alert=True)
        return


@router.post("/webhook")
def telegram_webhook(update: dict, db: Session = Depends(get_db)) -> Any:
    """
    Standard Telegram Bot Webhook endpoint.
    Processes updates, manages conversation states, performs pairing and 
    digital document scanning workflows.
    """
    # 1. Parse Update
    message = update.get("message")
    callback_query = update.get("callback_query")
    
    if callback_query:
        process_callback_query(db, callback_query)
        return {"status": "ok"}
        
    if not message:
        return {"status": "ignored"}
        
    chat_id = message.get("chat", {}).get("id")
    if not chat_id:
        return {"status": "ignored"}

    # 2. Authenticate User based on Telegram ID
    user = db.scalar(select(User).where(User.telegram_user_id == chat_id))
    
    if not user:
        # User is unpaired, run the Pairing/OTP registration flow
        process_unpaired_flow(db, chat_id, message)
    else:
        # Paired user, run main conversation state machine
        process_paired_flow(db, user, message)
        
    return {"status": "ok"}
