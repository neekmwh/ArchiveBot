/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { DbStore } from './dbStore';
import { Tenant, User } from './types';
import DocDashboard from './components/DocDashboard';
import TelegramSimulator from './components/TelegramSimulator';
import S3Storage from './components/S3Storage';
import DatabaseRLS from './components/DatabaseRLS';
import AuditLogChain from './components/AuditLogChain';
import SuperAdminPanel from './components/SuperAdminPanel';
import { 
  Building2, Bot, HardDrive, Database, ShieldAlert, 
  HelpCircle, ShieldCheck, CheckCircle2, UserCheck, 
  Layers, RefreshCw, AlertCircle
} from 'lucide-react';

export default function App() {
  const [dbRefreshCounter, setDbRefreshCounter] = useState(0);
  
  // Multi-Tenant selections
  const [activeTenantId, setActiveTenantId] = useState<string>('tenant-0000-0000-0000-000000000001');
  const [activeUser, setActiveUser] = useState<User | null>(null);
  
  // Tab control
  const [activeTab, setActiveTab] = useState<string>('documents');

  // Load database once and synchronize active user
  useEffect(() => {
    const data = DbStore.load();
    const tenantUsers = DbStore.getUsers(activeTenantId);
    
    // Default to the first OWNER or first user in tenant if activeUser is not set or from a different tenant
    if (!activeUser || activeUser.tenant_id !== activeTenantId) {
      const owner = tenantUsers.find(u => u.role === 'OWNER') || tenantUsers[0];
      setActiveUser(owner || null);
    }
  }, [activeTenantId, dbRefreshCounter]);

  const refreshDb = () => {
    setDbRefreshCounter(prev => prev + 1);
  };

  const handleTenantChange = (tenantId: string) => {
    setActiveTenantId(tenantId);
    const data = DbStore.load();
    const tenantUsers = DbStore.getUsers(tenantId);
    const owner = tenantUsers.find(u => u.role === 'OWNER') || tenantUsers[0];
    setActiveUser(owner || null);
    refreshDb();
  };

  const handleSetBotSimUser = (user: User) => {
    setActiveUser(user);
  };

  const dbData = DbStore.load();
  const currentTenant = dbData.tenants.find(t => t.id === activeTenantId);

  // Hide dev tools in production builds (CD-006)
  const isProduction = (import.meta as any).env?.PROD || (import.meta as any).env?.MODE === 'production';

  // Tab config dynamically built
  const tabs = [
    { id: 'documents', label: '📄 مدیریت اسناد (SaaS CRM)', component: DocDashboard },
    ...(activeUser?.role === 'SUPER_ADMIN' ? [
      { id: 'super_admin', label: '👑 پنل مدیریت ارشد (SaaS Portal)', component: SuperAdminPanel }
    ] : []),
    ...(!isProduction ? [
      { id: 'telegram', label: '🤖 شبیه‌ساز ربات تلگرام', component: TelegramSimulator },
      { id: 's3', label: '☁️ ذخیره‌ساز ابری S3', component: S3Storage },
      { id: 'database', label: '💾 لایه پایگاه داده و RLS', component: DatabaseRLS },
      { id: 'audit', label: '🔒 دفتر ممیزی زنجیره‌بندی شده', component: AuditLogChain },
    ] : [])
  ];

  return (
    <div className="rtl min-h-screen bg-[#0a0a0c] text-[#e2e2e7] font-sans flex flex-col antialiased">
      
      {/* Top Universal Navbar */}
      <header className="bg-[#111114] border-b border-white/10 sticky top-0 z-40 shadow-xl">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Logo and Platform Name */}
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-xl text-white shadow-md shadow-blue-600/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-[#e2e2e7] tracking-tight text-sm sm:text-base flex items-center gap-1.5">
                <span>سامانه چندمستأجری مدیریت اسناد کارگاهی</span>
                <span className="text-[10px] bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">نسخه دمو v1.0</span>
              </h1>
              <p className="text-[10px] text-white/40 mt-0.5">سیستم یکپارچه تحویل فیزیکی، ممیزی زنجیره‌ای و ایزولاسیون دیتابیس</p>
            </div>
          </div>

          {/* Real-time Infrastructure Indicators */}
          <div className="hidden xl:flex items-center gap-4 text-[11px] font-medium text-white/60">
            <div className="flex items-center gap-1 bg-green-500/10 border border-green-500/20 p-1.5 rounded-lg text-green-400">
              <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
              <span>پایش بدافزار ClamAV فعال</span>
            </div>
            <div className="flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 p-1.5 rounded-lg text-blue-400">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span>PostgreSQL RLS متصل</span>
            </div>
            <div className="flex items-center gap-1 bg-green-500/10 border border-green-500/20 p-1.5 rounded-lg text-green-400">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
              <span>امضای دفتر کل معتبر</span>
            </div>
          </div>

          {/* Active Tenant Switcher - Only visible to Super Admin or in Dev mode (CD-008) */}
          {(activeUser?.role === 'SUPER_ADMIN' || !isProduction) && (
            <div className="flex items-center gap-2 shrink-0">
              <Building2 className="w-4 h-4 text-white/40 shrink-0" />
              <select
                value={activeTenantId}
                onChange={(e) => handleTenantChange(e.target.value)}
                className="bg-[#0d0d10] border border-white/10 hover:border-white/20 text-xs font-bold text-white/90 rounded-lg py-1.5 px-3 focus:outline-none cursor-pointer"
              >
                {dbData.tenants
                  .filter(t => activeUser?.role === 'SUPER_ADMIN' || t.id !== 'tenant-0000-0000-0000-000000000000')
                  .map(t => (
                    <option key={t.id} value={t.id} className="bg-[#111114]">
                      🏢 {t.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

        </div>
      </header>

      {/* Main Tabbed Layout Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        
        {/* Navigation Tabs */}
        <div className="border-b border-white/10 flex overflow-x-auto gap-2 pb-0.5 scrollbar-thin select-none">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-4 text-xs font-bold whitespace-nowrap border-b-2 transition-all ${
                  isActive 
                    ? 'border-blue-500 text-blue-400 font-extrabold' 
                    : 'border-transparent text-white/40 hover:text-white/80 hover:border-white/10'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Active View Render Panel */}
        <div className="min-h-[450px]">
          {React.createElement(
            tabs.find(t => t.id === activeTab)?.component || DocDashboard,
            {
              tenantId: activeTenantId,
              activeUser: activeUser,
              refreshDb: refreshDb,
              onSelectTab: setActiveTab,
              onSetBotSimUser: handleSetBotSimUser
            }
          )}
        </div>

      </main>

      {/* System Footer / Security Guidelines Disclaimer */}
      <footer className="bg-[#0d0d10] border-t border-white/10 mt-auto py-5 text-center text-xs text-white/40">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="leading-relaxed">
            محافظت از اسناد دیجیتال و تداوم زنجیره حضانت کاغذی • طراحی شده منطبق بر مستندات استقرار امنیتی <code className="font-bold text-white/60">PD-001</code> تا <code className="font-bold text-white/60">PD-009</code>
          </p>
          <div className="flex items-center gap-1.5 bg-blue-500/10 text-blue-300 px-3 py-1.5 rounded-lg border border-blue-500/20">
            <AlertCircle className="w-4 h-4 text-blue-400 shrink-0" />
            <span>تمام سناریوها شامل ایزولاسیون RLS و آنتی‌ویروس ClamAV به شکل بومی شبیه‌سازی شده‌اند.</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
