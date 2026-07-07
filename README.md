# 🛡️ سامانه چندمستأجری مدیریت اسناد و CRM پیمانکاری (Production-Ready)

این پروژه یک سیستم کاملاً ایمن، مقیاس‌پذیر و چندمستأجری (Multi-tenant) برای مدیریت اسناد فیزیکی و دیجیتال شرکت‌های پیمانکاری است. معماری سیستم بر مبنای جداسازی فیزیکی داده‌ها با استفاده از **PostgreSQL Row-Level Security (RLS)** پیاده‌سازی شده و فرآیندهای ثبت سند و انتقال حضانت فیزیکی اسناد به صورت دو مرحله‌ای (Handshake) طراحی شده است.

---

## 🏗️ معماری و قابلیت‌های کلیدی (Architectural Highlights)

### ۱. کلاینت اول و یکپارچگی منطق تجاری (Primary Client: Telegram Bot - CD-001)
- ربات تلگرام به عنوان کلاینت اصلی عملیاتی در نظر گرفته شده است.
- تمام گردش‌های کاری و عملیات موجود در ربات تلگرام، به طور همزمان از طریق اپلیکیشن وب نیز در دسترس هستند.
- منطق تجاری سیستم (Business Logic) تنها یک بار در لایه بک‌اند تعریف شده است و هر دو کلاینت (وب و تلگرام) از همان وب‌سرویس‌های **REST API** یکسان استفاده می‌کنند.

### ۲. پنل مدیریت ارشد کلان (Super Admin Panel - CD-002 & CD-003)
- یک پنل مدیریتی اختصاصی مستقل برای ارائه‌دهنده SaaS (SaaS Provider) تعبیه شده است که برای شرکت‌های مشتری به هیچ عنوان قابل مشاهده نیست.
- فرآیند تعریف و ثبت شرکت‌های جدید هم از طریق پنل وب و هم از طریق ربات تلگرام و از طریق فراخوانی یک API مشترک و بدون تکرار کدهای تجاری انجام می‌شود.
- **قابلیت‌های پنل مدیریت ارشد**:
  - ایجاد، ویرایش، تعلیق و حذف نرم‌افزاری (Soft Delete) شرکت‌ها.
  - صدور، تمدید و غیرفعال‌سازی لایسنس کارگاه‌ها.
  - تعیین مالک شرکت و تنظیم مجدد دسترسی‌ها و اطلاعات هویتی مالک.
  - پایش لایو شاخص‌های سیستم: نشست‌های فعال، پایداری API، وضعیت ربات تلگرام، میزان مصرف حافظه دیسک، آخرین زمان بکاپ‌گیری، لاگ‌های امنیتی و ممیزی.

### ۳. معماری ذخیره‌سازی ابری و خط لوله امنیت فایل (Storage Pipeline - CD-005)
- **فضای ذخیره‌سازی اصلی**: استفاده از فضای ابری سازگار با S3 (مانند MinIO، ابر آروان یا سایر هاست‌های دانلود ایرانی S3) با رابط‌های استاندارد و بدون وابستگی به سرویس‌های انحصاری خارجی.
- **ربات تلگرام صرفاً به عنوان فضای پشتیبان (Backup)** عمل می‌کند و فضای ذخیره‌سازی ابری اصلی S3 وظیفه نگهداری فایل‌ها را بر عهده دارد.
- **خط لوله بارگذاری فایل (Upload Pipeline)**:
  ```text
  بارگذاری فایل (Upload)
         ↓
  پایش و اسکن ویروس (Virus Scan via ClamAV)
         ↓
  پایگاه قرنطینه (Quarantine Bucket)
         ↓
  انتقال به ذخیره‌ساز اصلی (S3 Object Storage)
         ↓
  ثبت در پایگاه داده متا (Metadata Database)
         ↓
  پشتیبان‌گیری در کانال تلگرام (Telegram Backup Channel)
  ```

### ۴. تفکیک ابزارهای توسعه و شبیه‌سازها (CD-006)
- ابزارهای کمکی و توسعه سیستم (نظیر شبیه‌ساز تلگرام، ناظر باکت S3، دیتابیس ویوئر، ناظر RLS، دیباگر وب‌هوک و پنل‌های مانیتورینگ توسعه) تنها در زمان توسعه فعال هستند.
- در نسخه‌های تولیدی (Production Builds)، این ابزارها به طور کامل از ظاهر اپلیکیشن مخفی و از دسترس عمومی خارج می‌شوند.

### ۵. دفتر ممیزی زنجیره‌بندی شده (Cryptographically Chained Audit Log - CD-007)
- تمامی لاگ‌های حساس و رویدادهای سیستمی با استفاده از هش رمزنگاری در قالب **Cryptographically Chained Audit Log** ذخیره و ردیابی می‌شوند.
- زنجیره‌بندی هش‌ها بر اساس ترکیب فیلدها، کلید نمک امنیتی سرور (`AUDIT_LOG_SALT`) و هش لاگ قبلی (`previous_record_hash`) با استفاده از الگوریتم **SHA-256** انجام می‌شود.
- در این لایه هیچ‌گونه اصطلاحات بلاک‌چین یا اجماع توزیع‌شده وجود ندارد و سیستم بر روی زنجیره هش خطی و اعتبارسنجی متمرکز تمرکز دارد.

### ۶. ایزولاسیون کامل و حریم خصوصی مستأجرها (CD-008)
- هرگونه امکان کشف، دسترسی یا سوئیچ میان مستأجرها در پنل مشتریان به طور کامل ممنوع و غیرممکن است.
- انتخاب شرکت و سوئیچ بین Tenantها منحصراً در پنل Super Admin سیستم در دسترس است.

---

## 🛠️ پیش‌نیازهای سیستم (System Prerequisites)

مطمئن شوید نرم‌افزارهای زیر روی سیستم شما نصب هستند:
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

تمامی اندپوینت‌های حساس و کلیدی شامل کنترل دسترسی‌های نقش‌محور (`SUPER_ADMIN`، `OWNER`، `ADMIN`، `USER`) بوده و تایید اعتبار بر اساس استاندارد JWT Bearer پیاده‌سازی شده است.
