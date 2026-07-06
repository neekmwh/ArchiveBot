/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tenant, User, Project, Document, DocumentDraft, CustodyTransfer, AuditLog, UserRole } from './types';
import { generateUUIDv7, sha256 } from './utils/crypto';

// LocalStorage Keys
const STORAGE_KEY = 'contractor_crm_data';

export interface DbData {
  tenants: Tenant[];
  users: User[];
  projects: Project[];
  documents: Document[];
  documentDrafts: DocumentDraft[];
  custodyTransfers: CustodyTransfer[];
  auditLogs: AuditLog[];
  // S3 Bucket Simulators
  s3Quarantine: { key: string; name: string; size: string; status: 'scanning' | 'clean' | 'infected'; content: string; uploaded_at: string }[];
  s3Storage: { key: string; name: string; size: string; tenant_id: string; project_id: string; content: string; tag: string; uploaded_at: string }[];
}

// Initial Mock Data (used if storage is empty)
const INITIAL_DATA: DbData = {
  tenants: [
    {
      id: 'tenant-0000-0000-0000-000000000001',
      name: 'پیمانکاری عمارت شرق',
      is_active: true,
      created_at: '2026-01-01T08:00:00Z',
      updated_at: '2026-01-01T08:00:00Z'
    },
    {
      id: 'tenant-0000-0000-0000-000000000002',
      name: 'سازه‌گستر آریا کاران',
      is_active: true,
      created_at: '2026-02-15T09:30:00Z',
      updated_at: '2026-02-15T09:30:00Z'
    }
  ],
  users: [
    // Tenant 1
    {
      id: 'user-0001-0000-0000-000000000001',
      tenant_id: 'tenant-0000-0000-0000-000000000001',
      name: 'علیرضا رضایی',
      phone_number: '09121112222',
      telegram_user_id: 123456789,
      role: 'OWNER',
      is_active: true
    },
    {
      id: 'user-0001-0000-0000-000000000002',
      tenant_id: 'tenant-0000-0000-0000-000000000001',
      name: 'مریم احمدی',
      phone_number: '09123334444',
      telegram_user_id: 987654321,
      role: 'ADMIN',
      is_active: true
    },
    {
      id: 'user-0001-0000-0000-000000000003',
      tenant_id: 'tenant-0000-0000-0000-000000000001',
      name: 'حسین سلیمانی',
      phone_number: '09125556666',
      telegram_user_id: 555666777,
      role: 'USER',
      is_active: true
    },
    {
      id: 'user-0001-0000-0000-000000000004',
      tenant_id: 'tenant-0000-0000-0000-000000000001',
      name: 'سهراب سپهری',
      phone_number: '09127778888',
      telegram_user_id: null, // Not paired yet
      role: 'USER',
      is_active: true
    },
    // Tenant 2
    {
      id: 'user-0002-0000-0000-000000000001',
      tenant_id: 'tenant-0000-0000-0000-000000000002',
      name: 'بابک رادمنش',
      phone_number: '09181112222',
      telegram_user_id: 888888888,
      role: 'OWNER',
      is_active: true
    },
    {
      id: 'user-0002-0000-0000-000000000002',
      tenant_id: 'tenant-0000-0000-0000-000000000002',
      name: 'نازنین کریمی',
      phone_number: '09183334444',
      telegram_user_id: 777777777,
      role: 'ADMIN',
      is_active: true
    },
    {
      id: 'user-0002-0000-0000-000000000003',
      tenant_id: 'tenant-0000-0000-0000-000000000002',
      name: 'علی موسوی',
      phone_number: '09185556666',
      telegram_user_id: null, // Not paired yet
      role: 'USER',
      is_active: true
    }
  ],
  projects: [
    // Tenant 1
    {
      id: 'project-0001-0000-0000-000000000001',
      tenant_id: 'tenant-0000-0000-0000-000000000001',
      name: 'برج باغ نیاوران',
      status: 'ACTIVE'
    },
    {
      id: 'project-0001-0000-0000-000000000002',
      tenant_id: 'tenant-0000-0000-0000-000000000001',
      name: 'پروژه تونل رسالت',
      status: 'ACTIVE'
    },
    {
      id: 'project-0001-0000-0000-000000000003',
      tenant_id: 'tenant-0000-0000-0000-000000000001',
      name: 'مجتمع تجاری پلاس',
      status: 'ARCHIVED'
    },
    // Tenant 2
    {
      id: 'project-0002-0000-0000-000000000001',
      tenant_id: 'tenant-0000-0000-0000-000000000002',
      name: 'احداث بزرگراه تهران شمال',
      status: 'ACTIVE'
    },
    {
      id: 'project-0002-0000-0000-000000000002',
      tenant_id: 'tenant-0000-0000-0000-000000000002',
      name: 'تسطیح اراضی فاز ۴ پردیس',
      status: 'ACTIVE'
    }
  ],
  documents: [
    // Tenant 1
    {
      id: 'doc-0001-0000-0000-000000000001',
      tenant_id: 'tenant-0000-0000-0000-000000000001',
      project_id: 'project-0001-0000-0000-000000000001',
      internal_id: 'DOC-1405-001',
      doc_number: 'N-1055-B',
      doc_type: 'صورت وضعیت شماره ۱ کارگاهی',
      doc_date: '1405/02/10',
      description: 'صورت وضعیت تایید شده بخش ابنیه فونداسیون نیاوران',
      physical_custodian_id: 'user-0001-0000-0000-000000000001',
      scan_file_path: 's3://contractor-crm-storage/tenant-0000-0000-0000-000000000001/project-0001-0000-0000-000000000001/doc_0001_14050210.pdf',
      status: 'ACTIVE'
    },
    {
      id: 'doc-0001-0000-0000-000000000002',
      tenant_id: 'tenant-0000-0000-0000-000000000001',
      project_id: 'project-0001-0000-0000-000000000002',
      internal_id: 'DOC-1405-002',
      doc_number: 'TX-440-C',
      doc_type: 'قرارداد پیمانکاری دست دوم آرماتوربندی',
      doc_date: '1405/03/15',
      description: 'قرارداد امضا شده با اکیپ پیمانکاری سلیمی',
      physical_custodian_id: 'user-0001-0000-0000-000000000002',
      scan_file_path: 's3://contractor-crm-storage/tenant-0000-0000-0000-000000000001/project-0001-0000-0000-000000000002/doc_0002_14050315.pdf',
      status: 'ACTIVE'
    }
  ],
  documentDrafts: [],
  custodyTransfers: [
    {
      id: 'transfer-0001-0000-0000-000000000001',
      tenant_id: 'tenant-0000-0000-0000-000000000001',
      document_id: 'doc-0001-0000-0000-000000000001',
      sender_id: 'user-0001-0000-0000-000000000001',
      receiver_id: 'user-0001-0000-0000-000000000003',
      status: 'PENDING'
    }
  ],
  auditLogs: [], // We will initialize these programmatically so their cryptographic chain starts beautifully
  s3Quarantine: [],
  s3Storage: [
    {
      key: 'tenant-0000-0000-0000-000000000001/project-0001-0000-0000-000000000001/doc_0001_14050210.pdf',
      name: 'doc_0001_14050210.pdf',
      size: '4.8 MB',
      tenant_id: 'tenant-0000-0000-0000-000000000001',
      project_id: 'project-0001-0000-0000-000000000001',
      content: 'Simulated scanned binary PDF data for نیاوران',
      tag: 'active',
      uploaded_at: '2026-05-10T11:00:00Z'
    },
    {
      key: 'tenant-0000-0000-0000-000000000001/project-0001-0000-0000-000000000002/doc_0002_14050315.pdf',
      name: 'doc_0002_14050315.pdf',
      size: '12.4 MB',
      tenant_id: 'tenant-0000-0000-0000-000000000001',
      project_id: 'project-0001-0000-0000-000000000002',
      content: 'Simulated scanned binary PDF data for تونل رسالت',
      tag: 'active',
      uploaded_at: '2026-06-15T14:45:00Z'
    }
  ]
};

