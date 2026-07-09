import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { wedflow } from '@/api/wedflowClient';
import { useWedding } from '@/lib/WeddingContext';
import { SignedFileLink } from '@/lib/signedFile';
import { Upload } from 'lucide-react';

const CATEGORIES = [
  'אולם', 'דיג\'יי', 'צילום', 'שמלה', 'חליפה', 'טבעות',
  'הזמנות', 'עיצוב', 'אלכוהול', 'רב', 'רכב', 'מתנות', 'אחר'
];

const PAYMENT_METHODS = ['העברה בנקאית', 'אשראי', 'מזומן', 'אחר'];
const PAID_BY_PARTY = ['חתן', 'כלה', 'הורים', 'אחר'];

export default function ExpenseForm({ open, onClose, expense, onSave }) {
  const emptyForm = {
    vendor: '',
    category: 'אחר',
    amount: '',
    status: 'מתוכנן',
    payment_method: 'העברה בנקאית',
    paid_date: '',
    due_date: '',
    probability: 100,
    paid_by_party: 'חתן',
    notes: '',
    receipt_url: '',
    has_deposit: false,
    deposit_amount: '',
    deposit_due_date: '',
    deposit_paid_date: '',
    deposit_status: 'מתוכנן',
  };

  const { activeWeddingId } = useWedding();
  const [formData, setFormData] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (expense) {
      setFormData({
        vendor: expense.vendor || '',
        category: expense.category || 'אחר',
        amount: expense.amount || '',
        status: expense.status || 'מתוכנן',
        payment_method: expense.payment_method || 'העברה בנקאית',
        paid_date: expense.paid_date || '',
        due_date: expense.due_date || '',
        probability: expense.probability || 100,
        paid_by_party: expense.paid_by_party || 'חתן',
        notes: expense.notes || '',
        receipt_url: expense.receipt_url || '',
        has_deposit: expense.has_deposit || false,
        deposit_amount: expense.deposit_amount || '',
        deposit_due_date: expense.deposit_due_date || '',
        deposit_paid_date: expense.deposit_paid_date || '',
        deposit_status: expense.deposit_status || 'מתוכנן',
      });
    } else {
      setFormData(emptyForm);
    }
  }, [expense, open]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_path } = await wedflow.integrations.Core.UploadFile({ file, weddingId: activeWeddingId });
      setFormData({ ...formData, receipt_url: file_path });
    } catch (error) {
      alert('שגיאה בהעלאת קובץ');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.vendor || !formData.amount || parseFloat(formData.amount) <= 0) {
      alert('נא למלא את כל השדות הנדרשים');
      return;
    }

    if (formData.status === 'שולם' && !formData.paid_date) {
      alert('נא להזין תאריך תשלום בפועל');
      return;
    }

    if (formData.has_deposit) {
      if (!formData.deposit_amount || parseFloat(formData.deposit_amount) <= 0) {
        alert('נא להזין סכום מקדמה');
        return;
      }
      if (formData.deposit_status === 'שולם' && !formData.deposit_paid_date) {
        alert('נא להזין תאריך תשלום מקדמה בפועל');
        return;
      }
    }

    onSave({
      ...formData,
      amount: parseFloat(formData.amount),
      deposit_amount: formData.has_deposit && formData.deposit_amount ? parseFloat(formData.deposit_amount) : undefined,
      paid_date: formData.paid_date || null,
      due_date: formData.due_date || null,
      deposit_due_date: formData.deposit_due_date || null,
      deposit_paid_date: formData.deposit_paid_date || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{expense ? 'ערוך הוצאה' : 'הוסף הוצאה חדשה'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vendor">שם ספק / הוצאה *</Label>
              <Input
                id="vendor"
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                placeholder="לדוגמה: אולם אירועים דיאמונד"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">קטגוריה *</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paid_by_party">מי שילם</Label>
              <Select value={formData.paid_by_party} onValueChange={(value) => setFormData({ ...formData, paid_by_party: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAID_BY_PARTY.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.paid_by_party === 'אחר' && (
                <p className="text-xs text-destructive">⚠ הוצאה זו לא תיכלל בחישובי הסה״כ ומחיר המנה</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">סכום (₪) *</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder="0"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">סטטוס *</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="שולם">שולם</SelectItem>
                  <SelectItem value="מתוכנן">מתוכנן</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.status === 'שולם' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="paid_date">תאריך תשלום בפועל *</Label>
                  <Input
                    id="paid_date"
                    type="date"
                    value={formData.paid_date}
                    onChange={(e) => setFormData({ ...formData, paid_date: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment_method">אמצעי תשלום</Label>
                  <Select value={formData.payment_method} onValueChange={(value) => setFormData({ ...formData, payment_method: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map(method => (
                        <SelectItem key={method} value={method}>{method}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {formData.status === 'מתוכנן' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="due_date">תאריך יעד לתשלום</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="probability">הסתברות להתממשות: {formData.probability}%</Label>
                  <Slider
                    id="probability"
                    value={[formData.probability]}
                    onValueChange={([value]) => setFormData({ ...formData, probability: value })}
                    min={0}
                    max={100}
                    step={5}
                  />
                </div>
              </>
            )}
          </div>

          {/* Deposit Section */}
          <div className="border rounded-xl p-4 space-y-3 bg-taupe/15">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="has_deposit"
                checked={formData.has_deposit}
                onChange={(e) => setFormData({ ...formData, has_deposit: e.target.checked })}
                className="w-4 h-4 accent-taupe"
              />
              <Label htmlFor="has_deposit" className="cursor-pointer font-semibold text-taupe">פיצול לתשלומים: מקדמה + יתרה</Label>
            </div>

            {formData.has_deposit && (
              <div className="space-y-3 pt-2">
                {/* Deposit */}
                <p className="text-xs font-bold text-taupe uppercase tracking-wide">מקדמה</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">סכום מקדמה (₪) *</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.deposit_amount}
                      onChange={(e) => setFormData({ ...formData, deposit_amount: e.target.value })}
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">סטטוס מקדמה</Label>
                    <Select value={formData.deposit_status} onValueChange={(v) => setFormData({ ...formData, deposit_status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="מתוכנן">מתוכנן</SelectItem>
                        <SelectItem value="שולם">שולם</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    {formData.deposit_status === 'שולם' ? (
                      <>
                        <Label className="text-xs">תאריך תשלום מקדמה *</Label>
                        <Input type="date" value={formData.deposit_paid_date} onChange={(e) => setFormData({ ...formData, deposit_paid_date: e.target.value })} />
                      </>
                    ) : (
                      <>
                        <Label className="text-xs">תאריך יעד למקדמה</Label>
                        <Input type="date" value={formData.deposit_due_date} onChange={(e) => setFormData({ ...formData, deposit_due_date: e.target.value })} />
                      </>
                    )}
                  </div>
                </div>

                {/* Remainder */}
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide pt-1">יתרה</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">סכום יתרה (₪)</Label>
                    <Input
                      type="number"
                      value={
                        formData.amount && formData.deposit_amount
                          ? Math.max(0, parseFloat(formData.amount) - parseFloat(formData.deposit_amount)).toFixed(2)
                          : ''
                      }
                      readOnly
                      className="bg-muted text-muted-foreground"
                      placeholder="מחושב אוטומטית"
                    />
                  </div>
                  <div className="text-xs text-muted-foreground flex items-end pb-2">
                    מחושב אוטומטית: סה״כ פחות המקדמה
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">הערות</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="הערות נוספות..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="receipt">קובץ קבלה / מסמך</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById('receipt').click()}
                disabled={uploading}
                className="flex-1"
              >
                <Upload className="w-4 h-4 ml-2" />
                {uploading ? 'מעלה...' : 'העלה קובץ'}
              </Button>
              {formData.receipt_url && (
                <SignedFileLink
                  path={formData.receipt_url}
                  className="text-sm text-primary hover:underline flex items-center"
                >
                  צפה בקובץ
                </SignedFileLink>
              )}
            </div>
            <input
              id="receipt"
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="submit"
              className="flex-1 bg-gradient-to-l from-rose to-rose-deep hover:from-rose-deep hover:to-rose-deep"
            >
              {expense ? 'עדכן' : 'הוסף'} הוצאה
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