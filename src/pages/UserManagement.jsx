import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useWedding } from '@/lib/WeddingContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Heart, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function UserManagement() {
  const { user, isAdmin, activeWedding, activeWeddingId, selectWedding } = useWedding();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [email, setEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedSides, setSelectedSides] = useState([]);
  const [maxGuests, setMaxGuests] = useState('');
  const [editingRole, setEditingRole] = useState('user');

  const { data: allUsers = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list('-created_date')
  });

  // Users already assigned to the active wedding
  const users = isAdmin
    ? allUsers.filter(u => u.wedding_id === activeWeddingId || (!u.wedding_id && u.role === 'admin'))
    : allUsers.filter(u => u.wedding_id === activeWeddingId);

  // New users who registered but aren't assigned to any wedding yet
  const unassignedUsers = isAdmin
    ? allUsers.filter(u => !u.wedding_id && u.role !== 'admin')
    : [];

  const canManage = isAdmin || user?.role === 'event_manager';

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.User.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(['users'])
  });

  const toggleApprovalMutation = useMutation({
    mutationFn: ({ id, approved }) => base44.entities.User.update(id, { is_approved: approved }),
    onSuccess: () => queryClient.invalidateQueries(['users'])
  });

  const assignToWeddingMutation = useMutation({
    mutationFn: ({ id, approved }) => base44.entities.User.update(id, { wedding_id: activeWeddingId, is_approved: approved }),
    onSuccess: () => queryClient.invalidateQueries(['users'])
  });

  const allSides = ['חתן', 'חתן - אבא', 'חתן - אמא', 'כלה', 'כלה - אבא', 'כלה - אמא'];

  const handleInvite = async () => {
    if (!email || !activeWeddingId) return;
    setIsInviting(true);
    try {
      await base44.users.inviteUser({ email, role: 'user', wedding_id: activeWeddingId });
      // After invite, we can't set wedding_id immediately (user doesn't exist yet).
      // The event owner/admin will assign it after the user logs in.
      alert('ההזמנה נשלחה! לאחר שהמשתמש יתחבר, שייך אותו לחתונה דרך כפתור העריכה.');
      queryClient.invalidateQueries(['users']);
      setShowInviteDialog(false);
      setEmail('');
    } catch (error) {
      alert('שגיאה בהזמנת משתמש: ' + error.message);
    } finally {
      setIsInviting(false);
    }
  };

  const handleToggleSide = (side) => {
    setSelectedSides(prev => prev.includes(side) ? prev.filter(s => s !== side) : [...prev, side]);
  };

  const handleOpenEdit = (u) => {
    setEditingUser(u);
    setSelectedSides(u.wedding_sides || []);
    setMaxGuests(u.max_guests || '');
    setEditingRole(u.role || 'user');
    setShowEditDialog(true);
  };

  const handleSaveEdit = () => {
    if (!editingUser) return;
    const updateData = {
      wedding_sides: selectedSides.length > 0 ? selectedSides : null,
      wedding_id: activeWeddingId
    };
    if (maxGuests && editingRole !== 'admin') {
      updateData.max_guests = parseInt(maxGuests);
    }
    updateUserMutation.mutate({ id: editingUser.id, data: updateData });
    setShowEditDialog(false);
    setEditingUser(null);
    setSelectedSides([]);
    setMaxGuests('');
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

      {canManage && unassignedUsers.length > 0 && (
        <Card className="overflow-hidden shadow-md border-amber-200">
          <div className="bg-amber-50 px-5 py-3 border-b border-amber-200">
            <h2 className="font-bold text-amber-900 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              משתמשים חדשים הממתינים לשיוך ({unassignedUsers.length})
            </h2>
            <p className="text-xs text-amber-700 mt-1">משתמשים אלו נרשמו אך טרם שויכו לחתונה. שייך אותם לחתונה הפעילה.</p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>שם</TableHead>
                  <TableHead>אימייל</TableHead>
                  <TableHead>סטטוס</TableHead>
                  <TableHead>פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unassignedUsers.map(u => (
                  <TableRow key={u.id} className="hover:bg-amber-50/50">
                    <TableCell className="font-medium">{u.full_name || '-'}</TableCell>
                    <TableCell className="text-sm text-gray-600">{u.email}</TableCell>
                    <TableCell>
                      {u.is_approved ? (
                        <Badge className="bg-green-100 text-green-800 border-green-200">מאושר</Badge>
                      ) : (
                        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">ממתין לאישור</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => assignToWeddingMutation.mutate({ id: u.id, approved: true })} className="bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700">
                        <ArrowRight className="w-3.5 h-3.5 ml-1" />
                        שייך לחתונה זו
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>שם</TableHead>
                <TableHead>אימייל</TableHead>
                <TableHead>תפקיד</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>צדדים</TableHead>
                <TableHead>מכסה</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-400">טוען...</TableCell></TableRow>
              ) : users.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-400">אין משתמשים בחתונה זו עדיין</TableCell></TableRow>
              ) : (
                users.map(u => (
                  <TableRow key={u.id} className="hover:bg-gray-50">
                    <TableCell className="font-medium">{u.full_name || '-'}</TableCell>
                    <TableCell className="text-sm text-gray-600">{u.email}</TableCell>
                    <TableCell>
                      {u.role === 'admin' ? (
                        <Badge variant="outline" className="bg-purple-100 border-purple-200 text-purple-800">מנהל על</Badge>
                      ) : u.role === 'event_manager' ? (
                        <Badge variant="outline" className="bg-orange-100 border-orange-200 text-orange-800">מנהל חתונה</Badge>
                      ) : (!u.wedding_sides || u.wedding_sides.length === 0) ? (
                        <Badge variant="outline" className="bg-green-100 border-green-200 text-green-800">בעל אירוע</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-100 border-blue-200 text-blue-800">מוזמן</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.role === 'admin' || u.is_approved ? (
                        <Badge className="bg-green-100 text-green-800 border-green-200">מאושר</Badge>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">ממתין</Badge>
                          {canManage && (
                            <Button size="sm" onClick={() => toggleApprovalMutation.mutate({ id: u.id, approved: true })} className="bg-green-600 hover:bg-green-700 text-xs h-7">אשר</Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.wedding_sides && u.wedding_sides.length > 0 ? (
                          u.wedding_sides.map(side => <Badge key={side} className="bg-amber-100 text-amber-800 border-amber-200">{side}</Badge>)
                        ) : (
                          <span className="text-gray-400 text-sm">גישה מלאה</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {u.role === 'admin' ? '-' : (u.max_guests ? `${u.max_guests}` : '-')}
                    </TableCell>
                    <TableCell>
                      {canManage && u.role !== 'admin' && (
                        <button onClick={() => handleOpenEdit(u)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                          <Pencil className="w-4 h-4 text-gray-600" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>הזמן משתמש לחתונה של {activeWedding?.couple_names || ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>כתובת אימייל</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="example@email.com" />
              <p className="text-xs text-gray-500">לאחר שהמשתמש יתחבר, שייך אותו לחתונה דרך כפתור העריכה (עידכון).</p>
            </div>
            <div className="flex gap-3 pt-4">
              <Button onClick={handleInvite} disabled={isInviting || !email} className="flex-1 bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700">
                {isInviting ? 'מזמין...' : 'שלח הזמנה'}
              </Button>
              <Button variant="outline" onClick={() => { setShowInviteDialog(false); setEmail(''); }}>ביטול</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>ערוך משתמש</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>משתמש</Label>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-medium">{editingUser?.full_name || editingUser?.email}</p>
                <p className="text-sm text-gray-500">{editingUser?.email}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>צדדים בחתונה</Label>
              <p className="text-sm text-gray-500 mb-2">אם לא תבחר צדדים, המשתמש יקבל גישה מלאה לכל המוזמנים</p>
              <div className="space-y-2 border rounded-lg p-3">
                {allSides.map(side => (
                  <div key={side} className="flex items-center gap-2">
                    <Checkbox id={`edit-${side}`} checked={selectedSides.includes(side)} onCheckedChange={() => handleToggleSide(side)} />
                    <label htmlFor={`edit-${side}`} className="text-sm cursor-pointer">{side}</label>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>מכסת מוזמנים (אופציונלי)</Label>
              <Input type="number" min="0" value={maxGuests} onChange={e => setMaxGuests(e.target.value)} placeholder="למשל: 50" />
            </div>
            <div className="flex gap-3 pt-4">
              <Button onClick={handleSaveEdit} className="flex-1 bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700">שמור שינויים</Button>
              <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditingUser(null); setSelectedSides([]); }}>ביטול</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}