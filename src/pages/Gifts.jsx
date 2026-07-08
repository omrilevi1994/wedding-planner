import React, { useState } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Trash2, Edit2, Gift, Search, ChevronDown, ChevronUp, TrendingUp, TrendingDown, BarChart2, Download, X, AlertCircle } from 'lucide-react';
import { useWedding } from '@/lib/WeddingContext';
import { CreatableSelect } from '@/components/ui/creatable-select';
import { getPaymentMethodOptions } from '@/lib/giftOptions';

const EVENT_OPTIONS = ['חתונה', 'שבת חתן', 'מסיבת מקווה', 'אחר'];

export default function Gifts() {
  const queryClient = useQueryClient();
  const { activeWeddingId } = useWedding();
  const [searchTerm, setSearchTerm] = useState('');
  const [minAmountFilter, setMinAmountFilter] = useState('');
  const [maxAmountFilter, setMaxAmountFilter] = useState('');
  const [filterSides, setFilterSides] = useState([]);
  const [filterRelationships, setFilterRelationships] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingGift, setEditingGift] = useState(null);
  const [expandedGuests, setExpandedGuests] = useState({});
  const [editingGiftAmount, setEditingGiftAmount] = useState(null);

  // Form state for extra gifts
  const [formGuestId, setFormGuestId] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formEvent, setFormEvent] = useState('חתונה');
  const [formAmount, setFormAmount] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formPaymentMethod, setFormPaymentMethod] = useState('');
  const [guestSearch, setGuestSearch] = useState('');
  const [showGuestDropdown, setShowGuestDropdown] = useState(false);

  const { data: guests = [] } = useQuery({
    queryKey: ['guests', activeWeddingId],
    queryFn: () => wedflow.entities.Guest.filter({ wedding_id: activeWeddingId }, '-created_date'),
    enabled: !!activeWeddingId
  });

  const { data: gifts = [] } = useQuery({
    queryKey: ['gifts', activeWeddingId],
    queryFn: () => wedflow.entities.Gift.filter({ wedding_id: activeWeddingId }, '-created_date'),
    enabled: !!activeWeddingId
  });

  const updateGuestMutation = useMutation({
    mutationFn: ({ id, data }) => wedflow.entities.Guest.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(['guests'])
  });

  const createGiftMutation = useMutation({
    mutationFn: (data) => wedflow.entities.Gift.create({ ...data, wedding_id: activeWeddingId }),
    onSuccess: () => { queryClient.invalidateQueries(['gifts']); closeDialog(); }
  });

  const updateGiftMutation = useMutation({
    mutationFn: ({ id, data }) => wedflow.entities.Gift.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries(['gifts']); closeDialog(); }
  });

  const deleteGiftMutation = useMutation({
    mutationFn: (id) => wedflow.entities.Gift.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['gifts'])
  });

  const closeDialog = () => {
    setShowDialog(false);
    setEditingGift(null);
    setFormGuestId('');
    setFormDescription('');
    setFormEvent('חתונה');
    setFormAmount('');
    setFormNotes('');
    setFormPaymentMethod('');
  };

  const openAdd = (guestId = '') => {
    setEditingGift(null);
    setFormGuestId(guestId);
    const g = guests.find(x => x.id === guestId);
    setGuestSearch(g ? `${g.first_name} ${g.last_name}` : '');
    setFormDescription('');
    setFormEvent('חתונה');
    setFormAmount('');
    setFormNotes('');
    setFormPaymentMethod('');
    setShowDialog(true);
  };

  const openEdit = (gift) => {
    setEditingGift(gift);
    setFormGuestId(gift.guest_id);
    const g = guests.find(x => x.id === gift.guest_id);
    setGuestSearch(g ? `${g.first_name} ${g.last_name}` : '');
    setFormDescription(gift.description || '');
    setFormEvent(gift.event || 'חתונה');
    setFormAmount(gift.amount != null ? String(gift.amount) : '');
    setFormNotes(gift.notes || '');
    setFormPaymentMethod(gift.payment_method || '');
    setShowDialog(true);
  };

  const handleSaveGift = () => {
    if (!formGuestId || !formDescription.trim()) return;
    const data = {
      guest_id: formGuestId,
      description: formDescription.trim(),
      event: formEvent || '',
      amount: formAmount !== '' ? parseFloat(formAmount) : null,
      notes: formNotes.trim() || null,
      payment_method: formPaymentMethod || null
    };
    if (editingGift) {
      updateGiftMutation.mutate({ id: editingGift.id, data });
    } else {
      createGiftMutation.mutate(data);
    }
  };

  const handleSaveGiftAmount = (guest, value) => {
    const val = value !== '' ? parseFloat(value) : null;
    updateGuestMutation.mutate({ id: guest.id, data: { ...guest, gift_amount: val } });
    setEditingGiftAmount(null);
  };

  const toggleExpand = (guestId) => {
    setExpandedGuests(prev => ({ ...prev, [guestId]: !prev[guestId] }));
  };

  // Show guests that have gift_amount OR have extra gifts
  const guestGiftsMap = {};
  for (const g of gifts) {
    if (!guestGiftsMap[g.guest_id]) guestGiftsMap[g.guest_id] = [];
    guestGiftsMap[g.guest_id].push(g);
  }

  const guestsWithGifts = guests
    .filter(guest => filterSides.length === 0 || filterSides.includes(guest.side))
    .filter(guest => filterRelationships.length === 0 || filterRelationships.includes(guest.relationship))
    .filter(guest => (guest.gift_amount != null && guest.gift_amount > 0) || guestGiftsMap[guest.id]?.length > 0)
    .filter(guest => {
      if (!searchTerm) return true;
      return `${guest.first_name} ${guest.last_name}`.toLowerCase().includes(searchTerm.toLowerCase());
    })
    .filter(guest => {
      const total = (guest.gift_amount || 0) + (guestGiftsMap[guest.id] || []).reduce((s, g) => s + (g.amount || 0), 0);
      if (minAmountFilter !== '' && total < parseFloat(minAmountFilter)) return false;
      if (maxAmountFilter !== '' && total > parseFloat(maxAmountFilter)) return false;
      return true;
    });

  const totalCashAmount = guests.reduce((sum, g) => sum + (g.gift_amount || 0), 0);
  const totalExtraAmount = gifts.reduce((sum, g) => sum + (g.amount || 0), 0);
  const totalAmount = totalCashAmount + totalExtraAmount;

  // Analytics — per guest totals (only guests with cash gift)
  const guestTotals = guests
    .filter(g => g.gift_amount != null && g.gift_amount > 0)
    .map(g => ({
      name: `${g.first_name} ${g.last_name}`,
      total: (g.gift_amount || 0) + (guestGiftsMap[g.id] || []).reduce((s, gift) => s + (gift.amount || 0), 0)
    }));
  const minGift = guestTotals.length ? Math.min(...guestTotals.map(g => g.total)) : null;
  const maxGift = guestTotals.length ? Math.max(...guestTotals.map(g => g.total)) : null;
  const avgGift = guestTotals.length ? Math.round(guestTotals.reduce((s, g) => s + g.total, 0) / guestTotals.length) : null;
  const minGuest = guestTotals.find(g => g.total === minGift);
  const maxGuest = guestTotals.find(g => g.total === maxGift);

  const paymentMethodOptions = getPaymentMethodOptions(gifts);

  const uniqueSides = [...new Set(guests.map(g => g.side).filter(Boolean))];
  const uniqueRelationships = [...new Set(guests.map(g => g.relationship).filter(Boolean))];

  // Guests who confirmed/maybe but have no gift at all (and not marked as received)
  const guestsWithoutGift = guests.filter(g =>
    (g.status === 'אישר' || g.status === 'אולי') &&
    !(g.gift_amount != null && g.gift_amount > 0) &&
    !guestGiftsMap[g.id]?.length &&
    !g.gift_received
  );
  const [showMissingGifts, setShowMissingGifts] = useState(false);

  const exportCSV = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['שם', 'צד', 'קרבה', 'סוג מתנה', 'תיאור', 'אירוע', 'אמצעי תשלום', 'סכום ₪', 'סה"כ לאורח'].map(esc).join(',')];
    guestsWithGifts.forEach(guest => {
      const extraGifts = guestGiftsMap[guest.id] || [];
      const guestTotal = (guest.gift_amount || 0) + extraGifts.reduce((s, g) => s + (g.amount || 0), 0);
      const name = `${guest.first_name} ${guest.last_name}`;
      const side = guest.side || '';
      const rel = guest.relationship || '';

      if (guest.gift_amount != null && guest.gift_amount > 0) {
        rows.push([esc(name), esc(side), esc(rel), esc('מזומן / העברה'), esc(''), esc('חתונה'), esc(''), esc(guest.gift_amount), esc(guestTotal)].join(','));
      }
      extraGifts.forEach((gift, i) => {
        rows.push([esc(name), esc(side), esc(rel), esc('מתנה נוספת'), esc(gift.description), esc(gift.event || ''), esc(gift.payment_method || ''), esc(gift.amount ?? ''), i === 0 && !(guest.gift_amount > 0) ? esc(guestTotal) : esc('')].join(','));
      });
    });
    const csv = rows.join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'דוח_מתנות.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-1">מתנות</h1>
          <p className="text-muted-foreground text-sm">מתנות שהתקבלו מהאורחים — כספי ואחר</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={exportCSV}
            className="border-sage/30 text-sage-deep hover:bg-sage/15"
          >
            <Download className="w-4 h-4 ml-1" />
            יצוא דוח CSV
          </Button>
          <Button
            onClick={() => openAdd()}
            className="bg-gradient-to-l from-rose to-rose-deep hover:from-rose-deep hover:to-rose-deep"
          >
            <Plus className="w-4 h-4 ml-1" />
            הוסף מתנה נוספת
          </Button>
        </div>
      </div>

      {/* Missing gifts banner */}
      {guestsWithoutGift.length > 0 && (
        <div className="border border-taupe/40 rounded-xl bg-champagne overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-champagne/70 transition-colors"
            onClick={() => setShowMissingGifts(v => !v)}
          >
            <div className="flex items-center gap-2 text-rose-deep">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span className="font-semibold text-sm">{guestsWithoutGift.length} אורחים שאישרו / אולי ועדיין לא רשמנו מתנה</span>
            </div>
            {showMissingGifts ? <ChevronUp className="w-4 h-4 text-taupe" /> : <ChevronDown className="w-4 h-4 text-taupe" />}
          </button>
          {showMissingGifts && (
            <div className="border-t border-taupe/40 divide-y divide-taupe/20">
              {guestsWithoutGift.map(guest => (
                <div key={guest.id} className="flex items-center justify-between px-4 py-2.5 bg-card">
                  <div className="flex items-center gap-3">
                    <div className="bg-champagne rounded-full w-8 h-8 flex items-center justify-center shrink-0">
                      <span className="text-rose-deep font-bold text-xs">{guest.first_name?.[0]}{guest.last_name?.[0]}</span>
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-sm">{guest.first_name} {guest.last_name}</p>
                      <p className="text-xs text-muted-foreground">{guest.side}{guest.relationship ? ` · ${guest.relationship}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={`text-xs ${guest.status === 'אולי' ? 'bg-champagne border-taupe/40 text-rose-deep' : 'bg-sage/15 border-sage/30 text-sage-deep'}`}>
                      {guest.status}
                    </Badge>
                    <Button size="sm" variant="ghost" className="text-sage-deep hover:bg-sage/15 h-7 px-2"
                      onClick={() => updateGuestMutation.mutate({ id: guest.id, data: { gift_received: true } })}>
                      <Gift className="w-3.5 h-3.5 ml-1" />
                      הביא מתנה
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 h-7 px-2"
                      onClick={() => updateGuestMutation.mutate({ id: guest.id, data: { status: 'לא מגיע' } })}>
                      לא הגיע
                    </Button>
                    <Button size="sm" variant="ghost" className="text-rose hover:bg-accent h-7 px-2"
                      onClick={() => openAdd(guest.id)}>
                      <Plus className="w-3.5 h-3.5 ml-1" />
                      הוסף מתנה
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 bg-gradient-to-br from-sage/15 to-card text-center">
          <p className="text-sm text-muted-foreground">סה״כ מזומן / העברה</p>
          <p className="text-2xl font-bold text-sage-deep">₪{totalCashAmount.toLocaleString()}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-taupe/15 to-card text-center">
          <p className="text-sm text-muted-foreground">מתנות נוספות (שווי)</p>
          <p className="text-2xl font-bold text-taupe">₪{totalExtraAmount.toLocaleString()}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-rose-light/40 to-card text-center">
          <p className="text-sm text-muted-foreground">סה״כ כולל</p>
          <p className="text-2xl font-bold text-rose-deep">₪{totalAmount.toLocaleString()}</p>
        </Card>
      </div>

      {/* Analytics */}
      {guestTotals.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4 bg-gradient-to-br from-destructive/10 to-card text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingDown className="w-4 h-4 text-destructive/70" />
              <p className="text-sm text-muted-foreground">מתנה הכי נמוכה</p>
            </div>
            <p className="text-2xl font-bold text-destructive">₪{minGift?.toLocaleString()}</p>
            {minGuest && <p className="text-xs text-muted-foreground mt-1 truncate">{minGuest.name}</p>}
          </Card>
          <Card className="p-4 bg-gradient-to-br from-taupe/15 to-card text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <BarChart2 className="w-4 h-4 text-taupe" />
              <p className="text-sm text-muted-foreground">ממוצע מתנות</p>
            </div>
            <p className="text-2xl font-bold text-taupe">₪{avgGift?.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{guestTotals.length} משלמים</p>
          </Card>
          <Card className="p-4 bg-gradient-to-br from-sage/15 to-card text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="w-4 h-4 text-sage" />
              <p className="text-sm text-muted-foreground">מתנה הכי גבוהה</p>
            </div>
            <p className="text-2xl font-bold text-sage-deep">₪{maxGift?.toLocaleString()}</p>
            {maxGuest && <p className="text-xs text-muted-foreground mt-1 truncate">{maxGuest.name}</p>}
          </Card>
        </div>
      )}

      {/* Search + Amount filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="חיפוש לפי שם אורח..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pr-10"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground shrink-0">סכום:</span>
          <Input
            type="number"
            placeholder="מינימום ₪"
            value={minAmountFilter}
            onChange={e => setMinAmountFilter(e.target.value)}
            className="w-32"
            min="0"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="number"
            placeholder="מקסימום ₪"
            value={maxAmountFilter}
            onChange={e => setMaxAmountFilter(e.target.value)}
            className="w-32"
            min="0"
          />
          {(minAmountFilter || maxAmountFilter) && (
            <button onClick={() => { setMinAmountFilter(''); setMaxAmountFilter(''); }} className="text-xs text-muted-foreground hover:text-foreground underline shrink-0">נקה</button>
          )}
        </div>
      </div>

      {/* Side + Relationship multi-select filters */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground shrink-0">צד:</span>
          {uniqueSides.map(side => (
            <button
              key={side}
              onClick={() => setFilterSides(prev => prev.includes(side) ? prev.filter(s => s !== side) : [...prev, side])}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${filterSides.includes(side) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
            >
              {side}
            </button>
          ))}
          {filterSides.length > 0 && (
            <button onClick={() => setFilterSides([])} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <X className="w-3 h-3" /> נקה
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground shrink-0">קרבה:</span>
          {uniqueRelationships.map(rel => (
            <button
              key={rel}
              onClick={() => setFilterRelationships(prev => prev.includes(rel) ? prev.filter(r => r !== rel) : [...prev, rel])}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${filterRelationships.includes(rel) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
            >
              {rel}
            </button>
          ))}
          {filterRelationships.length > 0 && (
            <button onClick={() => setFilterRelationships([])} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              <X className="w-3 h-3" /> נקה
            </button>
          )}
        </div>
      </div>

      {/* Guest cards */}
      {guestsWithGifts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Gift className="w-14 h-14 mx-auto mb-3 opacity-30" />
          <p className="text-lg">אין מתנות עדיין</p>
          <p className="text-sm">עדכן סכום מתנה בדף המוזמנים או הוסף מתנה נוספת כאן</p>
        </div>
      ) : (
        <div className="space-y-3">
          {guestsWithGifts.map(guest => {
            const extraGifts = guestGiftsMap[guest.id] || [];
            const isExpanded = expandedGuests[guest.id] !== false;
            const guestTotal = (guest.gift_amount || 0) + extraGifts.reduce((s, g) => s + (g.amount || 0), 0);

            return (
              <Card key={guest.id} className="overflow-hidden">
                {/* Guest header row */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted transition-colors"
                  onClick={() => toggleExpand(guest.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-champagne rounded-full w-9 h-9 flex items-center justify-center shrink-0">
                      <span className="text-rose-deep font-bold text-sm">
                        {guest.first_name?.[0]}{guest.last_name?.[0]}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{guest.first_name} {guest.last_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {guest.gift_amount != null ? `מזומן/העברה: ₪${guest.gift_amount.toLocaleString()}` : ''}
                        {guest.gift_amount != null && extraGifts.length > 0 ? ' · ' : ''}
                        {extraGifts.length > 0 ? `${extraGifts.length} מתנות נוספות` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {guestTotal > 0 && (
                      <Badge className="bg-sage/15 text-sage-deep border-sage/30">
                        סה״כ ₪{guestTotal.toLocaleString()}
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={e => { e.stopPropagation(); openAdd(guest.id); }}
                      className="text-rose hover:bg-accent"
                      title="הוסף מתנה נוספת"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t divide-y bg-muted/50">
                    {/* Cash / transfer amount row - only show if has amount or editing */}
                    {(guest.gift_amount != null && guest.gift_amount > 0) || editingGiftAmount?.guestId === guest.id ? (
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground w-28">מזומן / העברה</span>
                        {editingGiftAmount?.guestId === guest.id ? (
                          <input
                            type="number"
                            min="0"
                            autoFocus
                            className="w-28 border border-sage rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-sage"
                            value={editingGiftAmount.value}
                            onChange={e => setEditingGiftAmount({ guestId: guest.id, value: e.target.value })}
                            onBlur={() => handleSaveGiftAmount(guest, editingGiftAmount.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') e.target.blur();
                              if (e.key === 'Escape') setEditingGiftAmount(null);
                            }}
                          />
                        ) : (
                          <span
                            className={`cursor-pointer hover:bg-sage/15 rounded px-2 py-1 text-sm font-semibold ${guest.gift_amount != null ? 'text-sage-deep' : 'text-muted-foreground/50'}`}
                            onClick={() => setEditingGiftAmount({ guestId: guest.id, value: guest.gift_amount ?? '' })}
                            title="לחץ לעריכה"
                          >
                            {guest.gift_amount != null ? `₪${guest.gift_amount.toLocaleString()}` : '+ הוסף סכום'}
                          </span>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs bg-sage/15 border-sage/30 text-sage-deep">חתונה</Badge>
                    </div>
                    ) : null}

                    {/* Extra gifts */}
                    {extraGifts.map(gift => (
                      <div key={gift.id} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-xs font-medium text-muted-foreground w-28 shrink-0">מתנה נוספת</span>
                          <div>
                            <span className="font-medium text-foreground text-sm">{gift.description}</span>
                            {gift.notes && <p className="text-xs text-muted-foreground">{gift.notes}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {gift.event && (
                            <Badge variant="outline" className="text-xs bg-taupe/15 border-taupe/30 text-taupe">
                              {gift.event}
                            </Badge>
                          )}
                          {gift.payment_method && (
                            <Badge variant="outline" className="text-xs bg-champagne border-taupe/30 text-rose-deep">
                              {gift.payment_method}
                            </Badge>
                          )}
                          {gift.amount != null && (
                            <Badge variant="outline" className="text-xs bg-sage/15 border-sage/30 text-sage-deep">
                              ₪{gift.amount.toLocaleString()}
                            </Badge>
                          )}
                          <button onClick={() => openEdit(gift)} className="p-1.5 hover:bg-muted rounded-lg">
                            <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                          <button
                            onClick={() => window.confirm('למחוק מתנה זו?') && deleteGiftMutation.mutate(gift.id)}
                            className="p-1.5 hover:bg-destructive/10 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive/70" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit extra gift dialog */}
      <Dialog open={showDialog} onOpenChange={open => !open && closeDialog()}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGift ? 'ערוך מתנה נוספת' : 'הוסף מתנה נוספת'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 relative">
              <Label>אורח *</Label>
              <Input
                value={guestSearch}
                onChange={e => { setGuestSearch(e.target.value); setFormGuestId(''); setShowGuestDropdown(true); }}
                onFocus={() => setShowGuestDropdown(true)}
                placeholder="חפש אורח..."
                autoComplete="off"
              />
              {showGuestDropdown && guestSearch && (
                <div className="absolute z-50 w-full bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto mt-1">
                  {guests
                    .filter(g => `${g.first_name} ${g.last_name}`.toLowerCase().includes(guestSearch.toLowerCase()))
                    .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, 'he'))
                    .map(g => (
                      <div
                        key={g.id}
                        className="px-3 py-2 hover:bg-accent cursor-pointer text-sm"
                        onMouseDown={() => {
                          setFormGuestId(g.id);
                          setGuestSearch(`${g.first_name} ${g.last_name}`);
                          setShowGuestDropdown(false);
                        }}
                      >
                        {g.first_name} {g.last_name}
                      </div>
                    ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>תיאור המתנה *</Label>
              <Input
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                placeholder='לדוגמא: גיפט קארד, מגבות בית'
              />
            </div>
            <div className="space-y-2">
              <Label>אירוע</Label>
              <div className="flex gap-2 flex-wrap">
                {EVENT_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setFormEvent(opt)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${formEvent === opt ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <Input value={formEvent} onChange={e => setFormEvent(e.target.value)} placeholder="אירוע מותאם אישית" className="mt-1" />
            </div>
            <div className="space-y-2">
              <Label>שווי כספי (₪)</Label>
              <Input type="number" value={formAmount} onChange={e => setFormAmount(e.target.value)} placeholder="אופציונלי" min="0" />
            </div>
            <div className="space-y-2">
              <Label>איך התקבלה</Label>
              <CreatableSelect
                value={formPaymentMethod}
                onChange={setFormPaymentMethod}
                options={paymentMethodOptions}
                placeholder="בחר או הוסף אמצעי תשלום..."
              />
            </div>
            <div className="space-y-2">
              <Label>הערות</Label>
              <Input value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="הערות נוספות..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>ביטול</Button>
            <Button onClick={handleSaveGift} disabled={!formGuestId || !formDescription.trim()} className="bg-primary hover:bg-primary-hover">
              {editingGift ? 'שמור' : 'הוסף'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}