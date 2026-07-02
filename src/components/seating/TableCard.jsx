import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Pencil } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function TableCard({ table, guests, onAddGuest, onRemoveGuest, onDeleteTable, onEditTable }) {
  const [searchGuest, setSearchGuest] = useState('');
  
  const seatedGuests = guests.filter(g => g.table_id === table.id);
  const availableGuests = guests.filter(g => (!g.table_id || g.table_id !== table.id) && g.status === 'אישר');
  const filteredGuests = availableGuests.filter(g => 
    `${g.first_name} ${g.last_name}`.toLowerCase().includes(searchGuest.toLowerCase())
  );
  const seatedGuestCount = seatedGuests.reduce((sum, g) => sum + (g.confirmed_people != null ? g.confirmed_people : (g.total_people || 1)), 0);
  const remainingCapacity = table.capacity - seatedGuestCount;

  return (
    <Card className="p-6 bg-gradient-to-br from-amber-50 to-white border-2 border-amber-200">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900">{table.name}</h3>
          <p className="text-sm text-gray-600">
            {table.iplan_number && <span className="font-medium text-amber-700 ml-2">#{table.iplan_number}</span>}
            קיבולת: {table.capacity}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onEditTable(table)}
            className="p-2 hover:bg-amber-50 rounded-lg transition-colors"
          >
            <Pencil className="w-5 h-5 text-amber-600" />
          </button>
          <button
            onClick={() => onDeleteTable(table.id)}
            className="p-2 hover:bg-red-50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-red-600" />
          </button>
        </div>
      </div>

      <div className="mb-4">
        <Badge className={
          seatedGuestCount > table.capacity 
            ? 'bg-red-100 text-red-800' 
            : seatedGuestCount === table.capacity 
            ? 'bg-green-100 text-green-800' 
            : 'bg-blue-100 text-blue-800'
        }>
          {seatedGuestCount}/{table.capacity} אנשים
        </Badge>
      </div>

      {seatedGuests.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-sm font-semibold text-gray-700">מוזמנים בשולחן:</p>
          {seatedGuests.map(guest => (
            <div key={guest.id} className={`flex justify-between items-center p-2 rounded border ${guest.status !== 'אישר' ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
              <span className="text-sm">{guest.first_name} {guest.last_name} <span className="text-gray-400 text-xs">({guest.confirmed_people != null ? guest.confirmed_people : (guest.total_people || 1)})</span></span>
              <button
                onClick={() => onRemoveGuest(guest.id)}
                className="p-1 hover:bg-red-50 rounded transition-colors"
              >
                <X className="w-4 h-4 text-red-600" />
              </button>
            </div>
          ))}
        </div>
      )}

      {remainingCapacity > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-gray-700">הוסף מוזמן:</p>
          <div className="space-y-2">
            <input
              type="text"
              placeholder="חפש מוזמן..."
              value={searchGuest}
              onChange={(e) => setSearchGuest(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {filteredGuests.length > 0 && (
              <div className="border border-gray-200 rounded-md max-h-48 overflow-y-auto">
                {filteredGuests.map(guest => (
                  <button
                    key={guest.id}
                    onClick={() => {
                      onAddGuest(guest.id, table.id);
                      setSearchGuest('');
                    }}
                    className="w-full text-right px-3 py-2 hover:bg-amber-100 text-sm border-b border-gray-100 last:border-b-0 transition-colors"
                  >
                    <span>{guest.first_name} {guest.last_name}</span>
                    <span className="text-gray-400 text-xs mr-1">({guest.confirmed_people != null ? guest.confirmed_people : (guest.total_people || 1)} אנשים)</span>
                  </button>
                ))}
              </div>
            )}
            {searchGuest && filteredGuests.length === 0 && (
              <div className="text-sm text-gray-500 py-2 px-3">אין תוצאות</div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}