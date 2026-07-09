import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { pendingPayments } from '@/lib/payments';

export default function MarkPaymentModal({ open, onClose, payments = [], onMarkPaid }) {
  const options = pendingPayments(payments);
  const [selectedId, setSelectedId] = useState('');
  const [paidDate, setPaidDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (open) {
      setSelectedId('');
      setPaidDate(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [open]);

  const selected = options.find(p => p.id === selectedId);

  const handleConfirm = () => {
    if (!selected || !paidDate) return;
    onMarkPaid({ payment: selected, paidDate });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>סמן תשלום שבוצע</DialogTitle>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            אין תשלומים מתוכננים לסימון
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">תשלום</label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר תשלום" />
                </SelectTrigger>
                <SelectContent>
                  {options.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.expense_vendor} — ₪{(p.amount || 0).toLocaleString('he-IL')} (יעד: {format(parseISO(p.due_date), 'dd/MM/yyyy')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">תאריך תשלום בפועל</label>
              <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>ביטול</Button>
              <Button type="button" onClick={handleConfirm} disabled={!selected || !paidDate}>
                סמן כשולם
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
