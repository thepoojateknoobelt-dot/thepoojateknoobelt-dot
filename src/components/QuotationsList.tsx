import React, { useState, useEffect } from 'react';
import { Quotation, Config, Company } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { formatCurrency, cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle2, XCircle, ShoppingCart, Download, FileText, Clock, AlertCircle, Search, SlidersHorizontal, Calendar, Filter, X, RotateCcw, Building2, Printer, Scissors, Zap, Package, TriangleAlert, TrendingUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from './ui/dialog';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface EnhancedQuotation extends Quotation {
  orderNumber?: number;
}

interface QuotationsListProps {
  config: Config;
}

const formatQuoteDate = (dateVal: any) => {
  if (!dateVal) return '';
  const date = (typeof dateVal === 'object' && 'toDate' in dateVal) ? dateVal.toDate() : new Date(dateVal);
  return isNaN(date.getTime()) ? '' : date.toLocaleDateString();
};

export const QuotationsList: React.FC<QuotationsListProps> = ({ config }) => {
  const { user } = useAuth();
  const [quotations, setQuotations] = useState<EnhancedQuotation[]>([]);
  const [selectedQuotation, setSelectedQuotation] = useState<EnhancedQuotation | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [approvedDiscount, setApprovedDiscount] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Tab State & Company State
  const [activeTab, setActiveTab] = useState<'quotations' | 'orders'>('quotations');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');
  const [isConvertDialogOpen, setIsConvertDialogOpen] = useState(false);
  const [convertingQuotation, setConvertingQuotation] = useState<EnhancedQuotation | null>(null);

  // Master Searcher State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedBeltType, setSelectedBeltType] = useState<string>('all');
  const [selectedDateRange, setSelectedDateRange] = useState<string>('all');

  const fetchCompanies = async () => {
    try {
      const res = await fetch('/api/companies');
      if (res.ok) {
        const data = await res.json();
        setCompanies(data);
        if (data.length > 0) {
          setSelectedCompanyId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch companies', err);
    }
  };

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

        // Sort descending by createdAt for display
        withOrderNumbers.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        setQuotations(withOrderNumbers);
      }
    } catch (err) {
      console.error('Failed to fetch quotations', err);
    }
  };

  useEffect(() => {
    fetchQuotations();
    fetchCompanies();
    const interval = setInterval(fetchQuotations, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setSelectedStatus('all');
    setSelectedIds([]); // Clear selection when active tab changes
  }, [activeTab]);

  const handleApprove = (q: Quotation) => {
    setApprovedDiscount((q.discountRequested || 0).toString());
    setIsApproveDialogOpen(true);
  };

  const handleApproveConfirm = async () => {
    if (!selectedQuotation) return;
    try {
      const discountVal = parseFloat(approvedDiscount) || 0;
      // Calculate new total cost based on the adjusted approved discount
      const newTotal = selectedQuotation.totalCost + (selectedQuotation.salesMarkup || 0) - discountVal;

      const res = await fetch(`/api/quotations/${selectedQuotation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'approved',
          totalCost: newTotal,
          discountRequested: discountVal
        })
      });

      if (!res.ok) throw new Error('Approve failed');

      toast.success('Discount approved and price updated');
      setIsApproveDialogOpen(false);
      setSelectedQuotation(null);
      fetchQuotations();
    } catch (err) {
      toast.error('Failed to approve');
    }
  };

  const handleReject = async () => {
    if (!selectedQuotation) return;
    try {
      const res = await fetch(`/api/quotations/${selectedQuotation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'rejected',
          rejectionReason
        })
      });

      if (!res.ok) throw new Error('Reject failed');

      toast.success('Discount rejected');
      setIsRejectDialogOpen(false);
      setRejectionReason('');
      setSelectedQuotation(null);
      fetchQuotations();
    } catch (err) {
      toast.error('Failed to reject');
    }
  };

  const handleConvertToOrder = (q: EnhancedQuotation) => {
    setConvertingQuotation(q);
    setIsConvertDialogOpen(true);
    if (companies.length > 0) {
      setSelectedCompanyId(companies[0].id);
    } else {
      setSelectedCompanyId('');
    }
  };

  const confirmConvertToOrder = async () => {
    if (!convertingQuotation) return;
    const selectedComp = companies.find(c => c.id === selectedCompanyId);
    const companyName = selectedComp ? selectedComp.name : 'Pooja Tekno Belt';
    
    try {
      const res = await fetch(`/api/quotations/${convertingQuotation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'order',
          company: companyName
        })
      });

      if (!res.ok) throw new Error('Convert failed');

      toast.success(`Quotation converted to order under "${companyName}"!`);
      setIsConvertDialogOpen(false);
      setConvertingQuotation(null);
      setSelectedQuotation(null);
      fetchQuotations();
      setActiveTab('orders');
    } catch (err) {
      toast.error('Failed to convert to order');
    }
  };

  // ─── Smart Cut State ────────────────────────────────────────────────────────
  const [isSmartCutDialogOpen, setIsSmartCutDialogOpen] = useState(false);
  const [smartCutLoading, setSmartCutLoading] = useState(false);
  const [smartCutPlan, setSmartCutPlan] = useState<any>(null);
  const [smartCutQuotation, setSmartCutQuotation] = useState<EnhancedQuotation | null>(null);
  const [smartCutConfirming, setSmartCutConfirming] = useState(false);

  const handleSmartCut = async (q: EnhancedQuotation) => {
    setSmartCutQuotation(q);
    setSmartCutPlan(null);
    setIsSmartCutDialogOpen(true);
    setSmartCutLoading(true);
    try {
      const res = await fetch(`/api/quotations/${q.id}/smart-cut`, { method: 'POST' });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Smart cut failed');
      }
      const plan = await res.json();
      setSmartCutPlan(plan);
    } catch (err: any) {
      toast.error(err.message || 'Smart cut failed');
      setIsSmartCutDialogOpen(false);
    } finally {
      setSmartCutLoading(false);
    }
  };

  const handleConfirmSmartCut = async () => {
    if (!smartCutQuotation) return;
    setSmartCutConfirming(true);
    try {
      const res = await fetch(`/api/quotations/${smartCutQuotation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'executed' })
      });
      if (!res.ok) throw new Error('Failed to execute order');
      toast.success('Order executed & cutting plan applied!');
      setIsSmartCutDialogOpen(false);
      setSmartCutQuotation(null);
      setSmartCutPlan(null);
      setSelectedQuotation(null);
      fetchQuotations();
    } catch (err: any) {
      toast.error(err.message || 'Execution failed');
    } finally {
      setSmartCutConfirming(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete the ${selectedIds.length} selected records?`)) return;

    try {
      const res = await fetch('/api/quotations/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds })
      });

      if (!res.ok) throw new Error('Bulk delete failed');

      toast.success(`${selectedIds.length} records deleted successfully!`);
      setSelectedIds([]);
      fetchQuotations();
    } catch (err) {
      toast.error('Failed to delete selected records');
    }
  };

  const handleSingleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this record?")) return;
    try {
      const res = await fetch(`/api/quotations/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Delete failed');
      toast.success('Record deleted successfully');
      setSelectedQuotation(null);
      fetchQuotations();
    } catch (err) {
      toast.error('Failed to delete record');
    }
  };

  // Get unique belt types for the filter dropdown
  const uniqueBeltTypes = Array.from(new Set(quotations.map(q => q.beltType))).filter(Boolean);

  // Apply filters
  const filteredQuotations = quotations.filter((q) => {
    // Tab filter
    if (activeTab === 'quotations' && (q.status === 'order' || q.status === 'executed')) return false;
    if (activeTab === 'orders' && q.status !== 'order' && q.status !== 'executed') return false;

    // 1. Search Query Filter (Client Name, Belt Type, createdBy, Order Number)
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim();
      const matchClient = q.clientName?.toLowerCase().includes(query);
      const matchCreatedBy = q.createdByName?.toLowerCase().includes(query) || q.createdBy?.toLowerCase().includes(query);
      const matchBeltType = q.beltType?.toLowerCase().includes(query);
      const matchBeltStyle = q.beltStyle?.toLowerCase().includes(query);
      const matchOrderNum = q.orderNumber?.toString().includes(query) || `#${q.orderNumber}`.includes(query);
      
      if (!matchClient && !matchCreatedBy && !matchBeltType && !matchBeltStyle && !matchOrderNum) {
        return false;
      }
    }

    // 2. Status Filter
    if (selectedStatus !== 'all') {
      if (selectedStatus === 'pending') {
        if (q.status !== 'pending_approval') return false;
      } else {
        if (q.status !== selectedStatus) return false;
      }
    }

    // 3. Belt Type Filter
    if (selectedBeltType !== 'all') {
      if (q.beltType !== selectedBeltType) return false;
    }

    // 4. Date Range Filter
    if (selectedDateRange !== 'all') {
      const qDate = new Date(q.createdAt);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (selectedDateRange === 'today') {
        if (qDate < today) return false;
      } else if (selectedDateRange === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const endOfYesterday = new Date(today);
        if (qDate < yesterday || qDate >= endOfYesterday) return false;
      } else if (selectedDateRange === '7days') {
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        if (qDate < sevenDaysAgo) return false;
      } else if (selectedDateRange === '30days') {
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        if (qDate < thirtyDaysAgo) return false;
      }
    }

    return true;
  });

  const exportToCSV = () => {
    const headers = ['Order ID', 'Date', 'Client', 'Belt Category', 'Dimensions', 'Total Cost', 'Status'];
    const rows = filteredQuotations.map(q => [
      `#${q.orderNumber || ''}`,
      formatQuoteDate(q.createdAt),
      q.clientName,
      `${q.beltType}${q.beltStyle ? ` (${q.beltStyle})` : ''}`,
      `L ${q.dimensions.length}${q.dimensions.lengthUnit || q.dimensions.unit || 'mm'} x W ${q.dimensions.width}${q.dimensions.widthUnit || q.dimensions.unit || 'mm'}`,
      Math.round(q.totalCost),
      q.status
    ]);
    
    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quotations_report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handlePrintQuotation = (q: EnhancedQuotation) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Failed to open print window. Please allow popups.');
      return;
    }

    const isMultiItem = q.items && q.items.length > 0;
    const clientComp = q.company || 'Pooja Tekno Belt';
    const dateStr = formatQuoteDate(q.createdAt);
    const totalBeforeAdjustment = isMultiItem
      ? q.items!.reduce((sum, item) => sum + item.totalCost, 0)
      : q.totalCost;
    const discountAmt = q.discountRequested || 0;
    const salesMarkupAmt = q.salesMarkup || 0;
    const finalAmt = q.status === 'approved'
      ? q.totalCost
      : q.totalCost + salesMarkupAmt - discountAmt;

    // Render table rows
    let tableRowsHTML = '';
    if (isMultiItem) {
      q.items!.forEach((item, idx) => {
        tableRowsHTML += `
          <tr>
            <td style="text-align: center; border: 1px solid #ddd; padding: 8px;">${idx + 1}</td>
            <td style="border: 1px solid #ddd; padding: 8px;">
              <strong>${item.beltType}</strong><br/>
              <span style="font-size: 11px; color: #555;">Style: ${item.beltStyle}</span>
            </td>
            <td style="text-align: center; border: 1px solid #ddd; padding: 8px; font-family: monospace;">
              L ${item.dimensions.length}${item.dimensions.lengthUnit || 'mm'} x W ${item.dimensions.width}${item.dimensions.widthUnit || 'mm'}
              ${item.dimensions.hasHoles ? `<br/><span style="font-size: 10px; color: #6366f1;">Holes: ${item.dimensions.totalHoles} pcs</span>` : ''}
            </td>
            <td style="text-align: right; border: 1px solid #ddd; padding: 8px; font-family: monospace; font-weight: bold;">
              ${formatCurrency(item.totalCost)}
            </td>
          </tr>
        `;
      });
    } else {
      tableRowsHTML = `
        <tr>
          <td style="text-align: center; border: 1px solid #ddd; padding: 8px;">1</td>
          <td style="border: 1px solid #ddd; padding: 8px;">
            <strong>${q.beltType}</strong><br/>
            <span style="font-size: 11px; color: #555;">Style: ${q.beltStyle || 'Std'}</span>
          </td>
          <td style="text-align: center; border: 1px solid #ddd; padding: 8px; font-family: monospace;">
            L ${q.dimensions.length}${q.dimensions.lengthUnit || q.dimensions.unit || 'mm'} x W ${q.dimensions.width}${q.dimensions.widthUnit || q.dimensions.unit || 'mm'}
            ${q.dimensions.hasHoles ? `<br/><span style="font-size: 10px; color: #6366f1;">Holes: ${q.dimensions.totalHoles} pcs</span>` : ''}
          </td>
          <td style="text-align: right; border: 1px solid #ddd; padding: 8px; font-family: monospace; font-weight: bold;">
            ${formatCurrency(q.totalCost)}
          </td>
        </tr>
      `;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Quotation #${q.orderNumber} - ${q.clientName}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 40px; line-height: 1.5; }
            .header-container { display: flex; justify-content: space-between; border-bottom: 3px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
            .company-details h1 { margin: 0; font-size: 28px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
            .company-details p { margin: 4px 0 0 0; font-size: 12px; color: #666; }
            .invoice-details { text-align: right; }
            .invoice-details h2 { margin: 0; font-size: 22px; color: #444; font-weight: 700; }
            .invoice-details p { margin: 4px 0; font-size: 12px; color: #666; }
            .client-info { background: #f9f9f9; padding: 15px 20px; border-radius: 8px; border: 1px solid #eaeaea; margin-bottom: 35px; }
            .client-info h3 { margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; color: #777; letter-spacing: 0.8px; }
            .client-info p { margin: 3px 0; font-size: 14px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { background: #f2f2f2; border: 1px solid #ddd; padding: 10px 8px; font-size: 12px; text-transform: uppercase; text-align: left; }
            td { font-size: 13px; }
            .summary-container { display: flex; justify-content: flex-end; margin-top: 20px; }
            .summary-table { width: 320px; }
            .summary-table tr td { padding: 6px 8px; border: none; }
            .summary-table tr .lbl { color: #666; font-size: 12px; }
            .summary-table tr .val { text-align: right; font-family: monospace; font-weight: bold; }
            .summary-table tr.total-row { border-top: 2px solid #333; font-size: 16px; font-weight: bold; }
            .summary-table tr.total-row td { padding-top: 10px; }
            .terms-container { margin-top: 50px; border-top: 1px solid #eee; padding-top: 20px; font-size: 11px; color: #777; }
            .terms-container h4 { margin: 0 0 8px 0; text-transform: uppercase; }
            .footer-signature { display: flex; justify-content: space-between; margin-top: 80px; padding: 0 20px; }
            .sig-line { width: 200px; border-top: 1px solid #888; text-align: center; font-size: 12px; padding-top: 5px; color: #555; }
            @media print {
              body { margin: 20px; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header-container">
            <div class="company-details">
              <h1>${clientComp}</h1>
              <p>Authorized Sales Partner & Belt Fabricator</p>
              <p>Email: contact@poojateknobelt.com | Web: poojateknobelt.com</p>
            </div>
            <div class="invoice-details">
              <h2>QUOTATION</h2>
              <p><strong>Quote No:</strong> #${q.orderNumber}</p>
              <p><strong>Date:</strong> ${dateStr}</p>
              <p><strong>Status:</strong> ${q.status.toUpperCase()}</p>
            </div>
          </div>

          <div class="client-info">
            <h3>Client Details</h3>
            <p style="font-size: 16px; margin-bottom: 2px; color: #111;">${q.clientName}</p>
            ${q.company ? `<p style="font-size: 13px; font-weight: normal; color: #555; margin-top: 0;">Company: ${q.company}</p>` : ''}
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 50px; text-align: center;">Sr. No</th>
                <th>Description / Specification</th>
                <th style="width: 200px; text-align: center;">Dimensions</th>
                <th style="width: 150px; text-align: right;">Total Price</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHTML}
            </tbody>
          </table>

          <div class="summary-container">
            <table class="summary-table">
              <tr>
                <td class="lbl">Items Total</td>
                <td class="val">${formatCurrency(totalBeforeAdjustment)}</td>
              </tr>
              ${salesMarkupAmt > 0 ? `
              <tr>
                <td class="lbl" style="color: #047857;">Sales Markup (+)</td>
                <td class="val" style="color: #047857;">+ ${formatCurrency(salesMarkupAmt)}</td>
              </tr>
              ` : ''}
              ${discountAmt > 0 ? `
              <tr>
                <td class="lbl" style="color: #b45309;">Special Adjustment (Discount)</td>
                <td class="val" style="color: #b45309;">- ${formatCurrency(discountAmt)}</td>
              </tr>
              ` : ''}
              <tr class="total-row">
                <td>Net Payable</td>
                <td class="val" style="color: #15803d; font-size: 18px;">${formatCurrency(finalAmt)}</td>
              </tr>
            </table>
          </div>

          <div class="footer-signature">
            <div>
              <div style="height: 50px;"></div>
              <div class="sig-line">Prepared By</div>
            </div>
            <div>
              <div style="height: 50px;"></div>
              <div class="sig-line">Authorized Signatory</div>
            </div>
          </div>

          <div class="terms-container">
            <h4>Terms & Conditions</h4>
            <ol style="padding-left: 15px; margin: 0;">
              <li>Prices quoted are inclusive of taxes and packaging unless stated otherwise.</li>
              <li>Delivery timelines are subject to fabric availability and production queues.</li>
              <li>This quotation is valid for a period of 30 days from the date of issue.</li>
              <li>Custom cut and punch orders cannot be cancelled once production has commenced.</li>
            </ol>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_approval': return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1"><Clock className="h-3 w-3" /> Pending</Badge>;
      case 'approved': return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"><CheckCircle2 className="h-3 w-3" /> Approved</Badge>;
      case 'rejected': return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1"><XCircle className="h-3 w-3" /> Rejected</Badge>;
      case 'order': return <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 gap-1"><ShoppingCart className="h-3 w-3" /> Order</Badge>;
      case 'executed': return <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 gap-1"><CheckCircle2 className="h-3 w-3" /> Executed</Badge>;
      default: return <Badge variant="outline" className="bg-zinc-50 text-zinc-700 border-zinc-200">Draft</Badge>;
    }
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setSelectedStatus('all');
    setSelectedBeltType('all');
    setSelectedDateRange('all');
    toast.success('Filters reset');
  };

  const hasActiveFilters = searchQuery !== '' || selectedStatus !== 'all' || selectedBeltType !== 'all' || selectedDateRange !== 'all';

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 text-[#1e40af] rounded-lg">
            <FileText className="h-4 w-4" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">Quotations & Orders</h1>
        </div>
        <Button variant="outline" className="gap-1.5 self-start sm:self-auto h-8 text-xs px-3" onClick={exportToCSV}>
          <Download className="h-3.5 w-3.5" />
          Export Report
        </Button>
      </div>

      {/* Master Searcher Section */}
      <div className="bg-zinc-50/50 p-4 rounded-xl border border-zinc-200/80 grid grid-cols-1 md:grid-cols-4 gap-4 items-end shadow-xs backdrop-blur-md">
        <div className="space-y-2 col-span-1 md:col-span-1">
          <Label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
            <Search className="h-3 w-3 text-zinc-500" /> Search Records
          </Label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Search ID, Client, Belt..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 border-zinc-300 focus-visible:ring-zinc-400 bg-white"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
            <Filter className="h-3 w-3 text-zinc-500" /> Status
          </Label>
          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="h-9 border-zinc-300 bg-white w-full">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {activeTab === 'quotations' ? (
                <>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </>
              ) : (
                <>
                  <SelectItem value="order">Order</SelectItem>
                  <SelectItem value="executed">Executed</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
            <SlidersHorizontal className="h-3 w-3 text-zinc-500" /> Belt Type
          </Label>
          <Select value={selectedBeltType} onValueChange={setSelectedBeltType}>
            <SelectTrigger className="h-9 border-zinc-300 bg-white w-full">
              <SelectValue placeholder="All Belt Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Belt Types</SelectItem>
              {uniqueBeltTypes.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="h-3 w-3 text-zinc-500" /> Date Range
          </Label>
          <div className="flex gap-2">
            <Select value={selectedDateRange} onValueChange={setSelectedDateRange}>
              <SelectTrigger className="h-9 border-zinc-300 bg-white w-full">
                <SelectValue placeholder="All Time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="7days">Last 7 Days</SelectItem>
                <SelectItem value="30days">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleResetFilters}
                className="h-9 w-9 border border-zinc-200 text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100 shrink-0"
                title="Reset Filters"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <Card className="border-zinc-200 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle>{activeTab === 'quotations' ? 'Quotations' : 'Orders'}</CardTitle>
              <CardDescription>
                Showing {filteredQuotations.length} of {quotations.length} records {hasActiveFilters && '(Filtered)'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-auto">
              {user?.role === 'admin' && selectedIds.length > 0 && (
                <Button 
                  variant="destructive" 
                  size="sm" 
                  className="h-8 text-xs font-bold gap-1.5 cursor-pointer bg-red-600 hover:bg-red-700 text-white"
                  onClick={handleBulkDelete}
                >
                  <X className="h-3.5 w-3.5" />
                  Delete Selected ({selectedIds.length})
                </Button>
              )}
              <div className="flex bg-zinc-100 p-1 rounded-lg border border-zinc-200/50 shadow-inner">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab('quotations')}
                className={cn(
                  "px-4 py-1.5 h-8 text-xs font-bold transition-all rounded-md",
                  activeTab === 'quotations'
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-855"
                )}
              >
                Quotations
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab('orders')}
                className={cn(
                  "px-4 py-1.5 h-8 text-xs font-bold transition-all rounded-md",
                  activeTab === 'orders'
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-855"
                )}
              >
                Orders
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
        <CardContent>
          <div className="rounded-md border border-zinc-200 overflow-hidden">
            <Table>
              <TableHeader className="bg-zinc-50/50">
                <TableRow>
                  {user?.role === 'admin' && (
                    <TableHead className="w-12 text-center py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 cursor-pointer"
                        checked={filteredQuotations.length > 0 && filteredQuotations.every(q => selectedIds.includes(q.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const newSelected = Array.from(new Set([...selectedIds, ...filteredQuotations.map(q => q.id)]));
                            setSelectedIds(newSelected);
                          } else {
                            const filteredList = filteredQuotations.map(q => q.id);
                            setSelectedIds(prev => prev.filter(id => !filteredList.includes(id)));
                          }
                        }}
                      />
                    </TableHead>
                  )}
                  <TableHead className="w-[100px] font-bold text-zinc-700">Order ID</TableHead>
                  <TableHead className="font-bold text-zinc-700">Date</TableHead>
                  <TableHead className="font-bold text-zinc-700">Client</TableHead>
                  <TableHead className="font-bold text-zinc-700">Belt Details</TableHead>
                  {activeTab === 'orders' && (
                    <TableHead className="font-bold text-zinc-700">Company</TableHead>
                  )}
                  <TableHead className="font-bold text-zinc-700">Total Price</TableHead>
                  <TableHead className="font-bold text-zinc-700">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={(activeTab === 'orders' ? 7 : 6) + (user?.role === 'admin' ? 1 : 0)} className="h-24 text-center text-zinc-400 italic">
                      No matching records found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredQuotations.map((q) => (
                    <TableRow 
                      key={q.id} 
                      className="cursor-pointer hover:bg-zinc-50/50 transition-colors"
                      onClick={() => setSelectedQuotation(q)}
                    >
                      {user?.role === 'admin' && (
                        <TableCell onClick={(e) => e.stopPropagation()} className="w-12 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 cursor-pointer"
                            checked={selectedIds.includes(q.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedIds(prev => [...prev, q.id]);
                              } else {
                                setSelectedIds(prev => prev.filter(id => id !== q.id));
                              }
                            }}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-mono font-bold text-zinc-700 text-sm">
                        #{q.orderNumber}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {formatQuoteDate(q.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold text-zinc-900">{q.clientName}</span>
                          <span className="text-xs text-zinc-400">by {q.createdByName || q.createdBy}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-zinc-800">{q.beltType} {q.beltStyle && `(${q.beltStyle})`}</span>
                          <span className="text-xs text-zinc-500">L {q.dimensions.length}{q.dimensions.lengthUnit || q.dimensions.unit || 'mm'} x W {q.dimensions.width}{q.dimensions.widthUnit || q.dimensions.unit || 'mm'}</span>
                        </div>
                      </TableCell>
                      {activeTab === 'orders' && (
                        <TableCell>
                          <Badge variant="secondary" className="bg-zinc-100 text-zinc-800 border-zinc-200 gap-1 text-[11px] font-bold">
                            <Building2 className="h-3 w-3 text-zinc-500" />
                            {q.company || 'Pooja Tekno Belt'}
                          </Badge>
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-zinc-900">{formatCurrency(Math.round(q.totalCost))}</span>
                          {q.discountRequested && q.status === 'pending_approval' && (
                            <span className="text-[10px] text-amber-600 font-medium">Requesting {formatCurrency(q.discountRequested)} off</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(q.status)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!selectedQuotation && !isRejectDialogOpen && !isApproveDialogOpen} onOpenChange={(open) => !open && setSelectedQuotation(null)}>
        <DialogContent className="max-w-4xl sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              Quotation Details <Badge variant="outline" className="font-mono bg-zinc-50">#{selectedQuotation?.orderNumber}</Badge>
            </DialogTitle>
            <DialogDescription>Review quotation details and take action</DialogDescription>
          </DialogHeader>
          {selectedQuotation && (
            <div className="space-y-6 py-4">
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5 sm:p-6 space-y-6 shadow-inner">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Order ID</p>
                    <p className="text-sm font-black font-mono text-zinc-800">#{selectedQuotation.orderNumber}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Client</p>
                    <p className="text-sm font-bold text-zinc-800">{selectedQuotation.clientName}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Total Price</p>
                    <p className="text-base font-black text-emerald-650 font-mono">{formatCurrency(Math.round(selectedQuotation.totalCost))}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Status</p>
                    <div>{getStatusBadge(selectedQuotation.status)}</div>
                  </div>
                  {selectedQuotation.company && (
                    <div className="space-y-0.5 col-span-2 sm:col-span-4 border-t border-zinc-200/50 pt-2 mt-1">
                      <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Company</p>
                      <p className="text-xs font-bold text-zinc-800 flex items-center gap-1.5 mt-0.5">
                        <Building2 className="h-3.5 w-3.5 text-zinc-500" />
                        {selectedQuotation.company}
                      </p>
                    </div>
                  )}
                </div>

                {/* Items List Table */}
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Quotation Items</p>
                  <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white max-h-[300px] overflow-y-auto shadow-sm">
                    <Table>
                      <TableHeader className="bg-zinc-50/50">
                        <TableRow className="h-10">
                          <TableHead className="w-[45px] text-center font-bold text-xs py-2.5">No.</TableHead>
                          <TableHead className="font-bold text-xs py-2.5">Belt Details</TableHead>
                          <TableHead className="font-bold text-xs py-2.5">Dimensions</TableHead>
                          <TableHead className="font-bold text-xs py-2.5">BOM & Customizations</TableHead>
                          <TableHead className="font-bold text-right text-xs py-2.5 pr-4">Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedQuotation.items && selectedQuotation.items.length > 0 ? (
                          selectedQuotation.items.map((item, idx) => {
                            const included = item.selectedBOMOptions?._included || {};
                            const customRates = item.selectedBOMOptions?._customRates || {};
                            const remarks = item.selectedBOMOptions?._remarks || {};
                            const optRemarks = item.selectedBOMOptions?._optRemarks || {};

                            const category = (Array.isArray(config?.beltTypes) ? config.beltTypes : [])?.find?.(t => t.name === item.beltType) || null;
                            const style = (Array.isArray(category?.styles) ? category.styles : [])?.find?.(s => s.name === item.beltStyle) || null;
                            const bomItems = style?.bom || [];

                            const includedItems = bomItems.filter(b => included[b.id] !== false);
                            const adjustedItems = bomItems.filter(b => customRates[b.id] !== undefined).map(b => `${b.name} (₹${customRates[b.id]})`);
                            const hasRemarks = includedItems.some(b => remarks[b.id]);

                            const subRemarkEntries: { label: string; text: string }[] = [];
                            includedItems.forEach(b => {
                              const rawSel = item.selectedBOMOptions?.[b.id];
                              const selIndices: number[] = Array.isArray(rawSel)
                                ? rawSel
                                : rawSel !== undefined ? [rawSel] : [];
                              selIndices.forEach((optIdx: number) => {
                                if (b.options?.[optIdx]) {
                                  const optKey = `${b.id}_${optIdx}`;
                                  if (optRemarks[optKey]) {
                                    subRemarkEntries.push({
                                      label: `${b.name} › ${b.options[optIdx].name || ''}`,
                                      text: optRemarks[optKey]
                                    });
                                  }
                                }
                              });
                            });

                            return (
                              <TableRow key={item.id || idx} className="text-xs hover:bg-zinc-50/50 transition-colors h-11">
                                <TableCell className="text-center font-bold text-zinc-500">{idx + 1}</TableCell>
                                <TableCell className="font-semibold text-zinc-900">
                                  {item.beltType}
                                  <div className="text-[10px] text-zinc-400 font-medium">Style: {item.beltStyle || 'Standard'}</div>
                                </TableCell>
                                <TableCell className="font-mono text-zinc-650">
                                  L {item.dimensions.length}{item.dimensions.lengthUnit || 'mm'} x W {item.dimensions.width}{item.dimensions.widthUnit || 'mm'}
                                  {item.dimensions.hasHoles && (
                                    <div className="text-[10px] text-indigo-650 font-bold mt-0.5">Holes: {item.dimensions.totalHoles} pcs</div>
                                  )}
                                </TableCell>
                                <TableCell className="max-w-[280px] text-[10px] text-zinc-600 font-normal leading-relaxed">
                                  <div className="space-y-0.5 py-1">
                                    <div><span className="font-semibold text-zinc-500">BOM:</span> {includedItems.map(b => b.name).join(', ') || 'None'}</div>
                                    {adjustedItems.length > 0 && (
                                      <div className="text-[10px] text-indigo-650 font-bold">
                                        <span className="font-extrabold">Adjusted:</span> {adjustedItems.join(', ')}
                                      </div>
                                    )}
                                    {hasRemarks && (
                                      <div className="text-[10px] text-amber-700 font-medium mt-0.5 space-y-0.5 bg-amber-50/50 p-1 rounded border border-amber-100/50">
                                        {includedItems.filter(b => remarks[b.id]).map(b => (
                                          <div key={b.id} className="flex items-start gap-1">
                                            <span className="font-bold text-amber-600 shrink-0">{b.name}:</span>
                                            <span className="italic">{remarks[b.id]}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {subRemarkEntries.length > 0 && (
                                      <div className="text-[10px] text-indigo-750 font-medium mt-0.5 space-y-0.5 bg-indigo-50/50 p-1 rounded border border-indigo-100/50">
                                        {subRemarkEntries.map((e, i) => (
                                          <div key={i} className="flex items-start gap-1">
                                            <span className="font-bold text-indigo-500 shrink-0">{e.label}:</span>
                                            <span className="italic">{e.text}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold text-zinc-900 pr-4">
                                  {formatCurrency(item.totalCost)}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        ) : (
                          // Fallback row for single-item legacy quotations
                          (() => {
                            const item = selectedQuotation;
                            const included = item.selectedBOMOptions?._included || {};
                            const customRates = item.selectedBOMOptions?._customRates || {};
                            const remarks = item.selectedBOMOptions?._remarks || {};
                            const optRemarks = item.selectedBOMOptions?._optRemarks || {};

                            const category = (Array.isArray(config?.beltTypes) ? config.beltTypes : [])?.find?.(t => t.name === item.beltType) || null;
                            const style = (Array.isArray(category?.styles) ? category.styles : [])?.find?.(s => s.name === item.beltStyle) || null;
                            const bomItems = style?.bom || [];

                            const includedItems = bomItems.filter(b => included[b.id] !== false);
                            const adjustedItems = bomItems.filter(b => customRates[b.id] !== undefined).map(b => `${b.name} (₹${customRates[b.id]})`);
                            const hasRemarks = includedItems.some(b => remarks[b.id]);

                            const subRemarkEntries: { label: string; text: string }[] = [];
                            includedItems.forEach(b => {
                              const rawSel = item.selectedBOMOptions?.[b.id];
                              const selIndices: number[] = Array.isArray(rawSel)
                                ? rawSel
                                : rawSel !== undefined ? [rawSel] : [];
                              selIndices.forEach((optIdx: number) => {
                                if (b.options?.[optIdx]) {
                                  const optKey = `${b.id}_${optIdx}`;
                                  if (optRemarks[optKey]) {
                                    subRemarkEntries.push({
                                      label: `${b.name} › ${b.options[optIdx].name || ''}`,
                                      text: optRemarks[optKey]
                                    });
                                  }
                                }
                              });
                            });

                            return (
                              <TableRow className="text-xs hover:bg-zinc-50/50 transition-colors h-11">
                                <TableCell className="text-center font-bold text-zinc-500">1</TableCell>
                                <TableCell className="font-semibold text-zinc-900">
                                  {item.beltType}
                                  <div className="text-[10px] text-zinc-400 font-medium">Style: {item.beltStyle || 'Standard'}</div>
                                </TableCell>
                                <TableCell className="font-mono text-zinc-650">
                                  L {item.dimensions.length}{item.dimensions.lengthUnit || item.dimensions.unit || 'mm'} x W {item.dimensions.width}{item.dimensions.widthUnit || item.dimensions.unit || 'mm'}
                                  {item.dimensions.hasHoles && (
                                    <div className="text-[10px] text-indigo-650 font-bold mt-0.5">Holes: {item.dimensions.totalHoles} pcs</div>
                                  )}
                                </TableCell>
                                <TableCell className="max-w-[280px] text-[10px] text-zinc-600 font-normal leading-relaxed">
                                  <div className="space-y-0.5 py-1">
                                    <div><span className="font-semibold text-zinc-500">BOM:</span> {includedItems.map(b => b.name).join(', ') || 'None'}</div>
                                    {adjustedItems.length > 0 && (
                                      <div className="text-[10px] text-indigo-650 font-bold">
                                        <span className="font-extrabold">Adjusted:</span> {adjustedItems.join(', ')}
                                      </div>
                                    )}
                                    {hasRemarks && (
                                      <div className="text-[10px] text-amber-700 font-medium mt-0.5 space-y-0.5 bg-amber-50/50 p-1 rounded border border-amber-100/50">
                                        {includedItems.filter(b => remarks[b.id]).map(b => (
                                          <div key={b.id} className="flex items-start gap-1">
                                            <span className="font-bold text-amber-600 shrink-0">{b.name}:</span>
                                            <span className="italic">{remarks[b.id]}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {subRemarkEntries.length > 0 && (
                                      <div className="text-[10px] text-indigo-755 font-medium mt-0.5 space-y-0.5 bg-indigo-50/50 p-1 rounded border border-indigo-100/50">
                                        {subRemarkEntries.map((e, i) => (
                                          <div key={i} className="flex items-start gap-1">
                                            <span className="font-bold text-indigo-500 shrink-0">{e.label}:</span>
                                            <span className="italic">{e.text}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold text-zinc-900 pr-4">
                                  {formatCurrency(item.totalCost)}
                                </TableCell>
                              </TableRow>
                            );
                          })()
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>



                {/* Sales Markup details */}
                {selectedQuotation.salesMarkup && selectedQuotation.salesMarkup > 0 && (
                  <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-100 space-y-1 shadow-sm">
                    <div className="flex items-center gap-2 text-emerald-900 font-bold text-xs uppercase tracking-wider">
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                      Sales Markup Applied: +{formatCurrency(selectedQuotation.salesMarkup)}
                    </div>
                  </div>
                )}

                {/* Discount details */}
                {selectedQuotation.discountRequested && selectedQuotation.discountRequested > 0 && (
                  <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-100 space-y-2 shadow-sm">
                    <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      Discount Requested: {formatCurrency(selectedQuotation.discountRequested)}
                    </div>
                    <p className="text-xs text-amber-700 italic">"{selectedQuotation.discountReason}"</p>
                  </div>
                )}

                {/* Net Price summary */}
                <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-1 shadow-sm mt-2">
                  <p className="text-xs text-zinc-650 font-extrabold flex justify-between items-center">
                    <span>Base Items Cost:</span>
                    <span className="font-mono text-sm text-zinc-900">{formatCurrency(selectedQuotation.totalCost)}</span>
                  </p>
                  {selectedQuotation.salesMarkup && selectedQuotation.salesMarkup > 0 && (
                    <p className="text-xs text-emerald-650 font-extrabold flex justify-between items-center">
                      <span>Sales Markup (+):</span>
                      <span className="font-mono text-sm text-emerald-700">+{formatCurrency(selectedQuotation.salesMarkup)}</span>
                    </p>
                  )}
                  {selectedQuotation.discountRequested && selectedQuotation.discountRequested > 0 && (
                    <p className="text-xs text-amber-650 font-extrabold flex justify-between items-center">
                      <span>Discount (-):</span>
                      <span className="font-mono text-sm text-amber-700">-{formatCurrency(selectedQuotation.discountRequested)}</span>
                    </p>
                  )}
                  <p className="text-xs text-zinc-800 font-black flex justify-between items-center pt-1.5 border-t border-zinc-200 mt-1.5 text-sm">
                    <span>Final Net Price:</span>
                    <span className="font-mono text-emerald-600 text-base">
                      {formatCurrency(
                        Math.round(
                          selectedQuotation.status === 'approved'
                            ? selectedQuotation.totalCost
                            : selectedQuotation.totalCost + (selectedQuotation.salesMarkup || 0) - (selectedQuotation.discountRequested || 0)
                        )
                      )}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {selectedQuotation && (
              <Button variant="outline" className="gap-1.5 border-zinc-350 font-bold text-zinc-700 hover:bg-zinc-100 mr-auto cursor-pointer" onClick={() => handlePrintQuotation(selectedQuotation)}>
                <Printer className="h-3.5 w-3.5 text-zinc-500" />
                Print Quotation
              </Button>
            )}
            {user?.role === 'admin' && selectedQuotation?.status === 'pending_approval' && (
              <>
                <Button onClick={() => handleApprove(selectedQuotation!)}>
                  Approve Discount
                </Button>
                <Button variant="destructive" onClick={() => setIsRejectDialogOpen(true)}>
                  Reject Discount
                </Button>
              </>
            )}
            {(selectedQuotation?.status === 'approved' || selectedQuotation?.status === 'draft') && (
              <Button onClick={() => handleConvertToOrder(selectedQuotation!)}>
                Convert to Order
              </Button>
            )}

            {user?.role === 'admin' && selectedQuotation && (
              <Button 
                variant="destructive" 
                className="gap-1.5 bg-red-650 hover:bg-red-750 text-white font-bold cursor-pointer"
                onClick={() => handleSingleDelete(selectedQuotation.id)}
              >
                Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setSelectedQuotation(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Discount Request</DialogTitle>
            <DialogDescription>Provide a reason for rejecting the discount request.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for Rejection</Label>
              <Input 
                placeholder="e.g. Margin too low, Standard pricing applies" 
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleReject}>Reject Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent className="max-w-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Discount Request</DialogTitle>
            <DialogDescription>
              Review the requested discount and adjust the final approved amount if necessary.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-150 text-xs space-y-1">
              <p className="flex justify-between">
                <span className="text-zinc-500 font-medium">Base Item Price:</span>
                <span className="font-mono font-bold text-zinc-900">{formatCurrency(selectedQuotation?.totalCost || 0)}</span>
              </p>
              {selectedQuotation?.salesMarkup && selectedQuotation.salesMarkup > 0 && (
                <p className="flex justify-between">
                  <span className="text-emerald-600 font-medium">Sales Markup (+):</span>
                  <span className="font-mono font-bold">+{formatCurrency(selectedQuotation.salesMarkup)}</span>
                </p>
              )}
              <p className="flex justify-between font-bold text-amber-600 border-t pt-1 mt-1">
                <span>Requested Discount (-):</span>
                <span className="font-mono">-{formatCurrency(selectedQuotation?.discountRequested || 0)}</span>
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-zinc-650 uppercase tracking-wider">Approved Discount Amount (₹)</Label>
              <Input 
                type="number"
                placeholder="Enter approved discount amount" 
                value={approvedDiscount}
                onChange={(e) => setApprovedDiscount(e.target.value)}
                className="h-10 text-sm font-bold bg-white focus:ring-emerald-500 focus:border-emerald-500"
              />
              <p className="text-[10px] text-zinc-400">
                You can reduce or increase the discount before final approval.
              </p>
            </div>
            {selectedQuotation && (
              <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-xs flex justify-between items-center font-bold text-emerald-800">
                <span>New Net Payable Price:</span>
                <span className="font-mono text-sm">
                  {formatCurrency(
                    Math.round(
                      (selectedQuotation.totalCost || 0) + 
                      (selectedQuotation.salesMarkup || 0) - 
                      (parseFloat(approvedDiscount) || 0)
                    )
                  )}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="h-9 text-xs" onClick={() => setIsApproveDialogOpen(false)}>Cancel</Button>
            <Button className="h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold" onClick={handleApproveConfirm}>Confirm Approval</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isConvertDialogOpen} onOpenChange={setIsConvertDialogOpen}>
        <DialogContent className="max-w-md sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-600" />
              Convert to Order
            </DialogTitle>
            <DialogDescription>
              Select the company to which this order belongs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Company</Label>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger className="w-full bg-white border-zinc-300">
                  <SelectValue placeholder="Choose a company...">
                    {companies.find(c => c.id === selectedCompanyId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {companies.length === 0 && (
                <p className="text-xs text-rose-500 font-semibold mt-1">
                  ⚠️ No companies found. Please add a company in settings config first.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsConvertDialogOpen(false)}>Cancel</Button>
            <Button 
              className="bg-indigo-600 hover:bg-indigo-700 text-white" 
              onClick={confirmConvertToOrder}
              disabled={companies.length === 0 || !selectedCompanyId}
            >
              Confirm Convert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Smart Cut Plan Dialog ─────────────────────────────────────────── */}
      <Dialog open={isSmartCutDialogOpen} onOpenChange={(open) => { if (!open) { setIsSmartCutDialogOpen(false); setSmartCutPlan(null); } }}>
        <DialogContent className="max-w-4xl sm:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <div className="p-1.5 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-lg">
                <Scissors className="h-4 w-4 text-white" />
              </div>
              Smart Cutting Plan
              {smartCutQuotation && (
                <span className="text-sm font-normal text-zinc-500 ml-1">
                  — Order #{smartCutQuotation.orderNumber} ({smartCutQuotation.clientName})
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              AI-optimised cut allocation across your inventory rolls. Largest items placed first to minimise scrap.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {smartCutLoading && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-4 border-violet-100 border-t-violet-600 animate-spin" />
                  <Zap className="h-5 w-5 text-violet-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
                <p className="text-sm font-semibold text-zinc-600 animate-pulse">Running bin-packing optimiser…</p>
                <p className="text-xs text-zinc-400">Analysing {smartCutQuotation?.items?.length || 1} items across available rolls</p>
              </div>
            )}

            {!smartCutLoading && smartCutPlan && (
              <>
                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-center">
                    <p className="text-xs font-bold uppercase tracking-wider text-violet-500 mb-1">Items Allocated</p>
                    <p className="text-2xl font-black text-violet-900">{smartCutPlan.allocations?.length || 0}</p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-center">
                    <p className="text-xs font-bold uppercase tracking-wider text-indigo-500 mb-1">Rolls Used</p>
                    <p className="text-2xl font-black text-indigo-900">{smartCutPlan.rollsUsed?.length || 0}</p>
                  </div>
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-500 mb-1">Total Scrap</p>
                    <p className="text-2xl font-black text-emerald-900">{(smartCutPlan.totalScrapSqm || 0).toFixed(3)} m²</p>
                  </div>
                </div>

                {/* Warnings */}
                {smartCutPlan.warnings?.length > 0 && (
                  <div className="space-y-2">
                    {smartCutPlan.warnings.map((w: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                        <TriangleAlert className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        <span className="font-medium">{w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Allocation Table */}
                <div className="border border-zinc-200 rounded-xl overflow-hidden">
                  <div className="bg-zinc-50/80 px-4 py-2.5 border-b border-zinc-200 flex items-center gap-2">
                    <Package className="h-4 w-4 text-zinc-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">Cut Allocations</span>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-zinc-50">
                        <TableRow>
                          <TableHead className="text-xs font-bold w-[40px] text-center">No.</TableHead>
                          <TableHead className="text-xs font-bold">Item</TableHead>
                          <TableHead className="text-xs font-bold">Belt Type</TableHead>
                          <TableHead className="text-xs font-bold">Dimensions (m)</TableHead>
                          <TableHead className="text-xs font-bold">Area (m²)</TableHead>
                          <TableHead className="text-xs font-bold">Roll / Source</TableHead>
                          <TableHead className="text-xs font-bold">Position</TableHead>
                          <TableHead className="text-xs font-bold text-right">Scrap After</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(smartCutPlan.allocations || []).map((alloc: any, i: number) => (
                          <TableRow key={i} className="hover:bg-zinc-50/50 transition-colors">
                            <TableCell className="text-center font-bold text-zinc-500 text-xs">{i + 1}</TableCell>
                            <TableCell className="text-xs font-semibold text-zinc-800">{alloc.itemLabel}</TableCell>
                            <TableCell className="text-xs text-zinc-600">{alloc.beltType || '—'}</TableCell>
                            <TableCell className="font-mono text-xs text-zinc-700">
                              {alloc.lengthM?.toFixed(3)} L × {alloc.widthM?.toFixed(3)} W
                            </TableCell>
                            <TableCell className="font-mono text-xs text-zinc-700">{alloc.areaSqm?.toFixed(4)}</TableCell>
                            <TableCell>
                              {alloc.source === 'fresh_roll' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-[10px] font-black uppercase">
                                  <TriangleAlert className="h-3 w-3" /> Fresh Roll Needed
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-[10px] font-black font-mono">
                                  <CheckCircle2 className="h-3 w-3" /> {alloc.rollId?.slice(0, 14)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-zinc-500">
                              {alloc.source === 'fresh_roll' ? '—' : `x:${alloc.x?.toFixed(2)}m y:${alloc.y?.toFixed(2)}m`}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs font-bold text-zinc-700">
                              {alloc.source === 'fresh_roll' ? '—' : `${alloc.scrapAfter?.toFixed(3)} m²`}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {smartCutPlan.warnings?.some((w: string) => w.includes('fresh roll')) && (
                  <p className="text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                    ℹ️ Items marked "Fresh Roll Needed" have no matching inventory roll available. Add rolls in <strong>Nesting Portal → Inventory</strong> and re-run Smart Cut, or proceed to execute manually.
                  </p>
                )}
              </>
            )}
          </div>

          <DialogFooter className="border-t pt-4 gap-2">
            <Button variant="outline" onClick={() => { setIsSmartCutDialogOpen(false); setSmartCutPlan(null); }}>
              Cancel
            </Button>
            {!smartCutLoading && smartCutPlan && (
              <Button
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white gap-2 font-bold shadow-lg shadow-indigo-200 transition-all duration-200"
                onClick={handleConfirmSmartCut}
                disabled={smartCutConfirming}
              >
                {smartCutConfirming ? (
                  <>
                    <div className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Executing…
                  </>
                ) : (
                  <>
                    <Scissors className="h-4 w-4" />
                    Confirm & Execute Order
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
