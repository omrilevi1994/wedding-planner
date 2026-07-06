import React, { useState } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { supabase } from '@/lib/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWedding } from '@/lib/WeddingContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Heart } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';

const allSides = ['חתן', 'חתן - אבא', 'חתן - אמא', 'כלה', 'כלה - אבא', 'כלה - אמא'];

const ROLE_LABELS = {
  owner: 'בעל האירוע',
  coplanner: 'מתכנן/ת שותפ/ה',
  family: 'בן/בת משפחה',
  event_manager: 'מנהל/ת אירוע'
};

const ROLE_BADGE_STYLES = {
  owner: 'bg-green-100 border-green-200 text-green-800',
  coplanner: 'bg-purple-100 border-purple-200 text-purple-800',
  family: 'bg-blue-100 border-blue-200 text-blue-800',
  event_manager: 'bg-orange-100 border-orange-200 text-orange-800'
};

const INVITABLE_ROLES = ['coplanner', 'family', 'event_manager'];

export default function UserManagement() {
  const { user, isAdmin, isPlatformAdmin, activeMembership, activeWedding, activeWeddingId } = useWedding();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Invite dialog state
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('family');
  const [inviteSides, setInviteSides] = useState([]);
  const [inviteMaxGuests, setInviteMaxGuests] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  // Edit dialog state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [editRole, setEditRole] = useState('family');
  const [editSides, setEditSides] = useState([]);
  const [editMaxGuests, setEditMaxGuests] = useState('');

  const canManage = activeMembership?.role === 'owner' || isPlatformAdmin;

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['weddingMembers', activeWeddingId],
    queryFn: () => wedflow.functions.invoke('getWeddingUsers', { wedding_id: activeWeddingId }),
    enabled: !!activeWeddingId
  });

  const invalidateMembers = () => queryClient.invalidateQueries({ queryKey: ['weddingMembers'] });

  const updateMemberMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const { error } = await supabase.from('wedding_members').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidateMembers,
    onError: (error) => alert('שגיאה בעדכון המשתמש: ' + error.message)
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('wedding_members').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidateMembers,
    onError: (error) => alert('שגיאה בהסרת המשתמש: ' + error.message)
  });

  const toggleSide = (side, setter) => {
    setter(prev => prev.includes(side) ? prev.filter(s => s !== side) : [...prev, side]);
  };

  const resetInviteForm = () => {
    setEmail('');
    setInviteRole('family');
    setInviteSides([]);
    setInviteMaxGuests('');
  };

  const handleInvite = async () => {
    if (!email || !activeWeddingId) return;
    setIsInviting(true);
    try {
      const result = await wedflow.users.inviteUser({
        email,
        wedding_id: activeWeddingId,
        role: inviteRole,
        wedding_sides: inviteRole === 'family' ? inviteSides : [],
        max_guests: inviteRole === 'family' && inviteMaxGuests ? parseInt(inviteMaxGuests) : null
      });
      alert(result?.existing ? 'המשתמש קיים וצורף לחתונה' : 'הזמנה נשלחה במייל');
      invalidateMembers();
      setShowInviteDialog(false);
      resetInviteForm();
    } catch (error) {
      alert('שגיאה בהזמנת משתמש: ' + error.message);
    } finally {
      setIsInviting(false);
    }
  };

  const handleOpenEdit = (member) => {
    setEditingMember(member);
    setEditRole(member.role || 'family');
    setEditSides(member.wedding_sides || []);
    setEditMaxGuests(member.max_guests != null ? String(member.max_guests) : '');
    setShowEditDialog(true);
  };

  const handleSaveEdit = () => {
    if (!editingMember) return;
    updateMemberMutation.mutate({
      id: editingMember.id,
      data: {
        role: editRole,
        wedding_sides: editRole === 'family' ? editSides : [],
        max_guests: editRole === 'family' && editMaxGuests ? parseInt(editMaxGuests) : null
      }
    });
    setShowEditDialog(false);
    setEditingMember(null);
  };

  const handleRemove = (member) => {
    if (member.role === 'owner') return;
    const name = member.profiles?.full_name || member.profiles?.email || 'המשתמש';
    if (confirm(`להסיר את ${name} מהחתונה?`)) {
      removeMemberMutation.mutate(member.id);
    }
  };

  if (!activeWeddingId) {
    return (
      <div className="text-center py-16" dir="rtl">
        <Heart className="w-14 h-14 mx-auto mb-3 text-gray-300" />
        <p className="text-lg text-gray-500">בחר חתונה כדי לנהל את המשתמשים שלה</p>
        {isAdmin && (
          <Button className="mt-4 bg-amber-600 hover:bg-amber-700" onClick={() => navigate(createPageUrl('AdminDashboard'))}>
            לדף ניהול החתונות
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">ניהול משתמשים</h1>
          <p className="text-gray-600">
            משתמשים של החתונה של {activeWedding?.couple_names || ''}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowInviteDialog(true)} className="bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700">
            <Plus className="w-4 h-4 ml-2" />
            הזמן משתמש
          </Button>
        )}
      </div>

      <Card className="overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>שם</TableHead>
                <TableHead>אימייל</TableHead>
                <TableHead>תפקיד</TableHead>
                <TableHead>צדדים</TableHead>
                <TableHead>מכסה</TableHead>
                {canManage && <TableHead>פעולות</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={canManage ? 6 : 5} className="text-center py-8 text-gray-400">טוען...</TableCell></TableRow>
              ) : members.length === 0 ? (
                <TableRow><TableCell colSpan={canManage ? 6 : 5} className="text-center py-8 text-gray-400">אין משתמשים בחתונה זו עדיין</TableCell></TableRow>
              ) : (
                members.map(member => (
                  <TableRow key={member.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">{member.profiles?.full_name || '-'}</TableCell>
                    <TableCell className="text-sm text-gray-600">{member.profiles?.email || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ROLE_BADGE_STYLES[member.role] || 'bg-gray-100 border-gray-200 text-gray-800'}>
                        {ROLE_LABELS[member.role] || member.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {member.wedding_sides && member.wedding_sides.length > 0 ? (
                        <span className="text-sm text-gray-700">{member.wedding_sides.join(', ')}</span>
                      ) : (
                        <span className="text-gray-400 text-sm">גישה מלאה</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {member.max_guests != null ? `${member.max_guests}` : '-'}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {member.role !== 'owner' && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleOpenEdit(member)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="עריכה">
                              <Pencil className="w-4 h-4 text-gray-600" />
                            </button>
                            <button onClick={() => handleRemove(member)} className="p-2 hover:bg-red-50 rounded-lg transition-colors" title="הסרה">
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={(open) => { setShowInviteDialog(open); if (!open) resetInviteForm(); }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>הזמן משתמש לחתונה של {activeWedding?.couple_names || ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>כתובת אימייל</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@email.com" />
            </div>
            <div className="space-y-2">
              <Label>תפקיד</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger dir="rtl">
                  <SelectValue placeholder="בחר תפקיד" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {INVITABLE_ROLES.map(role => (
                    <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {inviteRole === 'family' && (
              <>
                <div className="space-y-2">
                  <Label>צדדים בחתונה</Label>
                  <p className="text-sm text-gray-500 mb-2">אם לא תבחר צדדים, המשתמש יקבל גישה מלאה לכל המוזמנים</p>
                  <div className="space-y-2 border rounded-lg p-3">
                    {allSides.map(side => (
                      <div key={side} className="flex items-center gap-2">
                        <Checkbox id={`invite-${side}`} checked={inviteSides.includes(side)} onCheckedChange={() => toggleSide(side, setInviteSides)} />
                        <label htmlFor={`invite-${side}`} className="text-sm cursor-pointer">{side}</label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>מכסת מוזמנים (אופציונלי)</Label>
                  <Input type="number" min="0" value={inviteMaxGuests} onChange={e => setInviteMaxGuests(e.target.value)} placeholder="למשל: 50" />
                </div>
              </>
            )}
            <div className="flex gap-3 pt-4">
              <Button onClick={handleInvite} disabled={isInviting || !email} className="flex-1 bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700">
                {isInviting ? 'מזמין...' : 'שלח הזמנה'}
              </Button>
              <Button variant="outline" onClick={() => { setShowInviteDialog(false); resetInviteForm(); }}>ביטול</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => { setShowEditDialog(open); if (!open) setEditingMember(null); }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>ערוך משתמש</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>משתמש</Label>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium">{editingMember?.profiles?.full_name || editingMember?.profiles?.email || '-'}</p>
                <p className="text-sm text-gray-500">{editingMember?.profiles?.email || ''}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>תפקיד</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger dir="rtl">
                  <SelectValue placeholder="בחר תפקיד" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {INVITABLE_ROLES.map(role => (
                    <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editRole === 'family' && (
              <>
                <div className="space-y-2">
                  <Label>צדדים בחתונה</Label>
                  <p className="text-sm text-gray-500 mb-2">אם לא תבחר צדדים, המשתמש יקבל גישה מלאה לכל המוזמנים</p>
                  <div className="space-y-2 border rounded-lg p-3">
                    {allSides.map(side => (
                      <div key={side} className="flex items-center gap-2">
                        <Checkbox id={`edit-${side}`} checked={editSides.includes(side)} onCheckedChange={() => toggleSide(side, setEditSides)} />
                        <label htmlFor={`edit-${side}`} className="text-sm cursor-pointer">{side}</label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>מכסת מוזמנים (אופציונלי)</Label>
                  <Input type="number" min="0" value={editMaxGuests} onChange={e => setEditMaxGuests(e.target.value)} placeholder="למשל: 50" />
                </div>
              </>
            )}
            <div className="flex gap-3 pt-4">
              <Button onClick={handleSaveEdit} className="flex-1 bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700">שמור שינויים</Button>
              <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditingMember(null); }}>ביטול</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
