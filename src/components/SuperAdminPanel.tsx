import React, { useState } from 'react';
import { DbStore } from '../dbStore';
import { Tenant, User } from '../types';
import { 
  Building2, Users, Shield, ShieldCheck, Key, CreditCard, AlertTriangle, 
  RotateCcw, Trash2, Plus, Edit3, Check, Play, Square, Activity, Save
} from 'lucide-react';

interface SuperAdminPanelProps {
  tenantId: string;
  activeUser: User | null;
  refreshDb: () => void;
}

export default function SuperAdminPanel({ tenantId, activeUser, refreshDb }: SuperAdminPanelProps) {
  const dbData = DbStore.load();
  const tenants = dbData.tenants.filter(t => !t.is_deleted && t.id !== 'tenant-0000-0000-0000-000000000000');
  
  // Local states
  const [activeTab, setActiveTab] = useState<'companies' | 'metrics'>('companies');
  
  // Creation Form State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newOwnerPhone, setNewOwnerPhone] = useState('');
  const [newOwnerTelegram, setNewOwnerTelegram] = useState('');

  // Editing State
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Licensing state
  const [licensingTenantId, setLicensingTenantId] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [durationDays, setDurationDays] = useState(365);

  const handleCreateCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName || !newOwnerName || !newOwnerPhone) return;

    // Create Tenant in dbStore
    const newTenantId = `tenant-${Math.random().toString().slice(2, 6)}-${Math.random().toString().slice(2, 6)}-${Math.random().toString().slice(2, 6)}-${Date.now().toString().slice(-12)}`;
    const newTenant: Tenant = {
      id: newTenantId,
      name: newCompanyName,
      is_active: true,
      is_suspended: false,
      is_deleted: false,
      license_active: true,
      license_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      license_key: `LIC-${Math.random().toString(36).substring(2, 14).toUpperCase()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const newOwnerId = `user-${Math.random().toString().slice(2, 6)}-${Math.random().toString().slice(2, 6)}-${Math.random().toString().slice(2, 6)}-${Date.now().toString().slice(-12)}`;
    const newOwner: User = {
      id: newOwnerId,
      tenant_id: newTenantId,
      name: newOwnerName,
      phone_number: newOwnerPhone,
      telegram_user_id: newOwnerTelegram ? parseInt(newOwnerTelegram, 10) : null,
      role: 'OWNER',
      is_active: true
    };

    // Save to store
    dbData.tenants.push(newTenant);
    dbData.users.push(newOwner);
    DbStore.save();

    // Reset Form
    setNewCompanyName('');
    setNewOwnerName('');
    setNewOwnerPhone('');
    setNewOwnerTelegram('');
    setShowCreateForm(false);
    refreshDb();
  };

  const handleSuspendCompany = (id: string) => {
    const data = DbStore.load();
    const tenant = data.tenants.find(t => t.id === id);
    if (tenant) {
      tenant.is_suspended = !tenant.is_suspended;
      tenant.is_active = !tenant.is_suspended;
      
      // Suspend all users in that tenant
      data.users.forEach(u => {
        if (u.tenant_id === id) {
          u.is_active = tenant.is_active;
        }
      });
      DbStore.save();
      refreshDb();
    }
  };

  const handleDeleteCompany = (id: string) => {
    if (!window.confirm("آیا از حذف نرم‌افزاری این شرکت اطمینان دارید؟")) return;
    const data = DbStore.load();
    const tenant = data.tenants.find(t => t.id === id);
    if (tenant) {
      tenant.is_deleted = true;
      tenant.is_active = false;
      
      // Deactivate all users in that tenant
      data.users.forEach(u => {
        if (u.tenant_id === id) {
          u.is_active = false;
        }
      });
      DbStore.save();
      refreshDb();
    }
  };

  const handleEditCompany = (id: string) => {
    const data = DbStore.load();
    const tenant = data.tenants.find(t => t.id === id);
    if (tenant && editingName) {
      tenant.name = editingName;
      DbStore.save();
      setEditingTenantId(null);
      setEditingName('');
      refreshDb();
    }
  };

  const handleIssueLicense = (id: string) => {
    const data = DbStore.load();
    const tenant = data.tenants.find(t => t.id === id);
    if (tenant) {
      tenant.license_active = true;
      tenant.license_key = licenseKey || `LIC-${Math.random().toString(36).substring(2, 14).toUpperCase()}`;
      tenant.license_expires_at = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();
      DbStore.save();
      setLicensingTenantId(null);
      setLicenseKey('');
      refreshDb();
    }
  };

  const handleResetOwnerCredentials = (id: string) => {
    const data = DbStore.load();
    const owner = data.users.find(u => u.tenant_id === id && u.role === 'OWNER');
    if (owner) {
      const phone = prompt("شماره تلفن جدید مالک را وارد کنید:", owner.phone_number);
      if (phone) {
        owner.phone_number = phone;
        DbStore.save();
        alert(`شماره تلفن مالک به ${phone} تغییر یافت و دسترسی او مجدداً تنظیم شد.`);
        refreshDb();
      }
    } else {
      alert("مالکی برای این شرکت یافت نشد.");
    }
  };

  return (
    <div className="bg-[#111114] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-500" />
            <span>پنل مدیریت ارشد سیستم (Super Admin Panel)</span>
          </h2>
          <p className="text-xs text-white/40 mt-1">مدیریت کلان مستأجرین، لایسنس‌ها، نظارت بر تراکنش‌ها و سلامت زیرساخت (فقط مجاز برای ارائه‌دهنده SaaS)</p>
        </div>

        <div className="flex bg-[#0d0d10] p-1 rounded-lg border border-white/10 shrink-0">
          <button
            onClick={() => setActiveTab('companies')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              activeTab === 'companies' ? 'bg-red-600 text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            🏢 مدیریت شرکت‌ها
          </button>
          <button
            onClick={() => setActiveTab('metrics')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              activeTab === 'metrics' ? 'bg-red-600 text-white' : 'text-white/60 hover:text-white'
            }`}
          >
            📊 پایش وضعیت لایو (Metrics)
          </button>
        </div>
      </div>

      {activeTab === 'companies' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-bold text-white/80">فهرست شرکت‌های عضو سامانه</h3>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>ایجاد شرکت جدید</span>
            </button>
          </div>

          {showCreateForm && (
            <form onSubmit={handleCreateCompany} className="bg-[#0d0d10] p-4 rounded-xl border border-white/5 space-y-4 animate-fadeIn">
              <h4 className="text-xs font-bold text-white">افزودن شرکت و مالک اولیه</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] text-white/60 mb-1">نام شرکت</label>
                  <input
                    type="text"
                    required
                    value={newCompanyName}
                    onChange={e => setNewCompanyName(e.target.value)}
                    placeholder="مثال: کارگاه صدف جنوب"
                    className="w-full bg-[#111114] border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-white/60 mb-1">نام مالک</label>
                  <input
                    type="text"
                    required
                    value={newOwnerName}
                    onChange={e => setNewOwnerName(e.target.value)}
                    placeholder="مثال: مهندس کریمی"
                    className="w-full bg-[#111114] border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-white/60 mb-1">شماره تلفن مالک</label>
                  <input
                    type="text"
                    required
                    value={newOwnerPhone}
                    onChange={e => setNewOwnerPhone(e.target.value)}
                    placeholder="مثال: 09121234567"
                    className="w-full bg-[#111114] border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-red-500 text-left"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-white/60 mb-1">شناسه تلگرام مالک (اختیاری)</label>
                  <input
                    type="text"
                    value={newOwnerTelegram}
                    onChange={e => setNewOwnerTelegram(e.target.value)}
                    placeholder="مثال: 123456"
                    className="w-full bg-[#111114] border border-white/10 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-red-500 text-left"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="bg-white/5 hover:bg-white/10 text-white/80 px-4 py-2 rounded-lg text-xs font-bold transition-all"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-all"
                >
                  ثبت و راه‌اندازی شرکت
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto rounded-xl border border-white/5 bg-[#0d0d10]">
            <table className="w-full border-collapse text-right">
              <thead>
                <tr className="bg-[#111114] border-b border-white/5 text-[11px] font-bold text-white/40">
                  <th className="p-3">نام شرکت</th>
                  <th className="p-3">شناسه کارگاه (Tenant ID)</th>
                  <th className="p-3">کد لایسنس</th>
                  <th className="p-3">مالک</th>
                  <th className="p-3">وضعیت حساب</th>
                  <th className="p-3 text-left">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs text-white/80">
                {tenants.map(t => {
                  const owner = dbData.users.find(u => u.tenant_id === t.id && u.role === 'OWNER');
                  return (
                    <tr key={t.id} className="hover:bg-white/[0.02] transition-all">
                      <td className="p-3 font-bold">
                        {editingTenantId === t.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editingName}
                              onChange={e => setEditingName(e.target.value)}
                              className="bg-[#111114] border border-white/20 rounded p-1 text-xs text-white focus:outline-none"
                            />
                            <button
                              onClick={() => handleEditCompany(t.id)}
                              className="bg-green-600 p-1 rounded text-white hover:bg-green-500"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span>{t.name}</span>
                            <button
                              onClick={() => { setEditingTenantId(t.id); setEditingName(t.name); }}
                              className="text-white/40 hover:text-white"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="p-3 font-mono text-[10px] text-white/40">{t.id}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <span className="font-mono bg-white/5 px-1.5 py-0.5 rounded text-[10px] text-white/60">
                            {t.license_key || 'بدون لایسنس'}
                          </span>
                          <button
                            onClick={() => {
                              setLicensingTenantId(t.id);
                              setLicenseKey(t.license_key || '');
                            }}
                            className="text-red-400 hover:text-red-300 text-[10px] font-bold underline ml-1"
                          >
                            تغییر
                          </button>
                        </div>
                        {licensingTenantId === t.id && (
                          <div className="mt-2 bg-[#111114] p-3 rounded-lg border border-white/10 space-y-2 max-w-[200px]">
                            <input
                              type="text"
                              placeholder="کد لایسنس جدید"
                              value={licenseKey}
                              onChange={e => setLicenseKey(e.target.value)}
                              className="w-full bg-[#0d0d10] border border-white/10 p-1 text-[10px] text-white rounded"
                            />
                            <select
                              value={durationDays}
                              onChange={e => setDurationDays(parseInt(e.target.value, 10))}
                              className="w-full bg-[#0d0d10] border border-white/10 p-1 text-[10px] text-white rounded"
                            >
                              <option value="30">۳۰ روزه</option>
                              <option value="90">۹۰ روزه</option>
                              <option value="365">۱ ساله</option>
                            </select>
                            <button
                              onClick={() => handleIssueLicense(t.id)}
                              className="w-full bg-red-600 text-white text-[10px] p-1 rounded font-bold"
                            >
                              ثبت لایسنس
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        {owner ? (
                          <div>
                            <div className="font-bold">{owner.name}</div>
                            <div className="text-[10px] text-white/40 font-mono">{owner.phone_number}</div>
                          </div>
                        ) : (
                          <span className="text-white/30">بدون مالک ثبت شده</span>
                        )}
                      </td>
                      <td className="p-3">
                        {t.is_suspended ? (
                          <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            تعلیق شده
                          </span>
                        ) : (
                          <span className="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full text-[10px] font-bold">
                            فعال
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-left">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleResetOwnerCredentials(t.id)}
                            className="p-1.5 rounded bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all"
                            title="تنظیم مجدد مالک"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleSuspendCompany(t.id)}
                            className={`p-1.5 rounded transition-all ${
                              t.is_suspended 
                                ? 'bg-green-600/10 text-green-400 hover:bg-green-600/20' 
                                : 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                            }`}
                            title={t.is_suspended ? 'رفع تعلیق' : 'تعلیق موقت'}
                          >
                            {t.is_suspended ? <Play className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => handleDeleteCompany(t.id)}
                            className="p-1.5 rounded bg-red-600/10 text-red-400 hover:bg-red-600/20 transition-all"
                            title="حذف نرم‌افزاری"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'metrics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#0d0d10] p-4 rounded-xl border border-white/5">
              <div className="text-white/40 text-[10px] font-bold">تعداد کل شرکت‌ها</div>
              <div className="text-2xl font-black text-white mt-1">{tenants.length}</div>
              <div className="text-[10px] text-green-400 mt-1 flex items-center gap-1">
                <span>● {tenants.filter(t => t.is_active).length} شرکت لایو فعال</span>
              </div>
            </div>

            <div className="bg-[#0d0d10] p-4 rounded-xl border border-white/5">
              <div className="text-white/40 text-[10px] font-bold">نشست‌های فعال کل (Sessions)</div>
              <div className="text-2xl font-black text-blue-400 mt-1">4</div>
              <div className="text-[10px] text-white/40 mt-1">از پورتال وب و تلگرام</div>
            </div>

            <div className="bg-[#0d0d10] p-4 rounded-xl border border-white/5">
              <div className="text-white/40 text-[10px] font-bold">کل فضای استفاده شده</div>
              <div className="text-2xl font-black text-green-400 mt-1">135.8 MB</div>
              <div className="text-[10px] text-white/40 mt-1">فضای دانلود هاست ایرانی</div>
            </div>

            <div className="bg-[#0d0d10] p-4 rounded-xl border border-white/5">
              <div className="text-white/40 text-[10px] font-bold">وضعیت همگام‌سازی ربات</div>
              <div className="text-2xl font-black text-yellow-400 mt-1">عملیاتی</div>
              <div className="text-[10px] text-green-400 mt-1">آخرین همگام‌سازی: ۵ دقیقه قبل</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#0d0d10] p-5 rounded-xl border border-white/5 space-y-4">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-red-500" />
                <span>مانیتورینگ زیرساخت کلان</span>
              </h4>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-white/40">نسخه نصب شده سرور:</span>
                  <span className="font-mono text-white/80">v1.4.2</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-white/40">پایگاه داده PostgreSQL RLS:</span>
                  <span className="text-green-400 font-bold">سالم و متصل (۱۰ اتصال فعال)</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-white/40">سرویس آنتی‌ویروس ClamAV:</span>
                  <span className="text-green-400 font-bold">آماده به کار و آنلاین</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-white/40">آخرین پایش خودکار ویروس:</span>
                  <span className="text-white/60">۱ ساعت پیش (۰ بدافزار پیدا شد)</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-white/40">کانال پشتیبان‌گیری تلگرام:</span>
                  <span className="text-green-400 font-bold">متصل و سینک شده</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">آخرین زمان بکاپ ابری:</span>
                  <span className="text-white/60">امروز صبح ساعت 04:00</span>
                </div>
              </div>
            </div>

            <div className="bg-[#0d0d10] p-5 rounded-xl border border-white/5 space-y-4">
              <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-red-500" />
                <span>هشدارهای امنیتی و رخدادها</span>
              </h4>
              <div className="space-y-3">
                <div className="flex gap-2 p-2 bg-green-500/5 rounded border border-green-500/10 text-[11px]">
                  <Check className="w-4 h-4 text-green-400 shrink-0" />
                  <div className="text-green-400/90 leading-normal">
                    تمام فایل‌های آپلود شده در ۲۴ ساعت گذشته با موفقیت آنتی‌ویروس اسکن و وارد انبار اصلی شدند.
                  </div>
                </div>
                <div className="flex gap-2 p-2 bg-yellow-500/5 rounded border border-yellow-500/10 text-[11px]">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                  <div className="text-yellow-400/90 leading-normal">
                    تلاش ناموفق برای ورود به حساب کارگاهی از آدرس IP نامعتبر (دفع شد • زنجیره ممیزی امن است).
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
