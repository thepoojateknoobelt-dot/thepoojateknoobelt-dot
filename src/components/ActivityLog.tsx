import React, { useState, useEffect, useMemo } from 'react';
import { AuditLog } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { History, Activity, ArrowUp, ArrowDown, ArrowUpDown, FilterX, Download, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

const ColumnHeader = ({ 
  label, 
  filterKey, 
  sortKey, 
  filters, 
  setFilters, 
  sortConfig, 
  handleSort,
  uniqueValues,
  type = 'text'
}: any) => {
  return (
    <TableHead className="px-2 py-3 align-top min-w-[120px]">
      <div className="flex flex-col gap-2">
        <button 
          onClick={() => handleSort(sortKey)}
          className="flex items-center justify-between font-bold text-zinc-900 hover:bg-zinc-100 rounded px-1.5 -mx-1.5 py-1 transition-colors w-full group"
        >
          <span className="truncate">{label}</span>
          {sortConfig?.key === sortKey ? (
            sortConfig.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5 shrink-0 text-zinc-900" /> : <ArrowDown className="h-3.5 w-3.5 shrink-0 text-zinc-900" />
          ) : (
            <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </button>
        
        {type === 'text' && (
          <>
            <Input 
              placeholder={`Filter...`} 
              value={filters[filterKey]} 
              onChange={(e) => setFilters((prev: any) => ({ ...prev, [filterKey]: e.target.value }))}
              className="h-7 text-xs px-2 bg-white/80 focus:bg-white transition-colors"
              list={`list-${filterKey}`}
            />
            {uniqueValues && uniqueValues.length > 0 && (
              <datalist id={`list-${filterKey}`}>
                {uniqueValues.map((val: string, i: number) => (
                  <option key={i} value={val} />
                ))}
              </datalist>
            )}
          </>
        )}

        {type === 'date-range' && (
          <div className="flex flex-col gap-1">
            <Input 
              type="date"
              title="Start Date"
              value={filters.startDate} 
              onChange={(e) => setFilters((prev: any) => ({ ...prev, startDate: e.target.value }))}
              className="h-7 text-xs px-2 bg-white/80 focus:bg-white transition-colors w-full"
            />
            <Input 
              type="date"
              title="End Date"
              value={filters.endDate} 
              onChange={(e) => setFilters((prev: any) => ({ ...prev, endDate: e.target.value }))}
              className="h-7 text-xs px-2 bg-white/80 focus:bg-white transition-colors w-full"
            />
          </div>
        )}

        {type === 'price-range' && (
          <div className="flex gap-1">
            <Input 
              type="number"
              placeholder="Min ₹"
              value={filters.minPrice} 
              onChange={(e) => setFilters((prev: any) => ({ ...prev, minPrice: e.target.value }))}
              className="h-7 text-xs px-2 bg-white/80 focus:bg-white transition-colors w-full"
            />
            <Input 
              type="number"
              placeholder="Max ₹"
              value={filters.maxPrice} 
              onChange={(e) => setFilters((prev: any) => ({ ...prev, maxPrice: e.target.value }))}
              className="h-7 text-xs px-2 bg-white/80 focus:bg-white transition-colors w-full"
            />
          </div>
        )}
      </div>
    </TableHead>
  );
};

export const ActivityLog = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} selected activity log(s)?`)) return;
    
    setIsDeleting(true);
    try {
      const res = await fetch('/api/audit-logs/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds })
      });
      if (!res.ok) throw new Error('Failed to delete selected logs');
      
      toast.success('Selected logs deleted successfully');
      setLogs(prev => prev.filter(log => !selectedIds.includes(log.id)));
      setSelectedIds([]);
    } catch (err) {
      toast.error('Failed to delete selected logs');
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    user: '',
    action: '',
    client: '',
    belt: '',
    dim: '',
    minPrice: '',
    maxPrice: ''
  });

  const [sortConfig, setSortConfig] = useState<{key: string, direction: 'asc'|'desc'} | null>(null);

  useEffect(() => {
    fetch('/api/audit-logs')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch audit logs');
        return res.json();
      })
      .then(data => {
        setLogs(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error(err);
        setIsLoading(false);
      });
  }, []);

  const parseDetails = (details: string) => {
    const match = details.match(/Client:\s*(.*?),\s*Belt:\s*(.*?),\s*Dim:\s*(.*?),\s*Price:\s*(.*)/);
    if (match) {
      return {
        client: match[1].trim(),
        belt: match[2].trim(),
        dim: match[3].trim(),
        price: match[4].trim(),
        isParsed: true
      };
    }
    return {
      raw: details,
      isParsed: false
    };
  };

  const parsedLogs = useMemo(() => {
    return logs.map(log => {
      const parsed = parseDetails(log.details);
      return {
        id: log.id,
        parsedUser: log.userName || log.userId || 'Unknown',
        parsedAction: log.action.replace(/_/g, ' '),
        parsedTimestamp: log.timestamp 
          ? (typeof log.timestamp === 'string' 
              ? new Date(log.timestamp).toLocaleString(undefined, { 
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
                })
              : (log.timestamp?.toDate 
                  ? log.timestamp.toDate().toLocaleString(undefined, { 
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
                    })
                  : 'Just now'))
          : 'Just now',
        timestampValue: log.timestamp 
          ? (typeof log.timestamp === 'string'
              ? new Date(log.timestamp).getTime()
              : (log.timestamp?.toMillis 
                  ? log.timestamp.toMillis() 
                  : new Date(log.timestamp).getTime()))
          : 0,
        parsedClient: parsed.isParsed ? parsed.client : '',
        parsedBelt: parsed.isParsed ? parsed.belt : '',
        parsedDim: parsed.isParsed ? parsed.dim : '',
        parsedPrice: parsed.isParsed ? parsed.price : '',
        rawDetails: log.details,
        isParsed: parsed.isParsed
      };
    });
  }, [logs]);

  const uniqueUsers = useMemo(() => Array.from(new Set(parsedLogs.map(l => l.parsedUser).filter(Boolean))), [parsedLogs]);
  const uniqueActions = useMemo(() => Array.from(new Set(parsedLogs.map(l => l.parsedAction).filter(Boolean))), [parsedLogs]);
  const uniqueClients = useMemo(() => Array.from(new Set(parsedLogs.map(l => l.parsedClient).filter(Boolean))), [parsedLogs]);
  const uniqueBelts = useMemo(() => Array.from(new Set(parsedLogs.map(l => l.parsedBelt).filter(Boolean))), [parsedLogs]);
  const uniqueDims = useMemo(() => Array.from(new Set(parsedLogs.map(l => l.parsedDim).filter(Boolean))), [parsedLogs]);

  const filteredLogs = useMemo(() => {
    return parsedLogs.filter(log => {
      // Date Range Filter
      let matchDate = true;
      if (filters.startDate || filters.endDate) {
        if (log.timestampValue > 0) {
          const logDate = new Date(log.timestampValue);
          logDate.setHours(0, 0, 0, 0);
          
          if (filters.startDate) {
            const sDate = new Date(filters.startDate);
            sDate.setHours(0, 0, 0, 0);
            if (logDate < sDate) matchDate = false;
          }
          if (filters.endDate) {
            const eDate = new Date(filters.endDate);
            eDate.setHours(23, 59, 59, 999);
            if (logDate > eDate) matchDate = false;
          }
        } else {
          matchDate = false;
        }
      }

      // Price Range Filter
      let matchPrice = true;
      if (filters.minPrice || filters.maxPrice) {
        const pValue = parseFloat(log.parsedPrice.replace(/[^0-9.-]+/g,"")) || 0;
        if (filters.minPrice) {
          if (pValue < parseFloat(filters.minPrice)) matchPrice = false;
        }
        if (filters.maxPrice) {
          if (pValue > parseFloat(filters.maxPrice)) matchPrice = false;
        }
      }

      const matchUser = log.parsedUser.toLowerCase().includes(filters.user.toLowerCase());
      const matchAction = log.parsedAction.toLowerCase().includes(filters.action.toLowerCase());
      const matchClient = log.parsedClient.toLowerCase().includes(filters.client.toLowerCase()) || (!log.isParsed && log.rawDetails.toLowerCase().includes(filters.client.toLowerCase()));
      const matchBelt = log.parsedBelt.toLowerCase().includes(filters.belt.toLowerCase());
      const matchDim = log.parsedDim.toLowerCase().includes(filters.dim.toLowerCase());

      return matchDate && matchPrice && matchUser && matchAction && matchClient && matchBelt && matchDim;
    });
  }, [parsedLogs, filters]);

  const sortedLogs = useMemo(() => {
    let sortableItems = [...filteredLogs];
    if (sortConfig !== null) {
      sortableItems.sort((a: any, b: any) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        
        if (sortConfig.key === 'parsedPrice') {
           aVal = parseFloat(aVal.replace(/[^0-9.-]+/g,"")) || 0;
           bVal = parseFloat(bVal.replace(/[^0-9.-]+/g,"")) || 0;
        }

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredLogs, sortConfig]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const clearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      user: '',
      action: '',
      client: '',
      belt: '',
      dim: '',
      minPrice: '',
      maxPrice: ''
    });
    setSortConfig(null);
  };

  const exportToCSV = () => {
    if (sortedLogs.length === 0) return;

    const headers = ['Timestamp', 'User', 'Action', 'Client', 'Belt & Style', 'Dimensions', 'Price', 'Raw Details'];

    const csvRows = sortedLogs.map((log: any) => {
      return [
        `"${log.parsedTimestamp}"`,
        `"${log.parsedUser}"`,
        `"${log.parsedAction}"`,
        `"${log.parsedClient || ''}"`,
        `"${log.parsedBelt || ''}"`,
        `"${log.parsedDim || ''}"`,
        `"${log.parsedPrice || ''}"`,
        `"${log.rawDetails.replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `activity_log_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasActiveFilters = Object.values(filters).some(val => val !== '') || sortConfig !== null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 text-[#1e40af] rounded-lg">
            <History className="h-4 w-4" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">Recent Activity</h1>
        </div>
      </div>

      <Card className="border-zinc-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-zinc-500" />
              Activity Log
            </CardTitle>
            <CardDescription>Latest system events and calculations</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={clearFilters} 
                className="h-9 px-3 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100"
              >
                <FilterX className="h-4 w-4 mr-1.5" />
                Clear
              </Button>
            )}
            {isAdmin && selectedIds.length > 0 && (
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={handleDeleteSelected} 
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700 text-white font-bold h-9 px-3 gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                Delete Selected ({selectedIds.length})
              </Button>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={exportToCSV}
              disabled={sortedLogs.length === 0}
              className="h-9 px-3 border-zinc-200"
            >
              <Download className="h-4 w-4 mr-1.5 text-zinc-500" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader className="bg-zinc-50/50">
                <TableRow className="hover:bg-transparent">
                  {isAdmin && (
                    <TableHead className="w-12 px-3 py-3 align-top">
                      <div className="flex flex-col gap-2 pt-1.5">
                        <input 
                          type="checkbox" 
                          checked={sortedLogs.length > 0 && selectedIds.length === sortedLogs.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(sortedLogs.map(l => l.id));
                            } else {
                              setSelectedIds([]);
                            }
                          }}
                          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                        />
                      </div>
                    </TableHead>
                  )}
                  <ColumnHeader 
                    label="Timestamp" type="date-range" sortKey="timestampValue" 
                    filters={filters} setFilters={setFilters} sortConfig={sortConfig} handleSort={handleSort} 
                  />
                  <ColumnHeader 
                    label="User" filterKey="user" sortKey="parsedUser" type="text"
                    filters={filters} setFilters={setFilters} sortConfig={sortConfig} handleSort={handleSort} 
                    uniqueValues={uniqueUsers} 
                  />
                  <ColumnHeader 
                    label="Action" filterKey="action" sortKey="parsedAction" type="text"
                    filters={filters} setFilters={setFilters} sortConfig={sortConfig} handleSort={handleSort} 
                    uniqueValues={uniqueActions} 
                  />
                  <ColumnHeader 
                    label="Client" filterKey="client" sortKey="parsedClient" type="text"
                    filters={filters} setFilters={setFilters} sortConfig={sortConfig} handleSort={handleSort} 
                    uniqueValues={uniqueClients} 
                  />
                  <ColumnHeader 
                    label="Belt & Style" filterKey="belt" sortKey="parsedBelt" type="text"
                    filters={filters} setFilters={setFilters} sortConfig={sortConfig} handleSort={handleSort} 
                    uniqueValues={uniqueBelts} 
                  />
                  <ColumnHeader 
                    label="Dimensions" filterKey="dim" sortKey="parsedDim" type="text"
                    filters={filters} setFilters={setFilters} sortConfig={sortConfig} handleSort={handleSort} 
                    uniqueValues={uniqueDims} 
                  />
                  <ColumnHeader 
                    label="Price" type="price-range" sortKey="parsedPrice" 
                    filters={filters} setFilters={setFilters} sortConfig={sortConfig} handleSort={handleSort} 
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 8 : 7} className="h-24 text-center text-zinc-500">
                      Loading activity logs...
                    </TableCell>
                  </TableRow>
                ) : sortedLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 8 : 7} className="h-24 text-center text-zinc-500">
                      No matching activity found.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedLogs.map((log: any) => (
                    <TableRow key={log.id} className="hover:bg-zinc-50/50">
                      {isAdmin && (
                        <TableCell className="px-3 py-3 w-12 align-middle">
                          <input 
                            type="checkbox" 
                            checked={selectedIds.includes(log.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedIds(prev => [...prev, log.id]);
                              } else {
                                setSelectedIds(prev => prev.filter(id => id !== log.id));
                              }
                            }}
                            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900 cursor-pointer"
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-mono text-xs text-zinc-500 whitespace-nowrap px-3">
                        {log.parsedTimestamp}
                      </TableCell>
                      <TableCell className="font-medium text-zinc-900 whitespace-nowrap px-3">
                        {log.parsedUser}
                      </TableCell>
                      <TableCell className="px-3">
                        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase text-zinc-700 border border-zinc-200">
                          {log.parsedAction}
                        </span>
                      </TableCell>
                      {log.isParsed ? (
                        <>
                          <TableCell className="text-sm font-medium text-zinc-800 px-3">{log.parsedClient}</TableCell>
                          <TableCell className="text-sm text-zinc-600 px-3">{log.parsedBelt}</TableCell>
                          <TableCell className="text-sm text-zinc-600 font-mono px-3">{log.parsedDim}</TableCell>
                          <TableCell className="text-sm font-bold text-zinc-900 text-right px-3">{log.parsedPrice}</TableCell>
                        </>
                      ) : (
                        <TableCell colSpan={4} className="text-sm text-zinc-600 px-3">
                          {log.rawDetails}
                        </TableCell>
                      )}
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
