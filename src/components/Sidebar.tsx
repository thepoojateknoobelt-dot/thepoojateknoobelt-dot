import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard,
  Calculator as CalcIcon, 
  Settings, 
  Users, 
  UserPlus, 
  FileText, 
  BarChart3, 
  History, 
  LogOut,
  X,
  ArrowLeft,
  Archive
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

const PTBLogoIcon = () => (
  <svg width="34" height="34" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
    <polygon points="30,8 70,8 92,30 92,70 70,92 30,92 8,70 8,30" stroke="#1e40af" strokeWidth="8" fill="none"/>
    <text x="50" y="60" fill="#1e40af" fontSize="26" fontWeight="900" textAnchor="middle" fontFamily="sans-serif" letterSpacing="-1">PTB</text>
  </svg>
);

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
  beltCutProUrl?: string;
  onBackToMaster?: () => void;
  pendingMarginRequestsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isOpen, onClose, beltCutProUrl, onBackToMaster, pendingMarginRequestsCount = 0 }) => {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'sales'] },
    { id: 'calculator', label: 'Calculator', icon: CalcIcon, roles: ['admin', 'sales'] },
    { id: 'quotations', label: 'Quotations', icon: FileText, roles: ['admin', 'sales'] },
    { id: 'clients', label: 'Clients', icon: UserPlus, roles: ['admin', 'sales'] },
    { id: 'reports', label: 'Reports', icon: BarChart3, roles: ['admin'] },
    { id: 'activity', label: 'Activity Log', icon: History, roles: ['admin'] },
    { id: 'users', label: 'Users', icon: Users, roles: ['admin'] },
    { id: 'config', label: 'Configuration', icon: Settings, roles: ['admin'] },
    { id: 'data_directory', label: 'Data Directory', icon: Archive, roles: ['admin'] },
  ];

  return (
    <aside className={cn(
      "w-64 bg-[#f1f5f9] text-[#1e3a8a] flex flex-col border-r border-blue-100 transition-transform duration-300 ease-in-out shrink-0",
      "fixed inset-y-0 left-0 z-50 lg:static lg:translate-x-0",
      isOpen ? "translate-x-0" : "-translate-x-full"
    )}>
      <div className="p-6 flex items-center justify-between gap-3 border-b border-blue-100/50">
        <div className="flex items-center gap-3">
          <PTBLogoIcon />
          <div className="flex flex-col">
            <span className="text-[#1e3a8a] font-black text-sm tracking-tight leading-tight">POOJA TEKNOBELT</span>
            <span className="text-[9px] font-bold text-blue-500/80 uppercase tracking-widest mt-0.5">Pricing Portal</span>
          </div>
        </div>

        {/* Mobile Close Button */}
        <button 
          onClick={onClose}
          className="lg:hidden p-1.5 text-blue-800/55 hover:text-[#1e3a8a] hover:bg-[#e2e8f0] rounded-xl transition-colors cursor-pointer"
          aria-label="Close Sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {onBackToMaster && (
        <div className="px-4 mt-4">
          <button
            type="button"
            onClick={onBackToMaster}
            className="w-full flex items-center gap-3 px-4 py-2.5 bg-[#e2e8f0] hover:bg-[#dbeafe] text-[#1e3a8a] rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-blue-700" />
            Master Dashboard
          </button>
        </div>
      )}

      <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto">
        {menuItems.filter(item => {
          if (user?.role === 'admin') return true;
          return user?.allowedPages?.includes(item.id);
        }).map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={(e) => {
              e.preventDefault();
              setActiveTab(item.id);
              onClose?.();
            }}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200",
              activeTab === item.id 
                ? "bg-[#dbeafe] text-[#1e3a8a] shadow-sm" 
                : "text-[#1e3a8a]/70 hover:bg-[#dbeafe]/50 hover:text-[#1e3a8a]"
            )}
          >
            <item.icon className={cn("h-5 w-5", activeTab === item.id ? "text-[#1e40af]" : "text-blue-500/80")} />
            <span className="flex-1 text-left">{item.label}</span>
            {item.id === 'dashboard' && isAdmin && pendingMarginRequestsCount > 0 && (
              <span className="bg-amber-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-pulse">
                {pendingMarginRequestsCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-blue-100/50 shrink-0">
        <div className="flex items-center gap-3 px-4 py-3 mb-4">
          <div className="h-8 w-8 rounded-full bg-[#e2e8f0] flex items-center justify-center text-[#1e3a8a] font-bold text-xs border border-blue-200">
            {user?.name?.charAt(0) || user?.username?.charAt(0)}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-bold text-[#1e3a8a] truncate">{user?.name || user?.username}</span>
            <span className="text-[10px] text-blue-500/80 font-bold uppercase tracking-wider">{user?.role}</span>
          </div>
        </div>
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 text-[#1e3a8a]/70 hover:text-red-650 hover:bg-red-50/50 rounded-xl"
          onClick={logout}
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </Button>
        <div className="mt-3 text-[10px] text-blue-500/40 font-mono text-center select-none">
          {(() => {
            const build = "01";
            const now = new Date();
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const yy = String(now.getFullYear()).slice(-2);
            return `V.${mm}.${yy}.${build}`;
          })()}
        </div>
      </div>
    </aside>
  );
};
