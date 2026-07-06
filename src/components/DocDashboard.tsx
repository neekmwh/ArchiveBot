/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { DbStore } from '../dbStore';
import { Document, Project, User, UserRole } from '../types';
import { 
  Plus, Search, FolderPlus, UserPlus, FileText, Trash2, 
  Send, ShieldAlert, CheckCircle, RefreshCw, X, Eye, Link2, 
  UserCheck, AlertTriangle
} from 'lucide-react';

interface DocDashboardProps {
  tenantId: string;
  activeUser: User | null;
  refreshDb: () => void;
  onSelectTab: (tab: string) => void;
  onSetBotSimUser: (user: User) => void;
}

export default function DocDashboard({ 
  tenantId, 
  activeUser, 
  refreshDb, 
  onSelectTab,
  onSetBotSimUser 
}: DocDashboardProps) {
  const dbData = DbStore.load();
  const tenant = dbData.tenants.find(t => t.id === tenantId);
  const documents = DbStore.getDocuments(tenantId);
  const users = DbStore.getUsers(tenantId);
  const projects = DbStore.getProjects(tenantId);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'ACTIVE' | 'VOIDED'>('ACTIVE');

  // Modals / Form States
  const [showAddProject, setShowAddProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPhone, setNewUserPhone] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('USER');

  const [showAddDoc, setShowAddDoc] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocNumber, setNewDocNumber] = useState('');
  const [newDocType, setNewDocType] = useState('نقشه شاپ کارگاهی');
  const [newDocDate, setNewDocDate] = useState('1405/05/01');
  const [newDocDesc, setNewDocDesc] = useState('');
  const [newDocProj, setNewDocProj] = useState('');
  const [newDocCustodian, setNewDocCustodian] = useState('');

  const [transferDoc, setTransferDoc] = useState<Document | null>(null);
  const [transferReceiver, setTransferReceiver] = useState('');

  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [presignedUrlKey, setPresignedUrlKey] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const triggerSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const triggerError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 4000);
  };

  // Handlers
  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser) return;
    if (activeUser.role === 'USER') {
      triggerError('خطای دسترسی: تنها OWNER و ADMIN مجاز به تعریف پروژه هستند.');
      return;
    }
    if (!newProjectName.trim()) return;

    try {
      DbStore.addProject(tenantId, activeUser.id, newProjectName.trim());
      setNewProjectName('');
      setShowAddProject(false);
      refreshDb();
      triggerSuccess('پروژه جدید با موفقیت ثبت و گزارش ممیزی زنجیره‌بندی شد.');
    } catch (err: any) {
      triggerError(err.message || 'خطا در ثبت پروژه');
    }
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser) return;
    if (activeUser.role !== 'OWNER') {
      triggerError('خطای دسترسی: تنها کاربر مالک (OWNER) مجاز به ثبت پرسنل جدید است.');
      return;
    }
    if (!newUserName.trim() || !newUserPhone.trim()) return;

    try {
      DbStore.addUser(tenantId, activeUser.id, newUserName.trim(), newUserPhone.trim(), newUserRole);
      setNewUserName('');
      setNewUserPhone('');
      setShowAddUser(false);
      refreshDb();
      triggerSuccess('پرسنل جدید با موفقیت ثبت و زنجیره حسابرسی به‌روزرسانی شد.');
    } catch (err: any) {
      triggerError(err.message || 'خطا در ثبت کاربر');
    }
  };

  const handleManualAddDoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUser) return;
    if (activeUser.role === 'USER') {
      triggerError('تنها OWNER و ADMIN مجاز به ثبت دستی سند خارج از بستر ربات هستند.');
      return;
    }
    if (!newDocName.trim() || !newDocCustodian) {
      triggerError('لطفاً عنوان سند و نگهدارنده فیزیکی اولیه را مشخص کنید.');
      return;
    }

    try {
      // Simulate quarantine bypass for manual registration with a mock clean file path
      const mockKey = `${tenantId}/${newDocProj || 'no_project'}/manual_${Date.now()}.pdf`;
      
      // Seed file into mock storage directly
      const loaded = DbStore.load();
      loaded.s3Storage.push({
        key: mockKey,
        name: `${newDocName}.pdf`,
        size: '1.2 MB',
        tenant_id: tenantId,
        project_id: newDocProj || 'no_project',
        content: `Manual Upload scan data for ${newDocName}`,
        tag: 'active',
        uploaded_at: new Date().toISOString()
      });
      DbStore.save();

      DbStore.registerDocument(
        tenantId,
        activeUser.id,
        newDocProj || null,
        newDocType,
        newDocNumber,
        newDocDate,
        newDocDesc,
        newDocCustodian,
        `s3://contractor-crm-storage/${mockKey}`
      );

      setNewDocName('');
      setNewDocNumber('');
      setNewDocDesc('');
      setShowAddDoc(false);
      refreshDb();
      triggerSuccess('سند جدید در دیتابیس با موفقیت ثبت و ممیزی شد.');
    } catch (err: any) {
      triggerError(err.message || 'خطا در ثبت سند');
    }
  };

  const handleVoidDocument = (docId: string) => {
    if (!activeUser) return;
    if (activeUser.role === 'USER') {
      triggerError('خطای دسترسی: کاربران عادی مجاز به ابطال سند نیستند.');
      return;
    }

    if (confirm('آیا از ابطال کامل این سند اطمینان دارید؟ این عمل غیرقابل بازگشت است و فایلهای پیوست به چرخه سرد منتقل میشوند.')) {
      try {
        DbStore.voidDocument(tenantId, activeUser.id, docId);
        refreshDb();
        triggerSuccess('سند با موفقیت باطل شد و لاگ زنجیره امنیت تغییرناپذیر ثبت گردید.');
      } catch (err: any) {
        triggerError(err.message);
      }
    }
  };

  const handleStartTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferDoc || !transferReceiver || !activeUser) return;

    try {
      DbStore.initiateCustodyTransfer(tenantId, transferDoc.id, activeUser.id, transferReceiver);
      setTransferDoc(null);
      setTransferReceiver('');
      refreshDb();
      triggerSuccess('درخواست انتقال فیزیکی ایجاد شد. منتظر تایید گیرنده در ربات تلگرام.');
      
      // Proactively suggest checking the Telegram Simulator
      if (confirm('تراکنش با موفقیت ایجاد شد! آیا می‌خواهید برای تایید و شبیه‌سازی گفتگو به بخش ربات تلگرام منتقل شوید؟')) {
        onSelectTab('telegram');
      }
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  const handleGenerateUrl = (filePath: string) => {
    // S3 path is like s3://contractor-crm-storage/tenant_id/...
    const key = filePath.replace('s3://contractor-crm-storage/', '');
    const url = DbStore.generatePresignedUrl(key);
    setPresignedUrl(url);
    setPresignedUrlKey(key);
  };

  // Toggle Project active state
  const handleToggleProject = (projId: string) => {
    if (!activeUser || activeUser.role === 'USER') return;
    try {
      DbStore.toggleProjectStatus(tenantId, activeUser.id, projId);
      refreshDb();
      triggerSuccess('وضعیت پروژه با موفقیت ویرایش شد.');
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  // Toggle User active state
  const handleToggleUser = (uId: string) => {
    if (!activeUser || activeUser.role !== 'OWNER') {
      triggerError('تنها مالک (OWNER) مجاز به غیرفعالسازی پرسنل است.');
      return;
    }
    try {
      DbStore.toggleUserStatus(tenantId, activeUser.id, uId);
      refreshDb();
      triggerSuccess('وضعیت دسترسی پرسنل با موفقیت ویرایش شد.');
    } catch (err: any) {
      triggerError(err.message);
    }
  };

  // Filter logic
  const filteredDocs = documents.filter(doc => {
    const matchesSearch = 
      doc.internal_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.doc_type && doc.doc_type.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (doc.doc_number && doc.doc_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (doc.description && doc.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesProject = !selectedProject || doc.project_id === selectedProject;
    
    const matchesStatus = 
      selectedStatus === 'ALL' ||
      (selectedStatus === 'ACTIVE' && doc.status === 'ACTIVE') ||
      (selectedStatus === 'VOIDED' && doc.status === 'VOIDED');

    return matchesSearch && matchesProject && matchesStatus;
  });

  return (
    <div className="rtl space-y-6 text-[#e2e2e7]">
      
      {/* Messages banner */}
      {successMsg && (
        <div className="bg-green-500/10 border-r-4 border-green-500 text-green-400 p-4 rounded-xl shadow-md flex items-center justify-between text-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)}><X className="w-4 h-4 text-green-400" /></button>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-500/10 border-r-4 border-red-500 text-red-400 p-4 rounded-xl shadow-md flex items-center justify-between text-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)}><X className="w-4 h-4 text-red-400" /></button>
        </div>
      )}

      {/* RLS Security Guard Header */}
      <div className="bg-[#111114] text-[#e2e2e7] p-4 rounded-xl shadow-lg border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-lg flex items-center gap-2 text-blue-400">
            <UserCheck className="w-5 h-5 text-blue-400" />
            <span>{tenant ? tenant.name : 'انتخاب نشده'}</span>
          </h2>
          <p className="text-xs text-white/40 mt-1">
            شناسه سیستمی مستاجر: <code className="text-blue-300 font-mono select-all bg-black px-1.5 py-0.5 rounded border border-white/5">{tenantId}</code>
          </p>
        </div>
        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 p-2 rounded-lg text-xs text-blue-300">
          <ShieldAlert className="w-4 h-4 shrink-0 text-blue-400" />
          <span>امنیت RLS فعال: تمام کوئری‌ها محدود به مستأجر جاری است.</span>
        </div>
      </div>

      {/* Main Grid: Left Documents, Right Control Center */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Documents Management Panel (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[#111114] rounded-xl shadow-lg border border-white/10 p-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
              <h3 className="font-semibold text-white/90 flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                <span>دفتر اسناد دیجیتال و فیزیکی</span>
                <span className="text-xs bg-white/5 border border-white/10 text-white/60 px-2 py-0.5 rounded-full">{filteredDocs.length} سند</span>
              </h3>
              
              {/* Manual Add Button for Owner/Admin */}
              {activeUser && activeUser.role !== 'USER' && (
                <button 
                  onClick={() => setShowAddDoc(true)}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-medium transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  ثبت دستی سند جدید
                </button>
              )}
            </div>

            {/* Filter Section */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4 text-xs">
              <div className="relative">
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <input 
                  type="text" 
                  placeholder="جستجو در عنوان، شماره، توضیحات..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pr-8 pl-3 py-2 bg-black text-white/95 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <select 
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="w-full px-3 py-2 bg-black text-white/95 border border-white/10 rounded-lg focus:outline-none focus:border-blue-500"
                >
                  <option value="" className="bg-[#111114]">همه پروژه‌ها</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id} className="bg-[#111114]">{p.name} {p.status === 'ARCHIVED' ? '(آرشیو شده)' : ''}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-1 bg-black/50 border border-white/10 p-1 rounded-lg">
                <button 
                  onClick={() => setSelectedStatus('ACTIVE')}
                  className={`flex-1 text-center py-1 rounded font-medium transition-all ${selectedStatus === 'ACTIVE' ? 'bg-blue-600 text-white shadow-md' : 'text-white/40 hover:text-white/70'}`}
                >
                  فعال
                </button>
                <button 
                  onClick={() => setSelectedStatus('VOIDED')}
                  className={`flex-1 text-center py-1 rounded font-medium transition-all ${selectedStatus === 'VOIDED' ? 'bg-blue-600 text-white shadow-md' : 'text-white/40 hover:text-white/70'}`}
                >
                  باطل شده
                </button>
                <button 
                  onClick={() => setSelectedStatus('ALL')}
                  className={`flex-1 text-center py-1 rounded font-medium transition-all ${selectedStatus === 'ALL' ? 'bg-blue-600 text-white shadow-md' : 'text-white/40 hover:text-white/70'}`}
                >
                  همه
                </button>
              </div>
            </div>

            {/* Document Cards */}
            {filteredDocs.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-white/10 rounded-xl">
                <FileText className="w-10 h-10 text-white/20 mx-auto mb-2" />
                <p className="text-white/60 text-sm">هیچ سندی با فیلترهای کنونی یافت نشد.</p>
                <p className="text-white/40 text-xs mt-1">می‌توانید از ربات تلگرام یا فرم دکمه ثبت دستی اقدام کنید.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDocs.map(doc => {
                  const proj = projects.find(p => p.id === doc.project_id);
                  const custodian = users.find(u => u.id === doc.physical_custodian_id);
                  const isVoided = doc.status === 'VOIDED';

                  return (
                    <div 
                      key={doc.id}
                      className={`p-4 rounded-xl border transition-all ${isVoided ? 'bg-white/[0.02] border-white/5 opacity-50' : 'bg-[#0d0d10]/60 border-white/5 hover:border-white/15'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
                              {doc.internal_id}
                            </span>
                            {doc.doc_number && (
                              <span className="font-mono text-xs text-white/40">
                                شماره: {doc.doc_number}
                              </span>
                            )}
                            {isVoided && (
                              <span className="text-[10px] bg-red-500/10 border border-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-medium">
                                باطل شده
                              </span>
                            )}
                          </div>
                          
                          <h4 className="font-semibold text-white/90 mt-2 text-sm sm:text-base">
                            {doc.doc_type || 'سند متفرقه'}
                          </h4>
                          
                          <p className="text-xs text-white/50 mt-1 line-clamp-2">
                            {doc.description || 'بدون توضیحات ثبت شده.'}
                          </p>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-1.5 gap-x-4 mt-3 text-xs text-white/60">
                            <div>
                              <span className="text-white/40 font-medium">پروژه:</span>{' '}
                              <span className="text-white/85 font-semibold">{proj ? proj.name : 'متفرقه / عمومی'}</span>
                            </div>
                            <div>
                              <span className="text-white/40 font-medium">تاریخ سند:</span>{' '}
                              <span className="text-white/85 font-semibold">{doc.doc_date || 'فاقد تاریخ'}</span>
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                              <span className="text-white/40 font-medium">نگهدارنده فیزیکی:</span>{' '}
                              <span className="inline-flex items-center gap-1 font-semibold text-blue-400">
                                <UserCheck className="w-3.5 h-3.5 text-blue-400" />
                                {custodian ? custodian.name : 'نامشخص'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex flex-col gap-1.5 shrink-0">
                          {/* Transfer hand-off */}
                          {!isVoided && (
                            <button 
                              onClick={() => setTransferDoc(doc)}
                              className="p-1.5 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white rounded-lg text-xs font-medium flex items-center gap-1 border border-white/10 transition-colors"
                              title="انتقال حضانت فیزیکی سند"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">تحویل سند</span>
                            </button>
                          )}

                          {/* Generate presigned URL */}
                          <button 
                            onClick={() => handleGenerateUrl(doc.scan_file_path)}
                            className="p-1.5 bg-white/5 hover:bg-blue-500/10 text-white/80 hover:text-blue-400 rounded-lg text-xs font-medium flex items-center gap-1 border border-white/10 transition-colors"
                            title="تولید لینک امضا شده موقت S3"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">مشاهده فایل</span>
                          </button>

                          {/* Void button for owner/admin */}
                          {!isVoided && activeUser && activeUser.role !== 'USER' && (
                            <button 
                              onClick={() => handleVoidDocument(doc.id)}
                              className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium flex items-center gap-1 border border-red-500/20 transition-colors"
                              title="ابطال سند"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">ابطال</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Display computed presigned URL */}
                      {presignedUrl && presignedUrlKey === doc.scan_file_path.replace('s3://contractor-crm-storage/', '') && (
                        <div className="mt-3 bg-blue-500/10 border border-blue-500/20 p-3 rounded-lg text-xs text-white/90 flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-blue-400">لینک امن پیش‌امضا شده ۵ دقیقه‌ای S3 (Presigned URL)</span>
                            <button onClick={() => setPresignedUrl(null)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
                          </div>
                          <p className="text-[10px] text-blue-300 font-mono break-all bg-black p-2 rounded border border-white/10 select-all mt-1">
                            {presignedUrl}
                          </p>
                          <div className="flex items-center gap-1 text-[10px] text-white/40 mt-1">
                            <ShieldAlert className="w-3 h-3 text-blue-400" />
                            <span>این لینک موقت دارای امضای HMAC است و در صورت اتمام مدت انقضا فاقد اعتبار خواهد شد.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Admin Command Center Panel (1 col) */}
        <div className="space-y-6 col-span-1">
          
          {/* Active User Persona Selector */}
          <div className="bg-[#111114] rounded-xl shadow-lg border border-white/10 p-4">
            <h3 className="font-semibold text-white/90 text-sm mb-3 flex items-center gap-1.5 border-b border-white/10 pb-2">
              <UserCheck className="w-4.5 h-4.5 text-blue-400" />
              <span>نقش فعال شما در این مستأجر</span>
            </h3>
            
            <div className="space-y-2.5">
              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">{activeUser ? activeUser.name : 'نامشخص'}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    activeUser?.role === 'OWNER' ? 'bg-blue-600 text-white shadow' : 
                    activeUser?.role === 'ADMIN' ? 'bg-purple-600 text-white shadow' : 'bg-white/10 text-white/80'
                  }`}>
                    {activeUser?.role === 'OWNER' ? 'مالک سیستم (Owner)' : 
                     activeUser?.role === 'ADMIN' ? 'مدیر (Admin)' : 'کارشناس (User)'}
                  </span>
                </div>
                <p className="text-[10px] text-white/40 mt-1.5">
                  شماره همراه: <code className="font-mono text-white/60">{activeUser?.phone_number}</code>
                </p>
                <p className="text-[10px] text-white/40 mt-0.5">
                  وضعیت جفت‌سازی تلگرام:{' '}
                  {activeUser?.telegram_user_id ? (
                    <span className="text-green-400 font-semibold">مرتبط شده (ID: {activeUser.telegram_user_id})</span>
                  ) : (
                    <span className="text-amber-400 font-semibold">عدم جفت‌سازی</span>
                  )}
                </p>
              </div>

              {/* Quick Persona Swap (for simulation) */}
              <div className="text-[11px] text-white/40">
                <span>تغییر شبیه‌سازی نقش برای بررسی مجوزها:</span>
                <div className="grid grid-cols-3 gap-1 mt-1">
                  {users.map(u => (
                    <button
                      key={u.id}
                      onClick={() => onSetBotSimUser(u)}
                      className={`px-1.5 py-1 text-center rounded border truncate text-[10px] font-medium transition-all ${u.id === activeUser?.id ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white/5 hover:bg-white/10 text-white/70 border-white/10'}`}
                      title={`${u.name} - ${u.role}`}
                    >
                      {u.name.split(' ')[0]} ({u.role})
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Projects Management */}
          <div className="bg-[#111114] rounded-xl shadow-lg border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
              <h3 className="font-semibold text-white/90 text-sm flex items-center gap-1.5">
                <FolderPlus className="w-4.5 h-4.5 text-blue-400" />
                <span>پروژه‌های کارگاهی</span>
              </h3>
              {activeUser && activeUser.role !== 'USER' && (
                <button 
                  onClick={() => setShowAddProject(!showAddProject)}
                  className="text-[11px] text-blue-400 font-medium hover:underline flex items-center gap-0.5"
                >
                  <Plus className="w-3.5 h-3.5" /> افزودن
                </button>
              )}
            </div>

            {/* Quick Add Project inline form */}
            {showAddProject && (
              <form onSubmit={handleAddProject} className="mb-3 p-2.5 bg-black border border-white/10 rounded-lg space-y-2">
                <div className="text-[10px] font-bold text-white/60">عنوان پروژه جدید</div>
                <input 
                  type="text" 
                  required
                  placeholder="مثال: کارگاه پل اتوبان چمران"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 bg-[#111114] text-white border border-white/10 rounded focus:outline-none focus:border-blue-500"
                />
                <div className="flex justify-end gap-1.5">
                  <button type="button" onClick={() => setShowAddProject(false)} className="text-[10px] px-2 py-1 text-white/40 hover:bg-white/5 rounded">انصراف</button>
                  <button type="submit" className="text-[10px] px-2.5 py-1 bg-blue-600 text-white rounded font-medium">ثبت پروژه</button>
                </div>
              </form>
            )}

            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
              {projects.map(p => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded bg-white/[0.02] border border-white/5 text-xs">
                  <div className="truncate pr-1">
                    <span className="font-medium text-white/80">{p.name}</span>
                    {p.status === 'ARCHIVED' && (
                      <span className="text-[9px] bg-white/10 text-white/40 px-1 py-0.2 rounded mr-1">بایگانی شده</span>
                    )}
                  </div>
                  {activeUser && activeUser.role !== 'USER' ? (
                    <button 
                      onClick={() => handleToggleProject(p.id)}
                      className="text-[10px] text-blue-400 hover:text-blue-300 shrink-0 select-none font-medium"
                    >
                      {p.status === 'ACTIVE' ? 'بایگانی' : 'فعالسازی'}
                    </button>
                  ) : (
                    <span className="text-[10px] text-white/40 shrink-0">
                      {p.status === 'ACTIVE' ? 'فعال' : 'بایگانی'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Users Personnel Directory (Lockout Test) */}
          <div className="bg-[#111114] rounded-xl shadow-lg border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
              <h3 className="font-semibold text-white/90 text-sm flex items-center gap-1.5">
                <UserPlus className="w-4.5 h-4.5 text-blue-400" />
                <span>فهرست پرسنل و دسترسی</span>
              </h3>
              {activeUser && activeUser.role === 'OWNER' && (
                <button 
                  onClick={() => setShowAddUser(!showAddUser)}
                  className="text-[11px] text-blue-400 font-medium hover:underline flex items-center gap-0.5"
                >
                  <Plus className="w-3.5 h-3.5" /> افزودن
                </button>
              )}
            </div>

            {/* Quick Add User Form */}
            {showAddUser && (
              <form onSubmit={handleAddUser} className="mb-3 p-3 bg-black border border-white/10 rounded-lg space-y-2.5 text-xs">
                <div>
                  <label className="text-[10px] font-bold text-white/60 block mb-1">نام پرسنل</label>
                  <input 
                    type="text" required placeholder="مثال: کامران تفتی"
                    value={newUserName} onChange={(e) => setNewUserName(e.target.value)}
                    className="w-full px-2 py-1.5 bg-[#111114] text-white border border-white/10 rounded focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-white/60 block mb-1">شماره همراه (انطباق تلگرام)</label>
                  <input 
                    type="text" required placeholder="مثال: 09129990000"
                    value={newUserPhone} onChange={(e) => setNewUserPhone(e.target.value)}
                    className="w-full px-2 py-1.5 bg-[#111114] text-white border border-white/10 rounded focus:outline-none focus:border-blue-500 font-mono ltr text-right"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-white/60 block mb-1">نقش دسترسی</label>
                  <select 
                    value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="w-full px-2 py-1 bg-[#111114] text-white border border-white/10 rounded focus:outline-none"
                  >
                    <option value="USER" className="bg-[#111114]">کارشناس (USER)</option>
                    <option value="ADMIN" className="bg-[#111114]">مدیر پروژه (ADMIN)</option>
                    <option value="OWNER" className="bg-[#111114]">مالک شرکت (OWNER)</option>
                  </select>
                </div>
                <div className="flex justify-end gap-1.5 pt-1">
                  <button type="button" onClick={() => setShowAddUser(false)} className="text-[10px] px-2 py-1 text-white/40 hover:bg-white/5 rounded">انصراف</button>
                  <button type="submit" className="text-[10px] px-2.5 py-1 bg-blue-600 text-white rounded font-medium">ذخیره پرسنل</button>
                </div>
              </form>
            )}

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {users.map(u => (
                <div key={u.id} className="p-2 rounded bg-white/[0.02] border border-white/5 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-green-500' : 'bg-white/20'}`}></span>
                      <span className={`font-medium ${u.is_active ? 'text-white/80' : 'text-white/30 line-through'}`}>{u.name}</span>
                    </div>
                    <div className="text-[9px] text-white/40 font-mono mt-0.5">{u.phone_number} • {u.role}</div>
                  </div>
                  
                  {activeUser && activeUser.role === 'OWNER' && u.id !== activeUser.id ? (
                    <button 
                      onClick={() => handleToggleUser(u.id)}
                      className={`text-[9px] font-semibold px-2 py-0.5 rounded ${u.is_active ? 'text-red-400 hover:bg-red-500/10' : 'text-blue-400 hover:bg-blue-500/10'}`}
                    >
                      {u.is_active ? 'غیرفعال‌سازی' : 'فعال‌سازی'}
                    </button>
                  ) : (
                    <span className="text-[10px] text-white/40 font-medium">
                      {u.is_active ? 'فعال' : 'غیرفعال'}
                    </span>
                  )}
                </div>
              ))}
            </div>
            
            <div className="mt-2.5 p-2 bg-blue-500/5 border border-blue-500/10 rounded-lg text-[10px] text-white/40 flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500 mt-0.5" />
              <span>غیرفعال‌سازی پرسنل به صورت آنی کلید تلگرام و توکن JWT را باطل کرده و ربات وی را مسدود می‌کند.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Document Registration Modal */}
      {showAddDoc && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#111114] rounded-xl shadow-xl border border-white/10 max-w-lg w-full overflow-hidden">
            <div className="bg-[#0d0d10] text-[#e2e2e7] p-4 flex items-center justify-between border-b border-white/10">
              <h4 className="font-semibold text-sm flex items-center gap-1.5">
                <FileText className="w-5 h-5 text-blue-400" />
                <span>ثبت دستی سند جدید (خارج از بستر ربات)</span>
              </h4>
              <button onClick={() => setShowAddDoc(false)} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleManualAddDoc} className="p-5 space-y-4 text-xs text-[#e2e2e7]">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block font-bold text-white/60 mb-1">عنوان / نوع سند *</label>
                  <input 
                    type="text" required placeholder="مثال: صورت وضعیت، نقشه شاپ، گزارش بتن‌ریزی..."
                    value={newDocName} onChange={(e) => setNewDocName(e.target.value)}
                    className="w-full px-3 py-2 bg-black text-white border border-white/10 rounded-lg focus:outline-none focus:border-blue-500 text-xs"
                  />
                </div>
                
                <div>
                  <label className="block font-bold text-white/60 mb-1">پروژه مرتبط</label>
                  <select 
                    value={newDocProj} onChange={(e) => setNewDocProj(e.target.value)}
                    className="w-full px-3 py-2 bg-black text-white border border-white/10 rounded-lg focus:outline-none text-xs"
                  >
                    <option value="" className="bg-[#111114]">متفرقه / عمومی</option>
                    {projects.filter(p => p.status === 'ACTIVE').map(p => (
                      <option key={p.id} value={p.id} className="bg-[#111114]">{p.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block font-bold text-white/60 mb-1">شماره سند فیزیکی</label>
                  <input 
                    type="text" placeholder="مثال: PH-105-X"
                    value={newDocNumber} onChange={(e) => setNewDocNumber(e.target.value)}
                    className="w-full px-3 py-2 bg-black text-white border border-white/10 rounded-lg focus:outline-none text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-white/60 mb-1">تاریخ سند (شمسی) *</label>
                  <input 
                    type="text" required placeholder="مثال: 1405/05/01"
                    value={newDocDate} onChange={(e) => setNewDocDate(e.target.value)}
                    className="w-full px-3 py-2 bg-black text-white border border-white/10 rounded-lg focus:outline-none text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-white/60 mb-1">دارنده فیزیکی فعلی *</label>
                  <select 
                    required value={newDocCustodian} onChange={(e) => setNewDocCustodian(e.target.value)}
                    className="w-full px-3 py-2 bg-black text-white border border-white/10 rounded-lg focus:outline-none text-xs"
                  >
                    <option value="" className="bg-[#111114]">انتخاب پرسنل دارنده اصل سند</option>
                    {users.filter(u => u.is_active).map(u => (
                      <option key={u.id} value={u.id} className="bg-[#111114]">{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block font-bold text-white/60 mb-1">توضیحات تکمیلی</label>
                  <textarea 
                    rows={3} placeholder="جزئیات بیشتر پیرامون سند، اصلاحات یا الحاقات..."
                    value={newDocDesc} onChange={(e) => setNewDocDesc(e.target.value)}
                    className="w-full px-3 py-2 bg-black text-white border border-white/10 rounded-lg focus:outline-none text-xs"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-end gap-2">
                <button type="button" onClick={() => setShowAddDoc(false)} className="px-4 py-2 bg-white/5 text-white/70 rounded-lg hover:bg-white/10">انصراف</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 font-medium shadow-md">ثبت نهایی و ثبت زنجیره‌بندی</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custody Transfer Handshake Modal */}
      {transferDoc && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#111114] rounded-xl shadow-lg border border-white/10 max-w-md w-full overflow-hidden">
            <div className="bg-[#0d0d10] text-white p-4 flex items-center justify-between border-b border-white/10">
              <h4 className="font-semibold text-sm flex items-center gap-1.5">
                <Send className="w-5 h-5 text-blue-400" />
                <span>انتقال مالکیت نسخه فیزیکی سند</span>
              </h4>
              <button onClick={() => setTransferDoc(null)} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleStartTransfer} className="p-5 space-y-4 text-xs text-[#e2e2e7]">
              <div className="bg-black/40 p-3 rounded-lg border border-white/10">
                <span className="text-[10px] text-blue-400 font-mono font-bold block">{transferDoc.internal_id}</span>
                <span className="font-bold text-white/90 text-sm mt-1 block">{transferDoc.doc_type}</span>
                <span className="text-white/40 mt-1 block text-[11px]">فرستنده: {users.find(u => u.id === transferDoc.physical_custodian_id)?.name} (شما)</span>
              </div>

              <div>
                <label className="block font-bold text-white/60 mb-1.5">انتخاب کارشناس دریافت‌کننده فیزیکی اصل سند *</label>
                <select 
                  required
                  value={transferReceiver}
                  onChange={(e) => setTransferReceiver(e.target.value)}
                  className="w-full px-3 py-2 bg-black text-white border border-white/10 rounded-lg focus:outline-none text-xs"
                >
                  <option value="" className="bg-[#111114]">انتخاب پرسنل گیرنده اصل سند کاغذی</option>
                  {users.filter(u => u.is_active && u.id !== transferDoc.physical_custodian_id).map(u => (
                    <option key={u.id} value={u.id} className="bg-[#111114]">{u.name} ({u.role}) • {u.phone_number}</option>
                  ))}
                </select>
              </div>

              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[10px] text-amber-400 flex items-start gap-1">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                <span>بر اساس الگوی تایید دو مرحله‌ای حضانت (ADR-005)، مالکیت فیزیکی تا زمانی که گیرنده در ربات تلگرام تایید نکند معلق می‌ماند. شما تا قبل از تایید می‌توانید آن را لغو کنید.</span>
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-end gap-2">
                <button type="button" onClick={() => setTransferDoc(null)} className="px-4 py-2 bg-white/5 text-white/70 rounded-lg hover:bg-white/10">انصراف</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 font-medium">ارسال فیزیکی و ایجاد تراکنش</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
