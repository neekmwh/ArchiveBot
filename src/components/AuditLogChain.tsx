/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { DbStore } from '../dbStore';
import { sha256 } from '../utils/crypto';
import { 
  ShieldCheck, ShieldAlert, AlertTriangle, Play, 
  HelpCircle, RefreshCw, Eye, Sparkles, Server, CheckCircle 
} from 'lucide-react';

interface AuditLogChainProps {
  tenantId: string;
  refreshDb: () => void;
}

export default function AuditLogChain({ tenantId, refreshDb }: AuditLogChainProps) {
  const dbData = DbStore.load();
  
  // Filter logs for active tenant for standard display (or show all since it's an admin view)
  const auditLogs = dbData.auditLogs;

  // Verification States
  const [verificationResult, setVerificationResult] = useState<{
    isValid: boolean;
    errorAtLogId: string | null;
    logsVerifiedCount: number;
  } | null>(null);

  const [isVerifying, setIsVerifying] = useState(false);
  const [tamperTriggered, setTamperTriggered] = useState(false);
  const [tamperLogId, setTamperLogId] = useState<string | null>(null);

  const handleVerifyIntegrity = () => {
    setIsVerifying(true);
    setVerificationResult(null);

    setTimeout(() => {
      const result = DbStore.verifyAuditLogIntegrity();
      setVerificationResult(result);
      setIsVerifying(false);
    }, 1200);
  };

  const handleSimulateTamper = () => {
    const data = DbStore.load();
    if (data.auditLogs.length < 2) {
      alert('حداقل دو لاگ باید ثبت شده باشد تا امکان شبیه‌سازی رخنه وجود داشته باشد.');
      return;
    }

    // Covertly alter the metadata/details of an existing record (e.g. index 1)
    const targetLogIndex = 1; 
    const logToTamper = data.auditLogs[targetLogIndex];
    
    // Maliciously change details inside the database bypass
    logToTamper.details = { 
      ...logToTamper.details, 
      hacked_value: 'Malicious modification of transaction logs!',
      role: 'OWNER_COVERT' // Altered role parameter secretly!
    };
    
    DbStore.save();
    setTamperLogId(logToTamper.id);
    setTamperTriggered(true);
    setVerificationResult(null);
    refreshDb();

    alert(`⚠️ دستکاری پنهان انجام شد!\nعنوان رویداد در لاگ شماره ۲ عمداً تغییر داده شد، اما هکرهای پایگاه داده قادر به هک زنجیره هش‌های SHA-256 قبل و بعد آن نبوده‌اند.\n\nاکنون دکمه «بررسی صحت زنجیره ممیزی» را بفشارید تا قدرت پایش رمزنگاری‌شده را مشاهده نمایید.`);
  };

  const handleFixTamper = () => {
    // Reset back to initial database state to fix
    DbStore.reset();
    setTamperTriggered(false);
    setTamperLogId(null);
    setVerificationResult(null);
    refreshDb();
  };

  return (
    <div className="rtl space-y-6 text-[#e2e2e7]">
      
      {/* Introduction Header */}
      <div className="bg-[#111114] text-[#e2e2e7] p-5 rounded-xl border border-white/10 shadow-xl">
        <h3 className="font-semibold text-base flex items-center gap-2 text-blue-400">
          <ShieldCheck className="w-5 h-5 text-blue-400" />
          <span>زنجیره ممیزی امنیتی غیرقابل دستکاری (Cryptographically Chained Audit Log)</span>
        </h3>
        <p className="text-xs text-white/40 mt-2 leading-relaxed">
          بر اساس بند <span className="text-white/70 font-bold">PD-008</span>، برای اطمینان از صحت زنجیره حضانت اسناد و عدم پاکسازی ردپای نفوذگران در پایگاه داده، هر رکورد ممیزی به صورت زنجیره‌ای (بلاک‌چینی) با استفاده از الگوریتم <span className="font-semibold text-white/70">SHA-256</span> به هش رکورد ماقبل خود متصل شده است. هرگونه تغییر در پایگاه داده بلافاصله کل زنجیره را باطل می‌کند.
        </p>
      </div>

      {/* Verification control block */}
      <div className="bg-[#111114] p-5 rounded-xl shadow-lg border border-white/10 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="space-y-1 text-right">
          <span className="text-xs font-bold text-white/40 block">پایش اصالت زنجیره بلاک‌چینی</span>
          <p className="text-[11px] text-white/60">
            تعداد تراکنش‌های تحت پایش جاری: <code className="font-bold text-blue-400 font-mono">{auditLogs.length} بلوک</code>
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Verify Button */}
          <button
            onClick={handleVerifyIntegrity}
            disabled={isVerifying}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-white/10 text-white text-xs px-4 py-2.5 rounded-lg font-bold flex items-center gap-1.5 transition-colors shadow-md"
          >
            {isVerifying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            <span>بررسی صحت و تمامیت زنجیره ممیزی</span>
          </button>

          {/* Tamper Button */}
          {!tamperTriggered ? (
            <button
              onClick={handleSimulateTamper}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs px-4 py-2.5 rounded-lg font-bold border border-red-500/20 transition-all"
            >
              ⚠️ شبیه‌سازی نفوذ و دستکاری پایگاه داده
            </button>
          ) : (
            <button
              onClick={handleFixTamper}
              className="bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs px-4 py-2.5 rounded-lg font-bold border border-green-500/20 transition-all flex items-center gap-1"
            >
              <RefreshCw className="w-4 h-4 animate-spin" />
              رفع دستکاری و بازسازی دیتابیس
            </button>
          )}
        </div>
      </div>

      {/* Verification outcome notification */}
      {verificationResult && (
        <div className={`p-4 rounded-xl border animate-fade-in flex flex-col md:flex-row md:items-center justify-between gap-4 ${
          verificationResult.isValid 
            ? 'bg-green-500/10 border-green-500/20 text-green-400' 
            : 'bg-red-500/10 border-red-500/20 text-red-400'
        }`}>
          <div className="flex items-start gap-2.5 text-xs sm:text-sm">
            {verificationResult.isValid ? (
              <CheckCircle className="w-6 h-6 text-green-400 shrink-0 mt-0.5" />
            ) : (
              <ShieldAlert className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
            )}
            <div>
              <h5 className="font-bold">
                {verificationResult.isValid ? 'امضا دیجیتال زنجیره ممیزی کاملاً معتبر است!' : 'هشدار رخنه امنیتی کشف شد! تمامیت داده از دست رفته است.'}
              </h5>
              <p className="text-xs text-white/50 mt-1">
                {verificationResult.isValid 
                  ? `تمام ${verificationResult.logsVerifiedCount} بلوک تراکنش از ریشه مبدا با موفقیت انطباق‌یابی گردید. هیچ تغییری در تاریخچه دیتابیس رخ نداده است.`
                  : `یک تغییر غیرمجاز پنهان در شناسه بلوک ${verificationResult.errorAtLogId?.substring(0, 8)}... رخ داده است! هشِ قبلی با امضای فعلی مطابقت ندارد.`}
              </p>
            </div>
          </div>
          
          <div className="text-xs shrink-0">
            وضعیت: {' '}
            <span className={`font-bold px-2.5 py-1 rounded-full ${verificationResult.isValid ? 'bg-green-500/25 text-green-300' : 'bg-red-500/25 text-red-300'}`}>
              {verificationResult.isValid ? 'امنیت ۱۰۰٪ تایید شد' : 'داده دستکاری شده'}
            </span>
          </div>
        </div>
      )}

      {/* Blockchain visual cards sequence */}
      <div className="space-y-4">
        <span className="text-xs font-bold text-white/40 block mb-2">دیاگرام متصل بلوک‌های زنجیره ممیزی (Audit Blockchain Map)</span>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {auditLogs.map((log, index) => {
            const isTamperedBlock = log.id === tamperLogId;
            const isPreviousTamperedIndicator = index > 1 && tamperTriggered; // chain breaks downstream

            return (
              <div 
                key={log.id}
                className={`p-4 rounded-xl border relative flex flex-col justify-between transition-all ${
                  isTamperedBlock 
                    ? 'bg-red-500/10 border-red-500/30 ring-2 ring-red-500/30' 
                    : isPreviousTamperedIndicator 
                    ? 'bg-amber-500/10 border-amber-500/20'
                    : 'bg-[#111114] border-white/10 hover:border-white/20 shadow-lg'
                }`}
              >
                {/* Block index indicator */}
                <div className="absolute top-3 left-3 bg-black text-white/40 px-1.5 py-0.5 rounded font-mono text-[9px] font-bold border border-white/5">
                  Block #{index}
                </div>

                <div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.2 rounded">
                      {log.action}
                    </span>
                  </div>

                  <p className="text-[11px] text-white/80 font-semibold mt-2">
                    رویداد: {
                      log.action === 'TENANT_PROVISIONED' ? 'سازمان‌دهی مستأجر جدید' :
                      log.action === 'USER_CREATED' ? 'ثبت پرسنل جدید' :
                      log.action === 'DOCUMENT_REGISTERED' ? 'ثبت سند دیجیتال جدید' :
                      log.action === 'DOCUMENT_VOIDED' ? 'ابطال سند فیزیکی' :
                      log.action === 'CUSTODY_TRANSFER_INITIATED' ? 'شروع انتقال حضانت فیزیکی' :
                      log.action === 'CUSTODY_TRANSFER_APPROVED' ? 'تایید دریافت نسخه فیزیکی' :
                      log.action === 'TELEGRAM_USER_PAIRED' ? 'جفت‌سازی امن کاربری تلگرام' : log.action
                    }
                  </p>

                  <div className="text-[9px] text-white/50 space-y-1 mt-3 font-mono">
                    <div className="p-1 bg-black/40 rounded border border-white/5">
                      <span className="text-white/30 font-bold">PREV_HASH:</span>{' '}
                      <span className="text-white/50 block truncate" title={log.previous_record_hash}>
                        {log.previous_record_hash.substring(0, 16)}...
                      </span>
                    </div>
                    <div className="p-1 bg-black/40 rounded mt-1 border border-white/5">
                      <span className="text-blue-400 font-bold">CURR_HASH:</span>{' '}
                      <span className="text-blue-300 font-semibold block truncate" title={log.current_record_hash}>
                        {log.current_record_hash.substring(0, 16)}...
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/5 pt-2 mt-3 flex items-center justify-between text-[9px] text-white/40">
                  <span>شناسه سند: {log.entity_id?.substring(0, 6) || 'N/A'}</span>
                  <span>{new Date(log.created_at).toLocaleTimeString('fa-IR')}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
