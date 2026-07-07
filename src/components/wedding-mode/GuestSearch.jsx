import React, { useState, useMemo } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { useQuery } from '@tanstack/react-query';
import { Search, Users, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useWedding } from '@/lib/WeddingContext';

const RELATIONSHIP_COLORS = {
  'משפחה': 'bg-taupe/15 text-taupe',
  'חברים': 'bg-taupe/15 text-taupe',
  'עבודה': 'bg-rose-light/20 text-rose-deep',
  'לימודים': 'bg-sage/15 text-sage-deep',
  'שכנים': 'bg-champagne text-rose-deep',
  'אחר': 'bg-muted text-muted-foreground',
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
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="חפש לפי שם או טלפון..."
          className="pr-10 h-12 text-base rounded-xl border-rose-light focus:border-rose"
          autoFocus
        />
      </div>

      {/* Results */}
      {query.trim() && results.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">לא נמצאו תוצאות</div>
      )}

      <div className="space-y-4">
        {results.map(guest => {
          const table = guest.table_id ? tableMap[guest.table_id] : null;
          const peopleCount = guest.confirmed_people != null ? guest.confirmed_people : (guest.total_people || 1);
          return (
            <div key={guest.id} className="bg-card rounded-2xl border-2 border-rose-light shadow-md p-5">
              {/* Name */}
              <p className="font-black text-foreground text-3xl leading-tight mb-4">
                {guest.first_name} {guest.last_name}
              </p>

              <div className="grid grid-cols-3 gap-3">
                {/* Table */}
                <div className="bg-accent rounded-xl p-3 flex flex-col items-center justify-center text-center border border-rose-light">
                  <MapPin className="w-5 h-5 text-rose mb-1" />
                  <p className="text-xs text-muted-foreground mb-0.5">שולחן</p>
                  {table ? (
                    <>
                      <p className="text-3xl font-black text-rose-deep leading-none">{table.iplan_number || table.name}</p>
                      {table.iplan_number && <p className="text-xs text-muted-foreground mt-0.5">{table.name}</p>}
                    </>
                  ) : (
                    <p className="text-lg font-bold text-muted-foreground">—</p>
                  )}
                </div>

                {/* People */}
                <div className="bg-taupe/15 rounded-xl p-3 flex flex-col items-center justify-center text-center border border-taupe/30">
                  <Users className="w-5 h-5 text-taupe mb-1" />
                  <p className="text-xs text-muted-foreground mb-0.5">אנשים</p>
                  <p className="text-3xl font-black text-taupe leading-none">{peopleCount}</p>
                </div>

                {/* Relationship */}
                <div className="bg-secondary rounded-xl p-3 flex flex-col items-center justify-center text-center border border-border">
                  <p className="text-xs text-muted-foreground mb-1">קרבה</p>
                  <p className="text-xl font-black text-foreground leading-tight">
                    {guest.relationship || '—'}
                  </p>
                  {guest.side && (
                    <p className="text-sm font-semibold text-muted-foreground mt-1 leading-tight">{guest.side}</p>
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