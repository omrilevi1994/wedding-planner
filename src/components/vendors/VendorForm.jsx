import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';

export default function VendorForm({ open, onClose, vendor, onSave }) {
  const [formData, setFormData] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    category: '',
    estimated_cost: 0,
    total_cost: 0,
    contract_details: '',
    contract_file_url: '',
    notes: ''
  });
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (vendor) {
      setFormData(vendor);
    } else {
      setFormData({
        name: '',
        contact_person: '',
        phone: '',
        email: '',
        category: '',
        estimated_cost: 0,
        total_cost: 0,
        contract_details: '',
        contract_file_url: '',
        notes: ''
      });
    }
  }, [vendor, open]);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      setFormData(prev => ({ ...prev, contract_file_url: result.file_url }));
    } catch (error) {
      alert('שגיאה בהעלאת הקובץ: ' + error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = () => {
    if (!formData.name || !formData.category) {
      alert('אנא מלא את השדות הנדרשים');
      return;
    }
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{vendor ? 'עריכת ספק' : 'הוספת ספק חדש'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>שם הספק *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="שם הספק"
              />
            </div>
            <div className="space-y-2">
              <Label>קטגוריה *</Label>
              <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר קטגוריה" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="צלם">צלם</SelectItem>
                  <SelectItem value="וידאוגרף">וידאוגרף</SelectItem>
                  <SelectItem value="דיג'יי">דיג'יי</SelectItem>
                  <SelectItem value="אולם">אולם</SelectItem>
                  <SelectItem value="קייטרינג">קייטרינג</SelectItem>
                  <SelectItem value="פרחים">פרחים</SelectItem>
                  <SelectItem value="עוגה">עוגה</SelectItem>
                  <SelectItem value="הליכה">הליכה</SelectItem>
                  <SelectItem value="איפור">איפור</SelectItem>
                  <SelectItem value="דקור">דקור</SelectItem>
                  <SelectItem value="הזמנות">הזמנות</SelectItem>
                  <SelectItem value="הנעליים">הנעליים</SelectItem>
                  <SelectItem value="אחר">אחר</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>איש קשר</Label>
              <Input
                value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                placeholder="שם איש הקשר"
              />
            </div>
            <div className="space-y-2">
              <Label>טלפון</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="טלפון"
                dir="ltr"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>אימייל</Label>
            <Input
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="אימייל"
              dir="ltr"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>עלות משוערת</Label>
              <Input
                type="number"
                value={formData.estimated_cost}
                onChange={(e) => setFormData({ ...formData, estimated_cost: Number(e.target.value) })}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>עלות כוללת</Label>
              <Input
                type="number"
                value={formData.total_cost}
                onChange={(e) => setFormData({ ...formData, total_cost: Number(e.target.value) })}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>פרטי חוזה</Label>
            <Textarea
              value={formData.contract_details}
              onChange={(e) => setFormData({ ...formData, contract_details: e.target.value })}
              placeholder="פרטי החוזה"
              className="h-24"
            />
          </div>

          <div className="space-y-2">
            <Label>קובץ חוזה</Label>
            <div className="flex gap-2">
              <Input
                type="file"
                onChange={handleFileUpload}
                disabled={isUploading}
                accept=".pdf,.doc,.docx,.jpg,.png"
              />
              {isUploading && <span className="text-sm text-gray-500">מעלה...</span>}
            </div>
            {formData.contract_file_url && (
              <div className="text-sm text-green-600">
                ✓ קובץ החוזה הועלה בהצלחה
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>הערות</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="הערות נוספות"
              className="h-24"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button onClick={handleSave} className="bg-amber-600 hover:bg-amber-700">
            {vendor ? 'עדכן ספק' : 'הוסף ספק'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}