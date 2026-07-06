import React, { useState, useMemo } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { useQuery } from '@tanstack/react-query';
import { Search, Users, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useWedding } from '@/lib/WeddingContext';

const RELATIONSHIP_COLORS = {
  'משפחה': 'bg-purple-100 text-purple-700',
  'חברים': 'bg-blue-100 text-blue-700',
  'עבודה': 'bg-orange-100 text-orange-700',
  'לימודים': 'bg-green-100 text-green-700',
  'שכנים': 'bg-yellow-100 text-yellow-700',
  'אחר': 'bg-gray-100 text-gray-600',
};

export default function GuestSearch() {
  const [query, setQuery] = useState('');
  const { activeWeddingId } = useWedding();

  const { data: guests = [] } = useQuery({
    queryKey: ['guests', activeWeddingId],
    queryFn: () => wedflow.entities.Guest.filter({ wedding_id: activeWeddingId }),
    enabled: !!activeWeddingId
  });

  const { data: tables = [] } = useQuery({
    queryKey: ['tables', activeWeddingId],
    queryFn: () => wedflow.entities.Table.filter({ wedding_id: activeWeddingId }),
    enabled: !!activeWeddingId
  });

  const tableMap = useMemo(() => {
    const map = {};
    tables.forEach(t => { map[t.id] = t; });
    return map;
  }, [tables]);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return guests.filter(g =>
      `${g.first_name} ${g.last_name}`.toLowerCase().includes(q) ||
      (g.phone && g.phone.includes(q))
    );
  }, [query, guests]);

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="חפש לפי שם או טלפון..."
          className="pr-10 h-12 text-base rounded-xl border-amber-200 focus:border-amber-400"
          autoFocus
        />
      </div>

      {/* Results */}
      {query.trim() && results.length === 0 && (
        <div className="text-center py-10 text-gray-400">לא נמצאו תוצאות</div>
      )}

      <div className="space-y-4">
        {results.map(guest => {
          const table = guest.table_id ? tableMap[guest.table_id] : null;
          const peopleCount = guest.confirmed_people != null ? guest.confirmed_people : (guest.total_people || 1);
          return (
            <div key={guest.id} className="bg-white rounded-2xl border-2 border-amber-200 shadow-md p-5">
              {/* Name */}
              <p className="font-black text-gray-900 text-3xl leading-tight mb-4">
                {guest.first_name} {guest.last_name}
              </p>

              <div className="grid grid-cols-3 gap-3">
                {/* Table */}
                <div className="bg-amber-50 rounded-xl p-3 flex flex-col items-center justify-center text-center border border-amber-200">
                  <MapPin className="w-5 h-5 text-amber-500 mb-1" />
                  <p className="text-xs text-gray-500 mb-0.5">שולחן</p>
                  {table ? (
                    <>
                      <p className="text-3xl font-black text-amber-700 leading-none">{table.iplan_number || table.name}</p>
                      {table.iplan_number && <p className="text-xs text-gray-400 mt-0.5">{table.name}</p>}
                    </>
                  ) : (
                    <p className="text-lg font-bold text-gray-400">—</p>
                  )}
                </div>

                {/* People */}
                <div className="bg-blue-50 rounded-xl p-3 flex flex-col items-center justify-center text-center border border-blue-200">
                  <Users className="w-5 h-5 text-blue-500 mb-1" />
                  <p className="text-xs text-gray-500 mb-0.5">אנשים</p>
                  <p className="text-3xl font-black text-blue-700 leading-none">{peopleCount}</p>
                </div>

                {/* Relationship */}
                <div className="bg-purple-50 rounded-xl p-3 flex flex-col items-center justify-center text-center border border-purple-200">
                  <p className="text-xs text-gray-500 mb-1">קרבה</p>
                  <p className="text-xl font-black text-purple-700 leading-tight">
                    {guest.relationship || '—'}
                  </p>
                  {guest.side && (
                    <p className="text-sm font-semibold text-purple-500 mt-1 leading-tight">{guest.side}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}