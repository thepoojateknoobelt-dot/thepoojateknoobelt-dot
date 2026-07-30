import React, { useState, useEffect, useMemo } from 'react';
import {
  Package, Layers, Scissors, AlertTriangle, Plus, Trash2,
  ChevronRight, ChevronLeft, TrendingDown, Info,
  RotateCcw, Wand2, BarChart3, Loader2, Warehouse, User,
  ArrowLeft, X, Menu, Search, Printer, Download, Edit2, Check,
  ClipboardList, Send, Clock, ArrowDownCircle, ExternalLink,
  Sliders, Eye
} from 'lucide-react';
import {
  saveRoll, updateRoll, deleteRoll, saveCut, deleteCut, fetchRolls, OperationType
} from './services/firebase';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { Roll, Cut, Order, OptimizationCandidate, Unit, MaterialStock, MaterialIssue, MaterialRequest, ReadyBeltStock } from './types';
import {
  MATERIAL_TYPES,
  CUT_COLORS
} from './constants';
import { findGlobalBestPlacement, isSpaceAvailable } from './services/optimizationEngine';
import RollVisualizer from './components/RollVisualizer';
import StatsCard from './components/StatsCard';
import { SearchableSelect } from './components/SearchableSelect';
import { getShortRollId, getResolvedRollCuts } from './utils';

const CONVERSIONS: Record<Unit, number> = {
  'm': 1,
  'cm': 100,
  'mm': 1000,
  'ft': 3.28084,
  'in': 39.3701
};

const isRollReuse = (roll: Roll) => {
  return !!(roll.isReuse || (roll.id && (roll.id.startsWith('REUSE-') || roll.id.startsWith('INV-') || roll.id.startsWith('SCRAP-'))));
};

const parseLocaleDateString = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  try {
    const parts = dateStr.split(',');
    if (parts.length < 1) return null;
    const dateParts = parts[0].trim().split('/');
    if (dateParts.length !== 3) return null;
    
    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const year = parseInt(dateParts[2], 10);

    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    if (parts.length > 1) {
      const timeParts = parts[1].trim().split(' ');
      const timeHMS = timeParts[0].split(':');
      hours = parseInt(timeHMS[0], 10);
      minutes = parseInt(timeHMS[1], 10) || 0;
      seconds = parseInt(timeHMS[2], 10) || 0;

      if (timeParts.length > 1) {
        const ampm = timeParts[1].toLowerCase();
        if (ampm.includes('pm') && hours < 12) {
          hours += 12;
        } else if (ampm.includes('am') && hours === 12) {
          hours = 0;
        }
      }
    }
    return new Date(year, month, day, hours, minutes, seconds);
  } catch (e) {
    return null;
  }
};

const getStockStatusForDate = (item: ReadyBeltStock, targetDateStr: string) => {
  if (!targetDateStr) {
    return {
      received: 0,
      issued: 0,
      closing: item.openingPisc
    };
  }

  const dateParts = targetDateStr.split('-');
  const targetYear = parseInt(dateParts[0], 10);
  const targetMonth = parseInt(dateParts[1], 10) - 1;
  const targetDay = parseInt(dateParts[2], 10);
  
  const targetDateEnd = new Date(targetYear, targetMonth, targetDay, 23, 59, 59, 999);

  let receivedOnDate = 0;
  let issuedOnDate = 0;
  let recvAfter = 0;
  let issueAfter = 0;

  (item.detailsLog || []).forEach((log: any) => {
    const logDate = parseLocaleDateString(log.dateTime);
    if (!logDate) return;

    const isSameDay = logDate.getFullYear() === targetYear &&
                      logDate.getMonth() === targetMonth &&
                      logDate.getDate() === targetDay;

    if (isSameDay) {
      if (log.recvQty) receivedOnDate += log.recvQty;
      if (log.issuesQty) issuedOnDate += log.issuesQty;
    }

    if (logDate > targetDateEnd) {
      if (log.recvQty) recvAfter += log.recvQty;
      if (log.issuesQty) issueAfter += log.issuesQty;
    }
  });

  const closingAtDate = item.openingPisc - recvAfter + issueAfter;

  return {
    received: receivedOnDate,
    issued: issuedOnDate,
    closing: closingAtDate
  };
};

const isInventoryCutName = (name?: string) => {
  if (!name) return false;
  const upper = name.toUpperCase().trim();
  return upper === 'INTERNAL STOCK' || upper === 'REUSE STOCK';
};

const findInventoryRollForCut = (rolls: Roll[], parentRollId: string, cut: Cut) => {
  // 1. Try exact ID match: REUSE-parentRollId-cutId, INV-parentRollId-cutId or ending with cutId
  let matchedRoll = rolls.find(r =>
    r.id === `REUSE-${parentRollId}-${cut.id}` ||
    r.id === `INV-${parentRollId}-${cut.id}` ||
    r.id.endsWith(cut.id)
  );
  if (matchedRoll) return matchedRoll;

  // 2. Fallback: Search by parentRollId, dimensions (within small tolerance), and material type
  const parentRoll = rolls.find(r => r.id === parentRollId);
  const materialType = parentRoll?.materialType;

  const candidates = rolls.filter(r =>
    r.parentRollId === parentRollId &&
    (!materialType || r.materialType === materialType) &&
    Math.abs(r.fullWidth - cut.width) < 0.01 &&
    Math.abs(r.fullLength - cut.length) < 0.01
  );

  if (candidates.length === 1) {
    return candidates[0];
  } else if (candidates.length > 1) {
    // try timestamp portion match (C-<timestamp>-<rand>) with suffix
    const tsParts = cut.id.split('-');
    if (tsParts.length >= 2) {
      const cutTimestampStr = tsParts[1];
      const lastFour = cutTimestampStr.slice(-4);
      const subCandidate = candidates.find(r => r.id.endsWith(lastFour));
      if (subCandidate) return subCandidate;
    }
    return candidates[0];
  }
  return null;
};

interface BeltcutProProps {
  onBackToMaster?: () => void;
}

