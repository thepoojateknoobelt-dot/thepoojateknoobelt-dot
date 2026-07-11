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
  Factory,
  X,
  ArrowLeft,
  Archive
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Button } from './ui/button';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen?: boolean;
  onClose?: () => void;
  beltCutProUrl?: string;
  onBackToMaster?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isOpen, onClose, beltCutProUrl, onBackToMaster }) => {
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
      "w-64 bg-zinc-900 text-zinc-400 flex flex-col border-r border-zinc-800 transition-transform duration-300 ease-in-out shrink-0",
      "fixed inset-y-0 left-0 z-50 lg:static lg:translate-x-0",
      isOpen ? "translate-x-0" : "-translate-x-full"
    )}>
      <div className="p-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white rounded-lg">
            <Factory className="h-6 w-6 text-zinc-900" />
          </div>
          <div className="flex flex-col">
            <span className="text-white font-bold text-lg leading-tight">Pooja Tekno Belt</span>
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Pricing Portal</span>
          </div>
        </div>

        {/* Mobile Close Button */}
        <button 
          onClick={onClose}
          className="lg:hidden p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
          aria-label="Close Sidebar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {onBackToMaster && (
        <div className="px-4 mb-2">
          <button
            type="button"
            onClick={onBackToMaster}
            className="w-full flex items-center gap-3 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 text-zinc-400" />
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
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
              activeTab === item.id 
                ? "bg-white text-zinc-900 shadow-lg shadow-black/20" 
                : "hover:bg-zinc-800 hover:text-zinc-200"
            )}
          >
            <item.icon className={cn("h-5 w-5", activeTab === item.id ? "text-zinc-900" : "text-zinc-500")} />
            {item.label}
          </button>
        ))}

      </nav>

      <div className="p-4 border-t border-zinc-800 shrink-0">
        <div className="flex items-center gap-3 px-4 py-3 mb-4">
          <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-200 font-bold text-xs">
            {user?.name?.charAt(0) || user?.username?.charAt(0)}
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-medium text-white truncate">{user?.name || user?.username}</span>
            <span className="text-xs text-zinc-500 capitalize">{user?.role}</span>
          </div>
        </div>
        <Button 
          variant="ghost" 
          className="w-full justify-start gap-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl"
          onClick={logout}
        >
          <LogOut className="h-5 w-5" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
};