// Singleton storage loader and updater
export class DbStore {
  private static data: DbData | null = null;

  public static load(): DbData {
    if (this.data) return this.data;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.data = JSON.parse(stored);
      } else {
        this.data = JSON.parse(JSON.stringify(INITIAL_DATA));
        this.seedInitialAuditLogs();
        this.save();
      }
    } catch (e) {
      console.error('Failed to load DB store from localStorage. Falling back to in-memory.', e);
      this.data = JSON.parse(JSON.stringify(INITIAL_DATA));
      this.seedInitialAuditLogs();
    }

    return this.data!;
  }

  public static save() {
    if (this.data) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
      } catch (e) {
        console.error('Failed to save DB to localStorage', e);
      }
    }
  }

  public static reset() {
    localStorage.removeItem(STORAGE_KEY);
    this.data = null;
    return this.load();
  }

  // Seed initial audit log cryptochain sequentially
  private static seedInitialAuditLogs() {
    if (!this.data) return;
    const logs: AuditLog[] = [];
    
    const events = [
      {
        tenant_id: 'tenant-0000-0000-0000-000000000001',
        user_id: 'user-0001-0000-0000-000000000001',
        action: 'TENANT_PROVISIONED',
        entity_name: 'Tenant',
        entity_id: 'tenant-0000-0000-0000-000000000001',
        details: { message: 'شرکت ساختمانی عمارت شرق باموفقیت ثبت شد.' },
        created_at: '2026-01-01T08:00:00Z'
      },
      {
        tenant_id: 'tenant-0000-0000-0000-000000000001',
        user_id: 'user-0001-0000-0000-000000000001',
        action: 'USER_CREATED',
        entity_name: 'User',
        entity_id: 'user-0001-0000-0000-000000000001',
        details: { name: 'علیرضا رضایی', role: 'OWNER' },
        created_at: '2026-01-01T08:15:00Z'
      },
      {
        tenant_id: 'tenant-0000-0000-0000-000000000002',
        user_id: 'user-0002-0000-0000-000000000001',
        action: 'TENANT_PROVISIONED',
        entity_name: 'Tenant',
        entity_id: 'tenant-0000-0000-0000-000000000002',
        details: { message: 'سازه‌گستر آریا کاران باموفقیت ثبت شد.' },
        created_at: '2026-02-15T09:30:00Z'
      },
      {
        tenant_id: 'tenant-0000-0000-0000-000000000001',
        user_id: 'user-0001-0000-0000-000000000001',
        action: 'DOCUMENT_REGISTERED',
        entity_name: 'Document',
        entity_id: 'doc-0001-0000-0000-000000000001',
        details: { doc_type: 'صورت وضعیت شماره ۱ کارگاهی', internal_id: 'DOC-1405-001' },
        created_at: '2026-05-10T11:05:00Z'
      }
    ];

    let lastHash = '0000000000000000000000000000000000000000000000000000000000000000';
    for (const ev of events) {
      const id = generateUUIDv7();
      const payloadString = JSON.stringify({
        id,
        tenant_id: ev.tenant_id,
        user_id: ev.user_id,
        action: ev.action,
        entity_name: ev.entity_name,
        entity_id: ev.entity_id,
        details: ev.details,
        previous_record_hash: lastHash,
        created_at: ev.created_at
      });
      const currentHash = sha256(payloadString);
      
      const newLog: AuditLog = {
        id,
        tenant_id: ev.tenant_id,
        user_id: ev.user_id,
        action: ev.action,
        entity_name: ev.entity_name,
        entity_id: ev.entity_id,
        details: ev.details,
        previous_record_hash: lastHash,
        current_record_hash: currentHash,
        created_at: ev.created_at
      };
      logs.push(newLog);
      lastHash = currentHash;
    }

    this.data.auditLogs = logs;
  }

  // 1. ADD NEW AUDIT LOG (with Cryptographic Chaining - ADR-026)
  public static addAuditLog(
    tenant_id: string,
    user_id: string | null,
    action: string,
    entity_name: string,
    entity_id: string | null,
    details: any
  ): AuditLog {
    const data = this.load();
    const id = generateUUIDv7();
    const created_at = new Date().toISOString();

    const lastLog = data.auditLogs.length > 0 ? data.auditLogs[data.auditLogs.length - 1] : null;
    const previous_record_hash = lastLog 
      ? lastLog.current_record_hash 
      : '0000000000000000000000000000000000000000000000000000000000000000';

    const logPayload = JSON.stringify({
      id,
      tenant_id,
      user_id,
      action,
      entity_name,
      entity_id,
      details,
      previous_record_hash,
      created_at
    });

    const current_record_hash = sha256(logPayload);

    const newLog: AuditLog = {
      id,
      tenant_id,
      user_id,
      action,
      entity_name,
      entity_id,
      details,
      previous_record_hash,
      current_record_hash,
      created_at
    };

    data.auditLogs.push(newLog);
    this.save();
    return newLog;
  }

  // Verification method: Recalculates all hashes in sequence to verify integrity
  public static verifyAuditLogIntegrity(): { isValid: boolean; errorAtLogId: string | null; logsVerifiedCount: number } {
    const data = this.load();
    let expectedPrevHash = '0000000000000000000000000000000000000000000000000000000000000000';

    for (let i = 0; i < data.auditLogs.length; i++) {
      const log = data.auditLogs[i];

      // 1. Check if the previous_record_hash in the log matches what we expected
      if (log.previous_record_hash !== expectedPrevHash) {
        return { isValid: false, errorAtLogId: log.id, logsVerifiedCount: i };
      }

      // 2. Recalculate hash of this log
      const logPayload = JSON.stringify({
        id: log.id,
        tenant_id: log.tenant_id,
        user_id: log.user_id,
        action: log.action,
        entity_name: log.entity_name,
        entity_id: log.entity_id,
        details: log.details,
        previous_record_hash: log.previous_record_hash,
        created_at: log.created_at
      });

      const calculatedHash = sha256(logPayload);
      if (log.current_record_hash !== calculatedHash) {
        return { isValid: false, errorAtLogId: log.id, logsVerifiedCount: i };
      }

      expectedPrevHash = log.current_record_hash;
    }

    return { isValid: true, errorAtLogId: null, logsVerifiedCount: data.auditLogs.length };
  }

  // 2. ROW-LEVEL SECURITY COMPLIANT QUERIES (ADR-007)
  public static getDocuments(tenant_id: string): Document[] {
    return this.load().documents.filter(d => d.tenant_id === tenant_id);
  }

  public static getUsers(tenant_id: string): User[] {
    return this.load().users.filter(u => u.tenant_id === tenant_id);
  }

  public static getProjects(tenant_id: string): Project[] {
    return this.load().projects.filter(p => p.tenant_id === tenant_id);
  }

  public static getCustodyTransfers(tenant_id: string): CustodyTransfer[] {
    return this.load().custodyTransfers.filter(c => c.tenant_id === tenant_id);
  }

  public static getAuditLogs(tenant_id: string): AuditLog[] {
    return this.load().auditLogs.filter(a => a.tenant_id === tenant_id);
  }

  // 3. DOCUMENT MANAGEMENT (PD-003)
  public static registerDocument(
    tenant_id: string,
    user_id: string,
    project_id: string | null,
    doc_type: string,
    doc_number: string,
    doc_date: string,
    description: string,
    physical_custodian_id: string,
    scan_file_path: string
  ): Document {
    const data = this.load();
    const id = generateUUIDv7();

    // Generate internal ID: DOC-1405-XXX where XXX is sequentially calculated within the tenant
    const currentYearStr = doc_date.split('/')[0] || '1405';
    const tenantDocs = data.documents.filter(d => d.tenant_id === tenant_id);
    const sequence = (tenantDocs.length + 1).toString().padStart(3, '0');
    const internal_id = `DOC-${currentYearStr}-${sequence}`;

    const newDoc: Document = {
      id,
      tenant_id,
      project_id,
      internal_id,
      doc_number: doc_number || null,
      doc_type: doc_type || null,
      doc_date: doc_date || null,
      description: description || null,
      physical_custodian_id,
      scan_file_path,
      status: 'ACTIVE'
    };

    data.documents.push(newDoc);

    // Audit log
    this.addAuditLog(tenant_id, user_id, 'DOCUMENT_REGISTERED', 'Document', id, {
      internal_id,
      doc_type,
      doc_number,
      doc_date,
      physical_custodian_id
    });

    this.save();
    return newDoc;
  }

  public static voidDocument(tenant_id: string, user_id: string, document_id: string) {
    const data = this.load();
    const doc = data.documents.find(d => d.id === document_id && d.tenant_id === tenant_id);
    if (!doc) throw new Error('سند یافت نشد یا عدم دسترسی!');

    doc.status = 'VOIDED';

    // Move file to Cold S3 or Tag it
    const s3File = data.s3Storage.find(s => s.key.includes(document_id) || doc.scan_file_path.includes(s.key));
    if (s3File) {
      s3File.tag = 'voided';
    }

    this.addAuditLog(tenant_id, user_id, 'DOCUMENT_VOIDED', 'Document', document_id, {
      internal_id: doc.internal_id,
      reason: 'ابطال دستی توسط مدیر'
    });

    this.save();
  }

  public static editDocumentMetadata(
    tenant_id: string,
    user_id: string,
    document_id: string,
    doc_type: string,
    doc_number: string,
    doc_date: string,
    description: string,
    project_id: string | null
  ) {
    const data = this.load();
    const doc = data.documents.find(d => d.id === document_id && d.tenant_id === tenant_id);
    if (!doc) throw new Error('سند یافت نشد یا عدم دسترسی!');

    const original = { ...doc };

    doc.doc_type = doc_type || null;
    doc.doc_number = doc_number || null;
    doc.doc_date = doc_date || null;
    doc.description = description || null;
    doc.project_id = project_id || null;

    this.addAuditLog(tenant_id, user_id, 'DOCUMENT_METADATA_UPDATED', 'Document', document_id, {
      internal_id: doc.internal_id,
      changes: {
        doc_type: doc.doc_type !== original.doc_type ? { from: original.doc_type, to: doc.doc_type } : undefined,
        doc_number: doc.doc_number !== original.doc_number ? { from: original.doc_number, to: doc.doc_number } : undefined,
        doc_date: doc.doc_date !== original.doc_date ? { from: original.doc_date, to: doc.doc_date } : undefined,
        project_id: doc.project_id !== original.project_id ? { from: original.project_id, to: doc.project_id } : undefined,
      }
    });

    this.save();
  }

  // 4. PHYSICAL CUSTODY HANDSHAKE TRAJECTORY (PD-001 / PD-004)
  public static initiateCustodyTransfer(
    tenant_id: string,
    document_id: string,
    sender_id: string,
    receiver_id: string
  ): CustodyTransfer {
    const data = this.load();
    const id = generateUUIDv7();

    // Verify document exists
    const doc = data.documents.find(d => d.id === document_id && d.tenant_id === tenant_id);
    if (!doc) throw new Error('سند نامعتبر!');

    // Create a new PENDING custody transfer
    const newTransfer: CustodyTransfer = {
      id,
      tenant_id,
      document_id,
      sender_id,
      receiver_id,
      status: 'PENDING'
    };

    data.custodyTransfers.push(newTransfer);

    this.addAuditLog(tenant_id, sender_id, 'CUSTODY_TRANSFER_INITIATED', 'CustodyTransfer', id, {
      document_id,
      internal_id: doc.internal_id,
      sender_id,
      receiver_id
    });

    this.save();
    return newTransfer;
  }

  public static approveCustodyTransfer(tenant_id: string, transfer_id: string, receiver_id: string) {
    const data = this.load();
    const xfer = data.custodyTransfers.find(c => c.id === transfer_id && c.tenant_id === tenant_id);
    if (!xfer) throw new Error('تراکنش انتقال یافت نشد!');
    if (xfer.receiver_id !== receiver_id) throw new Error('شما مجاز به تایید این انتقال نیستید!');

    xfer.status = 'APPROVED';

    // Update document custodian
    const doc = data.documents.find(d => d.id === xfer.document_id && d.tenant_id === tenant_id);
    if (doc) {
      const prevCustodian = doc.physical_custodian_id;
      doc.physical_custodian_id = receiver_id;

      this.addAuditLog(tenant_id, receiver_id, 'CUSTODY_TRANSFER_APPROVED', 'CustodyTransfer', transfer_id, {
        document_id: doc.id,
        internal_id: doc.internal_id,
        previous_custodian: prevCustodian,
        new_custodian: receiver_id
      });
    }

    this.save();
  }

  public static rejectCustodyTransfer(tenant_id: string, transfer_id: string, receiver_id: string) {
    const data = this.load();
    const xfer = data.custodyTransfers.find(c => c.id === transfer_id && c.tenant_id === tenant_id);
    if (!xfer) throw new Error('تراکنش انتقال یافت نشد!');
    if (xfer.receiver_id !== receiver_id) throw new Error('شما مجاز به رد این انتقال نیستید!');

    xfer.status = 'REJECTED';

    this.addAuditLog(tenant_id, receiver_id, 'CUSTODY_TRANSFER_REJECTED', 'CustodyTransfer', transfer_id, {
      document_id: xfer.document_id,
      sender_id: xfer.sender_id,
      receiver_id
    });

    this.save();
  }

  public static cancelCustodyTransfer(tenant_id: string, transfer_id: string, sender_id: string) {
    const data = this.load();
    const xfer = data.custodyTransfers.find(c => c.id === transfer_id && c.tenant_id === tenant_id);
    if (!xfer) throw new Error('تراکنش انتقال یافت نشد!');
    if (xfer.sender_id !== sender_id) throw new Error('فقط فرستنده می‌تواند این انتقال را لغو کند!');
    if (xfer.status !== 'PENDING') throw new Error('این انتقال قبلاً تعیین تکلیف شده است!');

    xfer.status = 'CANCELLED';

    this.addAuditLog(tenant_id, sender_id, 'CUSTODY_TRANSFER_CANCELLED', 'CustodyTransfer', transfer_id, {
      document_id: xfer.document_id,
      sender_id,
      receiver_id: xfer.receiver_id
    });

    this.save();
  }

  // 5. S3 SIMULATION LAYER with Quarantine & ClamAV scanning (PD-005)
  public static simulateUploadToS3(
    file_name: string,
    content: string,
    size_str: string,
    is_infected: boolean = false
  ): Promise<{ success: boolean; quarantine_key: string; message: string }> {
    return new Promise((resolve) => {
      const data = this.load();
      const randomId = generateUUIDv7().substring(0, 8);
      const quarantine_key = `quarantine_${randomId}_${file_name}`;

      // Insert into quarantine
      const quarantineItem = {
        key: quarantine_key,
        name: file_name,
        size: size_str,
        status: 'scanning' as const,
        content: content,
        uploaded_at: new Date().toISOString()
      };

      data.s3Quarantine.push(quarantineItem);
      this.save();

      // Trigger ClamAV antivirus simulation after 2 seconds
      setTimeout(() => {
        const freshData = this.load();
        const item = freshData.s3Quarantine.find(q => q.key === quarantine_key);
        if (item) {
          if (is_infected) {
            item.status = 'infected';
            this.save();
            resolve({ success: false, quarantine_key, message: 'بدافزار توسط ClamAV کشف گردید! فایل حذف شد.' });
          } else {
            item.status = 'clean';
            this.save();
            resolve({ success: true, quarantine_key, message: 'فایل با موفقیت تایید شد (ClamAV Clean).' });
          }
        } else {
          resolve({ success: false, quarantine_key, message: 'فایل در قرنطینه یافت نشد.' });
        }
      }, 1500);
    });
  }

  // Moves file from Quarantine to Main Storage Bucket with Tenant prefix
  public static promoteToS3Storage(
    quarantine_key: string,
    tenant_id: string,
    project_id: string,
    document_id: string
  ): string {
    const data = this.load();
    const qIndex = data.s3Quarantine.findIndex(q => q.key === quarantine_key);
    if (qIndex === -1) throw new Error('فایل در قرنطینه یافت نشد!');
    const qItem = data.s3Quarantine[qIndex];

    const timestamp = Math.floor(Date.now() / 1000);
    const ext = qItem.name.split('.').pop() || 'pdf';
    const finalKey = `${tenant_id}/${project_id}/${document_id}_${timestamp}.${ext}`;

    // Add to storage
    data.s3Storage.push({
      key: finalKey,
      name: qItem.name,
      size: qItem.size,
      tenant_id,
      project_id,
      content: qItem.content,
      tag: 'active',
      uploaded_at: new Date().toISOString()
    });

    // Remove from quarantine
    data.s3Quarantine.splice(qIndex, 1);

    // Write to audit log
    this.addAuditLog(tenant_id, null, 'FILE_STORED_S3', 'S3Object', document_id, {
      key: finalKey,
      size: qItem.size,
      antivirus: 'ClamAV_Passed'
    });

    this.save();
    return `s3://contractor-crm-storage/${finalKey}`;
  }

  // Generates 5-minute Presigned URL (ADR-008)
  public static generatePresignedUrl(key: string): string {
    // Return a dummy secure URL with signature parameters
    const expires = Math.floor((Date.now() + 5 * 60 * 1000) / 1000); // 5 minutes
    const signature = sha256(`${key}_expires_${expires}_secret_hmac_signature`);
    return `https://s3.contractor-crm.ir/contractor-crm-storage/${key}?AWSAccessKeyId=AKIAIOSFODNN7EXAMPLE&Expires=${expires}&Signature=${signature.substring(0, 16)}`;
  }

  // 6. PROJECTS & USERS
  public static addProject(tenant_id: string, user_id: string, name: string): Project {
    const data = this.load();
    const id = generateUUIDv7();

    const newProj: Project = {
      id,
      tenant_id,
      name,
      status: 'ACTIVE'
    };

    data.projects.push(newProj);

    this.addAuditLog(tenant_id, user_id, 'PROJECT_CREATED', 'Project', id, { name });
    this.save();
    return newProj;
  }

  public static toggleProjectStatus(tenant_id: string, user_id: string, project_id: string) {
    const data = this.load();
    const proj = data.projects.find(p => p.id === project_id && p.tenant_id === tenant_id);
    if (!proj) throw new Error('پروژه یافت نشد!');

    const original = proj.status;
    proj.status = proj.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE';

    this.addAuditLog(tenant_id, user_id, 'PROJECT_STATUS_CHANGED', 'Project', project_id, {
      name: proj.name,
      from: original,
      to: proj.status
    });

    this.save();
  }

  public static addUser(tenant_id: string, admin_user_id: string, name: string, phone: string, role: UserRole): User {
    const data = this.load();
    const id = generateUUIDv7();

    // Force unique phone within tenant
    if (data.users.some(u => u.phone_number === phone && u.tenant_id === tenant_id)) {
      throw new Error('این شماره تلفن هم‌اکنون ثبت شده است!');
    }

    const newUser: User = {
      id,
      tenant_id,
      name,
      phone_number: phone,
      telegram_user_id: null,
      role,
      is_active: true
    };

    data.users.push(newUser);

    this.addAuditLog(tenant_id, admin_user_id, 'USER_CREATED', 'User', id, { name, phone, role });
    this.save();
    return newUser;
  }

  public static toggleUserStatus(tenant_id: string, admin_user_id: string, user_id: string) {
    const data = this.load();
    const user = data.users.find(u => u.id === user_id && u.tenant_id === tenant_id);
    if (!user) throw new Error('کاربر یافت نشد!');
    if (user.id === admin_user_id) throw new Error('شما نمی‌توانید وضعیت خودتان را تغییر دهید!');

    user.is_active = !user.is_active;

    this.addAuditLog(tenant_id, admin_user_id, 'USER_STATUS_TOGGLED', 'User', user_id, {
      name: user.name,
      role: user.role,
      is_active: user.is_active
    });

    this.save();
  }
}
