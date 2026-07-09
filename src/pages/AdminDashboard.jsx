import React, { useRef, useState } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { supabase } from '@/lib/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWedding } from '@/lib/WeddingContext';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Heart, Calendar, MapPin, Users, Trash2, Settings, UserCog, Search, CalendarCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { seedDefaultChecklist } from '@/lib/defaultChecklist';
import { seedDefaultVenueElements } from '@/lib/defaultVenueElements';

export default function AdminDashboard() {
  const { weddings, refreshWeddings, selectWedding, activeWeddingId, isPlatformAdmin } = useWedding();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ couple_names: '', wedding_date: '', venue: '', budget_target: '', expected_guests: '' });
  const creatingRef = useRef(false);

  // Per-wedding membership (platform admin sees all via RLS); joined to profiles for display names
  const { data: members = [] } = useQuery({
    queryKey: ['all-wedding-members'],
    queryFn: async () => {
      const { data } = await supabase
        .from('wedding_members')
        .select('wedding_id, role, user_id, profiles(full_name, email)');
      return data || [];
    }
  });

  const createWeddingMutation = useMutation({
    mutationFn: async (data) => {
      const wedding = await wedflow.entities.Wedding.create({ ...data, owner_id: user.id });
      // Platform admins aren't automatically wedding members; add them as
      // owner so they can see/manage the wedding via the membership-scoped RLS policies.
      const { error: mErr } = await supabase.from('wedding_members')
        .insert({ wedding_id: wedding.id, user_id: user.id, role: 'owner' });
      if (mErr) throw mErr;
      // Create matching WeddingSetting so Settings page is pre-populated
      await wedflow.entities.WeddingSetting.create({
        wedding_id: wedding.id,
        wedding_date: data.wedding_date,
        venue: data.venue || null,
        budget_target: data.budget_target || 0,
        expected_guests: data.expected_guests || null,
        currency: data.currency || '₪',
        cost_calc_mode: data.cost_calc_mode || 'confirmed'
      });
      await seedDefaultChecklist(wedding.id);
      await seedDefaultVenueElements(wedding.id);
      return wedding;
    },
    onSuccess: async () => {
      await refreshWeddings();
      queryClient.invalidateQueries(['users']);
      queryClient.invalidateQueries(['settings']);
      setShowCreateDialog(false);
      setForm({ couple_names: '', wedding_date: '', venue: '', budget_target: '', expected_guests: '' });
      creatingRef.current = false;
    },
    onError: () => {
      creatingRef.current = false;
    }
  });

  const deleteWeddingMutation = useMutation({
    mutationFn: (id) => wedflow.entities.Wedding.delete(id),
    onSuccess: async () => {
      await refreshWeddings();
    }
  });

  const handleCreate = () => {
    if (!form.couple_names || !form.wedding_date) return;
    if (creatingRef.current) return;
    creatingRef.current = true;
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

  const totalUsers = new Set(members.map(m => m.user_id)).size;
  const activeCount = weddings.filter(w => w.status === 'active').length;
  const query = search.trim().toLowerCase();
  const filteredWeddings = query
    ? weddings.filter(w =>
        (w.couple_names || '').toLowerCase().includes(query) ||
        (w.venue || '').toLowerCase().includes(query))
    : weddings;

  if (!isPlatformAdmin) {
    return (
      <div className="text-center py-16" dir="rtl">
        <Heart className="w-14 h-14 mx-auto mb-3 text-muted-foreground" />
        <p className="text-lg text-muted-foreground">אין לך הרשאה לדף זה</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-1">ניהול חתונות</h1>
          <p className="text-muted-foreground text-sm">צור חתונה חדשה, הזמן את בעל האירוע, ונהל את כל החתונות במערכת</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} className="bg-gradient-to-l from-rose to-rose-deep hover:from-rose-deep hover:to-rose-deep">
          <Plus className="w-4 h-4 ml-1" />
          צור חתונה חדשה
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="bg-rose/15 p-2.5 rounded-lg">
            <Heart className="w-5 h-5 text-rose-deep" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{weddings.length}</p>
            <p className="text-sm text-muted-foreground">סה"כ חתונות</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="bg-taupe/15 p-2.5 rounded-lg">
            <Users className="w-5 h-5 text-taupe" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{totalUsers}</p>
            <p className="text-sm text-muted-foreground">סה"כ משתמשים</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="bg-sage/15 p-2.5 rounded-lg">
            <CalendarCheck className="w-5 h-5 text-sage-deep" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{activeCount}</p>
            <p className="text-sm text-muted-foreground">חתונות פעילות</p>
          </div>
        </Card>
      </div>

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש לפי שמות בני הזוג או מקום..."
          className="pr-9"
        />
      </div>

      {weddings.length === 0 ? (
        <Card className="p-12 text-center">
          <Heart className="w-14 h-14 mx-auto mb-3 text-muted-foreground" />
          <p className="text-lg text-muted-foreground mb-1">אין חתונות עדיין</p>
          <p className="text-sm text-muted-foreground">צור חתונה ראשונה כדי להתחיל</p>
        </Card>
      ) : filteredWeddings.length === 0 ? (
        <Card className="p-12 text-center">
          <Search className="w-14 h-14 mx-auto mb-3 text-muted-foreground" />
          <p className="text-lg text-muted-foreground">לא נמצאו חתונות תואמות לחיפוש</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredWeddings.map(wedding => {
            const weddingUsers = members.filter(m => m.wedding_id === wedding.id);
            const eventOwner = weddingUsers.find(m => m.role === 'owner');
            const dayManager = weddingUsers.find(m => m.role === 'event_manager');
            const isActive = wedding.id === activeWeddingId;

            return (
              <Card key={wedding.id} className={`p-5 hover:shadow-lg transition-all ${isActive ? 'ring-2 ring-primary' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-gradient-to-br from-rose-light to-rose p-2.5 rounded-lg">
                      <Heart className="w-6 h-6 text-rose-deep" fill="currentColor" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground text-lg">{wedding.couple_names}</h3>
                      <div className="flex items-center gap-1.5">
                        {wedding.status === 'archived' && <Badge variant="outline" className="bg-muted text-muted-foreground">מוקפא</Badge>}
                        {wedding.plan && (
                          <Badge variant="outline" className={wedding.plan === 'premium' ? 'bg-champagne text-rose-deep border-primary' : 'bg-muted text-muted-foreground'}>
                            {wedding.plan}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5 text-sm text-muted-foreground mb-4">
                  {wedding.wedding_date && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      {new Date(wedding.wedding_date).toLocaleDateString('he-IL')}
                    </div>
                  )}
                  {wedding.venue && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      {wedding.venue}
                    </div>
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      {weddingUsers.length} משתמשים
                    </div>
                    {eventOwner && (
                      <div className="flex items-center gap-2">
                        <UserCog className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs">בעל אירוע: {eventOwner.profiles?.full_name || eventOwner.profiles?.email}</span>
                      </div>
                    )}
                    {dayManager && (
                      <div className="flex items-center gap-2">
                        <Settings className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs">מנהל חתונה: {dayManager.profiles?.full_name || dayManager.profiles?.email}</span>
                      </div>
                    )}
                    {!eventOwner && !dayManager && (
                      <div className="flex items-center gap-2">
                        <UserCog className="w-4 h-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">אין בעל אירוע</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 bg-primary hover:bg-primary-hover" onClick={() => handleEnterWedding(wedding.id)}>
                    <Settings className="w-3.5 h-3.5 ml-1" />
                    כניסה לחתונה
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { selectWedding(wedding.id); navigate(createPageUrl('UserManagement')); }} title="נהל משתמשים">
                    <UserCog className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => handleDelete(wedding)}>
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
            <Button onClick={handleCreate} disabled={!form.couple_names || !form.wedding_date || createWeddingMutation.isPending} className="bg-primary hover:bg-primary-hover">
              {createWeddingMutation.isPending ? 'יוצר...' : 'צור חתונה'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}