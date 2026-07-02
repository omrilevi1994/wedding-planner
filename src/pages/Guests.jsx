import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Pencil, Trash2, Download, Upload, Check, LayoutGrid, RefreshCw, ArrowRight, ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import GuestForm from '../components/guests/GuestForm';
import IplanImportDialog from '../components/guests/IplanImportDialog';
import SyncWizard from '../components/guests/SyncWizard';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWedding } from '@/lib/WeddingContext';

// Normalize phone - strip ALL non-digits then fix prefix
function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/\D/g, '');
  if (p.startsWith('972')) p = '0' + p.slice(3);
  return p;
}

// Map wiwi status → our status (only confirmed ones)
function mapWiwiStatus(wiwiStatus) {
  if (!wiwiStatus) return null;
  const s = wiwiStatus.trim();
  if (s === 'מגיעים') return 'אישר';
  if (s === 'לא מגיעים') return 'לא מגיע';
  return null; // אין מענה, מתלבטים, etc. → skip
}

export default function Guests() {
  const queryClient = useQueryClient();
  const { activeWeddingId, isAdmin } = useWedding();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSide, setFilterSide] = useState('all');
  const [filterRelationship, setFilterRelationship] = useState('all');
  const [filterSeated, setFilterSeated] = useState('all');
  const [selectedGuestIds, setSelectedGuestIds] = useState(new Set());
  const [showCreateTableDialog, setShowCreateTableDialog] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [isCreatingTable, setIsCreatingTable] = useState(false);
  const [showIplanImport, setShowIplanImport] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingGuest, setEditingGuest] = useState(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [editingConfirmed, setEditingConfirmed] = useState(null); // { guestId, value }
  const [wiwiPreview, setWiwiPreview] = useState(null); // list of {guest, newStatus, oldStatus}
  const [wiwiUnmatched, setWiwiUnmatched] = useState([]); // wiwi rows with no match in app
  const [unmatchedLinks, setUnmatchedLinks] = useState({}); // wiwiPhone → guestId
  const [showWiwiDialog, setShowWiwiDialog] = useState(false);
  const [showSyncWizard, setShowSyncWizard] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  React.useEffect(() => {
    base44.auth.me().then(user => {
      setCurrentUser(user);
      setIsCheckingAuth(false);
    }).catch(() => {
      setCurrentUser(null);
      setIsCheckingAuth(false);
    });
  }, []);

  const { data: guests = [], isLoading } = useQuery({
    queryKey: ['guests', activeWeddingId],
    queryFn: () => base44.entities.Guest.filter({ wedding_id: activeWeddingId }, '-created_date'),
    enabled: !!activeWeddingId
  });

  // Filter guests based on user's wedding_sides
  const visibleGuests = React.useMemo(() => {
    if (!currentUser?.wedding_sides || currentUser.wedding_sides.length === 0) return guests;
    
    // Show only guests with sides that match user's exact permissions
    return guests.filter(g => currentUser.wedding_sides.includes(g.side));
  }, [guests, currentUser]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Guest.create({ ...data, wedding_id: activeWeddingId }),
    onSuccess: async (guest) => {
      queryClient.invalidateQueries(['guests']);
      setShowForm(false);
      // Log activity
      const user = await base44.auth.me();
      await base44.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'הוספת מוזמן',
        entity_type: 'Guest',
        entity_id: guest.id,
        entity_name: `${guest.first_name} ${guest.last_name}`,
        description: `הוסף מוזמן חדש: ${guest.first_name} ${guest.last_name}`
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Guest.update(id, data),
    onSuccess: async (guest) => {
      queryClient.invalidateQueries(['guests']);
      setShowForm(false);
      setEditingGuest(null);
      // Log activity
      const user = await base44.auth.me();
      await base44.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'עדכון מוזמן',
        entity_type: 'Guest',
        entity_id: guest.id,
        entity_name: `${guest.first_name} ${guest.last_name}`,
        description: `עדכן מוזמן: ${guest.first_name} ${guest.last_name}`
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Guest.delete(id),
    onSuccess: async (_, id) => {
      queryClient.invalidateQueries(['guests']);
      // Log activity
      const user = await base44.auth.me();
      const deletedGuest = guests.find(g => g.id === id);
      await base44.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'מחיקת מוזמן',
        entity_type: 'Guest',
        entity_id: id,
        entity_name: deletedGuest ? `${deletedGuest.first_name} ${deletedGuest.last_name}` : 'מוזמן',
        description: `מחק מוזמן: ${deletedGuest ? `${deletedGuest.first_name} ${deletedGuest.last_name}` : id}`
      });
    }
  });

  if (isCheckingAuth) {
    return null;
  }

  const handleSave = (data) => {
    if (editingGuest) {
      updateMutation.mutate({ id: editingGuest.id, data });
    } else {
      // Check quota before creating
      const newTotalPeople = myTotalPeople + (data.total_people || 1);
      if (hasQuota && newTotalPeople > currentUser.max_guests) {
        alert(`חרגת ממכסת המוזמנים שלך (${currentUser.max_guests} אנשים)`);
        return;
      }
      createMutation.mutate(data);
    }
  };

  const handleEdit = (guest) => {
    // Restrict editing to creator only if user has wedding_sides
    if (currentUser?.wedding_sides && currentUser.wedding_sides.length > 0 && guest.created_by !== currentUser.email) {
      alert('אתה יכול לערוך רק מוזמנים שהוספת בעצמך');
      return;
    }
    setEditingGuest(guest);
    setShowForm(true);
  };

  const handleDelete = (guest) => {
    // Restrict deletion to creator only if user has wedding_sides
    if (currentUser?.wedding_sides && currentUser.wedding_sides.length > 0 && guest.created_by !== currentUser.email) {
      alert('אתה יכול למחוק רק מוזמנים שהוספת בעצמך');
      return;
    }
    if (window.confirm(`האם למחוק את ${guest.first_name} ${guest.last_name}?`)) {
      deleteMutation.mutate(guest.id);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingGuest(null);
  };

  const toggleSelectGuest = (id) => {
    setSelectedGuestIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedGuestIds.size === filteredGuests.length) {
      setSelectedGuestIds(new Set());
    } else {
      setSelectedGuestIds(new Set(filteredGuests.map(g => g.id)));
    }
  };

  const handleCreateTableFromSelected = async () => {
    if (!newTableName.trim()) return;
    setIsCreatingTable(true);
    const selectedGuests = filteredGuests.filter(g => selectedGuestIds.has(g.id));
    const totalPeople = selectedGuests.reduce((sum, g) => sum + (g.total_people || 1), 0);
    // Create the table
    const table = await base44.entities.Table.create({
      wedding_id: activeWeddingId,
      name: newTableName.trim(),
      capacity: totalPeople
    });
    // Assign guests to table
    await Promise.all(selectedGuests.map(g =>
      base44.entities.Guest.update(g.id, { ...g, table_id: table.id })
    ));
    queryClient.invalidateQueries(['guests']);
    setIsCreatingTable(false);
    setShowCreateTableDialog(false);
    setNewTableName('');
    setSelectedGuestIds(new Set());
  };

  const handleWiwiUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUpdatingStatus(true);
    try {
      // Parse Excel directly - no LLM
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      // Find header row
      let headerRowIdx = 0;
      for (let i = 0; i < Math.min(raw.length, 10); i++) {
        const row = raw[i];
        if (row.some(cell => String(cell).includes('שם') || String(cell).includes('טלפון'))) {
          headerRowIdx = i;
          break;
        }
      }

      const headers = raw[headerRowIdx].map(h => String(h).trim());
            const colName = headers.findIndex(h => h.includes('שם'));
      const colPhone = headers.findIndex(h => h.includes('טלפון') || h.includes('נייד') || h.includes('סלולרי'));
      // Status column: prefer exact "סטטוס" or "תשובה", then fallback
      const colStatus = headers.findIndex(h => h === 'סטטוס' || h === 'תשובה' || h.includes('סטטוס') || h.includes('תשובה'));
      // Invited: total people invited
      const colInvited = headers.findIndex(h => h.includes('הוזמן') || h === 'מוזמנים' || h.includes('מוזמן') || h.includes('הזמנ'));
      // Coming: actual confirmed people — must NOT be the same column as status
      const colComing = headers.findIndex((h, i) => i !== colStatus && (h === 'מגיעים' || h === 'מגיע' || (h.includes('מגיע') && !h.includes('לא'))));
      
      // Build phone → wiwi row map
      const wiwiMap = {};
      for (let i = headerRowIdx + 1; i < raw.length; i++) {
        const row = raw[i];
        const phone = normalizePhone(String(row[colPhone] ?? ''));
        if (!phone) continue;
        const name = colName >= 0 ? String(row[colName] ?? '').trim() : '';
        const status = colStatus >= 0 ? String(row[colStatus] ?? '').trim() : '';
        const rawInvited = colInvited >= 0 ? row[colInvited] : undefined;
        const rawComing = colComing >= 0 ? row[colComing] : undefined;
        const confirmed_people = rawComing !== undefined && rawComing !== '' ? Number(rawComing) : undefined;
        const total_people = rawInvited !== undefined && rawInvited !== '' ? Number(rawInvited) : undefined;
        wiwiMap[phone] = { name, status, confirmed_people, total_people };
      }

      // Match against existing guests
            const changes = [];
      for (const guest of guests) {
        const normPhone = normalizePhone(guest.phone);
        const wiwiRow = wiwiMap[normPhone];
        if (!wiwiRow) continue;

        const newStatus = mapWiwiStatus(wiwiRow.status); // null if non-actionable
        const newConfirmed = wiwiRow.confirmed_people;
        const newTotal = wiwiRow.total_people;

        const statusChanged = newStatus && guest.status !== newStatus;
        const confirmedChanged = newConfirmed !== undefined && guest.confirmed_people !== newConfirmed;
        const totalChanged = newTotal !== undefined && guest.total_people !== newTotal;

        if (!statusChanged && !confirmedChanged && !totalChanged) continue;

        // If status not actionable, keep current status
        changes.push({
          guest,
          newStatus: newStatus || guest.status || '—',
          oldStatus: guest.status || '—',
          wiwiName: wiwiRow.name,
          newConfirmed,
          newTotal
        });
      }

      // Find wiwi rows that didn't match any guest (by phone)
      const matchedPhones = new Set(guests.map(g => normalizePhone(g.phone)));
      const unmatched = Object.entries(wiwiMap)
        .filter(([phone, row]) => !matchedPhones.has(phone) && row.confirmed_people > 0)
        .map(([phone, row]) => ({ phone, ...row }));
      setWiwiUnmatched(unmatched);

      if (changes.length === 0 && unmatched.length === 0) {
        alert('✅ אין שינויים לעדכן - כל הסטטוסים כבר מעודכנים!');
        return;
      }

      // If only unmatched (no changes) — still open dialog to show them


      setWiwiPreview(changes);
      setShowWiwiDialog(true);
    } catch (err) {
      alert('❌ שגיאה: ' + err.message);
    } finally {
      setIsUpdatingStatus(false);
      e.target.value = '';
    }
  };

  const handleConfirmWiwiUpdates = async () => {
    setIsUpdatingStatus(true);
    try {
      // Regular updates
      const updates = (wiwiPreview || []).map(({ guest, newStatus, newConfirmed, newTotal }) => ({
        id: guest.id, status: newStatus, confirmed_people: newConfirmed, total_people: newTotal
      }));

      // Linked unmatched: update phone + confirmed_people + status for linked guests
      for (const [wiwiPhone, guestId] of Object.entries(unmatchedLinks)) {
        const wiwiRow = wiwiUnmatched.find(r => r.phone === wiwiPhone);
        const guest = guests.find(g => g.id === guestId);
        if (!wiwiRow || !guest) continue;
        const newStatus = mapWiwiStatus(wiwiRow.status) || guest.status;
        updates.push({
          id: guestId,
          phone: wiwiPhone, // update phone so future syncs find it
          status: newStatus,
          confirmed_people: wiwiRow.confirmed_people,
          total_people: wiwiRow.total_people ?? guest.total_people
        });
      }

      if (updates.length > 0) {
        await base44.functions.invoke('bulkUpdateGuestStatus', { updates });
      }
      queryClient.invalidateQueries(['guests']);
      setShowWiwiDialog(false);
      setWiwiPreview(null);
      setWiwiUnmatched([]);
      setUnmatchedLinks({});
      alert(`✅ עודכנו ${updates.length} מוזמנים בהצלחה!`);
    } catch (err) {
      alert('❌ שגיאה בעדכון: ' + err.message);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleExportCSV = () => {
    // If there are selected guests, export only them. Otherwise export filtered list.
    // Only confirmed guests, only name + confirmed_people
    const baseList = selectedGuestIds.size > 0
      ? filteredGuests.filter(g => selectedGuestIds.has(g.id))
      : filteredGuests;

    const guestsToExport = baseList.filter(g => g.status === 'אישר');

    const headers = ['שם', 'אישרו הגעה'];
    const rows = guestsToExport.map(g => [
      `${g.first_name} ${g.last_name}`.trim(),
      g.confirmed_people != null ? g.confirmed_people : (g.total_people || 1),
    ]);

    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = selectedGuestIds.size > 0 ? `guests_selected_${selectedGuestIds.size}.csv` : 'guests_filtered.csv';
    link.click();
  };

  const handleExportIplan = () => {
    // Export only confirmed guests
    const confirmedGuests = guests.filter(g => g.status === 'אישר');
    
    // Build table name map
    // We need tables — fetch from query cache
    const tablesData = queryClient.getQueryData(['tables']) || [];
    const tableMap = {};
    for (const t of tablesData) tableMap[t.id] = t.name;

    // iPlan columns: A=name, B=total_people, C=side (חתן/כלה only), D=group, E=phone, N=table_number
    // Map our side to iplan side (strip sub-side)
    const toIplanSide = (side) => {
      if (!side) return '';
      if (side === 'משותף') return 'חתן,כלה';
      if (side.startsWith('חתן')) return 'חתן';
      if (side.startsWith('כלה')) return 'כלה';
      return 'חתן,כלה';
    };

    const toIplanGroup = (side, relationship) => {
      // e.g. "כלה - אמא - חברים" or "חתן - חברים"
      const parts = [side, relationship].filter(Boolean);
      return parts.join(' - ');
    };

    // Build iplan_number map (use iplan_number if available, else table name)
    const tableIplanNumMap = {};
    for (const t of tablesData) tableIplanNumMap[t.id] = t.iplan_number || t.name;

    const headers = ['הזמנה לכבוד', 'מס\' אורחים שהוזמנו', 'צד', 'שיוך', 'סלולרי'];
    const rows = confirmedGuests.map(g => {
      const fullName = `${g.first_name} ${g.last_name}`.trim();
      const iplanSide = toIplanSide(g.side);
      const group = toIplanGroup(g.side, g.relationship);
      const confirmedCount = g.confirmed_people != null ? g.confirmed_people : 0;
      return [fullName, confirmedCount, iplanSide, group, g.phone || ''];
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([['', '', '', '', ''], [headers[0], headers[1], headers[2], headers[3], headers[4]], ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, 'מוזמנים');
    XLSX.writeFile(wb, 'iplan_export.xlsx');
  };

  // Extract unique values from data
  const uniqueStatuses = [...new Set(visibleGuests.map(g => g.status).filter(Boolean))];
  const uniqueSides = [...new Set(visibleGuests.map(g => g.side).filter(Boolean))];
  const uniqueRelationships = [...new Set(visibleGuests.map(g => g.relationship).filter(Boolean))];

  const filteredGuests = visibleGuests.filter(guest => {
    const matchesSearch =
      guest.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      guest.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      guest.phone?.includes(searchTerm);
    const matchesStatus = filterStatus === 'all' || guest.status === filterStatus;
    const matchesSide = filterSide === 'all' || guest.side === filterSide;
    const matchesRelationship = filterRelationship === 'all' || guest.relationship === filterRelationship;
    const matchesSeated = filterSeated === 'all' || (filterSeated === 'seated' ? !!guest.table_id : !guest.table_id);
    return matchesSearch && matchesStatus && matchesSide && matchesRelationship && matchesSeated;
  });

  const totalInvited = filteredGuests.reduce((sum, g) => sum + (g.total_people || 1), 0);
  const confirmedGuests = filteredGuests.filter(g => g.status === 'אישר');
  const totalConfirmed = confirmedGuests.reduce((sum, g) => sum + (g.confirmed_people != null ? g.confirmed_people : (g.total_people || 1)), 0);
  const hasAnyConfirmedPeople = filteredGuests.some(g => g.confirmed_people != null);
  const totalDeclined = filteredGuests.filter(g => g.status === 'לא מגיע').reduce((sum, g) => sum + (g.total_people || 1), 0);
  const totalAttended = filteredGuests.filter(g => g.status === 'הגיע').reduce((sum, g) => sum + (g.total_people || 1), 0);

  // Calculate user's own guests (created by them)
  const myGuests = visibleGuests.filter(g => g.created_by === currentUser?.email);
  const myTotalPeople = myGuests.reduce((sum, g) => sum + (g.total_people || 1), 0);
  const hasQuota = currentUser?.wedding_sides && currentUser.wedding_sides.length > 0 && currentUser.max_guests && !isAdmin;
  const quotaReached = hasQuota && myTotalPeople >= currentUser.max_guests;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">מוזמנים</h1>
          <p className="text-gray-600">נהל את רשימת המוזמנים לחתונה</p>
          {hasQuota && (
            <div className="mt-2">
              <Badge className={quotaReached ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}>
                הוספת {myTotalPeople} מתוך {currentUser.max_guests} אנשים מותרים
              </Badge>
            </div>
          )}
        </div>
        <div className="flex gap-2 items-center">
          {/* Hidden file inputs */}
          <input id="wiwiImport" type="file" accept=".xlsx,.xls,.csv" onChange={handleWiwiUpload} className="hidden" />

          {/* Actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                פעולות
                <ChevronDown className="w-4 h-4 mr-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52" dir="rtl">
              <DropdownMenuLabel>iPlan</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => setShowIplanImport(true)} className="text-purple-700">
                <Upload className="w-4 h-4 ml-2" />
                ייבוא מ-iPlan
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportIplan} className="text-purple-700">
                <Download className="w-4 h-4 ml-2" />
                ייצוא ל-iPlan
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>CSV</DropdownMenuLabel>
              <DropdownMenuItem onClick={handleExportCSV}>
                <Download className="w-4 h-4 ml-2" />
                {selectedGuestIds.size > 0 ? `ייצוא נבחרים (${selectedGuestIds.size})` : 'ייצוא CSV'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Wiwi</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => document.getElementById('wiwiImport').click()}
                disabled={isUpdatingStatus}
                className="text-green-700"
              >
                <RefreshCw className={`w-4 h-4 ml-2 ${isUpdatingStatus ? 'animate-spin' : ''}`} />
                {isUpdatingStatus ? 'מעבד...' : 'עדכון מ-Wiwi'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            onClick={() => setShowSyncWizard(true)}
            variant="outline"
            className="border-amber-400 text-amber-700 hover:bg-amber-50"
          >
            🔁 סינכרון
          </Button>

          <Button
            onClick={() => setShowForm(true)}
            disabled={quotaReached}
            className="bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4 ml-2" />
            {quotaReached ? 'הגעת למכסה' : 'הוסף מוזמן'}
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-white">
          <p className="text-sm text-gray-600 mb-1">סה״כ מוזמנים</p>
          <p className="text-2xl font-bold">{totalInvited}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-50 to-white">
          <p className="text-sm text-gray-600 mb-1">אישרו</p>
          <p className="text-2xl font-bold text-green-600">{totalConfirmed}</p>
          {hasAnyConfirmedPeople && (
            <p className="text-xs text-gray-400 mt-0.5">לפי נתוני Wiwi</p>
          )}
        </Card>
        <Card className="p-4 bg-gradient-to-br from-red-50 to-white">
          <p className="text-sm text-gray-600 mb-1">לא מגיעים</p>
          <p className="text-2xl font-bold text-red-600">{totalDeclined}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-purple-50 to-white">
          <p className="text-sm text-gray-600 mb-1">הגיעו</p>
          <p className="text-2xl font-bold text-purple-600">{totalAttended}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            type="text"
            placeholder="חיפוש לפי שם או טלפון..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full md:w-40">
            <SelectValue placeholder="סטטוס" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            {uniqueStatuses.map(status => (
              <SelectItem key={status} value={status}>{status}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSide} onValueChange={setFilterSide}>
          <SelectTrigger className="w-full md:w-40">
            <SelectValue placeholder="צד" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הצדדים</SelectItem>
            {uniqueSides.map(side => (
              <SelectItem key={side} value={side}>{side}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterRelationship} onValueChange={setFilterRelationship}>
          <SelectTrigger className="w-full md:w-40">
            <SelectValue placeholder="קרבה" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הקרבות</SelectItem>
            {uniqueRelationships.map(relationship => (
              <SelectItem key={relationship} value={relationship}>{relationship}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSeated} onValueChange={setFilterSeated}>
          <SelectTrigger className="w-full md:w-44">
            <SelectValue placeholder="הושבה" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כולם</SelectItem>
            <SelectItem value="seated">הושבו בשולחן</SelectItem>
            <SelectItem value="not_seated">לא הושבו</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Selection action bar */}
      {selectedGuestIds.size > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <span className="text-sm font-medium text-amber-800">
            {selectedGuestIds.size} מוזמנים נבחרו
          </span>
          <Button
            size="sm"
            onClick={() => setShowCreateTableDialog(true)}
            className="bg-amber-500 hover:bg-amber-600 text-white mr-auto"
          >
            <LayoutGrid className="w-4 h-4 ml-1" />
            צור שולחן מהנבחרים
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCSV}
            className="border-green-300 text-green-700 hover:bg-green-50"
          >
            <Download className="w-4 h-4 ml-1" />
            ייצוא נבחרים CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedGuestIds(new Set())}>
            בטל בחירה
          </Button>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-10">
                  <Checkbox
                    checked={filteredGuests.length > 0 && selectedGuestIds.size === filteredGuests.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>שם</TableHead>
                <TableHead>טלפון</TableHead>
                <TableHead>צד</TableHead>
                <TableHead>קרבה</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>צפויים</TableHead>
                <TableHead>אישרו בפועל</TableHead>
                <TableHead>הערות</TableHead>
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
              ) : filteredGuests.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-gray-400">
                    אין עדיין מוזמנים. הוסף את המוזמן הראשון!
                  </TableCell>
                </TableRow>
              ) : (
                filteredGuests.map((guest) => (
                  <TableRow key={guest.id} className={`hover:bg-gray-50 ${selectedGuestIds.has(guest.id) ? 'bg-amber-50' : ''}`}>
                    <TableCell>
                      <Checkbox
                        checked={selectedGuestIds.has(guest.id)}
                        onCheckedChange={() => toggleSelectGuest(guest.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      {guest.first_name} {guest.last_name}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">{guest.phone || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-blue-50 border-blue-200">
                        {guest.side}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-purple-50 border-purple-200">
                        {guest.relationship || '-'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {guest.status ? (
                        <Badge
                          className={
                            guest.status === 'אישר'
                              ? 'bg-green-100 text-green-800 border-green-200'
                              : guest.status === 'לא מגיע'
                              ? 'bg-red-100 text-red-800 border-red-200'
                              : guest.status === 'הגיע'
                              ? 'bg-purple-100 text-purple-800 border-purple-200'
                              : 'bg-yellow-100 text-yellow-800 border-yellow-200'
                          }
                        >
                          {guest.status}
                        </Badge>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold">{guest.total_people || 1}</TableCell>
                    <TableCell className="font-semibold">
                      {editingConfirmed?.guestId === guest.id ? (
                        <input
                          type="number"
                          min="0"
                          className="w-16 border border-green-400 rounded px-1 py-0.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-green-400"
                          value={editingConfirmed.value}
                          autoFocus
                          onChange={e => setEditingConfirmed({ guestId: guest.id, value: e.target.value })}
                          onBlur={() => {
                            const val = parseInt(editingConfirmed.value, 10);
                            if (!isNaN(val) && val >= 0) {
                              updateMutation.mutate({ id: guest.id, data: { ...guest, confirmed_people: val } });
                            }
                            setEditingConfirmed(null);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') e.target.blur();
                            if (e.key === 'Escape') setEditingConfirmed(null);
                          }}
                        />
                      ) : (
                        <span
                          className={`cursor-pointer hover:bg-green-50 rounded px-1 py-0.5 ${guest.confirmed_people != null ? 'text-green-600' : 'text-gray-300'}`}
                          title="לחץ לעריכה ידנית"
                          onClick={() => setEditingConfirmed({ guestId: guest.id, value: guest.confirmed_people ?? '' })}
                        >
                          {guest.confirmed_people != null ? guest.confirmed_people : '—'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 max-w-[200px] truncate">
                      {guest.notes || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {guest.status !== 'אישר' && (
                          <button
                            onClick={() => updateMutation.mutate({ id: guest.id, data: { ...guest, status: 'אישר' } })}
                            className="p-2 hover:bg-green-50 rounded-lg transition-colors"
                            title="אשר הגעה"
                          >
                            <Check className="w-4 h-4 text-green-600" />
                          </button>
                        )}
                        <button
                          onClick={() => handleEdit(guest)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <Pencil className="w-4 h-4 text-gray-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(guest)}
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

      <GuestForm
        open={showForm}
        onClose={handleCloseForm}
        guest={editingGuest}
        onSave={handleSave}
      />

      <IplanImportDialog
        open={showIplanImport}
        onClose={() => setShowIplanImport(false)}
        guests={guests}
        tables={queryClient.getQueryData(['tables']) || []}
        onImportDone={() => {
          queryClient.invalidateQueries(['guests']);
          queryClient.invalidateQueries(['tables']);
        }}
      />

      {/* Wiwi Status Update Preview Dialog */}
      <Dialog open={showWiwiDialog} onOpenChange={(o) => { if (!o) { setShowWiwiDialog(false); setWiwiPreview(null); setWiwiUnmatched([]); setUnmatchedLinks({}); } }}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>עדכון סטטוסים מ-Wiwi</DialogTitle>
          </DialogHeader>
          {wiwiPreview && (
            <>
              <p className="text-sm text-gray-600 mb-2">
                נמצאו <span className="font-bold text-amber-700">{wiwiPreview.length}</span> מוזמנים לעדכון. אשר כדי להחיל את השינויים:
              </p>
              <div className="overflow-y-auto flex-1 border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead>שם במערכת</TableHead>
                      <TableHead>טלפון</TableHead>
                      <TableHead>סטטוס נוכחי</TableHead>
                      <TableHead></TableHead>
                      <TableHead>סטטוס חדש</TableHead>
                      <TableHead>מגיעים</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wiwiPreview.map(({ guest, newStatus, oldStatus, newConfirmed }) => (
                      <TableRow key={guest.id}>
                        <TableCell className="font-medium">{guest.first_name} {guest.last_name}</TableCell>
                        <TableCell className="text-sm text-gray-500">{guest.phone}</TableCell>
                        <TableCell>
                          <Badge className="bg-gray-100 text-gray-600">{oldStatus}</Badge>
                        </TableCell>
                        <TableCell className="text-gray-400">
                          <ArrowRight className="w-4 h-4" />
                        </TableCell>
                        <TableCell>
                          <Badge className={newStatus === 'אישר' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                            {newStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm font-semibold">
                          {newConfirmed != null
                            ? <span className="text-green-700">{newConfirmed} <span className="text-gray-400 font-normal">/ {guest.total_people || 1}</span></span>
                            : <span className="text-gray-300">—</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {wiwiUnmatched.length > 0 && (
                <div className="mt-3 border border-orange-200 rounded-lg bg-orange-50 p-3">
                  <p className="text-sm font-semibold text-orange-800 mb-2">
                    ⚠️ {wiwiUnmatched.length} אורחים ב-Wiwi לא נמצאו — שייך אותם לאורח קיים:
                  </p>
                  <div className="space-y-2 max-h-52 overflow-y-auto">
                    {wiwiUnmatched.map((row, i) => (
                      <div key={i} className="flex flex-col gap-1 bg-white border border-orange-100 rounded-lg p-2">
                        <div className="flex items-center gap-2 text-xs text-orange-700">
                          <span className="font-semibold">{row.name}</span>
                          <span className="text-orange-300">|</span>
                          <span dir="ltr">{row.phone}</span>
                          <span className="text-orange-300">|</span>
                          <span>מגיעים: <b>{row.confirmed_people}</b></span>
                        </div>
                        <select
                          className="text-sm border border-orange-200 rounded px-2 py-1 bg-white w-full"
                          value={unmatchedLinks[row.phone] || ''}
                          onChange={e => setUnmatchedLinks(prev => ({ ...prev, [row.phone]: e.target.value }))}
                        >
                          <option value="">— בחר אורח מהרשימה —</option>
                          {guests
                            .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, 'he'))
                            .map(g => (
                              <option key={g.id} value={g.id}>
                                {g.first_name} {g.last_name} {g.phone ? `(${g.phone})` : ''}
                              </option>
                            ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => { setShowWiwiDialog(false); setWiwiPreview(null); setWiwiUnmatched([]); }}>ביטול</Button>
                {((wiwiPreview && wiwiPreview.length > 0) || Object.keys(unmatchedLinks).filter(k => unmatchedLinks[k]).length > 0) && (
                  <Button
                    onClick={handleConfirmWiwiUpdates}
                    disabled={isUpdatingStatus}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    {isUpdatingStatus ? 'מעדכן...' : `אשר עדכון ${(wiwiPreview?.length || 0) + Object.keys(unmatchedLinks).filter(k => unmatchedLinks[k]).length} מוזמנים`}
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <SyncWizard
        open={showSyncWizard}
        onClose={() => setShowSyncWizard(false)}
        onWiwiImport={() => document.getElementById('wiwiImport').click()}
        onIplanExport={handleExportIplan}
        onIplanImport={() => setShowIplanImport(true)}
      />

      {/* Create Table Dialog */}
      <Dialog open={showCreateTableDialog} onOpenChange={(o) => !o && setShowCreateTableDialog(false)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>יצירת שולחן חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <p className="text-sm text-gray-500 mb-1">
                {selectedGuestIds.size} מוזמנים נבחרו ({filteredGuests.filter(g => selectedGuestIds.has(g.id)).reduce((s, g) => s + (g.total_people || 1), 0)} אנשים)
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">שם השולחן</label>
              <Input
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="לדוגמה: שולחן 1"
                autoFocus
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCreateTableDialog(false)}>ביטול</Button>
              <Button
                onClick={handleCreateTableFromSelected}
                disabled={!newTableName.trim() || isCreatingTable}
                className="bg-amber-500 hover:bg-amber-600"
              >
                {isCreatingTable ? 'יוצר...' : 'צור שולחן'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}