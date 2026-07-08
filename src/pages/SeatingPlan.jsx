import React, { useState } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, RefreshCw, Download, X } from 'lucide-react';
import HallVisualization from '../components/seating/HallVisualization';
import TablePanel from '../components/seating/TablePanel';
import { useWedding } from '@/lib/WeddingContext';

const isGuestTable = (t) => !t.element_type || t.element_type === 'table';

export default function SeatingPlan() {
  const queryClient = useQueryClient();
  const { activeWeddingId } = useWedding();
  const [showNewTableDialog, setShowNewTableDialog] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableCapacity, setNewTableCapacity] = useState('12');
  const [newTableIplanNumber, setNewTableIplanNumber] = useState('');
  const [editingTable, setEditingTable] = useState(null);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedExportTables, setSelectedExportTables] = useState([]);

  const { data: tables = [] } = useQuery({
    queryKey: ['tables', activeWeddingId],
    queryFn: () => wedflow.entities.Table.filter({ wedding_id: activeWeddingId }, '-created_date'),
    enabled: !!activeWeddingId
  });

  const { data: guests = [] } = useQuery({
    queryKey: ['guests', activeWeddingId],
    queryFn: () => wedflow.entities.Guest.filter({ wedding_id: activeWeddingId }, '-created_date'),
    enabled: !!activeWeddingId
  });

  const createTableMutation = useMutation({
    mutationFn: (data) => wedflow.entities.Table.create({ ...data, wedding_id: activeWeddingId }),
    onSuccess: () => {
      queryClient.invalidateQueries(['tables']);
      setShowNewTableDialog(false);
      setNewTableName('');
      setNewTableCapacity('12');
    }
  });

  const updateGuestMutation = useMutation({
    mutationFn: ({ id, data }) => wedflow.entities.Guest.update(id, data),
    onSuccess: async (guest, { id, data }) => {
      queryClient.invalidateQueries(['guests']);
      const user = await wedflow.auth.me();
      const table = tables.find(t => t.id === data.table_id);
      if (data.table_id) {
        await wedflow.entities.ActivityLog.create({
          wedding_id: activeWeddingId,
          user_email: user.email, user_name: user.full_name,
          action_type: 'שיבוץ מוזמן לשולחן', entity_type: 'Guest', entity_id: id,
          entity_name: `${guest.first_name} ${guest.last_name}`,
          description: `שיבץ את ${guest.first_name} ${guest.last_name} לשולחן ${table?.name || data.table_id}`
        });
      } else {
        await wedflow.entities.ActivityLog.create({
          wedding_id: activeWeddingId,
          user_email: user.email, user_name: user.full_name,
          action_type: 'הסרת מוזמן משולחן', entity_type: 'Guest', entity_id: id,
          entity_name: `${guest.first_name} ${guest.last_name}`,
          description: `הסיר את ${guest.first_name} ${guest.last_name} משולחן`
        });
      }
    }
  });

  const updateTableMutation = useMutation({
    mutationFn: ({ id, data }) => wedflow.entities.Table.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['tables']);
      setEditingTable(null);
      setShowNewTableDialog(false);
    }
  });

  const deleteTableMutation = useMutation({
    mutationFn: (id) => wedflow.entities.Table.delete(id),
    onSuccess: async (_, id) => {
      queryClient.invalidateQueries(['tables']);
      const user = await wedflow.auth.me();
      const deletedTable = tables.find(t => t.id === id);
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email, user_name: user.full_name,
        action_type: 'מחיקת שולחן', entity_type: 'Table', entity_id: id,
        entity_name: deletedTable?.name || 'שולחן',
        description: `מחק שולחן: ${deletedTable?.name || id}`
      });
    }
  });

  const handleAddGuestToTable = (guestId, tableId) => {
    const guest = guests.find(g => g.id === guestId);
    if (guest) updateGuestMutation.mutate({ id: guestId, data: { ...guest, table_id: tableId } });
  };

  const handleRemoveGuestFromTable = (guestId) => {
    const guest = guests.find(g => g.id === guestId);
    if (guest) updateGuestMutation.mutate({ id: guestId, data: { ...guest, table_id: null } });
  };

  const handleDeleteTable = (tableId) => {
    const table = tables.find(t => t.id === tableId);
    const confirmMsg = table && !isGuestTable(table)
      ? `האם להסיר את ה${table.element_type === 'stage' ? 'במה' : 'בר'}?`
      : 'האם למחוק את השולחן? המוזמנים שישבו בו לא יימחקו.';
    if (window.confirm(confirmMsg)) {
      guests.forEach(guest => {
        if (guest.table_id === tableId)
          updateGuestMutation.mutate({ id: guest.id, data: { ...guest, table_id: null } });
      });
      deleteTableMutation.mutate(tableId);
      if (selectedTableId === tableId) setSelectedTableId(null);
    }
  };

  const handleDeleteAllTables = async () => {
    const guestTables = tables.filter(isGuestTable);
    const assignedGuests = guests.filter(g => g.table_id);
    await Promise.all(assignedGuests.map(g => wedflow.entities.Guest.update(g.id, { ...g, table_id: null })));
    await Promise.all(guestTables.map(t => wedflow.entities.Table.delete(t.id)));
    queryClient.invalidateQueries(['tables']);
    queryClient.invalidateQueries(['guests']);
    setSelectedTableId(null);
    setShowDeleteAllConfirm(false);
  };

  const handleAddVenueElement = (elementType) => {
    const name = elementType === 'stage' ? 'במה' : 'בר';
    const defaultPos = elementType === 'stage' ? { location_x: 50, location_y: 8 } : { location_x: 50, location_y: 50 };
    wedflow.entities.Table.create({
      wedding_id: activeWeddingId,
      name,
      capacity: 0,
      element_type: elementType,
      ...defaultPos,
    }).then(() => queryClient.invalidateQueries(['tables']));
  };

  const handleRenameElement = (table, name) => {
    if (!name || name === table.name) return;
    updateTableMutation.mutate({ id: table.id, data: { name } });
  };

  const handleResetAndCreate = async () => {
    setIsResetting(true);
    await wedflow.functions.invoke('resetSeatingPlan', { wedding_id: activeWeddingId });
    queryClient.invalidateQueries(['tables']);
    queryClient.invalidateQueries(['guests']);
    setSelectedTableId(null);
    setIsResetting(false);
    setShowResetConfirm(false);
  };

  const handleEditTable = (table) => {
    setEditingTable(table);
    setNewTableName(table.name);
    setNewTableCapacity(table.capacity.toString());
    setNewTableIplanNumber(table.iplan_number || '');
    setShowNewTableDialog(true);
  };

  const handleSaveTable = () => {
    if (!newTableName || !newTableCapacity) return;
    if (editingTable) {
      updateTableMutation.mutate({ id: editingTable.id, data: { name: newTableName, capacity: parseInt(newTableCapacity), iplan_number: newTableIplanNumber || null } });
    } else {
      createTableMutation.mutate({ name: newTableName, capacity: parseInt(newTableCapacity), iplan_number: newTableIplanNumber || null });
    }
  };

  const selectedTable = tables.find(t => t.id === selectedTableId);

  const toggleExportTable = (iplanNumber) => {
    setSelectedExportTables(prev =>
      prev.includes(iplanNumber) ? prev.filter(n => n !== iplanNumber) : [...prev, iplanNumber]
    );
  };

  const exportTablesCsv = (iplanNumbers) => {
    const targetTables = tables
      .filter(t => iplanNumbers.includes(String(t.iplan_number || t.name)))
      .sort((a, b) => Number(a.iplan_number) - Number(b.iplan_number));

    // Build grid: 2 tables per row, each table is a column
    // Find max guests across all tables to know how many rows per block
    const tableData = targetTables.map(table => {
      const tableGuests = guests.filter(g => g.table_id === table.id);
      const guestNames = tableGuests.map(g => {
        const count = g.confirmed_people != null ? g.confirmed_people : 0;
        return `${g.first_name} ${g.last_name}`.trim() + ` (${count})`;
      });
      const label = table.iplan_number ? `שולחן ${table.iplan_number} - ${table.name}` : table.name;
      return { label, guestNames };
    });

    const rows = [];
    // Process tables in pairs
    for (let i = 0; i < tableData.length; i += 2) {
      const left = tableData[i];
      const right = tableData[i + 1];
      const maxRows = Math.max(left.guestNames.length, right ? right.guestNames.length : 0);

      // Empty separator row between blocks
      if (i > 0) rows.push(['', '', '']);

      // Header row
      rows.push([left.label, '', right ? right.label : '']);

      // Guest rows
      for (let j = 0; j < maxRows; j++) {
        rows.push([left.guestNames[j] || '', '', right ? (right.guestNames[j] || '') : '']);
      }
    }

    const csvContent = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `שולחנות_נבחרים.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const guestTables = tables.filter(isGuestTable);
  const seatedCount = guests.reduce((sum, g) => {
    if (g.table_id) return sum + (g.confirmed_people != null ? g.confirmed_people : (g.total_people || 1));
    return sum;
  }, 0);
  const totalCapacity = guestTables.reduce((sum, t) => sum + t.capacity, 0);
  const overflowTables = guestTables.filter(t => {
    const c = guests.filter(g => g.table_id === t.id).reduce((s, g) => s + (g.confirmed_people != null ? g.confirmed_people : (g.total_people || 1)), 0);
    return c > t.capacity;
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-1">סידור ישיבה</h1>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>מושבים: <strong>{seatedCount}</strong> / <strong>{totalCapacity}</strong></span>
            {overflowTables > 0 && <span className="text-destructive font-semibold">⚠️ {overflowTables} שולחנות בעומס</span>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <Button variant="outline" onClick={() => handleAddVenueElement('stage')} className="border-rose-deep/30 text-rose-deep hover:bg-rose/15 text-sm">
            <Plus className="w-4 h-4 ml-1" />
            הוסף במה
          </Button>
          <Button variant="outline" onClick={() => handleAddVenueElement('bar')} className="border-taupe/30 text-taupe hover:bg-taupe/15 text-sm">
            <Plus className="w-4 h-4 ml-1" />
            הוסף בר
          </Button>
          <Button variant="outline" onClick={() => { setSelectedExportTables([]); setShowExportDialog(true); }} className="border-sage/30 text-sage-deep hover:bg-sage/15 text-sm">
            <Download className="w-4 h-4 ml-1" />
            ייצא שולחנות לCSV
          </Button>
          <Button variant="outline" onClick={() => setShowResetConfirm(true)} className="border-taupe/30 text-taupe hover:bg-taupe/15 text-sm">
            <RefreshCw className="w-4 h-4 ml-1" />
            אפס וצור שולחנות 1-25
          </Button>
          {guestTables.length > 0 && (
            <Button variant="outline" onClick={() => setShowDeleteAllConfirm(true)} className="border-destructive/30 text-destructive hover:bg-destructive/10 text-sm">
              <Trash2 className="w-4 h-4 ml-1" />
              מחק הכל
            </Button>
          )}
          <Button onClick={() => { setEditingTable(null); setNewTableName(''); setNewTableCapacity('12'); setShowNewTableDialog(true); }}
            className="bg-gradient-to-l from-rose to-rose-deep hover:from-rose-deep hover:to-rose-deep">
            <Plus className="w-4 h-4 ml-1" />
            שולחן חדש
          </Button>
        </div>
      </div>

      <div className="flex gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-rose-deep" /> פנוי</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-sage-deep" /> מלא</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full bg-destructive" /> עומס יתר</div>
        <span className="mr-2 text-rose-deep font-medium">גררו כדי לסדר, לחצו לבחירה</span>
      </div>

      <div className="flex gap-4">
        <div className={selectedTable ? 'flex-1' : 'w-full'}>
          {tables.length === 0 ? (
            <div className="text-center py-20 bg-muted rounded-xl">
              <p className="text-muted-foreground mb-2 text-lg">עדיין אין שולחנות</p>
              <p className="text-muted-foreground text-sm">ייבא מ-iPlan או הוסף ידנית</p>
            </div>
          ) : (
            <HallVisualization
              tables={tables}
              guests={guests}
              selectedTableId={selectedTableId}
              onSelectTable={setSelectedTableId}
            />
          )}
        </div>

        {selectedTable && isGuestTable(selectedTable) && (
          <div className="w-80 shrink-0" style={{ minHeight: 400 }}>
            <TablePanel
              table={selectedTable}
              guests={guests}
              allGuests={guests}
              onClose={() => setSelectedTableId(null)}
              onAddGuest={handleAddGuestToTable}
              onRemoveGuest={handleRemoveGuestFromTable}
              onDeleteTable={handleDeleteTable}
              onEditTable={handleEditTable}
            />
          </div>
        )}

        {selectedTable && !isGuestTable(selectedTable) && (
          <div className="w-80 shrink-0 bg-card rounded-xl shadow-xl border border-border p-4 space-y-4" dir="rtl" style={{ minHeight: 160 }}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">
                {selectedTable.element_type === 'stage' ? '🎤 במה' : '🍸 בר'}
              </h3>
              <button onClick={() => setSelectedTableId(null)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-2">
              <Label>שם</Label>
              <Input
                defaultValue={selectedTable.name}
                key={selectedTable.id}
                onBlur={(e) => handleRenameElement(selectedTable, e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">ניתן לגרור את האלמנט על מפת האולם כדי למקם אותו מחדש.</p>
            <Button
              variant="outline"
              onClick={() => handleDeleteTable(selectedTable.id)}
              className="w-full border-destructive/30 text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4 ml-1" />
              הסר
            </Button>
          </div>
        )}
      </div>

      <Dialog open={showNewTableDialog} onOpenChange={(open) => {
        setShowNewTableDialog(open);
        if (!open) { setEditingTable(null); setNewTableName(''); setNewTableCapacity('12'); setNewTableIplanNumber(''); }
      }}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingTable ? 'ערוך שולחן' : 'הוסף שולחן חדש'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>שם השולחן</Label>
              <Input value={newTableName} onChange={(e) => setNewTableName(e.target.value)} placeholder='למשל: "שולחן 1"' />
            </div>
            <div className="space-y-2">
              <Label>מספר שולחן (iPlan)</Label>
              <Input type="number" value={newTableIplanNumber} onChange={(e) => setNewTableIplanNumber(e.target.value)} placeholder='למשל: 26' min="1" />
            </div>
            <div className="space-y-2">
              <Label>קיבולת</Label>
              <div className="flex gap-2">
                <Button type="button" variant={newTableCapacity === '12' ? 'default' : 'outline'} size="sm" onClick={() => setNewTableCapacity('12')}>12 (רגיל)</Button>
                <Button type="button" variant={newTableCapacity === '24' ? 'default' : 'outline'} size="sm" onClick={() => setNewTableCapacity('24')}>24 (אבירים)</Button>
                <Input type="number" value={newTableCapacity} onChange={(e) => setNewTableCapacity(e.target.value)} placeholder="מספר" min="1" className="w-24" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTableDialog(false)}>ביטול</Button>
            <Button onClick={handleSaveTable} className="bg-primary hover:bg-primary-hover">
              {editingTable ? 'שמור' : 'הוסף'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>אפס ויצור שולחנות 1-25</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">פעולה זו תמחק את כל השולחנות הקיימים, תנקה שיבוץ שולחן מכל המוזמנים, ותיצור שולחנות 1-25 מחדש (שולחן 13 ו-16 עם 24 מקומות, השאר 12).</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetConfirm(false)} disabled={isResetting}>ביטול</Button>
            <Button onClick={handleResetAndCreate} className="bg-taupe hover:bg-taupe/90" disabled={isResetting}>
              {isResetting ? 'מעבד...' : 'אפס ויצור'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>ייצוא שולחנות ל-CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <button onClick={() => setSelectedExportTables(guestTables.map(t => String(t.iplan_number || t.name)))} className="text-taupe hover:underline">בחר הכל</button>
              <button onClick={() => setSelectedExportTables([])} className="text-muted-foreground hover:underline">נקה הכל</button>
            </div>
            {[...guestTables]
              .sort((a, b) => Number(a.iplan_number) - Number(b.iplan_number))
              .map(table => {
                const key = String(table.iplan_number || table.name);
                const isChecked = selectedExportTables.includes(key);
                const count = guests
                  .filter(g => g.table_id === table.id)
                  .reduce((sum, g) => sum + (g.confirmed_people != null ? g.confirmed_people : (g.total_people || 1)), 0);
                return (
                  <div key={table.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer" onClick={() => toggleExportTable(key)}>
                    <Checkbox checked={isChecked} onCheckedChange={() => toggleExportTable(key)} onClick={e => e.stopPropagation()} />
                    <div className="flex-1">
                      <span className="font-medium text-sm">{table.iplan_number ? `${table.iplan_number}. ` : ''}{table.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{count} מגיעים</span>
                  </div>
                );
              })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>ביטול</Button>
            <Button
              disabled={selectedExportTables.length === 0}
              onClick={() => { exportTablesCsv(selectedExportTables); setShowExportDialog(false); }}
              className="bg-sage-deep hover:bg-sage-deep/90"
            >
              <Download className="w-4 h-4 ml-1" />
              ייצא ({selectedExportTables.length} שולחנות)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteAllConfirm} onOpenChange={setShowDeleteAllConfirm}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>מחיקת כל השולחנות</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">האם אתה בטוח? כל השולחנות יימחקו והמוזמנים ישוחררו.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteAllConfirm(false)}>ביטול</Button>
            <Button onClick={handleDeleteAllTables} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">מחק הכל</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}