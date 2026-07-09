import React, { useState, useEffect, useMemo } from 'react';
import { Quotation, Client, Config } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { formatCurrency, cn } from '../lib/utils';
import { calculateCosting } from '../lib/calculations';
import { Calendar, Download, Printer, TrendingUp, IndianRupee, Building2, ShoppingBag, Percent, BarChart3, AlertCircle, Package, Layers, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Badge } from './ui/badge';

interface ReportsProps {
  config: Config;
  clients: Client[];
}

const convertToDate = (dateVal: any): Date => {
  if (!dateVal) return new Date(0);
  const date = (typeof dateVal === 'object' && 'toDate' in dateVal) ? dateVal.toDate() : new Date(dateVal);
  return isNaN(date.getTime()) ? new Date(0) : date;
};

const formatLocalDate = (date: Date): string => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

export const Reports: React.FC<ReportsProps> = ({ config, clients }) => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [activeReportCard, setActiveReportCard] = useState<'purchase' | 'profitability' | 'company' | 'inventory' | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string>('this-month');
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [selectedOrderForModal, setSelectedOrderForModal] = useState<Quotation | null>(null);

  // Date range dialog state
  const [showDateRangeDialog, setShowDateRangeDialog] = useState(false);
  const [pendingReportCard, setPendingReportCard] = useState<'purchase' | 'profitability' | 'company' | 'inventory' | null>(null);
  const [dialogStartDate, setDialogStartDate] = useState<string>('');
  const [dialogEndDate, setDialogEndDate] = useState<string>('');
  const [dialogPreset, setDialogPreset] = useState<string>('this-month');

  // Inventory (rolls) state
  const [rolls, setRolls] = useState<any[]>([]);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

  // Default date range: current month start to today
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    return formatLocalDate(new Date(d.getFullYear(), d.getMonth(), 1));
  });
  const [endDate, setEndDate] = useState<string>(() => {
    return formatLocalDate(new Date());
  });

  const handlePresetClick = (preset: string) => {
    const today = new Date();
    let start = new Date();
    let end = new Date();

    switch (preset) {
      case 'today':
        start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        break;
      case 'yesterday':
        start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
        end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
        break;
      case 'this-week': {
        const day = today.getDay();
        const diff = today.getDate() - day + (day === 0 ? -6 : 1);
        start = new Date(today.getFullYear(), today.getMonth(), diff);
        end = new Date();
        break;
      }
      case 'last-7-days':
        start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
        end = new Date();
        break;
      case 'this-month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = new Date();
        break;
      case 'last-month':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
        break;
      case 'last-30-days':
        start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30);
        end = new Date();
        break;
      default:
        return;
    }

    setStartDate(formatLocalDate(start));
    setEndDate(formatLocalDate(end));
  };

  useEffect(() => {
    fetch('/api/quotations')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setQuotations(data); })
      .catch(err => console.error('Failed to fetch quotations in reports:', err));

    fetch('/api/companies')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setCompanies(data); })
      .catch(err => console.error('Failed to fetch companies in reports:', err));

    fetch('/api/rolls')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setRolls(data); })
      .catch(err => console.error('Failed to fetch rolls in reports:', err));
  }, []);

  // Helper: open date range dialog for a specific report
  const openReportWithDatePicker = (card: 'purchase' | 'profitability' | 'company' | 'inventory') => {
    setPendingReportCard(card);
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    setDialogStartDate(formatLocalDate(firstOfMonth));
    setDialogEndDate(formatLocalDate(today));
    setDialogPreset('this-month');
    setShowDateRangeDialog(true);
  };

  const handleDialogPreset = (preset: string) => {
    setDialogPreset(preset);
    const today = new Date();
    let start = new Date(), end = new Date();
    switch (preset) {
      case 'today': start = end = new Date(today.getFullYear(), today.getMonth(), today.getDate()); break;
      case 'yesterday': start = end = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1); break;
      case 'this-week': { const d = today.getDay(); const diff = today.getDate() - d + (d === 0 ? -6 : 1); start = new Date(today.getFullYear(), today.getMonth(), diff); end = new Date(); break; }
      case 'this-month': start = new Date(today.getFullYear(), today.getMonth(), 1); end = new Date(); break;
      case 'last-month': start = new Date(today.getFullYear(), today.getMonth() - 1, 1); end = new Date(today.getFullYear(), today.getMonth(), 0); break;
      case 'last-30-days': start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 30); end = new Date(); break;
      default: return;
    }
    setDialogStartDate(formatLocalDate(start));
    setDialogEndDate(formatLocalDate(end));
  };

  const confirmReportDateRange = () => {
    if (!dialogStartDate || !dialogEndDate) { toast.error('Please select both start and end dates.'); return; }
    setStartDate(dialogStartDate);
    setEndDate(dialogEndDate);
    setSelectedPreset(dialogPreset);
    setActiveReportCard(pendingReportCard);
    setSelectedCompany('all');
    setShowDateRangeDialog(false);
  };

  // Inventory: group rolls by materialType
  const inventoryByProduct = useMemo((): Record<string, { rolls: any[]; totalRemaining: number; totalSqm: number }> => {
    const active = rolls.filter(r => !r.isArchived && r.status !== 'refused');
    const map: Record<string, { rolls: any[]; totalRemaining: number; totalSqm: number }> = {};
    active.forEach(r => {
      const key = r.materialType || 'Unknown';
      if (!map[key]) map[key] = { rolls: [], totalRemaining: 0, totalSqm: 0 };
      map[key].rolls.push(r);
      map[key].totalRemaining += r.remainingSqm || 0;
      map[key].totalSqm += r.totalSqm || 0;
    });
    return map;
  }, [rolls]);

  // Filter orders and calculate costs on-the-fly
  const filteredOrders = useMemo(() => {
    const orders = quotations.filter(q => q.status === 'order' || q.status === 'executed');
    if (!startDate && !endDate) return [];

    const start = startDate ? new Date(startDate) : new Date(0);
    start.setHours(0, 0, 0, 0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);

    return orders
      .filter(q => {
        const orderDate = q.updatedAt || q.createdAt;
        if (!orderDate) return false;
        const qDate = convertToDate(orderDate);
        return qDate >= start && qDate <= end;
      })
      .map(q => {
        if (q.items && q.items.length > 0) {
          const itemsSubtotal = q.items.reduce((sum, item) => sum + (item.calculated?.summary?.subtotal || 0), 0);
          const itemsTotalWithProfit = q.items.reduce((sum, item) => sum + (item.calculated?.summary?.totalWithProfit || 0), 0);
          const itemsProfit = q.items.reduce((sum, item) => sum + (item.calculated?.summary?.profit || 0), 0);
          const itemsProfitMarginUsed = q.items.length > 0 
            ? q.items.reduce((sum, item) => sum + (item.calculated?.summary?.profitMarginUsed || 0), 0) / q.items.length
            : 0;

          return {
            ...q,
            calculated: {
              summary: {
                subtotal: itemsSubtotal,
                totalWithProfit: itemsTotalWithProfit,
                profit: itemsProfit,
                profitMarginUsed: itemsProfitMarginUsed
              }
            }
          };
        }

        const client = clients?.find(c => c.id === q.clientId) || null;
        const clientProfitRanges = client?.profitMargins?.[q.beltType] || [];
        const category = config?.beltTypes?.find(t => t.name === q.beltType) || null;
        const style = category?.styles?.find(s => s.name === q.beltStyle) || null;

        const included = q.selectedBOMOptions?._included;
        const customRates = q.selectedBOMOptions?._customRates || {};
        const customBOM = (style?.bom || [])
          .filter(item => !included || included[item.id] !== false)
          .map(item => {
            const selectedOptIdx = q.selectedBOMOptions?.[item.id];
            let rate = item.rate;
            let unit = item.unit;
            let name = item.name;
            let formula = item.formula;

            if (selectedOptIdx !== undefined && item.options && item.options[selectedOptIdx]) {
              const opt = item.options[selectedOptIdx];
              rate = opt.rate;
              unit = opt.unit || item.unit;
              name = opt.name ? opt.name.trim() : item.name;
              formula = opt.formula || item.formula;
            }

            if (customRates[item.id] !== undefined) {
              rate = customRates[item.id];
            }

            return {
              ...item,
              rate,
              unit,
              name,
              formula
            };
          });

        const costingParams = {
          length: q.dimensions.length,
          lengthUnit: q.dimensions.lengthUnit || q.dimensions.unit || 'mm',
          width: q.dimensions.width,
          widthUnit: q.dimensions.widthUnit || q.dimensions.unit || 'mm',
          beltType: q.beltType,
          hasHoles: q.dimensions.hasHoles,
          holeSize: q.dimensions.holeSize,
          holeDistHorizontal: q.dimensions.holeDistHorizontal,
          holeDistVertical: q.dimensions.holeDistVertical,
          pricePerHole: q.dimensions.pricePerHole,
        };

        const result = calculateCosting(costingParams, config, clientProfitRanges, customBOM, {});
        
        return {
          ...q,
          calculated: result
        };
      })
      .sort((a, b) => convertToDate(b.updatedAt || b.createdAt).getTime() - convertToDate(a.updatedAt || a.createdAt).getTime());
  }, [quotations, startDate, endDate, config, clients]);

  // Aggregated calculations for Reports
  const totalMaterialSubtotal = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.calculated?.summary?.subtotal || 0), 0);
  }, [filteredOrders]);

  const totalBasePrice = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.calculated?.summary?.totalWithProfit || 0), 0);
  }, [filteredOrders]);

  const totalProfitMarginCash = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (o.calculated?.summary?.profit || 0), 0);
  }, [filteredOrders]);

  const avgProfitMarginPct = useMemo(() => {
    if (filteredOrders.length === 0) return 0;
    const sum = filteredOrders.reduce((acc, o) => acc + (o.calculated?.summary?.profitMarginUsed || 0), 0);
    return sum / filteredOrders.length;
  }, [filteredOrders]);

  // Dynamic Company mapping
  const activeCompaniesList = useMemo(() => {
    const names = new Set(companies.map(c => c.name));
    names.add('Pooja Tekno Belt');
    return Array.from(names);
  }, [companies]);

  // Dynamic filter for company reports
  const displayOrders = useMemo(() => {
    if (activeReportCard === 'company' && selectedCompany !== 'all') {
      return filteredOrders.filter(o => (o.company || 'Pooja Tekno Belt') === selectedCompany);
    }
    return filteredOrders;
  }, [filteredOrders, activeReportCard, selectedCompany]);

  const companySalesMap = useMemo(() => {
    const map: Record<string, number> = {};
    activeCompaniesList.forEach(name => {
      map[name] = 0;
    });
    filteredOrders.forEach(o => {
      const compName = o.company || 'Pooja Tekno Belt';
      if (activeCompaniesList.includes(compName)) {
        map[compName] = (map[compName] || 0) + o.totalCost;
      } else {
        // Add to default/first company if not matching
        const defaultComp = activeCompaniesList[0] || 'Pooja Tekno Belt';
        map[defaultComp] = (map[defaultComp] || 0) + o.totalCost;
      }
    });
    return map;
  }, [filteredOrders, activeCompaniesList]);

  // Export CSV Handler
  const handleExportCSV = () => {
    if (filteredOrders.length === 0) {
      toast.error('No orders to export in selected date range.');
      return;
    }

    let headers: string[] = [];
    let rows: string[][] = [];

    if (activeReportCard === 'purchase') {
      headers = ['Order ID', 'Date', 'Client', 'Material Subtotal'];
      rows = filteredOrders.map(o => [
        `#${o.orderNumber || ''}`,
        convertToDate(o.updatedAt || o.createdAt).toLocaleDateString('en-IN'),
        o.clientName,
        Math.round(o.calculated?.summary?.subtotal || 0).toString()
      ]);
      rows.push(['GRAND TOTAL', '', '', Math.round(totalMaterialSubtotal).toString()]);
    } else if (activeReportCard === 'profitability') {
      headers = ['Order ID', 'Date', 'Client', 'Base Price', 'Profit Margin (Cash)', 'Profit Margin (%)'];
      rows = filteredOrders.map(o => [
        `#${o.orderNumber || ''}`,
        convertToDate(o.updatedAt || o.createdAt).toLocaleDateString('en-IN'),
        o.clientName,
        Math.round(o.calculated?.summary?.totalWithProfit || 0).toString(),
        Math.round(o.calculated?.summary?.profit || 0).toString(),
        (o.calculated?.summary?.profitMarginUsed || 0).toFixed(1) + '%'
      ]);
      rows.push(['GRAND TOTAL', '', '', Math.round(totalBasePrice).toString(), Math.round(totalProfitMarginCash).toString(), 'Avg: ' + avgProfitMarginPct.toFixed(1) + '%']);
    } else if (activeReportCard === 'company') {
      headers = ['Order ID', 'Date', 'Client', 'Company', 'Final Selling Price'];
      rows = displayOrders.map(o => [
        `#${o.orderNumber || ''}`,
        convertToDate(o.updatedAt || o.createdAt).toLocaleDateString('en-IN'),
        o.clientName,
        o.company || 'Pooja Tekno Belt',
        Math.round(o.totalCost).toString()
      ]);
      const grandTotalFinal = displayOrders.reduce((sum, o) => sum + o.totalCost, 0);
      rows.push(['GRAND TOTAL', '', '', '', Math.round(grandTotalFinal).toString()]);
    }

    const csvContent = [headers, ...rows]
      .map(e => e.map(val => `"${val.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeReportCard}_report_${startDate}_to_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('CSV Report exported successfully.');
  };

  // Print Report Handler
  const handlePrintReport = () => {
    if (filteredOrders.length === 0) {
      toast.error('No orders to print in selected date range.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let reportTitle = '';
    let tableHeaders = '';
    let tableRows = '';
    let totalsHeader = '';

    const formattedStart = startDate ? new Date(startDate).toLocaleDateString('en-IN') : 'Start';
    const formattedEnd = endDate ? new Date(endDate).toLocaleDateString('en-IN') : 'End';

    if (activeReportCard === 'purchase') {
      reportTitle = 'Purchase Cost Report';
      tableHeaders = '<th>Order ID</th><th>Date</th><th>Client</th><th style="text-align: right;">Material Subtotal</th>';
      tableRows = filteredOrders.map(o => `
        <tr>
          <td>#${o.orderNumber || ''}</td>
          <td>${convertToDate(o.updatedAt || o.createdAt).toLocaleDateString('en-IN')}</td>
          <td>${o.clientName}</td>
          <td style="text-align: right;">${formatCurrency(o.calculated?.summary?.subtotal || 0)}</td>
        </tr>
      `).join('');
      totalsHeader = `<h3>Total Material Subtotal: ${formatCurrency(totalMaterialSubtotal)}</h3>`;
    } else if (activeReportCard === 'profitability') {
      reportTitle = 'Order Profitability Report';
      tableHeaders = '<th>Order ID</th><th>Date</th><th>Client</th><th style="text-align: right;">Base Price</th><th style="text-align: right;">Profit Margin (₹)</th><th style="text-align: right;">Profit Margin (%)</th>';
      tableRows = filteredOrders.map(o => `
        <tr>
          <td>#${o.orderNumber || ''}</td>
          <td>${convertToDate(o.updatedAt || o.createdAt).toLocaleDateString('en-IN')}</td>
          <td>${o.clientName}</td>
          <td style="text-align: right;">${formatCurrency(o.calculated?.summary?.totalWithProfit || 0)}</td>
          <td style="text-align: right;">${formatCurrency(o.calculated?.summary?.profit || 0)}</td>
          <td style="text-align: right;">${(o.calculated?.summary?.profitMarginUsed || 0).toFixed(1)}%</td>
        </tr>
      `).join('');
      totalsHeader = `
        <h3>Total Base Price: ${formatCurrency(totalBasePrice)}</h3>
        <h3>Total Profit Margin (₹): ${formatCurrency(totalProfitMarginCash)}</h3>
        <h3>Average Profit Margin (%): ${avgProfitMarginPct.toFixed(1)}%</h3>
      `;
    } else if (activeReportCard === 'company') {
      reportTitle = `Company Sales Report (${selectedCompany === 'all' ? 'All Companies' : selectedCompany})`;
      tableHeaders = '<th>Order ID</th><th>Date</th><th>Client</th><th>Company</th><th style="text-align: right;">Final Selling Price</th>';
      tableRows = displayOrders.map(o => `
        <tr>
          <td>#${o.orderNumber || ''}</td>
          <td>${convertToDate(o.updatedAt || o.createdAt).toLocaleDateString('en-IN')}</td>
          <td>${o.clientName}</td>
          <td>${o.company || 'Pooja Tekno Belt'}</td>
          <td style="text-align: right;">${formatCurrency(o.totalCost)}</td>
        </tr>
      `).join('');
      
      if (selectedCompany === 'all') {
        totalsHeader = activeCompaniesList.map(comp => `
          <h3>Total ${comp}: ${formatCurrency(companySalesMap[comp] || 0)}</h3>
        `).join('');
      } else {
        totalsHeader = `<h3>Total ${selectedCompany}: ${formatCurrency(displayOrders.reduce((sum, o) => sum + o.totalCost, 0))}</h3>`;
      }
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${reportTitle}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #18181b; }
            h1 { font-size: 20px; font-weight: bold; margin-bottom: 5px; }
            h3 { font-size: 14px; font-weight: bold; margin: 5px 0; }
            p { font-size: 12px; color: #71717a; margin-top: 0; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #e4e4e7; padding: 8px; font-size: 11px; text-align: left; }
            th { background-color: #f4f4f5; font-weight: bold; }
            tr:nth-child(even) { background-color: #fafafa; }
            .totals-section { margin-bottom: 20px; border-bottom: 2px solid #18181b; padding-bottom: 10px; }
          </style>
        </head>
        <body>
          <h1>${reportTitle}</h1>
          <p>Date Range: ${formattedStart} to ${formattedEnd}</p>
          <div class="totals-section">
            ${totalsHeader}
          </div>
          <table>
            <thead>
              <tr>${tableHeaders}</tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const inventoryEntries = Object.entries(inventoryByProduct) as [string, { rolls: any[]; totalRemaining: number; totalSqm: number }][];
  const inventoryValues = Object.values(inventoryByProduct) as { rolls: any[]; totalRemaining: number; totalSqm: number }[];

  return (
    <div className="space-y-6 w-full pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-zinc-950 rounded-xl text-white shadow-md">
            <BarChart3 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-900">Reports Dashboard</h1>
            <p className="text-xs text-zinc-500 font-bold mt-0.5">Generate, analyze, and export business reports</p>
          </div>
        </div>
      </div>

      {/* ── PERSISTENT FILTER BAR ── */}
      <Card className="border-zinc-200 bg-white/80 backdrop-blur-md shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-4 flex flex-col xl:flex-row items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
            <span className="text-xs font-black uppercase text-zinc-400 tracking-wider mr-2 flex items-center gap-1">
              <Calendar size={14} /> Date Range:
            </span>
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'this-week', label: 'This Week' },
              { id: 'this-month', label: 'This Month' },
              { id: 'last-month', label: 'Last Month' },
              { id: 'last-30-days', label: '30 Days' },
            ].map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  handlePresetClick(preset.id);
                  setSelectedPreset(preset.id);
                }}
                className={cn(
                  "py-1.5 px-3 rounded-lg border text-xs font-bold transition-all duration-200 cursor-pointer",
                  selectedPreset === preset.id
                    ? "bg-zinc-950 text-white border-zinc-950 shadow-sm"
                    : "bg-zinc-50 border-zinc-200 text-zinc-650 hover:bg-zinc-105 hover:border-zinc-300"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          
          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-end">
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setSelectedPreset('custom');
                }}
                className="bg-white border-zinc-300 focus:ring-zinc-950 text-xs font-semibold h-9 w-36 rounded-lg px-2"
              />
              <span className="text-zinc-400 text-xs font-bold">to</span>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setSelectedPreset('custom');
                }}
                className="bg-white border-zinc-300 focus:ring-zinc-950 text-xs font-semibold h-9 w-36 rounded-lg px-2"
              />
            </div>

            {activeReportCard && (
              <div className="flex items-center gap-2 border-t sm:border-t-0 sm:border-l border-zinc-200 pt-2 sm:pt-0 sm:pl-3 w-full sm:w-auto justify-end">
                <Button
                  onClick={handleExportCSV}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white h-9 text-xs font-bold px-3.5 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Download size={13} /> Export CSV
                </Button>
                <Button
                  onClick={handlePrintReport}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white h-9 text-xs font-bold px-3.5 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Printer size={13} /> Print
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── TOP: Five dynamic navigation cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        
        {/* Card 0: Overview Dashboard */}
        <button type="button" onClick={() => { setActiveReportCard(null); setSelectedCompany('all'); }}
          className={`group w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex items-center gap-3 shadow-sm hover:shadow-md ${
            activeReportCard === null ? 'bg-zinc-950 border-zinc-950 text-white shadow-lg scale-[1.01]' : 'bg-white border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50/50'
          }`}>
          <div className={`p-2.5 rounded-xl shrink-0 transition-transform group-hover:scale-110 ${activeReportCard === null ? 'bg-white/10' : 'bg-zinc-100'}`}>
            <BarChart3 size={18} className={activeReportCard === null ? 'text-white' : 'text-zinc-700'} />
          </div>
          <div>
            <p className={`text-[9px] font-black uppercase tracking-wider ${activeReportCard === null ? 'text-zinc-400' : 'text-zinc-500'}`}>Main</p>
            <h3 className={`text-sm font-black leading-snug mt-0.5 ${activeReportCard === null ? 'text-white' : 'text-zinc-950'}`}>Overview</h3>
            <p className={`text-[9px] font-bold mt-0.5 leading-normal ${activeReportCard === null ? 'text-zinc-400' : 'text-zinc-500'}`}>Dashboard & KPIs</p>
          </div>
        </button>

        {/* Card 1: Purchase Cost */}
        <button type="button" onClick={() => openReportWithDatePicker('purchase')}
          className={`group w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex items-center gap-3 shadow-sm hover:shadow-md ${
            activeReportCard === 'purchase' ? 'bg-zinc-950 border-zinc-950 text-white shadow-lg scale-[1.01]' : 'bg-white border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50/50'
          }`}>
          <div className={`p-2.5 rounded-xl shrink-0 transition-transform group-hover:scale-110 ${activeReportCard === 'purchase' ? 'bg-white/10' : 'bg-zinc-100'}`}>
            <IndianRupee size={18} className={activeReportCard === 'purchase' ? 'text-white' : 'text-zinc-700'} />
          </div>
          <div>
            <p className={`text-[9px] font-black uppercase tracking-wider ${activeReportCard === 'purchase' ? 'text-zinc-400' : 'text-zinc-500'}`}>Report #1</p>
            <h3 className={`text-sm font-black leading-snug mt-0.5 ${activeReportCard === 'purchase' ? 'text-white' : 'text-zinc-950'}`}>Purchase Cost</h3>
            <p className={`text-[9px] font-bold mt-0.5 leading-normal ${activeReportCard === 'purchase' ? 'text-zinc-400' : 'text-zinc-500'}`}>Material cost</p>
          </div>
        </button>

        {/* Card 2: Order Profitability */}
        <button type="button" onClick={() => openReportWithDatePicker('profitability')}
          className={`group w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex items-center gap-3 shadow-sm hover:shadow-md ${
            activeReportCard === 'profitability' ? 'bg-emerald-700 border-emerald-700 text-white shadow-lg scale-[1.01]' : 'bg-white border-zinc-200 hover:border-emerald-400 hover:bg-zinc-50/50'
          }`}>
          <div className={`p-2.5 rounded-xl shrink-0 transition-transform group-hover:scale-110 ${activeReportCard === 'profitability' ? 'bg-white/15' : 'bg-emerald-50'}`}>
            <TrendingUp size={18} className={activeReportCard === 'profitability' ? 'text-white' : 'text-emerald-700'} />
          </div>
          <div>
            <p className={`text-[9px] font-black uppercase tracking-wider ${activeReportCard === 'profitability' ? 'text-emerald-100' : 'text-zinc-500'}`}>Report #2</p>
            <h3 className={`text-sm font-black leading-snug mt-0.5 ${activeReportCard === 'profitability' ? 'text-white' : 'text-zinc-950'}`}>Profitability</h3>
            <p className={`text-[9px] font-bold mt-0.5 leading-normal ${activeReportCard === 'profitability' ? 'text-emerald-100' : 'text-zinc-500'}`}>Profit margins</p>
          </div>
        </button>

        {/* Card 3: Company Sales */}
        <button type="button" onClick={() => openReportWithDatePicker('company')}
          className={`group w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex items-center gap-3 shadow-sm hover:shadow-md ${
            activeReportCard === 'company' ? 'bg-indigo-700 border-indigo-700 text-white shadow-lg scale-[1.01]' : 'bg-white border-zinc-200 hover:border-indigo-400 hover:bg-zinc-50/50'
          }`}>
          <div className={`p-2.5 rounded-xl shrink-0 transition-transform group-hover:scale-110 ${activeReportCard === 'company' ? 'bg-white/15' : 'bg-indigo-50'}`}>
            <Building2 size={18} className={activeReportCard === 'company' ? 'text-white' : 'text-indigo-700'} />
          </div>
          <div>
            <p className={`text-[9px] font-black uppercase tracking-wider ${activeReportCard === 'company' ? 'text-indigo-100' : 'text-zinc-500'}`}>Report #3</p>
            <h3 className={`text-sm font-black leading-snug mt-0.5 ${activeReportCard === 'company' ? 'text-white' : 'text-zinc-950'}`}>Company Sales</h3>
            <p className={`text-[9px] font-bold mt-0.5 leading-normal ${activeReportCard === 'company' ? 'text-indigo-100' : 'text-zinc-500'}`}>By company</p>
          </div>
        </button>

        {/* Card 4: Inventory / Roll Balance */}
        <button type="button" onClick={() => { setActiveReportCard('inventory'); setSelectedCompany('all'); }}
          className={`group w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex items-center gap-3 shadow-sm hover:shadow-md ${
            activeReportCard === 'inventory' ? 'bg-amber-600 border-amber-600 text-white shadow-lg scale-[1.01]' : 'bg-white border-zinc-200 hover:border-amber-400 hover:bg-amber-50/30'
          }`}>
          <div className={`p-2.5 rounded-xl shrink-0 transition-transform group-hover:scale-110 ${activeReportCard === 'inventory' ? 'bg-white/15' : 'bg-amber-50'}`}>
            <Package size={18} className={activeReportCard === 'inventory' ? 'text-white' : 'text-amber-600'} />
          </div>
          <div>
            <p className={`text-[9px] font-black uppercase tracking-wider ${activeReportCard === 'inventory' ? 'text-amber-100' : 'text-zinc-500'}`}>Report #4</p>
            <h3 className={`text-sm font-black leading-snug mt-0.5 ${activeReportCard === 'inventory' ? 'text-white' : 'text-zinc-950'}`}>Roll Balance</h3>
            <p className={`text-[9px] font-bold mt-0.5 leading-normal ${activeReportCard === 'inventory' ? 'text-amber-100' : 'text-zinc-500'}`}>Product inventory</p>
          </div>
        </button>

      </div>

      {/* ── Date Range Picker Dialog ── */}
      <Dialog open={showDateRangeDialog} onOpenChange={(open) => { if (!open) setShowDateRangeDialog(false); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base font-black flex items-center gap-2">
              <Calendar size={18} />
              Date Range Select Karein
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              {pendingReportCard === 'purchase' && 'Purchase Cost Report ke liye date range select karein'}
              {pendingReportCard === 'profitability' && 'Order Profitability Report ke liye date range select karein'}
              {pendingReportCard === 'company' && 'Company Sales Report ke liye date range select karein'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'today', label: 'Aaj' },
                { id: 'yesterday', label: 'Kal' },
                { id: 'this-week', label: 'Is Hafte' },
                { id: 'this-month', label: 'Is Mahine' },
                { id: 'last-month', label: 'Pichle Mahine' },
                { id: 'last-30-days', label: '30 Din' },
              ].map(p => (
                <button key={p.id} type="button"
                  onClick={() => handleDialogPreset(p.id)}
                  className={cn('py-1.5 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer',
                    dialogPreset === p.id ? 'bg-zinc-950 text-white border-zinc-950' : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                  )}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-600">Shuru Ki Tarikh</Label>
                <Input type="date" value={dialogStartDate} onChange={e => { setDialogStartDate(e.target.value); setDialogPreset('custom'); }} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-600">Khatam Ki Tarikh</Label>
                <Input type="date" value={dialogEndDate} onChange={e => { setDialogEndDate(e.target.value); setDialogPreset('custom'); }} className="h-9 text-sm" />
              </div>
            </div>
            {dialogStartDate && dialogEndDate && (
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 text-xs font-semibold text-zinc-600">
                📅 {new Date(dialogStartDate).toLocaleDateString('en-IN')} se {new Date(dialogEndDate).toLocaleDateString('en-IN')} tak
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="h-9 text-xs" onClick={() => setShowDateRangeDialog(false)}>Cancel</Button>
            <Button className="h-9 text-xs gap-1.5" onClick={confirmReportDateRange}>
              <BarChart3 size={13} /> Report Dekho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── BOTTOM CONTENT ── */}
      {activeReportCard === null ? (
        /* Executive Overview Tab */
        <div className="space-y-6 animate-in fade-in slide-in-from-top-3 duration-300">
          
          {/* Overview KPI Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* KPI 1: Gross Sales */}
            <Card className="border-zinc-200 shadow-sm bg-white rounded-2xl overflow-hidden relative group hover:shadow-md transition-shadow">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-400 to-indigo-600" />
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3.5 bg-indigo-50 rounded-xl text-indigo-700 shrink-0">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Gross Sales Volume</p>
                  <h3 className="text-2xl font-black text-zinc-950 mt-0.5 font-mono">
                    {formatCurrency(filteredOrders.reduce((sum, o) => sum + o.totalCost, 0))}
                  </h3>
                  <p className="text-[10px] text-zinc-500 font-bold mt-0.5">Total final revenue generated</p>
                </div>
              </CardContent>
            </Card>

            {/* KPI 2: Profit Margin */}
            <Card className="border-zinc-200 shadow-sm bg-white rounded-2xl overflow-hidden relative group hover:shadow-md transition-shadow">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-emerald-600" />
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3.5 bg-emerald-50 rounded-xl text-emerald-700 shrink-0">
                  <Percent className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Estimated Profit</p>
                  <h3 className="text-2xl font-black text-zinc-950 mt-0.5 font-mono">
                    {formatCurrency(totalProfitMarginCash)}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-zinc-500 font-bold">Avg Margin:</span>
                    <Badge className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-1.5 py-0">
                      {avgProfitMarginPct.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* KPI 3: Material Cost */}
            <Card className="border-zinc-200 shadow-sm bg-white rounded-2xl overflow-hidden relative group hover:shadow-md transition-shadow">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 to-amber-600" />
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3.5 bg-amber-50 rounded-xl text-amber-700 shrink-0">
                  <IndianRupee className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Material Cost (BOM)</p>
                  <h3 className="text-2xl font-black text-zinc-950 mt-0.5 font-mono">
                    {formatCurrency(totalMaterialSubtotal)}
                  </h3>
                  <p className="text-[10px] text-zinc-500 font-bold mt-0.5">BOM items subtotal cost</p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Sales Distribution Widget */}
            <Card className="border-zinc-200 shadow-sm bg-white rounded-2xl lg:col-span-1">
              <CardHeader className="pb-3 border-b border-zinc-150">
                <CardTitle className="text-xs font-black uppercase tracking-wider text-zinc-800 flex items-center gap-1.5">
                  <Building2 size={14} className="text-zinc-500" /> Company Sales Split
                </CardTitle>
                <CardDescription className="text-[10px] text-zinc-500 font-bold">Revenue breakdown among company units</CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {(() => {
                  const grandTotalSales = Object.keys(companySalesMap).reduce((sum, key) => sum + (companySalesMap[key] || 0), 0) || 1;
                  return activeCompaniesList.map(compName => {
                    const sales = companySalesMap[compName] || 0;
                    const percentage = (sales / grandTotalSales) * 100;
                    return (
                      <div key={compName} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-zinc-800">{compName}</span>
                          <span className="font-bold font-mono text-zinc-950">{formatCurrency(sales)}</span>
                        </div>
                        <div className="w-full bg-zinc-100 rounded-full h-2 overflow-hidden">
                          <div 
                            className="bg-indigo-650 h-full rounded-full transition-all duration-500" 
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <div className="flex justify-end">
                          <span className="text-[9px] text-zinc-400 font-black tracking-wider uppercase">{percentage.toFixed(1)}% Share</span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </CardContent>
            </Card>

            {/* Recent Orders List */}
            <Card className="border-zinc-200 shadow-sm bg-white rounded-2xl lg:col-span-2 overflow-hidden">
              <CardHeader className="pb-3 border-b border-zinc-150 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xs font-black uppercase tracking-wider text-zinc-800 flex items-center gap-1.5">
                    <ShoppingBag size={14} className="text-zinc-500" /> Recent Orders
                  </CardTitle>
                  <CardDescription className="text-[10px] text-zinc-500 font-bold">Latest order transactions within selected range</CardDescription>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-zinc-50/50">
                      <TableRow>
                        <TableHead className="text-xs font-black text-zinc-500">Order ID</TableHead>
                        <TableHead className="text-xs font-black text-zinc-500">Client</TableHead>
                        <TableHead className="text-xs font-black text-zinc-500">Date</TableHead>
                        <TableHead className="text-xs font-black text-zinc-500">Company</TableHead>
                        <TableHead className="text-xs font-black text-zinc-500 text-right">Selling Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs font-semibold text-zinc-700">
                      {filteredOrders.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-12 text-center text-zinc-400 font-medium italic">
                            No orders found in selected date range.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredOrders.slice(0, 10).map(o => (
                          <TableRow key={o.id} className="hover:bg-zinc-50/35 transition-colors h-10">
                            <TableCell className="font-mono font-bold">
                              <button
                                type="button"
                                onClick={() => setSelectedOrderForModal(o)}
                                className="font-mono font-bold text-indigo-650 hover:text-indigo-800 hover:underline transition-colors bg-transparent border-none cursor-pointer p-0"
                              >
                                #{o.orderNumber || o.id.substring(0, 8)}
                              </button>
                            </TableCell>
                            <TableCell className="font-bold text-zinc-900">{o.clientName}</TableCell>
                            <TableCell>{convertToDate(o.updatedAt || o.createdAt).toLocaleDateString('en-IN')}</TableCell>
                            <TableCell className="font-bold text-zinc-600">{o.company || 'Pooja Tekno Belt'}</TableCell>
                            <TableCell className="text-right font-bold font-mono text-zinc-900">
                              {formatCurrency(o.totalCost)}
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

          {/* ── INFO CARD: Reporting Process Explanation ── */}
          <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm rounded-2xl overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-black text-amber-900 flex items-center gap-2">
                <HelpCircle size={16} className="text-amber-600" />
                Kya Aap Reporting Ka Process Explain Kar Sakte Hai?
              </CardTitle>
              <CardDescription className="text-xs text-amber-700 font-semibold">Mujhe 2 tarah ki reports chahiye — yahan poori detail hai</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Type 1 */}
                <div className="bg-white/80 border border-amber-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 font-black text-sm">1</div>
                    <span className="text-xs font-black text-amber-900">Product Mein Rolls Ka Detail</span>
                  </div>
                  <p className="text-xs text-zinc-600 font-medium leading-relaxed">
                    Ek product mein <strong>kitne rolls hain</strong> aur <strong>un rolls mein kitna balance (sqm) bacha hai</strong> — yeh har roll ke liye alag alag dikhe.
                  </p>
                  <div className="bg-amber-50 rounded-lg p-2.5 text-[10px] font-mono text-amber-800 space-y-1">
                    <div>📦 PTFE — 3 Rolls</div>
                    <div className="ml-4">• Roll #1 → 12.5 sqm</div>
                    <div className="ml-4">• Roll #2 → 8.2 sqm</div>
                    <div className="ml-4">• Roll #3 → 4.1 sqm</div>
                  </div>
                </div>
                {/* Type 2 */}
                <div className="bg-white/80 border border-amber-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-lg bg-orange-100 flex items-center justify-center text-orange-700 font-black text-sm">2</div>
                    <span className="text-xs font-black text-amber-900">Product Ka Total Balance</span>
                  </div>
                  <p className="text-xs text-zinc-600 font-medium leading-relaxed">
                    Us pure product mein <strong>kitna total balance</strong> hai — yaani sare rolls ka balance jodkar ek <strong>grand total</strong>.
                  </p>
                  <div className="bg-orange-50 rounded-lg p-2.5 text-[10px] font-mono text-orange-800 space-y-1">
                    <div>📊 PTFE Total = 24.8 sqm</div>
                    <div>📊 PVC Total = 18.3 sqm</div>
                    <div>📊 PU Total = 9.6 sqm</div>
                    <div className="border-t border-orange-200 pt-1 font-black">Grand Total = 52.7 sqm</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-amber-700 font-bold bg-amber-100 rounded-xl px-4 py-2.5">
                <Package size={14} />
                <span>Iske liye <strong>"Roll Balance" Report</strong> (Report #4) click karein — wahan yeh sab detail dikhega!</span>
              </div>
            </CardContent>
          </Card>

        </div>
      ) : activeReportCard === 'inventory' ? (
        /* ── Inventory / Roll Balance Report ── */
        <div className="space-y-6 animate-in fade-in slide-in-from-top-3 duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-amber-600 text-white shadow-sm">
                <Package size={20} />
              </div>
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-zinc-900">Roll Balance Report</h2>
                <p className="text-xs text-zinc-500 font-bold mt-0.5">Product-wise active rolls aur balance</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-1.5">
              <Layers size={13} className="text-amber-600" />
              <span className="text-xs font-bold text-amber-700">{rolls.filter(r => !r.isArchived && r.status !== 'refused').length} Active Rolls</span>
            </div>
          </div>

          {/* Grand Total Summary Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {inventoryEntries.map(([product, data]) => (
              <Card key={product} className="border-zinc-200 shadow-sm bg-white rounded-2xl overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
                <CardContent className="p-4">
                  <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">{product}</p>
                  <h3 className="text-xl font-black text-zinc-950 mt-0.5 font-mono">{data.totalRemaining.toFixed(1)} <span className="text-xs font-bold text-zinc-400">sqm</span></h3>
                  <p className="text-[10px] text-zinc-500 font-bold mt-0.5">{data.rolls.length} rolls active</p>
                </CardContent>
              </Card>
            ))}
            <Card className="border-amber-200 shadow-sm bg-amber-50 rounded-2xl overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-amber-500 to-red-500" />
              <CardContent className="p-4">
                <p className="text-[10px] font-black uppercase text-amber-600 tracking-wider">Grand Total</p>
                <h3 className="text-xl font-black text-zinc-950 mt-0.5 font-mono">
                  {inventoryValues.reduce((s, d) => s + d.totalRemaining, 0).toFixed(1)} <span className="text-xs font-bold text-zinc-400">sqm</span>
                </h3>
                <p className="text-[10px] text-amber-700 font-bold mt-0.5">{rolls.filter(r => !r.isArchived && r.status !== 'refused').length} rolls total</p>
              </CardContent>
            </Card>
          </div>

          {/* Product-wise Roll Detail */}
          <div className="space-y-4">
            {inventoryEntries.length === 0 ? (
              <Card className="border-zinc-200 shadow-sm">
                <CardContent className="py-12 flex flex-col items-center text-zinc-400">
                  <Package size={40} className="opacity-30 mb-3" />
                  <p className="text-sm font-medium">Koi active rolls nahi mile</p>
                  <p className="text-xs mt-1">BeltcutPro mein rolls add karein</p>
                </CardContent>
              </Card>
            ) : inventoryEntries.map(([product, data]) => (
              <Card key={product} className="border-zinc-200 shadow-sm rounded-2xl overflow-hidden">
                <button type="button" className="w-full text-left"
                  onClick={() => setExpandedProducts(prev => {
                    const next = new Set(prev);
                    next.has(product) ? next.delete(product) : next.add(product);
                    return next;
                  })}>
                  <CardHeader className="pb-3 border-b border-zinc-100 hover:bg-zinc-50/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center">
                          <Package size={16} className="text-amber-600" />
                        </div>
                        <div>
                          <CardTitle className="text-sm font-black text-zinc-900">{product}</CardTitle>
                          <CardDescription className="text-xs">{data.rolls.length} rolls • {data.totalRemaining.toFixed(2)} sqm remaining</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs text-zinc-400 font-bold">Total Balance</p>
                          <p className="text-base font-black text-amber-600 font-mono">{data.totalRemaining.toFixed(2)} sqm</p>
                        </div>
                        {expandedProducts.has(product) ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="mt-2 w-full bg-zinc-100 rounded-full h-1.5">
                      <div className="bg-gradient-to-r from-amber-400 to-orange-500 h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, (data.totalRemaining / Math.max(data.totalSqm, 1)) * 100)}%` }} />
                    </div>
                    <p className="text-[10px] text-zinc-400 font-bold mt-0.5">{((data.totalRemaining / Math.max(data.totalSqm, 1)) * 100).toFixed(1)}% baki hai</p>
                  </CardHeader>
                </button>

                {expandedProducts.has(product) && (
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-zinc-50">
                          <TableRow>
                            <TableHead className="text-[10px] font-black uppercase text-zinc-500">Roll ID</TableHead>
                            <TableHead className="text-[10px] font-black uppercase text-zinc-500">Width × Length</TableHead>
                            <TableHead className="text-[10px] font-black uppercase text-zinc-500 text-right">Total Sqm</TableHead>
                            <TableHead className="text-[10px] font-black uppercase text-zinc-500 text-right">Remaining Sqm</TableHead>
                            <TableHead className="text-[10px] font-black uppercase text-zinc-500 text-right">Used %</TableHead>
                            <TableHead className="text-[10px] font-black uppercase text-zinc-500">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="text-xs">
                          {data.rolls.map((roll: any, idx: number) => {
                            const usedPct = roll.totalSqm > 0 ? ((roll.totalSqm - roll.remainingSqm) / roll.totalSqm) * 100 : 0;
                            return (
                              <TableRow key={roll.id} className="hover:bg-amber-50/30 transition-colors h-10">
                                <TableCell className="font-mono font-bold text-zinc-700">#{idx + 1} <span className="text-zinc-400 font-normal">{roll.id.substring(0, 6)}</span></TableCell>
                                <TableCell className="font-mono text-zinc-600">{(roll.fullWidth * 1000).toFixed(0)}mm × {(roll.fullLength * 1000).toFixed(0)}mm</TableCell>
                                <TableCell className="text-right font-mono font-bold text-zinc-900">{(roll.totalSqm || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-right font-mono font-black text-amber-600">{(roll.remainingSqm || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-right">
                                  <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded',
                                    usedPct > 80 ? 'bg-red-50 text-red-600' : usedPct > 50 ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                                  )}>{usedPct.toFixed(0)}%</span>
                                </TableCell>
                                <TableCell>
                                  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
                                    roll.isReuse ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-700'
                                  )}>{roll.isReuse ? 'Reuse' : 'Active'}</span>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                          <TableRow className="bg-amber-50 border-t-2 border-amber-200 font-black">
                            <TableCell colSpan={3} className="text-xs font-black text-amber-800">{product} — Total Balance</TableCell>
                            <TableCell className="text-right text-sm font-black font-mono text-amber-700">{data.totalRemaining.toFixed(2)} sqm</TableCell>
                            <TableCell colSpan={2} />
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </div>
      ) : (
        /* Sub-Report Views (purchase / profitability / company) */
        <div className="space-y-6 animate-in fade-in slide-in-from-top-3 duration-300">
          
          {/* Header Bar with Action Controls */}
          <Card className="border-zinc-200 shadow-sm bg-white overflow-hidden rounded-2xl">
            <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className={cn(
                  "p-3 rounded-xl text-white shrink-0 shadow-sm",
                  activeReportCard === 'purchase' && "bg-zinc-950",
                  activeReportCard === 'profitability' && "bg-emerald-700",
                  activeReportCard === 'company' && "bg-indigo-700"
                )}>
                  {activeReportCard === 'purchase' && <IndianRupee size={20} />}
                  {activeReportCard === 'profitability' && <TrendingUp size={20} />}
                  {activeReportCard === 'company' && <Building2 size={20} />}
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wider text-zinc-900">
                    {activeReportCard === 'purchase' && 'Purchase Cost Report'}
                    {activeReportCard === 'profitability' && 'Order Profitability Report'}
                    {activeReportCard === 'company' && 'Company Sales Report'}
                  </h2>
                  <p className="text-xs text-zinc-500 font-bold mt-0.5">
                    Range: {new Date(startDate).toLocaleDateString('en-IN')} to {new Date(endDate).toLocaleDateString('en-IN')}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
                {activeReportCard === 'company' && (
                  <div className="flex items-center gap-2 border border-zinc-200 bg-zinc-50/50 py-1.5 px-3 rounded-xl">
                    <Label className="text-[10px] font-black uppercase text-zinc-500 tracking-wider whitespace-nowrap">Company:</Label>
                    <select
                      value={selectedCompany}
                      onChange={(e) => setSelectedCompany(e.target.value)}
                      className="bg-white border border-zinc-200 focus:ring-zinc-900 text-xs font-bold h-8 rounded-lg px-2 outline-none"
                    >
                      <option value="all">All Companies</option>
                      {activeCompaniesList.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Report 1: Purchase Cost Details */}
          {activeReportCard === 'purchase' && (
            <div className="space-y-6">
              
              {/* Upper Stats Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card className="border-zinc-200 shadow-sm bg-white rounded-2xl">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="p-3.5 bg-zinc-100 rounded-xl shrink-0">
                      <IndianRupee className="h-6 w-6 text-zinc-950" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Total Material Subtotal</p>
                      <h3 className="text-2xl font-black text-zinc-950 mt-0.5 font-mono">{formatCurrency(totalMaterialSubtotal)}</h3>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Table Data */}
              <Card className="border-zinc-200 shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader className="pb-2 border-b border-zinc-100">
                  <CardTitle className="text-xs font-black uppercase tracking-wider text-zinc-800">
                    Filtered Orders Sheet
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-zinc-50/50">
                        <TableRow>
                          <TableHead className="text-xs font-black text-zinc-500">Order ID</TableHead>
                          <TableHead className="text-xs font-black text-zinc-500">Date</TableHead>
                          <TableHead className="text-xs font-black text-zinc-500">Client</TableHead>
                          <TableHead className="text-xs font-black text-zinc-500 text-right">Material Subtotal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="text-xs font-semibold text-zinc-700">
                        {filteredOrders.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="py-12 text-center text-zinc-400 font-medium italic">
                              No orders found in selected date range.
                            </TableCell>
                          </TableRow>
                        ) : (
                          <>
                            {filteredOrders.map(o => (
                              <TableRow key={o.id} className="hover:bg-zinc-50/35 transition-colors h-9">
                                <TableCell className="font-mono font-bold text-zinc-950">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedOrderForModal(o)}
                                    className="font-mono font-bold text-indigo-650 hover:text-indigo-800 hover:underline transition-colors bg-transparent border-none cursor-pointer p-0"
                                  >
                                    #{o.orderNumber || o.id.substring(0, 8)}
                                  </button>
                                </TableCell>
                                <TableCell>{convertToDate(o.updatedAt || o.createdAt).toLocaleDateString('en-IN')}</TableCell>
                                <TableCell className="font-bold text-zinc-900">{o.clientName}</TableCell>
                                <TableCell className="text-right font-bold font-mono text-zinc-900">
                                  {formatCurrency(o.calculated?.summary?.subtotal || 0)}
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-zinc-50/70 border-t-2 border-zinc-200 font-black h-10 text-zinc-950">
                              <TableCell colSpan={3} className="text-xs font-black text-zinc-900">GRAND TOTAL</TableCell>
                              <TableCell className="text-right text-xs font-black font-mono text-zinc-900">
                                {formatCurrency(totalMaterialSubtotal)}
                              </TableCell>
                            </TableRow>
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

            </div>
          )}

          {/* Report 2: Order Profitability Details */}
          {activeReportCard === 'profitability' && (
            <div className="space-y-6">
              
              {/* Upper Stats Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card className="border-zinc-200 shadow-sm bg-white rounded-2xl">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="p-3.5 bg-zinc-100 rounded-xl shrink-0">
                      <IndianRupee className="h-6 w-6 text-zinc-950" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Total Base Price</p>
                      <h3 className="text-2xl font-black text-zinc-950 mt-0.5 font-mono">{formatCurrency(totalBasePrice)}</h3>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-zinc-200 shadow-sm bg-white rounded-2xl">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="p-3.5 bg-zinc-100 rounded-xl shrink-0">
                      <Percent className="h-6 w-6 text-zinc-950" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">Average Profit Margin %</p>
                      <h3 className="text-2xl font-black text-zinc-950 mt-0.5 font-mono">{avgProfitMarginPct.toFixed(1)}%</h3>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Table Data */}
              <Card className="border-zinc-200 shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader className="pb-2 border-b border-zinc-100">
                  <CardTitle className="text-xs font-black uppercase tracking-wider text-zinc-800">
                    Filtered Orders Sheet
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-zinc-50/50">
                        <TableRow>
                          <TableHead className="text-xs font-black text-zinc-500">Order ID</TableHead>
                          <TableHead className="text-xs font-black text-zinc-500">Date</TableHead>
                          <TableHead className="text-xs font-black text-zinc-500">Client</TableHead>
                          <TableHead className="text-xs font-black text-zinc-500 text-right">Base Price</TableHead>
                          <TableHead className="text-xs font-black text-zinc-500 text-right">Profit Margin (₹)</TableHead>
                          <TableHead className="text-xs font-black text-zinc-500 text-right">Profit Margin (%)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="text-xs font-semibold text-zinc-700">
                        {filteredOrders.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="py-12 text-center text-zinc-400 font-medium italic">
                              No orders found in selected date range.
                            </TableCell>
                          </TableRow>
                        ) : (
                          <>
                            {filteredOrders.map(o => (
                              <TableRow key={o.id} className="hover:bg-zinc-50/35 transition-colors h-9">
                                <TableCell className="font-mono font-bold text-zinc-950">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedOrderForModal(o)}
                                    className="font-mono font-bold text-indigo-650 hover:text-indigo-800 hover:underline transition-colors bg-transparent border-none cursor-pointer p-0"
                                  >
                                    #{o.orderNumber || o.id.substring(0, 8)}
                                  </button>
                                </TableCell>
                                <TableCell>{convertToDate(o.createdAt).toLocaleDateString('en-IN')}</TableCell>
                                <TableCell className="font-bold text-zinc-900">{o.clientName}</TableCell>
                                <TableCell className="text-right font-bold font-mono text-zinc-900">
                                  {formatCurrency(o.calculated?.summary?.totalWithProfit || 0)}
                                </TableCell>
                                <TableCell className="text-right font-bold font-mono text-zinc-900">
                                  {formatCurrency(o.calculated?.summary?.profit || 0)}
                                </TableCell>
                                <TableCell className="text-right font-bold font-mono text-zinc-900">
                                  {(o.calculated?.summary?.profitMarginUsed || 0).toFixed(1)}%
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-zinc-50/70 border-t-2 border-zinc-200 font-black h-10 text-zinc-950">
                              <TableCell colSpan={3} className="text-xs font-black text-zinc-900">GRAND TOTAL</TableCell>
                              <TableCell className="text-right text-xs font-black font-mono text-zinc-900">
                                {formatCurrency(totalBasePrice)}
                              </TableCell>
                              <TableCell className="text-right text-xs font-black font-mono text-zinc-900">
                                {formatCurrency(totalProfitMarginCash)}
                              </TableCell>
                              <TableCell className="text-right text-xs font-black font-mono text-zinc-900">
                                Avg: {avgProfitMarginPct.toFixed(1)}%
                              </TableCell>
                            </TableRow>
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

            </div>
          )}

          {/* Report 3: Company Sales Details */}
          {activeReportCard === 'company' && (
            <div className="space-y-6">
              
              {/* Upper Stats Card (Exactly 3 Company Cards or filtered) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {activeCompaniesList
                  .filter(compName => selectedCompany === 'all' || compName === selectedCompany)
                  .map(compName => (
                    <Card key={compName} className="border-zinc-200 shadow-sm bg-white rounded-2xl">
                      <CardContent className="p-5 flex items-center gap-4">
                        <div className="p-3.5 bg-zinc-100 rounded-xl shrink-0">
                          <Building2 className="h-6 w-6 text-zinc-950" />
                        </div>
                        <div>
                          <p className="text-[10px] font-black uppercase text-zinc-500 tracking-wider">
                            {compName} Sales
                          </p>
                          <h3 className="text-2xl font-black text-zinc-950 mt-0.5 font-mono">
                            {formatCurrency(companySalesMap[compName] || 0)}
                          </h3>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>

              {/* Table Data */}
              <Card className="border-zinc-200 shadow-sm bg-white rounded-2xl overflow-hidden">
                <CardHeader className="pb-2 border-b border-zinc-100">
                  <CardTitle className="text-xs font-black uppercase tracking-wider text-zinc-800">
                    Filtered Orders Sheet
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-zinc-50/50">
                        <TableRow>
                          <TableHead className="text-xs font-black text-zinc-500">Order ID</TableHead>
                          <TableHead className="text-xs font-black text-zinc-500">Date</TableHead>
                          <TableHead className="text-xs font-black text-zinc-500">Client</TableHead>
                          <TableHead className="text-xs font-black text-zinc-500">Company</TableHead>
                          <TableHead className="text-xs font-black text-zinc-500 text-right">Final Selling Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody className="text-xs font-semibold text-zinc-700">
                        {displayOrders.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} className="py-12 text-center text-zinc-400 font-medium italic">
                              No orders found in selected date range.
                            </TableCell>
                          </TableRow>
                        ) : (
                          <>
                            {displayOrders.map(o => (
                              <TableRow key={o.id} className="hover:bg-zinc-50/35 transition-colors h-9">
                                <TableCell className="font-mono font-bold text-zinc-950">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedOrderForModal(o)}
                                    className="font-mono font-bold text-indigo-650 hover:text-indigo-800 hover:underline transition-colors bg-transparent border-none cursor-pointer p-0"
                                  >
                                    #{o.orderNumber || o.id.substring(0, 8)}
                                  </button>
                                </TableCell>
                                <TableCell>{convertToDate(o.createdAt).toLocaleDateString('en-IN')}</TableCell>
                                <TableCell className="font-bold text-zinc-900">{o.clientName}</TableCell>
                                <TableCell className="font-bold text-zinc-650">{o.company || 'Pooja Tekno Belt'}</TableCell>
                                <TableCell className="text-right font-bold font-mono text-zinc-900">
                                  {formatCurrency(o.totalCost)}
                                </TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="bg-zinc-50/70 border-t-2 border-zinc-200 font-black h-10 text-zinc-950">
                              <TableCell colSpan={4} className="text-xs font-black text-zinc-900">GRAND TOTAL</TableCell>
                              <TableCell className="text-right text-xs font-black font-mono text-zinc-900">
                                {formatCurrency(displayOrders.reduce((sum, o) => sum + o.totalCost, 0))}
                              </TableCell>
                            </TableRow>
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

            </div>
          )}
        </div>
      )}

      {/* ── ORDER DETAILS DIALOG MODAL ── */}
      {selectedOrderForModal && (
        <Dialog open={!!selectedOrderForModal} onOpenChange={(open) => !open && setSelectedOrderForModal(null)}>
          <DialogContent className="max-w-4xl sm:max-w-5xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-lg font-black flex items-center gap-2">
                Order Specifications <Badge variant="outline" className="font-mono bg-zinc-50">#{selectedOrderForModal.orderNumber || selectedOrderForModal.id.substring(0, 8)}</Badge>
              </DialogTitle>
              <DialogDescription className="text-xs font-bold text-zinc-500">
                Detailed dimensions, BOM components, and price margin breakdown
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5 space-y-6">
                
                {/* Summary Metadata */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-white border border-zinc-200 rounded-2xl shadow-sm">
                  <div>
                    <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Client</span>
                    <p className="text-xs font-black text-zinc-800 mt-0.5">{selectedOrderForModal.clientName}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Company Unit</span>
                    <p className="text-xs font-bold text-zinc-800 mt-0.5">{selectedOrderForModal.company || 'Pooja Tekno Belt'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Date</span>
                    <p className="text-xs font-bold text-zinc-850 mt-0.5">{convertToDate(selectedOrderForModal.updatedAt || selectedOrderForModal.createdAt).toLocaleDateString('en-IN')}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Selling Price</span>
                    <p className="text-sm font-black text-emerald-700 font-mono mt-0.5">{formatCurrency(Math.round(selectedOrderForModal.totalCost))}</p>
                  </div>
                </div>

                {/* Items/BOM Breakdown */}
                {selectedOrderForModal.items && selectedOrderForModal.items.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Quotation Items ({selectedOrderForModal.items.length})</p>
                    <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white max-h-[350px] overflow-y-auto shadow-sm">
                      <Table>
                        <TableHeader className="bg-zinc-50/50">
                          <TableRow className="h-10">
                            <TableHead className="w-[45px] text-center font-black text-[10px] uppercase text-zinc-500">No.</TableHead>
                            <TableHead className="font-black text-[10px] uppercase text-zinc-500">Belt Details</TableHead>
                            <TableHead className="font-black text-[10px] uppercase text-zinc-500">Dimensions</TableHead>
                            <TableHead className="font-black text-[10px] uppercase text-zinc-500">BOM & Customizations</TableHead>
                            <TableHead className="font-black text-[10px] uppercase text-zinc-500 text-right pr-4">Total Cost</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedOrderForModal.items.map((item, idx) => {
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
                                <TableCell className="text-center font-bold text-zinc-400">{idx + 1}</TableCell>
                                <TableCell className="font-semibold text-zinc-900">
                                  {item.beltType}
                                  <div className="text-[9px] text-zinc-400 font-bold">Style: {item.beltStyle || 'Standard'}</div>
                                </TableCell>
                                <TableCell className="font-mono text-zinc-600">
                                  L {item.dimensions.length}{item.dimensions.lengthUnit || 'mm'} x W {item.dimensions.width}{item.dimensions.widthUnit || 'mm'}
                                  {item.dimensions.hasHoles && (
                                    <div className="text-[9px] text-indigo-650 font-bold mt-0.5">Holes: {item.dimensions.totalHoles} pcs</div>
                                  )}
                                </TableCell>
                                <TableCell className="max-w-[280px] text-[10px] text-zinc-650 leading-relaxed">
                                  <div className="space-y-0.5 py-1">
                                    <div><span className="font-bold text-zinc-400">BOM:</span> {includedItems.map(b => b.name).join(', ') || 'None'}</div>
                                    {adjustedItems.length > 0 && (
                                      <div className="text-[9px] text-indigo-650 font-bold">
                                        <span className="font-extrabold">Adjusted:</span> {adjustedItems.join(', ')}
                                      </div>
                                    )}
                                    {hasRemarks && (
                                      <div className="text-[9px] text-amber-700 font-medium mt-0.5 space-y-0.5 bg-amber-50/50 p-1 rounded border border-amber-100/50">
                                        {includedItems.filter(b => remarks[b.id]).map(b => (
                                          <div key={b.id} className="flex items-start gap-1">
                                            <span className="font-bold text-amber-600 shrink-0">{b.name}:</span>
                                            <span className="italic">{remarks[b.id]}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {subRemarkEntries.length > 0 && (
                                      <div className="text-[9px] text-indigo-700 font-medium mt-0.5 space-y-0.5 bg-indigo-50/50 p-1 rounded border border-indigo-100/50">
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
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ) : (
                  /* Single Item Details & Pricing Breakdown Table */
                  <div className="space-y-4">
                    {/* Item Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Item Details</p>
                        <div className="mt-1 bg-white border border-zinc-200 rounded-xl p-3 text-xs space-y-1">
                          <div><span className="font-bold text-zinc-500">Belt Type:</span> <span className="font-black text-zinc-800">{selectedOrderForModal.beltType}</span></div>
                          <div><span className="font-bold text-zinc-500">Belt Style:</span> <span className="font-semibold text-zinc-800">{selectedOrderForModal.beltStyle || 'Standard'}</span></div>
                          <div><span className="font-bold text-zinc-500">Dimensions:</span> <span className="font-mono text-zinc-800">L {selectedOrderForModal.dimensions.length}{selectedOrderForModal.dimensions.lengthUnit || selectedOrderForModal.dimensions.unit || 'mm'} x W {selectedOrderForModal.dimensions.width}{selectedOrderForModal.dimensions.widthUnit || selectedOrderForModal.dimensions.unit || 'mm'}</span></div>
                          {selectedOrderForModal.dimensions.hasHoles && (
                            <div className="text-indigo-650 font-bold">Holes Layout: {selectedOrderForModal.dimensions.totalHoles} pcs ({selectedOrderForModal.dimensions.holeSize}mm size)</div>
                          )}
                        </div>
                      </div>

                      {/* Financial Margin Info */}
                      <div>
                        <p className="text-[10px] font-black uppercase text-zinc-400 tracking-wider">Cost & Margin Summary</p>
                        <div className="mt-1 bg-white border border-zinc-200 rounded-xl p-3 text-xs space-y-1 font-mono">
                          <div className="flex justify-between">
                            <span className="font-bold text-zinc-500">Material Cost:</span>
                            <span className="font-bold text-zinc-800">{formatCurrency(selectedOrderForModal.calculated?.summary?.subtotal || 0)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-bold text-zinc-500">Profit Margin ({selectedOrderForModal.calculated?.summary?.profitMarginUsed || 0}%):</span>
                            <span className="font-bold text-emerald-700">+{formatCurrency(selectedOrderForModal.calculated?.summary?.profit || 0)}</span>
                          </div>
                          <div className="flex justify-between border-t border-dashed border-zinc-200 pt-1 mt-1 font-black">
                            <span className="text-zinc-800">Base Selling Price:</span>
                            <span className="text-zinc-950">{formatCurrency(selectedOrderForModal.calculated?.summary?.totalWithProfit || 0)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* BOM Components breakdown */}
                    {selectedOrderForModal.calculated?.breakdown && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">BOM Components Cost Details</p>
                        <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white shadow-sm">
                          <Table>
                            <TableHeader className="bg-zinc-50/50">
                              <TableRow className="h-9">
                                <TableHead className="font-black text-[10px] uppercase text-zinc-500">Component Name</TableHead>
                                <TableHead className="font-black text-[10px] uppercase text-zinc-500 text-right">Consumption</TableHead>
                                <TableHead className="font-black text-[10px] uppercase text-zinc-500 text-right">Rate</TableHead>
                                <TableHead className="font-black text-[10px] uppercase text-zinc-500 text-right pr-4">Calculated Cost</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody className="text-xs font-semibold text-zinc-700">
                              {Object.keys(selectedOrderForModal.calculated.breakdown).map(key => {
                                const item = selectedOrderForModal.calculated.breakdown[key];
                                return (
                                  <TableRow key={key} className="h-9 hover:bg-zinc-50/20">
                                    <TableCell className="font-bold text-zinc-850">{key}</TableCell>
                                    <TableCell className="text-right font-mono">{item.consumption.toFixed(2)} {item.unit || ''}</TableCell>
                                    <TableCell className="text-right font-mono">₹{item.rate}</TableCell>
                                    <TableCell className="text-right font-mono font-bold text-zinc-900 pr-4">{formatCurrency(item.cost)}</TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => setSelectedOrderForModal(null)}
                className="border-zinc-350 hover:bg-zinc-100 font-bold text-xs h-10 px-5 rounded-xl cursor-pointer"
              >
                Close Details
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
