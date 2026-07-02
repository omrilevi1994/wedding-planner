import React, { useState } from 'react';
import { X, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const SIDES = ['הכל', 'חתן', 'חתן - אבא', 'חתן - אמא', 'כלה', 'כלה - אבא', 'כלה - אמא', 'משותף'];
const RELATIONSHIPS = ['הכל', 'משפחה', 'חברים', 'עבודה', 'לימודים', 'שכנים', 'אחר'];
const STATUSES = ['הכל', 'אישר', 'הוזמן', 'אולי', 'לא מגיע', 'הגיע'];

export default function TablePanel({ table, guests, allGuests, onClose, onAddGuest, onRemoveGuest, onDeleteTable, onEditTable }) {
  const [search, setSearch] = useState('');
  const [filterSide, setFilterSide] = useState('הכל');
  const [filterRelationship, setFilterRelationship] = useState('הכל');
  const [filterStatus, setFilterStatus] = useState('הכל');

  const seatedGuests = guests.filter(g => g.table_id === table.id);
  const seatedCount = seatedGuests.reduce((sum, g) => sum + (g.confirmed_people != null ? g.confirmed_people : (g.total_people || 1)), 0);
  const remaining = table.capacity - seatedCount;
  const isOverflow = seatedCount > table.capacity;
  const isFull = seatedCount >= table.capacity;

  // Available guests to add (not seated anywhere, confirmed)
  const availableGuests = allGuests.filter(g =>
    !g.table_id &&
    (g.status === 'אישר' || g.status === 'הגיע') &&
    (filterSide === 'הכל' || g.side === filterSide) &&
    (filterRelationship === 'הכל' || g.relationship === filterRelationship) &&
    (filterStatus === 'הכל' || g.status === filterStatus) &&
    (search === '' || `${g.first_name} ${g.last_name}`.includes(search))
  );

  return (
    <div dir="rtl" className="bg-white rounded-xl shadow-xl border border-gray-200 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className={`p-4 flex items-start justify-between ${isOverflow ? 'bg-red-50 border-b border-red-200' : isFull ? 'bg-blue-50 border-b border-blue-200' : 'bg-amber-50 border-b border-amber-200'}`}>
        <div>
          <div className="flex items-center gap-2">
            {table.iplan_number && (
              <span className="text-2xl font-black text-amber-700">#{table.iplan_number}</span>
            )}
            <h2 className="text-xl font-bold text-gray-900">{table.name}</h2>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={isOverflow ? 'bg-red-100 text-red-800' : isFull ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}>
              {seatedCount}/{table.capacity} אנשים
            </Badge>
            {isOverflow && <span className="text-xs text-red-600 font-semibold">⚠️ עומס!</span>}
            {isFull && !isOverflow && <span className="text-xs text-blue-600 font-semibold">✓ מלא</span>}
            {!isFull && <span className="text-xs text-gray-500">נשארו {remaining} מקומות</span>}
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={() => onEditTable(table)} className="p-2 hover:bg-amber-100 rounded-lg transition-colors">
            <Pencil className="w-4 h-4 text-amber-600" />
          </button>
          <button onClick={() => onDeleteTable(table.id)} className="p-2 hover:bg-red-100 rounded-lg transition-colors">
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Seated guests */}
        <div className="p-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">מוזמנים בשולחן ({seatedGuests.length} רשומות):</p>
          {seatedGuests.length === 0 ? (
            <p className="text-sm text-gray-400 italic">אין מוזמנים בשולחן זה</p>
          ) : (
            <div className="space-y-1.5">
              {seatedGuests.map(guest => {
                const count = guest.confirmed_people != null ? guest.confirmed_people : (guest.total_people || 1);
                return (
                  <div key={guest.id} className={`flex justify-between items-center px-3 py-2 rounded-lg border text-sm ${
                    guest.status === 'אישר' || guest.status === 'הגיע' ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'
                  }`}>
                    <div>
                      <span className="font-medium">{guest.first_name} {guest.last_name}</span>
                      <span className="text-gray-500 text-xs mr-1">({count} אנשים)</span>
                      <span className="text-gray-400 text-xs"> | {guest.side}</span>
                    </div>
                    <button onClick={() => onRemoveGuest(guest.id)} className="p-1 hover:bg-red-100 rounded transition-colors">
                      <X className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add guests section */}
        <div className="border-t border-gray-100 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">הוסף מוזמן לשולחן:</p>

          {/* Filters */}
          <div className="space-y-2 mb-3">
            <input
              type="text"
              placeholder="חפש שם..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <div className="grid grid-cols-3 gap-1">
              <select
                value={filterSide}
                onChange={e => setFilterSide(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none"
              >
                {SIDES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={filterRelationship}
                onChange={e => setFilterRelationship(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none"
              >
                {RELATIONSHIPS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none"
              >
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Guest list */}
          <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
            {availableGuests.length === 0 ? (
              <div className="text-sm text-gray-400 text-center py-4">אין מוזמנים זמינים</div>
            ) : (
              availableGuests.map(guest => {
                const count = guest.confirmed_people != null ? guest.confirmed_people : (guest.total_people || 1);
                return (
                  <button
                    key={guest.id}
                    onClick={() => onAddGuest(guest.id, table.id)}
                    className="w-full text-right px-3 py-2 hover:bg-amber-50 text-sm border-b border-gray-100 last:border-b-0 transition-colors flex justify-between items-center"
                  >
                    <div>
                      <span className="font-medium">{guest.first_name} {guest.last_name}</span>
                      <span className="text-gray-400 text-xs mr-1">({count})</span>
                    </div>
                    <span className="text-xs text-gray-400">{guest.side}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}