import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { wedflow } from '@/api/wedflowClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Plus, RefreshCw } from 'lucide-react';
import { useWedding } from '@/lib/WeddingContext';

function mapSide(iplanSide) {
  const s = (iplanSide || '').trim();
  // Handle "חתן,כלה" or "כלה,חתן" format from iPlan
  if (s === 'חתן') return 'חתן';
  if (s === 'כלה') return 'כלה';
  if (s.includes('חתן') && s.includes('כלה')) return 'משותף';
  if (s.includes('חתן')) return 'חתן';
  if (s.includes('כלה')) return 'כלה';
  return 'משותף';
}

function extractRelationship(group) {
  if (!group) return '';
  const parts = group.trim().split(' - ');
  const last = parts[parts.length - 1]?.trim() || '';
  const relMap = { 'משפחה': 'משפחה', 'חברים': 'חברים', 'עבודה': 'עבודה', 'לימודים': 'לימודים', 'שכנים': 'שכנים', 'אחר': 'אחר' };
  return relMap[last] || 'אחר';
}

function splitName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  const last_name = parts[parts.length - 1];
  const first_name = parts.slice(0, -1).join(' ');
  return { first_name, last_name };
}

function normalizePhone(phone) {
  if (!phone) return '';
  let p = String(phone).replace(/\D/g, '');
  if (p.startsWith('972')) p = '0' + p.slice(3);
  return p;
}

