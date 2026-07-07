import React, { useState } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { useWedding } from '@/lib/WeddingContext';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Download, Trash2, AlertTriangle } from 'lucide-react';

const BACKUP_ENTITIES = [
  ['wedding', 'Wedding'],
  ['guests', 'Guest'],
  ['tables', 'Table'],
  ['expenses', 'Expense'],
  ['payments', 'Payment'],
  ['gifts', 'Gift'],
  ['vendors', 'Vendor'],
  ['checklist_groups', 'ChecklistGroup'],
  ['checklist_items', 'ChecklistItem'],
  ['wedding_settings', 'WeddingSetting']
];

export default function DangerZone() {
  const {
    activeWedding,
    activeWeddingId,
    activeMembership,
    isPlatformAdmin,
    refreshWeddings,
    selectWedding
  } = useWedding();

  const [exporting, setExporting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const isOwner = activeMembership?.role === 'owner' || isPlatformAdmin;
  const coupleNames = activeWedding?.couple_names || '';

  if (!activeWeddingId) return null;

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = {};
      for (const [key, entityName] of BACKUP_ENTITIES) {
        if (entityName === 'Wedding') {
          data[key] = await wedflow.entities.Wedding.get(activeWeddingId);
        } else {
          data[key] = await wedflow.entities[entityName].filter({ wedding_id: activeWeddingId });
        }
      }
      const backup = { exported_at: new Date().toISOString(), ...data };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().slice(0, 10);
      const namePart = (coupleNames || activeWeddingId).replace(/\s+/g, '-');
      const a = document.createElement('a');
      a.href = url;
      a.download = `wedflow-backup-${namePart}-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Backup export failed:', err);
      alert('שגיאה בייצוא הגיבוי. נסו שוב.');
    } finally {
      setExporting(false);
    }
  };

  const canDelete = coupleNames && confirmText.trim() === coupleNames;

  const handleDelete = async () => {
    if (!canDelete || deleting) return;
    setDeleting(true);
    try {
      await wedflow.entities.Wedding.delete(activeWeddingId);
      localStorage.removeItem('activeWeddingId');
      selectWedding(null);
      await refreshWeddings();
      alert('החתונה נמחקה');
    } catch (err) {
      console.error('Wedding deletion failed:', err);
      alert('שגיאה במחיקת החתונה. נסו שוב.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5 text-rose-deep" />
            גיבוי וייצוא
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            הורידו קובץ JSON הכולל את כל נתוני החתונה: מוזמנים, שולחנות, הוצאות, תשלומים, מתנות, ספקים, צ'קליסטים והגדרות.
          </p>
          <Button
            onClick={handleExport}
            disabled={exporting}
            className="bg-gradient-to-l from-rose to-rose-deep hover:from-rose-deep hover:to-rose-deep"
          >
            <Download className="w-4 h-4 ml-2" />
            {exporting ? 'מייצא...' : 'הורד גיבוי מלא (JSON)'}
          </Button>
        </CardContent>
      </Card>

      {isOwner && (
        <Card className="shadow-md border-destructive/30 bg-gradient-to-br from-destructive/10 to-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              אזור מסוכן
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold text-foreground mb-1">מחיקת חתונה</h3>
              <p className="text-sm text-muted-foreground">
                מחיקת החתונה תסיר לצמיתות את כל הנתונים הקשורים אליה — מוזמנים, שולחנות, הוצאות, תשלומים, מתנות, ספקים, צ'קליסטים והגדרות. פעולה זו אינה ניתנת לביטול. מומלץ להוריד גיבוי מלא לפני המחיקה.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-confirm">
                {'להמשך המחיקה, הקלידו את שם הזוג בדיוק: '}
                <span className="font-bold text-destructive">{coupleNames}</span>
              </Label>
              <Input
                id="delete-confirm"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={coupleNames}
                className="border-destructive/30 focus-visible:ring-destructive/50"
              />
            </div>
            <Button
              onClick={handleDelete}
              disabled={!canDelete || deleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              <Trash2 className="w-4 h-4 ml-2" />
              {deleting ? 'מוחק...' : 'מחק חתונה לצמיתות'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
