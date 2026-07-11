import React, { useState } from 'react';
import { Config, Company, MaterialStock } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { UserPlus, Trash2, Upload, Download, Search, Edit2, Save, X, IndianRupee, Percent, ListPlus, Settings2, Lock, Unlock, Plus, Link2, Building2, ChevronDown, ChevronLeft, Info, Clock, Loader2 } from 'lucide-react';
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

  React.useEffect(() => {
    fetchCompanies();
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
  
  const [localConfig, setLocalConfig] = useState<Config>(() => {
    const defaultConfig: Config = {
      rates: { mesh: 10, fep: 20, thread: 5, pin: 15, packing: 50 },
      constants: { purchaseGst: 18, fixCost: 10, defaultProfit: 20, saleGst: 18 },
      beltTypes: [],
      jointTypes: [],
      tapeTypes: [],
      units: [{ id: 'mm', label: 'Millimeters (mm)', value: 'mm' }, { id: 'mtr', label: 'Meters (mtr)', value: 'mtr' }]
    };
    
    const merged = { ...defaultConfig, ...config };
    merged.constants = { ...defaultConfig.constants, ...config?.constants };
    merged.rates = { ...defaultConfig.rates, ...config?.rates };
    merged.beltTypes = config?.beltTypes || [];
    merged.jointTypes = config?.jointTypes || [];
    merged.tapeTypes = config?.tapeTypes || [];
    merged.units = config?.units || defaultConfig.units;
    return merged;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [newItem, setNewItem] = useState({ 
    beltType: '', 
    styleName: '',
  });

  const [editingBOM, setEditingBOM] = useState<{ tIdx: number, sIdx: number } | null>(null);
  const [newBOMItem, setNewBOMItem] = useState<any>({ name: '', rate: '', unit: '', formula: 'L * W' });

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

  const saveConfig = async (updatedBeltTypes?: Config['beltTypes']) => {
    setIsSaving(true);
    try {
      const configToSave = {
        ...localConfig,
        beltTypes: (updatedBeltTypes || localConfig.beltTypes || []).filter((t: any) => t.name?.trim()),
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
    updated[typeIdx].styles = [...(updated[typeIdx].styles || []), { id: Date.now().toString(), name }];
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
      const areaUnits = allUnits.filter(u => {
        const label = (u.label || '').toLowerCase();
        const value = (u.value || '').toLowerCase();
        return label.includes('sq') || value.startsWith('sq') || label.includes('square') || label.includes('area');
      });
      
      if (areaUnits.length > 0) return areaUnits;
      
      // If no area units defined, virtualize them from length units
      return allUnits.filter(u => {
        const label = (u.label || '').toLowerCase();
        return !label.includes('nos') && !label.includes('pcs') && !label.includes('unit');
      }).map(u => ({
        ...u,
        id: `sq-${u.id}`,
        label: `Sq. ${u.label}`,
        value: `sq${u.value}`
      }));
    }
    
    if (isLength) {
      // Strictly show only linear units
      return allUnits.filter(u => {
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
      const preferred = filtered.find(u => {
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
          const updated = [...localConfig.beltTypes];
          if (updated[selectedCatIdx]?.styles?.[selectedStyleIdx]?.bom?.[selectedBOMIdx]) {
            updated[selectedCatIdx].styles[selectedStyleIdx].bom[selectedBOMIdx].unit = syncedUnit;
            setLocalConfig({ ...localConfig, beltTypes: updated });
          }
        }
      }
    }
  }, [selectedBOMIdx, selectedStyleIdx, selectedCatIdx]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-zinc-900 rounded-lg text-white">
            <Settings2 className="h-4 w-4" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">System Configuration</h1>
        </div>
        <Button 
          className="bg-zinc-900 hover:bg-zinc-800 text-white gap-1.5 h-8 text-xs px-3 shadow-md" 
          onClick={handleSave}
          disabled={isSaving}
        >
          <Save className="h-3.5 w-3.5" />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">


        <Card className="border-zinc-200 shadow-sm">
          <CardHeader className="flex flex-row items-center gap-4">
            <div className="p-2 bg-zinc-100 rounded-lg">
              <Percent className="h-5 w-5 text-zinc-900" />
            </div>
            <div>
              <CardTitle>Global Constants</CardTitle>
              <CardDescription>Tax rates and fix costs</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <Button onClick={handleAddCompany} size="sm" className="bg-zinc-900 hover:bg-zinc-800 text-white h-9">
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

        <Card className="border-zinc-200 shadow-md md:col-span-2 overflow-hidden bg-white">
          <CardHeader className="flex flex-row items-center justify-between bg-zinc-50/50 border-b py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-zinc-900 rounded-lg shadow-lg">
                <Settings2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold tracking-tight text-zinc-900">BELT CONFIGURATION</CardTitle>
                <CardDescription className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Manage Categories, Styles and Bill of Materials</CardDescription>
              </div>
            </div>
            <Button 
               className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 h-9 px-4 rounded-lg font-bold text-xs uppercase tracking-wider shadow-sm"
               onClick={handleSave}
               disabled={isSaving}
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Committing...' : 'Commit Changes'}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="flex h-[500px] divide-x divide-zinc-100 bg-white">
              
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
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`Are you sure you want to delete Category "${cat.name}"? All associated styles and BOMs will be deleted.`)) {
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (window.confirm(`Are you sure you want to delete Style "${style.name}"?`)) {
                                    removeStyle(selectedCatIdx!, idx);
                                    setSelectedStyleIdx(null);
                                    setSelectedBOMIdx(null);
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
              <div className={cn(
                "flex flex-col border-r border-zinc-150 transition-all duration-300",
                selectedStyleIdx === null ? "hidden" : "flex-1 min-w-[220px]"
              )}>
                <div className="p-3 bg-zinc-50/80 border-b flex items-center justify-between">
                   <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">3. BILL OF MATERIAL</span>
                   <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-110 transition-transform disabled:opacity-30" 
                    disabled={selectedStyleIdx === null}
                    onClick={() => {
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
                        <div className="flex flex-col min-w-0 flex-1 mr-1">
                          <span className={cn("text-xs font-bold truncate", selectedBOMIdx === idx ? "text-blue-700" : "text-zinc-700")}>
                            {item.name.toUpperCase()}
                          </span>
                           <span className="text-[10px] text-blue-500 font-mono font-bold tracking-tighter">={item.formula}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
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
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm(`Are you sure you want to delete Component "${item.name}"?`)) {
                                removeBOMItem(idx);
                                setSelectedBOMIdx(null);
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
                                          <Info 
                                            className="h-3.5 w-3.5 text-zinc-400 hover:text-blue-600 hover:scale-110 transition-all cursor-pointer"
                                            onClick={() => openRateHistory(item.id, item.name)}
                                            title="Click to view price change history"
                                          />
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
                                    <div className="relative">
                                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-xs">=</div>
                                      <Input 
                                        className={cn(
                                          "pl-7 h-10 font-mono text-xs font-bold transition-all",
                                          item.isLocked 
                                            ? "bg-zinc-100 border-zinc-300 text-zinc-800 cursor-not-allowed" 
                                            : "bg-white border-zinc-300 focus:border-blue-400"
                                        )}
                                        disabled={item.isLocked}
                                        value={item.formula} 
                                        onChange={(e) => {
                                          const val = e.target.value.toUpperCase();
                                          if (val && !/^[0-9LWP\.\+\-\*\/\(\)\s]*$/.test(val)) return;
                                          const updated = [...localConfig.beltTypes];
                                          updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].formula = val;
                                          setLocalConfig({ ...localConfig, beltTypes: updated });
                                        }}
                                      />
                                    </div>
                                    <p className="text-[9px] text-zinc-400 italic">Allowed: L, W, P (Perimeter), Numbers, +, -, *, /, ( )</p>
                                  </div>
                                </div>

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
                                        bomItem.options = [...(bomItem.options || []), { name: '', rate: 0, unit: bomItem.unit }];
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
                                           <div className="relative">
                                             <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 font-mono text-[10px]">=</div>
                                             <Input 
                                               placeholder={item.formula}
                                               className="h-8 pl-6 text-xs font-mono border-zinc-200 bg-zinc-50/50 focus:bg-white focus:border-blue-400 transition-all w-full"
                                               value={opt.formula || ''}
                                               onChange={(e) => {
                                                 const val = e.target.value.toUpperCase();
                                                 if (val && !/^[0-9LWP\.\+\-\*\/\(\)\s]*$/.test(val)) return;
                                                 const updated = [...localConfig.beltTypes];
                                                 updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].options[optIdx].formula = val;
                                                 setLocalConfig({ ...localConfig, beltTypes: updated });
                                               }}
                                             />
                                           </div>
                                         </div>

                                         <div className="flex items-end gap-2">
                                           <div className="flex-1 space-y-1">
                                             <Label className="text-[9px] font-black uppercase tracking-tighter text-zinc-400 ml-1 flex items-center gap-1.5">
                                               <span>Rate {opt.isFormation ? <span className="text-violet-400 font-normal normal-case">(auto from formation)</span> : ''}</span>
                                               {opt.name && !opt.isFormation && (
                                                 <Info 
                                                   className="h-3.5 w-3.5 text-zinc-400 hover:text-blue-600 hover:scale-110 transition-all cursor-pointer" 
                                                   onClick={() => openRateHistory(`${item.id}::${opt.name}`, opt.name)}
                                                   title="Click to view price change history"
                                                 />
                                               )}
                                             </Label>
                                             <div className="relative">
                                               <div className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 font-bold">₹</div>
                                               <Input 
                                                 type="number"
                                                 className={cn(
                                                   "h-8 pl-5 pr-1 text-xs border-zinc-200 font-bold text-zinc-700 focus:bg-white focus:border-blue-400 transition-all",
                                                   opt.isFormation ? "bg-violet-50/50 text-violet-800" : "bg-zinc-50/50"
                                                 )}
                                                 value={opt.rate}
                                                 onChange={(e) => {
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
                                             onClick={() => {
                                               const updated = [...localConfig.beltTypes];
                                               updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].options.splice(optIdx, 1);
                                               setLocalConfig({ ...localConfig, beltTypes: updated });
                                             }}
                                           >
                                             <Trash2 className="h-4 w-4" />
                                           </Button>
                                         </div>

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
                                                           updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].options[optIdx].formationItems[fiIdx].rate = parseFloat(e.target.value) || 0;
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
                                                           if (val && !/^[0-9LWP\.\+\-\*\/\(\)\s]*$/.test(val)) return;
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
                                                         updated[selectedCatIdx!].styles[selectedStyleIdx!].bom[selectedBOMIdx].options[optIdx].formationItems.splice(fiIdx, 1);
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



      </div>

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
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-400">=</div>
                  <Input 
                    placeholder="(W + 0.26) * 2 or L * 4" 
                    className="border-blue-400 bg-blue-50/30 pl-8 font-mono text-blue-800"
                    value={newBOMItem.formula} 
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      if (val && !/^[0-9LW\.\+\-\*\/\(\)\s]*$/.test(val)) return;
                      setNewBOMItem({ 
                        ...newBOMItem, 
                        formula: val,
                        unit: getAutoUnit(val, newBOMItem.unit)
                      });
                    }}
                  />
                </div>
                <p className="text-[10px] text-zinc-400 italic">Use 'L' for Length, 'W' for Width (in meters).</p>
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
            <DialogTitle>{categoryModal.mode === 'add' ? '➕ Add New Category' : '✏️ Edit Category'}</DialogTitle>
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
            <Button className="w-full sm:w-auto text-xs bg-zinc-900 text-white hover:bg-zinc-800" onClick={handleSaveCategoryModal}>
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
            <Button onClick={() => setRateHistoryItem(null)} className="w-full bg-zinc-900 text-white hover:bg-zinc-800" size="sm">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
