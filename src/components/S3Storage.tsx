/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { DbStore } from '../dbStore';
import { 
  Database, HardDrive, ShieldCheck, HelpCircle, 
  Trash2, ExternalLink, Calendar, Key, RefreshCw, X 
} from 'lucide-react';

interface S3StorageProps {
  tenantId: string;
  refreshDb: () => void;
}

export default function S3Storage({ tenantId, refreshDb }: S3StorageProps) {
  const dbData = DbStore.load();
  const tenants = dbData.tenants;

  const [activeBucket, setActiveBucket] = useState<'STORAGE' | 'QUARANTINE'>('STORAGE');
  const [selectedFileKey, setSelectedFileKey] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  // Filter storage for current tenant to demonstrate RLS and isolation
  const currentTenantStorage = dbData.s3Storage.filter(f => f.tenant_id === tenantId);
  
  // All quarantine files (typically empty except during scans)
  const quarantineFiles = dbData.s3Quarantine;

  const handleGeneratePresigned = (key: string) => {
    const url = DbStore.generatePresignedUrl(key);
    setGeneratedUrl(url);
    setSelectedFileKey(key);
  };

  const handleClearQuarantine = () => {
    const data = DbStore.load();
    data.s3Quarantine = [];
    DbStore.save();
    refreshDb();
  };

  return (
    <div className="rtl space-y-6 text-slate-800">
      
      {/* Bucket Architecture Header */}
      <div className="bg-slate-900 text-slate-100 p-5 rounded-xl border border-slate-800">
        <h3 className="font-semibold text-base flex items-center gap-2 text-indigo-400">
          <HardDrive className="w-5 h-5" />
          <span>پیکربندی فضاهای ذخیره‌سازی ابری S3-Compatible</span>
        </h3>
        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
          سامانه از ترکیب دو باکت مستقل استفاده می‌کند: یک باکت قرنطینه موقت جهت واکاوی امنیتی کدهای مخرب پیوست توسط <span className="text-slate-300 font-bold">ClamAV</span>، و یک باکت دائم ایزوله شده با پیشوند شناسه UUID مستأجران جهت ذخیره دائمی نسخ اسکن اسناد.
        </p>
      </div>

      {/* Buckets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Side: Buckets and policies navigator */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 space-y-2">
            <span className="text-xs font-bold text-slate-500 block mb-2">لیست باکت‌ها</span>
            
            <button
              onClick={() => setActiveBucket('STORAGE')}
              className={`w-full text-right p-3 rounded-lg border text-xs font-semibold flex items-center justify-between transition-all ${activeBucket === 'STORAGE' ? 'bg-indigo-50 border-indigo-200 text-indigo-900' : 'bg-slate-50 border-slate-150 text-slate-700 hover:bg-slate-100'}`}
            >
              <span>contractor-crm-storage</span>
              <span className="text-[10px] bg-indigo-200 text-indigo-800 px-2 py-0.5 rounded-full">{currentTenantStorage.length} فایل</span>
            </button>

            <button
              onClick={() => setActiveBucket('QUARANTINE')}
              className={`w-full text-right p-3 rounded-lg border text-xs font-semibold flex items-center justify-between transition-all ${activeBucket === 'QUARANTINE' ? 'bg-indigo-50 border-indigo-200 text-indigo-900' : 'bg-slate-50 border-slate-150 text-slate-700 hover:bg-slate-100'}`}
            >
              <span>contractor-crm-quarantine</span>
              <span className="text-[10px] bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">{quarantineFiles.length} فایل</span>
            </button>
          </div>

          {/* S3 Lifecycle Rules */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 text-xs space-y-2.5">
            <span className="font-bold text-slate-800 flex items-center gap-1">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>چرخه عمر فایل‌های ابری (Lifecycle)</span>
            </span>
            <p className="text-[10px] text-slate-500 leading-normal">
              بر اساس ضابطه <span className="font-medium text-slate-700">PD-005</span>، اسناد باطل شده شامل سیاست فشرده‌سازی سرد می‌گردند:
            </p>
            <div className="p-2 bg-slate-50 rounded border border-slate-200 space-y-1.5 text-[10px]">
              <div className="flex justify-between text-slate-600">
                <span>تگ ابطال:</span>
                <span className="font-semibold font-mono">"status": "voided"</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>کلاس انتقال:</span>
                <span className="font-semibold text-indigo-700">GLACIER (روز ۰)</span>
              </div>
              <div className="flex justify-between text-slate-650">
                <span>حذف فیزیکی دائم:</span>
                <span className="font-semibold text-rose-700">پس از ۳۰ روز</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: File list and presigned URL panel */}
        <div className="lg:col-span-3 space-y-4">
          
          <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-5">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
              <h4 className="font-semibold text-slate-900 text-sm">
                محتویات باکت:{' '}
                <code className="text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded font-mono">
                  {activeBucket === 'STORAGE' ? 'contractor-crm-storage' : 'contractor-crm-quarantine'}
                </code>
              </h4>
              
              {activeBucket === 'QUARANTINE' && quarantineFiles.length > 0 && (
                <button
                  onClick={handleClearQuarantine}
                  className="text-xs text-rose-600 hover:underline flex items-center gap-1 font-semibold"
                >
                  <Trash2 className="w-4 h-4" />
                  پاکسازی کل پوشه قرنطینه
                </button>
              )}
            </div>

            {/* STORAGE BUCKET CONTENTS */}
            {activeBucket === 'STORAGE' && (
              <div>
                <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                  🔐 <span className="font-bold">تفکیک پوشه چندمستأجری (Tenant-Isolation):</span> طبق ADR-017، فایلهای زیر بر اساس پیشوند UUID تنانت جاری نمایش داده می‌شوند. فایلهای سایر مستأجران در سطح S3 مجزا هستند.
                </p>

                {currentTenantStorage.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Database className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <span>هیچ فایلی برای مستأجر جاری ذخیره نشده است.</span>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {currentTenantStorage.map(file => (
                      <div 
                        key={file.key}
                        className="p-3 bg-slate-50 hover:bg-indigo-55/30 border border-slate-150 hover:border-indigo-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-500 font-mono">MIME: application/pdf</span>
                            <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                              file.tag === 'voided' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {file.tag === 'voided' ? 'بایگانی سرد (GLACIER)' : 'سالم و فعال (STANDARD)'}
                            </span>
                          </div>
                          <span className="font-mono text-xs text-slate-800 block mt-1 break-all select-all font-semibold" dir="ltr">
                            s3://contractor-crm-storage/{file.key}
                          </span>
                          <span className="text-[10px] text-slate-400 block mt-1">
                            حجم فایل: {file.size} • آپلود: {new Date(file.uploaded_at).toLocaleString('fa-IR')}
                          </span>
                        </div>

                        <button
                          onClick={() => handleGeneratePresigned(file.key)}
                          className="shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1.5 rounded-md font-medium transition-colors flex items-center justify-center gap-1"
                        >
                          <Key className="w-3.5 h-3.5" />
                          لینک امضا شده
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* QUARANTINE BUCKET CONTENTS */}
            {activeBucket === 'QUARANTINE' && (
              <div>
                <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                  🛡️ این پوشه محل نگهداری فرضی و موقت فایلها قبل از اسکن ClamAV است. فایلهای آلوده فوراً پاکسازی شده و فایلهای سالم پس از تایید به باکت دائم منتقل می‌شوند.
                </p>

                {quarantineFiles.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
                    <p className="text-sm font-semibold text-slate-600">پوشه قرنطینه پاک و عاری از تهدید است.</p>
                    <p className="text-xs text-slate-400 mt-1">هنگام ثبت سند در ربات تلگرام، فرآیند اسکن بلادرنگ را تجربه کنید.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {quarantineFiles.map(file => (
                      <div 
                        key={file.key}
                        className={`p-3 border rounded-lg flex items-center justify-between gap-2 ${
                          file.status === 'infected' ? 'bg-rose-50 border-rose-200' : 
                          file.status === 'clean' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
                        }`}
                      >
                        <div>
                          <span className="font-mono text-xs font-semibold text-slate-850 block" dir="ltr">
                            {file.key}
                          </span>
                          <span className="text-[10px] text-slate-500 block mt-1">
                            حجم فایل: {file.size} • وضعیت اسکن: {' '}
                            <span className={`font-bold ${
                              file.status === 'infected' ? 'text-rose-700' : 
                              file.status === 'clean' ? 'text-emerald-700' : 'text-amber-700'
                            }`}>
                              {file.status === 'infected' ? 'کشف بدافزار (Infected)' : 
                               file.status === 'clean' ? 'سالم (Clean)' : 'در حال اسکن...'}
                            </span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Presigned URL Display details */}
          {generatedUrl && selectedFileKey && (
            <div className="bg-white rounded-xl shadow-sm border border-indigo-150 p-5 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="font-bold text-sm text-indigo-900 flex items-center gap-1.5">
                  <Key className="w-4.5 h-4.5 text-indigo-600" />
                  <span>جزئیات امضای دیجیتال هدر S3 (HMAC Verification)</span>
                </span>
                <button onClick={() => setGeneratedUrl(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4.5 h-4.5" /></button>
              </div>

              <div className="text-xs text-slate-600 space-y-2">
                <p>
                  به جهت ممانعت از دانلودهای غیرمجاز بیرونی، آدرس فایل‌ها عمومی نیست. سیستم بک‌اند یک لینک موقت با زمان انقضا تولید کرده و پارامترها را با کلید مخفی <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-rose-600 font-bold">HMAC_SECRET_KEY</code> امضا می‌کند:
                </p>

                <div className="p-3 bg-slate-900 text-slate-200 rounded-lg font-mono text-[10px] select-all break-all border border-slate-800" dir="ltr">
                  {generatedUrl}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-[11px]">
                  <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                    <span className="font-semibold block text-slate-800">پارامتر انقضا (Expires)</span>
                    <span className="text-slate-500">لینک صادر شده پس از ۵ دقیقه (۳۰۰ ثانیه) به کل باطل می‌شود.</span>
                  </div>
                  <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                    <span className="font-semibold block text-slate-800">امضا دیجیتال (Signature)</span>
                    <span className="text-slate-500">با تغییر حتی یک کاراکتر در آدرس، سرویس S3 دسترسی را مسدود می‌سازد.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