export default function IplanImportDialog({ open, onClose, guests, tables, onImportDone }) {
  const { activeWeddingId } = useWedding();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [preview, setPreview] = useState(null);
  const fileInputRef = useRef();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setPreview(null);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      // Find header row
      let headerRowIdx = 0;
      for (let i = 0; i < Math.min(raw.length, 10); i++) {
        if (raw[i].some(cell => String(cell).includes('הזמנה') || String(cell).includes('שם'))) {
          headerRowIdx = i;
          break;
        }
      }

      const headers = raw[headerRowIdx].map(h => String(h).trim());
      console.log('DEBUG headers:', headers);
      const colName = headers.findIndex(h => h.includes('הזמנה') || h.includes('שם'));
      const colPeople = headers.findIndex(h => h.includes('אורחים') || h.includes('התחייב'));
      const colSide = headers.findIndex(h => h === 'צד' || h.includes('צד'));
      const colGroup = headers.findIndex(h => h.includes('קבוצה') || h.includes('שיוך'));
      const colPhone = headers.findIndex(h => h.includes('סלולרי') || h.includes('נייד') || h.includes('טלפון'));
      const colTable = headers.findIndex(h => h.includes('שולחן'));

      const output = [];
      for (let i = headerRowIdx + 1; i < raw.length; i++) {
        const row = raw[i];
        const name = String(row[colName] ?? '').trim();
        if (!name) continue;
        output.push({
          name,
          total_people: colPeople >= 0 ? Number(row[colPeople]) || 1 : 1,
          side: colSide >= 0 ? String(row[colSide] ?? '').trim() : '',
          group: colGroup >= 0 ? String(row[colGroup] ?? '').trim() : '',
          phone: colPhone >= 0 ? String(row[colPhone] ?? '').trim() : '',
          table_number: colTable >= 0 ? String(row[colTable] ?? '').trim() : '',
        });
      }

      // Build lookup maps for existing guests
      const guestByPhone = {};
      const guestByName = {};
      for (const g of guests) {
        const p = normalizePhone(g.phone);
        if (p) guestByPhone[p] = g;
        const n = `${(g.first_name || '').trim()} ${(g.last_name || '').trim()}`.toLowerCase();
        guestByName[n] = g;
      }

      // Build lookup map for existing tables — prefer iplan_number, fallback to name
      const tableByIplan = {};
      for (const t of tables) {
        if (t.iplan_number) tableByIplan[String(t.iplan_number).trim()] = t;
        else tableByIplan[t.name.trim()] = t;
      }

      const newGuests = [];
      const tableUpdates = []; // existing guests that need table assignment
      const newTableNames = new Set();

      for (const row of output) {
        if (!row.name) continue;
        const { first_name, last_name } = splitName(row.name);
        const phone = normalizePhone(row.phone);
        const side = mapSide(row.side);
        const relationship = extractRelationship(row.group);
        const total_people = row.total_people ? Number(row.total_people) : 1;
        const tableNum = row.table_number ? String(row.table_number).trim() : null;

        // Resolve table_id — match by iplan_number
        let table_id = null;
        if (tableNum) {
          if (tableByIplan[tableNum]) {
            table_id = tableByIplan[tableNum].id;
          } else {
            newTableNames.add(tableNum);
            table_id = `__new__${tableNum}`;
          }
        }

        // Match existing guest
        const existingByPhone = phone ? guestByPhone[phone] : null;
        const fullNameKey = `${first_name.trim()} ${last_name.trim()}`.toLowerCase();
        const reversedNameKey = `${last_name.trim()} ${first_name.trim()}`.toLowerCase();
        const existingByName = guestByName[fullNameKey] || guestByName[reversedNameKey];
        const existing = existingByPhone || existingByName;

        if (existing) {
          // If has a table in iPlan and not yet seated here — queue an update
          if (tableNum && existing.table_id !== table_id) {
            tableUpdates.push({ guest: existing, table_id, tableNum });
          }
        } else {
          newGuests.push({ first_name, last_name, phone, side, relationship, total_people, table_id, tableNum, _approved: true });
        }
      }

      setPreview({ newGuests, tableUpdates, newTableNames: [...newTableNames] });
    } catch (err) {
      alert('❌ שגיאה: ' + err.message);
    } finally {
      setIsProcessing(false);
      e.target.value = '';
    }
  };

  const handleApprove = async () => {
    if (!preview) return;
    setIsApplying(true);
    try {
      const approvedGuests = preview.newGuests.filter(g => g._approved);

      // Collect only table names actually needed
      const usedTableNames = new Set([
        ...approvedGuests.map(g => g.tableNum).filter(Boolean),
        ...preview.tableUpdates.map(u => u.tableNum).filter(Boolean),
      ]);
      const newTableNames = preview.newTableNames.filter(t => usedTableNames.has(t));

      const result = await wedflow.functions.invoke('iplanBulkImport', {
        wedding_id: activeWeddingId,
        newTableNames,
        tableUpdates: preview.tableUpdates.map(u => ({ guestId: u.guest.id, table_id: u.table_id, tableNum: u.tableNum })),
        newGuests: approvedGuests.map(ng => ({
          first_name: ng.first_name,
          last_name: ng.last_name,
          phone: ng.phone || '',
          side: ng.side,
          relationship: ng.relationship,
          total_people: ng.total_people,
          table_id: ng.table_id,
        })),
      });

      onImportDone();
      setPreview(null);
      onClose();
      alert(`✅ ייבוא הושלם! ${result.guestsUpdated} אורחים שובצו לשולחן, ${result.guestsCreated} מוזמנים חדשים נוצרו`);
    } catch (err) {
      alert('❌ שגיאה בייבוא: ' + err.message);
    } finally {
      setIsApplying(false);
    }
  };

  const toggleNewGuest = (i) => {
    setPreview(prev => {
      const newGuests = [...prev.newGuests];
      newGuests[i] = { ...newGuests[i], _approved: !newGuests[i]._approved };
      return { ...prev, newGuests };
    });
  };

  const approvedNewCount = preview?.newGuests.filter(g => g._approved).length || 0;
  const totalActions = approvedNewCount + (preview?.tableUpdates.length || 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setPreview(null); onClose(); } }}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>ייבוא מ-iPlan</DialogTitle>
        </DialogHeader>

        {!preview ? (
          <div className="flex flex-col items-center gap-6 py-8">
            <p className="text-muted-foreground text-sm text-center">
              העלה קובץ Excel מ-iPlan.<br/>
              המערכת תזהה שינויים ותציג אותם לאישורך לפני הייבוא.
            </p>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="bg-primary hover:bg-primary-hover"
            >
              {isProcessing ? (
                <><RefreshCw className="w-4 h-4 ml-2 animate-spin" /> מעבד...</>
              ) : (
                <><Plus className="w-4 h-4 ml-2" /> בחר קובץ iPlan</>
              )}
            </Button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 overflow-hidden flex-1 overflow-y-auto">

            {/* Table seating updates for existing guests */}
            {preview.tableUpdates.length > 0 && (
              <div className="bg-sage/15 border border-sage/30 rounded-lg p-3">
                <p className="text-sm font-semibold text-sage-deep mb-2">
                  🪑 {preview.tableUpdates.length} אורחים קיימים יושבצו לשולחן:
                </p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {preview.tableUpdates.map((upd, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 rounded bg-card border border-sage/20 text-sm">
                      <span className="font-medium">{upd.guest.first_name} {upd.guest.last_name}</span>
                      <span className="text-muted-foreground">→</span>
                      <Badge className="bg-sage/20 text-sage-deep text-xs">שולחן {upd.tableNum}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* New guests */}
            {preview.newGuests.length > 0 && (
              <div className="bg-champagne border border-taupe/40 rounded-lg p-3">
                <p className="text-sm font-semibold text-rose-deep mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  {preview.newGuests.length} מוזמנים חדשים (לא קיימים במערכת) — סמן מי לייבא:
                </p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {preview.newGuests.map((g, i) => (
                    <div
                      key={i}
                      onClick={() => toggleNewGuest(i)}
                      className={`flex items-center gap-3 p-2 rounded cursor-pointer border text-sm ${g._approved ? 'bg-sage/15 border-sage/40' : 'bg-card border-taupe/30'}`}
                    >
                      <input type="checkbox" checked={!!g._approved} onChange={() => toggleNewGuest(i)} onClick={e => e.stopPropagation()} />
                      <span className="font-medium">{g.first_name} {g.last_name}</span>
                      <span className="text-muted-foreground">{g.phone}</span>
                      <Badge className="bg-taupe/15 text-taupe text-xs">{g.side}</Badge>
                      {g.tableNum && <Badge className="bg-muted text-muted-foreground text-xs">שולחן {g.tableNum}</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {preview.newGuests.length === 0 && preview.tableUpdates.length === 0 && (
              <p className="text-center text-muted-foreground py-4">✅ אין שינויים — כל הנתונים עדכניים!</p>
            )}

            <div className="flex gap-2 justify-end pt-2 border-t">
              <Button variant="outline" onClick={() => { setPreview(null); onClose(); }}>ביטול</Button>
              {totalActions > 0 && (
                <Button
                  onClick={handleApprove}
                  disabled={isApplying}
                  className="bg-sage hover:bg-sage-deep text-white"
                >
                  {isApplying ? 'מייבא...' : `אשר ויבא`}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}