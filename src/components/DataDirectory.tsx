import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { Search, RotateCcw, Trash2, Calendar, Archive, FolderOpen, ArrowLeftRight, HelpCircle, Eye, Info, User, HelpCircle as FormulaIcon, Coins, ShieldAlert } from 'lucide-react';
import { Input } from './ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from './ui/dialog';

interface DeletedItem {
  id: string;
  type: 'category' | 'style' | 'bom' | 'subcategory';
  name: string;
  parentPath: string;
  deletedAt: string;
  deletedBy?: string;
  data?: any;
}

interface DataDirectoryProps {
  onRefresh?: () => void;
}

export const DataDirectory: React.FC<DataDirectoryProps> = ({ onRefresh }) => {
  const [deletedItems, setDeletedItems] = useState<DeletedItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<DeletedItem | null>(null);

  const fetchDeletedConfigs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/settings/config/deleted');
      if (res.ok) {
        const data = await res.json();
        setDeletedItems(data);
      } else {
        toast.error('Failed to load deleted configurations history');
      }
    } catch (err) {
      console.error(err);
      toast.error('Network error loading deleted configs');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeletedConfigs();
  }, []);

  const handleRestore = async (id: string, name: string) => {
    setIsRestoring(id);
    try {
      const res = await fetch(`/api/settings/config/restore/${id}`, {
        method: 'POST'
      });
      if (res.ok) {
        toast.success(`"${name}" restored successfully!`);
        fetchDeletedConfigs();
        if (onRefresh) onRefresh();
      } else {
        const errData = await res.json();
        toast.error(errData.error || `Failed to restore "${name}"`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to restore item due to network error');
    } finally {
      setIsRestoring(null);
    }
  };

  const handlePurge = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${name}"? This action cannot be undone.`)) {
      return;
    }
    setIsPurging(id);
    try {
      const res = await fetch(`/api/settings/config/deleted/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        toast.success(`"${name}" permanently deleted`);
        fetchDeletedConfigs();
      } else {
        toast.error('Failed to permanently delete item');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to purge item due to network error');
    } finally {
      setIsPurging(null);
    }
  };

  const getTypeBadge = (type: 'category' | 'style' | 'bom' | 'subcategory') => {
    switch (type) {
      case 'category':
        return <Badge className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 uppercase tracking-widest font-black text-[9px] px-2 py-0.5 shadow-xs">Category</Badge>;
      case 'style':
        return <Badge className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 uppercase tracking-widest font-black text-[9px] px-2 py-0.5 shadow-xs">Style</Badge>;
      case 'bom':
        return <Badge className="bg-teal-50 hover:bg-teal-100 text-teal-700 border-teal-200 uppercase tracking-widest font-black text-[9px] px-2 py-0.5 shadow-xs">BOM Component</Badge>;
      case 'subcategory':
        return <Badge className="bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200 uppercase tracking-widest font-black text-[9px] px-2 py-0.5 shadow-xs">Sub-category</Badge>;
      default:
        return <Badge className="bg-zinc-100 text-zinc-700 uppercase tracking-widest font-black text-[9px]">Unknown</Badge>;
    }
  };

  const filteredItems = deletedItems.filter(item => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      item.name.toLowerCase().includes(query) ||
      item.type.toLowerCase().includes(query) ||
      item.parentPath.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-blue-50 text-[#1e40af] rounded-xl border border-blue-100 shadow-sm">
            <Archive className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[#1e3a8a]">Data Directory</h1>
            <p className="text-xs text-zinc-500 mt-0.5">View and restore deleted configurations (Categories, Styles, and BOM Components).</p>
          </div>
        </div>
      </div>

      {/* Search Filter bar */}
      <div className="bg-blue-50/10 p-4 rounded-xl border border-blue-100/50 shadow-xs max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-blue-500/80" />
          <Input
            placeholder="Search deleted items by name, type, path..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 border-blue-200 focus-visible:ring-blue-100 bg-white text-xs"
          />
        </div>
      </div>

      {/* Main card list */}
      <Card className="border-blue-100/60 shadow-[0_4px_12px_rgba(30,58,138,0.04)] rounded-[14px] bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-black text-[#1e3a8a]">Deleted Configurations Log</CardTitle>
          <CardDescription className="text-xs text-zinc-500">
            Showing {filteredItems.length} of {deletedItems.length} deleted items
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-2">
          <div className="rounded-xl border border-blue-100/50 overflow-hidden bg-white">
            <Table>
              <TableHeader className="bg-blue-50/20">
                <TableRow className="border-b border-blue-100/30">
                  <TableHead className="font-bold text-[#1e3a8a] text-xs">Item Name</TableHead>
                  <TableHead className="font-bold text-[#1e3a8a] text-xs">Type</TableHead>
                  <TableHead className="font-bold text-[#1e3a8a] text-xs">Parent Path</TableHead>
                  <TableHead className="font-bold text-[#1e3a8a] text-xs">Deleted At</TableHead>
                  <TableHead className="w-[260px] text-right font-bold text-[#1e3a8a] text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-zinc-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="h-5 w-5 border-2 border-blue-300 border-t-blue-700 rounded-full animate-spin" />
                        <span className="text-xs font-medium text-zinc-500">Loading recovery history...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-40 text-center text-zinc-400 italic">
                      <div className="flex flex-col items-center justify-center gap-2.5 py-6">
                        <div className="p-3 bg-blue-50 rounded-full text-blue-500/80 border border-blue-100">
                          <Archive className="h-6 w-6" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-zinc-700 not-italic">No deleted items found</p>
                          <p className="text-[11px] text-zinc-400 max-w-[280px]">Deleted Categories, Styles, or Components will be backed up here automatically.</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => (
                    <TableRow key={item.id} className="hover:bg-blue-50/20 border-b border-blue-100/30 transition-colors">
                      <TableCell className="font-bold text-[#1e3a8a] text-sm">
                        {item.name.toUpperCase()}
                      </TableCell>
                      <TableCell>
                        {getTypeBadge(item.type)}
                      </TableCell>
                      <TableCell className="text-zinc-500 font-medium text-xs">
                        {item.parentPath ? (
                          <span className="flex items-center gap-1.5 bg-blue-50/30 text-blue-900 px-2 py-0.5 rounded-md w-fit border border-blue-100/40">
                            <FolderOpen className="h-3 w-3 text-blue-500" />
                            {item.parentPath}
                          </span>
                        ) : (
                          <span className="text-zinc-400 italic">None (Root)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-zinc-500 font-mono text-xs">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-zinc-400" />
                          {new Date(item.deletedAt).toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs font-bold gap-1 border-blue-100 text-blue-700 hover:bg-blue-50/50 shrink-0 cursor-pointer"
                            onClick={() => setSelectedItem(item)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Details
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs font-bold gap-1 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-800 border-emerald-250 text-emerald-700 shrink-0 cursor-pointer"
                            disabled={isRestoring === item.id || isPurging === item.id}
                            onClick={() => handleRestore(item.id, item.name)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            {isRestoring === item.id ? 'Restoring...' : 'Restore'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 border-blue-100 hover:border-rose-200 transition-colors shrink-0 cursor-pointer p-0"
                            disabled={isRestoring === item.id || isPurging === item.id}
                            onClick={() => handlePurge(item.id, item.name)}
                            title="Delete Permanently"
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

      {/* Details View Modal popup */}
      {selectedItem && (
        <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
          <DialogContent className="max-w-2xl sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-white rounded-2xl border border-blue-100 shadow-xl">
            {/* Header */}
            <DialogHeader className="shrink-0 px-6 py-5 border-b border-blue-150/40 bg-blue-50/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 text-[#1e40af] rounded-xl border border-blue-100">
                  <Info className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-black text-[#1e3a8a] leading-tight">
                    Deleted Item Details
                  </DialogTitle>
                  <DialogDescription className="text-xs text-zinc-500 font-medium">
                    Detailed properties of the deleted configuration.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            {/* Content Details */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Deletion Metadata panel */}
              <div className="grid grid-cols-2 gap-4 bg-blue-50/20 p-4 rounded-xl border border-blue-100/40">
                <div className="flex items-start gap-2.5">
                  <User className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-550 block">Deleted By</span>
                    <span className="text-xs font-black text-[#1e3a8a]">{selectedItem.deletedBy || 'System Admin'}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Calendar className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-550 block">Deleted At</span>
                    <span className="text-xs font-mono font-bold text-zinc-700">{new Date(selectedItem.deletedAt).toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Archive className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-550 block">Item Type</span>
                    <span className="text-xs font-semibold">{getTypeBadge(selectedItem.type)}</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <FolderOpen className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-blue-550 block">Parent Path</span>
                    <span className="text-xs font-semibold text-zinc-650 truncate max-w-[200px] block" title={selectedItem.parentPath || 'Root'}>
                      {selectedItem.parentPath || 'Root'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Specific details based on configuration type */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-[#1e3a8a] pb-1 border-b border-blue-100">
                  Configuration Properties
                </h3>

                {(() => {
                  const data = selectedItem.data;
                  if (!data) {
                    return <p className="text-xs text-zinc-400 italic">No additional properties stored.</p>;
                  }

                  if (selectedItem.type === 'category') {
                    return (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-[10px] text-zinc-400 font-bold block">Category Name</span>
                            <span className="text-xs font-black text-[#1e3a8a]">{data.name}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-400 font-bold block">GST Rate</span>
                            <span className="text-xs font-bold text-emerald-700">{data.gst != null ? `${data.gst}%` : 'Default'}</span>
                          </div>
                        </div>
                        {Array.isArray(data.styles) && data.styles.length > 0 && (
                          <div className="space-y-2 mt-4">
                            <span className="text-[10px] text-zinc-550 font-bold block">Contained Styles ({data.styles.length})</span>
                            <div className="border border-blue-100 rounded-lg overflow-hidden text-xs">
                              <table className="min-w-full divide-y divide-blue-100">
                                <thead className="bg-blue-50/50">
                                  <tr>
                                    <th className="px-3 py-2 text-left font-bold text-[#1e3a8a]">Style Name</th>
                                    <th className="px-3 py-2 text-right font-bold text-[#1e3a8a]">BOM Component Count</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-blue-50 bg-white font-medium text-zinc-700">
                                  {data.styles.map((s: any, i: number) => (
                                    <tr key={i}>
                                      <td className="px-3 py-2 font-bold">{s.name}</td>
                                      <td className="px-3 py-2 text-right font-mono">{Array.isArray(s.bom) ? s.bom.length : 0}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (selectedItem.type === 'style') {
                    const styleObj = data.style || {};
                    return (
                      <div className="space-y-4">
                        <div>
                          <span className="text-[10px] text-zinc-400 font-bold block">Style Name</span>
                          <span className="text-xs font-black text-[#1e3a8a]">{styleObj.name}</span>
                        </div>
                        {Array.isArray(styleObj.bom) && styleObj.bom.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-[10px] text-zinc-550 font-bold block">BOM Components ({styleObj.bom.length})</span>
                            <div className="border border-blue-100 rounded-lg overflow-hidden text-xs">
                              <table className="min-w-full divide-y divide-blue-100">
                                <thead className="bg-blue-50/50">
                                  <tr>
                                    <th className="px-3 py-2 text-left font-bold text-[#1e3a8a]">Component</th>
                                    <th className="px-3 py-2 text-left font-bold text-[#1e3a8a]">Formula</th>
                                    <th className="px-3 py-2 text-right font-bold text-[#1e3a8a]">Base Rate</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-blue-50 bg-white text-zinc-700 font-semibold">
                                  {styleObj.bom.map((b: any, i: number) => (
                                    <tr key={i}>
                                      <td className="px-3 py-2 font-bold">{b.name}</td>
                                      <td className="px-3 py-2 font-mono text-[10px] text-blue-600 bg-blue-50/30 px-1 py-0.5 rounded border border-blue-100/50 inline-block mt-1 ml-3">={b.formula}</td>
                                      <td className="px-3 py-2 text-right font-mono text-emerald-700">₹{b.rate}/{b.unit}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (selectedItem.type === 'bom') {
                    const bomObj = data.bomItem || {};
                    return (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-[10px] text-zinc-400 font-bold block">Component Name</span>
                            <span className="text-xs font-black text-[#1e3a8a]">{bomObj.name}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-400 font-bold block">Base Rate / Price</span>
                            <span className="text-xs font-mono font-bold text-emerald-700">₹{bomObj.rate}/{bomObj.unit}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-[10px] text-zinc-400 font-bold block">Calculation Formula</span>
                            <span className="text-xs font-mono text-blue-700 bg-blue-50/50 border border-blue-100/60 px-2.5 py-1 rounded-md inline-block mt-0.5 font-black">
                              ={bomObj.formula}
                            </span>
                          </div>
                        </div>

                        {Array.isArray(bomObj.options) && bomObj.options.length > 0 && (
                          <div className="space-y-2 mt-4">
                            <span className="text-[10px] text-zinc-550 font-bold block">Sub-category Options ({bomObj.options.length})</span>
                            <div className="border border-blue-100 rounded-lg overflow-hidden text-xs">
                              <table className="min-w-full divide-y divide-blue-100">
                                <thead className="bg-blue-50/50">
                                  <tr>
                                    <th className="px-3 py-2 text-left font-bold text-[#1e3a8a]">Option Name</th>
                                    <th className="px-3 py-2 text-left font-bold text-[#1e3a8a]">Formula</th>
                                    <th className="px-3 py-2 text-right font-bold text-[#1e3a8a]">Rate</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-blue-50 bg-white text-zinc-700 font-medium">
                                  {bomObj.options.map((o: any, i: number) => (
                                    <tr key={i}>
                                      <td className="px-3 py-2 font-bold flex items-center gap-1.5">
                                        {o.name}
                                        {o.isFormation && (
                                          <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[8px] px-1 py-0 shadow-none uppercase font-extrabold scale-90">Formation</Badge>
                                        )}
                                      </td>
                                      <td className="px-3 py-2 font-mono text-[10px] text-blue-600">{o.formula ? `=${o.formula}` : '—'}</td>
                                      <td className="px-3 py-2 text-right font-mono text-emerald-700">₹{o.rate}/{o.unit || bomObj.unit}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  if (selectedItem.type === 'subcategory') {
                    const optObj = data.option || {};
                    return (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-[10px] text-zinc-400 font-bold block">Option Name</span>
                            <span className="text-xs font-black text-[#1e3a8a]">{optObj.name}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-400 font-bold block">Rate / Price</span>
                            <span className="text-xs font-mono font-bold text-emerald-700">₹{optObj.rate}/{optObj.unit || '—'}</span>
                          </div>
                          {optObj.formula && (
                            <div className="col-span-2">
                              <span className="text-[10px] text-zinc-400 font-bold block">Calculation Formula</span>
                              <span className="text-xs font-mono text-blue-700 bg-blue-50/50 border border-blue-100/60 px-2.5 py-1 rounded-md inline-block mt-0.5 font-black">
                                ={optObj.formula}
                              </span>
                            </div>
                          )}
                        </div>

                        {optObj.isFormation && Array.isArray(optObj.formationItems) && optObj.formationItems.length > 0 && (
                          <div className="space-y-2 mt-4 animate-in fade-in duration-200">
                            <span className="text-[10px] text-zinc-550 font-bold block">Formation Formula Expanded List ({optObj.formationItems.length})</span>
                            <div className="border border-blue-100 rounded-lg overflow-hidden text-xs">
                              <table className="min-w-full divide-y divide-blue-100">
                                <thead className="bg-blue-50/50">
                                  <tr>
                                    <th className="px-3 py-2 text-left font-bold text-[#1e3a8a]">Material Item</th>
                                    <th className="px-3 py-2 text-left font-bold text-[#1e3a8a]">Formula</th>
                                    <th className="px-3 py-2 text-right font-bold text-[#1e3a8a]">Rate</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-blue-50 bg-white text-zinc-700 font-medium">
                                  {optObj.formationItems.map((fi: any, i: number) => (
                                    <tr key={i}>
                                      <td className="px-3 py-2 font-bold">{fi.name}</td>
                                      <td className="px-3 py-2 font-mono text-[10px] text-blue-600">{fi.formula ? `=${fi.formula}` : '—'}</td>
                                      <td className="px-3 py-2 text-right font-mono text-emerald-700">₹{fi.rate}/{fi.unit || optObj.unit || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }

                  return null;
                })()}
              </div>
            </div>

            {/* Footer */}
            <DialogFooter className="bg-blue-50/10 px-6 py-4 border-t border-blue-150/40 flex justify-end gap-2 shrink-0">
              <Button onClick={() => setSelectedItem(null)} className="bg-[#1e40af] hover:bg-[#1d4ed8] text-white text-xs font-bold px-4 h-9 rounded-[6px] cursor-pointer">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
