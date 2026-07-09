import React, { useState, useEffect } from 'react';
import { Client, Config, ProfitRange, Quotation } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button, buttonVariants } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { toast } from 'sonner';
import {
  UserPlus, Trash2, Upload, Download, Search, Edit2, Save, X,
  Phone, MapPin, Building2, TrendingUp, FileText, Clock,
  CheckCircle2, XCircle, ShoppingCart, ChevronRight, Package,
  RotateCcw, User
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

interface ClientRegistryProps {
  clients: Client[];
  config: Config;
  onRefresh?: () => void;
}

// ─── helpers ───────────────────────────────────────────────────────────────
const formatCurrency = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

const formatDate = (v: any) => {
  if (!v) return '—';
  const d = v?.toDate ? v.toDate() : new Date(v);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const statusBadge = (status: string) => {
  const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    pending_approval: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Clock className="h-3 w-3" /> },
    approved:         { label: 'Approved', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle2 className="h-3 w-3" /> },
    rejected:         { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200', icon: <XCircle className="h-3 w-3" /> },
    order:            { label: 'Order', className: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: <ShoppingCart className="h-3 w-3" /> },
    executed:         { label: 'Executed', className: 'bg-teal-50 text-teal-700 border-teal-200', icon: <CheckCircle2 className="h-3 w-3" /> },
    draft:            { label: 'Draft', className: 'bg-zinc-50 text-zinc-600 border-zinc-200', icon: <FileText className="h-3 w-3" /> },
  };
  const s = map[status] || map.draft;
  return (
    <Badge variant="outline" className={cn('gap-1 text-[10px] font-bold px-2 py-0.5', s.className)}>
      {s.icon}{s.label}
    </Badge>
  );
};

// ─── Client Detail Modal ────────────────────────────────────────────────────
interface ClientModalProps {
  client: Client | null;
  config: Config;
  onClose: () => void;
  onSaved: () => void;
}

const ClientModal: React.FC<ClientModalProps> = ({ client, config, onClose, onSaved }) => {
  const [tab, setTab] = useState<'overview' | 'history' | 'margins' | 'edit'>('overview');
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [loadingQ, setLoadingQ] = useState(false);

  // Edit state
  const [editName, setEditName]       = useState(client?.name || '');
  const [editCompany, setEditCompany] = useState(client?.company || '');
  const [editCity, setEditCity]       = useState(client?.city || '');
  const [editMobile, setEditMobile]   = useState(client?.mobile || '');
  const [editMargins, setEditMargins] = useState<Record<string, ProfitRange[]>>(client?.profitMargins || {});
  const [saving, setSaving] = useState(false);

  // Reset when client changes
  useEffect(() => {
    if (!client) return;
    setTab('overview');
    setEditName(client.name || '');
    setEditCompany(client.company || '');
    setEditCity(client.city || '');
    setEditMobile(client.mobile || '');
    setEditMargins(client.profitMargins || {});
    fetchQuotations(client.id);
  }, [client?.id]);

  const fetchQuotations = async (clientId: string) => {
    setLoadingQ(true);
    try {
      const res = await fetch(`/api/quotations?clientId=${clientId}`);
      if (res.ok) {
        const data = await res.json();
        // Filter by clientId on client side as a fallback
        const filtered = data.filter((q: Quotation) =>
          q.clientId === clientId || q.clientName?.toLowerCase() === client?.name?.toLowerCase()
        );
        setQuotations(filtered);
      }
    } catch {
      // silently fail — quotation history is not critical
    } finally {
      setLoadingQ(false);
    }
  };

  const handleSave = async () => {
    if (!client) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          company: editCompany,
          city: editCity,
          mobile: editMobile,
          profitMargins: editMargins,
        }),
      });
      if (!res.ok) throw new Error('Update failed');
      toast.success('Client updated successfully!');
      onSaved();
      setTab('overview');
    } catch {
      toast.error('Failed to update client');
    } finally {
      setSaving(false);
    }
  };

  if (!client) return null;

  const totalSpend = quotations
    .filter(q => q.status === 'approved' || q.status === 'order' || q.status === 'executed')
    .reduce((s, q) => s + (q.totalCost || 0), 0);
  const totalOrders = quotations.filter(q => q.status === 'order' || q.status === 'executed').length;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'history',  label: 'History',  icon: FileText },
    { id: 'margins',  label: 'Margins',  icon: TrendingUp },
  ] as const;

  return (
    <Dialog open={!!client} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl sm:max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* ── Header ── */}
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-zinc-150">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-zinc-850 to-zinc-650 flex items-center justify-center text-white text-lg font-black shrink-0 shadow-md">
                {client.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-xl font-black text-zinc-900 leading-tight whitespace-normal break-words pr-4">
                  {client.name}
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-zinc-550 text-xs font-semibold">
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3.5 w-3.5 text-zinc-400" />{client.company}
                  </span>
                  <span className="text-zinc-300">•</span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-zinc-400" />{client.city}
                  </span>
                  {client.mobile && (
                    <>
                      <span className="text-zinc-300">•</span>
                      <span className="flex items-center gap-1 font-mono">
                        <Phone className="h-3.5 w-3.5 text-zinc-400" />{client.mobile}
                      </span>
                    </>
                  )}
                </DialogDescription>
              </div>
            </div>
            {/* Quick stats & Actions */}
            <div className="flex items-center gap-3 self-start md:self-center shrink-0">
              <div className="text-center bg-zinc-50 rounded-xl px-4 py-2 border border-zinc-150">
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Orders</p>
                <p className="text-lg font-black text-zinc-800">{totalOrders}</p>
              </div>
              <div className="text-center bg-emerald-50/55 rounded-xl px-4 py-2 border border-emerald-150">
                <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Total Spend</p>
                <p className="text-base font-black text-emerald-700">{formatCurrency(totalSpend)}</p>
              </div>
              {tab !== 'edit' ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTab('edit')}
                  className="h-10 gap-1.5 px-4 border-zinc-350 hover:bg-zinc-50 hover:text-zinc-950 font-bold text-xs rounded-xl shadow-xs transition-all active:scale-[0.98]"
                >
                  <Edit2 className="h-3.5 w-3.5 text-zinc-500" /> Edit Client
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTab('overview')}
                  className="h-10 gap-1.5 px-4 border-zinc-350 hover:bg-zinc-50 hover:text-zinc-950 font-bold text-xs rounded-xl shadow-xs transition-all active:scale-[0.98]"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-zinc-500" /> View Profile
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* ── Tabs ── */}
        <div className="shrink-0 flex gap-1 px-6 pt-3 bg-white border-b border-zinc-100">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-all',
                tab === t.id
                  ? 'border-zinc-900 text-zinc-900 bg-zinc-50'
                  : 'border-transparent text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50'
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
              {t.id === 'history' && quotations.length > 0 && (
                <span className="ml-0.5 bg-zinc-200 text-zinc-600 text-[9px] font-black px-1.5 py-0.5 rounded-full">
                  {quotations.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab Content ── */}
        <div className="flex-1 overflow-y-auto">

          {/* OVERVIEW TAB */}
          {tab === 'overview' && (
            <div className="p-6 space-y-5">
              {/* Contact Info Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { icon: User, label: 'Full Name', value: client.name },
                  { icon: Building2, label: 'Company', value: client.company },
                  { icon: MapPin, label: 'City', value: client.city },
                  { icon: Phone, label: 'Mobile', value: client.mobile || '—' },
                ].map(item => (
                  <div key={item.label} className="bg-zinc-50 rounded-xl p-4 border border-zinc-150 flex items-start gap-3">
                    <div className="p-2 bg-white rounded-lg border border-zinc-200/50 shadow-sm shrink-0">
                      <item.icon className="h-4 w-4 text-zinc-500" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-wider text-zinc-405 block mb-0.5">{item.label}</span>
                      <p className="text-sm font-bold text-zinc-800 whitespace-normal break-words">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>


              {/* Profit Margins Summary */}
              <div className="bg-zinc-50 rounded-xl border border-zinc-100 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-zinc-500" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-zinc-600">Profit Margins by Category</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(Array.isArray(config?.beltTypes) ? config.beltTypes : []).map(type => {
                    const ranges = client.profitMargins?.[type.name] || [];
                    const firstMargin = ranges[0]?.margin;
                    return (
                      <div key={type.id} className="bg-white rounded-lg border border-zinc-200 px-3 py-2 flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-700">{type.name}</span>
                        <span className="text-xs font-black text-emerald-700">{firstMargin ?? '—'}%</span>
                        {ranges.length > 1 && (
                          <span className="text-[9px] text-zinc-400">+{ranges.length - 1} ranges</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Activity */}
              <div className="bg-zinc-50 rounded-xl border border-zinc-100 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-zinc-500" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-zinc-600">Recent Quotations</h3>
                </div>
                {loadingQ ? (
                  <p className="text-xs text-zinc-400 italic">Loading history...</p>
                ) : quotations.length === 0 ? (
                  <p className="text-xs text-zinc-400 italic">No quotations found for this client.</p>
                ) : (
                  <div className="space-y-1">
                    {quotations.slice(0, 4).map(q => (
                      <div key={q.id} className="flex items-center justify-between bg-white rounded-lg border border-zinc-100 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-zinc-500">#{q.orderNumber || q.id.slice(-4)}</span>
                          <span className="text-xs text-zinc-700">{q.beltType} {q.beltStyle ? `(${q.beltStyle})` : ''}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-zinc-900">{formatCurrency(q.totalCost)}</span>
                          {statusBadge(q.status)}
                        </div>
                      </div>
                    ))}
                    {quotations.length > 4 && (
                      <button
                        onClick={() => setTab('history')}
                        className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1 mt-1"
                      >
                        View all {quotations.length} records <ChevronRight className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* HISTORY TAB */}
          {tab === 'history' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-zinc-800">Full Quotation & Order History</h3>
                <span className="text-xs text-zinc-400">{quotations.length} records</span>
              </div>
              {loadingQ ? (
                <p className="text-xs text-zinc-400 italic p-4">Loading...</p>
              ) : quotations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                  <Package className="h-10 w-10 mb-3 opacity-30" />
                  <p className="text-sm font-medium">No quotations or orders found</p>
                  <p className="text-xs mt-1">This client has no history yet.</p>
                </div>
              ) : (
                <div className="border border-zinc-200 rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader className="bg-zinc-50/80">
                      <TableRow>
                        <TableHead className="text-xs font-black text-zinc-500 py-3">Order ID</TableHead>
                        <TableHead className="text-xs font-black text-zinc-500 py-3">Date</TableHead>
                        <TableHead className="text-xs font-black text-zinc-500 py-3">Belt Details</TableHead>
                        <TableHead className="text-xs font-black text-zinc-500 py-3">Dimensions</TableHead>
                        <TableHead className="text-xs font-black text-zinc-500 py-3 text-right">Amount</TableHead>
                        <TableHead className="text-xs font-black text-zinc-500 py-3">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotations.map(q => (
                        <TableRow key={q.id} className="hover:bg-zinc-50/50 transition-colors">
                          <TableCell className="font-mono text-xs font-bold text-zinc-600 py-3">
                            #{(q as any).orderNumber || q.id.slice(-6)}
                          </TableCell>
                          <TableCell className="text-xs text-zinc-500 py-3">{formatDate(q.createdAt)}</TableCell>
                          <TableCell className="py-3">
                            <div className="text-xs font-semibold text-zinc-800">{q.beltType}</div>
                            {q.beltStyle && <div className="text-[10px] text-zinc-400">{q.beltStyle}</div>}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-zinc-600 py-3">
                            {q.dimensions.length}{q.dimensions.lengthUnit || q.dimensions.unit || 'mm'} × {q.dimensions.width}{q.dimensions.widthUnit || q.dimensions.unit || 'mm'}
                          </TableCell>
                          <TableCell className="text-right text-xs font-black text-zinc-900 py-3">
                            {formatCurrency(q.totalCost)}
                          </TableCell>
                          <TableCell className="py-3">{statusBadge(q.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* MARGINS TAB */}
          {tab === 'margins' && (
            <div className="p-6 space-y-5">
              <p className="text-xs text-zinc-500 italic">
                Profit margin ranges define what % markup is applied based on belt length (in meters). Click "Edit" tab to change them.
              </p>
              {(Array.isArray(config?.beltTypes) ? config.beltTypes : []).map(type => {
                const ranges = client.profitMargins?.[type.name] || [];
                return (
                  <div key={type.id} className="bg-zinc-50 rounded-xl border border-zinc-100 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-zinc-700">{type.name}</span>
                      {type.gst !== undefined && (
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5 border border-emerald-100">GST {type.gst}%</span>
                      )}
                    </div>
                    {ranges.length === 0 ? (
                      <p className="text-xs text-zinc-400 italic">No margins configured.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {ranges.map((r, i) => (
                          <div key={i} className="flex items-center gap-3 bg-white rounded-lg border border-zinc-200 px-4 py-2.5">
                            <span className="text-xs text-zinc-500 font-mono">
                              {r.minLength}m — {r.maxLength != null ? `${r.maxLength}m` : '∞'}
                            </span>
                            <ChevronRight className="h-3 w-3 text-zinc-300" />
                            <span className="text-sm font-black text-emerald-700">{r.margin}%</span>
                            <span className="text-[10px] text-zinc-400">profit</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* EDIT TAB */}
          {tab === 'edit' && (
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="bg-zinc-50 rounded-xl border border-zinc-150 p-5 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-600">Basic Information</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-zinc-650">Client Name *</Label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} className="h-10 text-sm border-zinc-300 focus-visible:ring-zinc-400 font-semibold" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-zinc-655">Company *</Label>
                    <Input value={editCompany} onChange={e => setEditCompany(e.target.value)} className="h-10 text-sm border-zinc-300 focus-visible:ring-zinc-400 font-semibold" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-zinc-655">City *</Label>
                    <Input value={editCity} onChange={e => setEditCity(e.target.value)} className="h-10 text-sm border-zinc-300 focus-visible:ring-zinc-400 font-semibold" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-zinc-655">Mobile Number</Label>
                    <Input value={editMobile} onChange={e => setEditMobile(e.target.value)} className="h-10 text-sm font-mono border-zinc-300 focus-visible:ring-zinc-400" placeholder="e.g. 9876543210" />
                  </div>
                </div>
              </div>

              {/* Profit Margins */}
              <div className="bg-zinc-50 rounded-xl border border-zinc-150 p-5 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-600">Profit Margins by Category</h3>
                <div className="space-y-5">
                  {(Array.isArray(config?.beltTypes) ? config.beltTypes : []).map(type => (
                    <div key={type.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider">{type.name}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-[10px] text-blue-600 hover:text-blue-800"
                          onClick={() => {
                            const current = Array.isArray(editMargins[type.name]) ? editMargins[type.name] : [];
                            const lastMax = current.length > 0 ? current[current.length - 1].maxLength : 0;
                            setEditMargins({ ...editMargins, [type.name]: [...current, { minLength: lastMax || 0, maxLength: null, margin: 20 }] });
                          }}
                        >
                          + Add Range
                        </Button>
                      </div>
                      <div className="space-y-2.5">
                        {(Array.isArray(editMargins[type.name]) ? editMargins[type.name] : []).map((range, idx) => (
                          <div key={idx} className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-zinc-200 p-3 shadow-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-zinc-550">From</span>
                              <div className="relative">
                                <Input
                                  type="number"
                                  className="h-8 text-xs w-20 pr-6 font-semibold text-zinc-800 border-zinc-300"
                                  value={range.minLength}
                                  onChange={e => {
                                    const r = [...editMargins[type.name]];
                                    r[idx] = { ...r[idx], minLength: parseFloat(e.target.value) || 0 };
                                    setEditMargins({ ...editMargins, [type.name]: r });
                                  }}
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-zinc-400 font-bold">m</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-zinc-550">To</span>
                              <div className="relative">
                                <Input
                                  type="number"
                                  className="h-8 text-xs w-20 pr-6 font-semibold text-zinc-800 border-zinc-300"
                                  value={range.maxLength || ''}
                                  placeholder="∞"
                                  onChange={e => {
                                    const r = [...editMargins[type.name]];
                                    r[idx] = { ...r[idx], maxLength: e.target.value ? parseFloat(e.target.value) : null };
                                    setEditMargins({ ...editMargins, [type.name]: r });
                                  }}
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-zinc-400 font-bold">m</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 ml-0 sm:ml-auto">
                              <span className="text-xs font-bold text-zinc-550">Margin</span>
                              <div className="relative">
                                <Input
                                  type="number"
                                  className="h-8 text-xs w-18 pr-6 font-black text-emerald-700 border-zinc-300"
                                  value={range.margin}
                                  onChange={e => {
                                    const r = [...editMargins[type.name]];
                                    r[idx] = { ...r[idx], margin: parseFloat(e.target.value) || 0 };
                                    setEditMargins({ ...editMargins, [type.name]: r });
                                  }}
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-emerald-600 font-extrabold">%</span>
                              </div>
                            </div>

                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                              onClick={() => {
                                const r = [...editMargins[type.name]];
                                r.splice(idx, 1);
                                setEditMargins({ ...editMargins, [type.name]: r });
                              }}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        {(!editMargins[type.name] || editMargins[type.name].length === 0) && (
                          <p className="text-[10px] text-zinc-400 italic px-1">No ranges. Click "+ Add Range" to add one.</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Save Button */}
              <div className="flex gap-3 justify-end pt-2 border-t border-zinc-150">
                <Button variant="outline" onClick={() => setTab('overview')} className="gap-1.5 text-xs h-9">
                  <RotateCcw className="h-3.5 w-3.5" /> Cancel
                </Button>
                <Button onClick={handleSave} disabled={saving} className="gap-1.5 text-xs h-9 bg-zinc-900 hover:bg-zinc-800 text-white">
                  <Save className="h-3.5 w-3.5" /> {saving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────
export const ClientRegistry: React.FC<ClientRegistryProps> = ({ clients, config, onRefresh }) => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ name: '', company: '', city: '', mobile: '' });
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    try {
      const defaultRanges: ProfitRange[] = [{ minLength: 0, maxLength: null, margin: 20 }];
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          company: formData.company,
          city: formData.city,
          mobile: formData.mobile,
          profitMargins: (Array.isArray(config?.beltTypes) ? config.beltTypes : []).reduce(
            (acc, type) => ({ ...acc, [type.name]: defaultRanges }),
            {} as Record<string, ProfitRange[]>
          ),
        }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Add failed');
      }
      toast.success('Client added successfully!');
      setFormData({ name: '', company: '', city: '', mobile: '' });
      onRefresh?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add client');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteClient = async (clientId: string, name: string) => {
    if (!confirm(`Delete client "${name}"? This action cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/clients/${clientId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Client deleted');
      if (selectedClient?.id === clientId) setSelectedClient(null);
      onRefresh?.();
    } catch {
      toast.error('Failed to delete client');
    }
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result.map(val => val.replace(/^"|"$/g, '').trim());
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      let count = 0;
      let errors = 0;
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < 3) continue;
        try {
          const res = await fetch('/api/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: values[0] || '',
              company: values[1] || '',
              city: values[2] || '',
              mobile: values[3] || '',
              address: values[4] || '',
              gstin: values[5] || '',
              profitMargins: (Array.isArray(config?.beltTypes) ? config.beltTypes : []).reduce(
                (acc, type) => ({ ...acc, [type.name]: [{ minLength: 0, maxLength: null, margin: parseFloat(values[6]) || 20 }] }),
                {} as Record<string, ProfitRange[]>
              ),
            }),
          });
          if (res.ok) {
            count++;
          } else {
            errors++;
          }
        } catch { 
          errors++;
        }
      }
      if (errors > 0) {
        toast.success(`Uploaded ${count} clients. ${errors} rows skipped/failed (e.g. duplicate mobile).`);
      } else {
        toast.success(`Uploaded all ${count} clients successfully!`);
      }
      onRefresh?.();
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.company.toLowerCase().includes(search.toLowerCase()) ||
    c.city.toLowerCase().includes(search.toLowerCase()) ||
    (c.mobile || '').includes(search)
  );

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-zinc-900 rounded-lg text-white">
            <UserPlus className="h-4 w-4" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">Client Registry</h1>
          <span className="ml-1 text-xs font-bold text-zinc-400 bg-zinc-100 rounded-full px-2 py-0.5">{clients.length}</span>
        </div>
        <div className="flex gap-2">
          <label className={cn(buttonVariants({ variant: 'outline' }), 'gap-1.5 cursor-pointer h-8 text-xs px-3 flex items-center shadow-sm')}>
            <Upload className="h-3.5 w-3.5" />
            Bulk Upload
            <input type="file" accept=".csv" className="hidden" onChange={handleBulkUpload} />
          </label>
          <Button variant="outline" className="gap-1.5 h-8 text-xs px-3 shadow-sm" onClick={() => {
            const headers = 'Name,Company,City,Mobile,Address,GSTIN,DefaultProfit';
            const sample1 = 'SUN ENGINEERING WORKS,SUN ENGINEERING WORKS,SURAT,7046475153,"Plot 24, Industrial Area",24AAAAA0000A1Z,20';
            const sample2 = 'Nilesh soni,ptb,surat,9879022753,Surat,24BBBBB1111B2Z2,20';
            const csv = `${headers}\n${sample1}\n${sample2}`;
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'clients_template.csv'; a.click();
          }}>
            <Download className="h-3.5 w-3.5" /> Template
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Add Client Form */}
        <Card className="lg:col-span-1 border-zinc-200 shadow-sm h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black text-zinc-800">Add New Client</CardTitle>
          </CardHeader>
          <form onSubmit={handleAddClient}>
            <CardContent className="space-y-3 pt-0">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-600">Client Name <span className="text-rose-500">*</span></Label>
                <Input className="h-9 text-sm" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-600">Company <span className="text-rose-500">*</span></Label>
                <Input className="h-9 text-sm" value={formData.company} onChange={e => setFormData({ ...formData, company: e.target.value })} required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-600">Mobile Number</Label>
                <Input className="h-9 text-sm font-mono" value={formData.mobile} onChange={e => setFormData({ ...formData, mobile: e.target.value })} placeholder="9876543210" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-600">City <span className="text-rose-500">*</span></Label>
                <Input className="h-9 text-sm" value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} required />
              </div>
              <p className="text-[10px] text-zinc-400 italic">Default 20% profit margin. Customize after adding.</p>
              <Button type="submit" className="w-full h-9 text-xs gap-1.5" disabled={isAdding}>
                <UserPlus className="h-3.5 w-3.5" />
                {isAdding ? 'Adding...' : 'Add Client'}
              </Button>
            </CardContent>
          </form>
        </Card>

        {/* Client List */}
        <Card className="lg:col-span-3 border-zinc-200 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm font-black text-zinc-800">
                All Clients
                <span className="ml-2 text-zinc-400 font-bold">{filteredClients.length}</span>
              </CardTitle>
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <Input
                  placeholder="Search by name, city..."
                  className="pl-9 h-8 text-xs"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {filteredClients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                <User className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-medium">{search ? 'No clients match your search' : 'No clients yet'}</p>
                <p className="text-xs mt-1">{search ? 'Try a different search term' : 'Add your first client using the form on the left'}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredClients.map(c => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedClient(c)}
                    className="group flex items-center gap-4 p-3.5 rounded-xl border border-transparent hover:border-zinc-200 hover:bg-zinc-50/70 cursor-pointer transition-all duration-150"
                  >
                    {/* Avatar */}
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-zinc-200 to-zinc-100 flex items-center justify-center text-zinc-700 text-sm font-black shrink-0">
                      {c.name.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-zinc-900 truncate">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-zinc-500 flex items-center gap-1">
                          <Building2 className="h-3 w-3" />{c.company}
                        </span>
                        <span className="text-xs text-zinc-400 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />{c.city}
                        </span>
                        {c.mobile && (
                          <span className="text-xs text-zinc-400 flex items-center gap-1">
                            <Phone className="h-3 w-3" />{c.mobile}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Margin badges */}
                    <div className="hidden sm:flex items-center gap-1 shrink-0">
                      {(Array.isArray(config?.beltTypes) ? config.beltTypes : []).slice(0, 3).map(type => {
                        const m = c.profitMargins?.[type.name]?.[0]?.margin;
                        return m !== undefined ? (
                          <span key={type.id} className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5">
                            {type.name} {m}%
                          </span>
                        ) : null;
                      })}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-zinc-400 hover:text-blue-600"
                        onClick={e => { e.stopPropagation(); setSelectedClient(c); }}
                        title="View Details"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      {user?.role === 'admin' && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-zinc-400 hover:text-red-500"
                          onClick={e => { e.stopPropagation(); handleDeleteClient(c.id, c.name); }}
                          title="Delete Client"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Client Detail Modal */}
      <ClientModal
        client={selectedClient}
        config={config}
        onClose={() => setSelectedClient(null)}
        onSaved={() => { onRefresh?.(); setSelectedClient(null); }}
      />
    </div>
  );
};
