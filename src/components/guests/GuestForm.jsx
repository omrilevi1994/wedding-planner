import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useWedding } from '@/lib/WeddingContext';

export default function GuestForm({ open, onClose, guest, onSave }) {
  const { user } = useWedding();
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    side: '',
    relationship: 'משפחה',
    status: '',
    total_people: 1,
    gift_amount: '',
    notes: ''
  });

  // Determine available sides based on user permissions
  const availableSides = React.useMemo(() => {
    if (!user?.wedding_sides || user.wedding_sides.length === 0) {
      // Full access - all sides including "משותף"
      return ['חתן', 'חתן - אבא', 'חתן - אמא', 'כלה', 'כלה - אבא', 'כלה - אמא', 'משותף'];
    }

    // Show only exact sides the user has permission for
    return user.wedding_sides;
  }, [user]);

  useEffect(() => {
    if (guest) {
      setFormData({
        first_name: guest.first_name || '',
        last_name: guest.last_name || '',
        phone: guest.phone || '',
        side: guest.side || '',
        relationship: guest.relationship || 'משפחה',
        status: guest.status || '',
        total_people: guest.total_people || 1,
        gift_amount: guest.gift_amount || '',
        notes: guest.notes || ''
      });
    } else {
      setFormData({
        first_name: '',
        last_name: '',
        phone: '',
        side: availableSides[0] || '',
        relationship: 'משפחה',
        status: '',
        total_people: 1,
        gift_amount: '',
        notes: ''
      });
    }
  }, [guest, open, availableSides]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.first_name || !formData.last_name) {
      alert('נא למלא שם פרטי ושם משפחה');
      return;
    }
    
    onSave({
      ...formData,
      total_people: parseInt(formData.total_people) || 1,
      gift_amount: formData.gift_amount !== '' ? parseFloat(formData.gift_amount) : undefined
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>{guest ? 'ערוך מוזמן' : 'הוסף מוזמן חדש'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">שם פרטי *</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                placeholder="שם פרטי"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="last_name">שם משפחה *</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                placeholder="שם משפחה"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">טלפון</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="050-1234567"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="side">צד *</Label>
              <Select value={formData.side} onValueChange={(value) => setFormData({ ...formData, side: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableSides.map(side => (
                    <SelectItem key={side} value={side}>{side}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="relationship">קרבה</Label>
              <Select value={formData.relationship} onValueChange={(value) => setFormData({ ...formData, relationship: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="משפחה">משפחה</SelectItem>
                  <SelectItem value="חברים">חברים</SelectItem>
                  <SelectItem value="עבודה">עבודה</SelectItem>
                  <SelectItem value="לימודים">לימודים</SelectItem>
                  <SelectItem value="שכנים">שכנים</SelectItem>
                  <SelectItem value="אחר">אחר</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">סטטוס</Label>
              <Select value={formData.status || 'none'} onValueChange={(value) => setFormData({ ...formData, status: value === 'none' ? '' : value })}>
                <SelectTrigger>
                  <SelectValue placeholder="ללא סטטוס" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">ללא סטטוס</SelectItem>
                  <SelectItem value="הוזמן">הוזמן</SelectItem>
                  <SelectItem value="אישר">אישר</SelectItem>
                  <SelectItem value="אולי">אולי</SelectItem>
                  <SelectItem value="לא מגיע">לא מגיע</SelectItem>
                  <SelectItem value="הגיע">הגיע</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="total_people">סך הכל אנשים</Label>
              <Input
                id="total_people"
                type="number"
                min="1"
                max="20"
                value={formData.total_people}
                onChange={(e) => setFormData({ ...formData, total_people: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gift_amount">סכום מתנה (₪)</Label>
            <Input
              id="gift_amount"
              type="number"
              min="0"
              value={formData.gift_amount}
              onChange={(e) => setFormData({ ...formData, gift_amount: e.target.value })}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">הערות</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="אלרגיות, הושבה, ילדים וכו׳..."
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              className="flex-1 bg-gradient-to-l from-rose to-rose-deep hover:from-rose-deep hover:to-rose-deep"
            >
              {guest ? 'עדכן' : 'הוסף'} מוזמן
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              ביטול
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}