import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  CheckCircle2, 
  Clock, 
  ArrowUpRight, 
  Plus, 
  Users, 
  Settings,
  FileText,
  DollarSign,
  Scissors,
  ArrowRight,
  AlertCircle,
  Check,
  X
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { formatCurrency, cn } from '../lib/utils';
import { Client, Config, Quotation } from '../types';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface DashboardHomeProps {
  config: Config;
  clients: Client[];
  onNavigate: (tab: string) => void;
}

interface EnhancedQuotation extends Quotation {
  orderNumber?: number;
}

export const DashboardHome: React.FC<DashboardHomeProps> = ({ config, clients, onNavigate }) => {
  const { user } = useAuth();
  const [quotations, setQuotations] = useState<EnhancedQuotation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [marginRequests, setMarginRequests] = useState<any[]>([]);
  const [marginInputs, setMarginInputs] = useState<Record<string, string>>({});
  const [isProcessingRequest, setIsProcessingRequest] = useState<Record<string, boolean>>({});

  // States for the Pending Review Popup Dialog
  const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
  const [selectedQuoteForAction, setSelectedQuoteForAction] = useState<EnhancedQuotation | null>(null);
  const [approvedDiscountInput, setApprovedDiscountInput] = useState('');
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [quoteActionType, setQuoteActionType] = useState<'approve' | 'reject' | null>(null);
  const [isProcessingQuote, setIsProcessingQuote] = useState(false);

  // State for individual Margin Request Detail Dialog
  const [selectedMarginReq, setSelectedMarginReq] = useState<any | null>(null);
  const [isMarginDetailOpen, setIsMarginDetailOpen] = useState(false);

  const fetchRequests = async () => {
    if (user?.role !== 'admin') return;
    try {
      const res = await fetch('/api/margin-requests');
      if (res.ok) {
        const data = await res.json();
        setMarginRequests(data.filter((r: any) => r.status === 'pending'));
      }
    } catch (err) {
      console.error('Failed to fetch margin requests', err);
    }
  };

  useEffect(() => {
    fetchRequests();
    const interval = setInterval(fetchRequests, 4000);
    return () => clearInterval(interval);
  }, [user?.role]);

  const handleApproveMargin = async (reqId: string) => {
    const val = marginInputs[reqId];
    if (!val || isNaN(parseFloat(val)) || parseFloat(val) < 0) {
      toast.error('Please enter a valid margin percentage');
      return;
    }
    setIsProcessingRequest(prev => ({ ...prev, [reqId]: true }));
    try {
      const res = await fetch(`/api/margin-requests/${reqId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ margin: parseFloat(val) })
      });
      if (res.ok) {
        toast.success('Margin approved and configured successfully!');
        setMarginInputs(prev => {
          const updated = { ...prev };
          delete updated[reqId];
          return updated;
        });
        fetchRequests();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Failed to approve request');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to approve request');
    } finally {
      setIsProcessingRequest(prev => ({ ...prev, [reqId]: false }));
    }
  };

  const handleRejectMargin = async (reqId: string) => {
    if (!confirm('Are you sure you want to reject this request?')) return;
    setIsProcessingRequest(prev => ({ ...prev, [reqId]: true }));
    try {
      const res = await fetch(`/api/margin-requests/${reqId}/reject`, {
        method: 'POST'
      });
      if (res.ok) {
        toast.success('Margin request rejected');
        fetchRequests();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Failed to reject request');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to reject request');
    } finally {
      setIsProcessingRequest(prev => ({ ...prev, [reqId]: false }));
    }
  };

  const handleApproveQuotation = async (quote: EnhancedQuotation) => {
    const discountVal = parseFloat(approvedDiscountInput) || 0;
    // Calculate new total cost based on the approved discount
    const newTotal = quote.totalCost + (quote.salesMarkup || 0) - discountVal;

    setIsProcessingQuote(true);
    try {
      const res = await fetch(`/api/quotations/${quote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'approved',
          totalCost: newTotal,
          discountRequested: discountVal
        })
      });

      if (res.ok) {
        toast.success('Quotation discount approved and status updated');
        setSelectedQuoteForAction(null);
        setQuoteActionType(null);
        setApprovedDiscountInput('');
        
        // Refresh quotations on dashboard
        const quotesRes = await fetch('/api/quotations');
        if (quotesRes.ok) {
          const quotesData = await quotesRes.json();
          const sortedChronically = [...quotesData].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          const withOrderNumbers = sortedChronically.map((q: any, index: number) => ({
            ...q,
            orderNumber: 100 + index
          }));
          withOrderNumbers.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setQuotations(withOrderNumbers);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Failed to approve quotation');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to approve quotation');
    } finally {
      setIsProcessingQuote(false);
    }
  };

  const handleRejectQuotation = async (quote: EnhancedQuotation) => {
    setIsProcessingQuote(true);
    try {
      const res = await fetch(`/api/quotations/${quote.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'rejected',
          rejectionReason: rejectionReasonInput
        })
      });

      if (res.ok) {
        toast.success('Quotation discount rejected and status updated');
        setSelectedQuoteForAction(null);
        setQuoteActionType(null);
        setRejectionReasonInput('');
        
        // Refresh quotations on dashboard
        const quotesRes = await fetch('/api/quotations');
        if (quotesRes.ok) {
          const quotesData = await quotesRes.json();
          const sortedChronically = [...quotesData].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          const withOrderNumbers = sortedChronically.map((q: any, index: number) => ({
            ...q,
            orderNumber: 100 + index
          }));
          withOrderNumbers.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setQuotations(withOrderNumbers);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Failed to reject quotation');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to reject quotation');
    } finally {
      setIsProcessingQuote(false);
    }
  };

  useEffect(() => {
    const fetchQuotations = async () => {
      try {
        const res = await fetch('/api/quotations');
        if (res.ok) {
          const data = await res.json();
          
          // Sort chronologically ascending to assign permanent order numbers starting at 100
          const sortedChronologically = [...data].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          
          const withOrderNumbers = sortedChronologically.map((q: any, index: number) => ({
            ...q,
            orderNumber: 100 + index
          }));
          
          setQuotations(withOrderNumbers);
        }
      } catch (err) {
        console.error('Failed to fetch quotations for dashboard', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchQuotations();
    const interval = setInterval(fetchQuotations, 4000);
    return () => clearInterval(interval);
  }, []);

  // Compute metrics
  const totalQuotes = quotations.length;
  const approvedQuotes = quotations.filter(q => q.status === 'approved');
  const pendingQuotes = quotations.filter(q => q.status === 'pending_approval');
  
  const totalRevenue = approvedQuotes.reduce((sum, q) => sum + (q.totalCost || 0), 0);
  const activeClientsCount = clients.length;

  // Process data for sales chart (last 6 months)
  const salesByMonth: Record<string, number> = {};
  quotations.forEach(q => {
    if (q.createdAt) {
      const date = new Date(q.createdAt);
      const monthYear = date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      salesByMonth[monthYear] = (salesByMonth[monthYear] || 0) + (q.totalCost || 0);
    }
  });

  const chartData = Object.entries(salesByMonth)
    .map(([name, value]) => ({ name, value }))
    .slice(-6); // Keep last 6 months

  // Process data for status chart
  const statusCounts = {
    Approved: approvedQuotes.length,
    Pending: pendingQuotes.length,
    Draft: quotations.filter(q => q.status === 'draft').length,
    Rejected: quotations.filter(q => q.status === 'rejected').length
  };

  const pieData = Object.entries(statusCounts)
    .filter(([_, val]) => val > 0)
    .map(([name, value]) => ({ name, value }));

  const COLORS = ['#10b981', '#f59e0b', '#71717a', '#ef4444'];

  const recentQuotes = [...quotations]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const formatOrderDate = (dateVal: any) => {
    if (!dateVal) return '';
    const date = new Date(dateVal);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 rounded-lg text-[#1e40af]">
            <TrendingUp className="h-4 w-4" />
          </div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#1e3a8a]">Dashboard</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => onNavigate('calculator')} className="bg-[#1e40af] hover:bg-[#1d4ed8] text-white gap-1.5 shadow-md h-8 text-xs px-3 rounded-[6px] cursor-pointer">
            <Plus className="h-3.5 w-3.5" /> Create Quotation
          </Button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-blue-100/60 shadow-[0_4px_12px_rgba(30,58,138,0.04)] rounded-[14px] hover:shadow-md transition-all duration-200 bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-550">Total Revenue</CardTitle>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-[#1e3a8a]">{formatCurrency(totalRevenue)}</div>
            <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
              <span className="text-emerald-600 font-bold flex items-center">
                <ArrowUpRight className="h-3 w-3" /> Approved
              </span>
              quotations volume
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-100/60 shadow-[0_4px_12px_rgba(30,58,138,0.04)] rounded-[14px] hover:shadow-md transition-all duration-200 bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-550">Total Quotes</CardTitle>
            <div className="p-1.5 bg-blue-50 text-[#1e40af] rounded-lg">
              <FileText className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-[#1e3a8a]">{totalQuotes}</div>
            <p className="text-[10px] text-zinc-500 mt-1">
              All generated quotations in system
            </p>
          </CardContent>
        </Card>

        <Card 
          onClick={() => user?.role === 'admin' && setIsReviewDialogOpen(true)}
          className={cn(
            "border-blue-100/60 shadow-[0_4px_12px_rgba(30,58,138,0.04)] rounded-[14px] hover:shadow-md transition-all duration-200 bg-white",
            user?.role === 'admin' && "cursor-pointer active:scale-[0.98] hover:border-amber-200"
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-550">Pending Review</CardTitle>
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
              <Clock className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-[#1e3a8a]">{pendingQuotes.length + marginRequests.length}</div>
            <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
              Requires admin approval ({pendingQuotes.length} quotes, {marginRequests.length} margins)
            </p>
          </CardContent>
        </Card>

        <Card className="border-blue-100/60 shadow-[0_4px_12px_rgba(30,58,138,0.04)] rounded-[14px] hover:shadow-md transition-all duration-200 bg-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-blue-550">Active Clients</CardTitle>
            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-[#1e3a8a]">{activeClientsCount}</div>
            <p className="text-[10px] text-zinc-500 mt-1">
              Clients registered in system
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pending Margin Requests for Admin — Clickable Summary Cards */}
      {user?.role === 'admin' && marginRequests.length > 0 && (
        <div className="space-y-3 animate-in fade-in duration-300">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
            <h2 className="text-sm font-black uppercase tracking-wider text-[#1e3a8a]">Pending Margin Requests ({marginRequests.length})</h2>
            <span className="text-[10px] text-zinc-400 italic font-medium">Click a card to review &amp; set margin</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {marginRequests.map((req) => (
              <Card
                key={req.id}
                onClick={() => { setSelectedMarginReq(req); setIsMarginDetailOpen(true); }}
                className="border-amber-200/70 shadow-[0_4px_12px_rgba(245,158,11,0.05)] bg-amber-50/30 rounded-[14px] overflow-hidden cursor-pointer hover:shadow-[0_6px_20px_rgba(245,158,11,0.12)] hover:border-amber-300 hover:bg-amber-50/60 transition-all duration-200 active:scale-[0.98]"
              >
                <CardHeader className="pb-2 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] font-black uppercase tracking-widest text-amber-600 bg-amber-100/60 px-2 py-0.5 rounded border border-amber-200/60">Pending Margin Setup</span>
                      <CardTitle className="text-sm font-bold text-zinc-900 mt-2 truncate">{req.clientName}</CardTitle>
                      <CardDescription className="text-[11px] font-medium text-zinc-500 mt-0.5">
                        {req.beltType} &bull; {req.beltStyle}
                      </CardDescription>
                    </div>
                    <div className="p-2 bg-amber-100/60 rounded-lg shrink-0">
                      <ArrowRight className="h-3.5 w-3.5 text-amber-600" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-4">
                  {req.length && req.width && (
                    <div className="inline-flex items-center gap-1 bg-blue-50 border border-blue-100 text-[#1e40af] font-mono text-[10px] font-bold px-2 py-0.5 rounded mb-2">
                      {req.length}{req.lengthUnit || 'mm'} × {req.width}{req.widthUnit || 'mm'}
                    </div>
                  )}
                  <div className="text-[10px] text-zinc-400 flex items-center gap-1 mt-1">
                    <span>By <strong className="text-zinc-600">{req.requestedByName}</strong></span>
                    <span>·</span>
                    <span>{new Date(req.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Charts Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 border-blue-100/60 shadow-[0_4px_12px_rgba(30,58,138,0.04)] rounded-[14px] bg-white">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-50 rounded-lg text-[#1e40af]">
                <TrendingUp className="h-3.5 w-3.5" />
              </div>
              <div>
                <CardTitle className="text-base text-[#1e3a8a]">Sales Performance Trend</CardTitle>
                <CardDescription className="text-xs">Quotation amounts summed by month</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-80 pt-4">
            {chartData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-zinc-400 text-sm italic">
                No monthly sales history available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1e40af" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#1e40af" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `₹${v}`} />
                  <Tooltip 
                    formatter={(v) => [formatCurrency(Number(v)), 'Volume']} 
                    contentStyle={{ borderRadius: '12px', border: '1px solid #dbeafe', fontSize: '12px' }} 
                  />
                  <Area type="monotone" dataKey="value" stroke="#1e40af" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1 border-blue-100/60 shadow-[0_4px_12px_rgba(30,58,138,0.04)] rounded-[14px] bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-[#1e3a8a]">Quotation Distribution</CardTitle>
            <CardDescription className="text-xs">By lifecycle/approval status</CardDescription>
          </CardHeader>
          <CardContent className="h-80 flex flex-col items-center justify-center pt-4">
            {pieData.length === 0 ? (
              <div className="text-zinc-400 text-sm italic">No data available</div>
            ) : (
              <>
                <div className="w-full h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => [v, 'Quotation(s)']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  {pieData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-1.5">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                      <span>{entry.name} ({entry.value})</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity and Quick Actions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Quotes */}
        <Card className="lg:col-span-2 border-blue-100/60 shadow-[0_4px_12px_rgba(30,58,138,0.04)] rounded-[14px] bg-white overflow-hidden">
          <CardHeader className="bg-blue-50/10 border-b border-blue-100/40 py-3.5">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base text-[#1e3a8a]">Recent Activity</CardTitle>
                <CardDescription className="text-xs">Latest quotations generated in system</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('quotations')} className="text-xs text-blue-600 hover:text-[#1e3a8a] hover:bg-blue-50">
                View All
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {recentQuotes.length === 0 ? (
              <div className="py-16 text-center text-zinc-400 italic text-sm">
                No quotations recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-blue-50/20">
                    <TableRow className="h-9 border-b border-blue-100/30">
                      <TableHead className="text-[10px] font-black uppercase tracking-wider pl-4">ID</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider">Timeline</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider">Client</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider">Belt Specs</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider text-right pr-4">Total Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentQuotes.map((q: any) => (
                      <TableRow key={q.id} className="text-xs hover:bg-blue-50/20 border-b border-blue-100/30 transition-colors h-11">
                        <TableCell className="font-mono font-bold text-blue-700 text-xs pl-4 py-2">
                          #{q.orderNumber}
                        </TableCell>
                        <TableCell className="text-zinc-400 font-mono text-[10px] py-2">
                          {formatOrderDate(q.createdAt)}
                        </TableCell>
                        <TableCell className="font-bold text-[#1e3a8a] py-2">
                          {q.clientName}
                        </TableCell>
                        <TableCell className="text-zinc-500 py-2">
                          {q.beltType} <span className="text-zinc-400 font-mono text-[10px] ml-1">({q.dimensions.length}×{q.dimensions.width})</span>
                        </TableCell>
                        <TableCell className="font-black text-right pr-4 py-2 text-[#1e3a8a] font-mono">
                          {formatCurrency(Math.round(q.totalCost))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions Panel */}
        <Card className="lg:col-span-1 border-blue-100/60 shadow-[0_4px_12px_rgba(30,58,138,0.04)] rounded-[14px] bg-white">
          <CardHeader>
            <CardTitle className="text-base text-[#1e3a8a]">Quick Actions</CardTitle>
            <CardDescription className="text-xs">Access primary tasks directly</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <button 
              onClick={() => onNavigate('calculator')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-blue-100 hover:border-blue-200 hover:bg-blue-50/30 text-left transition-all duration-200 shadow-sm group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-[#1e40af] rounded-lg group-hover:scale-105 transition-transform">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#1e3a8a]">Run Calculation</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Open Costing Calculator</div>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-blue-400 group-hover:text-[#1e40af] transition-colors" />
            </button>

            <button 
              onClick={() => onNavigate('clients')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-blue-100 hover:border-blue-200 hover:bg-blue-50/30 text-left transition-all duration-200 shadow-sm group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-[#1e40af] rounded-lg group-hover:scale-105 transition-transform">
                  <Users className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#1e3a8a]">Register Client</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Add new client to registry</div>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-blue-400 group-hover:text-[#1e40af] transition-colors" />
            </button>

            <button 
              onClick={() => onNavigate('config')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-blue-100 hover:border-blue-200 hover:bg-blue-50/30 text-left transition-all duration-200 shadow-sm group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-[#1e40af] rounded-lg group-hover:scale-105 transition-transform">
                  <Settings className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#1e3a8a]">Configure Settings</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">Update unit rates, constants, etc.</div>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-blue-400 group-hover:text-[#1e40af] transition-colors" />
            </button>

            <button 
              onClick={() => onNavigate('beltcut')}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-blue-100 hover:border-blue-200 hover:bg-blue-50/30 text-left transition-all duration-200 shadow-sm group cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-[#1e40af] rounded-lg group-hover:scale-105 transition-transform">
                  <Scissors className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-[#1e3a8a]">Beltcut Pro</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">2D roll cutting optimization engine</div>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-blue-400 group-hover:text-[#1e40af] transition-colors" />
            </button>
          </CardContent>
        </Card>
      </div>

      {/* ─── PENDING REVIEWS DIALOG MODAL (Admin Only) ─── */}
      <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-6 sm:max-w-4xl bg-white rounded-2xl border border-zinc-200 shadow-2xl">
          <DialogHeader className="pb-3 border-b">
            <DialogTitle className="text-xl font-black text-[#1e3a8a] flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              Pending Admin Reviews
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Manage and approve pending quotation discounts and client profit margin setup requests directly.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto py-4 space-y-6 pr-1">
            {/* Section 1: Margin Requests */}
            <div className="space-y-3">
              <h3 className="text-sm font-black uppercase tracking-wider text-[#1e3a8a] flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                Margin Configuration Requests ({marginRequests.length})
              </h3>
              {marginRequests.length === 0 ? (
                <p className="text-xs italic text-zinc-400 pl-4">No pending margin setup requests.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {marginRequests.map((req) => (
                    <Card key={req.id} className="border-amber-250 bg-amber-50/20 rounded-xl p-4 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start">
                          <h4 className="text-xs font-bold text-zinc-900">{req.clientName}</h4>
                          <span className="text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 px-2 py-0.5 rounded border border-amber-200">Pending Setup</span>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-1">
                          Style: <strong className="text-zinc-700">{req.beltType} ({req.beltStyle})</strong>
                        </p>
                        {req.length && req.width && (
                          <p className="text-[11px] text-zinc-500">
                            Dimensions: <strong className="text-[#1e40af] font-mono text-[10px]">{req.length}{req.lengthUnit || 'mm'} × {req.width}{req.widthUnit || 'mm'}</strong>
                          </p>
                        )}
                        <p className="text-[10px] text-zinc-400 mt-2">
                          Requested by: <strong>{req.requestedByName}</strong> · {new Date(req.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </p>
                      </div>

                      <div className="flex gap-2 items-center mt-4">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            placeholder="Margin % (e.g. 25)"
                            value={marginInputs[req.id] || ''}
                            onChange={(e) => setMarginInputs({ ...marginInputs, [req.id]: e.target.value })}
                            className="w-full text-xs font-semibold px-2.5 py-1.5 border border-zinc-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-900 bg-white h-8"
                            disabled={isProcessingRequest[req.id]}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">%</span>
                        </div>
                        
                        <Button
                          onClick={() => handleApproveMargin(req.id)}
                          disabled={isProcessingRequest[req.id]}
                          className="bg-emerald-650 hover:bg-emerald-700 text-white font-semibold text-xs px-3 h-8 rounded-lg shrink-0 flex items-center gap-1 shadow-sm cursor-pointer"
                        >
                          <Check className="h-3.5 w-3.5" /> Approve
                        </Button>
                        
                        <Button
                          onClick={() => handleRejectMargin(req.id)}
                          disabled={isProcessingRequest[req.id]}
                          variant="ghost"
                          className="text-red-650 hover:bg-red-50 hover:text-red-700 p-2 h-8 w-8 rounded-lg shrink-0 flex items-center justify-center border border-zinc-200 cursor-pointer"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Section 2: Quotation Approval Requests */}
            <div className="space-y-3 pt-4 border-t">
              <h3 className="text-sm font-black uppercase tracking-wider text-[#1e3a8a] flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                Quotation Approval Requests ({pendingQuotes.length})
              </h3>
              {pendingQuotes.length === 0 ? (
                <p className="text-xs italic text-zinc-400 pl-4">No pending quotation approval requests.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pendingQuotes.map((quote) => {
                    const isSelectedForAction = selectedQuoteForAction?.id === quote.id;
                    return (
                      <Card key={quote.id} className="border-blue-200 bg-blue-50/5 rounded-xl p-4 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start">
                            <div>
                              <span className="text-[10px] font-bold text-blue-600 font-mono">#{quote.orderNumber}</span>
                              <h4 className="text-xs font-bold text-zinc-900 mt-0.5">{quote.clientName}</h4>
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-0.5 rounded border border-blue-200">Pending Review</span>
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-1">
                            Specs: <strong className="text-zinc-700">{quote.beltType} ({quote.beltStyle})</strong>
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            Dimensions: <strong className="text-zinc-700">{quote.dimensions.length}×{quote.dimensions.width}</strong>
                          </p>
                          <p className="text-[11px] text-zinc-500">
                            Base Price: <strong className="text-zinc-700">{formatCurrency(quote.totalCost)}</strong>
                          </p>
                          <p className="text-[11px] text-amber-700 font-bold bg-amber-50 px-2 py-1 rounded-lg border border-amber-100 w-fit mt-2">
                            Requested Discount: {formatCurrency(quote.discountRequested || 0)}
                          </p>
                          {quote.discountReason && (
                            <p className="text-[10px] text-zinc-500 mt-1 bg-zinc-50 p-1.5 rounded border border-dashed">
                              Reason: <strong className="italic">"{quote.discountReason}"</strong>
                            </p>
                          )}
                          <p className="text-[10px] text-zinc-400 mt-2">
                            Created by: <strong>{quote.createdByName}</strong> · {formatOrderDate(quote.createdAt)}
                          </p>
                        </div>

                        <div className="mt-4 pt-3 border-t border-zinc-150">
                          {isSelectedForAction ? (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-1">
                              {quoteActionType === 'approve' ? (
                                <div className="space-y-2">
                                  <Label className="text-[10px] font-bold uppercase text-zinc-500">Enter Approved Discount (₹)</Label>
                                  <div className="flex gap-2">
                                    <Input
                                      type="number"
                                      value={approvedDiscountInput}
                                      onChange={(e) => setApprovedDiscountInput(e.target.value)}
                                      placeholder={quote.discountRequested?.toString()}
                                      className="h-8 text-xs font-semibold"
                                      disabled={isProcessingQuote}
                                    />
                                    <Button
                                      onClick={() => handleApproveQuotation(quote)}
                                      disabled={isProcessingQuote}
                                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 h-8 rounded-lg shrink-0 cursor-pointer"
                                    >
                                      Confirm
                                    </Button>
                                    <Button
                                      onClick={() => { setSelectedQuoteForAction(null); setQuoteActionType(null); }}
                                      variant="outline"
                                      className="text-xs px-3 h-8 rounded-lg shrink-0 cursor-pointer"
                                      disabled={isProcessingQuote}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <Label className="text-[10px] font-bold uppercase text-zinc-500">Enter Rejection Reason</Label>
                                  <div className="flex gap-2">
                                    <Input
                                      value={rejectionReasonInput}
                                      onChange={(e) => setRejectionReasonInput(e.target.value)}
                                      placeholder="Reason for rejecting discount..."
                                      className="h-8 text-xs font-semibold"
                                      disabled={isProcessingQuote}
                                    />
                                    <Button
                                      onClick={() => handleRejectQuotation(quote)}
                                      disabled={isProcessingQuote}
                                      className="bg-red-650 hover:bg-red-700 text-white font-semibold text-xs px-3 h-8 rounded-lg shrink-0 cursor-pointer"
                                    >
                                      Confirm
                                    </Button>
                                    <Button
                                      onClick={() => { setSelectedQuoteForAction(null); setQuoteActionType(null); }}
                                      variant="outline"
                                      className="text-xs px-3 h-8 rounded-lg shrink-0 cursor-pointer"
                                      disabled={isProcessingQuote}
                                    >
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <Button
                                onClick={() => { setSelectedQuoteForAction(quote); setQuoteActionType('approve'); setApprovedDiscountInput(quote.discountRequested?.toString() || ''); }}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex-1 h-8 rounded-lg cursor-pointer"
                              >
                                Approve Discount
                              </Button>
                              <Button
                                onClick={() => { setSelectedQuoteForAction(quote); setQuoteActionType('reject'); setRejectionReasonInput(''); }}
                                variant="outline"
                                className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200 text-xs flex-1 h-8 rounded-lg cursor-pointer"
                              >
                                Reject Discount
                              </Button>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── MARGIN REQUEST DETAIL DIALOG ─── */}
      <Dialog open={isMarginDetailOpen} onOpenChange={(open) => { setIsMarginDetailOpen(open); if (!open) setSelectedMarginReq(null); }}>
        <DialogContent className="max-w-lg bg-white rounded-2xl border border-zinc-200 shadow-2xl p-0 overflow-hidden">
          {selectedMarginReq && (
            <>
              {/* Header */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-xl">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <DialogTitle className="text-base font-black text-zinc-900">Margin Setup Request</DialogTitle>
                    <DialogDescription className="text-xs text-zinc-500 mt-0.5">
                      Review the request details and configure the profit margin below.
                    </DialogDescription>
                  </div>
                  <span className="ml-auto text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full border border-amber-200">
                    Pending
                  </span>
                </div>
              </div>

              {/* Details Table */}
              <div className="px-6 pt-5 pb-4">
                <Table>
                  <TableBody>
                    <TableRow className="border-b border-zinc-100">
                      <TableCell className="text-[10px] font-black uppercase tracking-wider text-zinc-400 py-3 w-36">Client</TableCell>
                      <TableCell className="text-xs font-bold text-zinc-900 py-3">{selectedMarginReq.clientName}</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-zinc-100">
                      <TableCell className="text-[10px] font-black uppercase tracking-wider text-zinc-400 py-3">Belt Type</TableCell>
                      <TableCell className="text-xs font-semibold text-zinc-700 py-3">{selectedMarginReq.beltType}</TableCell>
                    </TableRow>
                    <TableRow className="border-b border-zinc-100">
                      <TableCell className="text-[10px] font-black uppercase tracking-wider text-zinc-400 py-3">Style</TableCell>
                      <TableCell className="text-xs font-semibold text-zinc-700 py-3">{selectedMarginReq.beltStyle}</TableCell>
                    </TableRow>
                    {selectedMarginReq.length && selectedMarginReq.width && (
                      <TableRow className="border-b border-zinc-100">
                        <TableCell className="text-[10px] font-black uppercase tracking-wider text-zinc-400 py-3">Dimensions</TableCell>
                        <TableCell className="py-3">
                          <span className="inline-flex items-center gap-1 bg-blue-50 border border-blue-100 text-[#1e40af] font-mono text-[11px] font-bold px-2.5 py-1 rounded-lg">
                            {selectedMarginReq.length}{selectedMarginReq.lengthUnit || 'mm'} &times; {selectedMarginReq.width}{selectedMarginReq.widthUnit || 'mm'}
                          </span>
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow className="border-b border-zinc-100">
                      <TableCell className="text-[10px] font-black uppercase tracking-wider text-zinc-400 py-3">Requested By</TableCell>
                      <TableCell className="text-xs font-semibold text-zinc-700 py-3">{selectedMarginReq.requestedByName}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-[10px] font-black uppercase tracking-wider text-zinc-400 py-3">Date</TableCell>
                      <TableCell className="text-xs text-zinc-500 py-3">
                        {new Date(selectedMarginReq.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {/* Form */}
              <div className="px-6 pb-6 pt-2 space-y-4 border-t border-zinc-100 bg-zinc-50/40">
                <div className="pt-4">
                  <Label className="text-[10px] font-black uppercase tracking-wider text-zinc-500 mb-2 block">
                    Set Profit Margin for this Client &amp; Style
                  </Label>
                  <div className="relative">
                    <Input
                      type="number"
                      placeholder="Enter margin percentage (e.g. 25)"
                      value={marginInputs[selectedMarginReq.id] || ''}
                      onChange={(e) => setMarginInputs({ ...marginInputs, [selectedMarginReq.id]: e.target.value })}
                      className="pr-8 text-sm font-semibold h-10 rounded-xl border-zinc-300 focus:ring-[#1e40af]"
                      disabled={isProcessingRequest[selectedMarginReq.id]}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-black text-zinc-400">%</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={async () => { await handleApproveMargin(selectedMarginReq.id); setIsMarginDetailOpen(false); setSelectedMarginReq(null); }}
                    disabled={isProcessingRequest[selectedMarginReq.id]}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm h-10 rounded-xl shadow-sm cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Check className="h-4 w-4" /> Approve &amp; Set Margin
                  </Button>
                  <Button
                    onClick={async () => { await handleRejectMargin(selectedMarginReq.id); setIsMarginDetailOpen(false); setSelectedMarginReq(null); }}
                    disabled={isProcessingRequest[selectedMarginReq.id]}
                    variant="outline"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200 font-bold text-sm h-10 rounded-xl cursor-pointer flex items-center gap-2 px-4"
                  >
                    <X className="h-4 w-4" /> Reject
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
