import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { DashboardHome } from './DashboardHome';
import { BeltcutPro } from './BeltcutPro/BeltcutPro';
import { Calculator } from './Calculator';
import { AdminConfig } from './AdminConfig';
import { UserManagement } from './UserManagement';
import { ClientRegistry } from './ClientRegistry';
import { QuotationsList } from './QuotationsList';
import { Reports } from './Reports';
import { ActivityLog } from './ActivityLog';
import { DataDirectory } from './DataDirectory';
import { Config, Client } from '../types';
import { cn } from '../lib/utils';
import { Loader2, Factory, Calculator as CalcIcon, Scissors, ArrowRight, ArrowLeft, Menu, Clock } from 'lucide-react';
import { Background3D } from './Background3D';
import { PresenceProPortal } from './PresenceProPortal';

export const Dashboard = () => {
  const { user } = useAuth();

  const getInitialModule = () => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('module') as 'master' | 'pricing' | 'production' | 'presence') || 'master';
  };

  const getInitialTab = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') || 'dashboard';
  };

  const [activeModule, setActiveModule] = useState<'master' | 'pricing' | 'production' | 'presence'>(getInitialModule);
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [config, setConfig] = useState<Config | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleModuleChange = (mod: 'master' | 'pricing' | 'production' | 'presence') => {
    setActiveModule(mod);
    const params = new URLSearchParams(window.location.search);
    params.set('module', mod);
    if (mod === 'master') {
      params.delete('tab');
    } else if (mod === 'pricing') {
      params.set('tab', activeTab || 'dashboard');
    }
    window.history.pushState({ module: mod, tab: params.get('tab') }, '', `?${params.toString()}`);
  };

  const handleTabChange = (tab: string) => {
    if (tab === 'beltcut') {
      handleModuleChange('production');
      return;
    }
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set('module', activeModule);
    if (params.get('tab') !== tab) {
      params.set('tab', tab);
      window.history.pushState({ module: activeModule, tab }, '', `?${params.toString()}`);
    }
  };

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const params = new URLSearchParams(window.location.search);
      const mod = (params.get('module') as 'master' | 'pricing' | 'production' | 'presence') || 'master';
      const tab = params.get('tab') || 'dashboard';
      setActiveModule(mod);
      setActiveTab(tab);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && activeTab !== 'dashboard') {
        handleTabChange('dashboard');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeTab]);

  const fetchConfigAndClients = async () => {
    try {
      const [configRes, clientsRes] = await Promise.all([
        fetch('/api/settings/config'),
        fetch('/api/clients')
      ]);

      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData);
      }

      if (clientsRes.ok) {
        const clientsData = await clientsRes.json();
        setClients(clientsData);
      }
    } catch (err) {
      console.error('Failed to fetch config or clients', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigAndClients();
    const interval = setInterval(fetchConfigAndClients, 4000);
    return () => clearInterval(interval);
  }, []);



  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-50">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  const renderContent = () => {
    const safeConfig = config || {} as any;
    switch (activeTab) {
      case 'dashboard':
        return <DashboardHome config={safeConfig} clients={clients} onNavigate={handleTabChange} />;
      case 'calculator':
        return <Calculator config={safeConfig} clients={clients} />;
      case 'config':
        return <AdminConfig config={safeConfig} onRefresh={fetchConfigAndClients} />;
      case 'users':
        return <UserManagement />;
      case 'clients':
        return <ClientRegistry clients={clients} config={safeConfig} onRefresh={fetchConfigAndClients} />;
      case 'quotations':
        return <QuotationsList config={safeConfig} />;
      case 'reports':
        return <Reports config={safeConfig} clients={clients} />;
      case 'activity':
        return <ActivityLog />;
      case 'data_directory':
        return <DataDirectory onRefresh={fetchConfigAndClients} />;
      case 'beltcut':
        return <BeltcutPro />;
      default:
        return <DashboardHome config={safeConfig} clients={clients} onNavigate={handleTabChange} />;
    }
  };

  if (activeModule === 'master') {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex flex-col justify-between text-zinc-900 font-sans antialiased overflow-hidden relative">
        {/* CSS Keyframes for 3D Mesh and Floating Glow Spheres */}
        <style>{`
          @keyframes float-sphere-1 {
            0% { transform: translate(0px, 0px) scale(1) rotate(0deg); }
            33% { transform: translate(60px, -80px) scale(1.2) rotate(120deg); }
            66% { transform: translate(-40px, 40px) scale(0.85) rotate(240deg); }
            100% { transform: translate(0px, 0px) scale(1) rotate(360deg); }
          }
          @keyframes float-sphere-2 {
            0% { transform: translate(0px, 0px) scale(1.15) rotate(360deg); }
            33% { transform: translate(-70px, 50px) scale(0.9) rotate(240deg); }
            66% { transform: translate(50px, -40px) scale(1.25) rotate(120deg); }
            100% { transform: translate(0px, 0px) scale(1.15) rotate(0deg); }
          }
          @keyframes float-sphere-3 {
            0% { transform: translate(0px, 0px) scale(0.9) rotate(0deg); }
            33% { transform: translate(40px, 70px) scale(1.1) rotate(120deg); }
            66% { transform: translate(-60px, -50px) scale(0.95) rotate(240deg); }
            100% { transform: translate(0px, 0px) scale(0.9) rotate(360deg); }
          }
          .animate-sphere-1 {
            animation: float-sphere-1 30s infinite alternate ease-in-out;
          }
          .animate-sphere-2 {
            animation: float-sphere-2 25s infinite alternate ease-in-out;
          }
          .animate-sphere-3 {
            animation: float-sphere-3 28s infinite alternate ease-in-out;
          }
          .glass-panel {
            background: rgba(255, 255, 255, 0.45);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid rgba(255, 255, 255, 0.6);
          }
          .glass-panel:hover {
            background: rgba(255, 255, 255, 0.7);
            border-color: rgba(255, 255, 255, 0.9);
          }
          .text-gradient {
            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #312e81 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
        `}</style>

        {/* 3D Depth Grid Overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_80%,transparent_100%)] opacity-[0.35] pointer-events-none z-0" />
        <Background3D />

        {/* Animated 3D Light Spheres for Mesh Background */}
        <div className="absolute top-[-15%] left-[-15%] w-[65vw] h-[65vw] max-w-[700px] max-h-[700px] rounded-full bg-gradient-to-br from-indigo-500/20 via-purple-500/15 to-transparent blur-[130px] pointer-events-none z-0 animate-sphere-1" />
        <div className="absolute bottom-[-15%] right-[-15%] w-[65vw] h-[65vw] max-w-[700px] max-h-[700px] rounded-full bg-gradient-to-tr from-emerald-400/20 via-teal-400/15 to-transparent blur-[130px] pointer-events-none z-0 animate-sphere-2" />
        <div className="absolute top-[25%] right-[10%] w-[50vw] h-[50vw] max-w-[550px] max-h-[550px] rounded-full bg-gradient-to-bl from-rose-400/15 via-pink-500/10 to-transparent blur-[110px] pointer-events-none z-0 animate-sphere-3" />
        <div className="absolute bottom-[20%] left-[5%] w-[55vw] h-[55vw] max-w-[600px] max-h-[600px] rounded-full bg-gradient-to-tr from-amber-400/15 via-orange-400/10 to-transparent blur-[120px] pointer-events-none z-0 animate-sphere-1" />
        
        {/* Header */}
        <header className="px-4 py-4 sm:px-8 sm:py-5 flex flex-col sm:flex-row gap-4 items-center justify-between border-b border-white/40 backdrop-blur-md bg-white/40 z-10 relative text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-zinc-900 rounded-xl shadow-xl flex items-center justify-center transform hover:rotate-6 transition-transform">
              <Factory className="h-6 w-6 text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-zinc-900 font-black tracking-tight text-lg leading-none uppercase">Pooja Tekno Belt</span>
              <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mt-1">Master Portal</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-700 font-bold uppercase tracking-wider bg-white/80 px-3.5 py-2 rounded-xl border border-white shadow-[0_4px_12px_rgba(0,0,0,0.03)] backdrop-blur-sm">
              Logged in as: {user?.name || user?.username}
            </span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12 z-10 max-w-5xl mx-auto w-full relative">
          <div className="text-center space-y-4 mb-8 sm:mb-14 animate-in fade-in slide-in-from-top-6 duration-700">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/80 text-zinc-800 rounded-full border border-white/60 shadow-[0_8px_16px_rgba(0,0,0,0.02)] backdrop-blur-md text-[10px] font-black uppercase tracking-widest">
              <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
              Welcome to the Business Suite
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight text-gradient pb-1">
              Pooja Tekno Belt
            </h1>
            <p className="text-zinc-600 text-sm md:text-base max-w-xl mx-auto leading-relaxed font-medium">
              Select one of the specialized portals below to manage your pricing workflows or production optimization.
            </p>
          </div>

          {(() => {
            const hasPricingAccess = user?.role === 'admin' || user?.allowedPages?.some(p => p !== 'production');
            const hasProductionAccess = user?.role === 'admin' || user?.allowedPages?.includes('production');
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 w-full max-w-5xl">
                {/* PTB Pricing Portal Button Card */}
                <button
                  onClick={() => hasPricingAccess && handleModuleChange('pricing')}
                  disabled={!hasPricingAccess}
                  className={cn(
                    "group text-left p-6 sm:p-8 glass-panel rounded-3xl transition-all duration-500 ease-out shadow-[0_20px_50px_rgba(0,0,0,0.03)] relative overflow-hidden flex flex-col justify-between min-h-[260px] sm:min-h-[300px] transform",
                    hasPricingAccess 
                      ? "hover:shadow-[0_30px_60px_rgba(99,102,241,0.14)] cursor-pointer hover:-translate-y-2" 
                      : "opacity-45 cursor-not-allowed"
                  )}
                >
                  {/* Radial Hover Glow */}
                  {hasPricingAccess && (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500/10 to-transparent rounded-bl-[120px] transition-transform duration-500 group-hover:scale-110" />
                    </>
                  )}
                  
                  <div className="space-y-5 relative z-10 w-full">
                    <div className="flex justify-between items-start w-full">
                      <div className={cn(
                        "p-4 rounded-2xl w-fit transition-all duration-500 shadow-md",
                        hasPricingAccess 
                          ? "bg-indigo-500/10 text-indigo-600 group-hover:scale-110 group-hover:bg-indigo-500 group-hover:text-white shadow-indigo-500/5" 
                          : "bg-zinc-200 text-zinc-400"
                      )}>
                        <CalcIcon className="h-7 w-7" />
                      </div>
                      {!hasPricingAccess && (
                        <span className="text-[9px] font-black uppercase bg-zinc-200 text-zinc-500 px-2.5 py-1 rounded-lg border border-zinc-300 tracking-wider">
                          No Access
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-xl sm:text-2xl font-bold text-zinc-950 group-hover:text-indigo-600 transition-colors tracking-tight">
                        PTB Pricing & Costing
                      </h3>
                      <p className="text-zinc-600 text-xs mt-2.5 leading-relaxed font-medium">
                        Calculate conveyor belt costing, manage client-specific profit margins, create quotations/drafts, and manage system configurations.
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 flex items-center gap-2 text-xs font-black text-zinc-700 group-hover:text-indigo-600 transition-colors uppercase tracking-wider relative z-10">
                    <span>{hasPricingAccess ? 'Access Pricing Portal' : 'Access Restricted'}</span>
                    {hasPricingAccess && <ArrowRight className="h-4 w-4 group-hover:translate-x-1.5 transition-transform duration-300" />}
                  </div>
                </button>

                {/* Production Portal Button Card */}
                <button
                  onClick={() => hasProductionAccess && handleModuleChange('production')}
                  disabled={!hasProductionAccess}
                  className={cn(
                    "group text-left p-6 sm:p-8 glass-panel rounded-3xl transition-all duration-500 ease-out shadow-[0_20px_50px_rgba(0,0,0,0.03)] relative overflow-hidden flex flex-col justify-between min-h-[260px] sm:min-h-[300px] transform",
                    hasProductionAccess 
                      ? "hover:shadow-[0_30px_60px_rgba(16,185,129,0.14)] cursor-pointer hover:-translate-y-2" 
                      : "opacity-45 cursor-not-allowed"
                  )}
                >
                  {/* Radial Hover Glow */}
                  {hasProductionAccess && (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-500/10 to-transparent rounded-bl-[120px] transition-transform duration-500 group-hover:scale-110" />
                    </>
                  )}
                  
                  <div className="space-y-5 relative z-10 w-full">
                    <div className="flex justify-between items-start w-full">
                      <div className={cn(
                        "p-4 rounded-2xl w-fit transition-all duration-500 shadow-md",
                        hasProductionAccess 
                          ? "bg-emerald-500/10 text-emerald-600 group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white shadow-emerald-500/5" 
                          : "bg-zinc-200 text-zinc-400"
                      )}>
                        <Scissors className="h-7 w-7" />
                      </div>
                      {!hasProductionAccess && (
                        <span className="text-[9px] font-black uppercase bg-zinc-200 text-zinc-500 px-2.5 py-1 rounded-lg border border-zinc-300 tracking-wider">
                          No Access
                        </span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-xl sm:text-2xl font-bold text-zinc-950 group-hover:text-emerald-600 transition-colors tracking-tight">
                        Production & Nesting
                      </h3>
                      <p className="text-zinc-600 text-xs mt-2.5 leading-relaxed font-medium">
                        Access Beltcut Pro. Optimize remnant utilization, perform 2D nesting on master rolls, calculate coordinates, and manage inventory cuts.
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 flex items-center gap-2 text-xs font-black text-zinc-700 group-hover:text-emerald-600 transition-colors uppercase tracking-wider relative z-10">
                    <span>{hasProductionAccess ? 'Access Production Portal' : 'Access Restricted'}</span>
                    {hasProductionAccess && <ArrowRight className="h-4 w-4 group-hover:translate-x-1.5 transition-transform duration-300" />}
                  </div>
                </button>

                {/* PresencePro Portal Button Card */}
                <button
                  onClick={() => handleModuleChange('presence')}
                  className="group text-left p-6 sm:p-8 glass-panel rounded-3xl transition-all duration-500 ease-out shadow-[0_20px_50px_rgba(0,0,0,0.03)] relative overflow-hidden flex flex-col justify-between min-h-[260px] sm:min-h-[300px] transform hover:shadow-[0_30px_60px_rgba(59,130,246,0.14)] cursor-pointer hover:-translate-y-2"
                >
                  {/* Radial Hover Glow */}
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-500/10 to-transparent rounded-bl-[120px] transition-transform duration-500 group-hover:scale-110" />
                  
                  <div className="space-y-5 relative z-10 w-full">
                    <div className="flex justify-between items-start w-full">
                      <div className="p-4 rounded-2xl w-fit transition-all duration-500 shadow-md bg-blue-500/10 text-blue-600 group-hover:scale-110 group-hover:bg-blue-500 group-hover:text-white shadow-blue-500/5">
                        <Clock className="h-7 w-7" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-xl sm:text-2xl font-bold text-zinc-950 group-hover:text-blue-600 transition-colors tracking-tight">
                        PresencePro
                      </h3>
                      <p className="text-zinc-600 text-xs mt-2.5 leading-relaxed font-medium">
                        Track shift schedules, manage departments, monitor daily attendance logs, and process minute-based precise payroll and salary advances.
                      </p>
                    </div>
                  </div>

                  <div className="mt-8 flex items-center gap-2 text-xs font-black text-zinc-700 group-hover:text-blue-600 transition-colors uppercase tracking-wider relative z-10">
                    <span>Access PresencePro</span>
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1.5 transition-transform duration-300" />
                  </div>
                </button>
              </div>
            );
          })()}
        </main>

        {/* Footer */}
        <footer className="py-6 text-center text-zinc-500 text-xs border-t border-white/20 bg-white/20 backdrop-blur-md z-10 relative">
          &copy; {new Date().getFullYear()} Pooja Tekno Belt. All rights reserved.
        </footer>
      </div>
    );
  }

  if (activeModule === 'production') {
    return (
      <div className="min-h-screen bg-zinc-50 overflow-hidden">
        <BeltcutPro onBackToMaster={() => handleModuleChange('master')} />
      </div>
    );
  }

  if (activeModule === 'presence') {
    return (
      <div className="min-h-screen bg-zinc-50 overflow-hidden">
        <PresenceProPortal url="/presence" onClose={() => handleModuleChange('master')} />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden relative">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={handleTabChange} 
        beltCutProUrl={config?.beltCutProUrl}
        onBackToMaster={() => handleModuleChange('master')}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      <main className="flex-1 overflow-y-auto p-3 sm:p-5">
        <div className={cn("mx-auto", activeTab === 'reports' ? "w-full max-w-none" : "max-w-7xl")}>
          {/* Mobile Header Bar */}
          <div className="flex lg:hidden items-center justify-between p-3.5 mb-6 bg-white/80 backdrop-blur-md rounded-2xl border border-zinc-200 shadow-sm">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition-all cursor-pointer animate-pulse"
                aria-label="Open Menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <span className="font-bold text-zinc-900 text-sm">Pooja Tekno Belt</span>
            </div>
            <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg uppercase tracking-wider">
              Pricing Portal
            </span>
          </div>
          {renderContent()}
        </div>
      </main>
    </div>
  );
};
