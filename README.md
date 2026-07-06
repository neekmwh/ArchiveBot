# 🛡️ سامانه چندمستأجری مدیریت اسناد و CRM پیمانکاری (Production-Ready)

این پروژه یک سیستم کاملاً ایمن، مقیاس‌پذیر و چندمستأجری (Multi-tenant) برای مدیریت اسناد فیزیکی و دیجیتال شرکت‌های پیمانکاری است. معماری سیستم بر مبنای جداسازی فیزیکی داده‌ها با استفاده از **PostgreSQL Row-Level Security (RLS)** پیاده‌سازی شده و فرآیندهای ثبت سند و انتقال حضانت فیزیکی اسناد به صورت دو مرحله‌ای (Handshake) از طریق وب و ربات تلگرام طراحی شده است.

---

## 🏗️ معماری و قابلیت‌های کلیدی (Architectural Highlights)

1. **جداسازی مستأجرها (Multi-Tenant Isolation)**:
   - استفاده از **PostgreSQL Row-Level Security (RLS)** جهت فیلترینگ خودکار داده‌ها بر اساس `tenant_id` در سطح پایگاه داده.
   - اعمال هوشمند کانتکست تراکنش با اجرای کدهای امن پارامتری نظیر `SET LOCAL app.current_tenant_id`.

2. **زنجیره حفاظتی لاگ‌ها (Cryptographic Audit Chaining)**:
   - ذخیره تمامی تغییرات و لاگ‌های سیستمی در قالب بلاک‌های متصل به هم (مشابه بلاک‌چین).
   - محاسبه هش هر لاگ با ترکیب فیلدها، کلید نمک امنیتی (`AUDIT_LOG_SALT`) و هش لاگ قبلی (`previous_record_hash`) با استفاده از الگوریتم **SHA-256**.
   - وجود سرویس اعتبارسنجی متمرکز جهت پایش لحظه‌ای و تشخیص آنی هرگونه دستکاری یا تخریب در پایگاه داده.

3. **امنیت پیشرفته فایل‌ها و ویروس‌یابی (Security & Storage Quarantine)**:
   - پیاده‌سازی فرآیند دو مرحله‌ای برای بارگذاری فایل‌ها. فایل‌ها ابتدا در باکت قرنطینه (Quarantine bucket) ذخیره شده و توسط دیمون **ClamAV** اسکن می‌شوند.
   - در صورت پاک بودن فایل، به باکت اصلی منتقل شده و آدرس موقت امن (Presigned S3 URL) تولید می‌شود.

4. **تحدید نرخ درخواست‌ها (Redis Sliding Window Rate Limiting)**:
   - مجهز به دکوراتور مقیاس‌پذیر نرخ فلو کنترل با Redis برای جلوگیری از حملات brute-force روی بخش‌های حساس (مانند ورود و تایید تلگرام).
   - پیاده‌سازی مکانیزم Fail-Open جهت تضمین دسترسی کاربران در مواقع قطعی موقت سرویس ردیس.

5. **امضای دیجیتال و تایید هویت تلگرام (HMAC Signature Verification)**:
   - راستی‌آزمایی درخواست‌های وب‌هوک ربات تلگرام با استفاده از الگوریتم رمزنگاری دوجانبه **HMAC-SHA256**.

---

## 🛠️ پیش‌نیازهای سیستم (System Prerequisites)

قبل از راه‌اندازی پروژه، مطمئن شوید نرم‌افزارهای زیر روی سیستم شما نصب هستند:
- **Docker** & **Docker Compose**
- **Node.js v18+** & **npm**
- **Python 3.11** (در صورت اجرای محلی بدون داکر)

---

## ⚙️ متغیرهای محیطی (Environment Variables)

یک فایل نمونه با نام `.env.example` در ریشه پروژه قرار دارد. برای تنظیم متغیرها، یک فایل به نام `.env` در ریشه پروژه بسازید و مقادیر زیر را به عنوان مرجع درون آن کپی کنید:

