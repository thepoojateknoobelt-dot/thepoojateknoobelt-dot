import React, { useState } from 'react';
import { Client, Config, ProfitRange } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button, buttonVariants } from './ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { toast } from 'sonner';
import { UserPlus, Trash2, Upload, Download, Search, Edit2, Save, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

interface ClientRegistryProps {
  clients: Client[];
  config: Config;
  onRefresh?: () => void;
}

export const ClientRegistry: React.FC<ClientRegistryProps> = ({ clients, config, onRefresh }) => {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ name: '', company: '', city: '', mobile: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMargins, setEditMargins] = useState<Record<string, ProfitRange[]>>({});
  const [editName, setEditName] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editMobile, setEditMobile] = useState('');

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    try {
      const defaultRanges: ProfitRange[] = [{ minLength: 0, maxLength: null, margin: 20 }];
      
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          company: formData.company,
          city: formData.city,
          mobile: formData.mobile,
          profitMargins: (Array.isArray(config?.beltTypes) ? config.beltTypes : []).reduce((acc, type) => ({
            ...acc,
            [type.name]: defaultRanges
          }), {} as Record<string, ProfitRange[]>),
        })
      });

      if (!res.ok) throw new Error('Add failed');

      toast.success('Client added');
      setFormData({ name: '', company: '', city: '', mobile: '' });
      onRefresh?.();
    } catch (err) {
      toast.error('Failed to add client');
    } finally {
      setIsAdding(false);
    }
  };

  const handleUpdateClient = async (clientId: string) => {
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          company: editCompany,
          city: editCity,
          mobile: editMobile,
          profitMargins: editMargins
        })
      });

      if (!res.ok) throw new Error('Update failed');

      toast.success('Client updated successfully');
      setEditingId(null);
      onRefresh?.();
    } catch (err) {
      toast.error('Failed to update client');
    }
  };

  const handleDeleteClient = async (clientId: string, name: string) => {
    if (!confirm(`Delete client ${name}?`)) return;
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Delete failed');

      toast.success('Client deleted');
      onRefresh?.();
    } catch (err) {
      toast.error('Failed to delete client');
    }
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      
      let count = 0;
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        if (values.length < 3) continue;
        
        try {
          await fetch('/api/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: values[0].trim(),
              company: values[1].trim(),
              city: values[2].trim(),
              profitMargins: (Array.isArray(config?.beltTypes) ? config.beltTypes : []).reduce((acc, type) => ({
                ...acc,
                [type.name]: [{ minLength: 0, maxLength: null, margin: parseFloat(values[3]) || 20 }]
              }), {} as Record<string, ProfitRange[]>),
            })
          });
          count++;
        } catch (err) {
          console.error('Failed to upload client line', values, err);
        }
      }
      toast.success(`Successfully uploaded ${count} clients`);
      onRefresh?.();
    };
    reader.readAsText(file);
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.company.toLowerCase().includes(search.toLowerCase()) ||
    c.city.toLowerCase().includes(search.toLowerCase()) ||
    (c.mobile || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-zinc-900 rounded-lg text-white">
            <UserPlus className="h-4 w-4" />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">Client Registry</h1>
        </div>
        <div className="flex gap-2">
          <label className={cn(buttonVariants({ variant: "outline" }), "gap-1.5 cursor-pointer h-8 text-xs px-3 flex items-center shadow-sm")}>
            <Upload className="h-3.5 w-3.5" />
            Bulk Upload
            <input type="file" accept=".csv" className="hidden" onChange={handleBulkUpload} />
          </label>
          <Button variant="outline" className="gap-1.5 h-8 text-xs px-3 shadow-sm" onClick={() => {
            const csv = "Name,Company,City,DefaultProfit\nJohn Doe,ABC Industries,Mumbai,25\nJane Smith,XYZ Corp,Delhi,18";
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'clients_template.csv';
            a.click();
          }}>
            <Download className="h-3.5 w-3.5" />
            Template
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1 border-zinc-200 shadow-sm h-fit">
          <CardHeader>
            <CardTitle>Add Client</CardTitle>
          </CardHeader>
          <form onSubmit={handleAddClient}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Client Name <span className="text-rose-500">*</span></Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Company Name <span className="text-rose-500">*</span></Label>
                <Input value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} required />
              </div>
              <div className="space-y-2">
                <Label>Mobile Number</Label>
                <Input value={formData.mobile} onChange={(e) => setFormData({ ...formData, mobile: e.target.value })} placeholder="e.g. 9876543210" />
              </div>
              <div className="space-y-2">
                <Label>City <span className="text-rose-500">*</span></Label>
                <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} required />
              </div>
              <p className="text-xs text-zinc-500 italic">Default profit ranges will be set to 20%. You can customize them after adding.</p>
              <Button type="submit" className="w-full" disabled={isAdding}>
                <UserPlus className="h-4 w-4 mr-2" />
                {isAdding ? 'Adding...' : 'Add Client'}
              </Button>
            </CardContent>
          </form>
        </Card>

        <Card className="lg:col-span-3 border-zinc-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Client List</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input 
                  placeholder="Search clients..." 
                  className="pl-10" 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Mobile Number</TableHead>
                  <TableHead>Profit Margins</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {editingId === c.id ? (
                        <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8 text-xs" />
                      ) : (
                        c.name
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === c.id ? (
                        <Input value={editCompany} onChange={(e) => setEditCompany(e.target.value)} className="h-8 text-xs" />
                      ) : (
                        c.company
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === c.id ? (
                        <Input value={editCity} onChange={(e) => setEditCity(e.target.value)} className="h-8 text-xs" />
                      ) : (
                        c.city
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === c.id ? (
                        <Input value={editMobile} onChange={(e) => setEditMobile(e.target.value)} className="h-8 text-xs font-mono" />
                      ) : (
                        c.mobile || '-'
                      )}
                    </TableCell>
                    <TableCell>
                      {editingId === c.id ? (
                        <div className="space-y-4 max-w-2xl bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                          {(Array.isArray(config?.beltTypes) ? config.beltTypes : [])?.map?.(type => (
                            <div key={type.id} className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold uppercase tracking-wider text-zinc-600">{type.name} Margins</span>
                                <Button 
                                  size="sm" 
                                  variant="ghost" 
                                  className="h-6 text-[10px]"
                                  onClick={() => {
                                    const current = Array.isArray(editMargins[type.name]) ? editMargins[type.name] : [];
                                    const lastMax = current.length > 0 ? current[current.length-1].maxLength : 0;
                                    setEditMargins({
                                      ...editMargins,
                                      [type.name]: [...current, { minLength: lastMax || 0, maxLength: null, margin: 20 }]
                                    });
                                  }}
                                >
                                  + Range
                                </Button>
                              </div>
                              <div className="space-y-1">
                                {(Array.isArray(editMargins[type.name]) ? editMargins[type.name] : []).map((range, idx) => (
                                  <div key={idx} className="flex items-center gap-2 bg-white p-2 rounded-lg border border-zinc-100 shadow-sm">
                                    <div className="flex-1 flex items-center gap-2">
                                      <Input 
                                        type="number" 
                                        className="h-7 text-xs w-16" 
                                        value={range.minLength} 
                                        onChange={(e) => {
                                          const newRanges = [...editMargins[type.name]];
                                          newRanges[idx].minLength = parseFloat(e.target.value);
                                          setEditMargins({...editMargins, [type.name]: newRanges});
                                        }}
                                      />
                                      <span className="text-[10px] text-zinc-400">to</span>
                                      <Input 
                                        type="number" 
                                        className="h-7 text-xs w-16" 
                                        value={range.maxLength || ''} 
                                        placeholder="∞"
                                        onChange={(e) => {
                                          const newRanges = [...editMargins[type.name]];
                                          newRanges[idx].maxLength = e.target.value ? parseFloat(e.target.value) : null;
                                          setEditMargins({...editMargins, [type.name]: newRanges});
                                        }}
                                      />
                                      <span className="text-[10px] text-zinc-400">mtr</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Input 
                                        type="number" 
                                        className="h-7 text-xs w-14 font-bold text-emerald-700" 
                                        value={range.margin} 
                                        onChange={(e) => {
                                          const newRanges = [...editMargins[type.name]];
                                          newRanges[idx].margin = parseFloat(e.target.value);
                                          setEditMargins({...editMargins, [type.name]: newRanges});
                                        }}
                                      />
                                      <span className="text-[10px] text-zinc-400">%</span>
                                    </div>
                                    <Button 
                                      size="icon" 
                                      variant="ghost" 
                                      className="h-6 w-6 text-zinc-300 hover:text-red-500"
                                      onClick={() => {
                                        const newRanges = [...editMargins[type.name]];
                                        newRanges.splice(idx, 1);
                                        setEditMargins({...editMargins, [type.name]: newRanges});
                                      }}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                          <div className="flex justify-end gap-2 pt-2 border-t">
                            <Button size="sm" variant="ghost" className="h-8 text-zinc-500" onClick={() => setEditingId(null)}>Cancel</Button>
                            <Button size="sm" className="h-8 gap-1" onClick={() => handleUpdateClient(c.id)}>
                              <Save className="h-4 w-4" /> Save Changes
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                           {(Array.isArray(config?.beltTypes) ? config.beltTypes : [])?.map?.(type => (
                             <div key={type.id} className="flex flex-col gap-1">
                               <span className="text-[10px] font-bold text-zinc-400 uppercase">{type.name}</span>
                               <div className="flex flex-wrap gap-1">
                                 {(Array.isArray(c.profitMargins?.[type.name]) ? c.profitMargins[type.name] : []).map((r, i) => (
                                   <span key={i} className="bg-zinc-100 text-[10px] px-2 py-0.5 rounded-full border border-zinc-200">
                                     {r.minLength}-{r.maxLength || '∞'}m: <span className="font-bold text-emerald-700">{r.margin}%</span>
                                   </span>
                                 ))}
                               </div>
                             </div>
                           ))}
                           <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-7 w-fit text-[10px] gap-1 text-zinc-500 hover:text-zinc-900"
                            onClick={() => {
                              setEditingId(c.id);
                              setEditMargins(c.profitMargins || {});
                              setEditName(c.name || '');
                              setEditCompany(c.company || '');
                              setEditCity(c.city || '');
                              setEditMobile(c.mobile || '');
                            }}
                           >
                            <Edit2 className="h-3 w-3" /> Edit Details
                           </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-red-600" onClick={() => handleDeleteClient(c.id, c.name)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
