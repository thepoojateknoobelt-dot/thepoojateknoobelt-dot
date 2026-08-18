import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Config, Client, Quotation, ProfitRange, QuotationItem } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { toast } from 'sonner';
import { cn, formatCurrency } from '../lib/utils';
import { Calculator as CalcIcon, Save, Send, AlertCircle, ChevronDown, ChevronUp, Plus, Trash2, ShoppingCart, Pencil, Check, X, Search } from 'lucide-react';
import { calculateCosting, toMeters } from '../lib/calculations';

interface CalculatorProps {
  config: Config;
  clients: Client[];
}

// Helper to format timestamps safely for both Firebase Timestamp objects and ISO strings
const formatOrderDate = (dateVal: any, showYear = true) => {
  if (!dateVal) return '';
  const date = (typeof dateVal === 'object' && 'toDate' in dateVal) ? dateVal.toDate() : new Date(dateVal);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', showYear ? { day: '2-digit', month: 'short', year: 'numeric' } : { day: '2-digit', month: 'short' });
};

export const Calculator: React.FC<CalculatorProps> = ({ config, clients }) => {
  const { user } = useAuth();
  const [marginRequests, setMarginRequests] = useState<any[]>([]);
  const [isSendingMarginRequest, setIsSendingMarginRequest] = useState(false);
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const clientDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredClients = (Array.isArray(clients) ? clients : []).filter(c =>
    (c.name || '').toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
    (c.mobile || '').toLowerCase().includes(clientSearchQuery.toLowerCase())
  );

  const [formData, setFormData] = useState({
    clientId: '',
    beltType: '', // This will be the Type Name
    beltStyle: '',
    length: '',
    lengthUnit: 'mm',
    width: '',
    widthUnit: 'mm',
    manualPackingCost: '',
    manualProfitMargin: '',
    selectedBOMOptions: {} as Record<string, any>,
  });

  // Smart Hole Data state — auto-populated when active formulas use custom variables mapping to user inputs
  const [holePopupOpen, setHolePopupOpen] = useState(false);
  // Track which BOM item triggered the hole popup (for context label)
  const [holePopupItem, setHolePopupItem] = useState<{ name: string; optionName?: string } | null>(null);
  const [holeData, setHoleData] = useState({
    holeLength: '',
    holeWidth: '',
    holeSize: '',
    holeDistHorizontal: '',
    holeDistVertical: '',
    pricePerHole: '',
  });

  const isVariableUsedInFormula = (formula: string, symbol: string) => {
    if (!formula) return false;
    const escaped = symbol.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp('\\b' + escaped + '\\b', 'i');
    return regex.test(formula);
  };

  const getItemActiveOptionNames = (item: any, selectedBOMOptions: any) => {
    if (!selectedBOMOptions) return [];
    const rawSel = selectedBOMOptions[item.id];
    if (rawSel === undefined || rawSel === null) return [];
    const hasOptions = Array.isArray(item.options) && item.options.length > 0;
    if (!hasOptions) return [];

    const selectedOptIndices: number[] = Array.isArray(rawSel)
      ? rawSel
      : [rawSel];

    return selectedOptIndices
      .map(optIdx => item.options[optIdx]?.name)
      .filter(Boolean);
  };

  const getItemActiveVariables = (item: any) => {
    // Only use variables scoped to this specific BOM item — NOT global config.variables.
    // This ensures EYELET variables don't leak into BUTTONS or other items.
    const itemVars: any[] = Array.isArray(item.variables) ? item.variables : [];
    if (itemVars.length === 0) return [];

    // Filter variables: only allow variables that have no option restriction, or match the active selected option name
    const activeOptionNames = getItemActiveOptionNames(item, formData.selectedBOMOptions);
    const filteredItemVars = itemVars.filter((v: any) => {
      if (!v.forOptionName) return true;
      return activeOptionNames.includes(v.forOptionName);
    });

    if (filteredItemVars.length === 0) return [];

    // PARAMETER FIELDS (holeDistHorizontal, holeDistVertical, holeSize, pricePerHole) are always
    // included if configured for this item — regardless of whether the formula currently references them.
    // This ensures EYELET popup opens as long as the admin has configured those variables.
    const parameterMappedFields = new Set(['holeDistHorizontal', 'holeDistVertical', 'holeSize', 'pricePerHole', 'holesH', 'holesV', 'totalHoles']);

    // Build the full active formula string for this item (including selected sub-options)
    let activeFormula = item.formula || '';
    const hasOptions = Array.isArray(item.options) && item.options.length > 0;
    if (hasOptions) {
      const rawSel = formData.selectedBOMOptions[item.id];
      const selectedOptIndices: number[] = Array.isArray(rawSel)
        ? rawSel
        : rawSel !== undefined ? [rawSel] : [];
      selectedOptIndices.forEach((optIdx) => {
        const opt = item.options[optIdx];
        if (opt && opt.formula) {
          activeFormula += ' ' + opt.formula;
        }
      });
    }

    return filteredItemVars.filter((v: any) => {
      // Parameter-mapped variables are always active if configured
      if (parameterMappedFields.has(v.mappedField)) return true;
      // Other (formula-symbol) variables: only if used in formula
      return isVariableUsedInFormula(activeFormula, v.symbol);
    });
  };

  const getRequiredFields = () => {
    if (!formData.beltType || !formData.beltStyle || !config) return [];
    const cat = (config?.beltTypes || []).find((t: any) => t.name === formData.beltType);
    const style = (cat?.styles || []).find((s: any) => s.name === formData.beltStyle);
    if (!style || !style.bom) return [];

    const requiredFields = new Set<string>();

    style.bom.forEach((item: any) => {
      const isChecked = formData.selectedBOMOptions?._included?.[item.id] !== false;
      if (!isChecked) return;

      const activeVars = getItemActiveVariables(item);
      activeVars.forEach((v: any) => {
        if (v.mappedField === 'holeDistHorizontal' || v.mappedField === 'holesH' || v.mappedField === 'totalHoles') {
          requiredFields.add('holeDistHorizontal');
        }
        if (v.mappedField === 'holeDistVertical' || v.mappedField === 'holesV' || v.mappedField === 'totalHoles') {
          requiredFields.add('holeDistVertical');
        }
        if (v.mappedField === 'holeSize') {
          requiredFields.add('holeSize');
        }
        if (v.mappedField === 'pricePerHole') {
          requiredFields.add('pricePerHole');
        }
      });
    });

    return Array.from(requiredFields);
  };

  // Only checks the specific item being toggled — NOT all checked items
  const triggerPopupIfRequiredFieldsEmpty = (item: any, updatedBOMOptions: any) => {
    // Only use variables scoped to this specific BOM item — NOT global config.variables
    const itemVars: any[] = Array.isArray(item.variables) ? item.variables : [];
    const activeOptionNames = getItemActiveOptionNames(item, updatedBOMOptions);
    const vars = itemVars.filter((v: any) => {
      if (!v.forOptionName) return true;
      return activeOptionNames.includes(v.forOptionName);
    });

    // Collect required fields from PARAMETER-MAPPED variables.
    // These are always required when configured — no formula check needed.
    // This means EYELET's HHD/VHD/HS will trigger the popup even if formula is not yet set.
    const requiredFields = new Set<string>();
    vars.forEach((v: any) => {
      if (v.mappedField === 'holeDistHorizontal' || v.mappedField === 'holesH' || v.mappedField === 'totalHoles') requiredFields.add('holeDistHorizontal');
      if (v.mappedField === 'holeDistVertical' || v.mappedField === 'holesV' || v.mappedField === 'totalHoles') requiredFields.add('holeDistVertical');
      if (v.mappedField === 'holeSize') requiredFields.add('holeSize');
      if (v.mappedField === 'pricePerHole') requiredFields.add('pricePerHole');
    });

    if (requiredFields.size === 0) return; // This item has no parameter-mapped variables

    const hasEmptyNeeded = Array.from(requiredFields).some(f => {
      if (f === 'holeSize') return !holeData.holeSize;
      if (f === 'holeDistHorizontal') return !holeData.holeDistHorizontal;
      if (f === 'holeDistVertical') return !holeData.holeDistVertical;
      if (f === 'pricePerHole') return !holeData.pricePerHole;
      return false;
    });

    if (hasEmptyNeeded) {
      const lMm = Math.round(toMeters(parseFloat(formData.length) || 0, formData.lengthUnit) * 1000);
      const wMm = Math.round(toMeters(parseFloat(formData.width) || 0, formData.widthUnit) * 1000);
      setHoleData(prev => ({
        ...prev,
        holeLength: prev.holeLength || String(lMm || ''),
        holeWidth: prev.holeWidth || String(wMm || '')
      }));
      // Store context: which item opened the popup
      const activeOptName = activeOptionNames.length > 0 ? activeOptionNames[0] : undefined;
      setHolePopupItem({ name: item.name, optionName: activeOptName });
      setHolePopupOpen(true);
    }
  };

  const selectedVariableItems = (() => {
    if (!formData.beltType || !formData.beltStyle || !config) return [];
    const cat = (config?.beltTypes || []).find((t: any) => t.name === formData.beltType);
    const style = (cat?.styles || []).find((s: any) => s.name === formData.beltStyle);
    if (!style || !style.bom) return [];

    const list: { name: string; variables: any[] }[] = [];

    style.bom.forEach((item: any) => {
      const isChecked = formData.selectedBOMOptions?._included?.[item.id] !== false;
      if (!isChecked) return;

      const activeVars = getItemActiveVariables(item);
      if (activeVars.length > 0) {
        list.push({
          name: item.name,
          variables: activeVars
        });
      }
    });

    return list;
  })();

  const needsHoleData = selectedVariableItems.length > 0;

  const [result, setResult] = useState<any>(null);
  const [pendingCalculate, setPendingCalculate] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [expandedRates, setExpandedRates] = useState<Record<string, boolean>>({});
  const [discountRequested, setDiscountRequested] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [salesMarkup, setSalesMarkup] = useState('');
  const [clientHistory, setClientHistory] = useState<Quotation[]>([]);
  const [quotationItems, setQuotationItems] = useState<QuotationItem[]>([]);
  const [renamingItemId, setRenamingItemId] = useState<string | null>(null);
  const [renameValues, setRenameValues] = useState<{ beltType: string; beltStyle: string }>({ beltType: '', beltStyle: '' });
  const [dimensionInsight, setDimensionInsight] = useState<string | null>(null);
  const [insightOrders, setInsightOrders] = useState<Quotation[]>([]);
  const selectedClient = clients?.find?.(c => c.id === formData.clientId) || null;

  const clientProfitRanges = (() => {
    if (!selectedClient || !formData.beltType || !formData.beltStyle) return [];
    const typeData = selectedClient.profitMargins?.[formData.beltType];
    if (!typeData) return [];
    if (!Array.isArray(typeData) && typeof typeData === 'object') {
      return Array.isArray(typeData[formData.beltStyle]) ? typeData[formData.beltStyle] : [];
    }
    if (Array.isArray(typeData)) return typeData;
    return [];
  })();

  // Margin is considered "set" only when there is at least one range with a margin > 0.
  // A profit margin of 0% means admin has NOT properly configured it yet.
  const isMarginSet = clientProfitRanges &&
    clientProfitRanges.length > 0 &&
    clientProfitRanges.some((r: any) => (r.margin || 0) > 0);

  // Combine quotations with margin configuration requests to show them in Client History
  const combinedHistory = (() => {
    const currentClientRequests = (marginRequests || [])
      .filter((mr: any) => mr.clientId === formData.clientId)
      .map((mr: any) => ({
        id: mr.id,
        createdAt: mr.createdAt,
        beltType: mr.beltType,
        beltStyle: mr.beltStyle,
        dimensions: { 
          length: mr.length || 0, 
          width: mr.width || 0,
          lengthUnit: mr.lengthUnit || 'mm',
          widthUnit: mr.widthUnit || 'mm'
        },
        totalCost: 0,
        status: `margin_${mr.status}`,
        isMarginRequest: true,
      }));

    const quotes = (clientHistory || []).map((q: any) => ({
      ...q,
      isMarginRequest: false,
    }));

    return [...currentClientRequests, ...quotes].sort((a: any, b: any) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
  })();

  const fetchMarginRequests = async () => {
    try {
      const res = await fetch('/api/margin-requests');
      if (res.ok) {
        const data = await res.json();
        setMarginRequests(data);
      }
    } catch (err) {
      console.error('Failed to fetch margin requests', err);
    }
  };

  useEffect(() => {
    fetchMarginRequests();
    const interval = setInterval(fetchMarginRequests, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSendMarginRequest = async () => {
    if (!formData.clientId || !formData.beltType || !formData.beltStyle) return;

    // Validate that length and width are entered and valid before allowing requests
    if (!formData.length || !formData.width) {
      toast.error('Please enter the belt Length and Width first before sending the margin request!');
      return;
    }
    const lenVal = parseFloat(formData.length);
    const widVal = parseFloat(formData.width);
    if (isNaN(lenVal) || lenVal <= 0 || isNaN(widVal) || widVal <= 0) {
      toast.error('Please enter a valid Length and Width greater than 0 first!');
      return;
    }

    setIsSendingMarginRequest(true);
    try {
      const res = await fetch('/api/margin-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: formData.clientId,
          clientName: selectedClient?.name || '',
          beltType: formData.beltType,
          beltStyle: formData.beltStyle,
          length: lenVal,
          width: widVal,
          lengthUnit: formData.lengthUnit,
          widthUnit: formData.widthUnit
        })
      });
      if (res.ok) {
        toast.success('Margin setting request sent to Admin!');
        fetchMarginRequests();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Failed to send request');
      }
    } catch (err) {
      console.error('Failed to send margin request', err);
      toast.error('Failed to send request');
    } finally {
      setIsSendingMarginRequest(false);
    }
  };

  useEffect(() => {
    if (!formData.length || !formData.width || !formData.clientId) {
      setDimensionInsight(null);
      setInsightOrders([]);
      return;
    }

    const checkDimensions = async () => {
      try {
        const res = await fetch('/api/quotations');
        if (!res.ok) throw new Error('Failed to fetch quotations');
        const quotations = await res.json();
        
        const currentLengthMtr = toMeters(parseFloat(formData.length), formData.lengthUnit);
        const currentWidthMtr = toMeters(parseFloat(formData.width), formData.widthUnit);
        const tolerance = 0.001; // 1mm tolerance

        const otherOrders = quotations
          .filter((q: any) => {
             if (q.clientId === formData.clientId) return false;
             const qLenMtr = toMeters(q.dimensions.length, q.dimensions.lengthUnit || 'mm');
             const qWidMtr = toMeters(q.dimensions.width, q.dimensions.widthUnit || 'mm');
             return Math.abs(qLenMtr - currentLengthMtr) < tolerance && 
                    Math.abs(qWidMtr - currentWidthMtr) < tolerance;
          });

        if (otherOrders.length > 0) {
          setInsightOrders(otherOrders);
          const clientNames = Array.from(new Set(otherOrders.map((o: any) => o.clientName)));
          setDimensionInsight(`This dimension was previously purchased by ${clientNames.join(', ')}`);
        } else {
          setDimensionInsight(null);
          setInsightOrders([]);
        }
      } catch (err) {
        console.error('Error checking dimension insights', err);
      }
    };

    const timeout = setTimeout(checkDimensions, 800);
    return () => clearTimeout(timeout);
  }, [formData.length, formData.width, formData.lengthUnit, formData.widthUnit, formData.clientId]);

  const fetchClientHistory = async (clientId: string) => {
    if (!clientId) {
      setClientHistory([]);
      return;
    }
    try {
      const res = await fetch('/api/quotations');
      if (res.ok) {
        const allQuotes = await res.json();
        const filtered = allQuotes
          .filter((q: any) => q.clientId === clientId)
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5);
        setClientHistory(filtered);
      }
    } catch (err) {
      console.error('Failed to fetch client history', err);
    }
  };

  useEffect(() => {
    fetchClientHistory(formData.clientId);
    const interval = setInterval(() => {
      fetchClientHistory(formData.clientId);
    }, 15000);
    return () => clearInterval(interval);
  }, [formData.clientId]);

  const triggerCalculate = () => {
    if (!formData.clientId) {
      toast.error('Please select a client');
      return;
    }

    if (!formData.beltType) {
      toast.error('Please select a category');
      return;
    }

    if (!formData.beltStyle) {
      toast.error('Please select a style');
      return;
    }

    if (!formData.length || !formData.width) {
      toast.error('Please enter dimensions');
      return;
    }

    const lengthVal = parseFloat(formData.length);
    const widthVal = parseFloat(formData.width);

    if (isNaN(lengthVal) || lengthVal <= 0) {
      toast.error('Please enter a valid length greater than 0');
      return;
    }

    if (isNaN(widthVal) || widthVal <= 0) {
      toast.error('Please enter a valid width greater than 0');
      return;
    }

    const lengthInMeters = toMeters(lengthVal, formData.lengthUnit);
    const widthInMeters = toMeters(widthVal, formData.widthUnit);

    if (lengthInMeters > 100000) {
      toast.error('Length is too large (maximum 100,000 meters / 100 km)');
      return;
    }

    if (widthInMeters > 150) { // Keep width limit aligned
      toast.error('Width is too large (maximum 150 meters)');
      return;
    }

    if (formData.manualPackingCost) {
      const packingVal = parseFloat(formData.manualPackingCost);
      if (isNaN(packingVal) || packingVal < 0) {
        toast.error('Packing cost must be a valid positive number');
        return;
      }
      if (packingVal > 10000000) {
        toast.error('Packing cost is too large');
        return;
      }
    }

    if (formData.manualProfitMargin) {
      const profitVal = parseFloat(formData.manualProfitMargin);
      if (isNaN(profitVal) || profitVal < 0) {
        toast.error('Profit margin must be a valid positive number');
        return;
      }
      if (profitVal > 1000) {
        toast.error('Profit margin cannot exceed 1000%');
        return;
      }
    }

    const missingFields = getRequiredFields().filter((field) => {
      if (field === 'holeSize') return !holeData.holeSize;
      if (field === 'holeDistHorizontal') return !holeData.holeDistHorizontal;
      if (field === 'holeDistVertical') return !holeData.holeDistVertical;
      if (field === 'pricePerHole') return !holeData.pricePerHole;
      return false;
    });

    if (missingFields.length > 0) {
      const fieldLabels = missingFields.map(f => {
        if (f === 'holeSize') return 'Hole Size (mm)';
        if (f === 'holeDistHorizontal') return 'Horizontal Spacing (mm)';
        if (f === 'holeDistVertical') return 'Vertical Spacing (mm)';
        if (f === 'pricePerHole') return 'Price per Hole (₹)';
        return f;
      });
      toast.error(`Please fill in required variables: ${fieldLabels.join(', ')} before calculating costing.`);
      setHolePopupOpen(true);
      return;
    }

    setIsConfirmOpen(true);
  };

  const executeCalculate = async () => {
    setIsConfirmOpen(false);
    setIsLoading(true);
    try {
      const selectedCategory = (Array.isArray(config?.beltTypes) ? config.beltTypes : [])?.find?.(t => t.name === formData.beltType) || null;
      const selectedStyle = (Array.isArray(selectedCategory?.styles) ? selectedCategory.styles : [])?.find?.(s => s.name === formData.beltStyle) || null;
      const clientProfitRanges: import('../types').ProfitRange[] = (() => {
        const typeData = selectedClient?.profitMargins?.[formData.beltType];
        if (!typeData) return [];
        // New nested format: { styleName: ProfitRange[] }
        if (!Array.isArray(typeData) && typeof typeData === 'object') {
          return Array.isArray(typeData[formData.beltStyle]) ? typeData[formData.beltStyle] : [];
        }
        // Legacy flat format: ProfitRange[]
        return Array.isArray(typeData) ? typeData : [];
      })();
      
      const included = formData.selectedBOMOptions?._included;
      const customRates = formData.selectedBOMOptions?._customRates || {};
      const customBOM = ((selectedStyle?.bom || [])
        .filter(item => !included || included[item.id] !== false) as any[])
        .flatMap((item: any) => {
          // Support both old single-index and new multi-index formats
          const rawSel = formData.selectedBOMOptions[item.id];
          const selectedOptIndices: number[] = Array.isArray(rawSel)
            ? rawSel
            : rawSel !== undefined ? [rawSel] : [];

          if (selectedOptIndices.length > 0 && Array.isArray(item.options) && item.options.length > 0) {
            // Each selected option becomes a separate BOM line item
            return (selectedOptIndices as any[])
              .flatMap((optIdx: number) => {
                const opt = item.options![optIdx];
                if (!opt) return [];

                // ── FORMATION EXPANSION ──
                // If this sub-category is a Formation, expand its internal items
                if (opt.isFormation && Array.isArray(opt.formationItems) && opt.formationItems.length > 0) {
                  return opt.formationItems.map((fi: any, fiIdx: number) => ({
                    ...item,
                    rate: fi.rate || 0,
                    unit: fi.unit || opt.unit || item.unit,
                    // Internal name: stored as "FormationName > ItemName" for admin tracking
                    name: fi.name ? `${opt.name} › ${fi.name}` : opt.name,
                    formula: fi.formula || opt.formula || item.formula,
                    id: `${item.id}_opt${optIdx}_fi${fiIdx}`,
                    _originalParentId: item.id,
                    // Mark as formation child so we can group in display
                    _formationName: opt.name,
                    _isFormationItem: true,
                  }));
                }
                // ── END FORMATION ──

                let rate = opt.rate;
                let unit = opt.unit || item.unit;
                let name = opt.name ? opt.name.trim() : item.name;
                let formula = opt.formula || item.formula;
                // Custom rate override applies to first selected option only
                if (customRates[item.id] !== undefined && selectedOptIndices[0] === optIdx) {
                  rate = customRates[item.id];
                }
                return [{ ...item, rate, unit, name, formula, id: `${item.id}_opt${optIdx}`, _originalParentId: item.id }];
              })
              .filter(Boolean);
          }

          // No sub-category selected
          let rate = item.rate;
          let unit = item.unit;
          let name = item.name;
          let formula = item.formula;

          if (Array.isArray(item.options) && item.options.length > 0 && (!item.rate || item.rate === 0)) {
            // Fallback to first option rate if parent has no base rate (e.g. RED Bodar)
            const firstOpt = item.options[0];
            rate = firstOpt.rate;
            unit = firstOpt.unit || item.unit;
            formula = firstOpt.formula || item.formula;
          }

          if (customRates[item.id] !== undefined) {
            rate = customRates[item.id];
          }

          return [{ ...item, rate, unit, name, formula }];
        });

      const requiredFields = getRequiredFields();
      const hasHoles = requiredFields.length > 0;
      const finalPricePerHole = holeData.pricePerHole || '0';

      const result = calculateCosting({
        length: parseFloat(formData.length),
        lengthUnit: formData.lengthUnit,
        width: parseFloat(formData.width),
        widthUnit: formData.widthUnit,
        beltType: formData.beltType,
        manualPackingCost: formData.manualPackingCost || undefined,
        manualProfitMargin: formData.manualProfitMargin || undefined,
        hasHoles: hasHoles && !!holeData.holeSize,
        holeLength: holeData.holeLength,
        holeWidth: holeData.holeWidth,
        holeSize: holeData.holeSize,
        holeDistHorizontal: holeData.holeDistHorizontal,
        holeDistVertical: holeData.holeDistVertical,
        pricePerHole: finalPricePerHole,
        selectedBOMOptions: formData.selectedBOMOptions,
      }, config, clientProfitRanges, customBOM as any, {});


      if (user?.role !== 'admin') {
        setResult({
          summary: {
            finalTotal: result.summary.finalTotal
          }
        });
      } else {
        setResult(result);
      }

      // Record this calculation in the audit log
      try {
        await fetch('/api/audit-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'PRICE_CALCULATION',
            details: `Client: ${selectedClient?.name}, Belt: ${formData.beltType} (${formData.beltStyle}), Dim: L ${formData.length}${formData.lengthUnit} x W ${formData.width}${formData.widthUnit}, Price: ${formatCurrency(result.summary.finalTotal)}`
          })
        });
      } catch (logErr) {
        console.error('Failed to create audit log', logErr);
      }
    } catch (err) {
      toast.error('Calculation failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddItemToQuotation = () => {
    if (!result) return;
    if (!selectedClient) {
      toast.error('Selected client not found');
      return;
    }

    const hasHoles = getRequiredFields().length > 0 && !!holeData.holeSize;
    const finalPricePerHole = holeData.pricePerHole ? parseFloat(holeData.pricePerHole) : 0;

    const newItem: QuotationItem = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
      beltType: formData.beltType,
      beltStyle: formData.beltStyle,
      dimensions: {
        length: parseFloat(formData.length),
        lengthUnit: formData.lengthUnit,
        width: parseFloat(formData.width),
        widthUnit: formData.widthUnit,
        hasHoles,
        holeSize: hasHoles ? (parseFloat(holeData.holeSize) || 0) : undefined,
        holeLength: hasHoles ? (parseFloat(holeData.holeLength) || 0) : undefined,
        holeWidth: hasHoles ? (parseFloat(holeData.holeWidth) || 0) : undefined,
        holeDistHorizontal: hasHoles ? (parseFloat(holeData.holeDistHorizontal) || 0) : undefined,
        holeDistVertical: hasHoles ? (parseFloat(holeData.holeDistVertical) || 0) : undefined,
        pricePerHole: hasHoles ? finalPricePerHole : undefined,
        totalHoles: hasHoles ? (result.summary.totalHoles || 0) : undefined,
      },
      totalCost: result.summary.finalTotal,
      selectedBOMOptions: JSON.parse(JSON.stringify(formData.selectedBOMOptions)),
      calculated: JSON.parse(JSON.stringify(result))
    };

    setQuotationItems([...quotationItems, newItem]);
    toast.success('Item added to quotation builder!');
    
    // Clear result and inputs
    setResult(null);
    setHoleData({ holeLength: '', holeWidth: '', holeSize: '', holeDistHorizontal: '', holeDistVertical: '', pricePerHole: '' });
    setFormData({
      ...formData,
      length: '',
      width: '',
      manualPackingCost: '',
      manualProfitMargin: '',
      beltStyle: '',
    });
  };

  const handleSaveQuotation = async (status: 'draft' | 'pending_approval' = 'draft') => {
    if (quotationItems.length === 0) {
      toast.error('Please add at least one item to the quotation');
      return;
    }

    try {
      if (!selectedClient) {
        toast.error('Selected client not found');
        return;
      }

      // Sum totals across all items
      const totalCostOfAllItems = quotationItems.reduce((sum, item) => sum + item.totalCost, 0);

      // Create aggregated representation for backward compatibility with single-item layouts:
      // We can use the first item's details for top-level columns, and the sum of all items for totalCost.
      const firstItem = quotationItems[0];

      const quotationData = {
        clientId: formData.clientId,
        clientName: selectedClient.name,
        beltType: quotationItems.length === 1 ? firstItem.beltType : `Multi-Item (${quotationItems.length})`,
        beltStyle: quotationItems.length === 1 ? firstItem.beltStyle : 'Multiple Styles',
        selectedBOMOptions: quotationItems.length === 1 ? firstItem.selectedBOMOptions : {},
        dimensions: quotationItems.length === 1 ? firstItem.dimensions : {
          length: 0,
          lengthUnit: 'mm',
          width: 0,
          widthUnit: 'mm'
        },
        totalCost: totalCostOfAllItems,
        status,
        discountRequested: parseFloat(discountRequested) || 0, // overall discount
        discountReason: discountReason,
        salesMarkup: parseFloat(salesMarkup) || 0, // overall sales markup
        createdBy: user?.id,
        createdByName: user?.name || user?.username,
        items: quotationItems // Send the items array!
      };

      const saveRes = await fetch('/api/quotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quotationData)
      });
      
      if (!saveRes.ok) throw new Error('Save failed');
      
      toast.success(status === 'pending_approval' ? 'Approval request sent!' : 'Quotation saved!');
      
      // Fetch history immediately to update the client history table
      fetchClientHistory(formData.clientId);
      
      // Clear state
      setQuotationItems([]);
      setResult(null);
      setDiscountRequested('');
      setDiscountReason('');
      setSalesMarkup('');
    } catch (err) {
      toast.error('Failed to save quotation');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 text-[#1e40af] rounded-lg">
            <CalcIcon className="h-4 w-4" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">Costing Calculator</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 border-zinc-300 shadow-xl bg-white/50 backdrop-blur-sm self-start">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="p-1.5 bg-blue-50 text-[#1e40af] rounded-lg">
                <CalcIcon className="h-3.5 w-3.5 text-white" />
              </div>
              <CardTitle className="text-lg">Input Parameters</CardTitle>
            </div>
            <CardDescription className="text-xs">Enter belt details for calculation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Primary Selection Section */}
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Selection</Label>
                <div className="grid gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Client</Label>
                    <div className="relative" ref={clientDropdownRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsClientDropdownOpen(!isClientDropdownOpen);
                          setClientSearchQuery('');
                        }}
                        className="flex w-full items-center justify-between rounded-md border border-zinc-400 bg-white px-3 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:border-zinc-900 h-9 transition-all"
                      >
                        <span className={cn(!selectedClient && "text-zinc-500")}>
                          {selectedClient ? selectedClient.name : "Select Client"}
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
                      </button>

                      {isClientDropdownOpen && (
                        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-zinc-200 bg-white p-1 shadow-md animate-in fade-in slide-in-from-top-1 duration-100">
                          <div className="flex items-center border-b border-zinc-150 px-2.5 pb-2 pt-1.5 sticky top-0 bg-white">
                            <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50 text-zinc-500" />
                            <input
                              type="text"
                              value={clientSearchQuery}
                              onChange={(e) => setClientSearchQuery(e.target.value)}
                              placeholder="Search client by name or mobile..."
                              className="w-full text-xs outline-none bg-transparent placeholder:text-zinc-400 text-zinc-800"
                              autoFocus
                            />
                            {clientSearchQuery && (
                              <button 
                                type="button" 
                                onClick={() => setClientSearchQuery('')}
                                className="text-zinc-400 hover:text-zinc-600 focus:outline-none"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          <div className="pt-1">
                            {filteredClients.length === 0 ? (
                              <div className="py-2 text-center text-xs text-zinc-500">
                                No client found
                              </div>
                            ) : (
                              filteredClients.map((c) => {
                                const isSelected = c.id === formData.clientId;
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => {
                                      setFormData({ ...formData, clientId: c.id });
                                      setQuotationItems([]);
                                      setIsClientDropdownOpen(false);
                                      setClientSearchQuery('');
                                    }}
                                    className={cn(
                                      "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none transition-colors text-left hover:bg-zinc-150 hover:text-zinc-900",
                                      isSelected ? "bg-zinc-100 text-zinc-900 font-medium" : "text-zinc-700"
                                    )}
                                  >
                                    <span className="flex-1 truncate">{c.name}</span>
                                    {isSelected && <Check className="ml-auto h-3.5 w-3.5 text-zinc-900" />}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Category</Label>
                      <Select value={formData.beltType} onValueChange={(val) => { setFormData({ ...formData, beltType: val, beltStyle: '', selectedBOMOptions: {} }); setExpandedRates({}); }}>
                        <SelectTrigger className="bg-white border-zinc-400 transition-all h-9 text-xs">
                          <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Array.isArray(config?.beltTypes) ? config.beltTypes : [])?.map?.(type => (
                            <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Style</Label>
                      <Select 
                        disabled={!formData.beltType}
                        value={formData.beltStyle} 
                        onValueChange={(val) => { setFormData({ ...formData, beltStyle: val, selectedBOMOptions: {} }); setExpandedRates({}); }}
                      >
                        <SelectTrigger className="bg-white border-zinc-400 transition-all h-9 text-xs">
                          <SelectValue placeholder="Style" />
                        </SelectTrigger>
                        <SelectContent>
                          {(Array.isArray((Array.isArray(config?.beltTypes) ? config.beltTypes : [])?.find?.(t => t.name === formData.beltType)?.styles) ? (config?.beltTypes?.find?.(t => t.name === formData.beltType)?.styles) : [])?.map?.(style => (
                            <SelectItem key={style.id} value={style.name}>{style.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>


                </div>
              </div>

              {/* Dimensions Section */}
              <div className="space-y-1.5 pt-1.5 border-t border-zinc-100">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Dimensions</Label>
                <div className="grid gap-2.5">
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs font-medium">Length</Label>
                      <div className="relative group">
                        <Input 
                          type="number" 
                          value={formData.length} 
                          onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                          placeholder="0.00"
                          className="bg-white border-zinc-400 pl-3 pr-20 focus:ring-zinc-900 transition-all h-10 text-sm font-semibold"
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                           <Select value={formData.lengthUnit} onValueChange={(val: any) => setFormData({ ...formData, lengthUnit: val })}>
                            <SelectTrigger className="h-7 w-auto min-w-[56px] border-none shadow-none bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-[10px] font-black uppercase ring-0 focus:ring-0 rounded-md px-2 transition-colors">
                              <div className="flex items-center gap-1">
                                <SelectValue />
                              </div>
                            </SelectTrigger>
                            <SelectContent className="min-w-[120px]">
                              {(Array.isArray(config?.units) ? config.units : [])?.map?.(u => (
                                <SelectItem key={u.value} value={u.value} className="text-[10px] font-bold uppercase">{u.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs font-medium">Width</Label>
                      <div className="relative group">
                        <Input 
                          type="number" 
                          value={formData.width} 
                          onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                          placeholder="0.00"
                          className="bg-white border-zinc-400 pl-3 pr-20 focus:ring-zinc-900 transition-all h-10 text-sm font-semibold"
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-2">
                          <Select value={formData.widthUnit} onValueChange={(val: any) => setFormData({ ...formData, widthUnit: val })}>
                            <SelectTrigger className="h-7 w-auto min-w-[56px] border-none shadow-none bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-[10px] font-black uppercase ring-0 focus:ring-0 rounded-md px-2 transition-colors">
                              <div className="flex items-center gap-1">
                                <SelectValue />
                              </div>
                            </SelectTrigger>
                            <SelectContent className="min-w-[120px]">
                              {(Array.isArray(config?.units) ? config.units : [])?.map?.(u => (
                                <SelectItem key={u.value} value={u.value} className="text-[10px] font-bold uppercase">{u.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
                {dimensionInsight && insightOrders.length > 0 && (
                  <Dialog>
                    <DialogTrigger
                      render={
                        <button type="button" className="w-full text-left mt-3 p-2 bg-indigo-50 hover:bg-indigo-100 transition-colors border border-indigo-100 rounded-lg flex items-start gap-2 animate-in fade-in slide-in-from-top-2 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                          <AlertCircle className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-semibold text-indigo-900">Insight</p>
                            <p className="text-[10px] text-indigo-700">{dimensionInsight}</p>
                          </div>
                        </button>
                      }
                    />
                    <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col p-6 sm:max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Previous Orders Insight</DialogTitle>
                        <DialogDescription>
                          Detailed history of orders with dimensions {formData.length}{formData.lengthUnit} x {formData.width}{formData.widthUnit}.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="mt-2 border rounded-md overflow-x-auto flex-1">
                        <Table>
                          <TableHeader className="bg-zinc-50">
                            <TableRow>
                              <TableHead className="text-xs font-bold min-w-[90px]">Date</TableHead>
                              <TableHead className="text-xs font-bold">Client</TableHead>
                              <TableHead className="text-xs font-bold">Category</TableHead>
                              <TableHead className="text-xs font-bold">Status</TableHead>
                              <TableHead className="text-xs font-bold text-right">Price</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {insightOrders.map((order) => (
                              <TableRow key={order.id} className="hover:bg-zinc-50/50 h-10">
                                <TableCell className="text-[10px] text-zinc-500 font-mono">
                                  {formatOrderDate(order.createdAt)}
                                </TableCell>
                                <TableCell className="text-xs font-medium text-zinc-900">{order.clientName}</TableCell>
                                <TableCell className="text-xs text-zinc-600">
                                  {order.beltType} <span className="text-zinc-400">({order.beltStyle})</span>
                                </TableCell>
                                <TableCell>
                                  <span className={cn(
                                     "inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter border",
                                     order.status === 'approved' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                                     order.status === 'pending_approval' ? "bg-amber-50 text-amber-700 border-amber-100" :
                                     "bg-zinc-100 text-zinc-600 border-zinc-200"
                                  )}>
                                    {order.status.replace('_', ' ')}
                                  </span>
                                </TableCell>
                                <TableCell className="text-[11px] font-bold text-right font-mono">
                                  {formatCurrency(order.totalCost)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              {/* BOM Components Checklist (Dynamic with checkboxes and sub-categories selection) */}
              {(() => {
                const category = (Array.isArray(config?.beltTypes) ? config.beltTypes : [])?.find?.(t => t.name === formData.beltType) || null;
                const style = (Array.isArray(category?.styles) ? category.styles : [])?.find?.(s => s.name === formData.beltStyle) || null;
                const hasBOM = formData.beltStyle && Array.isArray(style?.bom) && style.bom.length > 0;
                
                return hasBOM && (
                  <div className="space-y-2 pt-2.5 border-t border-zinc-100 animate-in fade-in slide-in-from-top-2">
                    <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Include BOM Components</Label>
                    <div className="grid gap-2 bg-zinc-50/50 p-3 rounded-xl border border-zinc-100">
                      {style.bom.map((item: any) => {
                        const isChecked = formData.selectedBOMOptions?._included?.[item.id] !== false; // Checked by default
                        const hasOptions = Array.isArray(item.options) && item.options.length > 0;
                        const isExpanded = !!expandedRates[item.id];
                        
                        // Support both old single-index and new multi-index array formats
                        const rawSel = formData.selectedBOMOptions[item.id];
                        const selectedOptIndices: number[] = Array.isArray(rawSel)
                          ? rawSel
                          : rawSel !== undefined ? [rawSel] : [];
                        const firstSelIdx = selectedOptIndices[0];
                        const defaultRate = hasOptions && firstSelIdx !== undefined && item.options[firstSelIdx]
                          ? item.options[firstSelIdx].rate
                          : item.rate;
                        const defaultUnit = hasOptions && firstSelIdx !== undefined && item.options[firstSelIdx]
                          ? (item.options[firstSelIdx].unit || item.unit)
                          : item.unit;
                        
                        const currentRemark = formData.selectedBOMOptions?._remarks?.[item.id] || '';

                        return (
                          <div key={item.id} className="space-y-2 border-b border-zinc-150 pb-2.5 last:border-none last:pb-0">
                            <div className="flex items-center space-x-2.5">
                              <input
                                type="checkbox"
                                id={`bom-chk-${item.id}`}
                                checked={isChecked}
                                onChange={(e) => {
                                  const included = { 
                                    ...(formData.selectedBOMOptions?._included || {}) 
                                  };
                                  // Initialize all other items to true if not present
                                  style.bom.forEach((b: any) => {
                                    if (included[b.id] === undefined) {
                                      included[b.id] = true;
                                    }
                                  });
                                  included[item.id] = e.target.checked;
                                  const updatedBOMOptions = {
                                    ...formData.selectedBOMOptions,
                                    _included: included
                                  };
                                  setFormData({
                                    ...formData,
                                    selectedBOMOptions: updatedBOMOptions
                                  });
                                  if (e.target.checked) {
                                    triggerPopupIfRequiredFieldsEmpty(item, updatedBOMOptions);
                                  }
                                }}
                                className="h-4 w-4 rounded border-zinc-400 text-zinc-950 focus:ring-zinc-950 transition-colors cursor-pointer"
                              />
                              <Label htmlFor={`bom-chk-${item.id}`} className="text-xs font-bold cursor-pointer text-zinc-800 flex-1 flex items-center gap-2">
                                {item.name}
                                {getItemActiveVariables(item).length > 0 && isChecked && (() => {
                                  const itemVars = getItemActiveVariables(item);
                                  const itemRequiredFields = itemVars.map(v => {
                                    if (v.mappedField === 'holeDistHorizontal' || v.mappedField === 'holesH' || v.mappedField === 'totalHoles') return 'holeDistHorizontal';
                                    if (v.mappedField === 'holeDistVertical' || v.mappedField === 'holesV' || v.mappedField === 'totalHoles') return 'holeDistVertical';
                                    if (v.mappedField === 'holeSize') return 'holeSize';
                                    if (v.mappedField === 'pricePerHole') return 'pricePerHole';
                                    return '';
                                  }).filter(Boolean);

                                  const isComplete = itemRequiredFields.every(f => {
                                    if (f === 'holeSize') return !!holeData.holeSize;
                                    if (f === 'holeDistHorizontal') return !!holeData.holeDistHorizontal;
                                    if (f === 'holeDistVertical') return !!holeData.holeDistVertical;
                                    if (f === 'pricePerHole') return !!holeData.pricePerHole;
                                    return true;
                                  });

                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        const lMm = Math.round(toMeters(parseFloat(formData.length) || 0, formData.lengthUnit) * 1000);
                                        const wMm = Math.round(toMeters(parseFloat(formData.width) || 0, formData.widthUnit) * 1000);
                                        setHoleData(prev => ({
                                          ...prev,
                                          holeLength: prev.holeLength || String(lMm || ''),
                                          holeWidth: prev.holeWidth || String(wMm || '')
                                        }));
                                        setHolePopupOpen(true);
                                      }}
                                      className={cn(
                                        "inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-full border transition-colors cursor-pointer",
                                        isComplete
                                          ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                          : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 animate-pulse"
                                      )}
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
                                      {isComplete 
                                        ? `Variables filled ✓` 
                                        : `Fill variables (${itemVars.map(v => v.symbol).join(', ')})`
                                      }
                                    </button>
                                  );
                                })()}
                              </Label>
                            </div>
                            {/* Remark field - always visible when checked */}
                            {isChecked && (
                              <div className="pl-6">
                                <input
                                  type="text"
                                  placeholder="Add remark (optional)"
                                  value={currentRemark}
                                  onChange={(e) => {
                                    const remarks = { ...(formData.selectedBOMOptions?._remarks || {}) };
                                    if (e.target.value.trim() === '') {
                                      delete remarks[item.id];
                                    } else {
                                      remarks[item.id] = e.target.value;
                                    }
                                    setFormData({
                                      ...formData,
                                      selectedBOMOptions: {
                                        ...formData.selectedBOMOptions,
                                        _remarks: remarks
                                      }
                                    });
                                  }}
                                  className="w-full text-[10px] px-2 py-1 border border-dashed border-zinc-300 rounded-lg bg-amber-50/40 focus:outline-none focus:border-amber-400 focus:bg-amber-50 placeholder:text-zinc-400 text-zinc-600 transition-all"
                                />
                              </div>
                            )}
                            
                            {isChecked && (
                               <div className="pl-6 space-y-2">
                                 {/* Show sub-categories as flat checkboxes directly under the parent BOM item */}
                                 {hasOptions && (
                                   <div className="space-y-2.5 pl-6 pt-1 animate-in fade-in duration-200">
                                     {item.options.map((opt: any, i: number) => {
                                       const rawSel = formData.selectedBOMOptions[item.id];
                                       const selectedOptIndices: number[] = Array.isArray(rawSel)
                                         ? rawSel
                                         : rawSel !== undefined ? [rawSel] : [];
                                       const isOptSelected = selectedOptIndices.includes(i);
                                       const optRemarkKey = `${item.id}_${i}`;
                                       const optRemark = formData.selectedBOMOptions?._optRemarks?.[optRemarkKey] || '';
                                       const isFormationOpt = !!opt.isFormation;
                                       // For formations: compute total rate from formation items
                                       const formationTotal = isFormationOpt && Array.isArray(opt.formationItems)
                                         ? opt.formationItems.reduce((s: number, fi: any) => s + (fi.rate || 0), 0)
                                         : null;
                                       const displayRate = isFormationOpt ? formationTotal : opt.rate;

                                       return (
                                         <div key={i} className="space-y-1">
                                           <div className="flex items-center space-x-2">
                                             <input
                                               type="checkbox"
                                               id={`bom-opt-${item.id}-${i}`}
                                               checked={isOptSelected}
                                               onChange={(e) => {
                                                  const currentSelected: number[] = Array.isArray(formData.selectedBOMOptions[item.id])
                                                    ? [...formData.selectedBOMOptions[item.id]]
                                                    : formData.selectedBOMOptions[item.id] !== undefined
                                                      ? [formData.selectedBOMOptions[item.id]]
                                                      : [];
                                                  const newSelected = e.target.checked
                                                    ? [...currentSelected, i]
                                                    : currentSelected.filter((x: number) => x !== i);
                                                  const updatedBOMOptions = {
                                                    ...formData.selectedBOMOptions,
                                                    [item.id]: newSelected.length > 0 ? newSelected : undefined
                                                  };
                                                  setFormData({
                                                    ...formData,
                                                    selectedBOMOptions: updatedBOMOptions
                                                  });
                                                  if (e.target.checked) {
                                                    triggerPopupIfRequiredFieldsEmpty(item, updatedBOMOptions);
                                                  }
                                                }}
                                               className="h-3.5 w-3.5 rounded border-zinc-400 text-zinc-950 focus:ring-zinc-950 transition-colors cursor-pointer"
                                             />
                                             <Label 
                                                htmlFor={`bom-opt-${item.id}-${i}`} 
                                                className={cn(
                                                  "text-xs cursor-pointer select-none transition-colors flex-1 flex items-center justify-between gap-2 min-w-0",
                                                  isOptSelected ? "font-bold text-zinc-900" : "font-medium text-zinc-650 hover:text-zinc-900"
                                                )}
                                              >
                                                <span className="flex items-center gap-1.5 truncate">
                                                  <span className="truncate">{opt.name || `Option ${i + 1}`}</span>
                                                  {isFormationOpt && (
                                                    <span className="text-[8px] font-black bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0">
                                                      Bundle
                                                    </span>
                                                  )}
                                                </span>
                                                {user?.role === 'admin' && (
                                                  <span className={cn(
                                                    "text-[9px] font-black px-1.5 py-0.5 rounded-md border shrink-0 tabular-nums transition-colors",
                                                    isOptSelected
                                                      ? isFormationOpt
                                                        ? "bg-violet-50 text-violet-700 border-violet-200"
                                                        : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                      : "bg-zinc-100 text-zinc-400 border-zinc-200"
                                                  )}>
                                                    {isFormationOpt && displayRate !== null
                                                      ? `₹${(displayRate as number).toFixed(0)}/${opt.unit || item.unit}`
                                                      : `₹${opt.rate}/${opt.unit || item.unit}`
                                                    }
                                                  </span>
                                                )}
                                              </Label>
                                           </div>
                                           {/* Remark field below selected sub-category */}
                                           {isOptSelected && (
                                              <div className="pl-5.5">
                                                <input
                                                  type="text"
                                                  placeholder={`Remark for ${opt.name || 'this option'}...`}
                                                  value={optRemark}
                                                  onChange={(e) => {
                                                    const optRemarks = { ...(formData.selectedBOMOptions?._optRemarks || {}) };
                                                    if (e.target.value.trim() === '') {
                                                      delete optRemarks[optRemarkKey];
                                                    } else {
                                                      optRemarks[optRemarkKey] = e.target.value;
                                                    }
                                                    setFormData({
                                                      ...formData,
                                                      selectedBOMOptions: {
                                                        ...formData.selectedBOMOptions,
                                                        _optRemarks: optRemarks
                                                      }
                                                    });
                                                  }}
                                                  className="w-full text-[10px] px-2 py-1 border border-dashed border-indigo-200 rounded-lg bg-indigo-50/30 focus:outline-none focus:border-indigo-400 focus:bg-indigo-50/60 placeholder:text-zinc-400 text-zinc-600 transition-all"
                                                />
                                              </div>
                                            )}
                                            {/* Admin-only: show formation items breakdown as tooltip-style hint */}
                                            {isFormationOpt && isOptSelected && user?.role === 'admin' && Array.isArray(opt.formationItems) && opt.formationItems.length > 0 && (
                                              <div className="pl-5.5 mt-1">
                                                <div className="bg-violet-50 border border-violet-100 rounded-lg px-2 py-1.5 space-y-0.5">
                                                  <p className="text-[8px] font-black uppercase text-violet-400 tracking-widest mb-1">Formation Breakdown (Admin Only)</p>
                                                  {opt.formationItems.map((fi: any, fiIdx: number) => (
                                                    <div key={fiIdx} className="flex items-center justify-between">
                                                      <span className="text-[9px] text-violet-700 font-medium">{fi.name || `Item ${fiIdx + 1}`}</span>
                                                      <span className="text-[9px] font-bold text-violet-600 font-mono">₹{fi.rate}/{fi.unit} · {fi.formula}</span>
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
                                         </div>
                                       );
                                     })}
                                   </div>
                                 )}
                                 
                                 {/* Price Changer Accordion Toggle (Only visible for Admins) */}
                                 {user?.role === 'admin' && (
                                   <>
                                     <div className="flex items-center justify-between">
                                       <button
                                         type="button"
                                         onClick={() => setExpandedRates({
                                           ...expandedRates,
                                           [item.id]: !isExpanded
                                         })}
                                         className="text-[10px] text-zinc-500 hover:text-indigo-650 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                                       >
                                         {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                         {isExpanded ? "Hide Price Adjustment" : `Adjust Price (Default: ₹${defaultRate}/${defaultUnit})`}
                                       </button>
                                     </div>

                                     {/* Custom Rate Input Field */}
                                     {isExpanded && (
                                       <div className="animate-in fade-in slide-in-from-top-1 duration-150">
                                         <div className="space-y-1 p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg max-w-full">
                                           <Label className="text-[9px] font-black uppercase text-zinc-500">Custom Unit Rate (₹)</Label>
                                           <div className="relative">
                                             <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 font-bold">₹</span>
                                             <Input
                                               type="number"
                                               placeholder={defaultRate.toString()}
                                               className="h-8 pl-6 text-xs bg-white border-zinc-300 font-bold text-zinc-800"
                                               value={formData.selectedBOMOptions?._customRates?.[item.id] ?? ""}
                                               onChange={(e) => {
                                                 const customRates = {
                                                   ...(formData.selectedBOMOptions?._customRates || {})
                                                 };
                                                 if (e.target.value === "") {
                                                   delete customRates[item.id];
                                                 } else {
                                                   customRates[item.id] = parseFloat(e.target.value) || 0;
                                                 }
                                                 setFormData({
                                                   ...formData,
                                                   selectedBOMOptions: {
                                                     ...formData.selectedBOMOptions,
                                                     _customRates: customRates
                                                   }
                                                 });
                                               }}
                                             />
                                           </div>
                                         </div>
                                       </div>
                                     )}
                                   </>
                                 )}
                               </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Overrides Section - Only visible after calculation for Admin */}
              {result && user?.role === 'admin' && (
                <div className="space-y-1.5 pt-1.5 border-t border-zinc-100 animate-in fade-in slide-in-from-top-2">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Manual Overrides</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Packing Cost</Label>
                      <Input 
                        type="number" 
                        value={formData.manualPackingCost} 
                        onChange={(e) => setFormData({ ...formData, manualPackingCost: e.target.value })}
                        placeholder={config.rates.packing.toString()}
                        className="bg-white border-zinc-400 focus:ring-zinc-900 h-9 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">Profit %</Label>
                      <Input 
                        type="number" 
                        value={formData.manualProfitMargin} 
                        onChange={(e) => setFormData({ ...formData, manualProfitMargin: e.target.value })}
                        placeholder={config.constants.defaultProfit.toString()}
                        className="bg-white border-zinc-400 focus:ring-zinc-900 h-9 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {formData.clientId && formData.beltType && formData.beltStyle && !isMarginSet ? (
              user?.role !== 'admin' ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3 mt-2 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900">Margin Not Set</h4>
                      <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                        Profit margins for <strong>{formData.beltType} ({formData.beltStyle})</strong> have not been configured for this client yet.
                      </p>
                    </div>
                  </div>
                  {marginRequests.some(r => 
                    r.clientId === formData.clientId && 
                    r.beltType === formData.beltType && 
                    r.beltStyle === formData.beltStyle && 
                    r.status === 'pending'
                  ) ? (
                    <div className="text-center py-2 px-3 bg-amber-100/50 rounded-lg border border-amber-200 text-xs font-bold text-amber-800">
                      ⌛ Request Sent (Pending Admin Configuration)
                    </div>
                  ) : (
                    <Button
                      onClick={handleSendMarginRequest}
                      disabled={isSendingMarginRequest}
                      className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs h-9 rounded-lg"
                    >
                      {isSendingMarginRequest ? 'Sending...' : 'Send Request to Admin to Set Margin'}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3 mt-2 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900">Margin Not Configured</h4>
                      <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                        Profit margins for <strong>{formData.beltType} ({formData.beltStyle})</strong> have not been configured for this client yet. Please set the margin for this client first.
                      </p>
                    </div>
                  </div>
                </div>
              )
            ) : (
              <Button 
                className="w-full bg-[#1e40af] hover:bg-[#1d4ed8] text-white mt-1 h-10 text-sm font-semibold rounded-[6px] shadow-sm transition-all active:scale-[0.98] cursor-pointer" 
                onClick={triggerCalculate}
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                    Calculating...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CalcIcon className="h-3.5 w-3.5" />
                    Calculate Costing
                  </div>
                )}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-zinc-300 shadow-xl bg-white/50 backdrop-blur-sm">
          <CardHeader className="border-b border-zinc-100 pb-2 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Calculation Result</CardTitle>
                <CardDescription className="text-xs">
                  {user?.role === 'admin' ? 'Detailed breakdown of costs and margins' : 'Total estimated price for the client'}
                </CardDescription>
              </div>
              {result && (
                <div className="px-2.5 py-0.5 bg-zinc-100 rounded-full text-[9px] font-bold uppercase tracking-widest text-zinc-600">
                  Ready
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-6">
            {!result ? (
              <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
                <div className="p-3 bg-zinc-50 rounded-full mb-3">
                  <CalcIcon className="h-8 w-8 opacity-20" />
                </div>
                <p className="text-zinc-500 text-sm font-medium">Enter parameters and click calculate to see results</p>
              </div>
            ) : (
              <div className="space-y-6">


                {user?.role === 'admin' && result.breakdown && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1 w-1 rounded-full bg-[#1e40af]" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600">Material Cost Breakdown</h3>
                    </div>
                    <div className="border border-zinc-100 rounded-lg overflow-x-auto shadow-sm">
                      <Table>
                        <TableHeader className="bg-zinc-50/50">
                        <TableRow>
                          <TableHead className="text-[10px] font-bold py-2 h-8">Material</TableHead>
                          <TableHead className="text-right text-[10px] font-bold py-2 h-8">Consumption</TableHead>
                          <TableHead className="text-right text-[10px] font-bold py-2 h-8">Rate</TableHead>
                          <TableHead className="text-right text-[10px] font-bold py-2 h-8">Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(result.breakdown)
                          .filter(([key]) => key.toLowerCase() !== 'packing')
                          .map(([key, val]: [string, any]) => (
                          <TableRow key={key} className="hover:bg-zinc-50/30 transition-colors h-8">
                            <TableCell className="font-medium capitalize text-xs py-1.5">
                              {key.replace(/([A-Z])/g, ' $1')}
                              {val.unit && <span className="text-[10px] text-zinc-400 font-medium ml-1">({val.unit})</span>}
                            </TableCell>
                            <TableCell className="text-right text-xs text-zinc-600 font-mono py-1.5">
                              {val.unit === 'holes'
                                ? val.consumption.toFixed(0)
                                : (val.consumption > 999999 ? val.consumption.toExponential(4) : val.consumption.toFixed(4))
                              }
                            </TableCell>
                            <TableCell className="text-right text-xs text-zinc-600 font-mono py-1.5">{formatCurrency(val.rate)}</TableCell>
                            <TableCell className="text-right font-bold text-xs font-mono py-1.5">{formatCurrency(val.cost)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-zinc-50/50 font-black border-t-2 border-zinc-100 h-9">
                          <TableCell colSpan={3} className="text-xs text-zinc-900 py-2">Subtotal</TableCell>
                          <TableCell className="text-right text-xs text-zinc-900 font-mono py-2">{formatCurrency(result.summary.subtotal)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>
                )}

                {user?.role === 'admin' && result.summary && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-900" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-700">Detailed Price Breakdown</h3>
                    </div>
                    <div className="border border-zinc-200 rounded-lg overflow-x-auto shadow-sm">
                      <Table>
                        <TableBody>
                          <TableRow className="hover:bg-zinc-50/50 transition-colors h-8">
                            <TableCell className="font-medium text-xs py-1.5">Material Subtotal</TableCell>
                            <TableCell className="text-right font-mono text-xs py-1.5">{formatCurrency(result.summary.subtotal)}</TableCell>
                          </TableRow>
                          <TableRow className="text-zinc-600 hover:bg-zinc-50/50 transition-colors h-7">
                            <TableCell className="text-[10px] pl-6 py-1">Fix Cost ({result.summary.fixCostPercentage}%)</TableCell>
                            <TableCell className="text-right font-mono text-[10px] py-1">{formatCurrency(result.summary.fixCost)}</TableCell>
                          </TableRow>
                          <TableRow className="bg-zinc-50/50 font-semibold border-y border-zinc-200 h-8">
                            <TableCell className="text-xs py-1.5">Subtotal with Fix Cost</TableCell>
                            <TableCell className="text-right font-mono text-xs py-1.5">{formatCurrency(result.summary.totalWithFixCost)}</TableCell>
                          </TableRow>
                          <TableRow className="text-zinc-600 hover:bg-zinc-50/50 transition-colors border-b border-zinc-100 h-7">
                            <TableCell className="text-[10px] pl-6 py-1">Profit Margin ({result.summary.profitMarginUsed}%)</TableCell>
                            <TableCell className="text-right font-mono text-[10px] py-1">{formatCurrency(result.summary.profit)}</TableCell>
                          </TableRow>
                          <TableRow className="bg-zinc-100/70 font-bold text-zinc-900 border-b border-zinc-200 h-8">
                            <TableCell className="text-xs py-1.5">Base Price (Total with Profit)</TableCell>
                            <TableCell className="text-right font-mono text-xs py-1.5">{formatCurrency(result.summary.totalWithProfit)}</TableCell>
                          </TableRow>
                          <TableRow className="text-amber-900 bg-amber-50/60 hover:bg-amber-100/50 transition-colors h-7">
                            <TableCell className="text-[10px] pl-6 py-1 font-semibold">+ Packaging Charge (Before GST)</TableCell>
                            <TableCell className="text-right font-mono text-[10px] font-bold py-1">+{formatCurrency(result.summary.packingCost)}</TableCell>
                          </TableRow>
                          <TableRow className="bg-indigo-50/70 font-bold text-indigo-950 border-y border-indigo-200 h-8">
                            <TableCell className="text-xs py-1.5">Taxable Subtotal (Before GST)</TableCell>
                            <TableCell className="text-right font-mono text-xs py-1.5">{formatCurrency(result.summary.taxableSubtotal || (result.summary.totalWithProfit + result.summary.packingCost))}</TableCell>
                          </TableRow>
                          <TableRow className="text-blue-900 hover:bg-blue-50/50 transition-colors h-7 border-b border-zinc-200">
                            <TableCell className="text-[10px] pl-6 py-1 font-semibold">+ GST ({result.summary.saleGstPercent ?? config.constants.saleGst}%)</TableCell>
                            <TableCell className="text-right font-mono text-[10px] font-bold py-1">+{formatCurrency(result.summary.saleGst)}</TableCell>
                          </TableRow>
                          <TableRow className="bg-slate-900 text-white font-bold h-11 hover:bg-slate-800 transition-colors">
                            <TableCell className="text-sm py-2 pl-4">Final Selling Price (Incl. GST)</TableCell>
                            <TableCell className="text-right text-lg font-mono py-2 pr-4 text-emerald-400">{formatCurrency(result.summary.finalTotal)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-zinc-50 p-4 rounded-xl border border-zinc-200 shadow-sm">
                  <div className="flex flex-col justify-center p-5 bg-slate-900 rounded-xl text-white shadow-md border border-slate-800 relative col-span-2 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <p className="text-slate-300 text-[10px] font-black uppercase tracking-[0.2em]">Calculation Summary</p>
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">Before-GST Packaging</span>
                    </div>
                    
                    {user?.role === 'admin' ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-1">
                        <div className="bg-slate-800/80 p-2.5 rounded-lg border border-slate-700/60">
                          <span className="text-slate-400 text-[10px] font-bold block uppercase tracking-wider">Base Price</span>
                          <span className="text-sm sm:text-base font-black text-white font-mono">{formatCurrency(result.summary.totalWithProfit)}</span>
                        </div>
                        <div className="bg-amber-950/40 p-2.5 rounded-lg border border-amber-500/30">
                          <span className="text-amber-300 text-[10px] font-bold block uppercase tracking-wider">+ Packaging</span>
                          <span className="text-sm sm:text-base font-black text-amber-200 font-mono">+{formatCurrency(result.summary.packingCost)}</span>
                        </div>
                        <div className="bg-indigo-950/40 p-2.5 rounded-lg border border-indigo-500/30">
                          <span className="text-indigo-300 text-[10px] font-bold block uppercase tracking-wider">Taxable Total</span>
                          <span className="text-sm sm:text-base font-black text-indigo-200 font-mono">{formatCurrency(result.summary.taxableSubtotal || (result.summary.totalWithProfit + result.summary.packingCost))}</span>
                        </div>
                        <div className="bg-sky-950/40 p-2.5 rounded-lg border border-sky-500/30">
                          <span className="text-sky-300 text-[10px] font-bold block uppercase tracking-wider">+ GST ({result.summary.saleGstPercent ?? config.constants.saleGst}%)</span>
                          <span className="text-sm sm:text-base font-black text-sky-200 font-mono">+{formatCurrency(result.summary.saleGst)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="py-1">
                        <p className="text-xs text-slate-300 leading-normal">
                          Total estimated belt selling price including taxes and pre-GST packaging charges.
                        </p>
                      </div>
                    )}

                    <div className="pt-3 border-t border-slate-800">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs font-black uppercase tracking-wider text-slate-200 block">Net Total Selling Price</span>
                          <span className="text-[10px] text-slate-400 font-medium">Inclusive of all charges & GST</span>
                        </div>
                        <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono tracking-tight bg-emerald-950/50 px-3 py-1 rounded-lg border border-emerald-500/30">{formatCurrency(result.summary.finalTotal)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    className="flex-1 gap-1.5 h-10 border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs font-bold transition-all" 
                    onClick={() => {
                      setResult(null);
                      setHoleData({
                        holeLength: '',
                        holeWidth: '',
                        holeSize: '',
                        holeDistHorizontal: '',
                        holeDistVertical: '',
                        pricePerHole: '',
                      });
                      setFormData({
                        ...formData,
                        length: '',
                        width: '',
                        manualPackingCost: '',
                        manualProfitMargin: '',
                        beltStyle: '',
                      });
                    }}
                  >
                    Reset Form
                  </Button>
                  <Button 
                    className="flex-2 gap-1.5 bg-[#1e40af] hover:bg-[#1d4ed8] text-white h-10 text-xs font-bold shadow-sm transition-all active:scale-[0.98] rounded-[6px] cursor-pointer"
                    onClick={handleAddItemToQuotation}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add to Quotation
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {formData.clientId && quotationItems.length > 0 && (
        <Card className="border-zinc-300 shadow-xl bg-white/80 backdrop-blur-sm mt-4 overflow-hidden animate-in fade-in slide-in-from-top-3 duration-250">
          <CardHeader className="bg-zinc-50/50 border-b border-zinc-100 py-3 flex flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded bg-blue-50 text-[#1e40af] flex items-center justify-center">
                <ShoppingCart className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">Current Quotation Builder ({quotationItems.length} {quotationItems.length === 1 ? 'item' : 'items'})</CardTitle>
                <CardDescription className="text-[10px] font-medium">Review added items, apply adjustment, and finalize the quotation.</CardDescription>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8 border-rose-200 text-rose-650 hover:bg-rose-50 hover:text-rose-700 font-bold gap-1 cursor-pointer"
              onClick={() => {
                setQuotationItems([]);
                toast.success('Cleared all items');
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear Cart
            </Button>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="rounded-md border border-zinc-200 overflow-hidden bg-white">
              <Table>
                <TableHeader className="bg-zinc-50/50">
                  <TableRow>
                    <TableHead className="w-[50px] font-bold text-center">No.</TableHead>
                    <TableHead className="font-bold">Belt Details</TableHead>
                    <TableHead className="font-bold">Dimensions</TableHead>
                    <TableHead className="font-bold">BOM & Customizations</TableHead>
                    <TableHead className="font-bold text-right">Selling Price</TableHead>
                    <TableHead className="w-[110px] font-bold text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quotationItems.map((item, index) => {
                    const isRenaming = renamingItemId === item.id;
                    return (
                      <TableRow key={item.id} className="hover:bg-zinc-50/50 transition-colors text-xs">
                        <TableCell className="text-center font-bold text-zinc-500">{index + 1}</TableCell>
                        <TableCell className="font-semibold text-zinc-900">
                          {isRenaming ? (
                            <div className="space-y-1.5 py-1">
                              <input
                                autoFocus
                                type="text"
                                value={renameValues.beltType}
                                onChange={e => setRenameValues(v => ({ ...v, beltType: e.target.value }))}
                                placeholder="Belt Type Name"
                                className="w-full text-xs px-2 py-1.5 border border-indigo-300 rounded-lg bg-indigo-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 font-semibold text-zinc-900"
                              />
                              <input
                                type="text"
                                value={renameValues.beltStyle}
                                onChange={e => setRenameValues(v => ({ ...v, beltStyle: e.target.value }))}
                                placeholder="Style Name"
                                className="w-full text-[10px] px-2 py-1 border border-indigo-200 rounded-lg bg-indigo-50/30 focus:outline-none focus:ring-2 focus:ring-indigo-300 text-zinc-600"
                              />
                            </div>
                          ) : (
                            <>
                              <span className="font-semibold text-zinc-900">{item.beltType}</span>
                              <div className="text-[10px] text-zinc-400 font-medium">Style: {item.beltStyle}</div>
                            </>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-zinc-650">
                          L {item.dimensions.length} {item.dimensions.lengthUnit || 'mm'} x W {item.dimensions.width} {item.dimensions.widthUnit || 'mm'}
                          {item.dimensions.hasHoles && (
                            <div className="text-[10px] text-indigo-600 font-bold">Holes: {item.dimensions.totalHoles} pcs</div>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[250px] text-[11px] text-zinc-650">
                          {(() => {
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

                            // Collect sub-category remarks (support multi-select array)
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
                              <div className="space-y-0.5">
                                <div className="truncate"><span className="font-bold">BOM:</span> {includedItems.map(b => b.name).join(', ') || 'None'}</div>
                                {adjustedItems.length > 0 && (
                                  <div className="text-[10px] text-indigo-650 font-bold truncate">
                                    <span className="font-extrabold">Adjusted:</span> {adjustedItems.join(', ')}
                                  </div>
                                )}
                                {hasRemarks && (
                                  <div className="text-[10px] text-amber-700 font-medium mt-0.5 space-y-0.5">
                                    {includedItems.filter(b => remarks[b.id]).map(b => (
                                      <div key={b.id} className="flex items-start gap-1">
                                        <span className="font-bold text-amber-600 shrink-0">{b.name}:</span>
                                        <span className="truncate italic">{remarks[b.id]}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {subRemarkEntries.length > 0 && (
                                  <div className="text-[10px] text-indigo-700 font-medium mt-0.5 space-y-0.5">
                                    {subRemarkEntries.map((e, i) => (
                                      <div key={i} className="flex items-start gap-1">
                                        <span className="font-bold text-indigo-500 shrink-0">{e.label}:</span>
                                        <span className="truncate italic">{e.text}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-zinc-900 text-sm">
                          {formatCurrency(item.totalCost)}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            {isRenaming ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Save rename"
                                  className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md cursor-pointer"
                                  onClick={() => {
                                    setQuotationItems(quotationItems.map(q =>
                                      q.id === item.id
                                        ? { ...q, beltType: renameValues.beltType || q.beltType, beltStyle: renameValues.beltStyle || q.beltStyle }
                                        : q
                                    ));
                                    setRenamingItemId(null);
                                    toast.success('Item renamed!');
                                  }}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Cancel"
                                  className="h-7 w-7 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded-md cursor-pointer"
                                  onClick={() => setRenamingItemId(null)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Rename item"
                                  className="h-7 w-7 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md cursor-pointer"
                                  onClick={() => {
                                    setRenamingItemId(item.id);
                                    setRenameValues({ beltType: item.beltType, beltStyle: item.beltStyle });
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Remove item"
                                  className="h-7 w-7 text-zinc-400 hover:text-rose-650 hover:bg-zinc-100 rounded-md cursor-pointer"
                                  onClick={() => {
                                    setQuotationItems(quotationItems.filter(q => q.id !== item.id));
                                    toast.success('Item removed');
                                  }}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Aggregated Totals and Action Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="border border-zinc-200 bg-white/70 p-4 rounded-xl space-y-2.5 shadow-sm">
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500 flex items-center gap-1.5">
                  <ShoppingCart className="h-3.5 w-3.5 text-zinc-650" />
                  Aggregate Pricing Summary
                </h3>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between border-b border-zinc-150 pb-1.5">
                    <span className="text-zinc-500">Material Subtotal</span>
                    <span className="font-mono font-bold">{formatCurrency(quotationItems.reduce((sum, item) => sum + (item.calculated?.summary?.subtotal || 0), 0))}</span>
                  </div>
                  {user?.role === 'admin' && (
                    <>
                      <div className="flex justify-between border-b border-zinc-150 pb-1.5">
                        <span className="text-zinc-500">Landed Cost (Incl. purchase GST)</span>
                        <span className="font-mono font-bold">{formatCurrency(quotationItems.reduce((sum, item) => sum + (item.calculated?.summary?.totalWithPurchaseGst || 0), 0))}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-150 pb-1.5">
                        <span className="text-zinc-500">Aggregate Profit Margin</span>
                        <span className="font-mono font-bold text-emerald-600">{formatCurrency(quotationItems.reduce((sum, item) => sum + (item.calculated?.summary?.profit || 0), 0))}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-150 pb-1.5">
                        <span className="text-zinc-500">Aggregate Sales GST</span>
                        <span className="font-mono font-bold">{formatCurrency(quotationItems.reduce((sum, item) => sum + (item.calculated?.summary?.saleGst || 0), 0))}</span>
                      </div>
                      <div className="flex justify-between border-b border-zinc-150 pb-1.5">
                        <span className="text-zinc-500">Aggregate Packing Charges</span>
                        <span className="font-mono font-bold">{formatCurrency(quotationItems.reduce((sum, item) => sum + (item.calculated?.summary?.packingCost || 0), 0))}</span>
                      </div>
                    </>
                  )}
                  
                  {salesMarkup && parseFloat(salesMarkup) > 0 && (
                    <div className="flex justify-between border-b border-zinc-150 pb-1.5 text-emerald-650 font-bold">
                      <span>Sales Markup (+)</span>
                      <span className="font-mono">+ {formatCurrency(parseFloat(salesMarkup) || 0)}</span>
                    </div>
                  )}

                  {discountRequested && parseFloat(discountRequested) > 0 && (
                    <div className="flex justify-between border-b border-zinc-150 pb-1.5 text-amber-605 font-bold">
                      <span>Adjustment (Discount)</span>
                      <span className="font-mono">- {formatCurrency(parseFloat(discountRequested) || 0)}</span>
                    </div>
                  )}

                  <div className="flex justify-between pt-1.5 text-sm font-black border-t border-zinc-300">
                    <span className="text-zinc-900">Combined Net Selling Price</span>
                    <span className="font-mono text-emerald-650 text-base">
                      {formatCurrency(
                        Math.max(0, quotationItems.reduce((sum, item) => sum + item.totalCost, 0) + (parseFloat(salesMarkup) || 0) - (parseFloat(discountRequested) || 0))
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Save actions panel */}
              <div className="space-y-4 flex flex-col justify-between">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase text-zinc-500">Sales Markup (+)</Label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-xs">₹</span>
                      <Input 
                        type="number" 
                        placeholder="Add extra markup amount" 
                        value={salesMarkup}
                        onChange={(e) => setSalesMarkup(e.target.value)}
                        className="bg-white border-zinc-450 pl-7 h-10 focus:ring-emerald-500 text-sm font-bold text-emerald-600 focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-bold uppercase text-zinc-500 flex items-center justify-between">
                      <span>Discount Requested (-)</span>
                    </Label>
                    <div className="relative">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-xs">₹</span>
                      <Input 
                        type="number" 
                        placeholder="Overall discount amount" 
                        value={discountRequested}
                        onChange={(e) => setDiscountRequested(e.target.value)}
                        className="bg-white border-zinc-450 pl-7 h-10 focus:ring-amber-500 text-sm font-bold text-amber-600 focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {discountRequested && parseFloat(discountRequested) > 0 && (
                    <div className="space-y-1 animate-in fade-in slide-in-from-top-1">
                      <Label className="text-[10px] font-bold uppercase text-amber-600 flex items-center gap-1.5">
                        <span>Discount Clarification Reason</span>
                        <span className="text-[8px] font-extrabold uppercase bg-amber-50 text-amber-700 px-1 rounded border border-amber-100">Requires Admin Approval</span>
                      </Label>
                      <Input 
                        placeholder="Provide details about why discount is requested..." 
                        value={discountReason}
                        onChange={(e) => setDiscountReason(e.target.value)}
                        className="bg-white border-amber-200 focus:ring-amber-500 focus:border-amber-500 h-9 text-xs italic"
                      />
                    </div>
                  )}
                </div>

                {user?.permission === 'read' && (
                  <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium">
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Read-only mode: saving disabled.</span>
                  </div>
                )}

                <div className="flex gap-3 mt-auto">
                  <Button 
                    variant="outline" 
                    className="flex-1 gap-1.5 h-10 border-zinc-300 hover:bg-zinc-50 text-zinc-700 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer" 
                    onClick={() => handleSaveQuotation('draft')}
                    disabled={user?.permission === 'read'}
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save Draft
                  </Button>
                  <Button 
                    className="flex-2 gap-1.5 bg-[#1e40af] hover:bg-[#1d4ed8] text-white h-10 text-xs font-bold shadow-sm transition-all active:scale-[0.98] rounded-[6px] cursor-pointer disabled:opacity-50 cursor-pointer"
                    onClick={() => handleSaveQuotation(discountRequested && parseFloat(discountRequested) > 0 ? 'pending_approval' : 'draft')}
                    disabled={user?.permission === 'read'}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {discountRequested && parseFloat(discountRequested) > 0 ? 'Submit Review' : 'Finalize'}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {formData.clientId && (
        <Card className="border-zinc-300 shadow-xl bg-white/80 backdrop-blur-sm mt-4 overflow-hidden">
          <CardHeader className="bg-zinc-50/50 border-b border-zinc-100 py-3">
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 rounded bg-blue-50 text-[#1e40af] flex items-center justify-center">
                <Save className="h-3.5 w-3.5 text-white" />
              </div>
              <div>
                <CardTitle className="text-base">Client History</CardTitle>
                <CardDescription className="text-[10px] font-medium">Recent quotations for {clients?.find?.(c => c.id === formData.clientId)?.name || 'Client'}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {combinedHistory.length === 0 ? (
              <div className="py-10 flex flex-col items-center justify-center opacity-40">
                <CalcIcon className="h-7 w-7 mb-1.5" />
                <p className="text-[10px] font-bold uppercase tracking-widest italic">New Client Data Flow</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-zinc-50/30">
                    <TableRow className="hover:bg-transparent h-10">
                      <TableHead className="text-[9px] font-black uppercase tracking-wider pl-4">Timeline</TableHead>
                      <TableHead className="text-[9px] font-black uppercase tracking-wider">Specs</TableHead>
                      <TableHead className="text-[9px] font-black uppercase tracking-wider">Dim</TableHead>
                      <TableHead className="text-[9px] font-black uppercase tracking-wider text-right pr-4">Value</TableHead>
                      <TableHead className="text-[9px] font-black uppercase tracking-wider text-center">Lifecycle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {combinedHistory.map((q) => (
                      <TableRow key={q.id} className="text-xs hover:bg-zinc-50/50 transition-colors group h-10">
                        <TableCell className="text-zinc-400 font-mono text-[10px] pl-4 py-2">
                          {formatOrderDate(q.createdAt, false)}
                        </TableCell>
                        <TableCell className="font-bold text-zinc-900 py-2">
                          {q.beltType} <span className="text-zinc-400 font-normal ml-0.5">({q.beltStyle || 'Std'})</span>
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-zinc-600 py-2">
                          {q.isMarginRequest ? (
                            <span className="text-zinc-400 font-sans font-medium">—</span>
                          ) : (
                            `${q.dimensions.length}${q.dimensions.lengthUnit || 'mm'}×${q.dimensions.width}${q.dimensions.widthUnit || 'mm'}`
                          )}
                        </TableCell>
                        <TableCell className="font-black text-right pr-4 py-2">
                          {q.isMarginRequest ? (
                            <span className="text-[10px] text-zinc-400 font-medium font-sans">Pending Margin</span>
                          ) : (
                            formatCurrency(Math.round(q.totalCost))
                          )}
                        </TableCell>
                        <TableCell className="py-2 pr-4 text-center">
                           {q.isMarginRequest ? (
                             <div className={cn(
                               "inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter border",
                               q.status === 'margin_approved' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                               q.status === 'margin_rejected' ? "bg-rose-50 text-rose-700 border-rose-100" :
                               "bg-amber-50 text-amber-700 border-amber-100"
                             )}>
                               {q.status === 'margin_approved' ? 'Margin Configured' :
                                q.status === 'margin_rejected' ? 'Margin Rejected' : 'Margin Request'}
                             </div>
                           ) : (
                             <div className={cn(
                               "inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter border",
                               q.status === 'approved' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                               q.status === 'pending_approval' ? "bg-amber-50 text-amber-700 border-amber-100" :
                               "bg-zinc-100 text-zinc-600 border-zinc-200"
                             )}>
                               {q.status.replace('_', ' ')}
                             </div>
                           )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── HOLE DATA POPUP ─── Auto-opens when selected belt item needs variable inputs */}
      <Dialog open={holePopupOpen} onOpenChange={setHolePopupOpen}>
        <DialogContent className="max-w-lg sm:max-w-lg mx-auto p-0 bg-white rounded-2xl border border-amber-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 px-6 py-5 border-b border-amber-100">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-100 rounded-xl border border-amber-200">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/></svg>
              </div>
              <div className="flex-1">
                <h2 className="text-base font-black text-amber-900">Variables Configuration</h2>
                {holePopupItem && (
                  <p className="text-xs text-amber-700 font-bold mt-0.5">
                    ● Working on: <span className="text-amber-900 uppercase tracking-wide">{holePopupItem.optionName || holePopupItem.name}</span>
                    <span className="text-amber-500 font-medium"> — fill in the required variables below</span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Belt reference info */}
          <div className="px-6 pt-4 pb-2">
            <div className="bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-2.5 flex gap-6 text-xs">
              <div>
                <span className="text-zinc-400 font-bold uppercase text-[9px] block">Belt Length</span>
                <span className="font-black text-zinc-800">{formData.length} {formData.lengthUnit}</span>
              </div>
              <div>
                <span className="text-zinc-400 font-bold uppercase text-[9px] block">Belt Width</span>
                <span className="font-black text-zinc-800">{formData.width} {formData.widthUnit}</span>
              </div>
            </div>
          </div>

          {/* Inputs */}
          <div className="px-6 pb-4 pt-2 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-wider text-amber-700">Area Length (mm)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 1000"
                  value={holeData.holeLength}
                  onChange={(e) => setHoleData({ ...holeData, holeLength: e.target.value })}
                  className="h-10 border-amber-200 bg-amber-50/40 focus:border-amber-400 focus:bg-white transition-all font-bold text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-wider text-amber-700">Area Width (mm)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 500"
                  value={holeData.holeWidth}
                  onChange={(e) => setHoleData({ ...holeData, holeWidth: e.target.value })}
                  className="h-10 border-amber-200 bg-amber-50/40 focus:border-amber-400 focus:bg-white transition-all font-bold text-sm"
                />
              </div>
            </div>

            {getRequiredFields().includes('holeDistHorizontal') && (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-wider text-amber-700">Horizontal Spacing — HHD (mm) <span className="text-amber-400 normal-case font-medium">(gap between holes)</span></Label>
                <Input
                  type="number"
                  placeholder="e.g. 15"
                  value={holeData.holeDistHorizontal}
                  onChange={(e) => setHoleData({ ...holeData, holeDistHorizontal: e.target.value })}
                  className="h-10 border-amber-200 bg-amber-50/40 focus:border-amber-400 focus:bg-white transition-all font-bold text-sm"
                />
              </div>
            )}

            {getRequiredFields().includes('holeDistVertical') && (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-wider text-amber-700">Vertical Spacing — VHD (mm) <span className="text-amber-400 normal-case font-medium">(gap between holes)</span></Label>
                <Input
                  type="number"
                  placeholder="e.g. 12"
                  value={holeData.holeDistVertical}
                  onChange={(e) => setHoleData({ ...holeData, holeDistVertical: e.target.value })}
                  className="h-10 border-amber-200 bg-amber-50/40 focus:border-amber-400 focus:bg-white transition-all font-bold text-sm"
                />
              </div>
            )}

            {/* Hole Size — ALWAYS shown when spacing fields are present (needed for Pitch = Spacing + HoleSize) */}
            {(getRequiredFields().includes('holeSize') || getRequiredFields().includes('holeDistHorizontal') || getRequiredFields().includes('holeDistVertical')) && (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-wider text-amber-700">
                  Hole / Eyelet Size — HS (mm)
                  <span className="text-amber-400 normal-case font-medium ml-1">(Pitch = HHD + HS)</span>
                </Label>
                <Input
                  type="number"
                  placeholder="e.g. 5"
                  value={holeData.holeSize}
                  onChange={(e) => setHoleData({ ...holeData, holeSize: e.target.value })}
                  className="h-10 border-amber-200 bg-amber-50/40 focus:border-amber-400 focus:bg-white transition-all font-bold text-sm"
                />
              </div>
            )}

            {getRequiredFields().includes('pricePerHole') && (
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-wider text-amber-700">Price per Hole / Eyelet (₹)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 2.50"
                  value={holeData.pricePerHole}
                  onChange={(e) => setHoleData({ ...holeData, pricePerHole: e.target.value })}
                  className="h-10 border-amber-200 bg-amber-50/40 focus:border-amber-400 focus:bg-white transition-all font-bold text-sm"
                />
              </div>
            )}

            {/* ─── LIVE CALCULATION PREVIEW (Center-to-Center / Pitch Logic) ─── */}
            {(() => {
              const L = parseFloat(holeData.holeLength) || 0;
              const W = parseFloat(holeData.holeWidth) || 0;
              const hSpacing = parseFloat(holeData.holeDistHorizontal) || 0; // gap between holes
              const vSpacing = parseFloat(holeData.holeDistVertical) || 0;   // gap between holes
              const holeSize = parseFloat(holeData.holeSize) || 0;
              const showLive = getRequiredFields().includes('holeDistHorizontal') || getRequiredFields().includes('holeDistVertical');
              if (!showLive) return null;

              // PITCH (Center-to-Center) = Spacing (khaali gap) + Hole Size
              // e.g. spacing=15mm + hole=5mm → pitch=20mm center-to-center
              const pitchH = hSpacing > 0 ? hSpacing + holeSize : 0;
              const pitchV = vSpacing > 0 ? vSpacing + holeSize : 0;

              // Holes = floor(Length / Pitch) + 1  (corner se shuru, corner tak)
              const holesH = pitchH > 0 && L > 0 ? Math.floor(L / pitchH) + 1 : null;
              const holesV = pitchV > 0 && W > 0 ? Math.floor(W / pitchV) + 1 : null;
              const totalHoles = (holesH !== null && holesV !== null) ? holesH * holesV : null;

              return (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-600">📐 Live Hole Count Preview (Center-to-Center)</p>

                  {/* Pitch row */}
                  {holeSize > 0 && (hSpacing > 0 || vSpacing > 0) && (
                    <div className="grid grid-cols-2 gap-2">
                      {hSpacing > 0 && (
                        <div className="bg-white/80 border border-amber-100 rounded-lg px-3 py-1.5 text-center">
                          <span className="text-[9px] font-black uppercase text-amber-400 block">H Pitch</span>
                          <span className="text-xs font-black text-amber-800">{hSpacing} + {holeSize} = <span className="text-amber-600">{pitchH}mm</span></span>
                        </div>
                      )}
                      {vSpacing > 0 && (
                        <div className="bg-white/80 border border-amber-100 rounded-lg px-3 py-1.5 text-center">
                          <span className="text-[9px] font-black uppercase text-amber-400 block">V Pitch</span>
                          <span className="text-xs font-black text-amber-800">{vSpacing} + {holeSize} = <span className="text-amber-600">{pitchV}mm</span></span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Hole count cards */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-lg p-2.5 border border-amber-100 text-center">
                      <span className="text-[9px] font-black uppercase text-amber-500 block">Horizontal</span>
                      <span className="text-xl font-black text-amber-900">
                        {holesH !== null ? holesH : <span className="text-zinc-400 text-sm">—</span>}
                      </span>
                      <span className="text-[9px] text-amber-400 font-medium">
                        {L > 0 && pitchH > 0 ? `⌊${L}÷${pitchH}⌋+1` : 'fill HHD'}
                      </span>
                    </div>
                    <div className="bg-white rounded-lg p-2.5 border border-amber-100 text-center">
                      <span className="text-[9px] font-black uppercase text-amber-500 block">Vertical</span>
                      <span className="text-xl font-black text-amber-900">
                        {holesV !== null ? holesV : <span className="text-zinc-400 text-sm">—</span>}
                      </span>
                      <span className="text-[9px] text-amber-400 font-medium">
                        {W > 0 && pitchV > 0 ? `⌊${W}÷${pitchV}⌋+1` : 'fill VHD'}
                      </span>
                    </div>
                    <div className="bg-amber-500 rounded-lg p-2.5 text-center">
                      <span className="text-[9px] font-black uppercase text-amber-100 block">Total</span>
                      <span className="text-xl font-black text-white">
                        {totalHoles !== null ? totalHoles.toLocaleString() : <span className="text-amber-200 text-sm">—</span>}
                      </span>
                      <span className="text-[9px] text-amber-100 font-medium">{totalHoles !== null ? 'eyelets' : 'H × V'}</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1 border-zinc-200 text-zinc-600 h-10 font-bold"
                onClick={() => {
                  setHolePopupOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white h-10 font-black"
                disabled={(() => {
                  const req = getRequiredFields();
                  return req.some(f => {
                    if (f === 'holeSize') return !holeData.holeSize;
                    if (f === 'holeDistHorizontal') return !holeData.holeDistHorizontal;
                    if (f === 'holeDistVertical') return !holeData.holeDistVertical;
                    if (f === 'pricePerHole') return !holeData.pricePerHole;
                    return false;
                  }) || !holeData.holeLength || !holeData.holeWidth;
                })()}
                onClick={() => {
                  setHolePopupOpen(false);
                }}
              >
                Confirm & Save ✓
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Confirmation Modal */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent className="max-w-md sm:max-w-md mx-auto p-6 bg-white/95 backdrop-blur-md rounded-2xl border border-zinc-200 shadow-2xl animate-in zoom-in-95 duration-200">
          <DialogHeader className="pb-3 border-b border-zinc-100">
            <DialogTitle className="text-lg font-black text-zinc-900 flex items-center gap-2">
              <CalcIcon className="h-5 w-5 text-indigo-600" />
              Confirm Costing Parameters
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 font-medium">
              Please verify the entered configuration parameters before calculating the costing.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3.5 text-sm">
            <div className="grid grid-cols-3 gap-1">
              <span className="text-xs font-black uppercase text-zinc-400">Client:</span>
              <span className="col-span-2 font-bold text-zinc-800">{selectedClient?.name || 'N/A'}</span>
            </div>
            
            <div className="grid grid-cols-3 gap-1">
              <span className="text-xs font-black uppercase text-zinc-400">Category:</span>
              <span className="col-span-2 font-bold text-zinc-800">{formData.beltType || 'N/A'}</span>
            </div>

            <div className="grid grid-cols-3 gap-1">
              <span className="text-xs font-black uppercase text-zinc-400">Style:</span>
              <span className="col-span-2 font-bold text-zinc-800">{formData.beltStyle || 'N/A'}</span>
            </div>

            <div className="grid grid-cols-3 gap-1">
              <span className="text-xs font-black uppercase text-zinc-400">Dimensions:</span>
              <span className="col-span-2 font-black text-indigo-700">
                {formData.length} {formData.lengthUnit} × {formData.width} {formData.widthUnit}
              </span>
            </div>

            <div className="border-t border-zinc-100 pt-3 space-y-2">
              <span className="text-xs font-black uppercase text-zinc-400 block mb-1">Included BOM Components:</span>
              <div className="bg-zinc-50/80 rounded-xl p-3 border border-zinc-150 max-h-[160px] overflow-y-auto space-y-1.5 custom-scrollbar">
                {(() => {
                  const category = (Array.isArray(config?.beltTypes) ? config.beltTypes : [])?.find?.(t => t.name === formData.beltType) || null;
                  const style = (Array.isArray(category?.styles) ? category.styles : [])?.find?.(s => s.name === formData.beltStyle) || null;
                  if (!style || !Array.isArray(style.bom) || style.bom.length === 0) {
                    return <p className="text-xs text-zinc-400 italic">No BOM components found.</p>;
                  }
                  
                  const included = formData.selectedBOMOptions?._included;
                  const checkedItems = style.bom.filter((item: any) => !included || included[item.id] !== false);
                  
                  if (checkedItems.length === 0) {
                    return <p className="text-xs text-rose-500 font-bold italic">No BOM components selected!</p>;
                  }

                   const remarks = formData.selectedBOMOptions?._remarks || {};
                  const optRemarks = formData.selectedBOMOptions?._optRemarks || {};
                  return checkedItems.map((item: any) => {
                    const hasOptions = Array.isArray(item.options) && item.options.length > 0;
                    const rawSel = formData.selectedBOMOptions[item.id];
                    const selectedOptIndices: number[] = Array.isArray(rawSel)
                      ? rawSel
                      : rawSel !== undefined ? [rawSel] : [];
                    const itemRemark = remarks[item.id];
                    return (
                      <div key={item.id} className="flex flex-col gap-0.5 border-b border-zinc-100/50 pb-1.5 last:border-none last:pb-0">
                        <div className="flex justify-between items-baseline text-xs">
                          <span className="font-bold text-zinc-700">{item.name}</span>
                          {selectedOptIndices.length === 0 && (
                            <span className="text-[10px] text-zinc-400 italic">
                              {hasOptions && user?.role === 'admin' ? `Default (₹${item.options[0]?.rate ?? item.rate}/${item.options[0]?.unit ?? item.unit})` : 'Default'}
                            </span>
                          )}
                        </div>
                        {/* Show each selected sub-category option */}
                        {selectedOptIndices.map((optIdx: number) => {
                          const opt = hasOptions ? item.options[optIdx] : null;
                          if (!opt) return null;
                          const optRemarkKey = `${item.id}_${optIdx}`;
                          const optRemark = optRemarks[optRemarkKey];
                          return (
                            <div key={optIdx} className="pl-2 flex flex-col gap-0.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] text-zinc-600 flex items-center gap-1">
                                  <span className="text-zinc-400">↳</span>
                                  <span className="font-semibold">{opt.name}</span>
                                </span>
                                {user?.role === 'admin' && (
                                  <span className="text-[9px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-md shrink-0">
                                    ₹{opt.rate}/{opt.unit || item.unit}
                                  </span>
                                )}
                              </div>
                              {optRemark && (
                                <div className="text-[10px] text-indigo-700 italic bg-indigo-50/60 px-1.5 py-0.5 rounded border border-indigo-100 ml-3">
                                  📝 {optRemark}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {itemRemark && (
                          <div className="text-[10px] text-amber-700 italic bg-amber-50/60 px-1.5 py-0.5 rounded border border-amber-100">
                            📝 {itemRemark}
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-100 flex gap-3">
            <Button 
              variant="outline" 
              onClick={() => setIsConfirmOpen(false)}
              className="flex-1 border-zinc-200 text-zinc-700 h-10 font-bold text-xs rounded-xl"
            >
              Cancel
            </Button>
            <Button 
              onClick={executeCalculate}
              className="flex-1 bg-[#1e40af] hover:bg-[#1d4ed8] text-white h-10 font-bold text-xs rounded-xl shadow-sm cursor-pointer"
            >
              Confirm & Calculate
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