### 🐍 بک‌اند (Backend Services)
```env
# general config
ENV=production
DEBUG=false
PROJECT_NAME="Contractor CRM & Document Management"
SECRET_KEY="super_secure_jwt_signing_secret_key_change_me_in_prod"
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60

# database settings
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres_password_1020
POSTGRES_DB=contractor_crm
POSTGRES_PORT=5432

# rate limiter & cache
REDIS_URL=redis://redis:6379/0

# storage (MinIO / S3 Compat)
S3_ENDPOINT_URL=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin_secret
S3_REGION=us-east-1
S3_MAIN_BUCKET=contractor-crm-storage
S3_QUARANTINE_BUCKET=contractor-crm-quarantine

# security audit salt
AUDIT_LOG_SALT="system_cryptographic_chain_audit_salt_9988"

# antivirus daemon
CLAMAV_HOST=clamav
CLAMAV_PORT=3310

# telegram bot integrations
TELEGRAM_BOT_TOKEN="your_telegram_bot_api_token_here"
```

---

## 🚀 راه اندازی سریع با داکر (Docker Quickstart)

برای راه‌اندازی کل پشته نرم‌افزاری شامل پایگاه داده، پایگاه حافظه کش Redis، فضای ذخیره‌سازی MinIO، سیستم ضد ویروس ClamAV و سرویس بک‌اند، دستور زیر را در پوشه `backend` اجرا کنید:

```bash
docker-compose up --build -d
```

این دستور به صورت خودکار سرویس‌ها را بالا آورده و اسکریپت‌های مهاجرت (Migrations) پایگاه داده را اجرا کرده و امنیت RLS را فعال می‌کند.

### 🌐 پورت‌های در دسترس:
- **FastAPI Backend (docs & swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **MinIO S3 Console**: [http://localhost:9001](http://localhost:9001)

---

## 🗄️ مهاجرت پایگاه داده و تنظیمات دستی (Alembic Database Migrations)

اگر پروژه را به صورت محلی توسعه می‌دهید، می‌توانید مستقیماً از مهاجرت‌های Alembic استفاده کنید:

```bash
# رفتن به پوشه بک‌اند
cd backend

# ایجاد مهاجرت جدید در صورت تغییر مدل‌ها
alembic revision --autogenerate -m "add_new_features"

# اعمال مهاجرت روی دیتابیس فعال
alembic upgrade head
```

---

## 🧪 اجرای تست‌های واحد و پوشش کد (Testing & Coverage)

ما از فریم‌ورک قدرتمند `pytest` به همراه `pytest-cov` برای اعتبارسنجی فرآیندها استفاده می‌کنیم. تست‌ها به صورت کامل بر روی پایگاه‌داده موقت و ایزوله حافظه (In-Memory SQLite) اجرا می‌شوند تا هیچگونه داده فرعی روی پروژه وارد نشود.

برای اجرای تست‌ها و گزارش‌گیری میزان پوشش کد (Coverage):

```bash
cd backend
pytest --cov=app tests/ -v
```

پوشش تست‌ها بخش‌های حیاتی زیر را شامل می‌شود:
1. **Authentication**: تایید هویت دو مرحله‌ای و OTP.
2. **Document Registration**: فرآیند ثبت گام‌به‌گام و امنیت ورودی‌ها در مقابل XSS.
3. **Custody Transfer**: هندشیک و زنجیره انتقال سند فیزیکی.
4. **Audit Log Integrity**: صحت اتصال هش‌ها و کشف خودکار دستکاری لاگ‌ها.

---

## 🤖 مستندات تعاملی API (Swagger / OpenAPI Docs)

مستندات کامل پروژه همراه با توضیحات دقیق پارامترها و کدهای بازگشتی به صورت خودکار در مسیر اصلی بک‌اند قرار دارد:

- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

تمامی اندپوینت‌های حساس و کلیدی شامل کنترل دسترسی‌های نقش‌محور (`OWNER`، `ADMIN`، `USER`) بوده و تایید اعتبار بر اساس استاندارد JWT Bearer پیاده‌سازی شده است.
