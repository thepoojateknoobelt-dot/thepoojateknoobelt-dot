import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { Search, RotateCcw, Trash2, Calendar, Archive, FolderOpen, ArrowLeftRight, HelpCircle } from 'lucide-react';
import { Input } from './ui/input';

interface DeletedItem {
  id: string;
  type: 'category' | 'style' | 'bom' | 'subcategory';
  name: string;
  parentPath: string;
  deletedAt: string;
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
        return <Badge className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 uppercase tracking-widest font-black text-[9px] px-2 py-0.5">Category</Badge>;
      case 'style':
        return <Badge className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 uppercase tracking-widest font-black text-[9px] px-2 py-0.5">Style</Badge>;
      case 'bom':
        return <Badge className="bg-teal-50 hover:bg-teal-100 text-teal-700 border-teal-200 uppercase tracking-widest font-black text-[9px] px-2 py-0.5">BOM Component</Badge>;
      case 'subcategory':
        return <Badge className="bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200 uppercase tracking-widest font-black text-[9px] px-2 py-0.5">Sub-category</Badge>;
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
    <div className="space-y-4">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-violet-600 rounded-xl text-white shadow-md shadow-violet-500/20">
            <Archive className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">Data Directory</h1>
            <p className="text-xs text-zinc-500 mt-0.5">View and restore deleted configurations (Categories, Styles, and BOM Components).</p>
          </div>
        </div>
      </div>

      {/* Search Filter bar */}
      <div className="bg-zinc-50/50 p-4 rounded-xl border border-zinc-200/80 shadow-xs backdrop-blur-md max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search deleted items by name, type, path..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 border-zinc-300 focus-visible:ring-zinc-400 bg-white"
          />
        </div>
      </div>

      {/* Main card list */}
      <Card className="border-zinc-200 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle>Deleted Configurations Log</CardTitle>
          <CardDescription>
            Showing {filteredItems.length} of {deletedItems.length} deleted items
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-2">
          <div className="rounded-md border border-zinc-200 overflow-hidden bg-white">
            <Table>
              <TableHeader className="bg-zinc-50/50">
                <TableRow>
                  <TableHead className="font-bold text-zinc-700">Item Name</TableHead>
                  <TableHead className="font-bold text-zinc-700">Type</TableHead>
                  <TableHead className="font-bold text-zinc-700">Parent Path</TableHead>
                  <TableHead className="font-bold text-zinc-700">Deleted At</TableHead>
                  <TableHead className="w-[180px] text-right font-bold text-zinc-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center text-zinc-400">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <div className="h-5 w-5 border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin" />
                        <span className="text-xs">Loading recovery history...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-40 text-center text-zinc-400 italic">
                      <div className="flex flex-col items-center justify-center gap-2.5 py-6">
                        <div className="p-3 bg-zinc-100 rounded-full text-zinc-350">
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
                    <TableRow key={item.id} className="hover:bg-zinc-50/50 transition-colors">
                      <TableCell className="font-bold text-zinc-900 text-sm">
                        {item.name.toUpperCase()}
                      </TableCell>
                      <TableCell>
                        {getTypeBadge(item.type)}
                      </TableCell>
                      <TableCell className="text-zinc-500 font-medium text-xs">
                        {item.parentPath ? (
                          <span className="flex items-center gap-1.5 bg-zinc-100 text-zinc-650 px-2 py-0.5 rounded-md w-fit">
                            <FolderOpen className="h-3 w-3 text-zinc-400" />
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
                            className="h-8 text-xs font-bold gap-1 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-800 border-emerald-200 text-emerald-700 shrink-0 cursor-pointer"
                            disabled={isRestoring === item.id || isPurging === item.id}
                            onClick={() => handleRestore(item.id, item.name)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            {isRestoring === item.id ? 'Restoring...' : 'Restore'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 border-zinc-200 hover:border-rose-200 transition-colors shrink-0 cursor-pointer p-0"
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
    </div>
  );
};
