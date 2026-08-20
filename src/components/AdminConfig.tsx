import React, { useState } from 'react';
import { Config, Company, MaterialStock, ClientCategory } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { UserPlus, Trash2, Upload, Download, Search, Edit2, Save, X, IndianRupee, Percent, ListPlus, Settings2, Lock, Unlock, Plus, Link2, Building2, ChevronDown, ChevronLeft, Info, Clock, Loader2, GitMerge, Tags } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useAuth } from '../contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { cn } from '../lib/utils';

interface AdminConfigProps {
  config: Config;
  onRefresh?: () => void;
}

export const AdminConfig: React.FC<AdminConfigProps> = ({ config, onRefresh }) => {
  const { user } = useAuth();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [editingCompany, setEditingCompany] = useState<{ id: string; name: string } | null>(null);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [materialStocks, setMaterialStocks] = useState<MaterialStock[]>([]);

  const [clientCategories, setClientCategories] = useState<ClientCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string } | null>(null);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);

  const [selectedBOMIndices, setSelectedBOMIndices] = useState<number[]>([]);

  const fetchCompanies = async () => {
    setIsLoadingCompanies(true);
    try {
      const res = await fetch('/api/companies');
      if (res.ok) {
        const data = await res.json();
        setCompanies(data);
      }
    } catch (err) {
      console.error('Failed to fetch companies:', err);
    } finally {
      setIsLoadingCompanies(false);
    }
  };

  const fetchClientCategories = async () => {
    setIsLoadingCategories(true);
    try {
      const res = await fetch('/api/client-categories');
      if (res.ok) {
        const data = await res.json();
        setClientCategories(data);
      }
    } catch (err) {
      console.error('Failed to fetch client categories:', err);
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const fetchMaterialStocks = async () => {
    try {
      const res = await fetch('/api/material-stocks');
      if (res.ok) {
        const data = await res.json();
        setMaterialStocks(data);
      }
    } catch (err) {
      console.error('Failed to fetch material stocks:', err);
    }
  };

  const verifyDeletionCode = async (itemName: string): Promise<boolean> => {
    if (user?.role !== 'admin') return true; // Non-admins skip
    try {
      const checkRes = await fetch('/api/auth/me');
      if (checkRes.ok) {
        const checkData = await checkRes.json();
        if (!checkData.user?.hasDeletionCode) {
          alert('No Deletion Security Code configured for your account. Please set it in User Management first.');
          return false;
        }
      }
    } catch {
      // If check fails, proceed to prompt for safety
    }
    const entered = prompt(`Enter Deletion Security Code to delete "${itemName}":`);
    if (entered === null || entered.trim() === '') return false;
    try {
      const res = await fetch('/api/auth/verify-deletion-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: entered })
      });
      if (res.ok) {
        return true;
      } else {
        const data = await res.json();
        alert(data.error || 'Incorrect security code! Deletion cancelled.');
        return false;
      }
    } catch (err) {
      alert('Failed to verify security code due to network/server error.');
      return false;
    }
  };

  React.useEffect(() => {
    fetchCompanies();
    fetchClientCategories();
    fetchMaterialStocks();
  }, []);

  const handleAddCompany = async () => {
    if (!newCompanyName.trim()) return;
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCompanyName.trim() }),
      });
      if (res.ok) {
        toast.success('Company added successfully');
        setNewCompanyName('');
        fetchCompanies();
      } else {
        const errData = await res.json();
        toast.error(errData.error || 'Failed to add company');
      }
    } catch (err) {
      toast.error('Failed to add company');
    }
  };

  const handleUpdateCompany = async () => {
    if (!editingCompany || !editingCompany.name.trim()) return;
    try {
      const res = await fetch(`/api/companies/${editingCompany.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingCompany.name.trim() }),
      });
      if (res.ok) {
        toast.success('Company updated successfully');
        setEditingCompany(null);
        fetchCompanies();
      } else {
        const errData = await res.json();
        toast.error(errData.error || 'Failed to update company');
      }
    } catch (err) {
      toast.error('Failed to update company');
    }
  };

  const handleDeleteCompany = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      const res = await fetch(`/api/companies/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('Company deleted successfully');
        fetchCompanies();
      } else {
        toast.error('Failed to delete company');
      }
    } catch (err) {
      toast.error('Failed to delete company');
    }
  };

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      const res = await fetch('/api/client-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });
      if (res.ok) {
        toast.success('Client category added successfully');
        setNewCategoryName('');
        fetchClientCategories();
      } else {
        const errData = await res.json();
        toast.error(errData.error || 'Failed to add category');
      }
    } catch (err) {
      toast.error('Failed to add category');
    }
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || !editingCategory.name.trim()) return;
    try {
      const res = await fetch(`/api/client-categories/${editingCategory.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingCategory.name.trim() }),
      });
      if (res.ok) {
        toast.success('Category updated successfully');
        setEditingCategory(null);
        fetchClientCategories();
      } else {
        const errData = await res.json();
        toast.error(errData.error || 'Failed to update category');
      }
    } catch (err) {
      toast.error('Failed to update category');
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete category "${name}"?`)) return;
    try {
      const res = await fetch(`/api/client-categories/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('Category deleted successfully');
        fetchClientCategories();
      } else {
        toast.error('Failed to delete category');
      }
    } catch (err) {
      toast.error('Failed to delete category');
    }
  };
  
  const [localConfig, setLocalConfig] = useState<Config>(() => {
    const defaultConfig: Config = {
      rates: { mesh: 10, fep: 20, thread: 5, pin: 15, packing: 50 },
      constants: { purchaseGst: 18, fixCost: 10, defaultProfit: 20, saleGst: 18 },
      beltTypes: [],
      jointTypes: [],
      tapeTypes: [],
      units: [{ id: 'mm', label: 'Millimeters (mm)', value: 'mm' }, { id: 'mtr', label: 'Meters (mtr)', value: 'mtr' }],
      variables: []
    };
    
    const merged = { ...defaultConfig, ...config };
    merged.constants = { ...defaultConfig.constants, ...config?.constants };
    merged.rates = { ...defaultConfig.rates, ...config?.rates };
    merged.beltTypes = config?.beltTypes || [];
    merged.jointTypes = config?.jointTypes || [];
    merged.tapeTypes = config?.tapeTypes || [];
    merged.units = config?.units || defaultConfig.units;
    merged.variables = config?.variables || [];
    return merged;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [newItem, setNewItem] = useState({ 
    beltType: '', 
    styleName: '',
  });

  const [editingBOM, setEditingBOM] = useState<{ tIdx: number, sIdx: number } | null>(null);
  const [newBOMItem, setNewBOMItem] = useState<any>({ name: '', rate: '', unit: '', formula: 'L * W' });

  // Custom variables management state
  const [newVarName, setNewVarName] = useState('');
  const [newVarSymbol, setNewVarSymbol] = useState('');
  const [newVarMappedField, setNewVarMappedField] = useState<'length' | 'width' | 'holeSize' | 'holeDistHorizontal' | 'holeDistVertical' | 'pricePerHole' | 'rate' | 'totalHoles' | 'holesH' | 'holesV' | 'manualPackingCost' | 'manualProfitMargin' | 'purchaseGst' | 'fixCost' | 'defaultProfit' | 'saleGst'>('length');
  const [showVariablesModal, setShowVariablesModal] = useState(false);
  const [varTarget, setVarTarget] = useState<'active' | 'new'>('active');
  const [activeOptionName, setActiveOptionName] = useState<string | null>(null);

  const getActiveBOMVariables = (): any[] => {
    if (varTarget === 'new') {
      return newBOMItem.variables || [];
    }
    if (selectedCatIdx !== null && selectedStyleIdx !== null && selectedBOMIdx !== null) {
      return localConfig.beltTypes[selectedCatIdx]?.styles?.[selectedStyleIdx]?.bom?.[selectedBOMIdx]?.variables || [];
    }
    return [];
  };

  const updateActiveBOMVariables = (updatedVars: any[]) => {
    if (varTarget === 'new') {
      setNewBOMItem({ ...newBOMItem, variables: updatedVars });
    } else if (selectedCatIdx !== null && selectedStyleIdx !== null && selectedBOMIdx !== null) {
      const updated = JSON.parse(JSON.stringify(localConfig.beltTypes));
      if (updated[selectedCatIdx]?.styles?.[selectedStyleIdx]?.bom?.[selectedBOMIdx]) {
        updated[selectedCatIdx].styles[selectedStyleIdx].bom[selectedBOMIdx].variables = updatedVars;
        const nextConfig = { ...localConfig, beltTypes: updated };
        setLocalConfig(nextConfig);
        saveConfig(updated, nextConfig);
      }
    }
  };

  const isValidFormulaInput = (val: string, itemVariables?: any[], optionName?: string) => {
    const upperVal = val.toUpperCase();
    if (!/^[0-9A-Z\.\+\-\*\/\(\)\s]*$/.test(upperVal)) {
      return false;
    }
    // Filter variables: only allow variables that have no option restriction, or match the current option name
    const targetOption = optionName || undefined;
    const filteredVars = (itemVariables || []).filter((v: any) => v.forOptionName === targetOption);
    const allowedVars = ['L', 'W', 'P', 'R', ...filteredVars.map((v: any) => v.symbol.toUpperCase())];
    const letterTokens = upperVal.match(/[A-Z]+/g) || [];
    for (const token of letterTokens) {
      const isPrefixOfAny = allowedVars.some(v => v.startsWith(token));
      if (!isPrefixOfAny) return false;
    }
    return true;
  };

  const handleAddVariable = () => {
    if (!newVarName.trim()) {
      toast.error('Variable Name is required');
      return;
    }
    const symbolClean = newVarSymbol.trim().toUpperCase();
    if (!symbolClean) {
      toast.error('Variable symbol (sign) is required');
      return;
    }
    if (!/^[A-Z][A-Z0-9]*$/.test(symbolClean)) {
      toast.error('Symbol must start with a capital letter and contain only letters and numbers (e.g. HHD, L2)');
      return;
    }
    const isReserved = ['L', 'W', 'P', 'R'].includes(symbolClean);
    const currentVars = getActiveBOMVariables();
    const isDuplicate = currentVars.some((v: any) => v.symbol === symbolClean && v.forOptionName === (activeOptionName || undefined));
    if (isReserved) {
      toast.error(`Symbol "${symbolClean}" is a default reserved variable symbol.`);
      return;
    }
    if (isDuplicate) {
      toast.error(`Symbol "${symbolClean}" is already in use.`);
      return;
    }
    const newVar = {
      id: Date.now().toString(),
      name: newVarName.trim(),
      symbol: symbolClean,
      mappedField: newVarMappedField,
      forOptionName: varTarget === 'active' ? (activeOptionName || undefined) : undefined
    };
    const updatedVars = [...currentVars, newVar];
    updateActiveBOMVariables(updatedVars);
    setNewVarName('');
    setNewVarSymbol('');
    setNewVarMappedField('length');
  };

  const handleDeleteVariable = (id: string, symbol: string) => {
    const currentVars = getActiveBOMVariables();
    const updatedVars = currentVars.filter((v: any) => v.id !== id);
    updateActiveBOMVariables(updatedVars);
  };

  const [selectedCatIdx, setSelectedCatIdx] = useState<number | null>(0);
  const [selectedStyleIdx, setSelectedStyleIdx] = useState<number | null>(null);
  const [selectedBOMIdx, setSelectedBOMIdx] = useState<number | null>(null);

  const [categoryModal, setCategoryModal] = useState<{
    isOpen: boolean;
    mode: 'add' | 'edit';
    catIdx?: number;
    name: string;
    gst: string;
  }>({
    isOpen: false,
    mode: 'add',
    name: '',
    gst: ''
  });

  const [rateHistoryItem, setRateHistoryItem] = useState<{ itemId: string; name: string } | null>(null);
  const [rateHistoryList, setRateHistoryList] = useState<{ oldRate: number; newRate: number; changedBy: string; changedAt: string }[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [configTab, setConfigTab] = useState<'belts' | 'settings'>('belts');

  const openRateHistory = async (itemId: string, name: string) => {
    setRateHistoryItem({ itemId, name });
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/settings/config/rate-history?itemId=${encodeURIComponent(itemId)}`);
      if (res.ok) {
        const data = await res.json();
        setRateHistoryList(data);
      } else {
        toast.error('Failed to load rate history');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load rate history');
    } finally {
      setLoadingHistory(false);
    }
  };

  const GST_OPTIONS = [
    { label: 'No Override (Use Global)', value: '' },
    { label: '5%', value: '5' },
    { label: '8%', value: '8' },
    { label: '12%', value: '12' },
    { label: '18%', value: '18' },
  ];

  const handleMergeThreadAndPin = (catIdx: number, styleIdx: number) => {
    const updated = [...localConfig.beltTypes];
    const style = updated[catIdx]?.styles?.[styleIdx];
    if (!style || !Array.isArray(style.bom)) return;

    const threadIdx = style.bom.findIndex((b: any) => b.name && (b.name.toLowerCase().includes('thread') || b.name.toLowerCase().includes('thraed')));
    const pinIdx = style.bom.findIndex((b: any) => b.name && b.name.toLowerCase().includes('pin'));

    if (threadIdx === -1 && pinIdx === -1) {
      toast.error('Neither Thread nor PIN found in this style BOM.');
      return;
    }

    const threadItem = threadIdx !== -1 ? style.bom[threadIdx] : null;
    const pinItem = pinIdx !== -1 ? style.bom[pinIdx] : null;

    const pinFormula = pinItem?.formula || 'W*1.05*2';
    const threadFormula = threadItem?.formula || 'W*10*4*2';

    const mergedItem = {
      id: Date.now().toString(),
      name: 'Thread & PIN',
      rate: pinItem?.rate || threadItem?.rate || 115,
      unit: pinItem?.unit || 'mtr',
      formula: `(${pinFormula}) + (${threadFormula})`,
      variables: [...(pinItem?.variables || []), ...(threadItem?.variables || [])]
    };

    const indicesToRemove = [threadIdx, pinIdx].filter(i => i !== -1).sort((a, b) => b - a);
    indicesToRemove.forEach(i => style.bom.splice(i, 1));
    style.bom.push(mergedItem);

    setLocalConfig({ ...localConfig, beltTypes: updated });
    setSelectedBOMIdx(null);
    setSelectedBOMIndices([]);
    saveConfig(updated);
    toast.success('Thread and PIN merged into "Thread & PIN" successfully!');
  };

  const handleSplitThreadAndPin = (catIdx: number, styleIdx: number) => {
    const updated = [...localConfig.beltTypes];
    const style = updated[catIdx]?.styles?.[styleIdx];
    if (!style || !Array.isArray(style.bom)) return;

    const mergedIdx = style.bom.findIndex((b: any) => b.name && (b.name.toLowerCase().includes('thread & pin') || b.name.toLowerCase().includes('thread & pin joint')));
    if (mergedIdx === -1) {
      toast.error('Merged "Thread & PIN" component not found in this style.');
      return;
    }

    style.bom.splice(mergedIdx, 1);
    style.bom.push(
      { id: Date.now().toString(), name: 'Thread', rate: 1, formula: 'W*10*4*2', unit: 'mtr' },
      { id: (Date.now() + 1).toString(), name: 'PIN', rate: 115, formula: 'W*1.05*2', unit: 'mtr' }
    );

    setLocalConfig({ ...localConfig, beltTypes: updated });
    setSelectedBOMIdx(null);
    setSelectedBOMIndices([]);
    saveConfig(updated);
    toast.success('Split "Thread & PIN" back into individual Thread and PIN items!');
  };

  const handleMergeSelectedBOMItems = (catIdx: number, styleIdx: number) => {
    if (selectedBOMIndices.length < 2) {
      toast.error('Select at least 2 BOM items to merge.');
      return;
    }

    const updated = [...localConfig.beltTypes];
    const style = updated[catIdx]?.styles?.[styleIdx];
    if (!style || !Array.isArray(style.bom)) return;

    const selectedItems = selectedBOMIndices.map(i => style.bom[i]).filter(Boolean);
    const defaultMergedName = selectedItems.map(i => i.name).join(' & ');
    const mergedName = prompt('Enter name for the merged component:', defaultMergedName);
    if (!mergedName || !mergedName.trim()) return;

    const combinedFormula = selectedItems.map(i => `(${i.formula || '0'})`).join(' + ');
    const firstRate = selectedItems[0]?.rate || 0;
    const firstUnit = selectedItems[0]?.unit || 'sqm';

    const mergedItem = {
      id: Date.now().toString(),
      name: mergedName.trim(),
      rate: firstRate,
      unit: firstUnit,
      formula: combinedFormula,
      variables: selectedItems.flatMap(i => i.variables || [])
    };

    const sortedIndices = [...selectedBOMIndices].sort((a, b) => b - a);
    sortedIndices.forEach(i => style.bom.splice(i, 1));
    style.bom.push(mergedItem);

    setLocalConfig({ ...localConfig, beltTypes: updated });
    setSelectedBOMIdx(null);
    setSelectedBOMIndices([]);
    saveConfig(updated);
    toast.success(`Merged ${selectedItems.length} components into "${mergedName.trim()}"!`);
  };

  const handleMergeSideEdgesAndFEP = (catIdx: number, styleIdx: number) => {
    const updated = [...localConfig.beltTypes];
    const style = updated[catIdx]?.styles?.[styleIdx];
    if (!style || !Array.isArray(style.bom)) return;

    const redBorderIdx = style.bom.findIndex((b: any) => b.name && (b.name.toLowerCase().includes('red bodar') || b.name.toLowerCase().includes('red border') || b.name.toLowerCase().includes('side edges')));
    const fepIdx = style.bom.findIndex((b: any) => b.name && b.name.toLowerCase().includes('fep'));

    if (redBorderIdx === -1 && fepIdx === -1) {
      toast.error('Neither RED Border nor FEP Film found in this style BOM.');
      return;
    }

    const borderItem = redBorderIdx !== -1 ? style.bom[redBorderIdx] : null;
    const fepItem = fepIdx !== -1 ? style.bom[fepIdx] : null;

    const combinedRate = (parseFloat(String(borderItem?.rate || 0)) || 0) + (parseFloat(String(fepItem?.rate || 0)) || 0);

    const mergedItem = {
      id: Date.now().toString(),
      name: 'Side Edges (RED Border + FEP)',
      rate: combinedRate || 28,
      unit: borderItem?.unit || fepItem?.unit || 'mtr',
      formula: borderItem?.formula || fepItem?.formula || 'L*4',
      variables: [...(borderItem?.variables || []), ...(fepItem?.variables || [])]
    };

    const indicesToRemove = [redBorderIdx, fepIdx].filter(i => i !== -1).sort((a, b) => b - a);
    indicesToRemove.forEach(i => style.bom.splice(i, 1));
    style.bom.push(mergedItem);

    setLocalConfig({ ...localConfig, beltTypes: updated });
    setSelectedBOMIdx(null);
    setSelectedBOMIndices([]);
    saveConfig(updated);
    toast.success('Merged RED Border and FEP Film into "Side Edges (RED Border + FEP)"!');
  };

  const handleSplitSideEdgesAndFEP = (catIdx: number, styleIdx: number) => {
    const updated = [...localConfig.beltTypes];
    const style = updated[catIdx]?.styles?.[styleIdx];
    if (!style || !Array.isArray(style.bom)) return;

    const mergedIdx = style.bom.findIndex((b: any) => b.name && (b.name.toLowerCase().includes('side edges') || b.name.toLowerCase().includes('border + fep')));
    if (mergedIdx === -1) {
      toast.error('Merged "Side Edges" component not found in this style.');
      return;
    }

    style.bom.splice(mergedIdx, 1);
    style.bom.push(
      { id: Date.now().toString(), name: 'RED Bodar', rate: 19, formula: 'L*4', unit: 'mtr' },
      { id: (Date.now() + 1).toString(), name: 'FEP Film', rate: 9, formula: 'L*4', unit: 'mtr' }
    );

    setLocalConfig({ ...localConfig, beltTypes: updated });
    setSelectedBOMIdx(null);
    setSelectedBOMIndices([]);
    saveConfig(updated);
    toast.success('Split "Side Edges" back into RED Bodar and FEP Film!');
  };

  const saveConfig = async (updatedBeltTypes?: Config['beltTypes'], configOverride?: Config) => {
    setIsSaving(true);
    try {
      const baseConfig = configOverride || localConfig;
      const configToSave = {
        ...baseConfig,
        beltTypes: (updatedBeltTypes || baseConfig.beltTypes || []).filter((t: any) => t.name?.trim()),
      };
      
      const res = await fetch('/api/settings/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configToSave),
      });
      if (!res.ok) throw new Error('Failed to update configuration');

      setLocalConfig(configToSave);
      toast.success('Configuration saved permanently');
      onRefresh?.();
    } catch (err) {
      toast.error('Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = () => saveConfig();

  const handleSaveCategoryModal = () => {
    if (!categoryModal.name.trim()) {
      toast.error('Category Name is required');
      return;
    }
    const updated = [...localConfig.beltTypes];
    const name = categoryModal.name.trim();
    const gst = categoryModal.gst === '' ? undefined : parseFloat(categoryModal.gst);

    if (categoryModal.mode === 'add') {
      const isDuplicate = updated.some(t => t.name.toLowerCase() === name.toLowerCase());
      if (isDuplicate) {
        toast.error('A category with this name already exists');
        return;
      }
      updated.push({ id: Date.now().toString(), name, styles: [], gst });
      setSelectedCatIdx(updated.length - 1);
      setSelectedStyleIdx(null);
      setSelectedBOMIdx(null);
    } else {
      const idx = categoryModal.catIdx!;
      const isDuplicate = updated.some((t, i) => i !== idx && t.name.toLowerCase() === name.toLowerCase());
      if (isDuplicate) {
        toast.error('Another category with this name already exists');
        return;
      }
      updated[idx] = { ...updated[idx], name, gst };
    }

    setCategoryModal({ ...categoryModal, isOpen: false });
    saveConfig(updated);
  };



  const updateConstant = (key: keyof Config['constants'], value: string) => {
    setLocalConfig({
      ...localConfig,
      constants: { ...localConfig.constants, [key]: parseFloat(value) || 0 }
    });
  };

  const addItem = (type: 'beltTypes' | 'jointTypes' | 'tapeTypes') => {
    if (type === 'beltTypes') {
      const name = newItem.beltType.trim();
      if (!name) return;
      setLocalConfig({
        ...localConfig,
        beltTypes: [...(localConfig.beltTypes || []), { id: Date.now().toString(), name, styles: [] }]
      });
      setNewItem({ ...newItem, beltType: '' });
    }
  };

  const addStyle = (typeIdx: number) => {
    const name = newItem.styleName.trim();
    if (!name) return;
    const updated = [...localConfig.beltTypes];
    updated[typeIdx].styles = [...(updated[typeIdx].styles || []), { id: Date.now().toString(), name, bom: [] }];
    setLocalConfig({ ...localConfig, beltTypes: updated });
    setNewItem({ ...newItem, styleName: '' });
  };

  const removeStyle = (typeIdx: number, styleIdx: number) => {
    const updated = [...localConfig.beltTypes];
    updated[typeIdx].styles.splice(styleIdx, 1);
    setLocalConfig({ ...localConfig, beltTypes: updated });
  };

  const addBOMItem = () => {
    if (!editingBOM || !newBOMItem.name) return;
    const { tIdx, sIdx } = editingBOM;
    const updated = [...localConfig.beltTypes];
    const style = updated[tIdx].styles[sIdx];
    style.bom = [...(style.bom || []), { 
      id: Date.now().toString(),
      ...newBOMItem, 
      rate: parseFloat(newBOMItem.rate) || 0
    }];
    setLocalConfig({ ...localConfig, beltTypes: updated });
    setNewBOMItem({ name: '', rate: '', unit: 'sqm', formula: 'L * W', isLocked: false });
  };

  const removeBOMItem = (idx: number) => {
    let tIdx, sIdx;
    if (editingBOM) {
      tIdx = editingBOM.tIdx;
      sIdx = editingBOM.sIdx;
    } else if (selectedCatIdx !== null && selectedStyleIdx !== null) {
      tIdx = selectedCatIdx;
      sIdx = selectedStyleIdx;
    } else {
      return;
    }
    
    const updated = [...localConfig.beltTypes];
    updated[tIdx].styles[sIdx].bom.splice(idx, 1);
    setLocalConfig({ ...localConfig, beltTypes: updated });
  };


  const removeItem = (type: 'beltTypes', index: number) => {
    const updated = [...(localConfig[type] as any[])];
    updated.splice(index, 1);
    saveConfig(updated);
  };

  const convertRateToNewUnit = (rate: number, oldUnit: string, newUnit: string) => {
    if (!rate || !oldUnit || !newUnit || oldUnit === newUnit) return rate;
    
    const getMultiplierToMeter = (u: string) => {
       if (u === 'mm' || u === 'millimeters') return 0.001;
       if (u === 'ft' || u === 'feet') return 0.3048;
       if (u === 'in' || u === 'inch' || u === 'inches') return 0.0254;
       if (u === 'mtr' || u === 'm' || u === 'meter' || u === 'meters') return 1;
       return 1;
    };
    
    const oldU = oldUnit.toLowerCase();
    const newU = newUnit.toLowerCase();
    
    const isOldArea = oldU.includes('sq');
    const isNewArea = newU.includes('sq');
    
    if (isOldArea && isNewArea) {
        const oldBase = oldU.replace('sq', '').trim();
        const newBase = newU.replace('sq', '').trim();
        const oldMultiplier = getMultiplierToMeter(oldBase);
        const newMultiplier = getMultiplierToMeter(newBase);
        const oldSizeSqM = oldMultiplier * oldMultiplier;
        const newSizeSqM = newMultiplier * newMultiplier;
        return parseFloat((rate * (newSizeSqM / oldSizeSqM)).toFixed(6));
    } 
    
    if (!isOldArea && !isNewArea) {
        const oldMultiplier = getMultiplierToMeter(oldU);
        const newMultiplier = getMultiplierToMeter(newU);
        return parseFloat((rate * (newMultiplier / oldMultiplier)).toFixed(6));
    }
    
    return rate;
  };

  const getFilteredUnits = (formula: string) => {
    const f = (formula || '').toUpperCase();
    const hasL = f.includes('L');
    const hasW = f.includes('W');
    const hasP = f.includes('P');
    
    const isArea = hasL && hasW && f.includes('*');
    const isLength = (hasL || hasW || hasP) && !isArea;
    
    const allUnits = Array.isArray(localConfig?.units) ? localConfig.units : [];
    
    if (isArea) {
      // Look for existing area units
      const areaUnits = allUnits.filter((u: any) => {
        const label = (u.label || '').toLowerCase();
        const value = (u.value || '').toLowerCase();
        return label.includes('sq') || value.startsWith('sq') || label.includes('square') || label.includes('area');
      });
      
      if (areaUnits.length > 0) return areaUnits;
      
      // If no area units defined, virtualize them from length units
      return allUnits.filter((u: any) => {
        const label = (u.label || '').toLowerCase();
        return !label.includes('nos') && !label.includes('pcs') && !label.includes('unit');
      }).map((u: any) => ({
        ...u,
        id: `sq-${u.id}`,
        label: `Sq. ${u.label}`,
        value: `sq${u.value}`
      }));
    }
    
    if (isLength) {
      // Strictly show only linear units
      return allUnits.filter((u: any) => {
        const label = (u.label || '').toLowerCase();
        const value = (u.value || '').toLowerCase();
        const isAreaUnit = label.includes('sq') || value.startsWith('sq') || label.includes('square') || label.includes('area');
        const isCountUnit = label.includes('nos') || label.includes('pcs') || label.includes('unit');
        return !isAreaUnit && !isCountUnit;
      });
    }

    return allUnits;
  };

  const getDisplayUnitLabel = (formula: string, unitValue: string) => {
    const filtered = getFilteredUnits(formula);
    const unit = (Array.isArray(filtered) ? filtered : [])?.find?.(u => u.value === unitValue) || null;
    return unit ? unit.label : unitValue;
  };

  const getAutoUnit = (formula: string, currentUnit: string) => {
    const filtered = getFilteredUnits(formula);
    if (!filtered.length) return currentUnit;
    
    // Check if current unit is compatible with the formula type
    const f = (formula || '').toUpperCase();
    const isArea = f.includes('L') && f.includes('W') && f.includes('*');
    const currentUnitIsArea = (currentUnit || '').toLowerCase().includes('sq');
    
    // If mismatch, force a new unit
    if (isArea !== currentUnitIsArea) {
      const preferred = filtered.find((u: any) => {
        const v = u.value.toLowerCase();
        const l = u.label.toLowerCase();
        if (isArea) return v === 'sqm' || l.includes('sq m') || l.includes('square meter');
        return v === 'mtr' || v === 'm' || l === 'meter' || l === 'mtr';
      });
      return preferred ? preferred.value : filtered[0].value;
    }
    
    return currentUnit;
  };

  // Sync unit when selection changes
  React.useEffect(() => {
    if (selectedCatIdx !== null && selectedStyleIdx !== null && selectedBOMIdx !== null) {
      const item = localConfig.beltTypes[selectedCatIdx]?.styles?.[selectedStyleIdx]?.bom?.[selectedBOMIdx];
      if (item) {
        const syncedUnit = getAutoUnit(item.formula, item.unit);
        if (syncedUnit !== item.unit) {
          setLocalConfig((prev: any) => {
            const updated = JSON.parse(JSON.stringify(prev.beltTypes));
            if (updated[selectedCatIdx]?.styles?.[selectedStyleIdx]?.bom?.[selectedBOMIdx]) {
              updated[selectedCatIdx].styles[selectedStyleIdx].bom[selectedBOMIdx].unit = syncedUnit;
            }
            return { ...prev, beltTypes: updated };
          });
        }
      }
    }
  }, [selectedBOMIdx, selectedStyleIdx, selectedCatIdx, localConfig]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 text-[#1e40af] rounded-lg">
            <Settings2 className="h-4 w-4" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">System Configuration</h1>
        </div>
        <Button 
          className="bg-[#1e40af] hover:bg-[#1d4ed8] text-white gap-1.5 h-8 text-xs px-3 shadow-sm rounded-[6px]" 
          onClick={handleSave}
          disabled={isSaving}
        >
          <Save className="h-3.5 w-3.5" />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      {/* Dynamic Tab Switcher */}
      <div className="flex border-b border-zinc-200 mt-2 shrink-0">
        <button
          onClick={() => setConfigTab('belts')}
          className={cn(
            "px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5",
            configTab === 'belts'
              ? "border-zinc-900 text-zinc-900"
              : "border-transparent text-zinc-400 hover:text-zinc-650"
          )}
        >
          📔 Belt Configuration
        </button>
        <button
          onClick={() => setConfigTab('settings')}
          className={cn(
            "px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-1.5",
            configTab === 'settings'
              ? "border-zinc-900 text-zinc-900"
              : "border-transparent text-zinc-400 hover:text-zinc-650"
          )}
        >
          ⚙️ Global Settings, Companies & Categories
        </button>
      </div>

      {configTab === 'settings' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
          <Card className="border-zinc-200 shadow-sm bg-white">
            <CardHeader className="flex flex-row items-center gap-4 py-4 border-b">
              <div className="p-2 bg-zinc-100 rounded-lg">
                <Percent className="h-5 w-5 text-zinc-900" />
              </div>
              <div>
                <CardTitle>Global Constants</CardTitle>
                <CardDescription>Tax rates and fix costs</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
              <div className="space-y-2">
                <Label>Purchase GST (%)</Label>
                <Input type="number" className="border-zinc-400" value={localConfig.constants.purchaseGst} onChange={(e) => updateConstant('purchaseGst', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Fix Cost (%)</Label>
                <Input type="number" className="border-zinc-400" value={localConfig.constants.fixCost} onChange={(e) => updateConstant('fixCost', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Default Profit (%)</Label>
                <Input type="number" className="border-zinc-400" value={localConfig.constants.defaultProfit} onChange={(e) => updateConstant('defaultProfit', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Sale GST (%)</Label>
                <Input type="number" className="border-zinc-400" value={localConfig.constants.saleGst} onChange={(e) => updateConstant('saleGst', e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 shadow-sm bg-white flex flex-col justify-between">
            <CardHeader className="flex flex-row items-center gap-4 py-4 border-b">
              <div className="p-2 bg-zinc-100 rounded-lg">
                <Building2 className="h-5 w-5 text-zinc-900" />
              </div>
              <div>
                <CardTitle>Company Management</CardTitle>
                <CardDescription>Manage child companies (add, rename, delete)</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-4 flex-1 flex flex-col space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type="text"
                    placeholder="Enter new company name..."
                    className="border-zinc-300 bg-white h-9"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCompany()}
                  />
                </div>
                <Button onClick={handleAddCompany} size="sm" className="bg-[#1e40af] hover:bg-[#1d4ed8] text-white h-9 rounded-[6px]">
                  Add
                </Button>
              </div>

              <div className="border border-zinc-200 rounded-lg overflow-hidden flex-1 max-h-[160px] overflow-y-auto divide-y divide-zinc-100 bg-zinc-50/30">
                {isLoadingCompanies ? (
                  <div className="p-4 text-center text-xs text-zinc-400">Loading companies...</div>
                ) : companies.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-400">No companies added yet.</div>
                ) : (
                  companies.map((company) => (
                    <div key={company.id} className="flex items-center justify-between p-2.5 px-3 bg-white hover:bg-zinc-50 transition-colors">
                      {editingCompany && editingCompany.id === company.id ? (
                        <div className="flex items-center gap-2 w-full">
                          <Input
                            type="text"
                            className="h-7 text-xs border-zinc-400 bg-white"
                            value={editingCompany.name}
                            onChange={(e) => setEditingCompany({ ...editingCompany, name: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && handleUpdateCompany()}
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:bg-emerald-50" onClick={handleUpdateCompany}>
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600 hover:bg-rose-50" onClick={() => setEditingCompany(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span className="text-xs font-bold text-zinc-800">{company.name}</span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
                              onClick={() => setEditingCompany({ id: company.id, name: company.name })}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-zinc-400 hover:text-rose-500 hover:bg-rose-50"
                              onClick={() => handleDeleteCompany(company.id, company.name)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-zinc-200 shadow-sm bg-white flex flex-col justify-between">
            <CardHeader className="flex flex-row items-center gap-4 py-4 border-b">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <Tags className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Client Categories</CardTitle>
                <CardDescription>Manage business types (e.g. Manufacturing, Retail)</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-4 flex-1 flex flex-col space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type="text"
                    placeholder="Enter category name (e.g. OEM)..."
                    className="border-zinc-300 bg-white h-9"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  />
                </div>
                <Button onClick={handleAddCategory} size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white h-9 rounded-[6px]">
                  Add
                </Button>
              </div>

              <div className="border border-zinc-200 rounded-lg overflow-hidden flex-1 max-h-[160px] overflow-y-auto divide-y divide-zinc-100 bg-zinc-50/30">
                {isLoadingCategories ? (
                  <div className="p-4 text-center text-xs text-zinc-400">Loading categories...</div>
                ) : clientCategories.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-400">No categories added yet.</div>
                ) : (
                  clientCategories.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between p-2.5 px-3 bg-white hover:bg-zinc-50 transition-colors">
                      {editingCategory && editingCategory.id === cat.id ? (
                        <div className="flex items-center gap-2 w-full">
                          <Input
                            type="text"
                            className="h-7 text-xs border-zinc-400 bg-white"
                            value={editingCategory.name}
                            onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                            onKeyDown={(e) => e.key === 'Enter' && handleUpdateCategory()}
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:bg-emerald-50" onClick={handleUpdateCategory}>
                            <Save className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600 hover:bg-rose-50" onClick={() => setEditingCategory(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span className="text-xs font-bold text-zinc-800 flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-indigo-500 inline-block" />
                            {cat.name}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
                              onClick={() => setEditingCategory({ id: cat.id, name: cat.name })}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-zinc-400 hover:text-rose-500 hover:bg-rose-50"
                              onClick={() => handleDeleteCategory(cat.id, cat.name)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="border-zinc-200 shadow-md overflow-hidden bg-white animate-in fade-in duration-200">
          <CardHeader className="flex flex-row items-center justify-between bg-zinc-50/50 border-b py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 text-[#1e40af] rounded-lg border border-blue-100">
                <Settings2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold tracking-tight text-zinc-900">BELT CONFIGURATION</CardTitle>
                <CardDescription className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Manage Categories, Styles and Bill of Materials</CardDescription>
              </div>
            </div>
            <Button 
               className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-9 px-4 rounded-lg font-bold text-xs uppercase tracking-wider shadow-sm cursor-pointer"
               onClick={handleSave}
               disabled={isSaving}
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Committing...' : 'Commit Changes'}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex h-[600px] divide-x divide-zinc-100 bg-white">
              
              {/* 1. CATEGORY COLUMN */}
              <div 
                className={cn(
                  "flex flex-col border-r border-zinc-150 transition-all duration-300",
                  selectedCatIdx !== null 
                    ? "w-14 shrink-0 bg-zinc-50/80 hover:bg-zinc-100/90 cursor-pointer group" 
                    : "flex-1 min-w-[220px] bg-white"
                )}
                onClick={selectedCatIdx !== null ? () => { setSelectedCatIdx(null); setSelectedStyleIdx(null); setSelectedBOMIdx(null); } : undefined}
                title={selectedCatIdx !== null ? "Click to change Category" : undefined}
              >
                {selectedCatIdx !== null ? (
                  <div className="py-4 flex flex-col items-center flex-1">
                    <div className="h-6 w-6 rounded-full bg-zinc-200 text-zinc-650 flex items-center justify-center mb-6 group-hover:bg-blue-600 group-hover:text-white font-black text-[10px] shadow-sm transition-colors">
                      1
                    </div>
                    <div 
                      className="flex-1 flex items-center justify-center select-none text-[10px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-blue-600 transition-colors whitespace-nowrap"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                    >
                      {localConfig.beltTypes[selectedCatIdx]?.name || 'Category'}
                    </div>
                    <div className="mt-4 text-zinc-450 group-hover:text-blue-500 transition-colors">
                      <ChevronLeft className="h-4 w-4" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="p-3 bg-zinc-50/80 border-b flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">1. CATEGORY</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-110 transition-transform" onClick={(e) => {
                        e.stopPropagation();
                        setCategoryModal({ isOpen: true, mode: 'add', name: '', gst: '' });
                      }}>
                        <ListPlus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {(Array.isArray(localConfig?.beltTypes) ? localConfig.beltTypes : [])?.map?.((cat, idx) => (
                        <div 
                          key={cat.id} 
                          onClick={() => { setSelectedCatIdx(idx); setSelectedStyleIdx(null); setSelectedBOMIdx(null); }}
                          className={cn(
                            "group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all duration-200 border-2",
                            selectedCatIdx === idx 
                              ? "bg-blue-50 border-blue-200 shadow-sm" 
                              : "border-transparent hover:bg-zinc-50 hover:border-zinc-100"
                          )}
                        >
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className={cn("text-sm font-bold truncate", selectedCatIdx === idx ? "text-blue-700" : "text-zinc-700")}>
                              {cat.name.toUpperCase()}
                            </span>
                            {cat.gst !== undefined && cat.gst !== null && (
                              <span className="text-[9px] font-semibold text-emerald-600 bg-emerald-50 rounded px-1 w-fit mt-0.5">GST {cat.gst}%</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Edit2 
                              className="h-3 w-3 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-blue-600 cursor-pointer" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setCategoryModal({
                                  isOpen: true,
                                  mode: 'edit',
                                  catIdx: idx,
                                  name: cat.name || '',
                                  gst: cat.gst !== undefined && cat.gst !== null ? cat.gst.toString() : ''
                                });
                              }}
                            />
                            <Trash2 
                              className="h-3 w-3 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-red-500 cursor-pointer" 
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (window.confirm(`Are you sure you want to delete Category "${cat.name}"? All associated styles and BOMs will be deleted.`)) {
                                  const verified = await verifyDeletionCode(cat.name);
                                  if (!verified) return;
                                  removeItem('beltTypes', idx);
                                  setSelectedCatIdx(null);
                                  setSelectedStyleIdx(null);
                                  setSelectedBOMIdx(null);
                                }
                              }} 
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Category Selection Placeholder */}
              {selectedCatIdx === null && (
                <div className="flex-[3] flex flex-col items-center justify-center p-8 text-center bg-zinc-50/10">
                  <div className="p-4 bg-blue-50 text-blue-600 rounded-full mb-3 shadow-sm">
                    <Settings2 className="h-8 w-8 animate-pulse" />
                  </div>
                  <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-wide">Select a Category</h3>
                  <p className="text-xs text-zinc-400 max-w-xs mt-1">Choose a belt category on the left to start configuring its styles and Bill of Materials.</p>
                </div>
              )}

              {/* 2. STYLE COLUMN */}
              <div 
                className={cn(
                  "flex flex-col border-r border-zinc-150 transition-all duration-300",
                  selectedCatIdx === null
                    ? "hidden"
                    : selectedStyleIdx !== null
                      ? "w-14 shrink-0 bg-zinc-50/80 hover:bg-zinc-100/90 cursor-pointer group"
                      : "flex-1 min-w-[220px] bg-zinc-50/30"
                )}
                onClick={selectedStyleIdx !== null ? () => { setSelectedStyleIdx(null); setSelectedBOMIdx(null); } : undefined}
                title={selectedStyleIdx !== null ? "Click to change Style" : undefined}
              >
                {selectedStyleIdx !== null ? (
                  <div className="py-4 flex flex-col items-center flex-1">
                    <div className="h-6 w-6 rounded-full bg-zinc-200 text-zinc-650 flex items-center justify-center mb-6 group-hover:bg-blue-600 group-hover:text-white font-black text-[10px] shadow-sm transition-colors">
                      2
                    </div>
                    <div 
                      className="flex-1 flex items-center justify-center select-none text-[10px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-blue-600 transition-colors whitespace-nowrap"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                    >
                      {localConfig.beltTypes[selectedCatIdx!]?.styles?.[selectedStyleIdx]?.name || 'Style'}
                    </div>
                    <div className="mt-4 text-zinc-450 group-hover:text-blue-500 transition-colors">
                      <ChevronLeft className="h-4 w-4" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="p-3 bg-zinc-50/80 border-b flex items-center justify-between">
                       <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">2. STYLE</span>
                       <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-110 transition-transform disabled:opacity-30" 
                        disabled={selectedCatIdx === null}
                        onClick={(e) => {
                          e.stopPropagation();
                          const name = prompt('New Style Name:');
                          if (name && selectedCatIdx !== null) {
                            const updated = [...localConfig.beltTypes];
                            updated[selectedCatIdx].styles = [...(updated[selectedCatIdx].styles || []), { id: Date.now().toString(), name: name.trim(), bom: [] }];
                            setLocalConfig({ ...localConfig, beltTypes: updated });
                          }
                        }}
                      >
                        <ListPlus className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {selectedCatIdx !== null && localConfig.beltTypes[selectedCatIdx] ? (
                        (Array.isArray(localConfig?.beltTypes?.[selectedCatIdx]?.styles) ? localConfig.beltTypes[selectedCatIdx].styles : [])?.map?.((style, idx) => (
                          <div 
                            key={style.id} 
                            onClick={() => { setSelectedStyleIdx(idx); setSelectedBOMIdx(null); }}
                            className={cn(
                              "group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all duration-200 border-2",
                              selectedStyleIdx === idx 
                                ? "bg-blue-50 border-blue-200 shadow-sm" 
                                : "border-transparent hover:bg-zinc-50 hover:border-zinc-100"
                            )}
                          >
                            <span className={cn("text-sm font-bold truncate max-w-[120px]", selectedStyleIdx === idx ? "text-blue-700" : "text-zinc-700")}>
                              {style.name.toUpperCase()}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <Edit2 
                                className="h-3 w-3 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-blue-600 cursor-pointer" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newName = prompt('Edit Style Name:', style.name);
                                  if (newName && newName.trim()) {
                                    const updated = [...localConfig.beltTypes];
                                    updated[selectedCatIdx!].styles[idx].name = newName.trim();
                                    setLocalConfig({ ...localConfig, beltTypes: updated });
                                  }
                                }}
                              />
                              <Trash2 
                                className="h-3 w-3 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-red-500 cursor-pointer" 
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`Are you sure you want to delete Style "${style.name}"?`)) {
                                    const verified = await verifyDeletionCode(style.name);
                                    if (!verified) return;
                                    const updated = [...localConfig.beltTypes];
                                    updated[selectedCatIdx!].styles.splice(idx, 1);
                                    setLocalConfig({ ...localConfig, beltTypes: updated });
                                    setSelectedStyleIdx(null);
                                    setSelectedBOMIdx(null);
                                    saveConfig(updated);
                                  }
                                }} 
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="h-full flex items-center justify-center p-8 text-center">
                          <p className="text-xs text-zinc-400 italic">Select a category first</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Style Selection Placeholder */}
              {selectedCatIdx !== null && selectedStyleIdx === null && (
                <div className="flex-[2.5] flex flex-col items-center justify-center p-8 text-center bg-white">
                  <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full mb-3 shadow-sm animate-bounce">
                    <ListPlus className="h-8 w-8" />
                  </div>
                  <h3 className="text-sm font-bold text-zinc-700 uppercase tracking-wide">Select a Style</h3>
                  <p className="text-xs text-zinc-400 max-w-xs mt-1">Choose or create a style for this category to view and edit its components.</p>
                </div>
              )}

              {/* 3. BOM ITEM COLUMN */}
              <div 
                className={cn(
                  "flex flex-col border-r border-zinc-150 transition-all duration-300",
                  selectedStyleIdx === null
                    ? "hidden"
                    : selectedBOMIdx !== null
                      ? "w-14 shrink-0 bg-zinc-50/80 hover:bg-zinc-100/90 cursor-pointer group"
                      : "flex-1 min-w-[220px] bg-white"
                )}
                onClick={selectedBOMIdx !== null ? () => { setSelectedBOMIdx(null); } : undefined}
                title={selectedBOMIdx !== null ? "Click to change Component" : undefined}
              >
                {selectedBOMIdx !== null ? (
                  <div className="py-4 flex flex-col items-center flex-1">
                    <div className="h-6 w-6 rounded-full bg-zinc-200 text-zinc-650 flex items-center justify-center mb-6 group-hover:bg-blue-600 group-hover:text-white font-black text-[10px] shadow-sm transition-colors">
                      3
                    </div>
                    <div 
                      className="flex-1 flex items-center justify-center select-none text-[10px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-blue-600 transition-colors whitespace-nowrap"
                      style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                    >
                      {localConfig.beltTypes[selectedCatIdx!]?.styles?.[selectedStyleIdx!]?.bom?.[selectedBOMIdx]?.name || 'Component'}
                    </div>
                    <div className="mt-4 text-zinc-450 group-hover:text-blue-500 transition-colors">
                      <ChevronLeft className="h-4 w-4" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="p-3 bg-zinc-50/80 border-b flex flex-col gap-2">
                       <div className="flex items-center justify-between">
                         <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">3. BILL OF MATERIAL</span>
                         <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-110 transition-transform disabled:opacity-30" 
                          disabled={selectedStyleIdx === null}
                          title="Add New Component"
                          onClick={(e) => {
                            e.stopPropagation();
                            const name = prompt('New Component Name:');
                            if (name && selectedCatIdx !== null && selectedStyleIdx !== null) {
                              const updated = [...localConfig.beltTypes];
                              const style = updated[selectedCatIdx].styles[selectedStyleIdx];
                              style.bom = [...(style.bom || []), { id: Date.now().toString(), name: name.trim(), rate: 0, formula: 'L * W', unit: 'sqm' }];
                              setLocalConfig({ ...localConfig, beltTypes: updated });
                            }
                          }}
                        >
                          <ListPlus className="h-3 w-3" />
                        </Button>
                       </div>

                       {selectedStyleIdx !== null && selectedCatIdx !== null && (() => {
                         const currentBom = localConfig.beltTypes[selectedCatIdx]?.styles?.[selectedStyleIdx]?.bom || [];
                         const hasThreadOrPin = currentBom.some((b: any) => b.name && (b.name.toLowerCase().includes('thread') || b.name.toLowerCase().includes('thraed') || b.name.toLowerCase().includes('pin')));
                         const hasMergedThreadPin = currentBom.some((b: any) => b.name && b.name.toLowerCase().includes('thread & pin'));

                         const hasSideEdgesOrFEP = currentBom.some((b: any) => b.name && (b.name.toLowerCase().includes('red bodar') || b.name.toLowerCase().includes('red border') || b.name.toLowerCase().includes('fep')));
                         const hasMergedSideEdges = currentBom.some((b: any) => b.name && (b.name.toLowerCase().includes('side edges') || b.name.toLowerCase().includes('border + fep')));

                         return (
                           <div className="flex items-center gap-1.5 flex-wrap">
                             {hasMergedSideEdges ? (
                               <Button
                                 variant="outline"
                                 size="sm"
                                 className="h-6 text-[10px] px-2 py-0 border-amber-200 bg-amber-50/50 text-amber-700 hover:bg-amber-100 font-bold"
                                 onClick={() => handleSplitSideEdgesAndFEP(selectedCatIdx, selectedStyleIdx)}
                                 title="Split Side Edges back into RED Border and FEP Film"
                               >
                                 ↩️ Split Side Edges & FEP
                               </Button>
                             ) : hasSideEdgesOrFEP ? (
                               <Button
                                 variant="outline"
                                 size="sm"
                                 className="h-6 text-[10px] px-2 py-0 border-purple-200 bg-purple-50/50 text-purple-700 hover:bg-purple-100 font-bold"
                                 onClick={() => handleMergeSideEdgesAndFEP(selectedCatIdx, selectedStyleIdx)}
                                 title="Merge RED Border and FEP Film into Side Edges"
                               >
                                 <GitMerge className="h-3 w-3 mr-1" />
                                 Merge Side Edges & FEP
                               </Button>
                             ) : null}

                             {hasMergedThreadPin ? (
                               <Button
                                 variant="outline"
                                 size="sm"
                                 className="h-6 text-[10px] px-2 py-0 border-amber-200 bg-amber-50/50 text-amber-700 hover:bg-amber-100 font-bold"
                                 onClick={() => handleSplitThreadAndPin(selectedCatIdx, selectedStyleIdx)}
                                 title="Split Thread & PIN back into separate items"
                               >
                                 ↩️ Split Thread & PIN
                               </Button>
                             ) : hasThreadOrPin ? (
                               <Button
                                 variant="outline"
                                 size="sm"
                                 className="h-6 text-[10px] px-2 py-0 border-blue-200 bg-blue-50/50 text-blue-700 hover:bg-blue-100 font-bold"
                                 onClick={() => handleMergeThreadAndPin(selectedCatIdx, selectedStyleIdx)}
                                 title="Merge Thread and PIN into one component"
                               >
                                 <GitMerge className="h-3 w-3 mr-1" />
                                 Merge Thread & PIN
                               </Button>
                             ) : null}

                             {selectedBOMIndices.length >= 2 && (
                               <Button
                                 variant="outline"
                                 size="sm"
                                 className="h-6 text-[10px] px-2 py-0 border-emerald-200 bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100 font-bold"
                                 onClick={() => handleMergeSelectedBOMItems(selectedCatIdx, selectedStyleIdx)}
                               >
                                 <GitMerge className="h-3 w-3 mr-1" />
                                 Merge Selected ({selectedBOMIndices.length})
                               </Button>
                             )}
                           </div>
                         );
                       })()}
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {selectedStyleIdx !== null && localConfig.beltTypes[selectedCatIdx!]?.styles?.[selectedStyleIdx] ? (
                        (Array.isArray(localConfig?.beltTypes?.[selectedCatIdx!]?.styles?.[selectedStyleIdx]?.bom) ? localConfig.beltTypes[selectedCatIdx!].styles[selectedStyleIdx].bom : [])?.map?.((item, idx) => (
                          <div 
                            key={idx} 
                            onClick={() => setSelectedBOMIdx(idx)}
                            className={cn(
                              "group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all duration-200 border-2",
                              selectedBOMIdx === idx 
                                ? "bg-blue-50 border-blue-200 shadow-sm" 
                                : "border-transparent hover:bg-zinc-50 hover:border-zinc-100"
                            )}
                          >
                            <input 
                              type="checkbox" 
                              checked={selectedBOMIndices.includes(idx)} 
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                e.stopPropagation();
                                if (e.target.checked) {
                                  setSelectedBOMIndices([...selectedBOMIndices, idx]);
                                } else {
                                  setSelectedBOMIndices(selectedBOMIndices.filter(i => i !== idx));
                                }
                              }}
                              className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 mr-2 cursor-pointer shrink-0"
                              title="Select to merge"
                            />
                            <div className="flex flex-col min-w-0 flex-1 mr-1">
                              <span className={cn("text-xs font-bold truncate", selectedBOMIdx === idx ? "text-blue-700" : "text-zinc-700")}>
                                {item.name.toUpperCase()}
                              </span>
                               <span className="text-[10px] text-blue-500 font-mono font-bold tracking-tighter">={item.formula}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Edit2 
                                className="h-3 w-3 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-blue-600 cursor-pointer" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const newName = prompt('Edit Component Name:', item.name);
                                  if (newName && newName.trim()) {
                                    const updated = [...localConfig.beltTypes];
                                    updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[idx].name = newName.trim();
                                    setLocalConfig({ ...localConfig, beltTypes: updated });
                                  }
                                }}
                              />
                              <Trash2 
                                className="h-3 w-3 text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-red-500 cursor-pointer" 
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`Are you sure you want to delete Component "${item.name}"?`)) {
                                    const verified = await verifyDeletionCode(item.name);
                                    if (!verified) return;
                                    const updated = [...localConfig.beltTypes];
                                    updated[selectedCatIdx!].styles[selectedStyleIdx!].bom.splice(idx, 1);
                                    setLocalConfig({ ...localConfig, beltTypes: updated });
                                    setSelectedBOMIdx(null);
                                    saveConfig(updated);
                                  }
                                }} 
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="h-full flex items-center justify-center p-8 text-center text-zinc-400">
                          <p className="text-xs italic">Select a style first</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* 4. DETAILS COLUMN */}
              <div className={cn(
                "flex flex-col overflow-hidden transition-all duration-300",
                selectedStyleIdx === null ? "hidden" : "flex-[1.8] min-w-[280px] bg-zinc-50/30"
              )}>
                <div className="p-3 bg-zinc-50/80 border-b flex items-center justify-between shrink-0">
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">4. COSTING & SUB-CATEGORIES</span>
                </div>
                <div className="flex-1 flex flex-col overflow-hidden">
                  {selectedBOMIdx !== null && localConfig.beltTypes[selectedCatIdx!]?.styles?.[selectedStyleIdx!]?.bom?.[selectedBOMIdx] ? (
                    <>
                      <div className="flex-1 flex flex-col p-4 space-y-4 animate-in fade-in slide-in-from-right-2 duration-300 overflow-y-auto pr-1 custom-scrollbar">
                        {(() => {
                          const item = localConfig.beltTypes[selectedCatIdx!]?.styles?.[selectedStyleIdx!]?.bom?.[selectedBOMIdx];
                          if (!item) return null;
                          const f = (item.formula || '').toUpperCase();
                          const isArea = f.includes('L') && f.includes('W') && f.includes('*');
                          return (
                                <>
                                {/* STATIC COSTING AREA */}
                                <div className="shrink-0 space-y-4">
                                  {(!item.options || item.options.length === 0) && (
                                    <div className="space-y-4">
                                      <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100/50">
                                        <Label className="text-[10px] font-bold uppercase text-blue-600 mb-2 block">Pricing Basis</Label>
                                        <div className="flex items-center gap-2 text-xs text-blue-800 font-medium">
                                          {isArea ? (
                                            <>
                                              <div className="p-1 bg-blue-100 rounded text-blue-700">L × W</div>
                                              <span>Calculated by Area (Sq. Unit)</span>
                                            </>
                                          ) : (
                                            <>
                                              <div className="p-1 bg-blue-100 rounded text-blue-700">L or W</div>
                                              <span>Calculated by Length (Unit)</span>
                                            </>
                                          )}
                                        </div>
                                      </div>

                                      <div className="space-y-1.5">
                                        <Label className="text-[10px] font-bold uppercase text-zinc-500 flex items-center gap-1">
                                          <span>Unit Rate (₹)</span>
                                          <span title="Click to view price change history">
                                            <Info 
                                              className="h-3.5 w-3.5 text-zinc-400 hover:text-blue-600 hover:scale-110 transition-all cursor-pointer"
                                              onClick={() => openRateHistory(item.id, item.name)}
                                            />
                                          </span>
                                        </Label>
                                        <div className="flex gap-2">
                                          <div className="relative flex-1">
                                            <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                                            <Input 
                                              type="number"
                                              className="bg-white pl-9 h-10 font-bold text-zinc-900 border-zinc-300 focus:border-blue-400 transition-colors"
                                              value={item.rate} 
                                              onChange={(e) => {
                                                const updated = [...localConfig.beltTypes];
                                                updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].rate = parseFloat(e.target.value) || 0;
                                                setLocalConfig({ ...localConfig, beltTypes: updated });
                                              }}
                                            />
                                          </div>
                                          <Select 
                                            value={item.unit || ''}
                                            onValueChange={(val) => {
                                              const updated = [...localConfig.beltTypes];
                                              const oldUnit = item.unit || '';
                                              const currentRate = item.rate || 0;
                                              const bomItem = updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx];
                                              bomItem.unit = val;
                                              bomItem.rate = convertRateToNewUnit(currentRate, oldUnit, val);
                                              setLocalConfig({ ...localConfig, beltTypes: updated });
                                            }}
                                          >
                                            <SelectTrigger className="w-[120px] bg-white border-zinc-300 h-10 text-xs font-bold">
                                              <SelectValue placeholder="Unit" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {getFilteredUnits(item.formula).map(u => (
                                                <SelectItem key={u.id || u.value} value={u.value}>
                                                  {u.label || u.value}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        <p className="text-[9px] text-zinc-400 italic">
                                          This rate applies for every 1 {item.unit || 'unit'} of material.
                                        </p>
                                      </div>

                                      <div className="space-y-1.5 pt-2">
                                        <Label className="text-[10px] font-bold uppercase text-zinc-500">Linked Material Stock</Label>
                                        <Select
                                          value={item.linkedStockId || 'none'}
                                          onValueChange={(val) => {
                                            const updated = [...localConfig.beltTypes];
                                            updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].linkedStockId = val === 'none' ? undefined : val;
                                            setLocalConfig({ ...localConfig, beltTypes: updated });
                                          }}
                                        >
                                          <SelectTrigger className="bg-white border-zinc-300 h-10 text-xs font-bold w-full">
                                            <SelectValue placeholder="Not Linked" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="none">Not Linked</SelectItem>
                                            {materialStocks.map(stock => (
                                              <SelectItem key={stock.id} value={stock.id}>
                                                {stock.name} ({stock.quantity} {stock.unit})
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                  )}

                                  <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                      <Label className="text-[10px] font-bold uppercase text-blue-500">Mathematical Formula</Label>
                                      <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          className={cn("h-6 w-6 rounded-full", item.isLocked ? "bg-rose-50 text-rose-500" : "bg-zinc-50 text-zinc-400")}
                                          onClick={() => {
                                            const updated = [...localConfig.beltTypes];
                                            updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].isLocked = !item.isLocked;
                                            setLocalConfig({ ...localConfig, beltTypes: updated });
                                          }}
                                        >
                                          {item.isLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                                        </Button>
                                    </div>
                                    <div className="flex gap-2">
                                      <div className="relative flex-1">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-xs">=</div>
                                        <Input 
                                          className={cn(
                                            "pl-7 h-10 font-mono text-xs font-bold transition-all w-full",
                                            item.isLocked 
                                              ? "bg-zinc-100 border-zinc-300 text-zinc-800 cursor-not-allowed" 
                                              : "bg-white border-zinc-350 focus:border-blue-400 rounded-[6px]"
                                          )}
                                          disabled={item.isLocked}
                                          value={item.formula} 
                                          onChange={(e) => {
                                            const val = e.target.value.toUpperCase();
                                            if (val && !isValidFormulaInput(val, item.variables)) return;
                                            const updated = [...localConfig.beltTypes];
                                            updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].formula = val;
                                            setLocalConfig({ ...localConfig, beltTypes: updated });
                                          }}
                                        />
                                      </div>
                                      <Button 
                                        variant="outline" 
                                        size="sm" 
                                        type="button"
                                        className="h-10 w-10 p-0 border-blue-200 text-blue-700 hover:bg-blue-50/50 cursor-pointer shadow-xs rounded-[6px] shrink-0"
                                        onClick={() => {
                                           setVarTarget('active');
                                           setSelectedBOMIdx(selectedBOMIdx);
                                           setActiveOptionName(null);
                                           setShowVariablesModal(true);
                                         }}
                                        title="Manage Variables"
                                      >
                                        <Settings2 className="h-4.5 w-4.5" />
                                      </Button>
                                    </div>
                                    <p className="text-[9px] text-zinc-400 italic">
                                      Allowed: L, W, P, R{(item.variables || []).length > 0 ? `, ${(item.variables || []).map((v: any) => v.symbol).join(', ')}` : ''}, Numbers, Operators (+, -, *, /)
                                    </p>
                                  </div>
                                </div>

                                {/* SUB-CATEGORIES AREA */}

                                {/* SCROLLING SUB-CATEGORIES AREA */}
                                <div className="flex-1 flex flex-col min-h-0 space-y-3 pt-6 border-t border-zinc-100">
                                  <div className="flex items-center justify-between px-1 shrink-0">
                                    <div className="flex items-center gap-2">
                                      <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Sub-categories</Label>
                                      <span className="bg-zinc-100 text-zinc-500 text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                                        {(item.options?.length || 0)}
                                      </span>
                                    </div>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-7 px-2 text-[10px] font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 transition-all gap-1.5"
                                      onClick={() => {
                                        const updated = [...localConfig.beltTypes];
                                        const bomItem = updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx];
                                        bomItem.options = [...(bomItem.options || []), { id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 4), name: '', rate: 0, unit: bomItem.unit }];
                                        setLocalConfig({ ...localConfig, beltTypes: updated });
                                      }}
                                    >
                                      <Plus className="h-3 w-3" />
                                      ADD SUB-CATEGORY
                                    </Button>
                                  </div>
                                  
                                  <div className="flex-1 overflow-y-auto pr-3 custom-scrollbar space-y-3 pb-4">
                                     {(Array.isArray(item.options) ? item.options : [])?.map?.((opt: any, optIdx: number) => (
                                       <div key={optIdx} className="group flex flex-col gap-2.5 p-3 rounded-xl bg-white border border-zinc-200 hover:border-blue-200 hover:shadow-md transition-all animate-in slide-in-from-right-1 duration-200 relative">
                                         <div className="space-y-1">
                                           <Label className="text-[9px] font-black uppercase tracking-tighter text-zinc-400 ml-1">Sub-category Name</Label>
                                           <Input 
                                             placeholder="e.g. White Border / Red Border"
                                             className="h-8 text-xs font-medium border-zinc-200 bg-zinc-50/50 focus:bg-white focus:border-blue-400 transition-all w-full"
                                             value={opt.name}
                                             onChange={(e) => {
                                               const updated = [...localConfig.beltTypes];
                                               updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].options[optIdx].name = e.target.value;
                                               setLocalConfig({ ...localConfig, beltTypes: updated });
                                             }}
                                           />
                                         </div>

                                         <div className="space-y-1">
                                            <div className="flex items-center justify-between">
                                              <Label className="text-[9px] font-black uppercase tracking-tighter text-zinc-400 ml-1">Mathematical Formula (Optional)</Label>
                                              <span className="text-[8px] text-zinc-400 italic">Defaults to: ={item.formula}</span>
                                            </div>
                                            <div className="flex gap-1.5">
                                              <div className="relative flex-1">
                                                <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-[10px]">=</div>
                                                <Input 
                                                  placeholder={item.formula}
                                                  className="h-8 pl-6 text-xs font-mono border-zinc-200 bg-zinc-50/50 focus:bg-white focus:border-blue-400 transition-all w-full rounded-[6px]"
                                                  value={opt.formula || ''}
                                                  onChange={(e) => {
                                                    const val = e.target.value.toUpperCase();
                                                    if (val && !isValidFormulaInput(val, item.variables, opt.name)) return;
                                                    const updated = [...localConfig.beltTypes];
                                                    updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].options[optIdx].formula = val;
                                                    setLocalConfig({ ...localConfig, beltTypes: updated });
                                                  }}
                                                />
                                              </div>
                                              <Button 
                                                variant="outline" 
                                                size="sm" 
                                                type="button"
                                                className="h-8 w-8 p-0 border-blue-200 text-blue-700 hover:bg-blue-50/50 cursor-pointer shadow-xs rounded-[6px] shrink-0 flex items-center justify-center"
                                                onClick={() => {
                                                  setVarTarget('active');
                                                  setActiveOptionName(opt.name);
                                                  setShowVariablesModal(true);
                                                }}
                                                title="Manage Variables"
                                              >
                                                <Settings2 className="h-3.5 w-3.5" />
                                              </Button>
                                            </div>
                                          </div>

                                         <div className="flex items-end gap-2">
                                           <div className="flex-1 space-y-1">
                                             <Label className="text-[9px] font-black uppercase tracking-tighter text-zinc-400 ml-1 flex items-center gap-1.5">
                                               <span>Rate {opt.isFormation ? <span className="text-violet-400 font-normal normal-case">(auto from formation)</span> : ''}</span>
                                               {opt.name && !opt.isFormation && (
                                                 <span title="Click to view price change history">
                                                   <Info 
                                                     className="h-3.5 w-3.5 text-zinc-400 hover:text-blue-600 hover:scale-110 transition-all cursor-pointer" 
                                                     onClick={() => openRateHistory(`${item.id}::${opt.name}`, opt.name)}
                                                   />
                                                 </span>
                                               )}
                                             </Label>
                                             <div className="relative">
                                               <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 font-bold">₹</div>
                                               <Input 
                                                 type="number"
                                                 readOnly={opt.isFormation}
                                                 className={cn(
                                                   "h-8 pl-5 pr-1 text-xs border-zinc-200 font-bold transition-all",
                                                   opt.isFormation ? "bg-violet-50/70 text-violet-900 font-black cursor-not-allowed border-violet-200 shadow-inner" : "bg-zinc-50/50 text-zinc-700"
                                                 )}
                                                 value={opt.isFormation ? (opt.formationItems || []).reduce((sum: number, fi: any) => sum + (parseFloat(fi.rate) || 0), 0) : opt.rate}
                                                 onChange={(e) => {
                                                   if (opt.isFormation) return;
                                                   const updated = [...localConfig.beltTypes];
                                                   updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].options[optIdx].rate = parseFloat(e.target.value) || 0;
                                                   setLocalConfig({ ...localConfig, beltTypes: updated });
                                                 }}
                                               />
                                             </div>
                                           </div>
                                           <div className="w-[85px] space-y-1">
                                             <Label className="text-[9px] font-black uppercase tracking-tighter text-zinc-400 ml-1">Unit</Label>
                                             <Select 
                                               value={opt.unit || item.unit || ''}
                                               onValueChange={(val) => {
                                                 const updated = [...localConfig.beltTypes];
                                                 const oldUnit = opt.unit || item.unit || '';
                                                 const currentRate = opt.rate || 0;
                                                 const option = updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].options[optIdx];
                                                 option.unit = val;
                                                 option.rate = convertRateToNewUnit(currentRate, oldUnit, val);
                                                 setLocalConfig({ ...localConfig, beltTypes: updated });
                                               }}
                                             >
                                               <SelectTrigger className="bg-zinc-50 border-zinc-200 h-8 text-[9px] font-black uppercase px-2 hover:bg-white transition-all">
                                                 <SelectValue placeholder="Unit" />
                                               </SelectTrigger>
                                               <SelectContent>
                                                 {getFilteredUnits(opt.formula || item.formula).map(u => (
                                                   <SelectItem key={u.id || u.value} value={u.value} className="text-[10px]">
                                                     {u.label || u.value}
                                                   </SelectItem>
                                                 ))}
                                               </SelectContent>
                                             </Select>
                                           </div>
                                           <div className="w-[110px] space-y-1">
                                             <Label className="text-[9px] font-black uppercase tracking-tighter text-zinc-400 ml-1">Link Stock</Label>
                                             <Select 
                                               value={opt.linkedStockId || 'none'}
                                               onValueChange={(val) => {
                                                 const updated = [...localConfig.beltTypes];
                                                 updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].options[optIdx].linkedStockId = val === 'none' ? undefined : val;
                                                 setLocalConfig({ ...localConfig, beltTypes: updated });
                                               }}
                                             >
                                               <SelectTrigger className="bg-zinc-50 border-zinc-200 h-8 text-[9px] font-black uppercase px-2 hover:bg-white transition-all">
                                                 <SelectValue placeholder="Not Linked" />
                                               </SelectTrigger>
                                               <SelectContent>
                                                 <SelectItem value="none" className="text-[10px]">Not Linked</SelectItem>
                                                 {materialStocks.map(stock => (
                                                   <SelectItem key={stock.id} value={stock.id} className="text-[10px]">
                                                     {stock.name}
                                                   </SelectItem>
                                                 ))}
                                               </SelectContent>
                                             </Select>
                                           </div>
                                           <Button 
                                             variant="ghost" 
                                             size="icon" 
                                             className="h-8 w-8 text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition-colors shrink-0"
                                              onClick={async () => {
                                                const verified = await verifyDeletionCode(opt.name || `this sub-category`);
                                                if (!verified) return;
                                                const updated = [...localConfig.beltTypes];
                                                updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].options.splice(optIdx, 1);
                                                setLocalConfig({ ...localConfig, beltTypes: updated });
                                                saveConfig(updated);
                                              }}
                                           >
                                             <Trash2 className="h-4 w-4" />
                                           </Button>
                                         </div>

                                         {/* FORMATION TOGGLE & BUILDER */}

                                         {/* ── FORMATION TOGGLE & BUILDER ── */}
                                         <div className="border-t border-zinc-100 pt-2.5 mt-0.5">
                                           <div className="flex items-center gap-2 mb-2">
                                             <button
                                               type="button"
                                               onClick={() => {
                                                 const updated = [...localConfig.beltTypes];
                                                 const option = updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].options[optIdx];
                                                 option.isFormation = !option.isFormation;
                                                 if (!option.isFormation) {
                                                   option.formationItems = undefined;
                                                 } else if (!option.formationItems || option.formationItems.length === 0) {
                                                   option.formationItems = [{ name: '', rate: 0, formula: item.formula || 'L * W', unit: opt.unit || item.unit || 'mtr' }];
                                                 }
                                                 option.rate = (option.formationItems || []).reduce((sum: number, fi: any) => sum + (parseFloat(fi.rate) || 0), 0);
                                                 setLocalConfig({ ...localConfig, beltTypes: updated });
                                               }}
                                               className={cn(
                                                 "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200",
                                                 opt.isFormation ? "bg-violet-500 border-violet-500" : "bg-zinc-200 border-zinc-200"
                                               )}
                                             >
                                               <span className={cn(
                                                 "pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200",
                                                 opt.isFormation ? "translate-x-3" : "translate-x-0"
                                               )} />
                                             </button>
                                             <Label className="text-[9px] font-black uppercase tracking-tighter text-zinc-500 cursor-pointer select-none">
                                               Make this a Formation
                                             </Label>
                                             {opt.isFormation && (
                                               <span className="text-[8px] font-black bg-violet-100 text-violet-600 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                                 Bundle
                                               </span>
                                             )}
                                           </div>

                                           {opt.isFormation && (
                                             <div className="bg-violet-50/50 border border-violet-100 rounded-lg p-2.5 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                               <div className="flex items-center justify-between">
                                                 <span className="text-[9px] font-black uppercase tracking-widest text-violet-500">Formation Items (Hidden from salesman)</span>
                                                 <button
                                                   type="button"
                                                   onClick={() => {
                                                     const updated = [...localConfig.beltTypes];
                                                     const option = updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].options[optIdx];
                                                     option.formationItems = [...(option.formationItems || []), { name: '', rate: 0, formula: item.formula || 'L * W', unit: opt.unit || item.unit || 'mtr' }];
                                                     option.rate = (option.formationItems || []).reduce((sum: number, fi: any) => sum + (parseFloat(fi.rate) || 0), 0);
                                                     setLocalConfig({ ...localConfig, beltTypes: updated });
                                                   }}
                                                   className="flex items-center gap-1 text-[9px] font-black text-violet-600 hover:text-violet-700 bg-violet-100 hover:bg-violet-200 px-2 py-1 rounded-md transition-colors"
                                                 >
                                                   <Plus className="h-2.5 w-2.5" />
                                                   Add Item
                                                 </button>
                                               </div>

                                               <div className="space-y-1.5">
                                                 {(opt.formationItems || []).map((fi: any, fiIdx: number) => (
                                                   <div key={fiIdx} className="flex items-center gap-1.5 bg-white rounded-lg px-2 py-1.5 border border-violet-100">
                                                     <Input
                                                       placeholder="Item name"
                                                       className="h-7 text-[10px] font-medium border-zinc-200 bg-zinc-50/50 flex-1 min-w-0"
                                                       value={fi.name}
                                                       onChange={(e) => {
                                                         const updated = [...localConfig.beltTypes];
                                                         updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].options[optIdx].formationItems[fiIdx].name = e.target.value;
                                                         setLocalConfig({ ...localConfig, beltTypes: updated });
                                                       }}
                                                     />
                                                     <div className="relative w-[60px] shrink-0">
                                                       <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-zinc-400">₹</span>
                                                       <Input
                                                         type="number"
                                                         placeholder="Rate"
                                                         className="h-7 pl-4 text-[10px] font-bold border-zinc-200 bg-zinc-50/50"
                                                         value={fi.rate}
                                                         onChange={(e) => {
                                                           const updated = [...localConfig.beltTypes];
                                                           const targetOpt = updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].options[optIdx];
                                                           targetOpt.formationItems[fiIdx].rate = parseFloat(e.target.value) || 0;
                                                           targetOpt.rate = (targetOpt.formationItems || []).reduce((sum: number, item: any) => sum + (parseFloat(item.rate) || 0), 0);
                                                           setLocalConfig({ ...localConfig, beltTypes: updated });
                                                         }}
                                                       />
                                                     </div>
                                                      <div className="relative w-[70px] shrink-0">
                                                        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-zinc-400 font-mono">=</span>
                                                        <Input
                                                          placeholder={item.formula}
                                                          className="h-7 pl-4 text-[10px] font-mono border-zinc-200 bg-zinc-50/50 uppercase"
                                                          value={fi.formula}
                                                          onChange={(e) => {
                                                            const val = e.target.value.toUpperCase();
                                                            if (val && !isValidFormulaInput(val, item.variables)) return;
                                                            const updated = [...localConfig.beltTypes];
                                                            updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].options[optIdx].formationItems[fiIdx].formula = val;
                                                            setLocalConfig({ ...localConfig, beltTypes: updated });
                                                          }}
                                                        />
                                                      </div>
                                                     <Select
                                                       value={fi.unit || opt.unit || item.unit || 'mtr'}
                                                       onValueChange={(val) => {
                                                         const updated = [...localConfig.beltTypes];
                                                         updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].options[optIdx].formationItems[fiIdx].unit = val;
                                                         setLocalConfig({ ...localConfig, beltTypes: updated });
                                                       }}
                                                     >
                                                       <SelectTrigger className="h-7 w-[55px] shrink-0 text-[9px] font-black uppercase border-zinc-200 bg-zinc-50/50 px-1.5">
                                                         <SelectValue />
                                                       </SelectTrigger>
                                                       <SelectContent>
                                                         {(Array.isArray(localConfig?.units) ? localConfig.units : []).map(u => (
                                                           <SelectItem key={u.value} value={u.value} className="text-[10px]">{u.label || u.value}</SelectItem>
                                                         ))}
                                                       </SelectContent>
                                                     </Select>
                                                     <button
                                                       type="button"
                                                       onClick={() => {
                                                         const updated = [...localConfig.beltTypes];
                                                         const targetOpt = updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].options[optIdx];
                                                         targetOpt.formationItems.splice(fiIdx, 1);
                                                         targetOpt.rate = (targetOpt.formationItems || []).reduce((sum: number, item: any) => sum + (parseFloat(item.rate) || 0), 0);
                                                         setLocalConfig({ ...localConfig, beltTypes: updated });
                                                       }}
                                                       className="text-zinc-300 hover:text-rose-500 transition-colors shrink-0"
                                                     >
                                                       <Trash2 className="h-3 w-3" />
                                                     </button>
                                                   </div>
                                                 ))}
                                               </div>

                                               {/* Auto-calculated rate preview */}
                                               {(opt.formationItems || []).length > 0 && (() => {
                                                 const preview = (opt.formationItems || []).reduce((sum: number, fi: any) => sum + (fi.rate || 0), 0);
                                                 return (
                                                   <div className="flex items-center justify-between pt-1.5 border-t border-violet-100">
                                                     <span className="text-[9px] text-violet-500 font-bold">Effective Combined Rate:</span>
                                                     <span className="text-[10px] font-black text-violet-700 font-mono">
                                                       ₹{preview.toFixed(2)} <span className="text-[8px] font-normal">/ {opt.unit || item.unit}</span>
                                                     </span>
                                                   </div>
                                                 );
                                               })()}
                                             </div>
                                           )}
                                         </div>
                                         {/* ── END FORMATION ── */}
                                       </div>
                                     ))}
                                    {(!item.options || item.options.length === 0) && (
                                      <div className="flex flex-col items-center justify-center py-6 px-4 bg-zinc-50 rounded-2xl border-2 border-dashed border-zinc-100">
                                        <p className="text-[10px] text-zinc-400 font-medium text-center">No sub-categories defined. The system will use the default base rate for this component.</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                </>
                          );
                        })()}
                      </div>
                      <div className="pt-3 pb-3 border-t border-zinc-100 flex items-center justify-between gap-2 px-4 shrink-0 bg-zinc-50/50">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Pricing Model: EXCEL-SYNC</span>
                        </div>
                        <Button 
                          onClick={handleSave}
                          disabled={isSaving}
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 h-8 shadow-sm flex items-center gap-1.5 rounded-lg shrink-0 cursor-pointer"
                        >
                          <Save className="h-3.5 w-3.5" />
                          {isSaving ? 'Saving...' : 'Save Sub-categories'}
                        </Button>
                      </div>
                    </>
                  ) : (selectedCatIdx !== null && localConfig.beltTypes[selectedCatIdx]) ? (
                    <div className="h-full flex items-center justify-center p-8 text-center text-zinc-400">
                      <p className="text-xs italic">Select a style and component to configure material-level costing.</p>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center p-8 text-center text-zinc-400">
                      <p className="text-xs italic">Select a category to configure settings or a component for rates</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!editingBOM} onOpenChange={(open) => !open && setEditingBOM(null)}>
        <DialogContent className="max-w-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Bill of Materials (BOM)</DialogTitle>
            <DialogDescription>
              Add or remove components for {editingBOM ? localConfig.beltTypes[editingBOM.tIdx]?.styles?.[editingBOM.sIdx]?.name : ''}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-zinc-50 p-4 rounded-xl border border-zinc-200 shadow-inner">
              <div className="col-span-1 md:col-span-2 space-y-2">
                <Label className="text-xs text-zinc-500">Component Name</Label>
                <Input 
                  placeholder="Material name" 
                  className="border-zinc-400 bg-white"
                  value={newBOMItem.name} 
                  onChange={(e) => setNewBOMItem({ ...newBOMItem, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-zinc-500">Rate</Label>
                <div className="flex gap-2">
                  <Input 
                    type="number"
                    placeholder="Price" 
                    className="border-zinc-400 bg-white flex-1"
                    value={newBOMItem.rate} 
                    onChange={(e) => setNewBOMItem({ ...newBOMItem, rate: e.target.value })}
                  />
                  <Select 
                    value={newBOMItem.unit}
                    onValueChange={(val) => setNewBOMItem({ ...newBOMItem, unit: val })}
                  >
                    <SelectTrigger className="w-[100px] bg-white border-zinc-400 h-10 text-[10px]">
                      <SelectValue placeholder="Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {getFilteredUnits(newBOMItem.formula).map(u => (
                        <SelectItem key={u.id || u.value} value={u.value} className="text-[10px]">
                          {u.label || u.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="col-span-2 md:col-span-4 space-y-2">
                <Label className="text-xs font-bold text-blue-600">Enter Math Formula (=)</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-400">=</div>
                    <Input 
                      placeholder="(W + 0.26) * 2 or L * 4" 
                      className="border-blue-400 bg-blue-50/30 pl-8 font-mono text-blue-800 w-full rounded-[6px]"
                      value={newBOMItem.formula} 
                      onChange={(e) => {
                        const val = e.target.value.toUpperCase();
                        if (val && !isValidFormulaInput(val, newBOMItem.variables)) return;
                        setNewBOMItem({ 
                          ...newBOMItem, 
                          formula: val,
                          unit: getAutoUnit(val, newBOMItem.unit)
                        });
                      }}
                    />
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    type="button"
                    className="h-10 w-10 p-0 border-blue-200 text-blue-700 hover:bg-blue-50/50 cursor-pointer shadow-xs rounded-[6px] shrink-0 flex items-center justify-center"
                    onClick={() => {
                      setVarTarget('new');
                      setShowVariablesModal(true);
                    }}
                    title="Manage Variables"
                  >
                    <Settings2 className="h-4.5 w-4.5" />
                  </Button>
                </div>
                <p className="text-[10px] text-zinc-400 italic">Use 'L' for Length, 'W' for Width, 'P' for Perimeter, 'R' for Rate, or custom variable symbols.</p>
              </div>

              <Button onClick={addBOMItem} className="col-span-2 md:col-span-4 mt-4 shadow-lg active:scale-95 transition-transform">
                <ListPlus className="h-4 w-4 mr-2" /> Commit Component to BOM
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-bold text-zinc-900">Current BOM Items</Label>
              <div className="border rounded-xl bg-white divide-y overflow-hidden max-h-[300px] overflow-y-auto">
                  {!editingBOM || !Array.isArray(localConfig?.beltTypes?.[editingBOM.tIdx]?.styles?.[editingBOM.sIdx]?.bom) || !localConfig.beltTypes[editingBOM.tIdx]?.styles?.[editingBOM.sIdx]?.bom?.length ? (
                    <div className="p-8 text-center text-zinc-400 italic text-sm">No items in BOM yet.</div>
                  ) : (
                    (localConfig?.beltTypes?.[editingBOM.tIdx]?.styles?.[editingBOM.sIdx]?.bom || [])?.map?.((item: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-4 hover:bg-zinc-50 transition-colors">
                      <div className="flex flex-col">
                        <span className="font-bold text-zinc-900">{item.name}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="bg-blue-50 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold text-blue-600 uppercase tracking-tighter">
                            ={item.formula}
                          </span>
                             <span className="text-xs text-zinc-500 ml-auto font-mono">Rate: ₹{item.rate}/{item.unit}</span>
                          </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-300 hover:text-red-500" onClick={() => removeBOMItem(i)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="w-full" onClick={() => setEditingBOM(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={categoryModal.isOpen} onOpenChange={(open) => !open && setCategoryModal({ ...categoryModal, isOpen: false })}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>{categoryModal.mode === 'add' ? '➕ Add New Category' : '📝 Edit Category'}</DialogTitle>
            <DialogDescription>
              Set the category name and its GST rate.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            {/* Category Name */}
            <div className="space-y-1.5">
              <Label htmlFor="catName" className="text-xs font-bold text-zinc-600 uppercase tracking-wider">Category Name</Label>
              <Input
                id="catName"
                value={categoryModal.name}
                onChange={(e) => setCategoryModal({ ...categoryModal, name: e.target.value })}
                className="border-zinc-300 h-10 font-semibold text-zinc-900"
                placeholder="e.g. PTFE, PVC, Rubber"
                autoFocus
              />
            </div>
            {/* GST Dropdown */}
            <div className="space-y-1.5">
              <Label htmlFor="catGst" className="text-xs font-bold text-zinc-600 uppercase tracking-wider">GST Rate</Label>
              <Select
                value={categoryModal.gst}
                onValueChange={(val) => setCategoryModal({ ...categoryModal, gst: val })}
              >
                <SelectTrigger id="catGst" className="h-10 border-zinc-300 font-semibold text-zinc-900">
                  <SelectValue placeholder="Select GST rate..." />
                </SelectTrigger>
                <SelectContent>
                  {GST_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="font-medium">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-zinc-400 italic">
                {categoryModal.gst ? `This category will use ${categoryModal.gst}% GST.` : 'Will use the global GST rate from system constants.'}
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="w-full sm:w-auto text-xs" onClick={() => setCategoryModal({ ...categoryModal, isOpen: false })}>
              Cancel
            </Button>
            <Button className="w-full sm:w-auto text-xs bg-[#1e40af] text-white hover:bg-zinc-800" onClick={handleSaveCategoryModal}>
              {categoryModal.mode === 'add' ? 'Add Category' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rate History Dialog */}
      <Dialog open={!!rateHistoryItem} onOpenChange={(open) => !open && setRateHistoryItem(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-indigo-500" />
              Rate History
            </DialogTitle>
            <DialogDescription>
              Last 5 price changes recorded for <strong>{rateHistoryItem?.name?.toUpperCase()}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {loadingHistory ? (
              <div className="flex flex-col justify-center items-center py-8 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                <span className="text-xs text-zinc-400">Loading history...</span>
              </div>
            ) : rateHistoryList.length === 0 ? (
              <div className="text-center py-8 text-zinc-400 italic text-xs">
                No previous rate changes recorded for this item.
              </div>
            ) : (
              <div className="space-y-3">
                {rateHistoryList.map((entry, idx) => (
                  <div key={idx} className="flex items-start justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-150 hover:border-zinc-200 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-400 text-xs font-bold line-through">₹{entry.oldRate}</span>
                        <span className="text-zinc-400 text-xs font-bold">→</span>
                        <span className="text-emerald-600 text-sm font-black">₹{entry.newRate}</span>
                      </div>
                      <p className="text-[10px] text-zinc-500 font-medium">Changed by: <span className="font-bold text-zinc-700">{entry.changedBy}</span></p>
                    </div>
                    <span className="text-[9px] text-zinc-400 font-mono mt-0.5">
                      {new Date(entry.changedAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setRateHistoryItem(null)} className="w-full bg-[#1e40af] text-white hover:bg-zinc-800" size="sm">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Variables Management Modal */}
      <Dialog open={showVariablesModal} onOpenChange={setShowVariablesModal}>
        <DialogContent className="max-w-4xl sm:max-w-4xl border-blue-100 shadow-[0_8px_30px_rgb(30,58,138,0.1)] rounded-[16px] bg-white text-zinc-900 overflow-hidden p-0 gap-0">
          <DialogHeader className="bg-blue-50/50 border-b border-blue-100/60 p-6 flex flex-row items-center gap-4">
            <div className="p-2.5 bg-blue-100 text-[#1e40af] rounded-xl shrink-0">
              <Settings2 className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-lg font-black text-[#1e3a8a] tracking-tight">Formula Variables Manager</DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 mt-0.5">Define and map custom variable signs for use inside mathematical formulas</DialogDescription>
              {/* Context label — shows which BOM item these variables belong to */}
              {(() => {
                const itemName = varTarget === 'new'
                  ? 'New BOM Item'
                  : (selectedCatIdx !== null && selectedStyleIdx !== null && selectedBOMIdx !== null)
                    ? localConfig.beltTypes[selectedCatIdx]?.styles?.[selectedStyleIdx]?.bom?.[selectedBOMIdx]?.name || 'Unknown Item'
                    : null;
                return itemName ? (
                  <div className="mt-2 inline-flex flex-wrap items-center gap-1.5 bg-[#1e40af]/10 border border-[#1e40af]/20 text-[#1e40af] text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#1e40af] animate-pulse" />
                    Working on: {itemName}
                    {activeOptionName && (
                      <span className="bg-amber-100 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-full ml-1 font-black normal-case">
                        Option: {activeOptionName}
                      </span>
                    )}
                    <span className="font-normal text-blue-500 normal-case tracking-normal ml-0.5">— variables here apply only to this specific {activeOptionName ? 'option' : 'item'}</span>
                  </div>
                ) : null;
              })()}
            </div>
          </DialogHeader>

          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Form to add variable */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-blue-50/20 p-4 rounded-xl border border-blue-100/40">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-700">Variable Name</Label>
                <Input 
                  placeholder="e.g. Horizontal Spacing" 
                  value={newVarName}
                  onChange={(e) => setNewVarName(e.target.value)}
                  className="h-9 border-blue-200 focus-visible:ring-blue-100 text-xs bg-white rounded-[6px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-700 font-mono">Sign / Symbol</Label>
                <Input 
                  placeholder="e.g. HHD" 
                  value={newVarSymbol}
                  onChange={(e) => setNewVarSymbol(e.target.value)}
                  className="h-9 border-blue-200 focus-visible:ring-blue-100 text-xs bg-white uppercase rounded-[6px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-zinc-700">Mapped Field</Label>
                <Select 
                  value={newVarMappedField} 
                  onValueChange={(val: any) => setNewVarMappedField(val)}
                >
                  <SelectTrigger className="h-9 border-blue-200 focus-visible:ring-blue-100 text-xs bg-white rounded-[6px]">
                    <SelectValue placeholder="Select Field" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="length" className="text-xs">Length (L) (m)</SelectItem>
                    <SelectItem value="width" className="text-xs">Width (W) (m)</SelectItem>
                    <SelectItem value="holeSize" className="text-xs">Hole Size (HS) (mm)</SelectItem>
                    <SelectItem value="holeDistHorizontal" className="text-xs">Horizontal Spacing (HHD) (mm)</SelectItem>
                    <SelectItem value="holeDistVertical" className="text-xs">Vertical Spacing (VHD) (mm)</SelectItem>
                    <SelectItem value="pricePerHole" className="text-xs">Price per Hole (PPH) (₹)</SelectItem>
                    <SelectItem value="rate" className="text-xs">Rate of Component (R) (₹)</SelectItem>
                    
                    <SelectItem value="totalHoles" className="text-xs text-blue-700 bg-blue-50/20">Total Holes (Count)</SelectItem>
                    <SelectItem value="holesH" className="text-xs text-blue-700 bg-blue-50/20">Horizontal Holes (Count)</SelectItem>
                    <SelectItem value="holesV" className="text-xs text-blue-700 bg-blue-50/20">Vertical Holes (Count)</SelectItem>
                    
                    <SelectItem value="manualPackingCost" className="text-xs text-emerald-700 bg-emerald-50/20">Manual Packing Cost (₹)</SelectItem>
                    <SelectItem value="manualProfitMargin" className="text-xs text-emerald-700 bg-emerald-50/20">Manual Profit Margin (%)</SelectItem>
                    
                    <SelectItem value="purchaseGst" className="text-xs text-indigo-700 bg-indigo-50/20">Purchase GST (%)</SelectItem>
                    <SelectItem value="fixCost" className="text-xs text-indigo-700 bg-indigo-50/20">Fix Cost (₹)</SelectItem>
                    <SelectItem value="defaultProfit" className="text-xs text-indigo-700 bg-indigo-50/20">Default Profit Margin (%)</SelectItem>
                    <SelectItem value="saleGst" className="text-xs text-indigo-700 bg-indigo-50/20">Sale GST (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button 
                onClick={handleAddVariable}
                type="button"
                className="bg-[#1e40af] hover:bg-[#1d4ed8] text-white h-9 text-xs font-bold rounded-[6px] cursor-pointer"
              >
                <Plus className="h-4 w-4 mr-1" /> Add Variable
              </Button>
            </div>

            {/* List of configured variables */}
            <div className="border border-blue-100 rounded-xl overflow-hidden text-xs">
              <table className="min-w-full divide-y divide-blue-100">
                <thead className="bg-blue-50/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold text-[#1e3a8a]">Variable Name</th>
                    <th className="px-4 py-3 text-left font-bold text-[#1e3a8a] font-mono">Sign / Symbol</th>
                    <th className="px-4 py-3 text-left font-bold text-[#1e3a8a]">Mapped Parameter</th>
                    <th className="px-4 py-3 text-right font-bold text-[#1e3a8a] w-[80px]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50 bg-white font-medium text-zinc-700">
                  {/* Default fallback rows */}
                  <tr className="bg-zinc-50/40 text-zinc-400">
                    <td className="px-4 py-3 italic">Length (Default)</td>
                    <td className="px-4 py-3 font-mono font-bold text-zinc-450">L</td>
                    <td className="px-4 py-3">Length (m)</td>
                    <td className="px-4 py-3 text-right italic text-[10px]">Reserved</td>
                  </tr>
                  <tr className="bg-zinc-50/40 text-zinc-400">
                    <td className="px-4 py-3 italic">Width (Default)</td>
                    <td className="px-4 py-3 font-mono font-bold text-zinc-450">W</td>
                    <td className="px-4 py-3">Width (m)</td>
                    <td className="px-4 py-3 text-right italic text-[10px]">Reserved</td>
                  </tr>
                  <tr className="bg-zinc-50/40 text-zinc-400">
                    <td className="px-4 py-3 italic">Perimeter (Default)</td>
                    <td className="px-4 py-3 font-mono font-bold text-zinc-450">P</td>
                    <td className="px-4 py-3">Perimeter (m)</td>
                    <td className="px-4 py-3 text-right italic text-[10px]">Reserved</td>
                  </tr>
                  <tr className="bg-zinc-50/40 text-zinc-400">
                    <td className="px-4 py-3 italic">Rate of Component (Default)</td>
                    <td className="px-4 py-3 font-mono font-bold text-zinc-450">R</td>
                    <td className="px-4 py-3">Rate of Component (₹)</td>
                    <td className="px-4 py-3 text-right italic text-[10px]">Reserved</td>
                  </tr>

                  {/* Custom variables */}
                  {(() => {
                    const allVars = getActiveBOMVariables();
                    const filteredVars = allVars.filter((v: any) => v.forOptionName === (activeOptionName || undefined));
                    
                    if (filteredVars.length === 0) {
                      return (
                        <tr>
                          <td colSpan={4} className="px-4 py-4 text-center text-zinc-400 italic">
                            No custom variables defined for this context. Add one above.
                          </td>
                        </tr>
                      );
                    }
                    
                    return filteredVars.map((v: any) => (
                      <tr key={v.id} className="hover:bg-blue-50/10">
                        <td className="px-4 py-3 font-bold text-zinc-800">{v.name}</td>
                        <td className="px-4 py-3 font-mono font-black text-[#1e40af]">{v.symbol}</td>
                        <td className="px-4 py-3">
                          {v.mappedField === 'length' && 'Length (m)'}
                          {v.mappedField === 'width' && 'Width (m)'}
                          {v.mappedField === 'holeSize' && 'Hole Size (mm)'}
                          {v.mappedField === 'holeDistHorizontal' && 'Horizontal Spacing (mm)'}
                          {v.mappedField === 'holeDistVertical' && 'Vertical Spacing (mm)'}
                          {v.mappedField === 'pricePerHole' && 'Price per Hole (₹)'}
                          {v.mappedField === 'rate' && 'Rate of Component (₹)'}
                          {v.mappedField === 'totalHoles' && 'Total Holes (Count)'}
                          {v.mappedField === 'holesH' && 'Horizontal Holes (Count)'}
                          {v.mappedField === 'holesV' && 'Vertical Holes (Count)'}
                          {v.mappedField === 'manualPackingCost' && 'Manual Packing Cost (₹)'}
                          {v.mappedField === 'manualProfitMargin' && 'Manual Profit Margin (%)'}
                          {v.mappedField === 'purchaseGst' && 'Purchase GST (%)'}
                          {v.mappedField === 'fixCost' && 'Fix Cost (₹)'}
                          {v.mappedField === 'defaultProfit' && 'Default Profit Margin (%)'}
                          {v.mappedField === 'saleGst' && 'Sale GST (%)'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button 
                            type="button"
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleDeleteVariable(v.id, v.symbol)}
                            className="h-7 w-7 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 cursor-pointer rounded-full"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter className="bg-zinc-50 border-t p-4 flex gap-2">
            <Button 
              type="button"
              onClick={() => setShowVariablesModal(false)} 
              className="w-full bg-[#1e40af] text-white hover:bg-blue-800 rounded-[6px]" 
              size="sm"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
