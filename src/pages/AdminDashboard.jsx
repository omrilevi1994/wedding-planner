import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWedding } from '@/lib/WeddingContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Heart, Calendar, MapPin, Users, Trash2, Settings, UserCog } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function AdminDashboard() {
  const { weddings, refreshWeddings, selectWedding, activeWeddingId } = useWedding();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [form, setForm] = useState({ couple_names: '', wedding_date: '', venue: '', budget_target: '', expected_guests: '' });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list('-created_date')
  });

  const createWeddingMutation = useMutation({
    mutationFn: async (data) => {
      const wedding = await base44.entities.Wedding.create(data);
      // Create matching WeddingSetting so Settings page is pre-populated
      await base44.entities.WeddingSetting.create({
        wedding_id: wedding.id,
        wedding_date: data.wedding_date,
        venue: data.venue || null,
        budget_target: data.budget_target || 0,
        expected_guests: data.expected_guests || null,
        currency: data.currency || '₪',
        cost_calc_mode: data.cost_calc_mode || 'confirmed'
      });
      return wedding;
    },
    onSuccess: async () => {
      await refreshWeddings();
      queryClient.invalidateQueries(['users']);
      queryClient.invalidateQueries(['settings']);
      setShowCreateDialog(false);
      setForm({ couple_names: '', wedding_date: '', venue: '', budget_target: '', expected_guests: '' });
    }
  });

  const deleteWeddingMutation = useMutation({
    mutationFn: (id) => base44.entities.Wedding.delete(id),
    onSuccess: async () => {
      await refreshWeddings();
    }
  });

  const handleCreate = () => {
    if (!form.couple_names || !form.wedding_date) return;
    createWeddingMutation.mutate({
      couple_names: form.couple_names,
      wedding_date: form.wedding_date,
      venue: form.venue || null,
      budget_target: form.budget_target ? parseFloat(form.budget_target) : null,
      expected_guests: form.expected_guests ? parseInt(form.expected_guests) : null,
      currency: '₪',
      cost_calc_mode: 'confirmed',
      status: 'active'
    });
  };

  const handleDelete = (wedding) => {
    if (!window.confirm(`למחוק את החתונה של "${wedding.couple_names}"?\nשים לב: הנתונים של החתונה (מוזמנים, הוצאות וכו') לא יימחקו אוטומטית.`)) return;
    deleteWeddingMutation.mutate(wedding.id);
  };

  const handleEnterWedding = (weddingId) => {
    selectWedding(weddingId);
    navigate(createPageUrl('Dashboard'));
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-1">ניהול חתונות</h1>
          <p className="text-gray-500 text-sm">צור חתונה חדשה, הזמן את בעל האירוע, ונהל את כל החתונות במערכת</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700">
          <Plus className="w-4 h-4 ml-1" />
          צור חתונה חדשה
        </Button>
      </div>

      {weddings.length === 0 ? (
        <Card className="p-12 text-center">
          <Heart className="w-14 h-14 mx-auto mb-3 text-gray-300" />
          <p className="text-lg text-gray-500 mb-1">אין חתונות עדיין</p>
          <p className="text-sm text-gray-400">צור חתונה ראשונה כדי להתחיל</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {weddings.map(wedding => {
            const weddingUsers = users.filter(u => u.wedding_id === wedding.id);
            const eventOwner = weddingUsers.find(u => u.role === 'user' && (!u.wedding_sides || u.wedding_sides.length === 0));
            const dayManager = weddingUsers.find(u => u.role === 'event_manager');
            const isActive = wedding.id === activeWeddingId;

            return (
              <Card key={wedding.id} className={`p-5 hover:shadow-lg transition-all ${isActive ? 'ring-2 ring-amber-400' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-gradient-to-br from-amber-100 to-amber-200 p-2.5 rounded-lg">
                      <Heart className="w-6 h-6 text-amber-700" fill="currentColor" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 text-lg">{wedding.couple_names}</h3>
                      {wedding.status === 'archived' && <Badge variant="outline" className="bg-gray-100 text-gray-600">מוקפא</Badge>}
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm text-gray-600 mb-4">
                  {wedding.wedding_date && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      {new Date(wedding.wedding_date).toLocaleDateString('he-IL')}
                    </div>
                  )}
                  {wedding.venue && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
                      {wedding.venue}
                    </div>
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-400" />
                      {weddingUsers.length} משתמשים
                    </div>
                    {eventOwner && (
                      <div className="flex items-center gap-2">
                        <UserCog className="w-4 h-4 text-gray-400" />
                        <span className="text-xs">בעל אירוע: {eventOwner.full_name || eventOwner.email}</span>
                      </div>
                    )}
                    {dayManager && (
                      <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-gray-400" />
                        <span className="text-xs">מנהל חתונה: {dayManager.full_name || dayManager.email}</span>
                      </div>
                    )}
                    {!eventOwner && !dayManager && (
                      <div className="flex items-center gap-2">
                        <UserCog className="w-4 h-4 text-gray-400" />
                        <span className="text-xs text-gray-400">אין בעל אירוע</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 bg-amber-600 hover:bg-amber-700" onClick={() => handleEnterWedding(wedding.id)}>
                    <Settings className="w-3.5 h-3.5 ml-1" />
                    כניסה לחתונה
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { selectWedding(wedding.id); navigate(createPageUrl('UserManagement')); }} title="נהל משתמשים">
                    <UserCog className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => handleDelete(wedding)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>צור חתונה חדשה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>שמות בני הזוג *</Label>
              <Input value={form.couple_names} onChange={e => setForm({ ...form, couple_names: e.target.value })} placeholder="לדוגמא: דניאל ועומרי" />
            </div>
            <div className="space-y-2">
              <Label>תאריך חתונה *</Label>
              <Input type="date" value={form.wedding_date} onChange={e => setForm({ ...form, wedding_date: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>מקום האירוע</Label>
              <Input value={form.venue} onChange={e => setForm({ ...form, venue: e.target.value })} placeholder="אולם / גן אירועים" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>תקציב יעד (₪)</Label>
                <Input type="number" value={form.budget_target} onChange={e => setForm({ ...form, budget_target: e.target.value })} placeholder="0" min="0" />
              </div>
              <div className="space-y-2">
                <Label>צפי מוזמנים</Label>
                <Input type="number" value={form.expected_guests} onChange={e => setForm({ ...form, expected_guests: e.target.value })} placeholder="0" min="0" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>ביטול</Button>
            <Button onClick={handleCreate} disabled={!form.couple_names || !form.wedding_date || createWeddingMutation.isLoading} className="bg-amber-600 hover:bg-amber-700">
              {createWeddingMutation.isLoading ? 'יוצר...' : 'צור חתונה'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}