export const BeltcutPro: React.FC<BeltcutProProps> = ({ onBackToMaster }) => {
  const { user } = useAuth();

  const tabPermissionMap = {
    dashboard: 'nesting_dashboard',
    cutting: 'nesting_cutting',
    rolls_map: 'nesting_rolls_map',
    details: 'nesting_details',
    stock: 'nesting_stock',
    production: 'nesting_production',
    scrub: 'nesting_scrub'
  };

  const getInitialTab = () => {
    if (user?.role === 'admin') return 'dashboard';
    const allowed = ['dashboard', 'cutting', 'rolls_map', 'details', 'stock', 'production', 'scrub'].filter(t =>
      user?.allowedPages?.includes((tabPermissionMap as any)[t])
    );
    return (allowed[0] as any) || 'dashboard';
  };

  const [currentUnit, setCurrentUnit] = useState<Unit>('m');
  const [rolls, setRolls] = useState<Roll[]>([]);
  const [newRoll, setNewRoll] = useState({
    id: 'R-101',
    materialType: MATERIAL_TYPES[0],
    fullWidth: 4,
    fullLength: 115
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<'dashboard' | 'cutting' | 'rolls_map' | 'details' | 'stock' | 'scrub' | 'production'>(getInitialTab);
  const [detailsSubTab, setDetailsSubTab] = useState<'clients' | 'rolls'>('clients');
  const [selectedClientName, setSelectedClientName] = useState<string | null>(null);
  const [selectedRollId, setSelectedRollId] = useState<string | null>(null);
  const [rollHistory, setRollHistory] = useState<string[]>([]);
  const [rollDetailPanelId, setRollDetailPanelId] = useState<string | null>(null);
  const [cuttingMode, setCuttingMode] = useState<'auto' | 'manual'>('auto');
  const [isSyncing, setIsSyncing] = useState(true);
  const [showAddRollForm, setShowAddRollForm] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());
  const [showPartySuggestions, setShowPartySuggestions] = useState(false);

  // Expanded/Accordion Roll ID for Remnant Matching Visualization
  const [expandedRollId, setExpandedRollId] = useState<string | null>(null);
  const [lastCutRollId, setLastCutRollId] = useState<string | null>(null);
  const [fullscreenRollId, setFullscreenRollId] = useState<string | null>(null);

  // Cut Purpose State & Active Orders
  const [cutPurpose, setCutPurpose] = useState<'manual' | 'order' | 'scrap' | 'inventory'>('order');
  const [orders, setOrders] = useState<any[]>([]);
  const [allOrdersMap, setAllOrdersMap] = useState<Record<string, string>>({});
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string>('');
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');
  const [showOrderDropdown, setShowOrderDropdown] = useState<boolean>(false);
  const [tableSearchQuery, setTableSearchQuery] = useState<string>('');

  // Target Roll Selection for Scrap & Inventory
  const [cuttingSelectedRollId, setCuttingSelectedRollId] = useState<string>('');
  const [rollSearchQuery, setRollSearchQuery] = useState<string>('');
  const [showRollDropdown, setShowRollDropdown] = useState<boolean>(false);

  // Material Stocks States
  const [materialStocks, setMaterialStocks] = useState<MaterialStock[]>([]);
  const [newMaterialStock, setNewMaterialStock] = useState({ name: '', quantity: '', unit: 'pcs', reorderLevel: '' });
  const [config, setConfig] = useState<any>(null);
  const [formLots, setFormLots] = useState<any[]>([]);
  const [expandedStockIds, setExpandedStockIds] = useState<string[]>([]);

  // Synchronize lots count with quantity in "Add Material" form
  useEffect(() => {
    if (formLots.length > 0) {
      const totalPieces = formLots.reduce((sum, lot) => sum + (lot.pieces?.length || 0), 0);
      setNewMaterialStock(prev => ({ ...prev, quantity: totalPieces.toString() }));
    }
  }, [formLots]);

  const loadConfigData = async () => {
    try {
      const res = await fetch('/api/settings/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.error("Failed to fetch system config in BeltcutPro:", err);
    }
  };
  const [editingMaterialStock, setEditingMaterialStock] = useState<MaterialStock | null>(null);

  // Synchronize lots count with quantity in "Edit Material" inline form
  useEffect(() => {
    if (editingMaterialStock) {
      setFormLots(editingMaterialStock.lots || []);
    } else {
      setFormLots([]);
    }
  }, [editingMaterialStock?.id]);

  useEffect(() => {
    if (editingMaterialStock && formLots.length > 0) {
      const totalPieces = formLots.reduce((sum, lot) => sum + (lot.pieces?.length || 0), 0);
      if (editingMaterialStock.quantity !== totalPieces) {
        setEditingMaterialStock(prev => prev ? { ...prev, quantity: totalPieces } : null);
      }
    }
  }, [formLots]);

  const [showAddMaterialForm, setShowAddMaterialForm] = useState(false);
  const [activeInventoryCard, setActiveInventoryCard] = useState<'materials' | 'remnants' | 'fresh' | 'reorder' | 'requests' | 'ready_belt' | null>(null);
  const [editingReorderLevel, setEditingReorderLevel] = useState<Record<string, string>>({}); // stockId -> input value
  const [savingReorderLevel, setSavingReorderLevel] = useState<string | null>(null); // stockId being saved
  const [editingRollReorderLevel, setEditingRollReorderLevel] = useState<Record<string, string>>({}); // rollId -> input value
  const [savingRollReorderLevel, setSavingRollReorderLevel] = useState<string | null>(null); // rollId being saved
  const [materialTypeReorders, setMaterialTypeReorders] = useState<Record<string, number>>({});
  const [editingMaterialTypeReorder, setEditingMaterialTypeReorder] = useState<Record<string, string>>({});
  const [savingMaterialTypeReorder, setSavingMaterialTypeReorder] = useState<string | null>(null);

  // Search states for individual Inventory Tables
  const [overviewSearchQuery, setOverviewSearchQuery] = useState('');
  const [materialSearchQuery, setMaterialSearchQuery] = useState('');
  const [remnantSearchQuery, setRemnantSearchQuery] = useState('');
  const [freshRollSearchQuery, setFreshRollSearchQuery] = useState('');
  const [reorderSearchQuery, setReorderSearchQuery] = useState('');
  const [rollReorderSearchQuery, setRollReorderSearchQuery] = useState('');

  // Production / Material Issues states
  const [materialIssues, setMaterialIssues] = useState<MaterialIssue[]>([]);


  // Material Requests states
  const [materialRequests, setMaterialRequests] = useState<MaterialRequest[]>([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [requestForm, setRequestForm] = useState({ materialId: '', quantity: '', notes: '', lotNumber: '' });
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  const [approvingRequest, setApprovingRequest] = useState<MaterialRequest | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalForm, setApprovalForm] = useState({ approvedQuantity: '', approvalNotes: '', lotNumber: '' });
  const [isSubmittingApproval, setIsSubmittingApproval] = useState(false);
  const [requestsSubTab, setRequestsSubTab] = useState<'pending' | 'history'>('pending');
  const [reorderSubTab, setReorderSubTab] = useState<'materials' | 'rolls' | 'remnants'>('materials');

  // Custom Material Types states
  const [materialTypes, setMaterialTypes] = useState<string[]>(MATERIAL_TYPES);
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [newMaterialTypeName, setNewMaterialTypeName] = useState('');
  const [materialTypeAddSource, setMaterialTypeAddSource] = useState<'selectedOrder' | 'newRoll' | null>(null);
  const [previousMaterialTypeVal, setPreviousMaterialTypeVal] = useState<string>('');
  const [editingMaterialType, setEditingMaterialType] = useState<string | null>(null);
  const [editingMaterialTypeName, setEditingMaterialTypeName] = useState<string>('');
  const [isOrderDimensionsUnlocked, setIsOrderDimensionsUnlocked] = useState(false);

  // Shared helper: fuzzy-match a belt type string against actual DB materialTypes list
  const matchMaterialType = React.useCallback((bType: string): string => {
    const bt = (bType || '').toLowerCase().trim();
    if (!bt) return materialTypes[0] || MATERIAL_TYPES[0];
    // 1. Try exact match first (case-insensitive)
    const exact = materialTypes.find(t => t.toLowerCase() === bt);
    if (exact) return exact;
    // 2. Try substring match — find the DB type whose name includes the order belt type string
    const substringMatch = materialTypes.find(t => t.toLowerCase().includes(bt) || bt.includes(t.toLowerCase()));
    if (substringMatch) return substringMatch;
    // 3. Keyword-based fallback
    if (bt.includes('pvc') && bt.includes('food')) {
      const found = materialTypes.find(t => t.toLowerCase().includes('food'));
      if (found) return found;
    }
    if (bt.includes('pvc')) {
      const found = materialTypes.find(t => t.toLowerCase().includes('pvc'));
      if (found) return found;
    }
    if (bt.includes('rubber') || bt.includes('black')) {
      const found = materialTypes.find(t => t.toLowerCase().includes('rubber'));
      if (found) return found;
    }
    if (bt.includes('pu') || bt.includes('heat')) {
      const found = materialTypes.find(t => t.toLowerCase().includes('pu') || t.toLowerCase().includes('heat'));
      if (found) return found;
    }
    if (bt.includes('taflon') || bt.includes('teflon') || bt.includes('ptfe')) {
      const found = materialTypes.find(t => t.toLowerCase().includes('taflon') || t.toLowerCase().includes('teflon') || t.toLowerCase().includes('ptfe'));
      if (found) return found;
    }
    // 4. Final fallback: first available type
    return materialTypes[0] || MATERIAL_TYPES[0];
  }, [materialTypes]);
  const [selectedOrderData, setSelectedOrderData] = useState<any | null>(null);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [justCutExecuted, setJustCutExecuted] = useState(false);

  // Ready Belt Stocks states
  const [readyBeltStocks, setReadyBeltStocks] = useState<ReadyBeltStock[]>([]);
  const [readyBeltSearchQuery, setReadyBeltSearchQuery] = useState('');
  const [readyBeltDateFilter, setReadyBeltDateFilter] = useState('');
  const [showAddReadyBeltForm, setShowAddReadyBeltForm] = useState(false);
  const [newReadyBeltStock, setNewReadyBeltStock] = useState({
    category: 'BROWN BELT',
    beltStock: '',
    size: '',
    openingPisc: '',
    recvPisc: '',
    issuesPisc: '',
    soNo: '',
    receiverName: ''
  });
  const [editingReadyBeltStock, setEditingReadyBeltStock] = useState<ReadyBeltStock | null>(null);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<ReadyBeltStock | null>(null);
  const [selectedIssueItem, setSelectedIssueItem] = useState<ReadyBeltStock | null>(null);
  const [selectedUpdateItem, setSelectedUpdateItem] = useState<ReadyBeltStock | null>(null);
  const [issueForm, setIssueForm] = useState({
    issuesPisc: '',
    soNo: '',
    receiverName: ''
  });
  const [updateForm, setUpdateForm] = useState({ recvPisc: '' });

  const loadReadyBeltStocksData = async () => {
    try {
      const res = await fetch('/api/ready-belt-stocks');
      if (res.ok) {
        const data = await res.json();
        setReadyBeltStocks(data);
      }
    } catch (err) {
      console.error("Failed to fetch ready belt stocks:", err);
    }
  };

  const loadMaterialStocksData = async () => {
    try {
      const res = await fetch('/api/material-stocks');
      if (res.ok) {
        const data = await res.json();
        setMaterialStocks(data);
      }
    } catch (err) {
      console.error("Failed to fetch material stocks:", err);
    }
  };

  const loadMaterialTypesData = async () => {
    try {
      const res = await fetch('/api/material-types');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setMaterialTypes(data);
        }
      }
    } catch (err) {
      console.error("Failed to fetch material types:", err);
    }
  };

  const handleAddCustomMaterialType = async () => {
    const trimmed = newMaterialTypeName.trim();
    if (!trimmed) return;
    try {
      const res = await fetch('/api/material-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        await loadMaterialTypesData();
        if (materialTypeAddSource === 'selectedOrder') {
          setSelectedOrder(prev => ({ ...prev, materialType: trimmed }));
        } else if (materialTypeAddSource === 'newRoll') {
          setNewRoll(prev => ({ ...prev, materialType: trimmed }));
        }
        setNewMaterialTypeName('');
        setShowAddMaterialModal(false);
        setMaterialTypeAddSource(null);
        toast.success(`Material type "${trimmed}" added successfully!`);
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to add material type");
      }
    } catch (err) {
      console.error("Error adding material type:", err);
      alert("Failed to add material type due to a network error.");
    }
  };

  const handleCancelAddMaterialType = () => {
    if (materialTypeAddSource === 'selectedOrder') {
      setSelectedOrder(prev => ({ ...prev, materialType: previousMaterialTypeVal || materialTypes[0] }));
    } else if (materialTypeAddSource === 'newRoll') {
      setNewRoll(prev => ({ ...prev, materialType: previousMaterialTypeVal || materialTypes[0] }));
    }
    setNewMaterialTypeName('');
    setShowAddMaterialModal(false);
    setMaterialTypeAddSource(null);
    setEditingMaterialType(null);
  };

  const handleUpdateMaterialType = async (oldName: string) => {
    const trimmed = editingMaterialTypeName.trim();
    if (!trimmed) return;
    if (trimmed === oldName) {
      setEditingMaterialType(null);
      return;
    }
    if (!window.confirm(`Are you sure you want to rename "${oldName}" to "${trimmed}"? This will also update all existing rolls using this type.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/material-types/${encodeURIComponent(oldName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: trimmed }),
      });
      if (res.ok) {
        await loadMaterialTypesData();
        if (selectedOrder.materialType === oldName) {
          setSelectedOrder(prev => ({ ...prev, materialType: trimmed }));
        }
        if (newRoll.materialType === oldName) {
          setNewRoll(prev => ({ ...prev, materialType: trimmed }));
        }
        setEditingMaterialType(null);
        toast.success(`Material type renamed to "${trimmed}" successfully!`);
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to update material type");
      }
    } catch (err) {
      console.error("Error updating material type:", err);
      alert("Failed to update material type.");
    }
  };

  const handleDeleteMaterialType = async (name: string) => {
    if (!window.confirm(`Are you sure you want to delete the material type "${name}"? It will be removed from future selection options.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/material-types/${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await loadMaterialTypesData();
        if (selectedOrder.materialType === name) {
          setSelectedOrder(prev => ({ ...prev, materialType: materialTypes.find(t => t !== name) || '' }));
        }
        if (newRoll.materialType === name) {
          setNewRoll(prev => ({ ...prev, materialType: materialTypes.find(t => t !== name) || '' }));
        }
        toast.success(`Material type "${name}" deleted successfully!`);
      } else {
        const errData = await res.json();
        alert(errData.error || "Failed to delete material type");
      }
    } catch (err) {
      console.error("Error deleting material type:", err);
      alert("Failed to delete material type.");
    }
  };

  const loadMaterialRequestsData = async () => {
    try {
      const res = await fetch('/api/material-requests');
      if (res.ok) {
        const data = await res.json();
        setMaterialRequests(data);
      }
    } catch (err) {
      console.error("Failed to fetch material requests:", err);
    }
  };

  const handleAddMaterialStock = async () => {
    if (!newMaterialStock.name.trim()) return;
    try {
      const res = await fetch('/api/material-stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newMaterialStock.name.trim(),
          quantity: parseFloat(newMaterialStock.quantity) || 0,
          unit: newMaterialStock.unit.trim() || 'pcs',
          lots: formLots
        })
      });
      if (res.ok) {
        toast.success("Material stock added successfully!");
        setNewMaterialStock({ name: '', quantity: '', unit: 'pcs', reorderLevel: '' });
        setFormLots([]);
        setShowAddMaterialForm(false);
        loadMaterialStocksData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to add material stock");
      }
    } catch (err) {
      toast.error("Failed to add material stock");
    }
  };

  const handleUpdateMaterialStock = async () => {
    if (!editingMaterialStock || !editingMaterialStock.name.trim()) return;
    try {
      const res = await fetch(`/api/material-stocks/${editingMaterialStock.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingMaterialStock.name.trim(),
          quantity: editingMaterialStock.quantity,
          unit: editingMaterialStock.unit,
          lots: formLots
        })
      });
      if (res.ok) {
        toast.success("Material stock updated successfully!");
        setEditingMaterialStock(null);
        setFormLots([]);
        loadMaterialStocksData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to update material stock");
      }
    } catch (err) {
      toast.error("Failed to update material stock");
    }
  };

  const handleDeleteMaterialStock = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      const res = await fetch(`/api/material-stocks/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        toast.success("Material stock deleted successfully!");
        loadMaterialStocksData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to delete material stock");
      }
    } catch (err) {
      toast.error("Failed to delete material stock");
    }
  };

  const handleAddReadyBeltStock = async () => {
    if (!newReadyBeltStock.beltStock.trim() || !newReadyBeltStock.size.trim()) {
      toast.error("Belt Stock Name and Size are required.");
      return;
    }
    try {
      const res = await fetch('/api/ready-belt-stocks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: newReadyBeltStock.category,
          beltStock: newReadyBeltStock.beltStock.trim(),
          size: newReadyBeltStock.size.trim(),
          openingPisc: parseInt(newReadyBeltStock.openingPisc, 10) || 0,
          recvPisc: parseInt(newReadyBeltStock.recvPisc, 10) || 0,
          issuesPisc: parseInt(newReadyBeltStock.issuesPisc, 10) || 0,
          soNo: newReadyBeltStock.soNo.trim(),
          receiverName: newReadyBeltStock.receiverName.trim()
        })
      });
      if (res.ok) {
        toast.success("Ready Belt Stock added successfully!");
        setNewReadyBeltStock({
          category: 'BROWN BELT',
          beltStock: '',
          size: '',
          openingPisc: '',
          recvPisc: '',
          issuesPisc: '',
          soNo: '',
          receiverName: ''
        });
        setShowAddReadyBeltForm(false);
        loadReadyBeltStocksData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to add ready belt stock");
      }
    } catch (err) {
      toast.error("Failed to add ready belt stock");
    }
  };

  const handleUpdateReadyBeltStock = async () => {
    if (!editingReadyBeltStock || !editingReadyBeltStock.beltStock.trim() || !editingReadyBeltStock.size.trim()) return;
    try {
      const res = await fetch(`/api/ready-belt-stocks/${editingReadyBeltStock.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: editingReadyBeltStock.category,
          beltStock: editingReadyBeltStock.beltStock.trim(),
          size: editingReadyBeltStock.size.trim(),
          openingPisc: editingReadyBeltStock.openingPisc,
          recvPisc: editingReadyBeltStock.recvPisc,
          issuesPisc: editingReadyBeltStock.issuesPisc,
          soNo: editingReadyBeltStock.soNo.trim(),
          receiverName: editingReadyBeltStock.receiverName.trim()
        })
      });
      if (res.ok) {
        toast.success("Ready Belt Stock updated successfully!");
        setEditingReadyBeltStock(null);
        loadReadyBeltStocksData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to update ready belt stock");
      }
    } catch (err) {
      toast.error("Failed to update ready belt stock");
    }
  };

  const handleDeleteReadyBeltStock = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"?`)) return;
    try {
      const res = await fetch(`/api/ready-belt-stocks/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        toast.success("Ready Belt Stock deleted successfully!");
        loadReadyBeltStocksData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to delete ready belt stock");
      }
    } catch (err) {
      toast.error("Failed to delete ready belt stock");
    }
  };

  const handleIssueSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIssueItem) return;
    const qty = parseInt(issueForm.issuesPisc, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Please enter a valid quantity to issue.");
      return;
    }
    if (qty > selectedIssueItem.closingPisc) {
      if (!window.confirm(`Warning: You are issuing ${qty} pieces, which exceeds the current closing stock of ${selectedIssueItem.closingPisc} pieces. Proceed anyway?`)) {
        return;
      }
    }

    try {
      const res = await fetch(`/api/ready-belt-stocks/${selectedIssueItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedIssueItem.category,
          beltStock: selectedIssueItem.beltStock,
          size: selectedIssueItem.size,
          openingPisc: selectedIssueItem.openingPisc,
          recvPisc: selectedIssueItem.recvPisc,
          issuesPisc: selectedIssueItem.issuesPisc + qty,
          soNo: issueForm.soNo.trim(),
          receiverName: issueForm.receiverName.trim()
        })
      });
      if (res.ok) {
        toast.success(`Issued ${qty} pieces successfully!`);
        setSelectedIssueItem(null);
        setIssueForm({ issuesPisc: '', soNo: '', receiverName: '' });
        loadReadyBeltStocksData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to issue stock");
      }
    } catch (err) {
      toast.error("Failed to issue stock");
    }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUpdateItem) return;
    const qty = parseInt(updateForm.recvPisc, 10);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Please enter a valid quantity.");
      return;
    }

    try {
      const res = await fetch(`/api/ready-belt-stocks/${selectedUpdateItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedUpdateItem.category,
          beltStock: selectedUpdateItem.beltStock,
          size: selectedUpdateItem.size,
          openingPisc: selectedUpdateItem.openingPisc,
          recvPisc: selectedUpdateItem.recvPisc + qty,
          issuesPisc: selectedUpdateItem.issuesPisc,
          soNo: '-',
          receiverName: '-'
        })
      });

      if (res.ok) {
        toast.success(`Received ${qty} pieces successfully!`);
        setSelectedUpdateItem(null);
        setUpdateForm({ recvPisc: '' });
        loadReadyBeltStocksData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || "Failed to update stock");
      }
    } catch (err) {
      toast.error("Failed to update stock");
    }
  };


  const handleSaveReorderLevel = async (stockId: string) => {
    const val = editingReorderLevel[stockId];
    if (val === undefined || val === '') return;
    setSavingReorderLevel(stockId);
    try {
      const res = await fetch(`/api/material-stocks/${stockId}/reorder-level`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorderLevel: parseFloat(val) || 0 })
      });
      if (res.ok) {
        toast.success('Reorder level saved!');
        setEditingReorderLevel(prev => { const next = { ...prev }; delete next[stockId]; return next; });
        loadMaterialStocksData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Failed to save reorder level');
      }
    } catch (err) {
      toast.error('Failed to save reorder level');
    } finally {
      setSavingReorderLevel(null);
    }
  };

  const handleSaveRollReorderLevel = async (rollId: string) => {
    const val = editingRollReorderLevel[rollId];
    if (val === undefined || val === '') return;
    setSavingRollReorderLevel(rollId);
    try {
      const res = await fetch(`/api/rolls/${encodeURIComponent(rollId)}/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorderLevel: parseFloat(val) || 0 })
      });
      if (res.ok) {
        toast.success('Roll reorder level saved!');
        setEditingRollReorderLevel(prev => { const next = { ...prev }; delete next[rollId]; return next; });
        loadRollsData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Failed to save reorder level');
      }
    } catch (err) {
      toast.error('Failed to save reorder level');
    } finally {
      setSavingRollReorderLevel(null);
    }
  };

  const loadMaterialTypeReorders = async () => {
    try {
      const res = await fetch('/api/material-type-reorders');
      if (res.ok) {
        const data = await res.json();
        const mapping: Record<string, number> = {};
        data.forEach((item: any) => {
          mapping[item.materialType] = item.reorderLevel;
        });
        setMaterialTypeReorders(mapping);
      }
    } catch (err) {
      console.error("Failed to fetch material type reorders:", err);
    }
  };

  const handleSaveMaterialTypeReorder = async (materialType: string) => {
    const val = editingMaterialTypeReorder[materialType];
    if (val === undefined || val === '') return;
    setSavingMaterialTypeReorder(materialType);
    try {
      const res = await fetch('/api/material-type-reorders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialType, reorderLevel: parseFloat(val) || 0 })
      });
      if (res.ok) {
        toast.success('Material type reorder level saved!');
        setEditingMaterialTypeReorder(prev => { const next = { ...prev }; delete next[materialType]; return next; });
        loadMaterialTypeReorders();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Failed to save reorder level');
      }
    } catch (err) {
      toast.error('Failed to save reorder level');
    } finally {
      setSavingMaterialTypeReorder(null);
    }
  };


  // â”€â”€ Production / Material Issues functions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const loadMaterialIssues = async () => {
    try {
      const res = await fetch('/api/material-issues');
      if (res.ok) {
        const data = await res.json();
        setMaterialIssues(data);
      }
    } catch (err) {
      console.error('Failed to fetch material issues:', err);
    }
  };



  const handleDeleteIssue = async (id: string) => {
    if (!window.confirm('Remove this issue record?')) return;
    try {
      const res = await fetch(`/api/material-issues/${id}`, { method: 'DELETE' });
      if (res.ok) { toast.success('Record removed'); loadMaterialIssues(); }
    } catch (err) { toast.error('Failed to delete record'); }
  };

  // ─── Material Requests handlers ───
  const handleSubmitRequest = async () => {
    if (!requestForm.materialId) {
      toast.error('Please select a material');
      return;
    }
    const qty = parseFloat(requestForm.quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }
    const mat = materialStocks.find(s => s.id === requestForm.materialId);
    if (!mat) return;

    setIsSubmittingRequest(true);
    try {
      const requesterName = user?.name || user?.username || 'Production Team';
      const res = await fetch('/api/material-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materialId: mat.id,
          materialName: mat.name,
          requestedQuantity: qty,
          unit: mat.unit,
          requestedBy: requesterName,
          notes: requestForm.notes.trim(),
          lotNumber: requestForm.lotNumber || undefined
        })
      });
      if (res.ok) {
        toast.success('Material request sent successfully!');
        setShowRequestModal(false);
        setRequestForm({ materialId: '', quantity: '', notes: '', lotNumber: '' });
        await loadMaterialRequestsData();
      } else {
        toast.error('Failed to send request');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to send request');
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleOpenApprovalModal = (req: MaterialRequest) => {
    setApprovingRequest(req);
    setApprovalForm({
      approvedQuantity: req.requestedQuantity.toString(),
      approvalNotes: '',
      lotNumber: req.lotNumber || ''
    });
    setShowApprovalModal(true);
  };

  const handleSubmitApproval = async () => {
    if (!approvingRequest) return;
    const qty = parseFloat(approvalForm.approvedQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid approved quantity');
      return;
    }
    setIsSubmittingApproval(true);
    try {
      const approvedByName = user?.name || user?.username || 'Admin';
      const res = await fetch(`/api/material-requests/${approvingRequest.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvedQuantity: qty,
          approvalNotes: approvalForm.approvalNotes.trim(),
          approvedBy: approvedByName,
          lotNumber: approvalForm.lotNumber || undefined
        })
      });
      if (res.ok) {
        toast.success('Request approved successfully!');
        setShowApprovalModal(false);
        setApprovingRequest(null);
        await loadMaterialRequestsData();
        await loadMaterialStocksData();
        await loadMaterialIssues();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.error || 'Failed to approve request');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to approve request');
    } finally {
      setIsSubmittingApproval(false);
    }
  };

  const handleRejectRequest = async (req: MaterialRequest) => {
    const reason = window.prompt('Enter rejection reason (optional):');
    if (reason === null) return; // cancelled
    try {
      const rejectedByName = user?.name || user?.username || 'Admin';
      const res = await fetch(`/api/material-requests/${req.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approvalNotes: reason.trim(),
          approvedBy: rejectedByName
        })
      });
      if (res.ok) {
        toast.success('Request rejected');
        await loadMaterialRequestsData();
      } else {
        toast.error('Failed to reject request');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to reject request');
    }
  };

  const loadOrdersData = async () => {
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

        // Keep only active order statuses
        const onlyOrders = withOrderNumbers.filter((q: any) => q.status === 'order');
        setOrders(onlyOrders);

        // Populate allOrdersMap
        const mapping: Record<string, string> = {};
        withOrderNumbers.forEach((q: any) => {
          mapping[q.id.toString()] = `#${q.orderNumber}`;
        });
        setAllOrdersMap(mapping);

        // Sync selectedOrderData with the latest data
        if (selectedOrderNumber) {
          const latestOrder = withOrderNumbers.find(o => o.orderNumber.toString() === selectedOrderNumber);
          if (latestOrder) {
            setSelectedOrderData(latestOrder);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch active orders for optimizer:", err);
    }
  };

  // Fetch all orders and material stocks on load
  useEffect(() => {
    loadOrdersData();
    loadMaterialStocksData();
    loadMaterialIssues();
    loadConfigData();
    loadMaterialRequestsData();
    loadMaterialTypeReorders();
    loadMaterialTypesData();
    loadReadyBeltStocksData();
  }, []);

  const bomComponentNames = useMemo(() => {
    const names = new Set<string>();
    if (config && Array.isArray(config.beltTypes)) {
      config.beltTypes.forEach((cat: any) => {
        if (Array.isArray(cat.styles)) {
          cat.styles.forEach((style: any) => {
            if (Array.isArray(style.bom)) {
              style.bom.forEach((item: any) => {
                if (item.name) names.add(item.name);
                if (Array.isArray(item.options)) {
                  item.options.forEach((opt: any) => {
                    if (opt.name) names.add(opt.name.trim());
                  });
                }
              });
            }
          });
        }
      });
    }
    return Array.from(names);
  }, [config]);

  // States for cut execution & leftover management popup
  const [showExecuteModal, setShowExecuteModal] = useState(false);
  const [multiCutPreview, setMultiCutPreview] = useState<any[] | null>(null);
  const [isLayoutFrozen, setIsLayoutFrozen] = useState(false);
  const [viewingSimulatedCutIndex, setViewingSimulatedCutIndex] = useState<number | null>(null);
  const [executingRoll, setExecutingRoll] = useState<Roll | null>(null);
  const [executingResult, setExecutingResult] = useState<any>(null);
  const [leftoverAction, setLeftoverAction] = useState<'keep_roll' | 'scrub' | 'inventory'>('keep_roll');
  const [leftoverWidthInput, setLeftoverWidthInput] = useState<string>('0');
  const [leftoverLengthInput, setLeftoverLengthInput] = useState<string>('0');
  const [isSplitLeftover, setIsSplitLeftover] = useState<boolean>(false);
  const [leftoverWidthInput2, setLeftoverWidthInput2] = useState<string>('0');
  const [leftoverLengthInput2, setLeftoverLengthInput2] = useState<string>('0');
  const [productionSearchQuery, setProductionSearchQuery] = useState<string>('');
  // Multi-cut sequential progress
  const [cutProgress, setCutProgress] = useState<{ current: number; total: number } | null>(null);

  // Tick every minute so Entry Date stays fresh
  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Sync with local database REST API
  const loadRollsData = async () => {
    try {
      const rollsData = await fetchRolls();
      if (rollsData) {
        setRolls(rollsData);
      }
      loadMaterialIssues();
    } catch (err) {
      console.error("Failed to load rolls:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleAddRollForm = () => {
    if (!showAddRollForm) {
      let maxNum = 100;
      rolls.forEach((r: any) => {
        const match = r.id.match(/^R-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxNum) {
            maxNum = num;
          }
        }
      });
      setNewRoll({
        id: `R-${maxNum + 1}`,
        materialType: MATERIAL_TYPES[0],
        fullWidth: 4,
        fullLength: 115
      });
    }
    setShowAddRollForm(!showAddRollForm);
  };

  useEffect(() => {
    setIsSyncing(true);
    loadRollsData();
    // Set up a polling interval for visual updates every 4 seconds
    const interval = setInterval(loadRollsData, 4000);
    return () => clearInterval(interval);
  }, []);

  const [selectedOrder, setSelectedOrder] = useState<Order>({
    id: `O-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    customerName: '',
    requiredWidth: 0,
    requiredLength: 0,
    quantity: 1,
    materialType: MATERIAL_TYPES[0],
    date: new Date().toISOString(),
    isInventoryCut: false,
    soNumber: ''
  });

  const [selectedLotNumber, setSelectedLotNumber] = useState('');

  useEffect(() => {
    setCuttingSelectedRollId('');
    setRollSearchQuery('');
    setSelectedLotNumber('');
  }, [selectedOrder.materialType]);

  useEffect(() => {
    setIsOrderDimensionsUnlocked(false);
  }, [selectedOrderNumber]);

  useEffect(() => {
    if (!selectedOrderNumber) {
      setSelectedOrderData(null);
      setSelectedItemIndex(null);
    }
  }, [selectedOrderNumber]);

  // Collect all cuts across all rolls
  const allCuts = useMemo(() => {
    const list: Cut[] = [];
    rolls.forEach(r => {
      if (r.cuts) {
        list.push(...r.cuts);
      }
    });
    return list;
  }, [rolls]);

  // Filter cuts for the current selected order
  const selectedOrderCuts = useMemo(() => {
    if (!selectedOrder.id) return [];
    return allCuts.filter(c => c.orderId === selectedOrder.id);
  }, [allCuts, selectedOrder.id]);

  // Check which items are completed
  const completedItemIndices = useMemo(() => {
    if (!selectedOrderData || !Array.isArray(selectedOrderData.items)) return new Set<number>();

    const completedSet = new Set<number>();
    const remainingCuts = [...selectedOrderCuts];

    const convertToMeters = (val: number, unit?: string) => {
      const u = (unit || 'mm').toLowerCase();
      if (u === 'mm') return val / 1000;
      if (u === 'ft') return val * 0.3048;
      if (u === 'in') return val * 0.0254;
      if (u === 'mtr' || u === 'm') return val;
      return val / 1000;
    };

    selectedOrderData.items.forEach((item: any, idx: number) => {
      const wMtr = convertToMeters(item.dimensions.width, item.dimensions.widthUnit || item.dimensions.unit);
      const lMtr = convertToMeters(item.dimensions.length, item.dimensions.lengthUnit || item.dimensions.unit);

      const matchIdx = remainingCuts.findIndex(c =>
        Math.abs(c.width - wMtr) < 0.002 &&
        Math.abs(c.length - lMtr) < 0.002
      );

      if (matchIdx !== -1) {
        completedSet.add(idx);
        remainingCuts.splice(matchIdx, 1);
      }
    });

    return completedSet;
  }, [selectedOrderData, selectedOrderCuts]);

  // Automatically select the next pending item when completedItemIndices or selectedOrderData updates
  useEffect(() => {
    if (cutPurpose === 'order' && selectedOrderData && Array.isArray(selectedOrderData.items) && selectedOrderData.items.length > 0) {
      if (justCutExecuted) {
        setJustCutExecuted(false);
        const nextPendingIdx = selectedOrderData.items.findIndex((_: any, idx: number) => !completedItemIndices.has(idx));

        if (nextPendingIdx !== -1) {
          setSelectedItemIndex(nextPendingIdx);
          const nextItem = selectedOrderData.items[nextPendingIdx];

          const convertToMeters = (val: number, unit?: string) => {
            const u = (unit || 'mm').toLowerCase();
            if (u === 'mm') return val / 1000;
            if (u === 'ft') return val * 0.3048;
            if (u === 'in') return val * 0.0254;
            if (u === 'mtr' || u === 'm') return val;
            return val / 1000;
          };

          const w = convertToMeters(nextItem.dimensions.width, nextItem.dimensions.widthUnit || nextItem.dimensions.unit || 'mm');
          const l = convertToMeters(nextItem.dimensions.length, nextItem.dimensions.lengthUnit || nextItem.dimensions.unit || 'mm');

          setSelectedOrder(prev => ({
            ...prev,
            requiredWidth: w,
            requiredLength: l,
            materialType: matchMaterialType(nextItem.beltType)
          }));
          toast.success(`Loaded next pending item #${nextPendingIdx + 1}: ${nextItem.dimensions.width}x${nextItem.dimensions.length}`);
        } else {
          toast.success(`All items in order ${selectedOrderNumber} have been successfully cut!`);
          setSelectedOrder({
            id: `O-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            customerName: '',
            requiredWidth: 0,
            requiredLength: 0,
            quantity: 1,
            materialType: selectedOrder.materialType,
            date: new Date().toISOString(),
            isInventoryCut: false,
            soNumber: ''
          });
          setSelectedOrderNumber('');
          setOrderSearchQuery('');
          setSelectedOrderData(null);
          setSelectedItemIndex(null);
        }
      }
    }
  }, [selectedOrderData, completedItemIndices, cutPurpose, justCutExecuted]);

  // Compute active dimensions (strictly horizontal: length along X-axis, width along Y-axis)
  const activeOrderDimensions = useMemo(() => {
    return {
      width: selectedOrder.requiredWidth,
      length: selectedOrder.requiredLength
    };
  }, [selectedOrder.requiredWidth, selectedOrder.requiredLength]);

  const [optimizationResults, setOptimizationResults] = useState<OptimizationCandidate[]>([]);
  const [currentOptionIndex, setCurrentOptionIndex] = useState(0);
  const [manualPlacement, setManualPlacement] = useState<{ rollId: string; placement: { x: number; y: number } } | null>(null);

  // Automatically calculate suggestions when order details or dimensions change
  // NOTE: Do NOT reset cuttingMode here —  that would break manual placement on every 4s poll
  useEffect(() => {
    const width = activeOrderDimensions.width;
    const length = activeOrderDimensions.length;

    if (width > 0 && length > 0) {
      setLastCutRollId(null);
      let activeRolls = rolls.filter(r => r.status !== 'refused');
      if ((cutPurpose === 'scrap' || cutPurpose === 'inventory') && cuttingSelectedRollId) {
        activeRolls = activeRolls.filter(r => r.id === cuttingSelectedRollId);
      }
      const results = findGlobalBestPlacement(activeRolls, {
        ...selectedOrder,
        requiredWidth: width,
        requiredLength: length
      });
      const top3 = results.slice(0, 3);
      setOptimizationResults(top3);
      // Preserve current user-selected option index if it is still within bounds of the new suggestions
      setCurrentOptionIndex(prev => prev < top3.length ? prev : 0);
      // Only switch to auto if not currently in manual mode
      setCuttingMode(prev => prev === 'manual' ? 'manual' : 'auto');
    } else {
      setOptimizationResults([]);
      setCurrentOptionIndex(0);
      setManualPlacement(null);
    }
  }, [
    activeOrderDimensions.width,
    activeOrderDimensions.length,
    selectedOrder.materialType,
    selectedOrder.isInventoryCut,
    rolls,
    cutPurpose,
    cuttingSelectedRollId
  ]);

  // Keyboard Arrow Keys listener for Manual Fit mode coordinates adjustment
  useEffect(() => {
    if (cuttingMode !== 'manual' || !manualPlacement) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in form inputs, textareas, or selects
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      const roll = rolls.find(r => r.id === manualPlacement.rollId);
      if (!roll) return;

      const reqWidth = activeOrderDimensions.width || 0;
      const reqLength = activeOrderDimensions.length || 0;
      if (reqWidth <= 0 || reqLength <= 0) return;

      let { x, y } = manualPlacement.placement;
      let moved = false;

      // Snap coordinates to 1mm grid
      x = Math.round(x * 1000) / 1000;
      y = Math.round(y * 1000) / 1000;

      // Shift key for fine 1mm adjustments, normal key for 1cm adjustments
      const step = e.shiftKey ? 0.001 : 0.01;

      if (e.key === 'ArrowLeft') {
        x = Math.max(0, x - step);
        moved = true;
      } else if (e.key === 'ArrowRight') {
        x = Math.min(roll.fullLength - reqLength, x + step);
        moved = true;
      } else if (e.key === 'ArrowUp') {
        y = Math.max(0, y - step);
        moved = true;
      } else if (e.key === 'ArrowDown') {
        y = Math.min(roll.fullWidth - reqWidth, y + step);
        moved = true;
      }

      if (moved) {
        e.preventDefault();
        const newX = Math.round(x * 1000) / 1000;
        const newY = Math.round(y * 1000) / 1000;
        setManualPlacement({
          rollId: roll.id,
          placement: { x: newX, y: newY }
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [cuttingMode, manualPlacement, rolls, activeOrderDimensions]);

  const visibleRolls = useMemo(() => {
    // In inventory/scrap mode with an explicitly selected roll,
    // bypass materialType filter so the roll always shows on first click
    const isTargetedMode = (cutPurpose === 'scrap' || cutPurpose === 'inventory') && !!cuttingSelectedRollId;

    let active = rolls.filter(r => {
      if (r.status === 'refused') return false;
      if (r.remainingSqm <= 0.01) return false;
      // When a specific target roll is selected, show it regardless of material type
      if (isTargetedMode) return r.id === cuttingSelectedRollId;
      return r.materialType === selectedOrder.materialType;
    });

    let list = [...active];
    list.sort((a, b) => {
      // 1. Prioritize last cut roll to be at the absolute top (index 0)
      if (lastCutRollId) {
        if (a.id === lastCutRollId) return -1;
        if (b.id === lastCutRollId) return 1;
      }

      // 2. Sort by optimization recommendations
      if (optimizationResults && optimizationResults.length > 0) {
        const recommendedIds = optimizationResults.map(res => res.rollId);
        const aIndex = recommendedIds.indexOf(a.id);
        const bIndex = recommendedIds.indexOf(b.id);

        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex; // keep recommendation order
        }
        if (aIndex !== -1) {
          return -1; // recommended first
        }
        if (bIndex !== -1) {
          return 1; // recommended first
        }
      }

      // 3. Prioritize remnants (reuse rolls) over fresh master rolls to minimize scrap
      const aReuse = isRollReuse(a);
      const bReuse = isRollReuse(b);
      if (aReuse && !bReuse) return -1;
      if (!aReuse && bReuse) return 1;

      return 0;
    });

    // Show at most 10 rolls in the visualization accordion
    return list.slice(0, 10);
  }, [rolls, selectedOrder.materialType, optimizationResults, lastCutRollId, cutPurpose, cuttingSelectedRollId]);

  // Set the first visible roll as expanded by default or keep the current one expanded if still visible
  useEffect(() => {
    if (visibleRolls.length > 0) {
      const stillVisible = visibleRolls.some(r => r.id === expandedRollId);
      if (!stillVisible) {
        setExpandedRollId(visibleRolls[0].id);
      }
    } else {
      setExpandedRollId(null);
    }
  }, [visibleRolls, expandedRollId]);

  // When a target roll is explicitly selected in inventory/scrap mode,
  // immediately expand and scroll to it (first-click fix)
  useEffect(() => {
    if (cuttingSelectedRollId && (cutPurpose === 'inventory' || cutPurpose === 'scrap')) {
      setExpandedRollId(cuttingSelectedRollId);
      setTimeout(() => {
        const element = document.getElementById(`roll-visualizer-${cuttingSelectedRollId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
    }
  }, [cuttingSelectedRollId, cutPurpose]);

  const stats = useMemo(() => {
    const activeRollsList = rolls.filter(r => r.status !== 'refused');
    const total = activeRollsList.reduce((acc, r) => acc + r.totalSqm, 0);
    const used = activeRollsList.reduce((acc, r) => acc + r.cuts.reduce((sum, c) => sum + (c.width * c.length), 0), 0);

    let calculatedWaste = 0;
    activeRollsList.forEach(r => {
      if (r.remainingSqm < r.totalSqm * 0.1) calculatedWaste += r.remainingSqm;
      else calculatedWaste += used * 0.02;
    });

    const factor = currentUnit === 'm' ? 1 : (CONVERSIONS[currentUnit] * CONVERSIONS[currentUnit]);

    const freshRollsCut = rolls.filter(r => !isRollReuse(r) && r.cuts && r.cuts.length > 0).length;
    const refusedRolls = rolls.filter(r => r.status === 'refused').length;

    return {
      totalAvailable: (total - used) * factor,
      efficiency: total > 0 ? (((used - calculatedWaste) / total) * 100).toFixed(1) : 0,
      activeRolls: activeRollsList.length,
      totalWastage: calculatedWaste * factor,
      freshRollsCut,
      refusedRolls
    };
  }, [rolls, currentUnit]);

  const currentResult = cuttingMode === 'auto' ? (optimizationResults[currentOptionIndex] || null) : manualPlacement;

  const handleSelectRecommendation = (idx: number) => {
    setCurrentOptionIndex(idx);
    setCuttingMode('auto');
    const candidate = optimizationResults[idx];
    if (candidate) {
      setExpandedRollId(candidate.rollId);
      setTimeout(() => {
        const element = document.getElementById(`roll-visualizer-${candidate.rollId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  };

  const getSmartLeftoverSuggestion = () => {
    if (!executingRoll) return { action: 'keep_roll', text: '' };
    const reqWidth = activeOrderDimensions.width || 0;
    const reqLength = activeOrderDimensions.length || 0;
    const remainingSqm = executingRoll.remainingSqm - (reqWidth * reqLength);
    const suggestedWidth = executingRoll.fullWidth || 0;
    const suggestedLength = suggestedWidth > 0 ? Math.max(0, remainingSqm / suggestedWidth) : 0;

    if (remainingSqm < 0.5 || suggestedLength < 0.3) {
      return {
        action: 'scrub',
        text: 'Since the remaining piece is extremely small or thin, we suggest sending it to Scrap.'
      };
    } else if (isRollReuse(executingRoll)) {
      return {
        action: 'inventory',
        text: 'The remaining piece is substantial and fits well as a standalone Remnant. We suggest putting it in Inventory.'
      };
    } else {
      return {
        action: 'keep_roll',
        text: 'The original roll is a fresh master roll. We suggest keeping the leftover in the active roll to maintain continuity.'
      };
    }
  };

  const toMeters = (val: number) => val / CONVERSIONS[currentUnit];
  const fromMeters = (val: number) => val * CONVERSIONS[currentUnit];

  const formatCutDim = (valInMeters: number): string => {
    const converted = fromMeters(valInMeters);
    if (currentUnit === 'm' || currentUnit === 'ft' || currentUnit === 'in') {
      return Number(converted.toFixed(2)).toString();
    }
    return Number(converted.toFixed(1)).toString();
  };

  const formatDisplayValue = (val: number): string => {
    if (val === 0) return '0';
    return val.toLocaleString(undefined, {
      maximumFractionDigits: 1,
      minimumFractionDigits: val % 1 === 0 ? 0 : 1
    });
  };

  const handleCalculateBestFit = () => {
    const isInventory = cutPurpose === 'inventory' || cutPurpose === 'scrap' || !!selectedOrder.isInventoryCut;
    if (!isInventory && !selectedOrder.customerName.trim()) {
      alert("Party Name is compulsory for client orders.");
      return;
    }
    setLastCutRollId(null);
    let activeRolls = rolls.filter(r => r.status !== 'refused');
    if ((cutPurpose === 'scrap' || cutPurpose === 'inventory') && cuttingSelectedRollId) {
      activeRolls = activeRolls.filter(r => r.id === cuttingSelectedRollId);
    }
    const results = findGlobalBestPlacement(activeRolls, {
      ...selectedOrder,
      requiredWidth: activeOrderDimensions.width,
      requiredLength: activeOrderDimensions.length
    });
    const top3 = results.slice(0, 3);
    setOptimizationResults(top3);
    setCurrentOptionIndex(0);
    setCuttingMode('auto');
    if (top3.length === 0) {
      alert("No suitable placement found in existing inventory remnants. Try adding a new roll.");
    } else {
      // Auto expand the top (best) candidate roll
      setExpandedRollId(top3[0].rollId);
      setTimeout(() => {
        const element = document.getElementById(`roll-visualizer-${top3[0].rollId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
  };

  const handleExecuteCutWithPlacement = async (result: any, targetRoll: Roll) => {
    try {
      const isInventory = cutPurpose === 'inventory' || cutPurpose === 'scrap' || !!selectedOrder.isInventoryCut;
      const clientName = (selectedOrder.customerName || '').trim();

      if (!isInventory && !clientName) {
        alert("Party Name is compulsory for Client Cuts. Please enter a Customer Name in the left panel.");
        return;
      }

      const reqWidth = activeOrderDimensions.width || 0;
      const reqLength = activeOrderDimensions.length || 0;
      if (reqWidth <= 0 || reqLength <= 0) {
        alert("Error: Dimensions must be greater than zero.");
        return;
      }

      if (!isSpaceAvailable(targetRoll, result.placement.x, result.placement.y, reqWidth, reqLength)) {
        alert("Selected placement is no longer valid. Please re-calculate.");
        return;
      }

      // Automatically determine the leftover action
      const remainingSqm = targetRoll.remainingSqm - (reqWidth * reqLength);
      const suggestedWidth = targetRoll.fullWidth || 0;
      const suggestedLength = suggestedWidth > 0 ? Math.max(0, remainingSqm / suggestedWidth) : 0;
      let autoAction: 'keep_roll' | 'scrub' | 'inventory' = 'keep_roll';

      if (remainingSqm < 0.5 || suggestedLength < 0.3) {
        autoAction = 'scrub';
      } else if (isRollReuse(targetRoll)) {
        autoAction = 'inventory';
      } else {
        autoAction = 'keep_roll';
      }

      await confirmExecuteCut(targetRoll, result, autoAction);
    } catch (err: any) {
      alert("Error executing cut: " + err?.message);
      console.error("Error in handleExecuteCutWithPlacement:", err);
    }
  };

  const handleExecuteCut = async () => {
    if (!currentResult) {
      alert("No placement has been selected. Please choose a placement first.");
      return;
    }

    const isInventory = cutPurpose === 'inventory' || cutPurpose === 'scrap' || !!selectedOrder.isInventoryCut;
    const clientName = (selectedOrder.customerName || '').trim();
    if (!isInventory && !clientName) {
      alert("Party Name is compulsory for Client Cuts. Please enter a Customer Name in the left panel.");
      return;
    }

    const reqWidth = activeOrderDimensions.width || 0;
    const reqLength = activeOrderDimensions.length || 0;
    if (reqWidth <= 0 || reqLength <= 0) {
      alert("Error: Dimensions must be greater than zero.");
      return;
    }

    const quantity = Math.max(1, selectedOrder.quantity || 1);

    // ── Single piece: existing flow ──────────────────────────────────────────
    if (quantity === 1) {
      const { rollId } = currentResult as any;
      const targetRoll = rolls.find(r => r.id === rollId);
      if (!targetRoll) return;

      if (!isSpaceAvailable(targetRoll, currentResult.placement.x, currentResult.placement.y, reqWidth, reqLength)) {
        alert("Selected placement is no longer valid for the current dimensions. Please re-calculate the fit.");
        return;
      }

      const remainingSqm = targetRoll.remainingSqm - (reqWidth * reqLength);
      const suggestedWidth = targetRoll.fullWidth || 0;
      const suggestedLength = suggestedWidth > 0 ? Math.max(0, remainingSqm / suggestedWidth) : 0;
      let autoAction: 'keep_roll' | 'scrub' | 'inventory' = 'keep_roll';
      if (remainingSqm < 0.5 || suggestedLength < 0.3) autoAction = 'scrub';
      else if (isRollReuse(targetRoll)) autoAction = 'inventory';

      await confirmExecuteCut(targetRoll, currentResult, autoAction);
      return;
    }

    // ── Multiple pieces: sequential simulation and preview ────────────────────────
    let activeRollsSim = rolls
      .filter(r => r.status !== 'refused')
      .map(r => ({ ...r, cuts: [...r.cuts] }));

    if ((cutPurpose === 'scrap' || cutPurpose === 'inventory') && cuttingSelectedRollId) {
      activeRollsSim = activeRollsSim.filter(r => r.id === cuttingSelectedRollId);
    }

    const previewList: any[] = [];

    for (let i = 0; i < quantity; i++) {
      const candidates = findGlobalBestPlacement(activeRollsSim, {
        ...selectedOrder,
        requiredWidth: reqWidth,
        requiredLength: reqLength
      });

      if (candidates.length === 0) {
        previewList.push({
          pieceIndex: i + 1,
          rollId: null,
          error: "No space left"
        });
        continue;
      }

      const best = candidates[0];
      const { rollId, placement } = best;
      const liveRoll = activeRollsSim.find(r => r.id === rollId);
      if (!liveRoll) continue;

      // Capture the state of the roll BEFORE this cut is added
      const rollStateBefore = {
        ...liveRoll,
        cuts: [...liveRoll.cuts]
      };

      const newRemaining = Math.max(0, liveRoll.remainingSqm - (reqWidth * reqLength));
      const shouldRefuse = newRemaining < 0.5 || (liveRoll.fullWidth > 0 && (newRemaining / liveRoll.fullWidth) < 0.3);

      previewList.push({
        pieceIndex: i + 1,
        rollId: rollId,
        materialType: liveRoll.materialType,
        rollWidth: liveRoll.fullWidth,
        rollLength: liveRoll.fullLength,
        x: placement.x,
        y: placement.y,
        width: reqWidth,
        length: reqLength,
        remainingSqmAfter: newRemaining,
        shouldRefuseAfter: shouldRefuse,
        rollStateBefore: rollStateBefore
      });

      // Update simulated roll state
      const tempCut: Cut = {
        id: `temp-${i}`,
        orderId: selectedOrder.id,
        customerName: 'temp',
        width: reqWidth,
        length: reqLength,
        x: placement.x,
        y: placement.y,
        status: 'completed',
        color: '#000',
        isInventoryCut: isInventory,
        soNumber: selectedOrder.soNumber || null
      };
      liveRoll.cuts.push(tempCut);
      liveRoll.remainingSqm = newRemaining;
      if (shouldRefuse) liveRoll.status = 'refused';
    }

    setMultiCutPreview(previewList);
  };

  const commitSinglePreviewCut = async (index: number) => {
    if (!multiCutPreview) return;
    const item = multiCutPreview[index];
    if (!item || !item.rollId || item.isExecuted) return;

    setIsSyncing(true);

    const isInventory = (cutPurpose as string) === 'inventory' || (cutPurpose as string) === 'scrap' || !!selectedOrder.isInventoryCut;
    const clientName = (selectedOrder.customerName || '').trim();
    const cutColor = isInventory ? '#1e293b' : ((cutPurpose as string) === 'scrap' ? '#ef4444' : CUT_COLORS[Math.floor(Math.random() * CUT_COLORS.length)]);
    const customerName = isInventory ? 'REUSE STOCK' : ((cutPurpose as string) === 'scrap' ? 'SCRAP WASTE' : clientName);

    const reqWidth = activeOrderDimensions.width || 0;
    const reqLength = activeOrderDimensions.length || 0;

    try {
      const newCut: Cut = {
        id: `C-${Date.now()}-${index}-${Math.floor(Math.random() * 10000)}`,
        orderId: selectedOrder.id,
        customerName,
        width: reqWidth,
        length: reqLength,
        x: item.x,
        y: item.y,
        status: 'completed',
        color: cutColor,
        isInventoryCut: isInventory,
        soNumber: selectedOrder.soNumber || null
      };

      // Persist to database
      await updateRoll(item.rollId, {
        remainingSqm: item.remainingSqmAfter,
        status: item.shouldRefuseAfter ? 'refused' : 'active'
      });
      await saveCut(item.rollId, newCut);

      // Auto leftover logic (keep_roll, scrub, inventory)
      const currentRoll = rolls.find(r => r.id === item.rollId);
      const autoAction = item.shouldRefuseAfter ? 'scrub' : (isRollReuse(currentRoll!) ? 'inventory' : 'keep_roll');

      // Create new remnant reusable roll in stock if action is inventory
      if (autoAction === 'inventory' && currentRoll) {
        const remainingLength = Math.max(0, currentRoll.fullLength - (item.x + reqLength));
        const leftoverW = currentRoll.fullWidth;
        const leftoverL = remainingLength;
        if (leftoverW > 0 && leftoverL > 0) {
          const newReuseRollId = `REUSE-${item.rollId}-${Date.now().toString().slice(-4)}`;
          const newReuseRoll = {
            id: newReuseRollId,
            materialType: currentRoll.materialType,
            fullWidth: leftoverW,
            fullLength: leftoverL,
            totalSqm: leftoverW * leftoverL,
            remainingSqm: leftoverW * leftoverL,
            isArchived: false,
            isReuse: true,
            parentRollId: item.rollId,
            status: 'active'
          };
          await saveRoll(newReuseRoll);
        }
      }

      // If it's an inventory cut, create new stock roll and issue material log
      if (isInventory && cutPurpose !== 'scrap' && currentRoll) {
        const newInvRollId = `REUSE-${item.rollId}-${newCut.id}`;
        const newInvRoll = {
          id: newInvRollId,
          materialType: currentRoll.materialType,
          fullWidth: newCut.width,
          fullLength: newCut.length,
          totalSqm: newCut.width * newCut.length,
          remainingSqm: newCut.width * newCut.length,
          isArchived: false,
          isReuse: true,
          parentRollId: item.rollId,
          status: 'active'
        };
        await saveRoll(newInvRoll);

        const matchingStock = materialStocks.find(s => s.name === currentRoll.materialType);
        const cutArea = parseFloat((newCut.width * newCut.length).toFixed(4));
        try {
          await fetch('/api/material-issues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              materialId: matchingStock?.id || '',
              materialName: currentRoll.materialType,
              quantity: cutArea,
              unit: matchingStock?.unit || 'sqm',
              issuedTo: 'REUSE STOCK',
              notes: `Auto-logged on inventory cut from parent Roll ${item.rollId}`,
              lotNumber: selectedLotNumber || undefined
            })
          });
          await loadMaterialStocksData();
          await loadMaterialIssues();
        } catch (issueErr) {
          console.error("Failed to auto-log material issue for inventory cut:", issueErr);
        }
      }

      // If it's a scrap cut, create a new refused roll in stock representing this scrap piece
      if (cutPurpose === 'scrap' && currentRoll) {
        const scrapRollId = `SCRAP-${item.rollId}-${Date.now().toString().slice(-5)}`;
        const scrapEntry = {
          id: scrapRollId,
          materialType: currentRoll.materialType,
          fullWidth: newCut.width,
          fullLength: newCut.length,
          totalSqm: newCut.width * newCut.length,
          remainingSqm: newCut.width * newCut.length,
          isArchived: false,
          isReuse: isRollReuse(currentRoll),
          parentRollId: item.rollId,
          status: 'refused'
        };
        await saveRoll(scrapEntry);
      }

      // Reload rolls
      await loadRollsData();
      setLastCutRollId(item.rollId);

      // Mark this cut as executed in multiCutPreview state
      setMultiCutPreview(prev => {
        if (!prev) return null;
        const updated = [...prev];
        updated[index] = { ...updated[index], isExecuted: true };
        return updated;
      });

      setViewingSimulatedCutIndex(null);
      toast.success(`✂️ Piece #${item.pieceIndex} cut executed successfully!`);
    } catch (err) {
      console.error('Error in single preview cut execution:', err);
      toast.error('Failed to execute cut. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  const commitMultiCuts = async (previewList: any[]) => {
    const remainingCuts = previewList.filter(p => p.rollId && !p.isExecuted);
    const totalRemaining = remainingCuts.length;

    if (totalRemaining === 0) {
      setMultiCutPreview(null);
      setViewingSimulatedCutIndex(null);
      setOptimizationResults([]);
      setCurrentOptionIndex(0);
      setManualPlacement(null);
      toast.success("✅ Multi-cut sequence completed successfully!");
      return;
    }

    setIsSyncing(true);
    setCutProgress({ current: 0, total: totalRemaining });
    setMultiCutPreview(null);
    setViewingSimulatedCutIndex(null);

    const isInventory = (cutPurpose as string) === 'inventory' || (cutPurpose as string) === 'scrap' || !!selectedOrder.isInventoryCut;
    const clientName = (selectedOrder.customerName || '').trim();
    const cutColor = isInventory ? '#1e293b' : ((cutPurpose as string) === 'scrap' ? '#ef4444' : CUT_COLORS[Math.floor(Math.random() * CUT_COLORS.length)]);
    const customerName = isInventory ? 'REUSE STOCK' : ((cutPurpose as string) === 'scrap' ? 'SCRAP WASTE' : clientName);

    const reqWidth = activeOrderDimensions.width || 0;
    const reqLength = activeOrderDimensions.length || 0;

    let cutsMade = 0;
    let lastUsedRollId: string | null = null;

    try {
      for (let i = 0; i < totalRemaining; i++) {
        const p = remainingCuts[i];
        setCutProgress({ current: i + 1, total: totalRemaining });

        const newCut: Cut = {
          id: `C-${Date.now()}-${i}-${Math.floor(Math.random() * 10000)}`,
          orderId: selectedOrder.id,
          customerName,
          width: reqWidth,
          length: reqLength,
          x: p.x,
          y: p.y,
          status: 'completed',
          color: cutColor,
          isInventoryCut: isInventory,
          soNumber: selectedOrder.soNumber || null
        };

        // Persist to database
        await updateRoll(p.rollId, {
          remainingSqm: p.remainingSqmAfter,
          status: p.shouldRefuseAfter ? 'refused' : 'active'
        });
        await saveCut(p.rollId, newCut);

        // Auto leftover logic (keep_roll, scrub, inventory)
        const currentRoll = rolls.find(r => r.id === p.rollId);
        const autoAction = p.shouldRefuseAfter ? 'scrub' : (isRollReuse(currentRoll!) ? 'inventory' : 'keep_roll');

        // Create new remnant reusable roll in stock if action is inventory
        if (autoAction === 'inventory' && currentRoll) {
          const remainingLength = Math.max(0, currentRoll.fullLength - (p.x + reqLength));
          const leftoverW = currentRoll.fullWidth;
          const leftoverL = remainingLength;
          if (leftoverW > 0 && leftoverL > 0) {
            const newReuseRollId = `REUSE-${p.rollId}-${Date.now().toString().slice(-4)}`;
            const newReuseRoll = {
              id: newReuseRollId,
              materialType: currentRoll.materialType,
              fullWidth: leftoverW,
              fullLength: leftoverL,
              totalSqm: leftoverW * leftoverL,
              remainingSqm: leftoverW * leftoverL,
              isArchived: false,
              isReuse: true,
              parentRollId: p.rollId,
              status: 'active'
            };
            await saveRoll(newReuseRoll);
          }
        }

        // If it's an inventory cut, create a new roll in stock representing this cut
        if (isInventory && cutPurpose !== 'scrap' && currentRoll) {
          const newInvRollId = `REUSE-${p.rollId}-${newCut.id}`;
          const newInvRoll = {
            id: newInvRollId,
            materialType: currentRoll.materialType,
            fullWidth: newCut.width,
            fullLength: newCut.length,
            totalSqm: newCut.width * newCut.length,
            remainingSqm: newCut.width * newCut.length,
            isArchived: false,
            isReuse: true,
            parentRollId: p.rollId,
            status: 'active'
          };
          await saveRoll(newInvRoll);

          // Log material issue to Production (Beltcut) for inventory cuts
          const matchingStock = materialStocks.find(s => s.name === currentRoll.materialType);
          const cutArea = parseFloat((newCut.width * newCut.length).toFixed(4));
          try {
            await fetch('/api/material-issues', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                materialId: matchingStock?.id || '',
                materialName: currentRoll.materialType,
                quantity: cutArea,
                unit: matchingStock?.unit || 'sqm',
                issuedTo: 'REUSE STOCK',
                notes: `Auto-logged on inventory cut from parent Roll ${p.rollId}`,
                lotNumber: selectedLotNumber || undefined
              })
            });
            await loadMaterialStocksData();
            await loadMaterialIssues();
          } catch (issueErr) {
            console.error("Failed to auto-log material issue for inventory cut:", issueErr);
          }
        }

        // If it's a scrap cut, create a new refused roll in stock representing this scrap piece
        if (cutPurpose === 'scrap' && currentRoll) {
          const scrapRollId = `SCRAP-${p.rollId}-${Date.now().toString().slice(-5)}`;
          const scrapEntry = {
            id: scrapRollId,
            materialType: currentRoll.materialType,
            fullWidth: newCut.width,
            fullLength: newCut.length,
            totalSqm: newCut.width * newCut.length,
            remainingSqm: newCut.width * newCut.length,
            isArchived: false,
            isReuse: isRollReuse(currentRoll),
            parentRollId: p.rollId,
            status: 'refused'
          };
          await saveRoll(scrapEntry);
        }

        lastUsedRollId = p.rollId;
        cutsMade++;
      }

      // One reload after all cuts
      await loadRollsData();
      if (lastUsedRollId) setLastCutRollId(lastUsedRollId);

      const allDone = cutsMade === totalRemaining;
      if (allDone) {
        toast.success(`✅ ${cutsMade} piece${cutsMade > 1 ? 's' : ''} cut successfully!`);
      } else {
        toast.warning(`⚠️ Only ${cutsMade} pieces cut successfully.`);
      }
      setJustCutExecuted(true);
    } catch (err) {
      console.error('Error in multi-cut execution:', err);
      toast.error('Failed to execute cuts. Please try again.');
    } finally {
      setCutProgress(null);
      setIsSyncing(false);
      setOptimizationResults([]);
      setCurrentOptionIndex(0);
      setManualPlacement(null);
      if (cutPurpose === 'order' && selectedOrderData && Array.isArray(selectedOrderData.items) && selectedOrderData.items.length > 0) {
        await loadOrdersData();
      } else {
        setSelectedOrder({
          id: `O-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          customerName: cutPurpose === 'inventory' ? 'REUSE STOCK' : (cutPurpose === 'scrap' ? 'SCRAP' : ''),
          requiredWidth: 0,
          requiredLength: 0,
          quantity: 1,
          materialType: selectedOrder.materialType,
          date: new Date().toISOString(),
          isInventoryCut: cutPurpose === 'inventory' || cutPurpose === 'scrap',
          soNumber: ''
        });
        setSelectedOrderNumber('');
        setOrderSearchQuery('');
        await loadOrdersData();
      }
    }
  };

  const confirmExecuteCut = async (
    targetRollOverride?: Roll,
    resultOverride?: any,
    actionOverride?: 'keep_roll' | 'scrub' | 'inventory'
  ) => {
    const currentRoll = targetRollOverride || executingRoll;
    const currentResultObj = resultOverride || executingResult;
    if (!currentRoll || !currentResultObj) return;

    setIsSyncing(true);

    const { rollId, placement } = currentResultObj;
    const cutDate = new Date().toISOString();

    const isInventory = cutPurpose === 'inventory' || cutPurpose === 'scrap' || !!selectedOrder.isInventoryCut;
    const newCut: Cut = {
      id: `C-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      orderId: selectedOrder.id,
      customerName: (cutPurpose === 'scrap') ? 'SCRAP WASTE' : (isInventory ? 'REUSE STOCK' : (selectedOrder.customerName || '').trim()),
      width: activeOrderDimensions.width,
      length: activeOrderDimensions.length,
      x: placement.x,
      y: placement.y,
      status: 'completed',
      color: (cutPurpose === 'scrap') ? '#ef4444' : (isInventory ? '#1e293b' : CUT_COLORS[Math.floor(Math.random() * CUT_COLORS.length)]),
      isInventoryCut: isInventory,
      soNumber: selectedOrder.soNumber || null
    };

    const currentAction = actionOverride || leftoverAction;

    try {
      const remainingSqm = currentRoll.remainingSqm - (newCut.width * newCut.length);
      const shouldRefuse = currentAction === 'scrub';

      // 1. Update the remaining area and status in the main roll
      await updateRoll(rollId, {
        remainingSqm: Math.max(0, remainingSqm),
        status: shouldRefuse ? 'refused' : 'active'
      });

      // 2. Save the new cut in the database
      await saveCut(rollId, newCut);

      if (cutPurpose === 'order' && selectedOrderNumber) {
        const itemsList = selectedOrderData?.items || [];
        const nextCutsCount = selectedOrderCuts.length + 1;
        const totalItemsCount = itemsList.length > 0 ? itemsList.length : 1;

        if (nextCutsCount >= totalItemsCount) {
          await fetch(`/api/quotations/${selectedOrder.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'executed' })
          });
        }
      }

      // 3. If action is inventory, create new remnant reusable roll in stock
      if (currentAction === 'inventory') {
        const remainingLength = Math.max(0, currentRoll.fullLength - (placement.x + newCut.length));
        const leftoverW = currentRoll.fullWidth;
        const leftoverL = remainingLength;
        if (leftoverW > 0 && leftoverL > 0) {
          const newReuseRollId = `REUSE-${rollId}-${Date.now().toString().slice(-4)}`;
          const newReuseRoll = {
            id: newReuseRollId,
            materialType: currentRoll.materialType,
            fullWidth: leftoverW,
            fullLength: leftoverL,
            totalSqm: leftoverW * leftoverL,
            remainingSqm: leftoverW * leftoverL,
            isArchived: false,
            isReuse: true,
            parentRollId: rollId,
            status: 'active'
          };
          await saveRoll(newReuseRoll);
        }
      }

      // 4. If it's an inventory cut, create a new roll in stock representing this cut
      if (isInventory && cutPurpose !== 'scrap') {
        const newInvRollId = `REUSE-${rollId}-${newCut.id}`;
        const newInvRoll = {
          id: newInvRollId,
          materialType: currentRoll.materialType,
          fullWidth: newCut.width,
          fullLength: newCut.length,
          totalSqm: newCut.width * newCut.length,
          remainingSqm: newCut.width * newCut.length,
          isArchived: false,
          isReuse: true,
          parentRollId: rollId,
          status: 'active'
        };
        await saveRoll(newInvRoll);

        // Also log a material issue to Production (Beltcut) for inventory cuts
        const matchingStock = materialStocks.find(s => s.name === currentRoll.materialType);
        const cutArea = parseFloat((newCut.width * newCut.length).toFixed(4));
        try {
          await fetch('/api/material-issues', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              materialId: matchingStock?.id || '',
              materialName: currentRoll.materialType,
              quantity: cutArea,
              unit: matchingStock?.unit || 'sqm',
              issuedTo: 'REUSE STOCK',
              notes: `Auto-logged on inventory cut from parent Roll ${rollId}`,
              lotNumber: selectedLotNumber || undefined
            })
          });
          await loadMaterialStocksData();
          await loadMaterialIssues();
        } catch (issueErr) {
          console.error("Failed to auto-log material issue for inventory cut:", issueErr);
        }
      }

      // 5. If it's a scrap cut, create a new refused roll in stock representing this scrap piece
      if (cutPurpose === 'scrap') {
        const scrapRollId = `SCRAP-${rollId}-${Date.now().toString().slice(-5)}`;
        const scrapEntry = {
          id: scrapRollId,
          materialType: currentRoll.materialType,
          fullWidth: newCut.width,
          fullLength: newCut.length,
          totalSqm: newCut.width * newCut.length,
          remainingSqm: newCut.width * newCut.length,
          isArchived: false,
          isReuse: isRollReuse(currentRoll),
          parentRollId: rollId,
          status: 'refused'
        };
        await saveRoll(scrapEntry);
      }

      toast.success("Cut executed and saved successfully!");
      await loadRollsData();
      setLastCutRollId(rollId);
      setJustCutExecuted(true);
    } catch (err) {
      console.error("Error executing cut:", err);
      alert("Failed to execute cut. Please try again.");
    } finally {
      setIsSyncing(false);
      setShowExecuteModal(false);
      setExecutingRoll(null);
      setExecutingResult(null);
      setOptimizationResults([]);
      setCurrentOptionIndex(0);
      setManualPlacement(null);
      setIsSplitLeftover(false);
      setLeftoverWidthInput2('0');
      setLeftoverLengthInput2('0');
      if (cutPurpose === 'order' && selectedOrderData && Array.isArray(selectedOrderData.items) && selectedOrderData.items.length > 0) {
        await loadOrdersData();
      } else {
        setSelectedOrder({
          id: `O-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          customerName: cutPurpose === 'inventory' ? 'REUSE STOCK' : (cutPurpose === 'scrap' ? 'SCRAP' : ''),
          requiredWidth: 0,
          requiredLength: 0,
          quantity: 1,
          materialType: selectedOrder.materialType,
          date: new Date().toISOString(),
          isInventoryCut: cutPurpose === 'inventory' || cutPurpose === 'scrap',
          soNumber: ''
        });
        setSelectedOrderNumber('');
        setOrderSearchQuery('');
        await loadOrdersData();
      }
    }
  };


  const handleAddRoll = async () => {
    setIsSyncing(true);
    const newRollEntry: Roll = {
      id: newRoll.id,
      materialType: newRoll.materialType,
      fullWidth: newRoll.fullWidth,
      fullLength: newRoll.fullLength,
      totalSqm: newRoll.fullWidth * newRoll.fullLength,
      remainingSqm: newRoll.fullWidth * newRoll.fullLength,
      isArchived: false,
      reorderLevel: 0,
      cuts: []
    };

    try {
      await saveRoll(newRollEntry);
      await loadRollsData();
      setShowAddRollForm(false);
      setNewRoll({
        id: '',
        materialType: MATERIAL_TYPES[0],
        fullWidth: 4,
        fullLength: 115
      });
    } catch (err) {
      console.error("Error adding roll:", err);
      alert(err instanceof Error ? err.message : "Failed to add roll. Please try again.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteRoll = async (rollId: string) => {
    if (window.confirm("Are you sure you want to delete this roll?")) {
      setIsSyncing(true);
      try {
        await deleteRoll(rollId);
        await loadRollsData();
      } catch (err) {
        console.error("Error deleting roll:", err);
        alert("Failed to delete roll. Please try again.");
      }
      setIsSyncing(false);
    }
  };

  const handleRefuseRoll = async (rollId: string) => {
    if (window.confirm("Are you sure you want to mark this roll as refused/waste? It will be removed from cutting operations but preserved in history.")) {
      setIsSyncing(true);
      try {
        await updateRoll(rollId, { status: 'refused' });
        await loadRollsData();
      } catch (err) {
        console.error("Error refusing roll:", err);
        alert("Failed to refuse roll. Please try again.");
      }
      setIsSyncing(false);
    }
  };

  const handleDeleteCut = async (rollId: string, cut: Cut) => {
    const targetRollId = (cut as any).parentRollId || rollId;
    const sizeStr = `${fromMeters(cut.length).toFixed(1)}${currentUnit} x ${fromMeters(cut.width).toFixed(1)}${currentUnit}`;
    const confirmMsg = `Are you sure you want to delete the cut for client "${cut.customerName}" (${sizeStr}) on roll "${targetRollId}"?\nThis will restore the roll area.`;
    if (window.confirm(confirmMsg)) {
      setIsSyncing(true);
      try {
        await deleteCut(targetRollId, cut.id);
        await loadRollsData();
      } catch (err) {
        console.error("Error deleting cut:", err);
        alert("Failed to delete cut. Please try again.");
      }
      setIsSyncing(false);
    }
  };

  const handleRestoreRoll = async (rollId: string) => {
    if (window.confirm("Are you sure you want to restore this roll to active stock?")) {
      setIsSyncing(true);
      try {
        await updateRoll(rollId, { status: 'active' });
        await loadRollsData();
      } catch (err) {
        console.error("Error restoring roll:", err);
        alert("Failed to restore roll. Please try again.");
      }
      setIsSyncing(false);
    }
  };

  const handlePrintRollAllocations = (rollId: string) => {
    const roll = rolls.find(r => r.id === rollId);
    if (!roll) return;
    const cuts = getResolvedRollCuts(roll, rolls);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Pop-up blocker active. Please allow popups for printing.");
      return;
    }

    const cutsRows = cuts.map((cut, idx) => {
      let dateStr = 'N/A';
      const tsMatch = cut.id.match(/C-(\d+)/);
      if (tsMatch) {
        const d = new Date(parseInt(tsMatch[1], 10));
        if (!isNaN(d.getTime())) {
          dateStr = `${d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
        }
      }
      const lenVal = fromMeters(cut.length).toFixed(1);
      const widVal = fromMeters(cut.width).toFixed(1);
      return `
        <tr>
          <td>#${idx + 1}</td>
          <td>${isInventoryCutName(cut.customerName) ? 'REUSE STOCK' : (cut.customerName || 'N/A')}</td>
          <td>${cut.id.substring(0, 12)}</td>
          <td>${lenVal}${currentUnit} x ${widVal}${currentUnit}</td>
          <td>${cut.isInventoryCut ? 'REUSE' : 'CLIENT'}</td>
          <td>${dateStr}</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Client Allocations - Roll ${rollId}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Outfit', sans-serif; padding: 20px; color: #1e293b; }
            .print-header {
              display: flex;
              align-items: center;
              gap: 15px;
              border-bottom: 3px double #cbd5e1;
              padding-bottom: 15px;
              margin-bottom: 20px;
            }
            .logo {
              width: 45px;
              height: 45px;
              color: #1e293b;
              flex-shrink: 0;
            }
            .company-info {
              display: flex;
              flex-direction: column;
            }
            .company-name {
              font-size: 22px;
              font-weight: 900;
              color: #0f172a;
              letter-spacing: -0.5px;
              text-transform: uppercase;
            }
            .company-tagline {
              font-size: 10px;
              color: #64748b;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-top: 1px;
            }
            .document-title {
              display: flex;
              justify-content: space-between;
              align-items: baseline;
              margin-top: 10px;
              margin-bottom: 15px;
            }
            .document-title h2 {
              font-size: 14px;
              text-transform: uppercase;
              font-weight: 800;
              color: #1e293b;
              margin: 0;
            }
            .print-date {
              font-size: 10px;
              color: #64748b;
              font-weight: 700;
            }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 11px; }
            th { background: #f8fafc; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="print-header">
            <svg class="logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <div class="company-info">
              <div class="company-name">POOJA TEKNO BELT</div>
              <div class="company-tagline">Premium Belt Cutting & Optimization Nesting Portal</div>
            </div>
          </div>
          <div class="document-title">
            <h2>Client Allocations - Roll ${rollId}</h2>
            <span class="print-date">Printed on: ${new Date().toLocaleString()}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>S.No</th>
                <th>Client Name</th>
                <th>Cut ID</th>
                <th>Dimensions</th>
                <th>Type</th>
                <th>Date & Time</th>
              </tr>
            </thead>
            <tbody>
              ${cutsRows || '<tr><td colspan="6" style="text-align:center;">No cuts allocated yet.</td></tr>'}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handlePrintRollLayout = (rollId: string) => {
    const roll = rolls.find(r => r.id === rollId);
    if (!roll) return;
    const cuts = roll.cuts || [];

    // Find visualizer container (either the fullscreen modal's or the dashboard one)
    const container = document.getElementById(`roll-visualizer-${rollId}`);
    const svgEl = container?.querySelector('svg.roll-layout-svg');
    if (!svgEl) {
      alert("Visualizer layout not found. Please make sure the roll is expanded and visible.");
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Pop-up blocker active. Please allow popups for printing.");
      return;
    }

    // Clone the SVG and customize for print
    const svgClone = svgEl.cloneNode(true) as SVGElement;
    // Set unscaled dimensions for high resolution scaling on paper
    const unscaledWidth = roll.fullLength * 35 + 55;
    const unscaledHeight = roll.fullWidth * 35 + 55 + 40;
    svgClone.setAttribute('width', unscaledWidth.toString());
    svgClone.setAttribute('height', unscaledHeight.toString());

    svgClone.style.width = '100%';
    svgClone.style.height = 'auto';
    svgClone.style.maxWidth = '100%';
    svgClone.style.maxHeight = 'none'; // Ensure whole nesting height is printed
    // Remove pointer cursor or interactive classes
    svgClone.removeAttribute('class');

    const svgHtml = svgClone.outerHTML;

    // Generate cut table rows
    const cutsRows = cuts.map((cut, idx) => {
      let dateStr = 'N/A';
      const tsMatch = cut.id.match(/C-(\d+)/);
      if (tsMatch) {
        const d = new Date(parseInt(tsMatch[1], 10));
        if (!isNaN(d.getTime())) {
          dateStr = `${d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
        }
      }
      const lenVal = fromMeters(cut.length).toFixed(1);
      const widVal = fromMeters(cut.width).toFixed(1);
      return `
        <tr>
          <td>#${idx + 1}</td>
          <td>${isInventoryCutName(cut.customerName) ? 'REUSE STOCK' : (cut.customerName || 'N/A')}${cut.soNumber ? ` (${cut.soNumber})` : ''}</td>
          <td>${cut.id.substring(0, 12)}</td>
          <td>${lenVal}${currentUnit} x ${widVal}${currentUnit}</td>
          <td>${cut.isInventoryCut ? 'REUSE' : 'CLIENT'}</td>
          <td>${dateStr}</td>
        </tr>
      `;
    }).join('');

    const lenVal = fromMeters(roll.fullLength).toFixed(1);
    const widVal = fromMeters(roll.fullWidth).toFixed(1);
    const efficiencyVal = roll.cuts.length > 0 ? (roll.efficiency || 0).toFixed(1) : '0';

    printWindow.document.write(`
      <html>
        <head>
          <title>Roll Layout Manifest - Roll ${rollId}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Outfit', sans-serif; padding: 25px; color: #1e293b; line-height: 1.5; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .no-print { display: none; }
            }
            .print-header {
              display: flex;
              align-items: center;
              gap: 15px;
              border-bottom: 3px double #cbd5e1;
              padding-bottom: 15px;
              margin-bottom: 20px;
            }
            .logo {
              width: 45px;
              height: 45px;
              color: #1e293b;
              flex-shrink: 0;
            }
            .company-info {
              display: flex;
              flex-direction: column;
            }
            .company-name {
              font-size: 22px;
              font-weight: 900;
              color: #0f172a;
              letter-spacing: -0.5px;
              text-transform: uppercase;
            }
            .company-tagline {
              font-size: 10px;
              color: #64748b;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-top: 1px;
            }
            .document-title {
              display: flex;
              justify-content: space-between;
              align-items: baseline;
              margin-bottom: 20px;
            }
            .document-title h2 {
              font-size: 16px;
              text-transform: uppercase;
              font-weight: 800;
              color: #0f172a;
              margin: 0;
            }
            .print-date {
              font-size: 10px;
              color: #64748b;
              font-weight: 700;
            }
            .stats-grid {
              display: flex;
              flex-direction: row;
              flex-wrap: nowrap;
              width: 100%;
              gap: 15px;
              margin-bottom: 25px;
            }
            .stat-card {
              flex: 1;
              min-width: 0;
              border: 1px solid #e2e8f0;
              border-left: 4px solid #cbd5e1;
              border-radius: 12px;
              padding: 14px 16px;
              background: #f8fafc;
              box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
            }
            .card-material { border-left-color: #6366f1; }
            .card-dimensions { border-left-color: #3b82f6; }
            .card-efficiency { border-left-color: #10b981; }
            .card-cuts { border-left-color: #f59e0b; }
            
            .stat-label {
              font-size: 9px;
              text-transform: uppercase;
              color: #64748b;
              font-weight: 800;
              letter-spacing: 0.5px;
              margin-bottom: 4px;
            }
            .stat-value {
              font-size: 15px;
              font-weight: 800;
              color: #0f172a;
            }
            .visualizer-section {
              border: 1px solid #cbd5e1;
              border-radius: 12px;
              padding: 15px;
              margin-bottom: 25px;
              background: #ffffff;
              display: flex;
              justify-content: center;
            }
            .section-title {
              font-size: 11px;
              text-transform: uppercase;
              font-weight: 800;
              color: #475569;
              margin-bottom: 10px;
              border-bottom: 1px solid #e2e8f0;
              padding-bottom: 5px;
            }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 11px; }
            th { background: #f8fafc; font-weight: 800; text-transform: uppercase; font-size: 10px; color: #475569; }
          </style>
        </head>
        <body>
          <div class="print-header">
            <svg class="logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <div class="company-info">
              <div class="company-name">POOJA TEKNO BELT</div>
              <div class="company-tagline">Premium Belt Cutting & Optimization Nesting Portal</div>
            </div>
          </div>
          
          <div class="document-title">
            <h2>Roll Layout & Allocations - Roll ${rollId}</h2>
            <span class="print-date">Printed on: ${new Date().toLocaleString()}</span>
          </div>

          <div class="stats-grid">
            <div class="stat-card card-material">
              <div class="stat-label">Material Type</div>
              <div class="stat-value">${roll.materialType}</div>
            </div>
            <div class="stat-card card-dimensions">
              <div class="stat-label">Dimensions</div>
              <div class="stat-value">${lenVal}${currentUnit} x ${widVal}${currentUnit}</div>
            </div>
            <div class="stat-card card-efficiency">
              <div class="stat-label">Efficiency</div>
              <div class="stat-value" style="color: #10b981;">${efficiencyVal}%</div>
            </div>
            <div class="stat-card card-cuts">
              <div class="stat-label">Allocated Cuts</div>
              <div class="stat-value">${cuts.length}</div>
            </div>
          </div>

          <div class="section-title">Layout Visualization</div>
          <div class="visualizer-section">
            ${svgHtml}
          </div>

          <div class="section-title">Cuts Allocation Table</div>
          <table>
            <thead>
              <tr>
                <th>S.No</th>
                <th>Client Name</th>
                <th>Cut ID</th>
                <th>Dimensions</th>
                <th>Type</th>
                <th>Date & Time</th>
              </tr>
            </thead>
            <tbody>
              ${cutsRows || '<tr><td colspan="6" style="text-align:center;">No cuts allocated yet.</td></tr>'}
            </tbody>
          </table>

          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 500);
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleExportCSV = (rollId: string) => {
    const roll = rolls.find(r => r.id === rollId);
    if (!roll) return;
    const cuts = getResolvedRollCuts(roll, rolls);

    const headers = ['S.No', 'Client Name', 'Cut ID', 'Length', 'Width', 'Unit', 'Type', 'Date & Time'];
    const rows = cuts.map((cut, idx) => {
      let dateStr = 'N/A';
      const tsMatch = cut.id.match(/C-(\d+)/);
      if (tsMatch) {
        const d = new Date(parseInt(tsMatch[1], 10));
        if (!isNaN(d.getTime())) {
          dateStr = d.toLocaleString('en-IN');
        }
      }
      return [
        idx + 1,
        `"${isInventoryCutName(cut.customerName) ? 'REUSE STOCK' : (cut.customerName || '')}${cut.soNumber ? ` (${cut.soNumber})` : ''}"`,
        cut.id,
        fromMeters(cut.length).toFixed(2),
        fromMeters(cut.width).toFixed(2),
        currentUnit,
        cut.isInventoryCut ? 'REUSE' : 'CLIENT',
        `"${dateStr}"`
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Roll_${rollId}_Allocations.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportClientCSV = () => {
    if (!selectedClientName) return;
    const clientData = clientCutsList.find(c => c.customerName === selectedClientName);
    if (!clientData) return;
    const cuts = clientData.cuts || [];

    const headers = ['Order No.', 'Cut ID', 'Length', 'Width', 'Unit', 'Material', 'Source Roll', 'Date & Time'];
    const rows = cuts.map((item, idx) => {
      let dateStr = 'N/A';
      const tsMatch = item.cut.id.match(/C-(\d+)/);
      if (tsMatch) {
        const d = new Date(parseInt(tsMatch[1], 10));
        if (!isNaN(d.getTime())) {
          dateStr = d.toLocaleString('en-IN');
        }
      }
      return [
        allOrdersMap[item.cut.orderId] || (item.cut.soNumber ? `Manual (${item.cut.soNumber})` : 'Manual'),
        item.cut.id,
        fromMeters(item.cut.length).toFixed(2),
        fromMeters(item.cut.width).toFixed(2),
        currentUnit,
        `"${item.rollMaterial || ''}"`,
        item.rollId,
        `"${dateStr}"`
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8,"
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${selectedClientName.replace(/\s+/g, '_')}_Cuts_History.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrintClientCuts = () => {
    if (!selectedClientName) return;
    const clientData = clientCutsList.find(c => c.customerName === selectedClientName);
    if (!clientData) return;
    const cuts = clientData.cuts || [];

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Pop-up blocker active. Please allow popups for printing.");
      return;
    }

    const cutsRows = cuts.map((item, idx) => {
      let dateStr = 'N/A';
      const tsMatch = item.cut.id.match(/C-(\d+)/);
      if (tsMatch) {
        const d = new Date(parseInt(tsMatch[1], 10));
        if (!isNaN(d.getTime())) {
          dateStr = `${d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
        }
      }
      const lenVal = fromMeters(item.cut.length).toFixed(1);
      const widVal = fromMeters(item.cut.width).toFixed(1);
      return `
        <tr>
          <td>${allOrdersMap[item.cut.orderId] || (item.cut.soNumber ? `Manual (${item.cut.soNumber})` : 'Manual')}</td>
          <td>${item.cut.id.substring(0, 12)}</td>
          <td>${lenVal}${currentUnit} x ${widVal}${currentUnit}</td>
          <td>${item.rollMaterial || 'N/A'}</td>
          <td>${item.rollId}</td>
          <td>${dateStr}</td>
        </tr>
      `;
    }).join('');

    printWindow.document.write(`
      <html>
        <head>
          <title>Cuts History - ${selectedClientName}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
          <style>
            body { font-family: 'Outfit', sans-serif; padding: 20px; color: #1e293b; }
            .print-header {
              display: flex;
              align-items: center;
              gap: 15px;
              border-bottom: 3px double #cbd5e1;
              padding-bottom: 15px;
              margin-bottom: 20px;
            }
            .logo {
              width: 45px;
              height: 45px;
              color: #1e293b;
              flex-shrink: 0;
            }
            .company-info {
              display: flex;
              flex-direction: column;
            }
            .company-name {
              font-size: 22px;
              font-weight: 900;
              color: #0f172a;
              letter-spacing: -0.5px;
              text-transform: uppercase;
            }
            .company-tagline {
              font-size: 10px;
              color: #64748b;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              margin-top: 1px;
            }
            .document-title {
              display: flex;
              justify-content: space-between;
              align-items: baseline;
              margin-top: 10px;
              margin-bottom: 15px;
            }
            .document-title h2 {
              font-size: 14px;
              text-transform: uppercase;
              font-weight: 800;
              color: #1e293b;
              margin: 0;
            }
            .print-date {
              font-size: 10px;
              color: #64748b;
              font-weight: 700;
            }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; font-size: 11px; }
            th { background: #f8fafc; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="print-header">
            <svg class="logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
            <div class="company-info">
              <div class="company-name">POOJA TEKNO BELT</div>
              <div class="company-tagline">Premium Belt Cutting & Optimization Nesting Portal</div>
            </div>
          </div>
          <div class="document-title">
            <h2>Cuts History - ${selectedClientName}</h2>
            <span class="print-date">Printed on: ${new Date().toLocaleString()}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Order No.</th>
                <th>Cut ID</th>
                <th>Dimensions</th>
                <th>Material</th>
                <th>Source Roll</th>
                <th>Date & Time</th>
              </tr>
            </thead>
            <tbody>
              ${cutsRows || '<tr><td colspan="6" style="text-align:center;">No cuts found.</td></tr>'}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Group cuts by client for Details Registry
  const clientCutsList = useMemo(() => {
    const clientCutsMap: Record<string, { customerName: string; cuts: { cut: Cut; rollId: string; rollMaterial: string }[] }> = {};
    rolls.forEach(r => {
      r.cuts.forEach(c => {
        const trimmedName = (c.customerName || '').trim();
        if (!trimmedName || isInventoryCutName(trimmedName) || trimmedName === 'SCRAP WASTE') {
          return;
        }
        const clientKey = trimmedName;
        if (!clientCutsMap[clientKey]) {
          clientCutsMap[clientKey] = {
            customerName: clientKey,
            cuts: []
          };
        }
        clientCutsMap[clientKey].cuts.push({
          cut: { ...c, customerName: trimmedName },
          rollId: r.id,
          rollMaterial: r.materialType
        });
      });
    });
    return Object.values(clientCutsMap).sort((a, b) => a.customerName.localeCompare(b.customerName));
  }, [rolls]);

  const filteredClientCutsList = useMemo(() => {
    if (!tableSearchQuery) return clientCutsList;
    const query = tableSearchQuery.toLowerCase();
    return clientCutsList.filter(client => {
      const matchClient = client.customerName.toLowerCase().includes(query);
      const matchCuts = client.cuts.some(c =>
        c.rollId.toLowerCase().includes(query) ||
        c.rollMaterial.toLowerCase().includes(query)
      );
      return matchClient || matchCuts;
    });
  }, [clientCutsList, tableSearchQuery]);

  const filteredOverviewRolls = useMemo(() => {
    const activeRolls = rolls.filter(r => r.status !== 'refused');
    if (!overviewSearchQuery.trim()) return activeRolls;
    const query = overviewSearchQuery.toLowerCase().trim();
    return activeRolls.filter(roll => {
      const matchRollId = roll.id.toLowerCase().includes(query);
      const matchMaterial = roll.materialType.toLowerCase().includes(query);
      const matchClient = roll.cuts.some(cut => cut.customerName?.toLowerCase().includes(query));
      return matchRollId || matchMaterial || matchClient;
    });
  }, [rolls, overviewSearchQuery]);

  const filteredStockRolls = useMemo(() => {
    const activeRolls = rolls.filter(r => r.status !== 'refused');
    if (!tableSearchQuery) return activeRolls;
    const query = tableSearchQuery.toLowerCase();
    return activeRolls.filter(roll =>
      roll.id.toLowerCase().includes(query) ||
      roll.materialType.toLowerCase().includes(query) ||
      fromMeters(roll.fullLength).toFixed(1).includes(query) ||
      fromMeters(roll.fullWidth).toFixed(1).includes(query)
    );
  }, [rolls, tableSearchQuery, currentUnit]);

  const filteredMaterialStocks = useMemo(() => {
    if (!tableSearchQuery) return materialStocks;
    const query = tableSearchQuery.toLowerCase();
    return materialStocks.filter(stock =>
      stock.name.toLowerCase().includes(query) ||
      stock.unit.toLowerCase().includes(query)
    );
  }, [materialStocks, tableSearchQuery]);

  const filteredMaterialStocksList = useMemo(() => {
    if (!materialSearchQuery) return materialStocks;
    const query = materialSearchQuery.toLowerCase().trim();
    return materialStocks.filter(stock =>
      (stock.name || '').toLowerCase().includes(query) ||
      (stock.unit || '').toLowerCase().includes(query)
    );
  }, [materialStocks, materialSearchQuery]);

  const filteredReadyBeltStocksList = useMemo(() => {
    if (!readyBeltSearchQuery) return readyBeltStocks;
    const query = readyBeltSearchQuery.toLowerCase().trim();
    return readyBeltStocks.filter(item =>
      (item.category || '').toLowerCase().includes(query) ||
      (item.beltStock || '').toLowerCase().includes(query) ||
      (item.size || '').toLowerCase().includes(query) ||
      (item.soNo || '').toLowerCase().includes(query) ||
      (item.receiverName || '').toLowerCase().includes(query)
    );
  }, [readyBeltStocks, readyBeltSearchQuery]);

  const readyBeltGroups = useMemo(() => {
    const groups: Record<string, ReadyBeltStock[]> = {};
    filteredReadyBeltStocksList.forEach(item => {
      const cat = item.category || 'OTHER';
      if (!groups[cat]) {
        groups[cat] = [];
      }
      groups[cat].push(item);
    });
    return groups;
  }, [filteredReadyBeltStocksList]);

  const filteredRemnantRollsList = useMemo(() => {
    const activeRemnants = rolls.filter(r => r.status !== 'refused' && isRollReuse(r));
    if (!remnantSearchQuery) return activeRemnants;
    const query = remnantSearchQuery.toLowerCase().trim();
    return activeRemnants.filter(roll =>
      roll.id.toLowerCase().includes(query) ||
      roll.materialType.toLowerCase().includes(query) ||
      fromMeters(roll.fullLength).toFixed(1).includes(query) ||
      fromMeters(roll.fullWidth).toFixed(1).includes(query)
    );
  }, [rolls, remnantSearchQuery, currentUnit]);

  const filteredFreshRollsList = useMemo(() => {
    const activeFresh = rolls.filter(r => r.status !== 'refused' && !isRollReuse(r));
    const sorted = [...activeFresh].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));
    if (!freshRollSearchQuery) return sorted;
    const query = freshRollSearchQuery.toLowerCase().trim();
    return sorted.filter(roll =>
      roll.id.toLowerCase().includes(query) ||
      roll.materialType.toLowerCase().includes(query) ||
      fromMeters(roll.fullLength).toFixed(1).includes(query) ||
      fromMeters(roll.fullWidth).toFixed(1).includes(query)
    );
  }, [rolls, freshRollSearchQuery, currentUnit]);

  const filteredReorderItemsList = useMemo(() => {
    if (!reorderSearchQuery) return materialStocks;
    const query = reorderSearchQuery.toLowerCase().trim();
    return materialStocks.filter(stock =>
      (stock.name || '').toLowerCase().includes(query) ||
      (stock.unit || '').toLowerCase().includes(query)
    );
  }, [materialStocks, reorderSearchQuery]);

  const filteredRollReorderList = useMemo(() => {
    const activeFresh = rolls.filter(r => r.status !== 'refused' && !isRollReuse(r));
    const sorted = [...activeFresh].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));
    if (!rollReorderSearchQuery) return sorted;
    const query = rollReorderSearchQuery.toLowerCase().trim();
    return sorted.filter(roll =>
      (roll.id || '').toLowerCase().includes(query) ||
      (roll.materialType || '').toLowerCase().includes(query)
    );
  }, [rolls, rollReorderSearchQuery]);

  const materialTypeStocks = useMemo(() => {
    const activeFresh = rolls.filter(r => r.status !== 'refused' && !isRollReuse(r));
    const types = new Set<string>(MATERIAL_TYPES);
    activeFresh.forEach(r => {
      if (r.materialType) types.add(r.materialType);
    });

    return Array.from(types).map(type => {
      const typeRolls = activeFresh.filter(r => r.materialType === type);
      const totalSqm = typeRolls.reduce((sum, r) => sum + r.remainingSqm, 0);
      const trigger = materialTypeReorders[type] || 0;
      const isLow = trigger > 0 && totalSqm <= trigger;
      return {
        materialType: type,
        totalSqm,
        reorderLevel: trigger,
        isLow
      };
    }).sort((a, b) => a.materialType.localeCompare(b.materialType));
  }, [rolls, materialTypeReorders]);

  const filteredMaterialIssues = useMemo(() => {
    // Only show material issues representing requested items (exclude system logs)
    const productionRecords = materialIssues.filter(issue =>
      issue.issuedTo !== 'REUSE STOCK' &&
      issue.issuedTo !== 'REJECTED / WASTE'
    );

    if (!productionSearchQuery) return productionRecords;
    const query = productionSearchQuery.toLowerCase().trim();
    return productionRecords.filter(issue =>
      (issue.materialName || '').toLowerCase().includes(query) ||
      (issue.issuedTo || '').toLowerCase().includes(query) ||
      (issue.notes || '').toLowerCase().includes(query)
    );
  }, [materialIssues, productionSearchQuery]);

  const filteredScrubRolls = useMemo(() => {
    const refusedRolls = rolls.filter(r => r.status === 'refused');
    if (!tableSearchQuery) return refusedRolls;
    const query = tableSearchQuery.toLowerCase();
    return refusedRolls.filter(roll =>
      roll.id.toLowerCase().includes(query) ||
      roll.materialType.toLowerCase().includes(query) ||
      fromMeters(roll.fullLength).toFixed(1).includes(query) ||
      fromMeters(roll.fullWidth).toFixed(1).includes(query)
    );
  }, [rolls, tableSearchQuery, currentUnit]);

  const filteredRollsMapList = useMemo(() => {
    if (!tableSearchQuery) return rolls;
    const query = tableSearchQuery.toLowerCase();
    return rolls.filter(roll => {
      const matchRoll =
        roll.id.toLowerCase().includes(query) ||
        roll.materialType.toLowerCase().includes(query) ||
        fromMeters(roll.fullLength).toFixed(1).includes(query) ||
        fromMeters(roll.fullWidth).toFixed(1).includes(query);

      const matchClients = roll.cuts.some(c =>
        (c.customerName || '').toLowerCase().includes(query)
      );

      return matchRoll || matchClients;
    });
  }, [rolls, tableSearchQuery, currentUnit]);

  const existingPartyNames = useMemo(() => {
    return clientCutsList.map(c => c.customerName).filter(Boolean);
  }, [clientCutsList]);

  const partySuggestions = useMemo(() => {
    const input = (selectedOrder.customerName || '').trim().toLowerCase();
    if (!input) return [];
    return existingPartyNames.filter(name =>
      name.toLowerCase().includes(input) &&
      name.toLowerCase() !== input
    );
  }, [existingPartyNames, selectedOrder.customerName]);

  const isExactPartyMatch = useMemo(() => {
    const input = (selectedOrder.customerName || '').trim().toLowerCase();
    if (!input) return false;
    return existingPartyNames.some(name => name.toLowerCase() === input);
  }, [existingPartyNames, selectedOrder.customerName]);

  const areaUnit = currentUnit === 'm' ? 'm²' : `${currentUnit}²`;
  return (
    <div className="flex h-screen bg-zinc-50 overflow-hidden relative w-full text-slate-900">
      {isSyncing && (
        <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] z-50 flex items-center justify-center">
          <div className="bg-slate-900 text-white px-6 py-5 rounded-2xl shadow-2xl flex flex-col items-center gap-3 min-w-[260px]">
            <div className="flex items-center gap-3">
              <Loader2 className="animate-spin text-blue-400" />
              <span className="font-black text-xs uppercase tracking-widest">
                {cutProgress
                  ? `Cutting piece ${cutProgress.current} of ${cutProgress.total}...`
                  : 'Syncing with Database...'}
              </span>
            </div>
            {cutProgress && cutProgress.total > 1 && (
              <div className="w-full bg-slate-700 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full bg-emerald-400 transition-all duration-300"
                  style={{ width: `${(cutProgress.current / cutProgress.total) * 100}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Beltcut Pro Sidebar */}
      <aside className={`w-64 bg-zinc-950 text-zinc-400 flex flex-col border-r border-zinc-800 shrink-0 transition-transform duration-300 ease-in-out fixed inset-y-0 left-0 z-50 lg:static lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        {/* Sidebar Header */}
        <div className="p-6 flex items-center justify-between gap-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-xl shadow-md">
              <RotateCcw className="h-6 w-6 text-zinc-950 animate-spin-slow" />
            </div>
            <div className="flex flex-col">
              <span className="text-white font-black text-lg tracking-tight leading-none uppercase">BELTCUT <span className="text-[10px] bg-zinc-800 text-white px-1.5 py-0.5 rounded not-italic font-bold">PRO</span></span>
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">Nesting Portal</span>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="lg:hidden p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
            aria-label="Close Sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Master Dashboard Link */}
        {onBackToMaster && (
          <div className="px-4 mt-4">
            <button
              type="button"
              onClick={onBackToMaster}
              className="w-full flex items-center gap-3 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-850 text-zinc-200 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer border border-white/5"
            >
              <ArrowLeft className="h-4 w-4 text-zinc-400" />
              Master Dashboard
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <nav className="flex-1 px-4 space-y-1 mt-4 overflow-y-auto">
          {[
            { id: 'dashboard', label: 'Overview', icon: BarChart3 },
            { id: 'cutting', label: 'Cutting System', icon: Scissors },
            { id: 'rolls_map', label: 'Roll Clients Map', icon: Layers },
            { id: 'details', label: 'Client Cuts History', icon: User },
            { id: 'stock', label: 'Inventory', icon: Package },
            { id: 'production', label: 'Production Log', icon: ClipboardList },
            { id: 'scrub', label: 'Scrap Registry', icon: Trash2 },
          ].filter(tab => {
            if (user?.role === 'admin') return true;
            const perm = (tabPermissionMap as any)[tab.id];
            return user?.allowedPages?.includes(perm);
          }).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setIsSidebarOpen(false);
                  setTableSearchQuery('');
                  if (tab.id === 'cutting') {
                    setCutPurpose('order');
                    setSelectedOrder(prev => ({ ...prev, isInventoryCut: false, customerName: '', soNumber: '' }));
                    setSelectedOrderNumber('');
                    setOrderSearchQuery('');
                  }
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer ${isActive
                  ? 'bg-white text-zinc-950 shadow-lg shadow-black/20 font-bold'
                  : 'hover:bg-zinc-900 hover:text-zinc-200'
                  }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-zinc-950' : 'text-zinc-500'}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer with Unit Selector */}
        <div className="p-4 border-t border-white/5 space-y-3 shrink-0">
          <div className="px-4">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500 block mb-2">Display Unit</span>
            <div className="grid grid-cols-5 gap-1 bg-zinc-900 p-1 rounded-xl border border-white/5">
              {(['m', 'cm', 'mm', 'ft', 'in'] as Unit[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setCurrentUnit(u)}
                  className={`py-1.5 rounded-lg text-[9px] font-black transition-all cursor-pointer ${currentUnit === u
                    ? 'bg-white text-zinc-950'
                    : 'text-zinc-500 hover:text-zinc-200'
                    }`}
                >
                  {u.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div className="text-[10px] text-zinc-500/50 font-mono text-center select-none pt-1">
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

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto p-3 sm:p-5 bg-zinc-50/50">
        <div className="max-w-7xl mx-auto">
          {/* Mobile Header Bar */}
          <div className="flex lg:hidden items-center justify-between p-3.5 mb-6 bg-zinc-950 text-white rounded-2xl border border-zinc-850 shadow-md">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-900 rounded-xl transition-all cursor-pointer animate-pulse"
                aria-label="Open Menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <span className="font-black text-sm uppercase tracking-tight">BELTCUT <span className="text-[9px] bg-zinc-850 text-white px-1.5 py-0.5 rounded not-italic font-bold">PRO</span></span>
            </div>
            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest bg-zinc-900 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
              Nesting
            </span>
          </div>

          {/* Header section in content */}
          <div className="pb-1 border-b border-zinc-200 mb-2.5 flex flex-row items-center justify-between gap-2.5">
            <h2 className="text-xs sm:text-sm font-black text-zinc-950 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
              {activeTab === 'dashboard' && <BarChart3 className="h-4 w-4 text-zinc-700" />}
              {activeTab === 'cutting' && <Scissors className="h-4 w-4 text-zinc-700" />}
              {activeTab === 'rolls_map' && <Layers className="h-4 w-4 text-zinc-700" />}
              {activeTab === 'details' && <User className="h-4 w-4 text-zinc-700" />}
              {activeTab === 'stock' && <Package className="h-4 w-4 text-zinc-700" />}
              {activeTab === 'scrub' && <Trash2 className="h-4 w-4 text-zinc-700" />}
              {activeTab === 'production' && <ClipboardList className="h-4 w-4 text-zinc-700" />}
              <span>
                {activeTab === 'dashboard' && 'Inventory Overview'}
                {activeTab === 'cutting' && 'Cutting & Optimization'}
                {activeTab === 'rolls_map' && 'Roll Clients Map'}
                {activeTab === 'details' && 'Client Cuts History'}
                {activeTab === 'stock' && 'Stock Registry'}
                {activeTab === 'scrub' && 'Scrap Registry'}
                {activeTab === 'production' && 'Production Log'}
              </span>
            </h2>
            {['scrub', 'details', 'rolls_map', 'production'].includes(activeTab) && (
              <div className={`relative flex items-center gap-2 shrink-0 ${activeTab === 'production'
                  ? 'flex-1 max-w-[180px] sm:max-w-[380px] md:max-w-[480px]'
                  : 'w-32 sm:w-60'
                }`}>
                <div className="relative flex-1">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <Search className="h-3.5 w-3.5 text-zinc-400" />
                  </span>
                  <input
                    type="text"
                    value={activeTab === 'production' ? productionSearchQuery : tableSearchQuery}
                    onChange={(e) => activeTab === 'production' ? setProductionSearchQuery(e.target.value) : setTableSearchQuery(e.target.value)}
                    placeholder={activeTab === 'production' ? 'Search by material name, issued to, or notes...' : 'Search...'}
                    className="w-full pl-8 pr-3 py-1 bg-white border border-zinc-200 rounded-lg text-xs font-bold text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 placeholder-zinc-400 shadow-sm text-left"
                  />
                </div>
                {activeTab === 'production' && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full leading-none">
                      {filteredMaterialIssues.length} records
                    </span>
                    <button
                      onClick={loadMaterialIssues}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition cursor-pointer"
                      title="Refresh"
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      onClick={() => {
                        setRequestForm({ materialId: materialStocks[0]?.id || '', quantity: '', notes: '', lotNumber: '' });
                        setShowRequestModal(true);
                      }}
                      className="px-2.5 py-1 bg-zinc-950 hover:bg-zinc-800 text-white rounded-lg text-[10px] font-black transition flex items-center gap-1 cursor-pointer shadow-sm active:scale-95"
                    >
                      <Plus size={11} /> REQUEST MATERIAL
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                <StatsCard label="Available" value={formatDisplayValue(stats.totalAvailable)} unit={areaUnit} icon={<Package size={20} />} color="bg-zinc-900" />
                <StatsCard label="Efficiency" value={`${stats.efficiency}%`} icon={<TrendingDown size={20} />} color="bg-emerald-600" />
                <StatsCard label="Active Stock" value={stats.activeRolls} icon={<Layers size={20} />} color="bg-violet-600" />
                <StatsCard label="Fresh Cut" value={stats.freshRollsCut} icon={<Scissors size={20} />} color="bg-indigo-600" />
                <StatsCard label="Refused" value={stats.refusedRolls} icon={<AlertTriangle size={20} />} color="bg-rose-600" />
                <StatsCard label="Est. Waste" value={formatDisplayValue(stats.totalWastage)} unit={areaUnit} icon={<AlertTriangle size={20} />} color="bg-amber-600" />
              </div>

              {/* Master Search Bar */}
              <div className="relative max-w-md">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search by Product, Client Name, or Roll ID..."
                  value={overviewSearchQuery}
                  onChange={(e) => setOverviewSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 border border-zinc-200 rounded-xl text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-zinc-950 focus:border-transparent shadow-sm"
                />
                {overviewSearchQuery && (
                  <button
                    onClick={() => setOverviewSearchQuery('')}
                    className="absolute right-3 top-3 text-zinc-400 hover:text-zinc-600"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4">
                {filteredOverviewRolls.length === 0 ? (
                  <div className="bg-white p-8 rounded-2xl border border-zinc-200 text-center text-zinc-400 italic text-xs">
                    No matching active rolls found.
                  </div>
                ) : (
                  filteredOverviewRolls.map(roll => (
                    <RollVisualizer
                      key={roll.id}
                      roll={roll}
                      unit={currentUnit}
                      onSelectCut={(cut) => handleDeleteCut(roll.id, cut)}
                      onMaximize={() => setFullscreenRollId(roll.id)}
                      allRolls={rolls}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'cutting' && (
            <div className="space-y-4">
              {/* Responsive 2-Column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start animate-in fade-in duration-300">

                {/* Left Column (Span 1): Cut Purpose & Recommendations */}
                <div className="lg:col-span-1 space-y-2.5 flex flex-col">

                  {/* Card 1: Cut Purpose */}
                  <div className="bg-white p-2.5 rounded-xl border border-zinc-200 shadow-sm flex flex-col justify-between space-y-2">
                    <div className="space-y-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cut Purpose</label>
                        <div className="grid grid-cols-4 gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                          {(['manual', 'order', 'scrap', 'inventory'] as const).map((purpose) => (
                            <button
                              key={purpose}
                              type="button"
                              onClick={() => {
                                setCutPurpose(purpose);
                                setOrderSearchQuery('');
                                setCuttingSelectedRollId('');
                                setRollSearchQuery('');
                                if (purpose === 'manual') {
                                  setSelectedOrder(prev => ({ ...prev, isInventoryCut: false, customerName: '', soNumber: '', quantity: 1 }));
                                  setSelectedOrderNumber('');
                                } else if (purpose === 'order') {
                                  setSelectedOrder(prev => ({ ...prev, isInventoryCut: false, customerName: '', soNumber: '', quantity: 1 }));
                                  setSelectedOrderNumber('');
                                } else if (purpose === 'scrap') {
                                  setSelectedOrder(prev => ({ ...prev, isInventoryCut: true, customerName: 'SCRAP', soNumber: '', quantity: 1 }));
                                  setSelectedOrderNumber('');
                                } else if (purpose === 'inventory') {
                                  setSelectedOrder(prev => ({ ...prev, isInventoryCut: true, customerName: 'REUSE STOCK', soNumber: '', quantity: 1 }));
                                  setSelectedOrderNumber('');
                                }
                              }}
                              className={`py-1 rounded-md text-[8.5px] font-black uppercase transition-all cursor-pointer ${cutPurpose === purpose
                                ? 'bg-zinc-950 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'
                                }`}
                            >
                              {purpose}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Display Order Selection if 'order' purpose active */}
                      {cutPurpose === 'order' && (
                        <div className="space-y-1 relative animate-in fade-in duration-200">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            <Layers size={11} /> Select Active Order
                          </label>

                          {/* Master Search Input */}
                          <div className="relative">
                            <input
                              type="text"
                              value={orderSearchQuery}
                              onChange={(e) => {
                                setOrderSearchQuery(e.target.value);
                                setShowOrderDropdown(true);
                                // If cleared, reset selected order
                                if (!e.target.value) {
                                  setSelectedOrderNumber('');
                                }
                              }}
                              onFocus={() => setShowOrderDropdown(true)}
                              onBlur={() => setTimeout(() => setShowOrderDropdown(false), 200)}
                              placeholder="Type order # or client name..."
                              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:border-zinc-950 focus:outline-none font-bold text-xs bg-white"
                            />
                            {selectedOrderNumber && (
                              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <span className="text-[8px] font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded uppercase">✓ Loaded</span>
                              </div>
                            )}
                          </div>

                          {/* Filtered Dropdown */}
                          {showOrderDropdown && (
                            <div className="absolute left-0 right-0 top-[100%] mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-50 animate-in fade-in duration-100">
                              {orders
                                .filter(o => {
                                  const q = orderSearchQuery.toLowerCase();
                                  if (!q) return true;
                                  return (
                                    o.orderNumber.toString().includes(q) ||
                                    (o.clientName || '').toLowerCase().includes(q)
                                  );
                                })
                                .map((o) => {
                                  const isSelected = selectedOrderNumber === o.orderNumber.toString();
                                  return (
                                    <button
                                      key={o.id}
                                      type="button"
                                      onMouseDown={() => {
                                        // Load order data
                                        const convertToMeters = (val: number, unit?: string) => {
                                          const u = (unit || 'mm').toLowerCase();
                                          if (u === 'mm') return val / 1000;
                                          if (u === 'ft') return val * 0.3048;
                                          if (u === 'in') return val * 0.0254;
                                          if (u === 'mtr' || u === 'm') return val;
                                          return val / 1000;
                                        };
                                        const wMtr = convertToMeters(o.dimensions.width, o.dimensions.widthUnit || o.dimensions.unit);
                                        const lMtr = convertToMeters(o.dimensions.length, o.dimensions.lengthUnit || o.dimensions.unit);

                                        setSelectedOrderNumber(o.orderNumber.toString());
                                        setOrderSearchQuery(`#${o.orderNumber}`);
                                        setShowOrderDropdown(false);
                                        setSelectedOrderData(o);
                                        const itemsList = o.items || [];
                                        if (itemsList.length > 0) {
                                          setSelectedItemIndex(0);
                                          const firstItem = itemsList[0];
                                          const firstWidth = convertToMeters(firstItem.dimensions.width, firstItem.dimensions.widthUnit || firstItem.dimensions.unit);
                                          const firstLength = convertToMeters(firstItem.dimensions.length, firstItem.dimensions.lengthUnit || firstItem.dimensions.unit);
                                          setSelectedOrder(prev => ({
                                            ...prev,
                                            id: o.id,
                                            customerName: (o.clientName || '').trim(),
                                            requiredWidth: firstWidth,
                                            requiredLength: firstLength,
                                            materialType: matchMaterialType(firstItem.beltType),
                                            soNumber: `#${o.orderNumber}`
                                          }));
                                        } else {
                                          setSelectedItemIndex(null);
                                          setSelectedOrder(prev => ({
                                            ...prev,
                                            id: o.id,
                                            customerName: (o.clientName || '').trim(),
                                            requiredWidth: wMtr,
                                            requiredLength: lMtr,
                                            materialType: matchMaterialType(o.beltType),
                                            soNumber: `#${o.orderNumber}`
                                          }));
                                        }
                                        toast.success(`Order #${o.orderNumber} loaded: ${(o.clientName || '').trim()}`);
                                      }}
                                      className={`w-full text-left px-2.5 py-1.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-2 ${isSelected ? 'bg-zinc-50' : ''}`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="text-[10px] font-black text-white bg-zinc-900 px-1.5 py-0.5 rounded-md shrink-0">
                                          #{o.orderNumber}
                                        </span>
                                        <span className="font-bold text-xs text-slate-800 truncate">{o.clientName}</span>
                                      </div>
                                      <span className="text-[9px] font-bold text-slate-400 shrink-0">{o.beltType}</span>
                                    </button>
                                  );
                                })}
                              {orders.filter(o => {
                                const q = orderSearchQuery.toLowerCase();
                                if (!q) return true;
                                return o.orderNumber.toString().includes(q) || (o.clientName || '').toLowerCase().includes(q);
                              }).length === 0 && (
                                  <div className="px-4 py-6 text-center text-xs font-bold text-slate-400">
                                    No active orders found
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      )}

                      {(cutPurpose !== 'order' || !!selectedOrderNumber) && (
                        <>
                          {/* Display Party Name for client purposes (manual & order) */}
                          {(cutPurpose === 'manual' || cutPurpose === 'order') && (
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1 relative">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
                                  <span className="flex items-center gap-1"><User size={11} /> Party Name <span className="text-red-500">*</span></span>
                                  {isExactPartyMatch && (
                                    <span className="text-[8px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-1 py-0.2 rounded uppercase animate-pulse">
                                      ✓ Registered
                                    </span>
                                  )}
                                </label>
                                <input
                                  type="text"
                                  value={selectedOrder.customerName}
                                  disabled={cutPurpose === 'order'} // read-only if order is loaded
                                  onChange={(e) => {
                                    setSelectedOrder({ ...selectedOrder, customerName: e.target.value });
                                    setShowPartySuggestions(true);
                                  }}
                                  onFocus={() => { if (cutPurpose === 'manual') setShowPartySuggestions(true); }}
                                  onBlur={() => {
                                    setTimeout(() => setShowPartySuggestions(false), 200);
                                  }}
                                  placeholder="Customer Name"
                                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:border-zinc-900 focus:outline-none font-bold text-xs disabled:bg-slate-50 disabled:text-slate-650 disabled:cursor-not-allowed"
                                />

                                {/* Auto-complete Suggestions Dropdown */}
                                {showPartySuggestions && partySuggestions.length > 0 && (
                                  <div className="absolute left-0 right-0 top-[100%] mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-36 overflow-y-auto divide-y divide-slate-100 animate-in fade-in duration-100">
                                    {partySuggestions.map((name) => (
                                      <button
                                        key={name}
                                        type="button"
                                        onClick={() => {
                                          setSelectedOrder({ ...selectedOrder, customerName: name });
                                          setShowPartySuggestions(false);
                                        }}
                                        className="w-full text-left px-2.5 py-1.5 hover:bg-slate-50 font-bold text-xs text-slate-800 transition-colors flex justify-between items-center"
                                      >
                                        <span>{name}</span>
                                        <span className="text-[8px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded uppercase">
                                          Existing Party
                                        </span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                  <span>S.O. No.</span>
                                </label>
                                <input
                                  type="text"
                                  value={selectedOrder.soNumber || ''}
                                  disabled={cutPurpose === 'order'} // read-only if order is loaded
                                  onChange={(e) => {
                                    setSelectedOrder({ ...selectedOrder, soNumber: e.target.value });
                                  }}
                                  placeholder="S.O. Number"
                                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:border-zinc-900 focus:outline-none font-bold text-xs disabled:bg-slate-50 disabled:text-slate-650 disabled:cursor-not-allowed"
                                />
                              </div>
                            </div>
                          )}

                          {/* Display Order Items Checklist for Multi-Item Orders */}
                          {cutPurpose === 'order' && selectedOrderData && Array.isArray(selectedOrderData.items) && selectedOrderData.items.length > 0 && (
                            <div className="space-y-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl mt-2.5">
                              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                <ClipboardList size={11} className="text-indigo-650" />
                                Order Items Checklist ({selectedOrderData.items.length})
                              </label>
                              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
                                {selectedOrderData.items.map((item: any, idx: number) => {
                                  const isSelected = selectedItemIndex === idx;
                                  const isCompleted = completedItemIndices.has(idx);

                                  const itemWidth = item.dimensions.width;
                                  const itemLength = item.dimensions.length;
                                  const itemUnit = item.dimensions.unit || 'mm';

                                  const convertToMeters = (val: number, unit?: string) => {
                                    const u = (unit || 'mm').toLowerCase();
                                    if (u === 'mm') return val / 1000;
                                    if (u === 'ft') return val * 0.3048;
                                    if (u === 'in') return val * 0.0254;
                                    if (u === 'mtr' || u === 'm') return val;
                                    return val / 1000;
                                  };

                                  const w = convertToMeters(itemWidth, item.dimensions.widthUnit || itemUnit);
                                  const l = convertToMeters(itemLength, item.dimensions.lengthUnit || itemUnit);

                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => {
                                        setSelectedItemIndex(idx);
                                        setSelectedOrder(prev => ({
                                          ...prev,
                                          requiredWidth: w,
                                          requiredLength: l,
                                          materialType: matchMaterialType(item.beltType)
                                        }));
                                      }}
                                      className={`w-full text-left p-2.5 rounded-xl border text-xs transition-all duration-200 flex items-center justify-between gap-3 cursor-pointer shadow-sm ${isCompleted
                                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100/50'
                                          : isSelected
                                            ? 'border-zinc-950 bg-zinc-950 text-white font-bold'
                                            : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                                        }`}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                          <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${isSelected ? 'bg-zinc-800 text-zinc-300' : 'bg-slate-200 text-slate-500'
                                            }`}>
                                            Item #{idx + 1}
                                          </span>
                                          {isCompleted ? (
                                            <span className="text-[7.5px] font-black text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded uppercase">✓ Done</span>
                                          ) : (
                                            <span className={`text-[7.5px] font-black uppercase px-1 py-0.2 rounded ${isSelected ? 'bg-indigo-900/50 text-indigo-200' : 'bg-amber-50 text-amber-700'
                                              }`}>Pending</span>
                                          )}
                                        </div>
                                        <p className={`font-black text-xs mt-1.5 ${isSelected ? 'text-white' : 'text-zinc-900'}`}>
                                          {itemWidth} {itemUnit} × {itemLength} {itemUnit}
                                          <span className={`text-[9.5px] font-medium ml-1.5 ${isSelected ? 'text-zinc-300' : 'text-slate-400'}`}>
                                            ({fromMeters(w).toFixed(2)}{currentUnit} × {fromMeters(l).toFixed(2)}{currentUnit})
                                          </span>
                                        </p>
                                        <p className={`text-[9px] mt-0.5 ${isSelected ? 'text-zinc-400' : 'text-slate-400'} font-bold truncate`}>
                                          {item.beltType}
                                        </p>
                                      </div>
                                      <div className="shrink-0">
                                        {!isCompleted && !isSelected && (
                                          <span className="text-[8px] font-black text-indigo-750 bg-indigo-50 border border-indigo-200 px-2 py-1 rounded-lg uppercase">
                                            Cut Item
                                          </span>
                                        )}
                                        {isSelected && (
                                          <span className="text-[8px] font-black text-white bg-indigo-650 px-2 py-1 rounded-lg uppercase flex items-center gap-1">
                                            Active
                                          </span>
                                        )}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Display for Scrub/Scrap Purpose */}
                          {cutPurpose === 'scrap' && (
                            <div className="p-2 bg-rose-50 border border-rose-150 rounded-lg flex items-center gap-2 text-rose-800">
                              <Trash2 size={14} className="text-rose-500" />
                              <div>
                                <p className="text-[8px] font-black uppercase tracking-widest text-rose-500">Scrap Remainder</p>
                                <p className="text-[9.5px] font-bold">Cutting to discard / mark as waste</p>
                              </div>
                            </div>
                          )}

                          {/* Display for Inventory Purpose */}
                          {cutPurpose === 'inventory' && (
                            <div className="p-2 bg-slate-900 rounded-lg flex items-center gap-2 text-white">
                              <Warehouse size={14} className="text-blue-400" />
                              <div>
                                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Inventory Stocking</p>
                                <p className="text-[9.5px] font-bold">Cutting for common size stock</p>
                              </div>
                            </div>
                          )}

                          {/* Searchable Target Roll Selection for Scrap & Inventory */}
                          {(cutPurpose === 'scrap' || cutPurpose === 'inventory') && (
                            <div className="space-y-1 relative animate-in fade-in duration-200">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                <Layers size={11} /> Select Target Roll
                              </label>

                              {/* Master Search Input */}
                              <div className="relative">
                                <input
                                  type="text"
                                  value={rollSearchQuery}
                                  onChange={(e) => {
                                    setRollSearchQuery(e.target.value);
                                    setShowRollDropdown(true);
                                    if (!e.target.value) {
                                      setCuttingSelectedRollId('');
                                    }
                                  }}
                                  onFocus={() => setShowRollDropdown(true)}
                                  onBlur={() => setTimeout(() => setShowRollDropdown(false), 200)}
                                  placeholder="Type roll ID or size..."
                                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:border-zinc-950 focus:outline-none font-bold text-xs bg-white"
                                />
                                {cuttingSelectedRollId && (
                                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <span className="text-[8px] font-black text-emerald-700 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded uppercase">✓ Selected</span>
                                  </div>
                                )}
                              </div>

                              {/* Filtered Dropdown */}
                              {showRollDropdown && (
                                <div className="absolute left-0 right-0 top-[100%] mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto divide-y divide-slate-50 animate-in fade-in duration-100">
                                  {rolls
                                    .filter(r => {
                                      // Only show rolls that are active (not refused)
                                      if (r.status === 'refused') return false;

                                      const q = rollSearchQuery.toLowerCase();
                                      if (!q) return true;
                                      const rollSize = `${fromMeters(r.fullLength).toFixed(2)}${currentUnit} x ${fromMeters(r.fullWidth).toFixed(2)}${currentUnit}`.toLowerCase();
                                      return (
                                        r.id.toLowerCase().includes(q) ||
                                        rollSize.includes(q) ||
                                        r.materialType.toLowerCase().includes(q)
                                      );
                                    })
                                    .sort((a, b) => {
                                      // Prioritize rolls matching the current selected material type to the top
                                      const aMatch = a.materialType === selectedOrder.materialType;
                                      const bMatch = b.materialType === selectedOrder.materialType;
                                      if (aMatch && !bMatch) return -1;
                                      if (!aMatch && bMatch) return 1;
                                      return 0;
                                    })
                                    .map((r) => {
                                      const isSelected = cuttingSelectedRollId === r.id;
                                      return (
                                        <button
                                          key={r.id}
                                          type="button"
                                          onMouseDown={() => {
                                            setCuttingSelectedRollId(r.id);
                                            setRollSearchQuery(`${r.id} (${fromMeters(r.fullLength).toFixed(1)}${currentUnit} × ${fromMeters(r.fullWidth).toFixed(1)}${currentUnit})`);
                                            // Sync selectedOrder's materialType with the selected roll
                                            setSelectedOrder(prev => ({ ...prev, materialType: r.materialType }));
                                            // Immediately expand this roll in the visualizer (first-click fix)
                                            setExpandedRollId(r.id);
                                            setTimeout(() => {
                                              const element = document.getElementById(`roll-visualizer-${r.id}`);
                                              if (element) {
                                                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                              }
                                            }, 100);
                                            setShowRollDropdown(false);
                                            toast.success(`Target roll selected: ${r.id}`);
                                          }}
                                          className={`w-full text-left px-2.5 py-1.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-2 ${isSelected ? 'bg-zinc-50' : ''}`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-[10px] font-black text-white bg-zinc-900 px-1.5 py-0.5 rounded-md shrink-0">
                                              {r.id}
                                            </span>
                                            <div className="flex flex-col min-w-0">
                                              <span className="font-bold text-xs text-slate-800 truncate">
                                                {fromMeters(r.fullLength).toFixed(2)}{currentUnit} × {fromMeters(r.fullWidth).toFixed(2)}{currentUnit}
                                              </span>
                                              <span className="text-[8px] font-bold text-slate-400 truncate">
                                                {r.materialType}
                                              </span>
                                            </div>
                                          </div>
                                          <span className="text-[9px] font-bold text-slate-400 shrink-0">
                                            Rem: {fromMeters(r.remainingSqm).toFixed(1)}{currentUnit}²
                                          </span>
                                        </button>
                                      );
                                    })}
                                  {rolls.filter(r => {
                                    if (r.status === 'refused') return false;
                                    const q = rollSearchQuery.toLowerCase();
                                    if (!q) return true;
                                    const rollSize = `${fromMeters(r.fullLength).toFixed(2)}${currentUnit} x ${fromMeters(r.fullWidth).toFixed(2)}${currentUnit}`.toLowerCase();
                                    return r.id.toLowerCase().includes(q) || rollSize.includes(q) || r.materialType.toLowerCase().includes(q);
                                  }).length === 0 && (
                                      <div className="px-4 py-6 text-center text-xs font-bold text-slate-400">
                                        No active rolls found
                                      </div>
                                    )}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between w-full">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                  Length ({currentUnit})
                                </label>
                                {cutPurpose === 'order' && selectedOrderNumber && (
                                  isOrderDimensionsUnlocked ? (
                                    <span className="text-[7.5px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded uppercase flex items-center gap-0.5">🔓 Unlocked</span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (window.confirm("Are you sure you want to unlock and edit these dimensions?")) {
                                          setIsOrderDimensionsUnlocked(true);
                                        }
                                      }}
                                      className="text-[7.5px] font-black text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded uppercase flex items-center gap-0.5 transition cursor-pointer"
                                    >
                                      🔒 Locked
                                    </button>
                                  )
                                )}
                              </div>
                              <input
                                type="number"
                                step="0.01"
                                value={selectedOrder.requiredLength === 0 ? '' : fromMeters(selectedOrder.requiredLength)}
                                onChange={(e) => {
                                  if (cutPurpose === 'order' && selectedOrderNumber && !isOrderDimensionsUnlocked) return;
                                  const val = parseFloat(e.target.value);
                                  setSelectedOrder({ ...selectedOrder, requiredLength: isNaN(val) ? 0 : toMeters(val) });
                                }}
                                readOnly={cutPurpose === 'order' && !!selectedOrderNumber && !isOrderDimensionsUnlocked}
                                className={`w-full px-2.5 py-1 border rounded-lg focus:outline-none font-bold text-xs ${cutPurpose === 'order' && selectedOrderNumber && !isOrderDimensionsUnlocked
                                  ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                                  : 'border-slate-200 focus:border-zinc-950 bg-white'
                                  }`}
                              />
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between w-full">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                  Width ({currentUnit})
                                </label>
                                {cutPurpose === 'order' && selectedOrderNumber && (
                                  isOrderDimensionsUnlocked ? (
                                    <span className="text-[7.5px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 px-1 py-0.2 rounded uppercase flex items-center gap-0.5">🔓 Unlocked</span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (window.confirm("Are you sure you want to unlock and edit these dimensions?")) {
                                          setIsOrderDimensionsUnlocked(true);
                                        }
                                      }}
                                      className="text-[7.5px] font-black text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-1.5 py-0.5 rounded uppercase flex items-center gap-0.5 transition cursor-pointer"
                                    >
                                      🔒 Locked
                                    </button>
                                  )
                                )}
                              </div>
                              <input
                                type="number"
                                step="0.01"
                                value={selectedOrder.requiredWidth === 0 ? '' : fromMeters(selectedOrder.requiredWidth)}
                                onChange={(e) => {
                                  if (cutPurpose === 'order' && selectedOrderNumber && !isOrderDimensionsUnlocked) return;
                                  const val = parseFloat(e.target.value);
                                  setSelectedOrder({ ...selectedOrder, requiredWidth: isNaN(val) ? 0 : toMeters(val) });
                                }}
                                readOnly={cutPurpose === 'order' && !!selectedOrderNumber && !isOrderDimensionsUnlocked}
                                className={`w-full px-2.5 py-1 border rounded-lg focus:outline-none font-bold text-xs ${cutPurpose === 'order' && selectedOrderNumber && !isOrderDimensionsUnlocked
                                  ? 'border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed'
                                  : 'border-slate-200 focus:border-zinc-950 bg-white'
                                  }`}
                              />
                            </div>
                          </div>



                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Belt Material Type</label>
                            <SearchableSelect
                              options={materialTypes.map(type => ({ value: type, label: type }))}
                              value={selectedOrder.materialType}
                              onChange={(val) => setSelectedOrder({ ...selectedOrder, materialType: val })}
                              onAddNew={() => {
                                setPreviousMaterialTypeVal(selectedOrder.materialType);
                                setMaterialTypeAddSource('selectedOrder');
                                setShowAddMaterialModal(true);
                              }}
                              disabled={cutPurpose === 'order' && !!selectedOrderNumber && !isOrderDimensionsUnlocked}
                            />
                          </div>

                          {(() => {
                            const matchingStockForLot = materialStocks.find(s => s.name === selectedOrder.materialType);
                            const availableLots = matchingStockForLot?.lots || [];
                            if (availableLots.length === 0) return null;
                            return (
                              <div className="space-y-1 animate-in fade-in duration-200">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Select Lot (Optional)</label>
                                <SearchableSelect
                                  options={[
                                    { value: '', label: '-- All Lots (Sequential) --' },
                                    ...availableLots.map(lot => ({
                                      value: lot.lotNumber,
                                      label: `${lot.lotNumber} (${lot.pieces?.length || 0} pcs)`
                                    }))
                                  ]}
                                  value={selectedLotNumber}
                                  onChange={(val) => setSelectedLotNumber(val)}
                                  placeholder="-- All Lots (Sequential) --"
                                />
                              </div>
                            );
                          })()}

                          {/* PCS / Quantity field */}
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                              <Layers size={11} /> PCS / Quantity (Pieces)
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedOrder({ ...selectedOrder, quantity: Math.max(1, (selectedOrder.quantity || 1) - 1) })}
                                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm flex items-center justify-center transition cursor-pointer"
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min={1}
                                value={selectedOrder.quantity || 1}
                                onChange={(e) => setSelectedOrder({ ...selectedOrder, quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                                className="flex-1 px-2.5 py-1 border border-slate-200 rounded-lg focus:border-zinc-950 focus:outline-none font-bold text-xs text-center"
                              />
                              <button
                                type="button"
                                onClick={() => setSelectedOrder({ ...selectedOrder, quantity: (selectedOrder.quantity || 1) + 1 })}
                                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-sm flex items-center justify-center transition cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                            {(selectedOrder.quantity || 1) > 1 && (
                              <p className="text-[8.5px] text-emerald-600 font-bold flex items-center gap-1 mt-0.5">
                                <Check size={10} className="text-emerald-500" /> Pieces will be cut sequentially to minimize scrap
                              </p>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    {(cutPurpose !== 'order' || !!selectedOrderNumber) && (
                      <div className="space-y-1 mt-2.5">
                        <button
                          onClick={handleCalculateBestFit}
                          className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[9px] uppercase tracking-wider rounded-lg transition shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-1 animate-pulse"
                        >
                          <Wand2 size={11} /> FIND THE BEST FIT
                        </button>

                        <div className="flex gap-1.5">
                          <button
                            onClick={() => setCuttingMode('auto')}
                            className={`flex-1 py-1 rounded-lg text-[9px] font-black transition-all cursor-pointer ${cuttingMode === 'auto' ? 'bg-zinc-950 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              }`}
                          >
                            AUTO FIT
                          </button>
                          <button
                            onClick={() => setCuttingMode('manual')}
                            className={`flex-1 py-1 rounded-lg text-[9px] font-black transition-all cursor-pointer ${cuttingMode === 'manual' ? 'bg-zinc-950 text-white shadow-sm' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              }`}
                          >
                            MANUAL FIT
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card 2: Cutting Recommendations */}
                  {(cutPurpose !== 'order' || !!selectedOrderNumber) && (
                    <div className="bg-white p-2.5 rounded-xl border border-zinc-200 shadow-sm flex flex-col justify-between space-y-1.5">
                      <div className="space-y-2 flex-1 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                            Cutting Recommendations (Top 3)
                          </label>

                          {/* Compact Arrow pagination inside Recommendations Card Header */}
                          {cuttingMode === 'auto' && optimizationResults.length > 0 && (
                            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-1.5 py-0.5 rounded-md shrink-0">
                              <button
                                disabled={currentOptionIndex === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (currentOptionIndex > 0) handleSelectRecommendation(currentOptionIndex - 1);
                                }}
                                className="p-0.5 hover:bg-zinc-800 rounded text-slate-300 disabled:opacity-30 cursor-pointer flex items-center justify-center"
                                title="Previous Option"
                              >
                                <ChevronLeft size={10} />
                              </button>
                              <span className="font-mono font-black text-white text-[8px]">
                                {currentOptionIndex + 1}/{Math.min(3, optimizationResults.length)}
                              </span>
                              <button
                                disabled={currentOptionIndex === Math.min(3, optimizationResults.length) - 1}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (currentOptionIndex < Math.min(3, optimizationResults.length) - 1) handleSelectRecommendation(currentOptionIndex + 1);
                                }}
                                className="p-0.5 hover:bg-zinc-800 rounded text-slate-300 disabled:opacity-30 cursor-pointer flex items-center justify-center"
                                title="Next Option"
                              >
                                <ChevronRight size={10} />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1 flex-1">
                          {cuttingMode === 'auto' && optimizationResults.length > 0 ? (
                            optimizationResults.slice(0, 3).map((candidate, idx) => {
                              const isSelected = currentOptionIndex === idx;
                              const isBest = idx === 0;
                              const hasScrapRisk = candidate.reason.includes("Scrap Risk");
                              const matchRoll = rolls.find(r => r.id === candidate.rollId);

                              let badgeText = "VALID FIT";
                              let badgeStyle = isSelected ? 'bg-zinc-800 text-white' : 'bg-slate-100 text-slate-600';

                              if (isBest) {
                                badgeText = "BEST MATCH";
                                badgeStyle = isSelected ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-700';
                              } else if (hasScrapRisk) {
                                badgeText = "SCRAP RISK";
                                badgeStyle = isSelected ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-700';
                              }

                              const rating = isBest
                                ? "Fayda: Minimum Waste & Scrub"
                                : (hasScrapRisk ? "Warning: High scrap/scrub risk" : "Alternative Remnant Fit");

                              return (
                                <div
                                  key={idx}
                                  onClick={() => handleSelectRecommendation(idx)}
                                  className={`p-1.5 rounded-lg border cursor-pointer transition-all text-left ${isSelected
                                    ? 'bg-zinc-950 border-zinc-950 text-white shadow-sm'
                                    : 'bg-slate-50 hover:bg-slate-100 border-slate-100 text-slate-800'
                                    }`}
                                >
                                  <div className="flex justify-between items-center">
                                    <span className="font-black text-[11px] uppercase tracking-tight flex items-center gap-1 flex-wrap">
                                      <span>{candidate.rollId}</span>
                                      {matchRoll && (
                                        <>
                                          <span className={`text-[8px] font-black uppercase tracking-wider px-1 py-0.2 rounded ${isSelected ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-600'}`}>
                                            {fromMeters(matchRoll.fullLength).toFixed(1)}{currentUnit}x{fromMeters(matchRoll.fullWidth).toFixed(1)}{currentUnit}
                                          </span>
                                          <span className={`text-[7.5px] font-black uppercase tracking-wider px-1 py-0.2 rounded ${isRollReuse(matchRoll)
                                              ? (isSelected ? 'bg-amber-900 text-amber-200' : 'bg-amber-50 text-amber-700')
                                              : (isSelected ? 'bg-blue-900 text-blue-200' : 'bg-blue-50 text-blue-700')
                                            }`}>
                                            {isRollReuse(matchRoll) ? 'Remnant' : 'Fresh'}
                                          </span>
                                        </>
                                      )}
                                      <span className={`text-[7.5px] font-black tracking-widest px-1 py-0.2 rounded-md leading-none ${badgeStyle}`}>
                                        {badgeText}
                                      </span>
                                    </span>
                                    <span className="text-[8px] font-bold text-slate-400">
                                      Pos: {candidate.placement.x.toFixed(1)}m
                                    </span>
                                  </div>

                                  <p className={`text-[8.5px] font-bold mt-0.5 leading-tight ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                                    {candidate.reason}
                                  </p>

                                  <div className="mt-0.5 flex items-center justify-between border-t border-slate-200/10 pt-0.5 text-[7.5px] font-black uppercase tracking-wider">
                                    <span className={isSelected ? 'text-emerald-400' : (hasScrapRisk ? 'text-rose-500' : 'text-slate-500')}>
                                      {rating}
                                    </span>
                                  </div>
                                </div>
                              );
                            })
                          ) : cuttingMode === 'manual' ? (
                            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
                              <div className="flex items-center justify-between border-b border-blue-150 pb-1.5">
                                <p className="font-black uppercase tracking-wider text-[10px] text-blue-800 flex items-center gap-1">
                                  <Sliders size={13} /> Manual Position Panel
                                </p>
                                <span className="text-[8px] font-black text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                  Precise Mode
                                </span>
                              </div>

                              <div className="space-y-2">
                                {/* Roll Selection */}
                                <div className="space-y-1">
                                  <label className="text-[8.5px] font-black text-slate-500 uppercase tracking-widest">
                                    Target Roll
                                  </label>
                                  <SearchableSelect
                                    options={visibleRolls.map(r => ({
                                      value: r.id,
                                      label: `Roll ${r.id} (${fromMeters(r.fullLength).toFixed(1)}${currentUnit} × ${fromMeters(r.fullWidth).toFixed(1)}${currentUnit})`
                                    }))}
                                    value={manualPlacement?.rollId || (visibleRolls[0]?.id || '')}
                                    onChange={(rId) => {
                                      const roll = rolls.find(r => r.id === rId);
                                      if (roll) {
                                        setManualPlacement({
                                          rollId: rId,
                                          placement: manualPlacement?.placement || { x: 0, y: 0 }
                                        });
                                      }
                                    }}
                                  />
                                </div>

                                {/* X and Y Coordinates Input */}
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="text-[8.5px] font-black text-slate-500 uppercase tracking-widest">
                                      Start X ({currentUnit})
                                    </label>
                                    <input
                                      type="number"
                                      step="0.001"
                                      value={manualPlacement ? Number(fromMeters(manualPlacement.placement.x).toFixed(3)) : 0}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        const xInMeters = toMeters(val);
                                        const targetRollId = manualPlacement?.rollId || visibleRolls[0]?.id;
                                        if (targetRollId) {
                                          setManualPlacement({
                                            rollId: targetRollId,
                                            placement: {
                                              x: Math.round(xInMeters * 1000) / 1000,
                                              y: manualPlacement?.placement.y || 0
                                            }
                                          });
                                        }
                                      }}
                                      className="w-full px-2 py-1 border border-slate-200 rounded-lg font-bold text-xs bg-white"
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-[8.5px] font-black text-slate-500 uppercase tracking-widest">
                                      Start Y ({currentUnit})
                                    </label>
                                    <input
                                      type="number"
                                      step="0.001"
                                      value={manualPlacement ? Number(fromMeters(manualPlacement.placement.y).toFixed(3)) : 0}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        const yInMeters = toMeters(val);
                                        const targetRollId = manualPlacement?.rollId || visibleRolls[0]?.id;
                                        if (targetRollId) {
                                          setManualPlacement({
                                            rollId: targetRollId,
                                            placement: {
                                              x: manualPlacement?.placement.x || 0,
                                              y: Math.round(yInMeters * 1000) / 1000
                                            }
                                          });
                                        }
                                      }}
                                      className="w-full px-2 py-1 border border-slate-200 rounded-lg font-bold text-xs bg-white"
                                    />
                                  </div>
                                </div>

                                {/* Align Helpers */}
                                <div className="space-y-1.5 pt-1">
                                  <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest block">
                                    Quick Alignment / Fitting Helpers:
                                  </span>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const rId = manualPlacement?.rollId || visibleRolls[0]?.id;
                                        if (rId) {
                                          setManualPlacement({
                                            rollId: rId,
                                            placement: { x: 0, y: manualPlacement?.placement.y || 0 }
                                          });
                                        }
                                      }}
                                      className="py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[9px] font-black text-slate-700 cursor-pointer shadow-sm active:scale-95 transition"
                                    >
                                      Align Left (X=0)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const rId = manualPlacement?.rollId || visibleRolls[0]?.id;
                                        const roll = rolls.find(r => r.id === rId);
                                        if (roll) {
                                          const maxLimit = Math.max(0, roll.fullLength - activeOrderDimensions.length);
                                          setManualPlacement({
                                            rollId: rId,
                                            placement: { x: maxLimit, y: manualPlacement?.placement.y || 0 }
                                          });
                                        }
                                      }}
                                      className="py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[9px] font-black text-slate-700 cursor-pointer shadow-sm active:scale-95 transition"
                                    >
                                      Align Right End
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const rId = manualPlacement?.rollId || visibleRolls[0]?.id;
                                        if (rId) {
                                          setManualPlacement({
                                            rollId: rId,
                                            placement: { x: manualPlacement?.placement.x || 0, y: 0 }
                                          });
                                        }
                                      }}
                                      className="py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[9px] font-black text-slate-700 cursor-pointer shadow-sm active:scale-95 transition"
                                    >
                                      Align Top (Y=0)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const rId = manualPlacement?.rollId || visibleRolls[0]?.id;
                                        const roll = rolls.find(r => r.id === rId);
                                        if (roll) {
                                          const maxLimit = Math.max(0, roll.fullWidth - activeOrderDimensions.width);
                                          setManualPlacement({
                                            rollId: rId,
                                            placement: { x: manualPlacement?.placement.x || 0, y: maxLimit }
                                          });
                                        }
                                      }}
                                      className="py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[9px] font-black text-slate-700 cursor-pointer shadow-sm active:scale-95 transition"
                                    >
                                      Align Bottom End
                                    </button>
                                  </div>

                                  <div className="grid grid-cols-1 gap-1.5 mt-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const rId = manualPlacement?.rollId || visibleRolls[0]?.id;
                                        const roll = rolls.find(r => r.id === rId);
                                        if (!roll) return;
                                        let bestX = 0;
                                        roll.cuts.forEach(cut => {
                                          const candidateX = cut.x + cut.length;
                                          const y = manualPlacement?.placement.y || 0;
                                          if (isSpaceAvailable(roll, candidateX, y, activeOrderDimensions.width, activeOrderDimensions.length)) {
                                            if (candidateX > bestX) bestX = candidateX;
                                          }
                                        });
                                        setManualPlacement({
                                          rollId: rId,
                                          placement: {
                                            x: Math.round(bestX * 1000) / 1000,
                                            y: manualPlacement?.placement.y || 0
                                          }
                                        });
                                      }}
                                      className="py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded text-[9px] font-black cursor-pointer shadow-sm active:scale-95 transition col-span-2 flex items-center justify-center gap-1"
                                    >
                                      🔗 Snug Fit X (Next to Cuts)
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const rId = manualPlacement?.rollId || visibleRolls[0]?.id;
                                        const roll = rolls.find(r => r.id === rId);
                                        if (!roll) return;
                                        let bestY = 0;
                                        roll.cuts.forEach(cut => {
                                          const candidateY = cut.y + cut.width;
                                          const x = manualPlacement?.placement.x || 0;
                                          if (isSpaceAvailable(roll, x, candidateY, activeOrderDimensions.width, activeOrderDimensions.length)) {
                                            if (candidateY > bestY) bestY = candidateY;
                                          }
                                        });
                                        setManualPlacement({
                                          rollId: rId,
                                          placement: {
                                            x: manualPlacement?.placement.x || 0,
                                            y: Math.round(bestY * 1000) / 1000
                                          }
                                        });
                                      }}
                                      className="py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded text-[9px] font-black cursor-pointer shadow-sm active:scale-95 transition col-span-2 flex items-center justify-center gap-1"
                                    >
                                      🔗 Snug Fit Y (Below Cuts)
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : selectedOrder.requiredWidth > 0 && selectedOrder.requiredLength > 0 && optimizationResults.length === 0 ? (
                            <div className="p-2 bg-rose-50 border border-rose-150 text-rose-800 rounded-lg flex-1 flex flex-col justify-center">
                              <p className="font-black uppercase tracking-wider text-[9px] text-rose-700 flex items-center gap-1">
                                <AlertTriangle size={11} /> No Remnants Found
                              </p>
                              <p className="text-[9.5px] font-semibold text-slate-500 mt-1 leading-relaxed text-left">
                                No active master rolls or remnants match this grade and size.
                              </p>
                            </div>
                          ) : (
                            <div className="bg-white p-2 rounded-lg border border-zinc-150 shadow-sm flex-1 flex flex-col justify-center items-center text-center text-slate-400 text-[10px] font-semibold">
                              <Info size={16} className="mb-1 text-slate-300" />
                              Enter width and length to find placement
                            </div>
                          )}
                        </div>

                        {/* Execute Cut Button Integrated inside the Recommendations card */}
                        {currentResult && (
                          <div className="pt-2 border-t border-slate-100 space-y-1">
                            <div className="bg-slate-900 rounded-lg p-2 text-[10px] text-white space-y-0.5 text-left">
                              <div className="flex justify-between border-b border-slate-800 pb-0.5">
                                <span className="text-slate-500 font-bold uppercase text-[8px]">Selected Roll</span>
                                <span className="font-bold text-blue-400 font-mono">#{currentResult.rollId}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500 font-bold uppercase text-[8px]">Placement Strategy</span>
                                <span className="font-bold text-emerald-400 text-[10px]">{(currentResult as any).reason || 'Manual Coordinate Selection'}</span>
                              </div>
                            </div>
                            <button
                              onClick={handleExecuteCut}
                              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-1.5 rounded-lg transition shadow-md active:scale-95 text-[10.5px] uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Scissors size={14} />
                              {(selectedOrder.quantity || 1) > 1
                                ? `EXECUTE ALL CUTS (${selectedOrder.quantity}×)`
                                : 'EXECUTE SELECTED CUT'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column (Span 2): Remnant Matching Visualization Accordion */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-sm animate-in fade-in duration-300">
                    <h3 className="text-xs font-black mb-2 text-slate-800 flex items-center gap-1.5 italic uppercase">
                      <Layers className="text-zinc-800" size={16} /> Remnant Matching Visualization
                    </h3>

                    <div className="space-y-4">
                      {visibleRolls.map(roll => {
                        const isExpanded = expandedRollId === roll.id;
                        return (
                          <RollVisualizer
                            key={roll.id}
                            roll={roll}
                            unit={currentUnit}
                            isExpanded={isExpanded}
                            onToggleExpand={() => {
                              setExpandedRollId(isExpanded ? null : roll.id);
                            }}
                            manualMode={cuttingMode === 'manual'}
                            manualDimensions={{ width: activeOrderDimensions.width, length: activeOrderDimensions.length }}
                            onSelectCut={(cut) => handleDeleteCut(roll.id, cut)}
                            onManualPlacementChange={(pos) => {
                              if (pos) {
                                setManualPlacement({ rollId: roll.id, placement: pos });
                              } else {
                                setManualPlacement(null);
                              }
                            }}
                            onManualPlacementConfirm={(pos) => {
                              const result = { rollId: roll.id, placement: pos };
                              handleExecuteCutWithPlacement(result, roll);
                            }}
                            suggestedPlacement={(currentResult?.rollId === roll.id) ? { ...(currentResult as any).placement, width: activeOrderDimensions.width, length: activeOrderDimensions.length } : null}
                            onMaximize={() => setFullscreenRollId(roll.id)}
                            allRolls={rolls}
                          />
                        );
                      })}

                      {visibleRolls.length === 0 && (
                        <div className="py-20 flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 rounded-3xl text-zinc-400 text-sm font-medium">
                          No active rolls or remnants match selected material: {selectedOrder.materialType}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'stock' && (
            <div className="space-y-5">

              {/* ── TOP: Six summary selector tiles ── */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">

                {/* Tile 1 – Material Stocks */}
                <button
                  type="button"
                  onClick={() => setActiveInventoryCard(activeInventoryCard === 'materials' ? null : 'materials')}
                  className={`group w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex items-center gap-4 shadow-sm hover:shadow-md ${activeInventoryCard === 'materials'
                    ? 'bg-zinc-950 border-zinc-950 text-white shadow-lg'
                    : 'bg-white border-zinc-200 text-slate-800 hover:border-zinc-400'
                    }`}
                >
                  <div className={`p-2.5 rounded-xl shrink-0 ${activeInventoryCard === 'materials' ? 'bg-white/10' : 'bg-zinc-100'
                    }`}>
                    <Package size={20} className={activeInventoryCard === 'materials' ? 'text-white' : 'text-zinc-700'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[9px] font-black uppercase tracking-widest ${activeInventoryCard === 'materials' ? 'text-zinc-400' : 'text-slate-400'
                      }`}>Material Stocks</p>
                    <p className={`text-xl font-black leading-none mt-0.5 ${activeInventoryCard === 'materials' ? 'text-white' : 'text-zinc-950'
                      }`}>{materialStocks.length}</p>
                    <p className={`text-[9px] font-bold mt-1 ${activeInventoryCard === 'materials' ? 'text-zinc-400' : 'text-slate-400'
                      }`}>items tracked</p>
                  </div>
                  <ChevronRight size={16} className={`shrink-0 transition-transform duration-200 ${activeInventoryCard === 'materials' ? 'text-white rotate-90' : 'text-slate-300 group-hover:text-slate-500'
                    }`} />
                </button>

                {/* Tile 2 – Cutting Belt */}
                <button
                  type="button"
                  onClick={() => setActiveInventoryCard(activeInventoryCard === 'remnants' ? null : 'remnants')}
                  className={`group w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex items-center gap-4 shadow-sm hover:shadow-md ${activeInventoryCard === 'remnants'
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg'
                    : 'bg-white border-zinc-200 text-slate-800 hover:border-emerald-400'
                    }`}
                >
                  <div className={`p-2.5 rounded-xl shrink-0 ${activeInventoryCard === 'remnants' ? 'bg-white/15' : 'bg-emerald-50'
                    }`}>
                    <Scissors size={20} className={activeInventoryCard === 'remnants' ? 'text-white' : 'text-emerald-600'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[9px] font-black uppercase tracking-widest ${activeInventoryCard === 'remnants' ? 'text-emerald-100' : 'text-slate-400'
                      }`}>Cutting Belt</p>
                    <p className={`text-xl font-black leading-none mt-0.5 ${activeInventoryCard === 'remnants' ? 'text-white' : 'text-zinc-950'
                      }`}>{rolls.filter(r => r.status !== 'refused' && isRollReuse(r)).length}</p>
                    <p className={`text-[9px] font-bold mt-1 ${activeInventoryCard === 'remnants' ? 'text-emerald-100' : 'text-slate-400'
                      }`}>remnants in stock</p>
                  </div>
                  <ChevronRight size={16} className={`shrink-0 transition-transform duration-200 ${activeInventoryCard === 'remnants' ? 'text-white rotate-90' : 'text-slate-300 group-hover:text-emerald-400'
                    }`} />
                </button>

                {/* Tile 3 – Fresh Rolls */}
                <button
                  type="button"
                  onClick={() => setActiveInventoryCard(activeInventoryCard === 'fresh' ? null : 'fresh')}
                  className={`group w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex items-center gap-4 shadow-sm hover:shadow-md ${activeInventoryCard === 'fresh'
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg'
                    : 'bg-white border-zinc-200 text-slate-800 hover:border-indigo-400'
                    }`}
                >
                  <div className={`p-2.5 rounded-xl shrink-0 ${activeInventoryCard === 'fresh' ? 'bg-white/15' : 'bg-indigo-50'
                    }`}>
                    <Warehouse size={20} className={activeInventoryCard === 'fresh' ? 'text-white' : 'text-indigo-600'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[9px] font-black uppercase tracking-widest ${activeInventoryCard === 'fresh' ? 'text-indigo-100' : 'text-slate-400'
                      }`}>Fresh Rolls</p>
                    <p className={`text-xl font-black leading-none mt-0.5 ${activeInventoryCard === 'fresh' ? 'text-white' : 'text-zinc-950'
                      }`}>{rolls.filter(r => r.status !== 'refused' && !isRollReuse(r)).length}</p>
                    <p className={`text-[9px] font-bold mt-1 ${activeInventoryCard === 'fresh' ? 'text-indigo-100' : 'text-slate-400'
                      }`}>master rolls</p>
                  </div>
                  <ChevronRight size={16} className={`shrink-0 transition-transform duration-200 ${activeInventoryCard === 'fresh' ? 'text-white rotate-90' : 'text-slate-300 group-hover:text-indigo-400'
                    }`} />
                </button>

                {/* Tile 3.5 – Ready Belt Stock */}
                <button
                  type="button"
                  onClick={() => setActiveInventoryCard(activeInventoryCard === 'ready_belt' ? null : 'ready_belt')}
                  className={`group w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex items-center gap-4 shadow-sm hover:shadow-md ${activeInventoryCard === 'ready_belt'
                    ? 'bg-cyan-600 border-cyan-600 text-white shadow-lg'
                    : 'bg-white border-zinc-200 text-slate-800 hover:border-cyan-400'
                    }`}
                >
                  <div className={`p-2.5 rounded-xl shrink-0 ${activeInventoryCard === 'ready_belt' ? 'bg-white/15' : 'bg-cyan-50'
                    }`}>
                    <Layers size={20} className={activeInventoryCard === 'ready_belt' ? 'text-white' : 'text-cyan-600'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[9px] font-black uppercase tracking-widest ${activeInventoryCard === 'ready_belt' ? 'text-cyan-100' : 'text-slate-400'
                      }`}>Ready Belt Stock</p>
                    <p className={`text-xl font-black leading-none mt-0.5 ${activeInventoryCard === 'ready_belt' ? 'text-white' : 'text-zinc-950'
                      }`}>{readyBeltStocks.length}</p>
                    <p className={`text-[9px] font-bold mt-1 ${activeInventoryCard === 'ready_belt' ? 'text-cyan-100' : 'text-slate-400'
                      }`}>belts tracked</p>
                  </div>
                  <ChevronRight size={16} className={`shrink-0 transition-transform duration-200 ${activeInventoryCard === 'ready_belt' ? 'text-white rotate-90' : 'text-slate-300 group-hover:text-cyan-400'
                    }`} />
                </button>

                {/* Tile 4 - Reorder Level */}
                {(() => {
                  const alertCount = materialStocks.filter(s => s.reorderLevel > 0 && s.quantity <= s.reorderLevel).length;
                  const lowFreshRollsCount = rolls.filter(r => r.status !== 'refused' && !isRollReuse(r) && r.reorderLevel > 0 && r.remainingSqm <= r.reorderLevel).length;
                  const lowRemnantsCount = rolls.filter(r => r.status !== 'refused' && isRollReuse(r) && r.remainingSqm <= 0.01).length;
                  const lowMaterialTypesCount = materialTypeStocks.filter(m => m.isLow).length;
                  const totalAlerts = alertCount + lowFreshRollsCount + lowRemnantsCount + lowMaterialTypesCount;
                  return (
                    <button
                      type="button"
                      onClick={() => setActiveInventoryCard(activeInventoryCard === 'reorder' ? null : 'reorder')}
                      className={`group w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex items-center gap-4 shadow-sm hover:shadow-md ${activeInventoryCard === 'reorder'
                        ? 'bg-amber-500 border-amber-500 text-white shadow-lg'
                        : totalAlerts > 0
                          ? 'bg-amber-50 border-amber-300 text-slate-800 hover:border-amber-500'
                          : 'bg-white border-zinc-200 text-slate-800 hover:border-amber-400'
                        }`}
                    >
                      <div className={`p-2.5 rounded-xl shrink-0 ${activeInventoryCard === 'reorder' ? 'bg-white/15' : totalAlerts > 0 ? 'bg-amber-100' : 'bg-amber-50'
                        }`}>
                        <AlertTriangle size={20} className={activeInventoryCard === 'reorder' ? 'text-white' : 'text-amber-500'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[9px] font-black uppercase tracking-widest ${activeInventoryCard === 'reorder' ? 'text-amber-100' : 'text-slate-400'
                          }`}>Reorder Level</p>
                        <p className={`text-xl font-black leading-none mt-0.5 ${activeInventoryCard === 'reorder' ? 'text-white' : totalAlerts > 0 ? 'text-amber-600' : 'text-zinc-950'
                          }`}>{totalAlerts}</p>
                        <p className={`text-[9px] font-bold mt-1 ${activeInventoryCard === 'reorder' ? 'text-amber-100' : totalAlerts > 0 ? 'text-amber-500 font-black' : 'text-slate-400'
                          }`}>{totalAlerts > 0 ? '⚠️ items/rolls alert' : 'all levels OK'}</p>
                      </div>
                      <ChevronRight size={16} className={`shrink-0 transition-transform duration-200 ${activeInventoryCard === 'reorder' ? 'text-white rotate-90' : totalAlerts > 0 ? 'text-amber-400 group-hover:text-amber-600' : 'text-slate-300 group-hover:text-amber-400'
                        }`} />
                    </button>
                  );
                })()}

                {/* Tile 5 - Request For Approval */}
                {(() => {
                  const pendingCount = materialRequests.filter(r => r.status === 'pending').length;
                  return (
                    <button
                      type="button"
                      onClick={() => setActiveInventoryCard(activeInventoryCard === 'requests' ? null : 'requests')}
                      className={`group w-full text-left p-4 rounded-2xl border-2 transition-all duration-200 cursor-pointer flex items-center gap-4 shadow-sm hover:shadow-md ${activeInventoryCard === 'requests'
                        ? 'bg-violet-600 border-violet-600 text-white shadow-lg'
                        : pendingCount > 0
                          ? 'bg-violet-50 border-violet-300 text-slate-800 hover:border-violet-500'
                          : 'bg-white border-zinc-200 text-slate-800 hover:border-violet-400'
                        }`}
                    >
                      <div className={`p-2.5 rounded-xl shrink-0 ${activeInventoryCard === 'requests' ? 'bg-white/15' : pendingCount > 0 ? 'bg-violet-100' : 'bg-violet-50'
                        }`}>
                        <ClipboardList size={20} className={activeInventoryCard === 'requests' ? 'text-white' : 'text-violet-600'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-[9px] font-black uppercase tracking-widest ${activeInventoryCard === 'requests' ? 'text-violet-100' : 'text-slate-400'
                            }`}>Request For Approval</p>
                          {pendingCount > 0 && activeInventoryCard !== 'requests' && (
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[9px] font-extrabold leading-none text-white bg-rose-500 rounded-full animate-pulse">
                              {pendingCount}
                            </span>
                          )}
                        </div>
                        <p className={`text-xl font-black leading-none mt-0.5 ${activeInventoryCard === 'requests' ? 'text-white' : 'text-zinc-950'
                          }`}>{pendingCount}</p>
                        <p className={`text-[9px] font-bold mt-1 ${activeInventoryCard === 'requests' ? 'text-violet-100' : pendingCount > 0 ? 'text-violet-600 font-black' : 'text-slate-400'
                          }`}>{pendingCount > 0 ? 'pending action' : 'no pending requests'}</p>
                      </div>
                      <ChevronRight size={16} className={`shrink-0 transition-transform duration-200 ${activeInventoryCard === 'requests' ? 'text-white rotate-90' : pendingCount > 0 ? 'text-violet-400 group-hover:text-violet-600' : 'text-slate-300 group-hover:text-violet-400'
                        }`} />
                    </button>
                  );
                })()}

              </div>

              {/* ── BOTTOM: Expanded content panel (renders ONLY the active card in full width) ── */}
              <div className="w-full">

                {/* CARD 1: Material Stocks */}
                {activeInventoryCard === 'materials' && (
                  <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 animate-in fade-in duration-300 flex flex-col w-full">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-zinc-100 shrink-0">
                          <Package size={16} className="text-zinc-700" />
                        </div>
                        Material Stocks
                        <span className="text-[10px] font-black text-zinc-500 bg-zinc-100 border border-zinc-200 px-2.5 py-0.5 rounded-full ml-1.5">
                          {filteredMaterialStocksList.length} items
                        </span>
                      </h3>
                      <button
                        onClick={() => setShowAddMaterialForm(!showAddMaterialForm)}
                        className="px-3 py-1.5 bg-zinc-950 text-white rounded-lg font-black text-[10px] hover:bg-zinc-800 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus size={12} /> {showAddMaterialForm ? 'CANCEL' : 'ADD NEW'}
                      </button>
                    </div>

                    {showAddMaterialForm && (
                      <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Material Name</label>
                            <div className="flex flex-col gap-1.5">
                              <SearchableSelect
                                options={[
                                  { value: 'custom', label: '-- Type Custom Name --' },
                                  ...bomComponentNames.map(name => ({ value: name, label: name }))
                                ]}
                                value={bomComponentNames.includes(newMaterialStock.name) ? newMaterialStock.name : 'custom'}
                                onChange={(val) => {
                                  if (val === 'custom') {
                                    setNewMaterialStock({ ...newMaterialStock, name: '' });
                                  } else {
                                    let defaultUnit = 'pcs';
                                    if (config && Array.isArray(config.beltTypes)) {
                                      config.beltTypes.forEach((cat: any) => {
                                        if (Array.isArray(cat.styles)) {
                                          cat.styles.forEach((style: any) => {
                                            if (Array.isArray(style.bom)) {
                                              style.bom.forEach((item: any) => {
                                                if (item.name === val) {
                                                  defaultUnit = item.unit || 'pcs';
                                                }
                                                if (Array.isArray(item.options)) {
                                                  item.options.forEach((opt: any) => {
                                                    if (opt.name && opt.name.trim() === val) {
                                                      defaultUnit = opt.unit || item.unit || 'pcs';
                                                    }
                                                  });
                                                }
                                              });
                                            }
                                          });
                                        }
                                      });
                                    }
                                    setNewMaterialStock({ ...newMaterialStock, name: val, unit: defaultUnit });
                                  }
                                }}
                              />
                              {(!bomComponentNames.includes(newMaterialStock.name) || newMaterialStock.name === '') && (
                                <input
                                  type="text"
                                  placeholder="Custom name..."
                                  value={newMaterialStock.name}
                                  onChange={(e) => setNewMaterialStock({ ...newMaterialStock, name: e.target.value })}
                                  className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-zinc-950"
                                />
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                              Quantity {formLots.length > 0 && <span className="text-emerald-600 font-bold">(Auto-calculated)</span>}
                            </label>
                            <input
                              type="number"
                              placeholder="0"
                              value={newMaterialStock.quantity}
                              disabled={formLots.length > 0}
                              onChange={(e) => setNewMaterialStock({ ...newMaterialStock, quantity: e.target.value })}
                              className={`w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-zinc-950 ${formLots.length > 0 ? 'opacity-70 bg-zinc-50 border-zinc-300 cursor-not-allowed' : ''}`}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Unit</label>
                            <input
                              type="text"
                              list="add-unit-suggestions"
                              placeholder="PCS, MTR, KG..."
                              value={newMaterialStock.unit}
                              onChange={(e) => setNewMaterialStock({ ...newMaterialStock, unit: e.target.value })}
                              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-zinc-950"
                            />
                            <datalist id="add-unit-suggestions">
                              <option value="PCS" />
                              <option value="MTR" />
                              <option value="KG" />
                            </datalist>
                          </div>
                        </div>

                        {/* Lots & Weights Section */}
                        <div className="border-t border-slate-200/60 pt-4 mt-2">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1">
                              <Layers size={14} className="text-zinc-600" /> Lots & Piece Weights (Optional)
                            </h4>
                            <button
                              type="button"
                              onClick={() => {
                                setFormLots([...formLots, { lotNumber: `Lot ${formLots.length + 1}`, pieces: [] }]);
                              }}
                              className="px-2.5 py-1 bg-zinc-950 text-white hover:bg-zinc-800 rounded text-[9px] font-black uppercase flex items-center gap-1 cursor-pointer transition active:scale-95 shadow-sm"
                            >
                              <Plus size={11} /> Add Lot
                            </button>
                          </div>

                          {formLots.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic">No lots added. Quantity will be entered manually.</p>
                          ) : (
                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                              {formLots.map((lot, lIdx) => (
                                <div key={lIdx} className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Lot No</span>
                                      <input
                                        type="text"
                                        value={lot.lotNumber}
                                        onChange={(e) => {
                                          const updated = [...formLots];
                                          updated[lIdx].lotNumber = e.target.value;
                                          setFormLots(updated);
                                        }}
                                        className="px-2 py-0.5 border border-slate-200 rounded font-bold text-xs bg-slate-50 w-36"
                                      />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = [...formLots];
                                          const nextNo = lot.pieces.length + 1;
                                          updated[lIdx].pieces.push({ pieceNo: nextNo, weight: 0 });
                                          setFormLots(updated);
                                        }}
                                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[9.5px] font-black uppercase cursor-pointer transition active:scale-95"
                                      >
                                        + Add Piece
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = formLots.filter((_, i) => i !== lIdx);
                                          setFormLots(updated);
                                        }}
                                        className="p-1 hover:bg-red-50 text-red-500 rounded cursor-pointer transition"
                                        title="Delete Lot"
                                      >
                                        <Trash2 size={13} />
                                      </button>
                                    </div>
                                  </div>

                                  {lot.pieces.length === 0 ? (
                                    <p className="text-[10px] text-slate-400 italic pl-1">No pieces in this lot yet.</p>
                                  ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pl-1">
                                      {lot.pieces.map((piece, pIdx) => (
                                        <div key={pIdx} className="flex items-center border border-slate-100 rounded-xl p-2 bg-slate-50/50 justify-between gap-1">
                                          <div className="flex flex-col">
                                            <span className="text-[7.5px] font-black text-slate-400 uppercase">Piece #{piece.pieceNo}</span>
                                            <div className="flex items-center gap-1 mt-0.5">
                                              <input
                                                type="number"
                                                step="0.001"
                                                placeholder="Weight"
                                                value={piece.weight || ''}
                                                onChange={(e) => {
                                                  const updated = [...formLots];
                                                  updated[lIdx].pieces[pIdx].weight = parseFloat(e.target.value) || 0;
                                                  setFormLots(updated);
                                                }}
                                                className="w-16 px-1.5 py-0.5 border border-slate-200 rounded font-mono font-bold text-[10px] text-center bg-white"
                                              />
                                              <span className="text-[8px] font-bold text-slate-400 font-mono">{newMaterialStock.unit || 'kg'}</span>
                                            </div>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = [...formLots];
                                              updated[lIdx].pieces = lot.pieces.filter((_, i) => i !== pIdx);
                                              updated[lIdx].pieces.forEach((p, idx) => {
                                                p.pieceNo = idx + 1;
                                              });
                                              setFormLots(updated);
                                            }}
                                            className="p-1 hover:bg-red-50 text-red-400 hover:text-red-600 rounded cursor-pointer transition"
                                            title="Remove Piece"
                                          >
                                            <X size={12} />
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={handleAddMaterialStock}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-black text-xs uppercase tracking-wider transition cursor-pointer"
                        >
                          SAVE MATERIAL
                        </button>
                      </div>
                    )}

                    {/* Searcher */}
                    <div className="relative mb-4">
                      <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search Material Stocks..."
                        value={materialSearchQuery}
                        onChange={(e) => setMaterialSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 placeholder-zinc-400 shadow-sm text-left"
                      />
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto border border-zinc-200 rounded-2xl shadow-sm">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 border-b border-zinc-200">
                          <tr>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material Name</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Available Stock</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest w-32">Refill</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right w-32">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-150">
                          {filteredMaterialStocksList.map((item) => {
                            const isEditing = editingMaterialStock?.id === item.id;
                            const isExpanded = expandedStockIds.includes(item.id) || isEditing;
                            return (
                              <React.Fragment key={item.id}>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                  {isEditing ? (
                                    <>
                                      <td className="px-4 py-3">
                                        <input
                                          type="text"
                                          value={editingMaterialStock.name}
                                          onChange={(e) => setEditingMaterialStock({ ...editingMaterialStock, name: e.target.value })}
                                          className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-xs font-bold bg-white"
                                        />
                                      </td>
                                      <td className="px-4 py-3" colSpan={2}>
                                        <div className="flex gap-2">
                                          <input
                                            type="number"
                                            value={editingMaterialStock.quantity}
                                            disabled={formLots.length > 0}
                                            onChange={(e) => setEditingMaterialStock({ ...editingMaterialStock, quantity: parseFloat(e.target.value) || 0 })}
                                            className={`w-24 px-3 py-2 border border-zinc-300 rounded-lg text-xs font-bold text-center bg-white ${formLots.length > 0 ? 'opacity-70 bg-zinc-50 border-zinc-200 cursor-not-allowed' : ''}`}
                                          />
                                          <div className="flex flex-col gap-1">
                                            <input
                                              type="text"
                                              list={`edit-unit-suggestions-${editingMaterialStock.id}`}
                                              placeholder="Unit..."
                                              value={editingMaterialStock.unit}
                                              onChange={(e) => setEditingMaterialStock({ ...editingMaterialStock, unit: e.target.value })}
                                              className="w-24 px-2 py-2 border border-zinc-300 rounded-lg text-xs font-bold text-center bg-white"
                                            />
                                            <datalist id={`edit-unit-suggestions-${editingMaterialStock.id}`}>
                                              <option value="PCS" />
                                              <option value="MTR" />
                                              <option value="KG" />
                                            </datalist>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-right">
                                        <div className="flex gap-1.5 justify-end">
                                          <button
                                            onClick={handleUpdateMaterialStock}
                                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-1 cursor-pointer"
                                            title="Save"
                                          >
                                            <Check size={13} /> Save
                                          </button>
                                          <button
                                            onClick={() => setEditingMaterialStock(null)}
                                            className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-[10px] font-black uppercase cursor-pointer"
                                            title="Cancel"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </td>
                                    </>
                                  ) : (
                                    <>
                                      <td className="px-4 py-3 font-black text-sm text-slate-800">
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={() => {
                                              const exp = expandedStockIds.includes(item.id);
                                              if (exp) {
                                                setExpandedStockIds(expandedStockIds.filter(id => id !== item.id));
                                              } else {
                                                setExpandedStockIds([...expandedStockIds, item.id]);
                                              }
                                            }}
                                            className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-800 transition cursor-pointer"
                                            title={expandedStockIds.includes(item.id) ? "Collapse Details" : "Expand Details"}
                                          >
                                            <ChevronRight
                                              size={15}
                                              className={`transition-transform duration-200 ${expandedStockIds.includes(item.id) ? 'rotate-90' : ''}`}
                                            />
                                          </button>
                                          <span>{item.name}</span>
                                          {item.lots && item.lots.length > 0 && (
                                            <span className="text-[8px] font-black text-indigo-600 bg-indigo-50 border border-indigo-150 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                                              {item.lots.length} Lots
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-4 py-3">
                                        <span className="text-[11px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-lg">
                                          {item.quantity} {item.unit}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5">
                                          <input
                                            type="number"
                                            placeholder="+ Qty"
                                            id={`refill-qty-${item.id}`}
                                            className="w-16 px-2.5 py-1.5 border border-zinc-200 rounded-lg text-xs font-bold bg-white text-center focus:outline-none focus:ring-2 focus:ring-zinc-950"
                                            onKeyDown={async (e) => {
                                              if (e.key === 'Enter') {
                                                const inputEl = document.getElementById(`refill-qty-${item.id}`) as HTMLInputElement;
                                                const val = parseFloat(inputEl?.value || '');
                                                if (val > 0) {
                                                  if (window.confirm(`Are you sure you want to refill ${item.name} by ${val} ${item.unit}?`)) {
                                                    try {
                                                      const res = await fetch(`/api/material-stocks/${item.id}/refill`, {
                                                        method: 'PATCH',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ addQuantity: val })
                                                      });
                                                      if (res.ok) {
                                                        toast.success(`Refilled ${val} ${item.unit} to ${item.name}!`);
                                                        inputEl.value = '';
                                                        loadMaterialStocksData();
                                                      } else {
                                                        toast.error("Failed to refill stock");
                                                      }
                                                    } catch (err) {
                                                      toast.error("Failed to refill stock");
                                                    }
                                                  }
                                                }
                                              }
                                            }}
                                          />
                                          <button
                                            onClick={async () => {
                                              const inputEl = document.getElementById(`refill-qty-${item.id}`) as HTMLInputElement;
                                              const val = parseFloat(inputEl?.value || '');
                                              if (val > 0) {
                                                if (window.confirm(`Are you sure you want to refill ${item.name} by ${val} ${item.unit}?`)) {
                                                  try {
                                                    const res = await fetch(`/api/material-stocks/${item.id}/refill`, {
                                                      method: 'PATCH',
                                                      headers: { 'Content-Type': 'application/json' },
                                                      body: JSON.stringify({ addQuantity: val })
                                                    });
                                                    if (res.ok) {
                                                      toast.success(`Refilled ${val} ${item.unit} to ${item.name}!`);
                                                      inputEl.value = '';
                                                      loadMaterialStocksData();
                                                    } else {
                                                      toast.error("Failed to refill stock");
                                                    }
                                                  } catch (err) {
                                                    toast.error("Failed to refill stock");
                                                  }
                                                }
                                              } else {
                                                toast.error("Enter a valid quantity to refill");
                                              }
                                            }}
                                            className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-[10px] font-bold uppercase transition"
                                          >
                                            Refill
                                          </button>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-right">
                                        <div className="flex gap-2 justify-end items-center">
                                          <button
                                            onClick={() => setEditingMaterialStock(item)}
                                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                                            title="Edit"
                                          >
                                            <Edit2 size={14} />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteMaterialStock(item.id, item.name)}
                                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                            title="Delete"
                                          >
                                            <Trash2 size={14} />
                                          </button>
                                        </div>
                                      </td>
                                    </>
                                  )}
                                </tr>
                                {isExpanded && (
                                  <tr className="bg-slate-50/40">
                                    <td colSpan={4} className="px-6 py-4 border-b border-zinc-200">
                                      {isEditing ? (
                                        <div className="space-y-3 bg-blue-50/20 p-4 rounded-2xl border border-blue-150">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-black text-blue-800 uppercase tracking-widest flex items-center gap-1.5">
                                              <Layers size={14} /> Edit Lots & Weights (Quantity will auto-update)
                                            </span>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setFormLots([...formLots, { lotNumber: `Lot ${formLots.length + 1}`, pieces: [] }]);
                                              }}
                                              className="px-2.5 py-1 bg-zinc-950 text-white hover:bg-zinc-800 rounded text-[9px] font-black uppercase flex items-center gap-1 cursor-pointer transition active:scale-95 shadow-sm"
                                            >
                                              <Plus size={11} /> Add Lot
                                            </button>
                                          </div>
                                          {formLots.length === 0 ? (
                                            <p className="text-[10px] text-slate-400 italic">No lots added. Quantity can be entered manually above.</p>
                                          ) : (
                                            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                                              {formLots.map((lot, lIdx) => (
                                                <div key={lIdx} className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                                                  <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                                    <div className="flex items-center gap-2">
                                                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Lot No</span>
                                                      <input
                                                        type="text"
                                                        value={lot.lotNumber}
                                                        onChange={(e) => {
                                                          const updated = [...formLots];
                                                          updated[lIdx].lotNumber = e.target.value;
                                                          setFormLots(updated);
                                                        }}
                                                        className="px-2 py-0.5 border border-slate-200 rounded font-bold text-xs bg-slate-50 w-36"
                                                      />
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                      <button
                                                        type="button"
                                                        onClick={() => {
                                                          const updated = [...formLots];
                                                          const nextNo = lot.pieces.length + 1;
                                                          updated[lIdx].pieces.push({ pieceNo: nextNo, weight: 0 });
                                                          setFormLots(updated);
                                                        }}
                                                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[9.5px] font-black uppercase cursor-pointer transition active:scale-95"
                                                      >
                                                        + Add Piece
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={() => {
                                                          const updated = formLots.filter((_, i) => i !== lIdx);
                                                          setFormLots(updated);
                                                        }}
                                                        className="p-1 hover:bg-red-50 text-red-500 rounded cursor-pointer transition"
                                                        title="Delete Lot"
                                                      >
                                                        <Trash2 size={13} />
                                                      </button>
                                                    </div>
                                                  </div>

                                                  {lot.pieces.length === 0 ? (
                                                    <p className="text-[10px] text-slate-400 italic pl-1">No pieces in this lot yet.</p>
                                                  ) : (
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pl-1">
                                                      {lot.pieces.map((piece, pIdx) => (
                                                        <div key={pIdx} className="flex items-center border border-slate-100 rounded-xl p-2 bg-slate-50/50 justify-between gap-1">
                                                          <div className="flex flex-col">
                                                            <span className="text-[7.5px] font-black text-slate-400 uppercase">Piece #{piece.pieceNo}</span>
                                                            <div className="flex items-center gap-1 mt-0.5">
                                                              <input
                                                                type="number"
                                                                step="0.001"
                                                                placeholder="Weight"
                                                                value={piece.weight || ''}
                                                                onChange={(e) => {
                                                                  const updated = [...formLots];
                                                                  updated[lIdx].pieces[pIdx].weight = parseFloat(e.target.value) || 0;
                                                                  setFormLots(updated);
                                                                }}
                                                                className="w-16 px-1.5 py-0.5 border border-slate-200 rounded font-mono font-bold text-[10px] text-center bg-white"
                                                              />
                                                              <span className="text-[8px] font-bold text-slate-400 font-mono">{editingMaterialStock?.unit || 'kg'}</span>
                                                            </div>
                                                          </div>
                                                          <button
                                                            type="button"
                                                            onClick={() => {
                                                              const updated = [...formLots];
                                                              updated[lIdx].pieces = lot.pieces.filter((_, i) => i !== pIdx);
                                                              updated[lIdx].pieces.forEach((p, idx) => {
                                                                p.pieceNo = idx + 1;
                                                              });
                                                              setFormLots(updated);
                                                            }}
                                                            className="p-1 hover:bg-red-50 text-red-400 hover:text-red-600 rounded cursor-pointer transition"
                                                            title="Remove Piece"
                                                          >
                                                            <X size={12} />
                                                          </button>
                                                        </div>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="bg-slate-50/50 p-4 rounded-2xl border border-slate-150 space-y-3">
                                          <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                              <Layers size={12} /> Lots & Pieces Details ({item.lots?.length || 0} Lots)
                                            </span>
                                            <button
                                              onClick={() => {
                                                setExpandedStockIds(expandedStockIds.filter(id => id !== item.id));
                                              }}
                                              className="text-[9px] font-black text-slate-400 hover:text-slate-600 uppercase cursor-pointer"
                                            >
                                              Close Details
                                            </button>
                                          </div>

                                          {(!item.lots || item.lots.length === 0) ? (
                                            <p className="text-[10.5px] text-slate-400 font-semibold italic">No detailed lots tracked for this material. Click edit to add lots.</p>
                                          ) : (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                              {item.lots.map((lot: any, lotIdx: number) => {
                                                const totalWeight = lot.pieces?.reduce((sum: number, p: any) => sum + (p.weight || 0), 0) || 0;
                                                return (
                                                  <div key={lotIdx} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 space-y-2">
                                                    <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                                                      <span className="font-black text-xs text-slate-800 uppercase tracking-tight">{lot.lotNumber}</span>
                                                      <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md uppercase">
                                                        {lot.pieces?.length || 0} Pieces {totalWeight > 0 && `(Total: ${totalWeight.toFixed(3)} ${item.unit || 'kg'})`}
                                                      </span>
                                                    </div>
                                                    <div className="overflow-x-auto">
                                                      <table className="w-full text-left text-[10px] border-collapse">
                                                        <thead>
                                                          <tr className="text-slate-400 font-bold uppercase tracking-widest border-b border-slate-100">
                                                            <th className="py-1">No.</th>
                                                            <th className="py-1 text-right">{item.unit === 'kg' ? 'Weight' : 'Qty'} ({item.unit || 'kg'})</th>
                                                          </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-50 font-mono font-bold text-slate-600">
                                                          {lot.pieces?.map((piece: any, pIdx: number) => (
                                                            <tr key={pIdx} className="hover:bg-slate-50/50">
                                                              <td className="py-1">{piece.pieceNo}</td>
                                                              <td className="py-1 text-right">{piece.weight > 0 ? piece.weight.toFixed(3) : '-'}</td>
                                                            </tr>
                                                          ))}
                                                        </tbody>
                                                      </table>
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                          })}

                          {filteredMaterialStocksList.length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-16 text-center text-zinc-400 font-semibold text-xs italic">
                                No materials found.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* CARD 1.5: Ready Belt Stock */}
                {activeInventoryCard === 'ready_belt' && (
                  <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 animate-in fade-in duration-300 flex flex-col w-full">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-cyan-50 shrink-0">
                          <Layers size={16} className="text-cyan-600" />
                        </div>
                        Ready Belt Stock
                        <span className="text-[10px] font-black text-cyan-600 bg-cyan-50 border border-cyan-155 px-2.5 py-0.5 rounded-full ml-1.5">
                          {filteredReadyBeltStocksList.length} items
                        </span>
                      </h3>
                      <button
                        onClick={() => {
                          setEditingReadyBeltStock(null);
                          setShowAddReadyBeltForm(!showAddReadyBeltForm);
                        }}
                        className="px-3 py-1.5 bg-zinc-950 text-white rounded-lg font-black text-[10px] hover:bg-zinc-800 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus size={12} /> {showAddReadyBeltForm ? 'CANCEL' : 'ADD NEW'}
                      </button>
                    </div>

                    {showAddReadyBeltForm && (
                      <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3 animate-in fade-in slide-in-from-top-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Category</label>
                            <SearchableSelect
                              options={[
                                { value: 'BROWN BELT', label: 'BROWN BELT' },
                                { value: 'BLACK BELT', label: 'BLACK BELT' }
                              ]}
                              value={newReadyBeltStock.category}
                              onChange={(val) => setNewReadyBeltStock({ ...newReadyBeltStock, category: val })}
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Belt Stock Name</label>
                            <SearchableSelect
                              options={[
                                { value: 'custom', label: '-- Custom Name --' },
                                { value: 'SIALI BELT', label: 'SIALI BELT' },
                                { value: 'WITHOUT SILAI', label: 'WITHOUT SILAI' },
                                { value: 'CROSS JOINT', label: 'CROSS JOINT' },
                                { value: 'SILAI BELT', label: 'SILAI BELT' }
                              ]}
                              value={['SIALI BELT', 'WITHOUT SILAI', 'CROSS JOINT', 'SILAI BELT'].includes(newReadyBeltStock.beltStock) ? newReadyBeltStock.beltStock : 'custom'}
                              onChange={(val) => {
                                if (val === 'custom') {
                                  setNewReadyBeltStock({ ...newReadyBeltStock, beltStock: '' });
                                } else {
                                  setNewReadyBeltStock({ ...newReadyBeltStock, beltStock: val });
                                }
                              }}
                            />
                            {(!['SIALI BELT', 'WITHOUT SILAI', 'CROSS JOINT', 'SILAI BELT'].includes(newReadyBeltStock.beltStock) || newReadyBeltStock.beltStock === '') && (
                              <input
                                type="text"
                                placeholder="Type Custom Belt name..."
                                value={newReadyBeltStock.beltStock}
                                onChange={(e) => setNewReadyBeltStock({ ...newReadyBeltStock, beltStock: e.target.value })}
                                className="w-full mt-1.5 px-3 py-2 border border-zinc-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-zinc-950"
                              />
                            )}
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Size</label>
                            <input
                              type="text"
                              placeholder='e.g. 97" X 63" or 2.20M X 63"'
                              value={newReadyBeltStock.size}
                              onChange={(e) => setNewReadyBeltStock({ ...newReadyBeltStock, size: e.target.value })}
                              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-zinc-950"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Opening Pieces</label>
                            <input
                              type="number"
                              placeholder="0"
                              value={newReadyBeltStock.openingPisc}
                              onChange={(e) => setNewReadyBeltStock({ ...newReadyBeltStock, openingPisc: e.target.value })}
                              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-zinc-950"
                            />
                          </div>
                        </div>

                        <button
                          onClick={handleAddReadyBeltStock}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-black text-xs uppercase tracking-wider transition cursor-pointer"
                        >
                          SAVE READY BELT STOCK
                        </button>
                      </div>
                    )}

                    {/* Searcher & Date Picker */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
                        <input
                          type="text"
                          placeholder="Search Ready Belt Stocks by name, category, size, SO or receiver..."
                          value={readyBeltSearchQuery}
                          onChange={(e) => setReadyBeltSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 placeholder-zinc-400 shadow-sm text-left"
                        />
                      </div>
                      <div className="flex items-center gap-2 bg-slate-50 border border-zinc-200 rounded-xl px-3 py-1.5 shadow-sm">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">Filter by Date</label>
                        <input
                          type="date"
                          value={readyBeltDateFilter}
                          onChange={(e) => setReadyBeltDateFilter(e.target.value)}
                          className="border-none bg-transparent text-xs font-bold text-zinc-950 focus:outline-none cursor-pointer"
                        />
                        {readyBeltDateFilter && (
                          <button
                            onClick={() => setReadyBeltDateFilter('')}
                            className="text-xs font-bold text-slate-400 hover:text-slate-650 px-1 cursor-pointer"
                            title="Clear Date Filter"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Grouped Table */}
                    <div className="space-y-6">
                      {Object.keys(readyBeltGroups).map((catName) => (
                        <div key={catName} className="space-y-2">
                          {/* Group Title - Cyan styled header */}
                          <div className="bg-cyan-50/50 border-l-4 border-cyan-500 px-4 py-2 rounded-r-xl flex justify-between items-center">
                            <span className="text-xs font-black text-cyan-900 tracking-wider uppercase font-Outfit">{catName}</span>
                            <span className="text-[10px] font-black text-cyan-600 bg-cyan-100/50 border border-cyan-200 px-2 py-0.5 rounded-lg">
                              {readyBeltGroups[catName].length} items
                            </span>
                          </div>

                          <div className="overflow-x-auto border border-zinc-200 rounded-2xl shadow-sm bg-white">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead className="bg-slate-50 border-b border-zinc-200">
                                <tr>
                                  <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest w-12">Sr.No</th>
                                  <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Belt Stock</th>
                                  <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Size</th>
                                  {readyBeltDateFilter ? (
                                    <>
                                      <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Received</th>
                                      <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Issued</th>
                                      <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Closing Pcs</th>
                                    </>
                                  ) : (
                                    <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Opening Pcs</th>
                                  )}
                                  <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right w-64">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-zinc-150">
                                {readyBeltGroups[catName].map((item, idx) => {
                                  const isEditing = editingReadyBeltStock?.id === item.id;
                                  return (
                                    <React.Fragment key={item.id}>
                                      <tr className="hover:bg-slate-50/50 transition-colors">
                                        {isEditing ? (
                                          <>
                                            <td className="px-4 py-3 font-bold text-slate-400">{idx + 1}</td>
                                            <td className="px-4 py-3">
                                              <input
                                                type="text"
                                                value={editingReadyBeltStock.beltStock}
                                                onChange={(e) => setEditingReadyBeltStock({ ...editingReadyBeltStock, beltStock: e.target.value })}
                                                className="w-full px-2 py-1 border border-zinc-300 rounded text-xs font-bold"
                                              />
                                            </td>
                                            <td className="px-4 py-3">
                                              <input
                                                type="text"
                                                value={editingReadyBeltStock.size}
                                                onChange={(e) => setEditingReadyBeltStock({ ...editingReadyBeltStock, size: e.target.value })}
                                                className="w-full px-2 py-1 border border-zinc-300 rounded text-xs font-bold"
                                              />
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                              <input
                                                type="number"
                                                value={editingReadyBeltStock.openingPisc}
                                                onChange={(e) => setEditingReadyBeltStock({ ...editingReadyBeltStock, openingPisc: parseInt(e.target.value, 10) || 0 })}
                                                disabled={user?.role !== 'admin'}
                                                title={user?.role !== 'admin' ? "Only admin can edit opening stock directly" : ""}
                                                className={`w-16 px-1 py-0.5 border border-zinc-300 rounded text-xs font-bold text-center ${user?.role !== 'admin' ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-white'}`}
                                              />
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                              <div className="flex gap-1 justify-end">
                                                <button
                                                  onClick={handleUpdateReadyBeltStock}
                                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-black uppercase flex items-center gap-0.5 cursor-pointer"
                                                  title="Save"
                                                >
                                                  <Check size={11} /> Save
                                                </button>
                                                <button
                                                  onClick={() => setEditingReadyBeltStock(null)}
                                                  className="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] font-black uppercase cursor-pointer"
                                                  title="Cancel"
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            </td>
                                          </>
                                        ) : (
                                          <>
                                            <td className="px-4 py-3 font-bold text-slate-400">{idx + 1}</td>
                                            <td className="px-4 py-3 font-black text-sm text-slate-800">{item.beltStock}</td>
                                            <td className="px-4 py-3 font-mono font-bold text-slate-650">{item.size}</td>
                                            {readyBeltDateFilter ? (
                                              (() => {
                                                const stats = getStockStatusForDate(item, readyBeltDateFilter);
                                                return (
                                                  <>
                                                    <td className="px-4 py-3 text-center font-bold text-slate-600">
                                                      {stats.received > 0 ? `+${stats.received}` : '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-bold text-amber-600">
                                                      {stats.issued > 0 ? `-${stats.issued}` : '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-black text-cyan-600 bg-cyan-50/50">
                                                      {stats.closing}
                                                    </td>
                                                  </>
                                                );
                                              })()
                                            ) : (
                                              <td className="px-4 py-3 text-center font-bold text-slate-600">{item.openingPisc}</td>
                                            )}
                                            <td className="px-4 py-3 text-right">
                                              <div className="flex gap-1.5 justify-end items-center">
                                                <button
                                                  onClick={() => setSelectedHistoryItem(item)}
                                                  className="px-2 py-1 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 rounded-lg border border-cyan-200 text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer transition-all"
                                                  title="Check Details"
                                                >
                                                  <Info size={11} /> Details
                                                </button>
                                                {!readyBeltDateFilter && (
                                                  <>
                                                    <button
                                                      onClick={() => {
                                                        setSelectedUpdateItem(item);
                                                        setUpdateForm({ recvPisc: '' });
                                                      }}
                                                      className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg border border-emerald-200 text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer transition-all"
                                                      title="Update/Receive Stock"
                                                    >
                                                      <Plus size={11} /> Update
                                                    </button>
                                                    <button
                                                      onClick={() => {
                                                        setSelectedIssueItem(item);
                                                        setIssueForm({ issuesPisc: '', soNo: '', receiverName: '' });
                                                      }}
                                                      className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-705 rounded-lg border border-amber-200 text-[10px] font-black uppercase flex items-center gap-1 cursor-pointer transition-all"
                                                      title="Issue Stock"
                                                    >
                                                      <ArrowDownCircle size={11} /> Issue
                                                    </button>
                                                    <button
                                                      onClick={() => {
                                                        setEditingReadyBeltStock({ ...item });
                                                        setShowAddReadyBeltForm(false);
                                                      }}
                                                      className="p-1 hover:bg-indigo-50 text-indigo-500 rounded-lg transition border border-transparent hover:border-indigo-150 cursor-pointer"
                                                      title="Edit Item"
                                                    >
                                                      <Edit2 size={13} />
                                                    </button>
                                                    <button
                                                      onClick={() => handleDeleteReadyBeltStock(item.id, item.beltStock)}
                                                      className="p-1 hover:bg-rose-55 text-rose-500 rounded-lg transition border border-transparent hover:border-rose-150 cursor-pointer"
                                                      title="Delete Item"
                                                    >
                                                      <Trash2 size={13} />
                                                    </button>
                                                  </>
                                                )}
                                              </div>
                                            </td>
                                          </>
                                        )}
                                      </tr>
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}

                      {Object.keys(readyBeltGroups).length === 0 && (
                        <div className="py-16 text-center text-zinc-400 font-semibold text-xs italic border-2 border-dashed border-zinc-200 rounded-3xl">
                          No ready belt stock found.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* CARD 2: Cutting Belt (Remnants) */}
                {activeInventoryCard === 'remnants' && (
                  <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 animate-in fade-in duration-300 flex flex-col w-full">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-emerald-50 shrink-0">
                          <Scissors size={16} className="text-emerald-600" />
                        </div>
                        Cutting Belt (Remnants)
                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-full ml-1.5">
                          {filteredRemnantRollsList.length} remnants
                        </span>
                      </h3>
                    </div>

                    {/* Searcher */}
                    <div className="relative mb-4">
                      <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search Remnants..."
                        value={remnantSearchQuery}
                        onChange={(e) => setRemnantSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 placeholder-zinc-400 shadow-sm text-left"
                      />
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto border border-zinc-200 rounded-2xl shadow-sm">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 border-b border-zinc-200">
                          <tr>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Roll ID</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material Type</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Size ({currentUnit})</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Remaining Stock</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-150">
                          {filteredRemnantRollsList.map((roll) => {
                            const percentageRemaining = roll.totalSqm > 0 ? (roll.remainingSqm / roll.totalSqm) * 100 : 0;
                            const percentageUsed = 100 - percentageRemaining;
                            const barColor = percentageRemaining > 50 ? 'bg-emerald-500' : percentageRemaining > 20 ? 'bg-amber-500' : 'bg-rose-500';
                            const textColor = percentageRemaining > 50 ? 'text-emerald-700' : percentageRemaining > 20 ? 'text-amber-700' : 'text-rose-700';
                            return (
                              <tr key={roll.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-black text-sm text-slate-800" title={roll.id}>{getShortRollId(roll.id)}</span>
                                    <span className="text-[7.5px] px-1.5 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-full font-black tracking-widest">REUSE</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-bold text-slate-500 text-xs">{roll.materialType}</td>
                                <td className="px-4 py-3 font-extrabold text-slate-800 text-xs">
                                  {fromMeters(roll.fullLength).toFixed(1)} × {fromMeters(roll.fullWidth).toFixed(1)}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="space-y-1.5 max-w-[200px]">
                                    <div className="flex justify-between text-[9px] font-black uppercase tracking-wider">
                                      <span className={textColor}>{percentageRemaining.toFixed(0)}% Left</span>
                                      <span className="text-slate-400">{(roll.remainingSqm * (currentUnit === 'm' ? 1 : CONVERSIONS[currentUnit] * CONVERSIONS[currentUnit])).toFixed(1)}{areaUnit}</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                      <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${percentageRemaining}%` }} />
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex gap-1.5 justify-end">
                                    {roll.status !== 'refused' && (
                                      <button
                                        onClick={() => handleRefuseRoll(roll.id)}
                                        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                                        title="Mark as Waste"
                                      >
                                        <AlertTriangle size={15} />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleDeleteRoll(roll.id)}
                                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                      title="Delete Roll"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}

                          {filteredRemnantRollsList.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-16 text-center text-zinc-400 font-semibold text-xs italic">
                                No remnants in stock.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* CARD 3: Fresh Rolls */}
                {activeInventoryCard === 'fresh' && (
                  <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 animate-in fade-in duration-300 flex flex-col w-full">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-indigo-50 shrink-0">
                          <Warehouse size={16} className="text-indigo-600" />
                        </div>
                        Fresh Rolls
                        <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full ml-1.5">
                          {filteredFreshRollsList.length} rolls
                        </span>
                      </h3>
                      <button
                        onClick={handleToggleAddRollForm}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-black text-[10px] transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus size={12} /> {showAddRollForm ? 'CANCEL' : 'ADD MASTER ROLL'}
                      </button>
                    </div>

                    {showAddRollForm && (
                      <div className="mb-4 p-4 bg-slate-50 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-top-2">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Roll ID</label>
                            <input
                              type="text"
                              value={newRoll.id}
                              onChange={(e) => setNewRoll({ ...newRoll, id: e.target.value })}
                              placeholder="e.g. R-105"
                              className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Material Type</label>
                            <SearchableSelect
                              options={materialTypes.map(type => ({ value: type, label: type }))}
                              value={newRoll.materialType}
                              onChange={(val) => setNewRoll({ ...newRoll, materialType: val })}
                              onAddNew={() => {
                                setPreviousMaterialTypeVal(newRoll.materialType);
                                setMaterialTypeAddSource('newRoll');
                                setShowAddMaterialModal(true);
                              }}
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Width ({currentUnit})</label>
                              <input
                                type="number"
                                value={fromMeters(newRoll.fullWidth) || ''}
                                onChange={(e) => setNewRoll({ ...newRoll, fullWidth: toMeters(parseFloat(e.target.value) || 0) })}
                                className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-black text-slate-500 uppercase tracking-wider">Length ({currentUnit})</label>
                              <input
                                type="number"
                                value={fromMeters(newRoll.fullLength) || ''}
                                onChange={(e) => setNewRoll({ ...newRoll, fullLength: toMeters(parseFloat(e.target.value) || 0) })}
                                className="w-full px-3 py-2 border border-zinc-200 rounded-lg text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                          </div>
                          <button
                            onClick={handleAddRoll}
                            disabled={isSyncing}
                            className={`font-black py-2 rounded-lg transition text-xs cursor-pointer flex items-center justify-center gap-1.5 ${isSyncing ? 'bg-emerald-800 text-emerald-300 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500'
                              }`}
                          >
                            {isSyncing ? <Loader2 className="animate-spin" size={13} /> : 'SAVE'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Searcher */}
                    <div className="relative mb-4">
                      <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="Search Fresh Rolls..."
                        value={freshRollSearchQuery}
                        onChange={(e) => setFreshRollSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950 placeholder-zinc-400 shadow-sm text-left"
                      />
                    </div>

                    {/* Table */}
                    <div className="overflow-x-auto border border-zinc-200 rounded-2xl shadow-sm">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-50 border-b border-zinc-200">
                          <tr>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Roll ID</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material Type</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Size ({currentUnit})</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Remaining Stock</th>
                            <th className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-150">
                          {filteredFreshRollsList.map((roll) => {
                            const percentageRemaining = roll.totalSqm > 0 ? (roll.remainingSqm / roll.totalSqm) * 100 : 0;
                            const percentageUsed = 100 - percentageRemaining;
                            const barColor = percentageRemaining > 50 ? 'bg-indigo-500' : percentageRemaining > 20 ? 'bg-amber-500' : 'bg-rose-500';
                            const textColor = percentageRemaining > 50 ? 'text-indigo-700' : percentageRemaining > 20 ? 'text-amber-700' : 'text-rose-700';
                            return (
                              <tr key={roll.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-black text-sm text-slate-800" title={roll.id}>{getShortRollId(roll.id)}</span>
                                    <span className="text-[7.5px] px-1.5 py-0.5 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-full font-black tracking-widest">MASTER</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-bold text-slate-500 text-xs">{roll.materialType}</td>
                                <td className="px-4 py-3 font-extrabold text-slate-800 text-xs">
                                  {fromMeters(roll.fullLength).toFixed(1)} × {fromMeters(roll.fullWidth).toFixed(1)}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="space-y-1.5 max-w-[200px]">
                                    <div className="flex justify-between text-[9px] font-black uppercase tracking-wider">
                                      <span className={textColor}>{percentageRemaining.toFixed(0)}% Left</span>
                                      <span className="text-slate-400">{(roll.remainingSqm * (currentUnit === 'm' ? 1 : CONVERSIONS[currentUnit] * CONVERSIONS[currentUnit])).toFixed(1)}{areaUnit}</span>
                                    </div>
                                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                                      <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${percentageRemaining}%` }} />
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex gap-1.5 justify-end">
                                    <button
                                      onClick={() => setRollDetailPanelId(roll.id)}
                                      className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                                      title="POS Check – View Roll Layout"
                                    >
                                      <Eye size={15} />
                                    </button>
                                    {roll.status !== 'refused' && (
                                      <button
                                        onClick={() => handleRefuseRoll(roll.id)}
                                        className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                                        title="Mark as Waste"
                                      >
                                        <AlertTriangle size={15} />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleDeleteRoll(roll.id)}
                                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                      title="Delete Roll"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}

                          {filteredFreshRollsList.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-16 text-center text-zinc-400 font-semibold text-xs italic">
                                No fresh rolls in stock.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* POS CHECK MODAL – Roll Visualizer Preview */}
                {rollDetailPanelId && (() => {
                  const previewRoll = rolls.find(r => r.id === rollDetailPanelId);
                  if (!previewRoll) return null;
                  const pct = previewRoll.totalSqm > 0 ? (previewRoll.remainingSqm / previewRoll.totalSqm) * 100 : 0;
                  const barColor = pct > 50 ? 'bg-indigo-500' : pct > 20 ? 'bg-amber-500' : 'bg-rose-500';
                  const textColor = pct > 50 ? 'text-indigo-600' : pct > 20 ? 'text-amber-600' : 'text-rose-600';
                  return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
                      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 w-full max-w-5xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="px-6 py-4 bg-gradient-to-r from-indigo-50 to-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-100 rounded-xl">
                              <Eye size={18} className="text-indigo-600" />
                            </div>
                            <div>
                              <h3 className="text-base font-black text-slate-800 uppercase tracking-wider">
                                POS Check — {getShortRollId(previewRoll.id)}
                              </h3>
                              <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                                {previewRoll.materialType} &nbsp;·&nbsp; {fromMeters(previewRoll.fullLength).toFixed(1)}{currentUnit} × {fromMeters(previewRoll.fullWidth).toFixed(1)}{currentUnit}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {/* Stock mini-bar */}
                            <div className="hidden sm:flex flex-col items-end gap-1">
                              <div className="flex items-center gap-2">
                                <span className={`text-xs font-black ${textColor}`}>{pct.toFixed(0)}% Remaining</span>
                                <span className="text-[10px] text-slate-400 font-bold">{previewRoll.remainingSqm.toFixed(1)} m²</span>
                              </div>
                              <div className="w-40 h-2 bg-slate-200 rounded-full overflow-hidden">
                                <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            <button
                              onClick={() => setRollDetailPanelId(null)}
                              className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-700 rounded-xl transition cursor-pointer"
                            >
                              <X size={20} />
                            </button>
                          </div>
                        </div>
                        {/* Roll Visualizer */}
                        <div className="overflow-auto p-4 flex-1">
                          <RollVisualizer
                            roll={previewRoll}
                            unit={currentUnit}
                            onSelectCut={() => {}}
                            onMaximize={() => {}}
                            allRolls={rolls}
                          />
                        </div>
                        {/* Footer stats */}
                        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex flex-wrap gap-4 shrink-0">
                          <div className="text-center">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Cuts</p>
                            <p className="text-sm font-black text-slate-800">{previewRoll.cuts?.length ?? 0}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Area</p>
                            <p className="text-sm font-black text-slate-800">{previewRoll.totalSqm.toFixed(2)} m²</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Remaining</p>
                            <p className={`text-sm font-black ${textColor}`}>{previewRoll.remainingSqm.toFixed(2)} m²</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Used</p>
                            <p className="text-sm font-black text-slate-800">{(previewRoll.totalSqm - previewRoll.remainingSqm).toFixed(2)} m²</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* CARD 4: Reorder Level Monitor */}
                {activeInventoryCard === 'reorder' && (() => {
                  const lowItems = materialStocks.filter(s => s.reorderLevel > 0 && s.quantity <= s.reorderLevel);
                  const lowFreshRolls = rolls.filter(r => r.status !== 'refused' && !isRollReuse(r) && r.reorderLevel > 0 && r.remainingSqm <= r.reorderLevel);
                  const consumedRemnantRolls = rolls.filter(r => r.status !== 'refused' && isRollReuse(r) && r.remainingSqm <= 0.01);

                  return (
                    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 animate-in fade-in duration-300 flex flex-col w-full">
                      <div className="flex justify-between items-center mb-3 border-b border-zinc-100 pb-2">
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <div className="p-1.5 rounded-lg bg-amber-50 shrink-0">
                            <AlertTriangle size={14} className="text-amber-500" />
                          </div>
                          Reorder & Roll Alerts Manager
                        </h3>
                      </div>

                      {/* Sub-tabs row */}
                      <div className="flex border-b border-zinc-150 mb-4">
                        <button
                          type="button"
                          onClick={() => setReorderSubTab('materials')}
                          className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${reorderSubTab === 'materials'
                              ? 'border-amber-500 text-amber-600'
                              : 'border-transparent text-slate-400 hover:text-slate-600'
                            }`}
                        >
                          Material Stocks ({lowItems.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setReorderSubTab('rolls')}
                          className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${reorderSubTab === 'rolls'
                              ? 'border-amber-500 text-amber-600'
                              : 'border-transparent text-slate-400 hover:text-slate-600'
                            }`}
                        >
                          Fresh Rolls ({lowFreshRolls.length + materialTypeStocks.filter(m => m.isLow).length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setReorderSubTab('remnants')}
                          className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${reorderSubTab === 'remnants'
                              ? 'border-amber-500 text-amber-600'
                              : 'border-transparent text-slate-400 hover:text-slate-600'
                            }`}
                        >
                          Cutting Belt ({consumedRemnantRolls.length})
                        </button>
                      </div>

                      {/* Sub-tab contents */}
                      {reorderSubTab === 'materials' && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                          {/* Alert Banner if any item is low */}
                          {lowItems.length > 0 && (
                            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-2.5 flex items-start gap-2">
                              <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5 animate-bounce" />
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-bold text-amber-800 leading-tight">
                                  {lowItems.length} {lowItems.length === 1 ? 'item requires' : 'items require'} immediate refill.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Searcher */}
                          <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
                            <input
                              type="text"
                              placeholder="Search Reorder Levels..."
                              value={reorderSearchQuery}
                              onChange={(e) => setReorderSearchQuery(e.target.value)}
                              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-zinc-200 rounded-lg text-[11px] font-bold text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950 placeholder-zinc-400 shadow-sm text-left"
                            />
                          </div>

                          {/* Table */}
                          <div className="overflow-x-auto border border-zinc-150 rounded-xl">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead className="bg-slate-50 border-b border-zinc-150">
                                <tr>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material Name</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Current Stock</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest w-24">Reorder Trigger</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredReorderItemsList.map((item) => {
                                  const isLow = item.reorderLevel > 0 && item.quantity <= item.reorderLevel;
                                  const isOut = item.quantity <= 0;
                                  const currentEdit = editingReorderLevel[item.id];
                                  return (
                                    <tr
                                      key={item.id}
                                      className={`border-b border-zinc-100 hover:bg-slate-50/50 transition-colors ${isOut
                                          ? 'bg-rose-50/30 border-l-2 border-l-rose-500'
                                          : isLow
                                            ? 'bg-amber-50/30 border-l-2 border-l-amber-500'
                                            : ''
                                        }`}
                                    >
                                      <td className="px-3 py-2 font-black text-slate-800">{item.name}</td>
                                      <td className="px-3 py-2 font-bold">
                                        <span className={isLow ? (isOut ? 'text-rose-600 font-extrabold' : 'text-amber-600') : 'text-slate-700'}>
                                          {item.quantity} {item.unit}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="number"
                                            min="0"
                                            placeholder={item.reorderLevel > 0 ? item.reorderLevel.toString() : '0'}
                                            value={currentEdit !== undefined ? currentEdit : (item.reorderLevel > 0 ? item.reorderLevel.toString() : '')}
                                            onChange={(e) => setEditingReorderLevel(prev => ({ ...prev, [item.id]: e.target.value }))}
                                            className="w-12 px-1 py-0.5 border border-zinc-200 rounded text-xs font-bold text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                                          />
                                          <button
                                            onClick={() => handleSaveReorderLevel(item.id)}
                                            disabled={savingReorderLevel === item.id || currentEdit === undefined}
                                            className={`p-0.5 rounded text-[10px] font-black transition cursor-pointer ${savingReorderLevel === item.id
                                                ? 'bg-slate-100 text-slate-300'
                                                : currentEdit !== undefined
                                                  ? 'bg-amber-500 hover:bg-amber-400 text-white shadow-sm'
                                                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                              }`}
                                            title="Save reorder level"
                                          >
                                            {savingReorderLevel === item.id ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                                          </button>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2">
                                        {isOut ? (
                                          <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">OUT OF STOCK</span>
                                        ) : isLow ? (
                                          <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">LOW STOCK</span>
                                        ) : (
                                          <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">OK</span>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}

                                {filteredReorderItemsList.length === 0 && (
                                  <tr>
                                    <td colSpan={4} className="py-10 text-center text-zinc-400 font-semibold text-xs italic">
                                      No materials found.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {reorderSubTab === 'rolls' && (
                        <div className="space-y-6 animate-in fade-in duration-200">
                          {/* Part 1: Overall Material Type Reorder Triggers */}
                          <div className="space-y-3">
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                              <Layers size={12} className="text-indigo-500" />
                              Material Type Overall Triggers (Total SQM)
                            </h4>
                            <div className="overflow-x-auto border border-zinc-150 rounded-xl">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-slate-50 border-b border-zinc-150">
                                  <tr>
                                    <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material Type</th>
                                    <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Total SQM in Stock</th>
                                    <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest w-28">Overall Trigger (SQM)</th>
                                    <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {materialTypeStocks.map((m) => {
                                    const currentEdit = editingMaterialTypeReorder[m.materialType];
                                    return (
                                      <tr
                                        key={m.materialType}
                                        className={`border-b border-zinc-100 hover:bg-slate-50/50 transition-colors ${m.totalSqm <= 0
                                            ? 'bg-rose-50/30 border-l-2 border-l-rose-500'
                                            : m.isLow
                                              ? 'bg-amber-50/30 border-l-2 border-l-amber-500'
                                              : ''
                                          }`}
                                      >
                                        <td className="px-3 py-2.5 font-black text-slate-800">{m.materialType}</td>
                                        <td className="px-3 py-2.5 font-bold">
                                          <span className={m.isLow ? (m.totalSqm <= 0 ? 'text-rose-600 font-extrabold' : 'text-amber-600') : 'text-slate-700'}>
                                            {m.totalSqm.toFixed(2)} sqm
                                          </span>
                                        </td>
                                        <td className="px-3 py-2">
                                          <div className="flex items-center gap-1">
                                            <input
                                              type="number"
                                              min="0"
                                              step="1"
                                              placeholder={m.reorderLevel > 0 ? m.reorderLevel.toString() : '0'}
                                              value={currentEdit !== undefined ? currentEdit : (m.reorderLevel > 0 ? m.reorderLevel.toString() : '')}
                                              onChange={(e) => setEditingMaterialTypeReorder(prev => ({ ...prev, [m.materialType]: e.target.value }))}
                                              className="w-16 px-1 py-0.5 border border-zinc-200 rounded text-xs font-bold text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                                            />
                                            <button
                                              onClick={() => handleSaveMaterialTypeReorder(m.materialType)}
                                              disabled={savingMaterialTypeReorder === m.materialType || currentEdit === undefined}
                                              className={`p-0.5 rounded text-[10px] font-black transition cursor-pointer ${savingMaterialTypeReorder === m.materialType
                                                  ? 'bg-slate-100 text-slate-300'
                                                  : currentEdit !== undefined
                                                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                                                    : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                                }`}
                                              title="Save overall trigger"
                                            >
                                              {savingMaterialTypeReorder === m.materialType ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                                            </button>
                                          </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-black">
                                          {m.totalSqm <= 0 ? (
                                            <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">OUT OF STOCK</span>
                                          ) : m.isLow ? (
                                            <div className="flex flex-col gap-0.5 items-end">
                                              <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">LOW STOCK</span>
                                              <span className="text-[8px] font-black text-amber-600 leading-none">⚠️ Order new rolls!</span>
                                            </div>
                                          ) : (
                                            <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">OK</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          <div className="border-t border-zinc-150 pt-4 space-y-3">
                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                              <Package size={12} className="text-indigo-500" />
                              Individual Roll Triggers & Status
                            </h4>

                            {/* Searcher */}
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-400" />
                              <input
                                type="text"
                                placeholder="Search Fresh Rolls..."
                                value={rollReorderSearchQuery}
                                onChange={(e) => setRollReorderSearchQuery(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-zinc-200 rounded-lg text-[11px] font-bold text-zinc-950 focus:outline-none focus:ring-1 focus:ring-zinc-950 placeholder-zinc-400 shadow-sm text-left"
                              />
                            </div>

                            <div className="overflow-x-auto border border-zinc-150 rounded-xl">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-slate-50 border-b border-zinc-150">
                                  <tr>
                                    <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Roll ID</th>
                                    <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material Type</th>
                                    <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Remaining SQM</th>
                                    <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Total SQM</th>
                                    <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest w-28">Reorder Trigger</th>
                                    <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredRollReorderList.map((r) => {
                                    const isLow = r.reorderLevel > 0 && r.remainingSqm <= r.reorderLevel;
                                    const isOut = r.remainingSqm <= 0;
                                    const currentEdit = editingRollReorderLevel[r.id];
                                    return (
                                      <tr
                                        key={r.id}
                                        className={`border-b border-zinc-100 hover:bg-slate-50/50 transition-colors ${isOut
                                            ? 'bg-rose-50/30 border-l-2 border-l-rose-500'
                                            : isLow
                                              ? 'bg-amber-50/30 border-l-2 border-l-amber-500'
                                              : ''
                                          }`}
                                      >
                                        <td className="px-3 py-2.5 font-black text-slate-800">{r.id}</td>
                                        <td className="px-3 py-2.5 font-bold text-slate-600">{r.materialType}</td>
                                        <td className="px-3 py-2.5 font-bold">
                                          <span className={isLow ? (isOut ? 'text-rose-600 font-extrabold' : 'text-amber-600') : 'text-slate-700'}>
                                            {r.remainingSqm.toFixed(2)} sqm
                                          </span>
                                        </td>
                                        <td className="px-3 py-2.5 font-bold text-slate-500">{r.totalSqm.toFixed(2)} sqm</td>
                                        <td className="px-3 py-2">
                                          <div className="flex items-center gap-1">
                                            <input
                                              type="number"
                                              min="0"
                                              step="0.1"
                                              placeholder={r.reorderLevel > 0 ? r.reorderLevel.toString() : '0'}
                                              value={currentEdit !== undefined ? currentEdit : (r.reorderLevel > 0 ? r.reorderLevel.toString() : '')}
                                              onChange={(e) => setEditingRollReorderLevel(prev => ({ ...prev, [r.id]: e.target.value }))}
                                              className="w-16 px-1 py-0.5 border border-zinc-200 rounded text-xs font-bold text-center focus:outline-none focus:ring-1 focus:ring-amber-400"
                                            />
                                            <button
                                              onClick={() => handleSaveRollReorderLevel(r.id)}
                                              disabled={savingRollReorderLevel === r.id || currentEdit === undefined}
                                              className={`p-0.5 rounded text-[10px] font-black transition cursor-pointer ${savingRollReorderLevel === r.id
                                                  ? 'bg-slate-100 text-slate-300'
                                                  : currentEdit !== undefined
                                                    ? 'bg-amber-500 hover:bg-amber-400 text-white shadow-sm'
                                                    : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                                }`}
                                              title="Save roll reorder level"
                                            >
                                              {savingRollReorderLevel === r.id ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                                            </button>
                                          </div>
                                        </td>
                                        <td className="px-3 py-2.5 text-right font-black">
                                          {isOut ? (
                                            <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-200">OUT OF STOCK</span>
                                          ) : isLow ? (
                                            <div className="flex flex-col gap-0.5 items-end">
                                              <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">LOW STOCK</span>
                                              <span className="text-[8px] font-black text-amber-600 leading-none">⚠️ New roll order karo!</span>
                                            </div>
                                          ) : (
                                            <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">OK</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}

                                  {filteredRollReorderList.length === 0 && (
                                    <tr>
                                      <td colSpan={6} className="py-8 text-center text-zinc-400 font-semibold text-xs italic">
                                        No fresh rolls found.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}

                      {reorderSubTab === 'remnants' && (
                        <div className="space-y-4 animate-in fade-in duration-200">
                          <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-2.5 flex items-start gap-2">
                            <Info size={14} className="text-rose-600 shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-bold text-rose-800 leading-tight">
                                These remnant rolls have been fully consumed by production. No refill or reorder actions are required for remnants.
                              </p>
                            </div>
                          </div>

                          <div className="overflow-x-auto border border-zinc-150 rounded-xl">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead className="bg-slate-50 border-b border-zinc-150">
                                <tr>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Remnant ID</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Parent Roll ID</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material Type</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Remaining SQM</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {consumedRemnantRolls.slice(0, 15).map((r) => (
                                  <tr key={r.id} className="border-b border-zinc-100 hover:bg-slate-50/50 transition-colors bg-rose-50/10">
                                    <td className="px-3 py-2.5 font-black text-slate-800">{r.id}</td>
                                    <td className="px-3 py-2.5 font-bold text-slate-500">{r.parentRollId || 'Unknown'}</td>
                                    <td className="px-3 py-2.5 font-bold text-slate-600">{r.materialType}</td>
                                    <td className="px-3 py-2.5 font-bold text-rose-600">{r.remainingSqm.toFixed(2)} sqm</td>
                                    <td className="px-3 py-2.5 text-right font-black text-rose-600 text-[10px] uppercase tracking-wide">
                                      ❌ Khatam ho gaya
                                    </td>
                                  </tr>
                                ))}

                                {consumedRemnantRolls.length === 0 && (
                                  <tr>
                                    <td colSpan={5} className="py-8 text-center text-zinc-400 font-semibold text-xs italic">
                                      No remnants are currently marked as fully consumed.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* CARD 5: Material Requests For Approval */}
                {activeInventoryCard === 'requests' && (() => {
                  const pendingReqs = materialRequests.filter(r => r.status === 'pending');
                  const pastReqs = materialRequests.filter(r => r.status !== 'pending');
                  return (
                    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 animate-in fade-in duration-300 flex flex-col w-full">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                          <div className="p-1.5 rounded-lg bg-violet-50 shrink-0">
                            <ClipboardList size={14} className="text-violet-600" />
                          </div>
                          Material Requests Approval Workflow
                          <span className="text-[10px] font-black text-violet-700 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-full ml-1.5">
                            {pendingReqs.length} Pending
                          </span>
                        </h3>
                      </div>

                      {/* Sub-tabs row */}
                      <div className="flex border-b border-zinc-150 mb-4">
                        <button
                          type="button"
                          onClick={() => setRequestsSubTab('pending')}
                          className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${requestsSubTab === 'pending'
                              ? 'border-violet-600 text-violet-600'
                              : 'border-transparent text-slate-400 hover:text-slate-600'
                            }`}
                        >
                          Pending Requests ({pendingReqs.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setRequestsSubTab('history')}
                          className={`px-4 py-2 text-xs font-black uppercase tracking-wider border-b-2 transition-all cursor-pointer ${requestsSubTab === 'history'
                              ? 'border-violet-600 text-violet-600'
                              : 'border-transparent text-slate-400 hover:text-slate-600'
                            }`}
                        >
                          Request History ({pastReqs.length})
                        </button>
                      </div>

                      {/* Tab contents */}
                      {requestsSubTab === 'pending' ? (
                        <div className="space-y-4">
                          {/* Info Alert */}
                          {pendingReqs.length > 0 ? (
                            <div className="bg-violet-50/70 border border-violet-200 rounded-xl p-2.5 flex items-start gap-2">
                              <Info size={14} className="text-violet-600 shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-bold text-violet-800 leading-tight">
                                  Production team has requested raw materials. Please review, adjust quantities if necessary, and approve or reject.
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-2.5 flex items-start gap-2">
                              <Check size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-bold text-emerald-800 leading-tight">
                                  All material requests are caught up! No pending approvals.
                                </p>
                              </div>
                            </div>
                          )}

                          <div className="overflow-x-auto border border-zinc-150 rounded-xl">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead className="bg-slate-50 border-b border-zinc-150">
                                <tr>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material Name</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Requested Qty</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Requested By</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Notes</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Date & Time</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right w-32">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pendingReqs.map((req) => {
                                  const reqDate = new Date(req.requestedAt).toLocaleString();
                                  return (
                                    <tr key={req.id} className="border-b border-zinc-100 hover:bg-slate-50/50 transition-colors">
                                      <td className="px-3 py-2.5 font-black text-slate-800">{req.materialName}</td>
                                      <td className="px-3 py-2.5 font-bold text-slate-700">
                                        {req.requestedQuantity} {req.unit}
                                      </td>
                                      <td className="px-3 py-2.5 font-bold text-slate-600">
                                        <div className="flex items-center gap-1">
                                          <User size={10} className="text-slate-400" />
                                          {req.requestedBy}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2.5 font-bold text-slate-500 max-w-xs truncate" title={req.notes}>
                                        {req.notes || <span className="text-zinc-300 italic">No notes</span>}
                                      </td>
                                      <td className="px-3 py-2.5 text-[10px] font-bold text-slate-400">
                                        <div className="flex items-center gap-1">
                                          <Clock size={10} />
                                          {reqDate}
                                        </div>
                                      </td>
                                      <td className="px-3 py-2.5 text-right">
                                        <div className="flex items-center justify-end gap-1.5">
                                          <button
                                            type="button"
                                            onClick={() => handleOpenApprovalModal(req)}
                                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] rounded-lg shadow-sm transition cursor-pointer flex items-center gap-1"
                                          >
                                            <Check size={10} /> Approve
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleRejectRequest(req)}
                                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-black text-[10px] rounded-lg shadow-sm transition cursor-pointer flex items-center gap-1"
                                          >
                                            <X size={10} /> Reject
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}

                                {pendingReqs.length === 0 && (
                                  <tr>
                                    <td colSpan={6} className="py-8 text-center text-zinc-400 font-semibold text-xs italic">
                                      No pending requests at this time.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="overflow-x-auto border border-zinc-150 rounded-xl">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead className="bg-slate-50 border-b border-zinc-150">
                                <tr>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material Name</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Requested Qty</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Requested By</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Approved/Processed Qty</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Processed By</th>
                                  <th className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Remarks / Notes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pastReqs.map((req) => {
                                  const isApproved = req.status === 'approved';
                                  return (
                                    <tr key={req.id} className="border-b border-zinc-100 hover:bg-slate-50/50 transition-colors">
                                      <td className="px-3 py-2.5 font-black text-slate-800">{req.materialName}</td>
                                      <td className="px-3 py-2.5 font-bold text-slate-600">
                                        {req.requestedQuantity} {req.unit}
                                      </td>
                                      <td className="px-3 py-2.5 font-bold text-slate-500">{req.requestedBy}</td>
                                      <td className="px-3 py-2.5">
                                        {isApproved ? (
                                          <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">APPROVED</span>
                                        ) : (
                                          <span className="text-[7.5px] font-black px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-100">REJECTED</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2.5 font-black text-slate-800">
                                        {isApproved ? `${req.approvedQuantity} ${req.unit}` : '-'}
                                      </td>
                                      <td className="px-3 py-2.5 font-bold text-slate-600">{req.approvedBy || '-'}</td>
                                      <td className="px-3 py-2.5 font-bold text-slate-500 max-w-xs truncate" title={req.approvalNotes}>
                                        {req.approvalNotes || <span className="text-zinc-300 italic">No notes</span>}
                                      </td>
                                    </tr>
                                  );
                                })}

                                {pastReqs.length === 0 && (
                                  <tr>
                                    <td colSpan={7} className="py-8 text-center text-zinc-400 font-semibold text-xs italic">
                                      No request history found.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>

            </div>
          )}

          {/* ═══ PRODUCTION LOG TAB ═══ */}
          {activeTab === 'production' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-3 duration-200">
              {/* Records */}
              {filteredMaterialIssues.length === 0 ? (
                <div className="bg-white rounded-2xl border border-zinc-200 py-16 text-center shadow-sm">
                  <ClipboardList size={32} className="mx-auto text-zinc-200 mb-3" />
                  <p className="font-black text-zinc-400 text-xs uppercase tracking-wider">
                    {productionSearchQuery ? "No matching records found" : "No production records yet"}
                  </p>
                  {!productionSearchQuery && (
                    <p className="text-[10px] text-zinc-300 font-semibold mt-1 uppercase tracking-wider">
                      Go to Inventory → Material Stocks → Issue to Production
                    </p>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden animate-in fade-in duration-200">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest w-12">Index</th>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material</th>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Quantity</th>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Issued To</th>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Notes</th>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest">Date &amp; Time</th>
                        <th className="px-4 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right w-16">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 font-semibold text-slate-700">
                      {filteredMaterialIssues.map((issue, idx) => {
                        const dt = new Date(issue.issuedAt);
                        const dateStr = dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
                        const timeStr = dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                        return (
                          <tr key={issue.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-2 text-xs font-black text-slate-400">
                              #{materialIssues.length - idx}
                            </td>
                            <td className="px-4 py-2 text-xs font-black text-slate-900">
                              {issue.materialName}
                            </td>
                            <td className="px-4 py-2 text-xs">
                              <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-md leading-none">
                                {issue.quantity} {issue.unit}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs">
                              <span className="text-[10px] font-black text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded-md leading-none">
                                {issue.issuedTo}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs text-slate-500 italic max-w-md break-words whitespace-pre-wrap" title={issue.notes || undefined}>
                              {issue.notes ? `"${issue.notes}"` : <span className="text-slate-300 font-normal">No notes</span>}
                            </td>
                            <td className="px-4 py-2 text-xs text-slate-500">
                              <span className="font-bold">{timeStr}</span> <span className="text-[10px] text-slate-400 ml-1.5">{dateStr}</span>
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button
                                onClick={() => handleDeleteIssue(issue.id)}
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                title="Remove record"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'scrub' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-3">

              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">ID / Specification</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Original Size</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Remaining Area</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredScrubRolls.map(roll => (
                      <tr key={roll.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-zinc-950 text-sm" title={roll.id}>{getShortRollId(roll.id)}</span>
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-black tracking-widest leading-none ${isRollReuse(roll) ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'}`}>
                              {isRollReuse(roll) ? 'REUSE' : 'FRESH'}
                            </span>
                          </div>
                          <span className="text-[9px] text-slate-400 font-bold block mt-0.5">{roll.materialType}</span>
                        </td>
                        <td className="px-4 py-2.5 font-bold text-xs">{fromMeters(roll.fullLength).toFixed(1)}{currentUnit} x {fromMeters(roll.fullWidth).toFixed(1)}{currentUnit}</td>
                        <td className="px-4 py-2.5 font-bold text-xs">{fromMeters(roll.remainingSqm).toFixed(1)}{currentUnit}²</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleRestoreRoll(roll.id)}
                              className="px-3 py-1.5 bg-zinc-900 text-white rounded-lg font-bold text-[10px] hover:bg-zinc-800 transition-all cursor-pointer flex items-center gap-1"
                              title="Restore to Active Stock"
                            >
                              <RotateCcw size={12} /> RESTORE
                            </button>
                            <button
                              onClick={() => handleDeleteRoll(roll.id)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                              title="Delete Permanently"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredScrubRolls.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-20 text-center text-zinc-400 font-medium text-sm">
                          {rolls.filter(r => r.status === 'refused').length === 0
                            ? "No refused remnants in scrap registry."
                            : "No matching remnants found."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'details' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-3">
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden animate-in fade-in duration-200">
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Order No.</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Client Name</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Cuts Taken</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Consumed Materials</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-semibold text-slate-700">
                    {filteredClientCutsList.map((client, idx) => {
                      const uniqueMaterials = Array.from(new Set(client.cuts.map(c => c.rollMaterial)));
                      const clientOrderNumbers = Array.from(new Set(client.cuts.map(c => allOrdersMap[c.cut.orderId]).filter(Boolean)));
                      return (
                        <tr key={client.customerName} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-2.5 text-zinc-950 font-bold text-xs">
                            {clientOrderNumbers.length > 0 ? clientOrderNumbers.join(', ') : 'Manual'}
                          </td>
                          <td className="px-4 py-2.5 font-black text-slate-900">{client.customerName}</td>
                          <td className="px-4 py-2.5">
                            <span className="bg-zinc-55 text-zinc-950 border border-zinc-200 px-2.5 py-0.5 rounded-lg font-bold text-xs">
                              {client.cuts.length} cuts
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex gap-1.5 flex-wrap">
                              {uniqueMaterials.map(mat => (
                                <span key={mat} className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-100 font-bold text-[10px]">
                                  {mat}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => setSelectedClientName(client.customerName)}
                              className="px-3 py-1.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-lg font-black text-xs transition shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                            >
                              <Info size={13} /> Check Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredClientCutsList.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-20 text-center text-zinc-400 font-bold">
                          {clientCutsList.length === 0
                            ? "No client cuts recorded in history."
                            : "No matching client cuts found."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'rolls_map' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-3">
              <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden animate-in fade-in duration-200">
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">S.No</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Roll ID / Spec</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Dimensions</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Stock Level</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Cuts</th>
                      <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 font-semibold text-slate-700">
                    {filteredRollsMapList.map((roll, idx) => {
                      const usedSqm = roll.cuts.reduce((s, c) => s + c.width * c.length, 0);
                      const usedPct = roll.totalSqm > 0 ? (usedSqm / roll.totalSqm) * 100 : 0;

                      return (
                        <tr key={roll.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-2.5 text-slate-400">#{idx + 1}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-slate-900" title={roll.id}>{getShortRollId(roll.id)}</span>
                              <span className={`text-[9px] px-2 py-0.5 rounded-full font-black tracking-widest leading-none ${isRollReuse(roll) ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                }`}>
                                {isRollReuse(roll) ? 'REUSE' : 'FRESH'}
                              </span>
                              {roll.status === 'refused' && (
                                <span className="text-[9px] px-2 py-0.5 rounded-full font-black bg-rose-50 text-rose-700 border border-rose-100">
                                  SCRAP
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-bold block mt-0.5">{roll.materialType}</span>
                          </td>
                          <td className="px-4 py-2.5 font-bold text-slate-800">
                            {fromMeters(roll.fullLength).toFixed(1)}{currentUnit} × {fromMeters(roll.fullWidth).toFixed(1)}{currentUnit}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="space-y-1">
                              <div className="w-28 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${usedPct > 80 ? 'bg-rose-500' : usedPct > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                                  }`} style={{ width: `${Math.min(100, usedPct)}%` }} />
                              </div>
                              <span className="text-[9px] font-black text-slate-400">
                                {usedPct.toFixed(0)}% used ({(usedSqm * (currentUnit === 'm' ? 1 : CONVERSIONS[currentUnit] * CONVERSIONS[currentUnit])).toFixed(1)}{areaUnit})
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="bg-zinc-50 text-zinc-950 border border-zinc-200 px-3 py-1 rounded-xl font-bold text-xs">
                              {roll.cuts.length} cuts
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <button
                              onClick={() => {
                                setRollHistory([]);
                                setSelectedRollId(roll.id);
                              }}
                              className="px-2 py-1 bg-zinc-950 hover:bg-zinc-800 text-white rounded-lg font-black text-[10px] transition shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                            >
                              <Info size={11} /> Check Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredRollsMapList.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-20 text-center text-zinc-400 font-bold">
                          {rolls.length === 0
                            ? "No rolls in stock registry."
                            : "No matching rolls found."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Client Cuts Popup/Modal */}
          {selectedClientName && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 text-left">
                <div className="p-3 border-b border-zinc-150 flex justify-between items-center bg-white text-zinc-950">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider">Cuts Details for {selectedClientName}</h3>
                  </div>
                  <button
                    onClick={() => setSelectedClientName(null)}
                    className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                  <div className="border border-zinc-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Order No.</th>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cut ID</th>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Dimensions</th>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Material</th>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Source Roll</th>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Entry Date &amp; Time</th>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right pr-8">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 text-xs font-semibold text-slate-700">
                        {(clientCutsList.find(c => c.customerName === selectedClientName)?.cuts || []).map((item, idx) => {
                          let dateStr = 'N/A';
                          const tsMatch = item.cut.id.match(/C-(\d+)/);
                          if (tsMatch) {
                            const d = new Date(parseInt(tsMatch[1], 10));
                            if (!isNaN(d.getTime())) {
                              dateStr = `${d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
                            }
                          }
                          return (
                            <tr key={item.cut.id} className="hover:bg-slate-50/50">
                              <td className="px-5 py-3 text-zinc-950 font-bold">{allOrdersMap[item.cut.orderId] || (item.cut.soNumber ? `Manual (${item.cut.soNumber})` : 'Manual')}</td>
                              <td className="px-5 py-3 font-mono text-[10px] text-zinc-500">{item.cut.id.substring(0, 12)}</td>
                              <td className="px-5 py-3 text-zinc-950 font-bold">
                                {formatCutDim(item.cut.length)}{currentUnit} x {formatCutDim(item.cut.width)}{currentUnit}
                              </td>
                              <td className="px-5 py-3 text-slate-500">{item.rollMaterial}</td>
                              <td className="px-5 py-3">
                                <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-100 font-bold">
                                  {item.rollId}
                                </span>
                              </td>
                              <td className="px-5 py-3 font-bold text-slate-450">{dateStr}</td>
                              <td className="px-5 py-3 text-right pr-6">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCut(item.rollId, item.cut);
                                  }}
                                  className="p-1.5 text-red-650 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center"
                                  title="Delete/Undo this cut and restore area"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="p-4 border-t bg-zinc-50 flex justify-between items-center">
                  <div className="flex gap-2">
                    <button
                      onClick={handleExportClientCSV}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95 animate-in fade-in"
                    >
                      <Download size={13} /> EXPORT CSV
                    </button>
                    <button
                      onClick={handlePrintClientCuts}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95 animate-in fade-in"
                    >
                      <Printer size={13} /> PRINT
                    </button>
                  </div>
                  <button
                    onClick={() => setSelectedClientName(null)}
                    className="px-5 py-2.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl text-xs font-black transition cursor-pointer active:scale-95"
                  >
                    CLOSE
                  </button>
                </div>
              </div>
            </div>
          )}



          {/* Roll Client Allocations Popup/Modal */}
          {selectedRollId && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-xl w-full max-w-4xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200 text-left">
                <div className="p-3 border-b border-zinc-150 flex justify-between items-center bg-white text-zinc-950">
                  <div className="flex items-center gap-2">
                    {rollHistory.length > 0 && (
                      <button
                        onClick={() => {
                          const prev = [...rollHistory];
                          const prevId = prev.pop();
                          setRollHistory(prev);
                          setSelectedRollId(prevId || null);
                        }}
                        className="mr-2 px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-lg text-[10px] font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-1 border border-zinc-200 active:scale-95 animate-in fade-in"
                      >
                        <ArrowLeft size={12} className="stroke-[3]" /> Back
                      </button>
                    )}
                    <h3 className="text-xs font-black uppercase tracking-wider">Client Allocations for Roll {selectedRollId}</h3>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedRollId(null);
                      setRollHistory([]);
                    }}
                    className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1">
                  <div className="border border-zinc-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Client Name</th>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Cut ID</th>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Dimensions</th>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Type</th>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest">Entry Date &amp; Time</th>
                          <th className="px-5 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right pr-8">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 text-xs font-semibold text-slate-700">
                        {(rolls.find(r => r.id === selectedRollId)?.cuts || []).map((cut) => {
                          let dateStr = 'N/A';
                          const tsMatch = cut.id.match(/C-(\d+)/);
                          if (tsMatch) {
                            const d = new Date(parseInt(tsMatch[1], 10));
                            if (!isNaN(d.getTime())) {
                              dateStr = `${d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
                            }
                          }

                          const matchedInvRoll = cut.isInventoryCut
                            ? findInventoryRollForCut(rolls, selectedRollId, cut)
                            : null;

                          const isClickable = !!matchedInvRoll;

                          return (
                            <tr
                              key={cut.id}
                              className={`transition-colors ${isClickable ? 'hover:bg-indigo-50/60 cursor-pointer' : 'hover:bg-slate-50/50'}`}
                              onClick={() => {
                                if (isClickable && matchedInvRoll) {
                                  if (selectedRollId) {
                                    setRollHistory(prev => [...prev, selectedRollId]);
                                  }
                                  setSelectedRollId(matchedInvRoll.id);
                                }
                              }}
                              title={isClickable ? "Click to view allocations for this stock piece" : undefined}
                            >
                              <td className="px-5 py-3 font-bold text-slate-900 flex items-center gap-1.5">
                                {isInventoryCutName(cut.customerName) ? 'REUSE STOCK' : cut.customerName}
                                {isClickable && <ExternalLink size={12} className="text-indigo-500 shrink-0" />}
                              </td>
                              <td className="px-5 py-3 font-mono text-[10px] text-zinc-500">{cut.id.substring(0, 12)}</td>
                              <td className="px-5 py-3 text-zinc-950 font-bold">
                                {formatCutDim(cut.length)}{currentUnit} x {formatCutDim(cut.width)}{currentUnit}
                              </td>
                              <td className="px-5 py-3">
                                {cut.isInventoryCut ? (
                                  <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-lg border border-emerald-100 font-bold text-[9px]">REUSE</span>
                                ) : (
                                  <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-lg border border-blue-100 font-bold text-[9px]">CLIENT</span>
                                )}
                              </td>
                              <td className="px-5 py-3 font-bold text-slate-450">{dateStr}</td>
                              <td className="px-5 py-3 text-right pr-6">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteCut(selectedRollId, cut);
                                  }}
                                  className="p-1.5 text-red-655 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors cursor-pointer inline-flex items-center justify-center"
                                  title="Delete/Undo this cut and restore area"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="p-4 border-t bg-zinc-50 flex justify-between items-center flex-wrap gap-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handlePrintRollAllocations(selectedRollId)}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      Print
                    </button>
                    <button
                      onClick={() => handleExportCSV(selectedRollId)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      Export CSV
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedRollId(null);
                      setRollHistory([]);
                    }}
                    className="px-5 py-2.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl text-xs font-black transition cursor-pointer"
                  >
                    CLOSE
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ═══ MULTI-CUT PREVIEW MODAL ═══ */}
      {multiCutPreview && (() => {
        const allPlaceableExecuted = multiCutPreview.filter(p => p.rollId).every(p => p.isExecuted);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-zinc-950/65 backdrop-blur-md transition-opacity duration-300"
              onClick={() => { setMultiCutPreview(null); setViewingSimulatedCutIndex(null); }}
            />
            <div className="relative bg-white rounded-3xl shadow-2xl border border-zinc-150 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-250 text-left">
              {/* Header */}
              <div className="p-5 border-b border-zinc-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center shadow-sm text-indigo-600">
                    <Scissors size={20} className="animate-pulse" />
                  </div>
                  <div>
                    <h3 className="font-black text-zinc-950 text-sm tracking-wide uppercase">Confirm Cuts Sequence</h3>
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">Line by line preview of cuts to be executed</p>
                  </div>
                </div>
                <button
                  onClick={() => { setMultiCutPreview(null); setViewingSimulatedCutIndex(null); }}
                  className="p-2 text-slate-450 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Content List / Detail Visualizer */}
              {viewingSimulatedCutIndex !== null ? (() => {
                const item = multiCutPreview[viewingSimulatedCutIndex];
                return (
                  <div className="flex-grow flex flex-col overflow-hidden bg-slate-50 p-6 space-y-4">
                    {/* Sub Header / Back Button */}
                    <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setViewingSimulatedCutIndex(null)}
                          className="px-4 py-2 bg-white border border-zinc-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-black tracking-wide uppercase transition-all duration-150 cursor-pointer shadow-sm active:scale-95 flex items-center gap-1.5"
                        >
                          <ArrowLeft size={13} className="stroke-[3]" /> Back to List
                        </button>
                        {item.rollId && (
                          !item.isExecuted ? (
                            <button
                              onClick={() => commitSinglePreviewCut(viewingSimulatedCutIndex)}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black tracking-wide uppercase transition-all duration-150 shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
                            >
                              <Scissors size={13} className="stroke-[3]" /> Execute This Cut
                            </button>
                          ) : (
                            <span className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-150 rounded-xl text-xs font-black uppercase tracking-wide flex items-center gap-1.5 shadow-sm">
                              <Check size={13} className="stroke-[3]" /> Cut Executed
                            </span>
                          )
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Selected Roll for Cut #{item.pieceIndex}</span>
                        <p className="text-xs font-black text-slate-800 uppercase font-mono">{item.rollId}</p>
                      </div>
                    </div>

                    {/* Cut Specifications Info Box */}
                    <div className="bg-indigo-50/50 border border-indigo-150 rounded-2xl p-4 flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-indigo-900 tracking-tight uppercase">Cut Details</span>
                          <span className="text-[8.5px] font-black uppercase bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-200">PIECE #{item.pieceIndex}</span>
                        </div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{item.materialType}</p>
                      </div>
                      <div className="flex gap-6 text-[11px] font-bold text-slate-700">
                        <div>
                          <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider block">Dimensions</span>
                          <span className="font-mono text-zinc-900 text-sm font-black">{formatCutDim(item.length)}{currentUnit} × {formatCutDim(item.width)}{currentUnit}</span>
                        </div>
                        <div>
                          <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider block">Placement Coordinates</span>
                          <span className="font-mono text-zinc-900 text-sm font-black">x={item.x.toFixed(2)}m, y={item.y.toFixed(2)}m</span>
                        </div>
                      </div>
                    </div>

                    {/* Visualizer Area */}
                    <div className="flex-grow flex flex-col overflow-hidden bg-white border border-zinc-200 rounded-3xl p-4 min-h-[300px]">
                      {item.rollStateBefore ? (
                        <RollVisualizer
                          roll={item.rollStateBefore}
                          unit={currentUnit}
                          isExpanded={true}
                          hideTitle={true}
                          noBorder={true}
                          height="h-full flex-grow"
                          suggestedPlacement={{
                            x: item.x,
                            y: item.y,
                            width: item.width,
                            length: item.length
                          }}
                          allRolls={rolls}
                        />
                      ) : (
                        <div className="py-20 text-center text-zinc-400 text-xs font-medium border-2 border-dashed border-zinc-200 rounded-3xl">
                          No layout details available for this roll.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })() : (
                <div className="p-6 overflow-y-auto flex-1 space-y-3 bg-slate-50/50 animate-in fade-in duration-200">
                  {multiCutPreview.map((item, idx) => {
                    const isSuccessful = !!item.rollId;
                    return (
                      <div
                        key={idx}
                        onClick={() => isSuccessful && setViewingSimulatedCutIndex(idx)}
                        className={`p-4 rounded-2xl border transition-all duration-200 flex items-start justify-between gap-4 ${isSuccessful
                            ? item.isExecuted
                              ? 'bg-emerald-50/10 border-emerald-200/60 shadow-sm cursor-pointer hover:bg-emerald-50/20 hover:border-emerald-300'
                              : 'bg-white border-zinc-200 shadow-sm cursor-pointer hover:bg-slate-50 hover:border-zinc-450 hover:shadow-md'
                            : 'bg-rose-50/70 border-rose-200 shadow-sm'
                          }`}
                        title={isSuccessful ? "Click to view layout placement on roll" : undefined}
                      >
                        <div className="flex items-start gap-3.5">
                          {/* Left Badge */}
                          <span className={`w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center shrink-0 ${isSuccessful
                              ? item.isExecuted
                                ? 'bg-emerald-600 text-white shadow-sm'
                                : 'bg-zinc-950 text-white shadow-sm'
                              : 'bg-rose-600 text-white'
                            }`}>
                            #{item.pieceIndex}
                          </span>

                          {/* Cut Info */}
                          <div className="space-y-1">
                            {isSuccessful ? (
                              <>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-black text-slate-800 tracking-tight uppercase">
                                    Cutting in Roll
                                  </span>
                                  <span className="font-mono font-black text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-150 shadow-sm">
                                    {item.rollId}
                                  </span>
                                  {item.shouldRefuseAfter && (
                                    <span className="text-[8.5px] font-black uppercase bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg border border-amber-200">
                                      ⚠️ SCRAP / REFUSE LIMIT REACHED
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                                  {item.materialType}
                                </p>
                                <div className="flex gap-4 pt-1 text-[11px] font-bold text-slate-600">
                                  <span>Cut Size: <span className="font-mono text-zinc-900">{formatCutDim(item.length)}{currentUnit} × {formatCutDim(item.width)}{currentUnit}</span></span>
                                  <span>Pos: <span className="font-mono text-zinc-900">x={item.x.toFixed(2)}m, y={item.y.toFixed(2)}m</span></span>
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-black text-rose-800 tracking-tight uppercase">
                                    Out of Stock Space
                                  </span>
                                  <span className="text-[8.5px] font-black uppercase bg-rose-100 text-rose-700 px-2 py-0.5 rounded-lg border border-rose-200">
                                    NO PLACEMENT FOUND
                                  </span>
                                </div>
                                <p className="text-[10.5px] font-semibold text-rose-600 leading-relaxed">
                                  Insufficient space or matching rolls available for this piece.
                                </p>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Right side area details */}
                        {isSuccessful && (
                          <div className="text-right flex flex-col items-end shrink-0 gap-1.5">
                            <div>
                              <span className="text-[8.5px] font-black text-slate-400 uppercase tracking-wider block">Remaining Area</span>
                              <span className="font-mono text-xs font-black text-emerald-600 bg-emerald-50 border border-emerald-150 px-2.5 py-0.5 rounded-lg shadow-sm block mt-0.5">
                                {fromMeters(item.remainingSqmAfter).toFixed(2)}{currentUnit}²
                              </span>
                            </div>
                            {!item.isExecuted ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  commitSinglePreviewCut(idx);
                                }}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition active:scale-95 cursor-pointer shadow-sm mt-1 flex items-center gap-1"
                              >
                                <Scissors size={10} className="stroke-[3]" /> Execute
                              </button>
                            ) : (
                              <span className="text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg border border-emerald-150 shadow-sm mt-1 flex items-center gap-1">
                                <Check size={10} className="stroke-[3]" /> Executed
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Footer */}
              <div className="p-4 border-t border-zinc-150 bg-slate-50 flex justify-between items-center gap-3">
                <div className="text-left">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total pieces</p>
                  <p className="text-sm font-black text-slate-800">
                    {multiCutPreview.filter(p => p.rollId).length} / {multiCutPreview.length} cuts can be placed
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setMultiCutPreview(null); setViewingSimulatedCutIndex(null); }}
                    className="px-4 py-2 bg-white border border-zinc-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-black tracking-wide uppercase transition-all duration-150 cursor-pointer shadow-sm active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => commitMultiCuts(multiCutPreview)}
                    disabled={multiCutPreview.filter(p => p.rollId).length === 0}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl text-xs font-black tracking-wide uppercase transition-all duration-150 shadow-md active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <Check size={14} className="stroke-[3]" />
                    {allPlaceableExecuted ? 'Finish & Close' : 'Confirm & Execute'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ REQUEST MATERIAL MODAL ═══ */}
      {showRequestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
            onClick={() => setShowRequestModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200 text-left">
            <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center">
                  <Send size={20} className="text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-black text-zinc-950 text-sm">Request Material</h3>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">Send a request to Inventory Manager</p>
                </div>
              </div>
              <button
                onClick={() => setShowRequestModal(false)}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  Select Material <span className="text-rose-500">*</span>
                </label>
                <SearchableSelect
                  options={materialStocks.map(stock => ({ value: stock.id, label: stock.name }))}
                  value={requestForm.materialId}
                  onChange={(val) => setRequestForm({ ...requestForm, materialId: val })}
                  placeholder="-- Choose Material --"
                />
              </div>

              {(() => {
                const selectedStock = materialStocks.find(s => s.id === requestForm.materialId);
                const availableLots = selectedStock?.lots || [];
                if (availableLots.length === 0) return null;
                return (
                  <div className="space-y-1.5 animate-in fade-in duration-200">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      Select Lot (Optional)
                    </label>
                    <SearchableSelect
                      options={[
                        { value: '', label: '-- Choose Lot --' },
                        ...availableLots.map(lot => ({
                          value: lot.lotNumber,
                          label: `${lot.lotNumber} (${lot.pieces?.length || 0} pcs)`
                        }))
                      ]}
                      value={requestForm.lotNumber}
                      onChange={(val) => setRequestForm({ ...requestForm, lotNumber: val })}
                      placeholder="-- Choose Lot --"
                    />
                  </div>
                );
              })()}

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  Requested Quantity <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Enter required amount"
                  value={requestForm.quantity}
                  onChange={(e) => setRequestForm({ ...requestForm, quantity: e.target.value })}
                  className="w-full px-3 py-2.5 border border-zinc-200 rounded-xl text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  Notes (Optional)
                </label>
                <textarea
                  placeholder="Explain why this material is needed..."
                  value={requestForm.notes}
                  onChange={(e) => setRequestForm({ ...requestForm, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-zinc-200 rounded-xl text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>

              <button
                onClick={handleSubmitRequest}
                disabled={isSubmittingRequest}
                className={`w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer ${isSubmittingRequest
                    ? 'bg-indigo-300 text-white cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                  }`}
              >
                {isSubmittingRequest ? (
                  <><Loader2 size={16} className="animate-spin" /> Submitting Request...</>
                ) : (
                  <><Send size={15} /> Send Request for Approval</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ APPROVE MATERIAL REQUEST MODAL ═══ */}
      {showApprovalModal && approvingRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
            onClick={() => {
              setShowApprovalModal(false);
              setApprovingRequest(null);
            }}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200 text-left">
            <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center">
                  <Check size={20} className="text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-black text-zinc-950 text-sm">Approve Material Request</h3>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">Approve and adjust quantity for {approvingRequest.materialName}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowApprovalModal(false);
                  setApprovingRequest(null);
                }}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-slate-50 border border-zinc-150 rounded-xl p-3 space-y-1">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Request Details</p>
                <p className="text-xs font-bold text-zinc-800">
                  Requested by: <span className="font-black text-zinc-950">{approvingRequest.requestedBy}</span>
                </p>
                <p className="text-xs font-bold text-zinc-800">
                  Requested Qty: <span className="font-black text-indigo-600">{approvingRequest.requestedQuantity} {approvingRequest.unit}</span>
                </p>
                {approvingRequest.notes && (
                  <p className="text-xs font-bold text-zinc-800 mt-1 italic">
                    " {approvingRequest.notes} "
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  Approved Quantity <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Enter quantity to approve"
                  value={approvalForm.approvedQuantity}
                  onChange={(e) => setApprovalForm({ ...approvalForm, approvedQuantity: e.target.value })}
                  className="w-full px-3 py-2.5 border border-zinc-200 rounded-xl text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              {(() => {
                const selectedStock = materialStocks.find(s => s.id === approvingRequest.materialId || s.name === approvingRequest.materialName);
                const availableLots = selectedStock?.lots || [];
                if (availableLots.length === 0) return null;
                return (
                  <div className="space-y-1.5 animate-in fade-in duration-200">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      Select Lot
                    </label>
                    <SearchableSelect
                      options={[
                        { value: '', label: '-- All Lots (Sequential) --' },
                        ...availableLots.map(lot => ({
                          value: lot.lotNumber,
                          label: `${lot.lotNumber} (${lot.pieces?.length || 0} pcs)`
                        }))
                      ]}
                      value={approvalForm.lotNumber}
                      onChange={(val) => setApprovalForm({ ...approvalForm, lotNumber: val })}
                      placeholder="-- All Lots (Sequential) --"
                    />
                  </div>
                );
              })()}

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  Approval Notes (Optional)
                </label>
                <textarea
                  placeholder="Add any remarks or details regarding the approval..."
                  value={approvalForm.approvalNotes}
                  onChange={(e) => setApprovalForm({ ...approvalForm, approvalNotes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2.5 border border-zinc-200 rounded-xl text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                />
              </div>

              <button
                onClick={handleSubmitApproval}
                disabled={isSubmittingApproval}
                className={`w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition cursor-pointer ${isSubmittingApproval
                    ? 'bg-emerald-300 text-white cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                  }`}
              >
                {isSubmittingApproval ? (
                  <><Loader2 size={16} className="animate-spin" /> Approving...</>
                ) : (
                  <><Check size={15} /> Approve & Deduct Stock</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ADD CUSTOM MATERIAL TYPE MODAL ═══ */}
      {showAddMaterialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
            onClick={handleCancelAddMaterialType}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md animate-in fade-in zoom-in-95 duration-200 text-left">
            <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-center">
                  <ClipboardList size={20} className="text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-black text-zinc-950 text-sm">Manage Material Types</h3>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">Create, update and delete belt material types</p>
                </div>
              </div>
              <button
                onClick={handleCancelAddMaterialType}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  Add New Material Type <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. PU - Red Flexible Grade"
                    value={newMaterialTypeName}
                    onChange={(e) => setNewMaterialTypeName(e.target.value)}
                    className="flex-1 px-3 py-2 border border-zinc-200 rounded-xl text-sm font-bold bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleAddCustomMaterialType();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomMaterialType}
                    className="px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition cursor-pointer flex items-center justify-center gap-1 shadow-md active:scale-95 shrink-0"
                  >
                    <Plus size={15} /> Add
                  </button>
                </div>
              </div>

              {/* Scrollable list of existing ones */}
              <div className="space-y-2 pt-2 border-t border-zinc-105">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  Existing Material Types ({materialTypes.length})
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                  {materialTypes.map((type) => {
                    const isEditing = editingMaterialType === type;
                    return (
                      <div
                        key={type}
                        className="flex items-center justify-between p-2 bg-slate-50 border border-zinc-100 rounded-xl hover:bg-slate-105/70 transition gap-2"
                      >
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingMaterialTypeName}
                            onChange={(e) => setEditingMaterialTypeName(e.target.value)}
                            className="flex-1 px-2 py-1 border border-zinc-200 bg-white rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdateMaterialType(type);
                              if (e.key === 'Escape') setEditingMaterialType(null);
                            }}
                          />
                        ) : (
                          <span className="text-xs font-bold text-zinc-850 truncate">{type}</span>
                        )}

                        <div className="flex items-center gap-1 shrink-0">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => handleUpdateMaterialType(type)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition cursor-pointer"
                                title="Save"
                              >
                                <Check size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingMaterialType(null)}
                                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                title="Cancel"
                              >
                                <X size={14} />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMaterialType(type);
                                  setEditingMaterialTypeName(type);
                                }}
                                className="p-1.5 text-slate-500 hover:text-indigo-650 hover:bg-indigo-50 rounded-lg transition cursor-pointer"
                                title="Edit"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteMaterialType(type)}
                                className="p-1.5 text-slate-500 hover:text-rose-650 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleCancelAddMaterialType}
                  className="w-full py-2.5 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-xs font-black transition cursor-pointer text-center"
                >
                  Close Manager
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ FULLSCREEN ROLL MODAL ═══ */}
      {fullscreenRollId && (() => {
        const roll = rolls.find(r => r.id === fullscreenRollId);
        if (!roll) return null;

        const isReuse = isRollReuse(roll);
        const resolvedCuts = getResolvedRollCuts(roll, rolls);
        const cuts = roll.cuts || [];
        const lenVal = fromMeters(roll.fullLength).toFixed(1);
        const widVal = fromMeters(roll.fullWidth).toFixed(1);
        const efficiencyVal = cuts.length > 0 ? (roll.efficiency || 0).toFixed(1) : '0';

        // Calculate remaining area
        const totalCutsArea = cuts.reduce((acc, cut) => acc + (cut.length * cut.width), 0);
        const totalRollArea = roll.fullLength * roll.fullWidth;
        const remainingArea = totalRollArea - totalCutsArea;

        const displayTotalArea = formatDisplayValue(totalRollArea);
        const displayRemainingArea = formatDisplayValue(remainingArea);

        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 md:p-8">
            <div
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              onClick={() => setFullscreenRollId(null)}
            />
            <div className={`relative bg-white rounded-[32px] shadow-2xl w-[96vw] max-w-[1600px] flex flex-col border border-slate-200 animate-in fade-in zoom-in-95 duration-200 text-left transition-all duration-300 ease-in-out ${isLayoutFrozen
                ? 'h-[92vh] max-h-[92vh] overflow-hidden'
                : 'h-auto max-h-[92vh] overflow-y-auto'
              }`}>
              {/* Header */}
              <div className="p-6 border-b border-zinc-150 flex items-center justify-between bg-slate-50/50 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-lg">
                    <Package size={22} />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 text-lg flex items-center gap-2 italic uppercase" title={roll.id}>
                      Roll {getShortRollId(roll.id)}
                      <span className={`text-[9px] px-2.5 py-0.5 rounded-full not-italic font-black tracking-widest ${isReuse ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                        {isReuse ? 'REUSE' : 'FRESH'}
                      </span>
                      <span className={`text-[9px] px-2.5 py-0.5 rounded-full not-italic font-black tracking-widest ${cuts.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                        {cuts.length > 0 ? 'REMNANT' : 'FULL'}
                      </span>
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{roll.materialType}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsLayoutFrozen(!isLayoutFrozen)}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition-all duration-300 ease-in-out cursor-pointer flex items-center gap-1.5 shadow-md active:scale-95 shrink-0 uppercase tracking-wider border ${isLayoutFrozen
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-transparent shadow-indigo-100'
                        : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 shadow-sm'
                      }`}
                  >
                    <span>{isLayoutFrozen ? '📌 Frozen Layout' : '🔓 Freeze Layout'}</span>
                  </button>
                  <button
                    onClick={() => handlePrintRollLayout(roll.id)}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 shadow-md active:scale-95 shrink-0 uppercase tracking-wider"
                  >
                    <Printer size={14} /> Print Layout
                  </button>
                  <button
                    onClick={() => setFullscreenRollId(null)}
                    className="p-2.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer border border-slate-200 bg-white"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Body Content: Responsive Split Layout */}
              <div className={`flex-1 flex flex-col lg:flex-row transition-all duration-300 ease-in-out ${isLayoutFrozen ? 'overflow-hidden' : 'overflow-visible h-auto'
                }`}>

                {/* Left Column: Visualizer Layout Pane (occupies remaining width) */}
                <div className={`p-4 md:p-5 flex flex-col bg-slate-50 transition-all duration-300 ease-in-out ${isLayoutFrozen ? 'flex-1 overflow-hidden h-full' : 'w-full lg:flex-1 overflow-visible h-auto'
                  }`}>
                  <RollVisualizer
                    roll={roll}
                    unit={currentUnit}
                    isExpanded={true}
                    onSelectCut={(cut) => handleDeleteCut(roll.id, cut)}
                    hideTitle={true}
                    noBorder={true}
                    height={isLayoutFrozen ? 'h-full flex-grow' : 'h-[500px] flex-grow'}
                    allRolls={rolls}
                  />
                </div>

                {/* Right Column: Stats & Cuts Allocations Sidebar (fixed width on desktop) */}
                <div className={`w-full lg:w-96 lg:shrink-0 border-t lg:border-t-0 lg:border-l border-zinc-150 bg-white flex flex-col transition-all duration-300 ease-in-out ${isLayoutFrozen ? 'overflow-hidden h-full lg:h-[calc(92vh-88px)] lg:sticky lg:top-0' : 'overflow-visible h-auto'
                  }`}>

                  {/* Scrollable Sidebar Content */}
                  <div className={`p-6 space-y-6 transition-all duration-300 ease-in-out ${isLayoutFrozen ? 'flex-1 overflow-y-auto' : 'overflow-visible h-auto'
                    }`}>

                    {/* Stats Grid */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Roll Metrics</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 border border-slate-150 rounded-2xl p-3.5">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Dimensions</p>
                          <p className="text-sm font-black text-slate-800 mt-1">{lenVal}{currentUnit} x {widVal}{currentUnit}</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-150 rounded-2xl p-3.5">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Area</p>
                          <p className="text-sm font-black text-slate-800 mt-1">{displayTotalArea} {areaUnit}</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-150 rounded-2xl p-3.5">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Remaining</p>
                          <p className="text-sm font-black text-slate-800 mt-1">{displayRemainingArea} {areaUnit}</p>
                        </div>
                        <div className="bg-slate-50 border border-slate-150 rounded-2xl p-3.5">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Efficiency</p>
                          <p className="text-sm font-black text-emerald-600 mt-1">{efficiencyVal}%</p>
                        </div>
                      </div>
                    </div>

                    {/* Cuts Allocations Details list */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Cuts Allocations ({resolvedCuts.length})</h4>
                      <div className={`space-y-2.5 transition-all duration-300 ease-in-out ${isLayoutFrozen ? 'max-h-[350px] overflow-y-auto pr-1' : 'max-h-none overflow-visible'
                        }`}>
                        {resolvedCuts.map((cut, idx) => {
                          let dateStr = 'N/A';
                          const tsMatch = cut.id.match(/C-(\d+)/);
                          if (tsMatch) {
                            const d = new Date(parseInt(tsMatch[1], 10));
                            if (!isNaN(d.getTime())) {
                              dateStr = `${d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
                            }
                          }
                          const lenCut = formatCutDim(cut.length);
                          const widCut = formatCutDim(cut.width);
                          return (
                            <div key={cut.id} className="p-3.5 bg-slate-50 border border-slate-150 rounded-2xl flex items-center justify-between hover:bg-slate-100 transition duration-150">
                              <div className="min-w-0 flex-1 pr-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-bold text-slate-400">#{idx + 1}</span>
                                  <span className="text-xs font-black text-slate-850 truncate">
                                    {isInventoryCutName(cut.customerName) ? (
                                      <span className="bg-emerald-55 text-white px-1.5 py-0.5 rounded text-[8px] font-black tracking-widest uppercase">REUSE</span>
                                    ) : (
                                      cut.customerName || 'N/A'
                                    )}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-0.5 mt-1.5 text-[10px] text-slate-500 font-bold">
                                  <span className="text-slate-800 font-black">{lenCut}{currentUnit} x {widCut}{currentUnit}</span>
                                  <span className="text-[9px] text-slate-400 font-medium">{dateStr}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => handleDeleteCut(roll.id, cut)}
                                className="p-1.5 hover:bg-rose-50 text-rose-500 rounded-lg transition border border-transparent hover:border-rose-100 cursor-pointer active:scale-95 shrink-0"
                                title="Delete Allocation"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          );
                        })}
                        {cuts.length === 0 && (
                          <div className="py-12 text-center text-slate-400 text-xs font-medium border-2 border-dashed border-slate-200 rounded-3xl">
                            No cuts allocated to this roll yet.
                          </div>
                        )}
                      </div>
                    </div>

                  </div>
                </div>

              </div>
            </div>
          </div>
        );
      })()}
      {/* Stock History Details Modal */}
      {selectedHistoryItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-cyan-50 to-blue-50 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-wider font-Outfit">
                  Stock History Details
                </h3>
                <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                  {selectedHistoryItem.beltStock} — {selectedHistoryItem.size} ({selectedHistoryItem.category})
                </p>
              </div>
              <button
                onClick={() => setSelectedHistoryItem(null)}
                className="p-1.5 hover:bg-slate-200/60 text-slate-400 hover:text-slate-600 rounded-xl transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="text-center">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Opening Pcs</div>
                  <div className="text-lg font-black text-slate-700 mt-1">{selectedHistoryItem.openingPisc}</div>
                </div>
                <div className="text-center border-l border-slate-200">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Closing Pcs</div>
                  <div className="text-lg font-black text-cyan-600 mt-1">{selectedHistoryItem.closingPisc}</div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Transaction logs</h4>
                <div className="overflow-x-auto border border-slate-100 rounded-2xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-wider">SO No</th>
                        <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-wider">Receiver Name</th>
                        <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-wider text-center">Issued Pcs</th>
                        <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-wider">Date & Time</th>
                        <th className="px-4 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-wider">User</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(() => {
                        const issueLogs = (selectedHistoryItem.detailsLog || []).filter((log: any) => log.issuesQty && log.issuesQty > 0);
                        if (issueLogs.length === 0) {
                          return (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic text-[11px]">
                                No issue logs recorded yet for this item.
                              </td>
                            </tr>
                          );
                        }
                        return issueLogs.map((log: any, lIdx: number) => (
                          <tr key={lIdx} className="hover:bg-slate-50/50">
                            <td className="px-4 py-2.5 font-mono font-bold text-indigo-600 whitespace-nowrap">{log.soNo || '-'}</td>
                            <td className="px-4 py-2.5 font-bold text-slate-600 whitespace-nowrap">{log.receiverName || '-'}</td>
                            <td className="px-4 py-2.5 font-mono font-bold text-amber-600 text-center">
                              {log.issuesQty}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-[10px] text-slate-500 font-bold whitespace-nowrap">{log.dateTime}</td>
                            <td className="px-4 py-2.5 font-bold text-slate-700 whitespace-nowrap">
                              {log.name}
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedHistoryItem(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issue Stock Modal */}
      {selectedIssueItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-wider font-Outfit">
                  Issue Belt Stock
                </h3>
                <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                  {selectedIssueItem.beltStock} — {selectedIssueItem.size}
                </p>
              </div>
              <button
                onClick={() => setSelectedIssueItem(null)}
                className="p-1.5 hover:bg-slate-200/60 text-slate-400 hover:text-slate-650 rounded-xl transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleIssueSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-center">
                <div>
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Opening Stock</div>
                  <div className="text-sm font-black text-slate-700 mt-0.5">{selectedIssueItem.openingPisc} Pcs</div>
                </div>
                <div className="border-l border-slate-200">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Current Closing</div>
                  <div className="text-sm font-black text-cyan-600 mt-0.5">{selectedIssueItem.closingPisc} Pcs</div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  Quantity to Issue <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="e.g. 2"
                  value={issueForm.issuesPisc}
                  onChange={(e) => setIssueForm({ ...issueForm, issuesPisc: e.target.value })}
                  className="w-full px-3.5 py-2 border border-zinc-200 rounded-xl text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  Sales Order No (So-No) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 11673"
                  value={issueForm.soNo}
                  onChange={(e) => setIssueForm({ ...issueForm, soNo: e.target.value })}
                  className="w-full px-3.5 py-2 border border-zinc-200 rounded-xl text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  Receiver Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Asif Keshwani"
                  value={issueForm.receiverName}
                  onChange={(e) => setIssueForm({ ...issueForm, receiverName: e.target.value })}
                  className="w-full px-3.5 py-2 border border-zinc-200 rounded-xl text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedIssueItem(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-205 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <Check size={14} /> Submit Issue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Update Stock Modal */}
      {selectedUpdateItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800 uppercase tracking-wider font-Outfit">
                  Receive / Update Stock
                </h3>
                <p className="text-[11px] text-slate-500 font-bold mt-0.5">
                  {selectedUpdateItem.beltStock} — {selectedUpdateItem.size}
                </p>
              </div>
              <button
                onClick={() => setSelectedUpdateItem(null)}
                className="p-1.5 hover:bg-slate-200/60 text-slate-400 hover:text-slate-650 rounded-xl transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleUpdateSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-center">
                <div>
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Opening Stock</div>
                  <div className="text-sm font-black text-slate-700 mt-0.5">{selectedUpdateItem.openingPisc} Pcs</div>
                </div>
                <div className="border-l border-slate-200">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Current Closing</div>
                  <div className="text-sm font-black text-cyan-600 mt-0.5">{selectedUpdateItem.closingPisc} Pcs</div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  Quantity to Receive (Recv Pcs) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  placeholder="e.g. 5"
                  value={updateForm.recvPisc}
                  onChange={(e) => setUpdateForm({ recvPisc: e.target.value })}
                  className="w-full px-3.5 py-2 border border-zinc-200 rounded-xl text-xs font-bold bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedUpdateItem(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-205 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <Check size={14} /> Update Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
