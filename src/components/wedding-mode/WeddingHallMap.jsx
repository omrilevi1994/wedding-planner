import React, { useState } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Phone, Users } from 'lucide-react';
import { useWedding } from '@/lib/WeddingContext';

const RELATIONSHIP_COLORS = {
  'משפחה': 'bg-taupe/15 text-taupe',
  'חברים': 'bg-taupe/15 text-taupe',
  'עבודה': 'bg-champagne text-rose-deep',
  'לימודים': 'bg-sage/15 text-sage-deep',
  'שכנים': 'bg-champagne text-rose-deep',
  'אחר': 'bg-muted text-muted-foreground',
};

export default function WeddingHallMap() {
  const [selectedTable, setSelectedTable] = useState(null);
  const { activeWeddingId } = useWedding();

  const { data: tables = [], isLoading: loadingTables } = useQuery({
    queryKey: ['tables', activeWeddingId],
    queryFn: () => wedflow.entities.Table.filter({ wedding_id: activeWeddingId }),
    enabled: !!activeWeddingId
  });

  const { data: guests = [], isLoading: loadingGuests } = useQuery({
    queryKey: ['guests', activeWeddingId],
    queryFn: () => wedflow.entities.Guest.filter({ wedding_id: activeWeddingId }),
    enabled: !!activeWeddingId
  });

  const isLoading = loadingTables || loadingGuests;

  const getTableGuests = (tableId) => guests.filter(g => g.table_id === tableId);

  const getTableStats = (table) => {
    const seated = getTableGuests(table.id);
    const seatedCount = seated.reduce((sum, g) => sum + (g.confirmed_people != null ? g.confirmed_people : (g.total_people || 1)), 0);
    const isOverflow = seatedCount > table.capacity;
    const isFull = seatedCount === table.capacity;
    return { seated, seatedCount, isOverflow, isFull };
  };

  const selectedTableGuests = selectedTable ? getTableGuests(selectedTable.id) : [];

  if (isLoading) {
    return <div className="text-center py-16 text-muted-foreground text-lg">טוען...</div>;
  }

  return (
    <div>
      {/* Hall Map */}
      <Card className="p-6 bg-gradient-to-b from-champagne to-secondary border-2 border-primary/30">
        <div className="relative w-full bg-card rounded-xl overflow-hidden border-2 border-primary/40 p-6" style={{ minHeight: '420px' }}>
          {/* Stage */}
          <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-rose-deep to-rose flex items-center justify-center rounded-t-xl">
            <span className="text-white font-bold text-xl">במה</span>
          </div>

          {/* Tables Grid */}
          <div className="mt-20 flex flex-wrap gap-5 content-start justify-center">
            {tables.length === 0 ? (
              <div className="w-full h-32 flex items-center justify-center text-muted-foreground">
                <p>טרם הוספת שולחנות</p>
              </div>
            ) : (
              tables.map((table) => {
                const { seatedCount, isOverflow, isFull } = getTableStats(table);
                const isSelected = selectedTable?.id === table.id;
                return (
                  <button
                    key={table.id}
                    onClick={() => setSelectedTable(table)}
                    className={`w-28 h-24 rounded-xl flex flex-col items-center justify-center font-bold text-sm border-2 transition-all shadow-sm active:scale-95 ${
                      isSelected
                        ? 'ring-4 ring-primary ring-offset-1 scale-105'
                        : ''
                    } ${
                      isOverflow
                        ? 'bg-destructive/20 border-destructive text-destructive'
                        : isFull
                        ? 'bg-sage/20 border-sage-deep text-sage-deep'
                        : 'bg-taupe/20 border-taupe text-taupe'
                    }`}
                  >
                    <div className="text-center px-1">
                      {table.iplan_number && (
                        <div className="text-2xl font-black leading-none">{table.iplan_number}</div>
                      )}
                      <div className={`leading-tight ${table.iplan_number ? 'text-xs opacity-70 mt-0.5' : 'text-base'}`}>{table.name}</div>
                      <div className="text-xs mt-1 font-medium opacity-90">
                        {seatedCount} אנשים
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-5 mt-4 justify-center text-sm text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-taupe inline-block"></span>מקום פנוי</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-sage-deep inline-block"></span>מלא</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-destructive inline-block"></span>חריגה</span>
        </div>
      </Card>

      {/* Side Panel */}
      <Sheet open={!!selectedTable} onOpenChange={(open) => !open && setSelectedTable(null)}>
        <SheetContent side="left" className="w-full sm:w-[420px] overflow-y-auto" dir="rtl">
          {selectedTable && (
            <>
              <SheetHeader className="mb-5">
                <SheetTitle className="text-2xl font-bold text-foreground">
                  {selectedTable.name}
                </SheetTitle>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span className="text-sm">
                   {selectedTableGuests.reduce((sum, g) => sum + (g.confirmed_people != null ? g.confirmed_people : (g.total_people || 1)), 0)} / {selectedTable.capacity} מקומות
                  </span>
                </div>
              </SheetHeader>

              {selectedTableGuests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>אין אורחים משובצים לשולחן זה</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedTableGuests.map((guest) => (
                    <div key={guest.id} className="bg-muted rounded-xl p-4 border border-border">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-semibold text-foreground text-base">
                            {guest.first_name} {guest.last_name}
                          </p>
                          {(guest.confirmed_people != null ? guest.confirmed_people : (guest.total_people || 1)) > 1 && (
                            <p className="text-sm text-muted-foreground mt-0.5">
                              {guest.confirmed_people != null ? guest.confirmed_people : guest.total_people} אנשים (מגיעים)
                            </p>
                          )}
                          {guest.phone && (
                            <a
                              href={`tel:${guest.phone}`}
                              className="flex items-center gap-1.5 text-sm text-taupe mt-1.5 hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Phone className="w-3.5 h-3.5" />
                              {guest.phone}
                            </a>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          {guest.relationship && (
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${RELATIONSHIP_COLORS[guest.relationship] || 'bg-muted text-muted-foreground'}`}>
                              {guest.relationship}
                            </span>
                          )}
                          {guest.side && (
                            <span className="text-xs text-muted-foreground">{guest.side}</span>
                          )}
                        </div>
                      </div>
                      {guest.notes && (
                        <p className="text-xs text-muted-foreground mt-2 border-t border-border pt-2">{guest.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}