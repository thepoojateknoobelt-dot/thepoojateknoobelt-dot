import React, { useState, useEffect, useMemo } from 'react';
import { User, UserRole } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { toast } from 'sonner';
import { 
  UserPlus, 
  Trash2, 
  Shield, 
  User as UserIcon, 
  Edit2, 
  Users, 
  Search, 
  Key, 
  Lock, 
  Eye, 
  EyeOff, 
  Check, 
  ShieldCheck, 
  Sliders, 
  Layout,
  Settings,
  Scissors
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';

const PAGES_CONFIG = [
  { id: 'dashboard', label: 'Dashboard', desc: 'Main landing overview and metrics' },
  { id: 'calculator', label: 'Costing Calculator', desc: 'Pricing calculator engine' },
  { id: 'quotations', label: 'Quotations & Drafts', desc: 'Create and edit quotes' },
  { id: 'clients', label: 'Client Registry', desc: 'Edit margins and profiles' },
  { id: 'reports', label: 'Business Reports', desc: 'Financial analysis & aggregate costs' },
  { id: 'activity', label: 'Activity Logs', desc: 'System-wide event tracking' },
  { id: 'users', label: 'User Management', desc: 'Modify operators accounts & access' },
  { id: 'config', label: 'System Configuration', desc: 'Base pricing models & sync settings' },
  { id: 'production', label: 'Nesting Portal (Beltcut) Access', desc: 'General entry to the 2D nesting tool' },
  { id: 'nesting_dashboard', label: 'Nesting: Overview Tab', desc: 'View efficiency & stock counters' },
  { id: 'nesting_cutting', label: 'Nesting: Cutting System Tab', desc: 'Run auto/manual cut calculations' },
  { id: 'nesting_rolls_map', label: 'Nesting: Roll Clients Map Tab', desc: 'Visual timeline of roll allocations' },
  { id: 'nesting_details', label: 'Nesting: Client Cuts History Tab', desc: 'Audit past customer cuts and layouts' },
  { id: 'nesting_stock', label: 'Nesting: Inventory Tab', desc: 'Check master rolls & remnants stock' },
  { id: 'nesting_production', label: 'Nesting: Production Log Tab', desc: 'Verify operator cuts audit trail' },
  { id: 'nesting_scrub', label: 'Nesting: Scrap Registry Tab', desc: 'Review discarded/damaged roll waste logs' }
];

export const UserManagement = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    role: 'sales' as UserRole,
    password: '',
    permission: 'write' as 'read' | 'write',
    deletionCode: ''
  });
  const [selectedPages, setSelectedPages] = useState<string[]>(['dashboard', 'calculator', 'quotations', 'clients']);
  const [isAdding, setIsAdding] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Edit User State
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    role: 'sales' as UserRole,
    permission: 'write' as 'read' | 'write',
    allowedPages: [] as string[],
    newPassword: '', // Option to change password
    newDeletionCode: '' // Option to change deletion code
  });
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showCustomRole, setShowCustomRole] = useState(false);
  const [showEditCustomRole, setShowEditCustomRole] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Failed to fetch users', err);
    }
  };

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 4000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    return {
      total: users.length,
      admins: users.filter(u => u.role === 'admin').length,
      sales: users.filter(u => u.role === 'sales').length,
      production: users.filter(u => u.role === 'production').length,
    };
  }, [users]);

  const departmentsList = useMemo(() => {
    const defaultDeps = ['admin', 'sales', 'production'];
    const userDeps = users.map(u => u.role).filter(Boolean);
    return Array.from(new Set([...defaultDeps, ...userDeps]));
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => 
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [users, searchTerm]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username || !formData.password) {
      toast.error('Username and password are required');
      return;
    }

    setIsAdding(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          name: formData.name,
          role: formData.role,
          password: formData.password,
          permission: formData.permission,
          allowedPages: selectedPages,
          deletionCode: formData.deletionCode
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        toast.error(errData.error || 'Failed to create user');
        setIsAdding(false);
        return;
      }

      toast.success('User created successfully');
      setFormData({ username: '', name: '', role: 'sales', password: '', permission: 'write', deletionCode: '' });
      setSelectedPages(['dashboard', 'calculator', 'quotations', 'clients']);
      setShowCustomRole(false);
      fetchUsers();
    } catch (err: any) {
      console.error('Error creating user:', err);
      toast.error(`Failed to create user: ${err.message || 'Unknown error'}`);
    } finally {
      setIsAdding(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const payload: any = {
        name: editFormData.name,
        role: editFormData.role,
        permission: editFormData.permission,
        allowedPages: editFormData.allowedPages
      };
      
      // Include new password if provided
      if (editFormData.newPassword.trim() !== '') {
        payload.password = editFormData.newPassword.trim();
      }

      // Include new deletion security code if role is admin and provided
      if (editFormData.role === 'admin' && editFormData.newDeletionCode.trim() !== '') {
        payload.deletionCode = editFormData.newDeletionCode.trim();
      }

      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        toast.error(errData.error || 'Failed to update user');
        return;
      }

      toast.success('User updated successfully');
      setEditingUser(null);
      setShowEditPassword(false);
      fetchUsers();
    } catch (err: any) {
      console.error('Error updating user:', err);
      toast.error(`Failed to update user: ${err.message || 'Unknown error'}`);
    }
  };

  const handleStartEdit = (u: User) => {
    setEditingUser(u);
    setEditFormData({
      name: u.name,
      role: u.role,
      permission: u.permission || 'write',
      allowedPages: u.allowedPages || [],
      newPassword: '',
      newDeletionCode: ''
    });
    setShowEditPassword(false);
    const isDefaultRole = ['sales', 'production', 'admin'].includes(u.role);
    setShowEditCustomRole(!isDefaultRole);
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (userId === 'admin_user' || userId === 'admin') {
      toast.error('Cannot delete primary administrator');
      return;
    }
    if (!confirm(`Are you sure you want to delete user ${username}?`)) return;

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Delete failed');

      toast.success('User deleted');
      fetchUsers();
    } catch (err) {
      toast.error('Failed to delete user');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-zinc-900 rounded-xl text-white shadow-md">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-zinc-900">User Management</h1>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mt-0.5">Control operator permissions & nesting portal access</p>
          </div>
        </div>
      </div>

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Accounts', val: stats.total, color: 'text-zinc-900 bg-white border-zinc-200', desc: 'Registered members' },
          { label: 'Administrators', val: stats.admins, color: 'text-indigo-700 bg-indigo-50/50 border-indigo-100', desc: 'Full database control' },
          { label: 'Sales Executives', val: stats.sales, color: 'text-emerald-700 bg-emerald-50/50 border-emerald-100', desc: 'Pricing & calculations' },
          { label: 'Nesting Operators', val: stats.production, color: 'text-amber-700 bg-amber-50/50 border-amber-100', desc: 'Production layout cuts' }
        ].map((item, idx) => (
          <div key={idx} className={cn("p-4 rounded-2xl border shadow-sm transition-all duration-300 hover:shadow-md", item.color)}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block">{item.label}</span>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span className="text-2xl font-black">{item.val}</span>
              <span className="text-[10px] text-zinc-400 font-medium">{item.desc}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Hand: Create User Form */}
        <Card className="xl:col-span-1 border-zinc-200 shadow-sm h-fit rounded-2xl bg-white overflow-hidden">
          <CardHeader className="bg-zinc-50/50 border-b border-zinc-100 p-5">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-zinc-900">
              <UserPlus className="h-4 w-4 text-zinc-500" />
              Add New User
            </CardTitle>
            <CardDescription className="text-xs">Create a new staff login credential</CardDescription>
          </CardHeader>
          <form onSubmit={handleAddUser}>
            <CardContent className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-700">Username (Login ID)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-xs">@</span>
                  <Input 
                    value={formData.username} 
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    required
                    placeholder="e.g. johan_doe"
                    className="pl-7 bg-zinc-50/50 border-zinc-300 focus:bg-white text-xs h-9 font-medium"
                  />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-700">Full Name</Label>
                <Input 
                  value={formData.name} 
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g. Johan Doe"
                  className="bg-zinc-50/50 border-zinc-300 focus:bg-white text-xs h-9 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs font-bold text-zinc-700">Department</Label>
                    <button 
                      type="button" 
                      onClick={() => {
                        setShowCustomRole(!showCustomRole);
                        if (!showCustomRole) {
                          setFormData({ ...formData, role: '' as any });
                        } else {
                          setFormData({ ...formData, role: 'sales' as any });
                        }
                      }}
                      className="text-[9px] font-bold text-indigo-650 hover:underline cursor-pointer"
                    >
                      {showCustomRole ? 'Existing' : '+ Custom'}
                    </button>
                  </div>
                  {showCustomRole ? (
                    <Input
                      placeholder="e.g. Accounts"
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                      className="text-xs h-9 bg-zinc-50/50 font-bold border-zinc-300 focus:bg-white"
                      required
                    />
                  ) : (
                    <Select value={formData.role} onValueChange={(val: any) => setFormData({ ...formData, role: val })}>
                      <SelectTrigger className="border-zinc-300 text-xs h-9 bg-zinc-50/50">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        {departmentsList.map(dep => (
                          <SelectItem key={dep} value={dep} className="text-xs capitalize font-medium">
                            {dep === 'admin' ? 'Administrator' : dep === 'sales' ? 'Sales Person' : dep === 'production' ? 'Production Person' : dep}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-zinc-700">Permission</Label>
                  <Select value={formData.permission} onValueChange={(val: any) => setFormData({ ...formData, permission: val })}>
                    <SelectTrigger className="border-zinc-300 text-xs h-9 bg-zinc-50/50">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="write" className="text-xs font-medium">Read & Write</SelectItem>
                      <SelectItem value="read" className="text-xs font-medium">Read Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5 pt-2 border-t border-zinc-100">
                <Label className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 block mb-2">Allowed Modules & Pages</Label>
                <div className="grid grid-cols-1 gap-2 max-h-52 overflow-y-auto pr-1">
                  {PAGES_CONFIG.map(p => {
                    const isProductionCheckbox = p.id === 'production';
                    const isSelected = formData.role === 'admin' || selectedPages.includes(p.id);
                    return (
                      <label 
                        key={p.id} 
                        className={cn(
                          "flex items-start gap-2.5 p-2 rounded-xl border transition-all cursor-pointer select-none",
                          isSelected 
                            ? isProductionCheckbox 
                              ? "bg-amber-50/70 border-amber-200" 
                              : "bg-indigo-50/70 border-indigo-200"
                            : "bg-white border-zinc-200 hover:bg-zinc-50"
                        )}
                      >
                        <input 
                          type="checkbox"
                          checked={isSelected}
                          disabled={formData.role === 'admin'}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedPages([...selectedPages, p.id]);
                            } else {
                              setSelectedPages(selectedPages.filter(x => x !== p.id));
                            }
                          }}
                          className={cn(
                            "rounded w-3.5 h-3.5 mt-0.5 transition-colors",
                            isProductionCheckbox 
                              ? "text-amber-600 focus:ring-amber-500" 
                              : "text-indigo-650 focus:ring-indigo-500"
                          )}
                        />
                        <div className="flex flex-col">
                          <span className={cn(
                            "text-xs font-bold",
                            isSelected 
                              ? isProductionCheckbox ? "text-amber-900" : "text-indigo-950" 
                              : "text-zinc-800"
                          )}>
                            {p.label}
                          </span>
                          <span className="text-[9px] text-zinc-400 font-medium leading-tight mt-0.5">{p.desc}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {formData.role === 'admin' && (
                  <div className="flex items-center gap-1.5 mt-2 bg-indigo-50/30 border border-indigo-100 p-2 rounded-xl">
                    <ShieldCheck className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                    <p className="text-[9px] text-indigo-700 font-bold leading-tight">Administrators automatically have full access to all system tabs.</p>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-700">Password</Label>
                <div className="relative">
                  <Input 
                    type={showPassword ? "text" : "password"} 
                    value={formData.password} 
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    placeholder="••••••••"
                    className="bg-zinc-50/50 border-zinc-300 focus:bg-white text-xs h-9 font-medium pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {formData.role === 'admin' && (
                <div className="space-y-1.5 pt-2 border-t border-zinc-100 animate-in fade-in duration-200">
                  <Label className="text-xs font-bold text-zinc-700">Deletion Security Code (Optional)</Label>
                  <div className="relative">
                    <Input 
                      type={showPassword ? "text" : "password"} 
                      value={formData.deletionCode || ''} 
                      onChange={(e) => setFormData({ ...formData, deletionCode: e.target.value })}
                      placeholder="Set secondary password for deletions"
                      className="bg-zinc-50/50 border-zinc-300 focus:bg-white text-xs h-9 font-medium pr-10 font-mono"
                    />
                  </div>
                  <span className="text-[9px] text-zinc-400 block pl-0.5">Used as a double-security lock when deleting configuration items.</span>
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full mt-4 bg-zinc-950 hover:bg-zinc-800 text-white font-bold h-9 text-xs rounded-xl shadow-md cursor-pointer transition-all duration-200" 
                disabled={isAdding}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                {isAdding ? 'Creating...' : 'Create Account'}
              </Button>
            </CardContent>
          </form>
        </Card>

        {/* Right Hand: Users List Table */}
        <Card className="xl:col-span-2 border-zinc-200 shadow-sm rounded-2xl bg-white overflow-hidden">
          <CardHeader className="bg-zinc-50/50 border-b border-zinc-100 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2 text-zinc-900">
                <Users className="h-4 w-4 text-zinc-500" />
                Registered Operators
              </CardTitle>
              <CardDescription className="text-xs">Edit system credentials and allowed portal access</CardDescription>
            </div>
            
            {/* Search Filter Bar */}
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <Input 
                type="text" 
                placeholder="Search name or username..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8.5 bg-white border-zinc-300 h-8 text-xs w-full font-medium"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-zinc-50/30">
                  <TableRow className="hover:bg-transparent border-b border-zinc-100">
                    <TableHead className="font-bold text-zinc-600 text-xs py-3 pl-5">Operator Info</TableHead>
                    <TableHead className="font-bold text-zinc-600 text-xs py-3">Department</TableHead>
                    <TableHead className="font-bold text-zinc-600 text-xs py-3">Access Scope</TableHead>
                    <TableHead className="font-bold text-zinc-600 text-xs py-3 text-right pr-5">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-10 text-zinc-400 text-xs font-semibold">
                        No operators match your query
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((u) => (
                      <TableRow key={u.id} className="border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors">
                        <TableCell className="py-3 pl-5">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-700 font-bold border border-zinc-200">
                              {u.name?.charAt(0) || u.username?.charAt(0)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-bold text-zinc-900 text-xs">{u.name}</span>
                              <span className="text-[10px] text-zinc-500 font-medium">@{u.username}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider border",
                            u.role === 'admin' 
                              ? "bg-indigo-50 text-indigo-700 border-indigo-200" 
                              : u.role === 'production'
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-emerald-50 text-emerald-700 border-emerald-200"
                          )}>
                            {u.role === 'admin' ? (
                              <Shield className="h-3 w-3 shrink-0" />
                            ) : u.role === 'production' ? (
                              <Scissors className="h-3 w-3 shrink-0" />
                            ) : (
                              <UserIcon className="h-3 w-3 shrink-0" />
                            )}
                            {u.role}
                          </span>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex flex-col gap-1">
                            <span className={cn(
                              "w-fit text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border leading-none",
                              u.permission === 'read' 
                                ? "bg-red-50 text-red-600 border-red-150" 
                                : "bg-blue-50 text-blue-700 border-blue-200"
                            )}>
                              {u.permission === 'read' ? 'Read Only' : 'Read & Write'}
                            </span>
                            {/* Pages badges */}
                            <div className="flex flex-wrap gap-1 mt-1 max-w-[320px]">
                              {u.role === 'admin' ? (
                                <span className="text-[8px] font-bold bg-zinc-150 text-zinc-700 px-1.5 py-0.5 rounded">All Pages</span>
                              ) : (
                                u.allowedPages?.map(p => {
                                  const name = PAGES_CONFIG.find(x => x.id === p)?.label || p;
                                  return (
                                    <span key={p} className="text-[8px] font-bold bg-zinc-100 text-zinc-600 border border-zinc-200 px-1.5 py-0.5 rounded-md">
                                      {name}
                                    </span>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-right pr-5">
                          <div className="flex justify-end gap-1.5">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-zinc-500 hover:text-indigo-650 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-xl h-8 w-8 transition-colors cursor-pointer"
                              onClick={() => handleStartEdit(u)}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-zinc-500 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100 rounded-xl h-8 w-8 transition-colors cursor-pointer"
                              onClick={() => handleDeleteUser(u.id, u.username)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog Modal Overlay */}
      {editingUser && (
        <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
          <DialogContent className="sm:max-w-[480px] rounded-2xl bg-white border border-zinc-200 shadow-xl overflow-hidden p-0">
            <DialogHeader className="bg-zinc-50 p-5 border-b border-zinc-100">
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-zinc-950">
                <Sliders className="h-4 w-4 text-zinc-500" />
                Configure Operator Access
              </DialogTitle>
              <DialogDescription className="text-xs">
                Modify role permissions and allowed portal selections for @{editingUser.username}.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleEditUser}>
              <div className="space-y-4 p-5 max-h-[70vh] overflow-y-auto">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-zinc-700">Full Name</Label>
                  <Input 
                    value={editFormData.name} 
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    required
                    className="text-xs h-9 bg-zinc-50/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs font-bold text-zinc-700">Department</Label>
                      <button 
                        type="button" 
                        onClick={() => {
                          setShowEditCustomRole(!showEditCustomRole);
                          if (!showEditCustomRole) {
                            setEditFormData({ ...editFormData, role: '' as any });
                          } else {
                            setEditFormData({ ...editFormData, role: 'sales' as any });
                          }
                        }}
                        className="text-[9px] font-bold text-indigo-650 hover:underline cursor-pointer"
                      >
                        {showEditCustomRole ? 'Existing' : '+ Custom'}
                      </button>
                    </div>
                    {showEditCustomRole ? (
                      <Input
                        placeholder="e.g. Accounts"
                        value={editFormData.role}
                        onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value as any })}
                        className="text-xs h-9 bg-zinc-50/50 font-semibold border-zinc-300 focus:bg-white"
                        required
                      />
                    ) : (
                      <Select value={editFormData.role} onValueChange={(val: any) => setEditFormData({ ...editFormData, role: val })}>
                        <SelectTrigger className="border-zinc-300 text-xs h-9 bg-zinc-50/50">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {departmentsList.map(dep => (
                            <SelectItem key={dep} value={dep} className="text-xs capitalize font-medium">
                              {dep === 'admin' ? 'Administrator' : dep === 'sales' ? 'Sales Person' : dep === 'production' ? 'Production Person' : dep}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-zinc-700">Permission</Label>
                    <Select value={editFormData.permission} onValueChange={(val: any) => setEditFormData({ ...editFormData, permission: val })}>
                      <SelectTrigger className="border-zinc-300 text-xs h-9 bg-zinc-50/50">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="write" className="text-xs">Read & Write</SelectItem>
                        <SelectItem value="read" className="text-xs">Read Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-zinc-100">
                  <Label className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500 block mb-2">Allowed Modules & Pages</Label>
                  <div className="grid grid-cols-1 gap-2 max-h-52 overflow-y-auto pr-1">
                    {PAGES_CONFIG.map(p => {
                      const isProductionCheckbox = p.id === 'production';
                      const isSelected = editFormData.role === 'admin' || editFormData.allowedPages.includes(p.id);
                      return (
                        <label 
                          key={p.id} 
                          className={cn(
                            "flex items-start gap-2.5 p-2 rounded-xl border transition-all cursor-pointer select-none",
                            isSelected 
                              ? isProductionCheckbox 
                                ? "bg-amber-50/70 border-amber-200" 
                                : "bg-indigo-50/70 border-indigo-200"
                              : "bg-white border-zinc-200 hover:bg-zinc-50"
                          )}
                        >
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            disabled={editFormData.role === 'admin'}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setEditFormData({ ...editFormData, allowedPages: [...editFormData.allowedPages, p.id] });
                              } else {
                                setEditFormData({ ...editFormData, allowedPages: editFormData.allowedPages.filter(x => x !== p.id) });
                              }
                            }}
                            className={cn(
                              "rounded w-3.5 h-3.5 mt-0.5 transition-colors",
                              isProductionCheckbox 
                                ? "text-amber-600 focus:ring-amber-500" 
                                : "text-indigo-650 focus:ring-indigo-500"
                            )}
                          />
                          <div className="flex flex-col">
                            <span className={cn(
                              "text-xs font-bold",
                              isSelected 
                                ? isProductionCheckbox ? "text-amber-900" : "text-indigo-950" 
                                : "text-zinc-800"
                            )}>
                              {p.label}
                            </span>
                            <span className="text-[9px] text-zinc-400 font-medium leading-tight mt-0.5">{p.desc}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {editFormData.role === 'admin' && (
                    <div className="flex items-center gap-1.5 mt-2 bg-indigo-50/30 border border-indigo-100 p-2 rounded-xl">
                      <ShieldCheck className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                      <p className="text-[9px] text-indigo-700 font-bold leading-tight">Administrators automatically have full access to all system tabs.</p>
                    </div>
                  )}
                </div>

                {/* Change Password Block during edit */}
                <div className="space-y-1.5 pt-2 border-t border-zinc-100">
                  <Label className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                    <Key className="h-3.5 w-3.5 text-zinc-400" />
                    Reset Password (Optional)
                  </Label>
                  <div className="relative">
                    <Input 
                      type={showEditPassword ? "text" : "password"} 
                      placeholder="Enter new password to overwrite"
                      value={editFormData.newPassword}
                      onChange={(e) => setEditFormData({ ...editFormData, newPassword: e.target.value })}
                      className="text-xs h-9 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPassword(!showEditPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      {showEditPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <span className="text-[9px] text-zinc-400 block pl-0.5">Leave blank to keep current password unchanged.</span>
                </div>

                {editFormData.role === 'admin' && (
                  <div className="space-y-1.5 pt-2 border-t border-zinc-100">
                    <Label className="text-xs font-bold text-zinc-700 flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-zinc-400" />
                      Reset Deletion Security Code (Optional)
                    </Label>
                    <div className="relative">
                      <Input 
                        type={showEditPassword ? "text" : "password"} 
                        placeholder="Enter new deletion code to overwrite"
                        value={editFormData.newDeletionCode}
                        onChange={(e) => setEditFormData({ ...editFormData, newDeletionCode: e.target.value })}
                        className="text-xs h-9 pr-10 font-mono"
                      />
                    </div>
                    <span className="text-[9px] text-zinc-400 block pl-0.5">Leave blank to keep current deletion code unchanged.</span>
                  </div>
                )}
              </div>
              
              <DialogFooter className="bg-zinc-50 p-4 border-t border-zinc-100 flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={() => setEditingUser(null)} className="text-xs h-9 cursor-pointer">
                  Cancel
                </Button>
                <Button type="submit" className="bg-zinc-950 text-white hover:bg-zinc-800 text-xs h-9 font-bold px-4 rounded-xl shadow-md cursor-pointer">
                  Save Access Rights
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
