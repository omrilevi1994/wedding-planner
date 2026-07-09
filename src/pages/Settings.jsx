import React, { useState, useEffect } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, CheckCircle } from 'lucide-react';
import { useWedding } from '@/lib/WeddingContext';
import DangerZone from '@/components/settings/DangerZone';

export default function Settings() {
  const queryClient = useQueryClient();
  const { activeWedding, activeWeddingId, refreshWeddings, user, refreshProfile } = useWedding();
  const [formData, setFormData] = useState({
    wedding_date: '',
    venue: '',
    event_manager_name: '',
    reception_time: '',
    ceremony_time: '',
    budget_target: '',
    expected_guests: '',
    currency: '₪',
    cost_calc_mode: 'confirmed'
  });
  const [saved, setSaved] = useState(false);
  const [toursReset, setToursReset] = useState(false);

  const handleReplayTours = async () => {
    try {
      await wedflow.entities.User.update(user.id, { tours_seen: {} });
      await refreshProfile();
      setToursReset(true);
      setTimeout(() => setToursReset(false), 3000);
    } catch (e) {
      console.error('Failed to reset tours', e);
    }
  };

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings', activeWeddingId],
    queryFn: async () => {
      const list = await wedflow.entities.WeddingSetting.filter({ wedding_id: activeWeddingId });
      return list[0] || null;
    },
    enabled: !!activeWeddingId
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        wedding_date: settings.wedding_date || '',
        venue: settings.venue || '',
        event_manager_name: settings.event_manager_name || '',
        reception_time: settings.reception_time || '',
        ceremony_time: settings.ceremony_time || '',
        budget_target: settings.budget_target || '',
        expected_guests: settings.expected_guests || '',
        currency: settings.currency || '₪',
        cost_calc_mode: settings.cost_calc_mode || 'confirmed'
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const scoped = { ...data, wedding_id: activeWeddingId };
      if (settings?.id) {
        return await wedflow.entities.WeddingSetting.update(settings.id, scoped);
      } else {
        return await wedflow.entities.WeddingSetting.create(scoped);
      }
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries(['settings']);
      // Also sync to the Wedding entity
      if (activeWeddingId) {
        try {
          await wedflow.entities.Wedding.update(activeWeddingId, {
            wedding_date: result.wedding_date,
            venue: result.venue,
            event_manager_name: result.event_manager_name,
            reception_time: result.reception_time,
            ceremony_time: result.ceremony_time,
            budget_target: result.budget_target,
            expected_guests: result.expected_guests,
            currency: result.currency,
            cost_calc_mode: result.cost_calc_mode
          });
          queryClient.invalidateQueries(['weddings']);
          await refreshWeddings();
        } catch (e) { /* ignore */ }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      // Log activity
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'עדכון הגדרות',
        entity_type: 'WeddingSetting',
        entity_id: result.id,
        entity_name: 'הגדרות חתונה',
        description: `עדכן הגדרות חתונה - תאריך: ${result.wedding_date}, תקציב: ₪${result.budget_target?.toLocaleString('he-IL')}`
      });
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate({
      ...formData,
      venue: formData.venue || null,
      event_manager_name: formData.event_manager_name || null,
      reception_time: formData.reception_time || null,
      ceremony_time: formData.ceremony_time || null,
      budget_target: parseFloat(formData.budget_target) || 0,
      expected_guests: formData.expected_guests ? parseInt(formData.expected_guests) : null
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">טוען...</div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">הגדרות</h1>
        <p className="text-muted-foreground">נהל את הגדרות החתונה שלך</p>
      </div>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>הגדרות חתונה</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="wedding_date">תאריך החתונה *</Label>
              <Input
                id="wedding_date"
                type="date"
                value={formData.wedding_date}
                onChange={(e) => setFormData({ ...formData, wedding_date: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="venue">מקום האירוע</Label>
              <Input
                id="venue"
                type="text"
                value={formData.venue}
                onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                placeholder="אולם / גן אירועים"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="event_manager_name">מנהל אירוע מטעם האולם</Label>
              <Input
                id="event_manager_name"
                type="text"
                value={formData.event_manager_name}
                onChange={(e) => setFormData({ ...formData, event_manager_name: e.target.value })}
                placeholder="שם מנהל האירוע"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="reception_time">שעת קבלת פנים</Label>
                <Input
                  id="reception_time"
                  type="text"
                  value={formData.reception_time}
                  onChange={(e) => setFormData({ ...formData, reception_time: e.target.value })}
                  placeholder="לדוגמה: 11:30"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ceremony_time">שעת חופה</Label>
                <Input
                  id="ceremony_time"
                  type="text"
                  value={formData.ceremony_time}
                  onChange={(e) => setFormData({ ...formData, ceremony_time: e.target.value })}
                  placeholder="לדוגמה: 13:00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="budget_target">תקציב יעד (₪) *</Label>
              <Input
                id="budget_target"
                type="number"
                min="0"
                step="100"
                value={formData.budget_target}
                onChange={(e) => setFormData({ ...formData, budget_target: e.target.value })}
                placeholder="לדוגמה: 250000"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expected_guests">צפי מספר מוזמנים (אופציונלי)</Label>
              <Input
                id="expected_guests"
                type="number"
                min="0"
                step="1"
                value={formData.expected_guests}
                onChange={(e) => setFormData({ ...formData, expected_guests: e.target.value })}
                placeholder="לדוגמה: 250"
              />
              <p className="text-xs text-muted-foreground">
                שדה זה ישמש לחישוב עלות ממוצעת למוזמן לפי צפי
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="currency">מטבע</Label>
              <Input
                id="currency"
                type="text"
                value={formData.currency}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                placeholder="₪"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cost_calc_mode">חישוב עלות למוזמן לפי:</Label>
              <Select
                value={formData.cost_calc_mode}
                onValueChange={(value) => setFormData({ ...formData, cost_calc_mode: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="confirmed">מאושרים בלבד</SelectItem>
                  <SelectItem value="invited">כל המוזמנים</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                בחר איך לחשב את העלות הממוצעת למוזמן בדשבורד
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                className="bg-gradient-to-l from-rose to-rose-deep hover:from-rose-deep hover:to-rose-deep"
              >
                {saveMutation.isPending ? (
                  'שומר...'
                ) : (
                  <>
                    <Save className="w-4 h-4 ml-2" />
                    שמור הגדרות
                  </>
                )}
              </Button>
              {saved && (
                <div className="flex items-center gap-2 text-sage-deep text-sm">
                  <CheckCircle className="w-4 h-4" />
                  נשמר בהצלחה!
                </div>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-md bg-gradient-to-br from-champagne to-card border-taupe/40">
        <CardHeader>
          <CardTitle>טיפים שימושיים</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-foreground">
          <p>💡 <strong>תקציב יעד:</strong> זהו הסכום המקסימלי שאתם מתכננים להוציא על החתונה</p>
          <p>💡 <strong>חישוב עלות:</strong> בחרו "מאושרים בלבד" לחישוב מדויק יותר, או "כל המוזמנים" לתחזית שמרנית</p>
          <p>💡 <strong>עדכון שוטף:</strong> עדכנו את ההגדרות ככל שהתוכניות משתנות</p>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>מדריכי שימוש</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            אפסו את המדריכים כדי לראות שוב את סיורי ההיכרות בכל עמוד.
          </p>
          <Button type="button" variant="outline" onClick={handleReplayTours}>
            {toursReset ? 'המדריכים אופסו!' : 'הצג מדריכים מחדש'}
          </Button>
        </CardContent>
      </Card>

      <DangerZone />
    </div>
  );
}