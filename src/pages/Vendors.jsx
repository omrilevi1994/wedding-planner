import React, { useState } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Download } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import VendorForm from '../components/vendors/VendorForm';
import { useWedding } from '@/lib/WeddingContext';

export default function Vendors() {
  const queryClient = useQueryClient();
  const { activeWeddingId } = useWedding();
  const [showForm, setShowForm] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  const { data: vendors = [], isLoading } = useQuery({
    queryKey: ['vendors', activeWeddingId],
    queryFn: () => wedflow.entities.Vendor.filter({ wedding_id: activeWeddingId }, '-created_date'),
    enabled: !!activeWeddingId
  });

  const createMutation = useMutation({
    mutationFn: (data) => wedflow.entities.Vendor.create({ ...data, wedding_id: activeWeddingId }),
    onSuccess: async (vendor) => {
      queryClient.invalidateQueries(['vendors']);
      setShowForm(false);
      // Log activity
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'הוספת ספק',
        entity_type: 'Vendor',
        entity_id: vendor.id,
        entity_name: vendor.name,
        description: `הוסף ספק: ${vendor.name} - ${vendor.category}`
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => wedflow.entities.Vendor.update(id, data),
    onSuccess: async (vendor) => {
      queryClient.invalidateQueries(['vendors']);
      setShowForm(false);
      setEditingVendor(null);
      // Log activity
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'עדכון ספק',
        entity_type: 'Vendor',
        entity_id: vendor.id,
        entity_name: vendor.name,
        description: `עדכן ספק: ${vendor.name}`
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => wedflow.entities.Vendor.delete(id),
    onSuccess: async (_, id) => {
      queryClient.invalidateQueries(['vendors']);
      // Log activity
      const user = await wedflow.auth.me();
      const deletedVendor = vendors.find(v => v.id === id);
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'מחיקת ספק',
        entity_type: 'Vendor',
        entity_id: id,
        entity_name: deletedVendor?.name || 'ספק',
        description: `מחק ספק: ${deletedVendor?.name || id}`
      });
    }
  });

  const handleSave = (data) => {
    if (editingVendor) {
      updateMutation.mutate({ id: editingVendor.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (vendor) => {
    setEditingVendor(vendor);
    setShowForm(true);
  };

  const handleDelete = (vendor) => {
    if (window.confirm(`האם למחוק את ${vendor.name}?`)) {
      deleteMutation.mutate(vendor.id);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingVendor(null);
  };

  const uniqueCategories = [...new Set(vendors.map(v => v.category).filter(Boolean))];

  const filteredVendors = vendors.filter(vendor => {
    const matchesSearch = 
      vendor.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vendor.contact_person?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vendor.phone?.includes(searchTerm) ||
      vendor.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || vendor.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const totalEstimatedCost = filteredVendors.reduce((sum, v) => sum + (v.estimated_cost || 0), 0);
  const totalCost = filteredVendors.reduce((sum, v) => sum + (v.total_cost || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">ספקים</h1>
          <p className="text-gray-600">נהל את רשימת הספקים לחתונה</p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700"
        >
          <Plus className="w-4 h-4 ml-2" />
          הוסף ספק
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-white">
          <p className="text-sm text-gray-600 mb-1">סך הוצאות משוערות</p>
          <p className="text-2xl font-bold">₪{totalEstimatedCost.toLocaleString('he-IL')}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-amber-50 to-white">
          <p className="text-sm text-gray-600 mb-1">סך הוצאות כוללות</p>
          <p className="text-2xl font-bold text-amber-600">₪{totalCost.toLocaleString('he-IL')}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <Input
            type="text"
            placeholder="חיפוש לפי שם, איש קשר, טלפון או אימייל..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-full md:w-40">
            <SelectValue placeholder="קטגוריה" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הקטגוריות</SelectItem>
            {uniqueCategories.map(category => (
              <SelectItem key={category} value={category}>{category}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>שם ספק</TableHead>
                <TableHead>קטגוריה</TableHead>
                <TableHead>איש קשר</TableHead>
                <TableHead>טלפון</TableHead>
                <TableHead>אימייל</TableHead>
                <TableHead>עלות משוערת</TableHead>
                <TableHead>עלות כוללת</TableHead>
                <TableHead>קובץ חוזה</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-gray-400">
                    טוען...
                  </TableCell>
                </TableRow>
              ) : filteredVendors.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-gray-400">
                    אין עדיין ספקים. הוסף את הספק הראשון!
                  </TableCell>
                </TableRow>
              ) : (
                filteredVendors.map((vendor) => (
                  <TableRow key={vendor.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">{vendor.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-blue-50 border-blue-200">
                        {vendor.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{vendor.contact_person || '-'}</TableCell>
                    <TableCell className="text-sm" dir="ltr">{vendor.phone || '-'}</TableCell>
                    <TableCell className="text-sm text-gray-600" dir="ltr">{vendor.email || '-'}</TableCell>
                    <TableCell className="font-semibold">
                      {vendor.estimated_cost ? `₪${vendor.estimated_cost.toLocaleString('he-IL')}` : '-'}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {vendor.total_cost ? `₪${vendor.total_cost.toLocaleString('he-IL')}` : '-'}
                    </TableCell>
                    <TableCell>
                      {vendor.contract_file_url ? (
                        <a
                          href={vendor.contract_file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          <Download className="w-4 h-4" />
                          הורד
                        </a>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(vendor)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <Pencil className="w-4 h-4 text-gray-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(vendor)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <VendorForm
        open={showForm}
        onClose={handleCloseForm}
        vendor={editingVendor}
        onSave={handleSave}
      />
    </div>
  );
}