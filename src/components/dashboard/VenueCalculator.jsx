import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Plus, X, Calculator } from 'lucide-react';

export default function VenueCalculator({ totalExpenses, totalConfirmed, totalInvited }) {
  const [guestCount, setGuestCount] = useState(totalInvited || totalConfirmed || 0);

  useEffect(() => {
    if (totalInvited) setGuestCount(totalInvited);
  }, [totalInvited]);
  const [dishCost, setDishCost] = useState('');
  const [barCost, setBarCost] = useState('');
  const [serviceCost, setServiceCost] = useState('');
  const [extraItems, setExtraItems] = useState([]);
  const [fixedItems, setFixedItems] = useState([]);

  const addExtraItem = () => {
    setExtraItems([...extraItems, { id: Date.now(), label: '', amount: '' }]);
  };

  const removeExtraItem = (id) => {
    setExtraItems(extraItems.filter(i => i.id !== id));
  };

  const updateExtraItem = (id, field, value) => {
    setExtraItems(extraItems.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const addFixedItem = () => {
    setFixedItems([...fixedItems, { id: Date.now(), label: '', amount: '' }]);
  };

  const removeFixedItem = (id) => {
    setFixedItems(fixedItems.filter(i => i.id !== id));
  };

  const updateFixedItem = (id, field, value) => {
    setFixedItems(fixedItems.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const costPerHeadVenue = (parseFloat(dishCost) || 0) + (parseFloat(barCost) || 0) + (parseFloat(serviceCost) || 0) +
    extraItems.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);

  const totalFixedCosts = fixedItems.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0);
  const totalVenueCost = costPerHeadVenue * (parseInt(guestCount) || 0) + totalFixedCosts;
  const grandTotal = totalVenueCost + totalExpenses;
  const costPerGuestTotal = (parseInt(guestCount) || 0) > 0 ? grandTotal / (parseInt(guestCount) || 1) : 0;

  return (
    <Card className="shadow-md border-2 border-amber-200">
      <CardHeader className="bg-gradient-to-l from-amber-50 to-white border-b border-amber-100">
        <CardTitle className="flex items-center gap-2 text-amber-900">
          <Calculator className="w-5 h-5 text-amber-600" />
          מחשבון אולם
        </CardTitle>
        <p className="text-sm text-gray-500 mt-1">בדוק עלות חתונה לפי מחיר האולם מבלי לשנות הגדרות</p>
      </CardHeader>
      <CardContent className="pt-6 space-y-5">

        {/* Guest count */}
        <div className="space-y-1">
          <Label>מספר מוזמנים</Label>
          <Input
            type="number"
            min="0"
            value={guestCount}
            onChange={(e) => setGuestCount(e.target.value)}
            placeholder="מספר מוזמנים"
          />
          <p className="text-xs text-gray-400">צפי מוזמנים לפי הגדרות: {totalInvited}</p>
        </div>

        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">עלויות לראש באולם:</p>

          {/* Dish */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label className="text-xs text-gray-500">עלות מנה *</Label>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  value={dishCost}
                  onChange={(e) => setDishCost(e.target.value)}
                  placeholder="לדוגמה: 370"
                  className="pr-3"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₪</span>
              </div>
            </div>
          </div>

          {/* Bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label className="text-xs text-gray-500">שתייה בבר (אופציונלי)</Label>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  value={barCost}
                  onChange={(e) => setBarCost(e.target.value)}
                  placeholder="לדוגמה: 35"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₪</span>
              </div>
            </div>
          </div>

          {/* Service */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <Label className="text-xs text-gray-500">הגשה (אופציונלי)</Label>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  value={serviceCost}
                  onChange={(e) => setServiceCost(e.target.value)}
                  placeholder="לדוגמה: 35"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₪</span>
              </div>
            </div>
          </div>

          {/* Extra items */}
          {extraItems.map((item) => (
            <div key={item.id} className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs text-gray-500">תיאור</Label>
                <Input
                  type="text"
                  value={item.label}
                  onChange={(e) => updateExtraItem(item.id, 'label', e.target.value)}
                  placeholder="לדוגמה: עוגה"
                />
              </div>
              <div className="w-32">
                <Label className="text-xs text-gray-500">סכום לראש</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    value={item.amount}
                    onChange={(e) => updateExtraItem(item.id, 'amount', e.target.value)}
                    placeholder="₪"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₪</span>
                </div>
              </div>
              <button onClick={() => removeExtraItem(item.id)} className="mb-1 p-2 hover:bg-red-50 rounded-lg">
                <X className="w-4 h-4 text-red-500" />
              </button>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addExtraItem} className="w-full border-dashed border-amber-300 text-amber-700 hover:bg-amber-50">
            <Plus className="w-4 h-4 ml-1" />
            הוסף סעיף לראש
          </Button>
        </div>

        {/* Fixed global costs */}
        <div className="border-t pt-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">עלויות גלובליות (סכום קבוע):</p>
          <p className="text-xs text-gray-400">עלויות שאינן תלויות במספר האורחים, כגון תאורה, הגברה וכד'</p>

          {fixedItems.map((item) => (
            <div key={item.id} className="flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs text-gray-500">תיאור</Label>
                <Input
                  type="text"
                  value={item.label}
                  onChange={(e) => updateFixedItem(item.id, 'label', e.target.value)}
                  placeholder="לדוגמה: תאורה והגברה"
                />
              </div>
              <div className="w-36">
                <Label className="text-xs text-gray-500">סכום כולל</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    value={item.amount}
                    onChange={(e) => updateFixedItem(item.id, 'amount', e.target.value)}
                    placeholder="₪"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₪</span>
                </div>
              </div>
              <button onClick={() => removeFixedItem(item.id)} className="mb-1 p-2 hover:bg-red-50 rounded-lg">
                <X className="w-4 h-4 text-red-500" />
              </button>
            </div>
          ))}

          <Button variant="outline" size="sm" onClick={addFixedItem} className="w-full border-dashed border-blue-300 text-blue-700 hover:bg-blue-50">
            <Plus className="w-4 h-4 ml-1" />
            הוסף עלות גלובלית
          </Button>
        </div>

        {/* Results */}
        <div className="border-t pt-4 space-y-3 bg-gradient-to-br from-amber-50 to-white rounded-xl p-4">
          <p className="text-sm font-bold text-gray-700 mb-3">תוצאות החישוב:</p>

          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">עלות אולם לראש:</span>
            <span className="font-semibold text-amber-800">
              {dishCost || barCost || serviceCost || extraItems.length > 0
                ? `₪${costPerHeadVenue.toLocaleString('he-IL')}`
                : '-'}
            </span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">סך עלות אולם ({guestCount || 0} אנשים):</span>
            <span className="font-semibold">
              {totalVenueCost > 0 ? `₪${totalVenueCost.toLocaleString('he-IL')}` : '-'}
            </span>
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">שאר הוצאות מהמערכת:</span>
            <span className="font-semibold">₪{totalExpenses.toLocaleString('he-IL')}</span>
          </div>

          <div className="border-t border-amber-200 pt-3 flex justify-between items-center">
            <span className="font-bold text-gray-800">סה״כ עלות חתונה:</span>
            <span className="text-xl font-bold text-amber-700">
              {grandTotal > 0 ? `₪${Math.round(grandTotal).toLocaleString('he-IL')}` : '-'}
            </span>
          </div>

          {/* Average cost with color indicator */}
          {(() => {
            const TARGET = 570;
            const WARN = 580;
            const val = Math.round(costPerGuestTotal);
            const isGreen = costPerGuestTotal > 0 && val <= TARGET;
            const isOrange = costPerGuestTotal > 0 && val > TARGET && val <= WARN;
            const isRed = costPerGuestTotal > 0 && val > WARN;
            const bgClass = isGreen ? 'bg-green-100' : isOrange ? 'bg-orange-100' : isRed ? 'bg-red-100' : 'bg-amber-100';
            const textClass = isGreen ? 'text-green-800' : isOrange ? 'text-orange-800' : isRed ? 'text-red-800' : 'text-amber-900';
            const barColor = isGreen ? 'bg-green-500' : isOrange ? 'bg-orange-400' : 'bg-red-500';
            const barWidth = costPerGuestTotal > 0 ? Math.min((val / (TARGET * 1.3)) * 100, 100) : 0;
            const statusText = isGreen ? '✓ בתקציב' : isOrange ? '⚠ קרוב לגבול' : isRed ? '✗ חורג מהתקציב' : '';

            return (
              <div className={`${bgClass} rounded-xl px-3 py-3 space-y-2`}>
                <div className="flex justify-between items-center">
                  <span className={`font-semibold text-sm ${textClass}`}>עלות ממוצעת לראש:</span>
                  <div className="text-left">
                    <span className={`text-xl font-bold ${textClass}`}>
                      {costPerGuestTotal > 0 ? `₪${val.toLocaleString('he-IL')}` : '-'}
                    </span>
                    {statusText && <span className={`text-xs font-medium mr-2 ${textClass}`}>{statusText}</span>}
                  </div>
                </div>
                {costPerGuestTotal > 0 && (
                  <div className="space-y-1">
                    <div className="w-full bg-white/60 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`${barColor} h-2.5 rounded-full transition-all duration-500`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>₪0</span>
                      <span className="font-medium">יעד: ₪{TARGET.toLocaleString('he-IL')}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </CardContent>
    </Card>
  );
}