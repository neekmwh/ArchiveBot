/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { DbStore } from '../dbStore';
import { 
  Database, ShieldAlert, Key, Play, Terminal, 
  Layers, CheckCircle, Table, Eye, EyeOff 
} from 'lucide-react';

interface DatabaseRLSProps {
  tenantId: string;
  refreshDb: () => void;
}

export default function DatabaseRLS({ tenantId, refreshDb }: DatabaseRLSProps) {
  const dbData = DbStore.load();
  
  // States
  const [activeTable, setActiveTable] = useState<string>('documents');
  const [rlsEnabled, setRlsEnabled] = useState<boolean>(true);
  const [sqlQuery, setSqlQuery] = useState<string>('SELECT * FROM documents;');
  const [consoleResult, setConsoleResult] = useState<any[] | null>(null);
  const [consoleColumns, setConsoleColumns] = useState<string[]>([]);
  const [consoleError, setConsoleError] = useState<string | null>(null);

  // Schema Table Keys list
  const schemaTables = [
    { name: 'tenants', label: 'مستأجران (Tenants)', icon: Database, rlsBound: false },
    { name: 'users', label: 'کاربران (Users)', icon: Table, rlsBound: true },
    { name: 'projects', label: 'پروژه‌ها (Projects)', icon: Table, rlsBound: true },
    { name: 'documents', label: 'اسناد (Documents)', icon: Table, rlsBound: true },
    { name: 'custodyTransfers', label: 'انتقال‌های حضانت (CustodyTransfers)', icon: Table, rlsBound: true },
    { name: 'auditLogs', label: 'لاگ‌های ممیزی (AuditLogs)', icon: Table, rlsBound: true },
  ];

  // Resolve data according to RLS State
  const getTableRows = (tableName: string) => {
    const rawRows = (dbData as any)[tableName] || [];
    if (!rlsEnabled) return rawRows; // Superuser bypass

    // Check if table is bound to RLS
    const tableConf = schemaTables.find(t => t.name === tableName);
    if (tableConf && tableConf.rlsBound) {
      return rawRows.filter((r: any) => r.tenant_id === tenantId);
    }
    return rawRows;
  };

  const activeRows = getTableRows(activeTable);

  // Execute Simulated SQL Queries
  const handleExecuteSQL = (e: React.FormEvent) => {
    e.preventDefault();
    setConsoleError(null);
    setConsoleResult(null);

    const queryNorm = sqlQuery.trim().toLowerCase().replace(/\s+/g, ' ');

    try {
      // Very basic mock parser for demonstration
      if (!queryNorm.startsWith('select ')) {
        throw new Error('سیستم امنیتی RLS فقط مجوز متدهای خواندنی (DQL - SELECT) را صادر می‌کند. تغییر مستقیم داده‌های چندمستأجری مسدود است.');
      }

      let targetTable = '';
      if (queryNorm.includes('from tenants')) targetTable = 'tenants';
      else if (queryNorm.includes('from users')) targetTable = 'users';
      else if (queryNorm.includes('from projects')) targetTable = 'projects';
      else if (queryNorm.includes('from documents')) targetTable = 'documents';
      else if (queryNorm.includes('from custodytransfers') || queryNorm.includes('from custody_transfers')) targetTable = 'custodyTransfers';
      else if (queryNorm.includes('from auditlogs') || queryNorm.includes('from audit_logs')) targetTable = 'auditLogs';
      else {
        throw new Error('جدول مورد نظر در طرحواره پایگاه داده یافت نشد! (مثال: FROM documents)');
      }

      // Query data with RLS enforced
      const dataset = getTableRows(targetTable);
      
      if (dataset.length === 0) {
        setConsoleResult([]);
        setConsoleColumns([]);
        return;
      }

      // Columns extraction
      const cols = Object.keys(dataset[0]);
      setConsoleColumns(cols);
      setConsoleResult(dataset);
    } catch (err: any) {
      setConsoleError(err.message || 'خطا در اجرای کوئری SQL.');
    }
  };

  const loadPrebuiltSQL = (tbl: string) => {
    setSqlQuery(`SELECT * FROM ${tbl};`);
  };

  return (
    <div className="rtl space-y-6 text-[#e2e2e7]">
      
      {/* RLS Policy Dashboard Banner */}
      <div className="bg-[#111114] p-5 rounded-xl shadow-xl border border-white/10 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <div className="md:col-span-2 space-y-1.5">
          <h3 className="font-bold text-base flex items-center gap-1.5 text-white">
            <ShieldAlert className="w-5 h-5 text-blue-400" />
            <span>شبیه‌ساز Row-Level Security (RLS) در PostgreSQL 16</span>
          </h3>
          <p className="text-xs text-white/40 leading-relaxed">
            در پایگاه داده چندمستأجری، یک اشتباه کوچک برنامه‌نویسی در لایه اپلیکیشن می‌تواند موجب درز اطلاعات بین مستأجران شود. RLS در سطح موتور دیتابیس قیدهای جداسازی را اعمال می‌کند به نحوی که کاربر هرگز اسناد سایر شرکت‌ها را نخواهد دید.
          </p>
        </div>

        {/* Interactive RLS Switch */}
        <div className="md:col-span-1 flex flex-col items-center justify-center bg-black/40 p-4 rounded-xl border border-white/10">
          <span className="text-[11px] font-bold text-white/50 mb-2 font-sans">وضعیت سیاست RLS دیتابیس</span>
          
          <button
            onClick={() => setRlsEnabled(!rlsEnabled)}
            className={`w-full py-2 px-4 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all ${
              rlsEnabled 
                ? 'bg-green-600 hover:bg-green-500 text-white shadow-md' 
                : 'bg-red-600 hover:bg-red-500 text-white shadow-md'
            }`}
          >
            {rlsEnabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span>{rlsEnabled ? 'RLS فعال (ایمن)' : 'RLS غیرفعال (شبیه‌سازی نشت داده)'}</span>
          </button>

          <span className="text-[9px] text-white/30 mt-2 text-center leading-normal">
            با غیرفعال کردن RLS، می‌توانید تمام ردیف‌های ذخیره شده سراسر پلتفرم SaaS را مشاهده نمایید!
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Side: Table Selector */}
        <div className="lg:col-span-1 bg-[#111114] p-4 rounded-xl shadow-lg border border-white/10 space-y-3">
          <span className="text-xs font-bold text-white/40 block pb-2 border-b border-white/10">طرحواره پایگاه داده (Schema)</span>
          
          <div className="space-y-1.5">
            {schemaTables.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.name}
                  onClick={() => {
                    setActiveTable(t.name);
                    loadPrebuiltSQL(t.name);
                  }}
                  className={`w-full text-right p-2.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-all ${
                    activeTable === t.name 
                      ? 'bg-blue-600/10 border border-blue-500/30 text-blue-400 font-extrabold' 
                      : 'bg-white/5 border border-transparent text-white/60 hover:bg-white/10 hover:text-[#e2e2e7]'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <Icon className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>{t.label}</span>
                  </span>
                  {t.rlsBound && rlsEnabled && (
                    <span className="text-[8px] bg-green-500/15 text-green-400 border border-green-500/30 font-bold px-1 rounded">RLS</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side: SQL Console and Table Viewer */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Table Rows Viewer */}
          <div className="bg-[#111114] rounded-xl shadow-lg border border-white/10 p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-white/90 text-sm flex items-center gap-1.5">
                <Table className="w-4.5 h-4.5 text-blue-400" />
                <span>بررسی رکوردها (رویکرد RLS)</span>
              </h4>
              <span className="text-xs text-white/40 font-mono">
                {activeRows.length} ردیف بازیابی شد
              </span>
            </div>

            {activeRows.length === 0 ? (
              <div className="text-center py-12 text-white/30 text-xs">
                ردیفی یافت نشد.
              </div>
            ) : (
              <div className="overflow-x-auto border border-white/10 rounded-lg max-h-72 bg-black/20">
                <table className="w-full text-right text-xs border-collapse">
                  <thead className="bg-[#0d0d10] text-white/60 border-b border-white/10 font-bold">
                    <tr>
                      <th className="p-2.5">id</th>
                      {activeTable !== 'tenants' && <th className="p-2.5 text-blue-400">tenant_id</th>}
                      {Object.keys(activeRows[0]).filter(k => k !== 'id' && k !== 'tenant_id' && k !== 'details' && k !== 'metadata').map(key => (
                        <th key={key} className="p-2.5">{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-[11px] text-white/80">
                    {activeRows.map((row: any, idx) => (
                      <tr key={row.id || idx} className="hover:bg-white/5">
                        <td className="p-2.5 text-white/40 select-all font-semibold truncate max-w-[100px]" title={row.id}>
                          {row.id?.substring(0, 8)}...
                        </td>
                        {activeTable !== 'tenants' && (
                          <td className="p-2.5 select-all font-semibold truncate max-w-[100px]" title={row.tenant_id}>
                            {row.tenant_id === tenantId ? (
                              <span className="text-green-400 bg-green-500/10 border border-green-500/20 px-1 py-0.2 rounded font-bold">✓ جاری</span>
                            ) : (
                              <span className="text-red-400 bg-red-500/10 border border-red-500/20 px-1 py-0.2 rounded font-bold">⚠️ غریبه</span>
                            )}
                          </td>
                        )}
                        {Object.keys(row).filter(k => k !== 'id' && k !== 'tenant_id' && k !== 'details' && k !== 'metadata').map(key => (
                          <td key={key} className="p-2.5 text-white/75 max-w-[150px] truncate" title={String(row[key])}>
                            {row[key] === true ? 'TRUE' : row[key] === false ? 'FALSE' : String(row[key] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Interactive SQL Console */}
          <div className="bg-[#0d0d10] rounded-xl shadow-lg border border-white/10 p-5 text-[#e2e2e7]">
            <h4 className="font-semibold text-xs flex items-center gap-1.5 text-blue-400 mb-3">
              <Terminal className="w-4.5 h-4.5 text-blue-400" />
              <span>پایانه کوئری‌های SQL تعاملی (DQL Sandbox)</span>
            </h4>

            <form onSubmit={handleExecuteSQL} className="space-y-3">
              <div className="relative">
                <textarea
                  rows={2}
                  value={sqlQuery}
                  onChange={(e) => setSqlQuery(e.target.value)}
                  className="w-full bg-black text-green-400 font-mono text-xs p-3 rounded-lg border border-white/10 focus:outline-none focus:border-blue-500 ltr text-left"
                />
                <button
                  type="submit"
                  className="absolute bottom-3 left-3 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all shadow-md"
                >
                  <Play className="w-3 h-3" /> Execute
                </button>
              </div>
            </form>

            {/* SQL Results Viewer */}
            {consoleError && (
              <div className="mt-3 bg-red-950/40 border border-red-900/40 p-3 rounded-lg text-xs text-red-300 font-medium">
                {consoleError}
              </div>
            )}

            {consoleResult && (
              <div className="mt-3 bg-black p-3 rounded-lg border border-white/10">
                <span className="text-[10px] text-white/40 font-bold block mb-2">خروجی کنسول ({consoleResult.length} ردیف):</span>
                
                {consoleResult.length === 0 ? (
                  <span className="text-white/30 text-xs">مجموعه نتایج تهی است.</span>
                ) : (
                  <div className="overflow-x-auto max-h-52">
                    <table className="w-full text-left font-mono text-[10px] border-collapse ltr" dir="ltr">
                      <thead>
                        <tr className="border-b border-white/5 text-white/50 text-left font-bold">
                          {consoleColumns.map(col => (
                            <th key={col} className="p-1.5">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-white/80">
                        {consoleResult.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-white/5">
                            {consoleColumns.map(col => (
                              <td key={col} className="p-1.5 max-w-[120px] truncate" title={String(row[col])}>
                                {String(row[col] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
