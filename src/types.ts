/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Tenant {
  id: string; // UUIDv7
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type UserRole = 'OWNER' | 'ADMIN' | 'USER';

export interface User {
  id: string; // UUIDv7
  tenant_id: string;
  name: string;
  phone_number: string;
  telegram_user_id: number | null;
  role: UserRole;
  is_active: boolean;
}

export interface Project {
  id: string; // UUIDv7
  tenant_id: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
}

export interface Document {
  id: string; // UUIDv7
  tenant_id: string;
  project_id: string | null;
  internal_id: string; // Unique within tenant
  doc_number: string | null;
  doc_type: string | null;
  doc_date: string | null; // Solar Hijri Date (e.g. 1405/05/01)
  description: string | null;
  physical_custodian_id: string;
  scan_file_path: string;
  status: 'ACTIVE' | 'VOIDED';
}

export interface DocumentDraft {
  id: string; // UUIDv7
  tenant_id: string;
  user_id: string;
  scan_file_path: string;
  metadata: {
    project_id?: string;
    doc_type?: string;
    doc_number?: string;
    doc_date?: string;
    description?: string;
    physical_custodian_id?: string;
  };
  current_step: 'UPLOAD_FILE' | 'SELECT_PROJECT' | 'ENTER_DOC_TYPE' | 'ENTER_DOC_NUMBER' | 'ENTER_DOC_DATE' | 'ENTER_DESCRIPTION' | 'SELECT_CUSTODIAN' | 'CONFIRM_REGISTRATION';
  created_at: string;
}

export interface CustodyTransfer {
  id: string; // UUIDv7
  tenant_id: string;
  document_id: string;
  sender_id: string;
  receiver_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
}

export interface AccessRequest {
  id: string; // UUIDv7
  tenant_id: string;
  document_id: string;
  user_id: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  decided_by: string | null;
}

export interface AuditLog {
  id: string; // UUIDv7
  tenant_id: string;
  user_id: string | null;
  action: string;
  entity_name: string;
  entity_id: string | null;
  details: any;
  previous_record_hash: string;
  current_record_hash: string;
  created_at: string;
}
