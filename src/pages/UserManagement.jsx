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
import { Plus, Pencil, Trash2, Heart, Link2, Copy, Check } from 'lucide-react';
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
  owner: 'bg-sage/15 border-sage/30 text-sage-deep',
  coplanner: 'bg-taupe/15 border-taupe/30 text-taupe',
  family: 'bg-taupe/15 border-taupe/30 text-taupe',
  event_manager: 'bg-champagne border-taupe/40 text-rose-deep'
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

  // Invite-link dialog state
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkRole, setLinkRole] = useState('coplanner');
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [generatedLink, setGeneratedLink] = useState(null); // { url, expires_at }
  const [linkCopied, setLinkCopied] = useState(false);

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

  const handleCreateLink = async () => {
    if (!activeWeddingId) return;
    setIsCreatingLink(true);
    try {
      const result = await wedflow.weddingInviteLinks.create({ wedding_id: activeWeddingId, role: linkRole });
      setGeneratedLink(result);
      setLinkCopied(false);
    } catch (error) {
      alert('שגיאה ביצירת קישור הזמנה: ' + error.message);
    } finally {
      setIsCreatingLink(false);
    }
  };

  const handleCopyLink = async () => {
    if (!generatedLink?.url) return;
    try {
      await navigator.clipboard.writeText(generatedLink.url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — the link is still shown/selectable.
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
        <Heart className="w-14 h-14 mx-auto mb-3 text-muted-foreground" />
        <p className="text-lg text-muted-foreground">בחר חתונה כדי לנהל את המשתמשים שלה</p>
        {isAdmin && (
          <Button className="mt-4 bg-primary hover:bg-primary-hover" onClick={() => navigate(createPageUrl('AdminDashboard'))}>
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
          <h1 className="text-3xl font-bold text-foreground mb-2">ניהול משתמשים</h1>
          <p className="text-muted-foreground">
            משתמשים של החתונה של {activeWedding?.couple_names || ''}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setGeneratedLink(null); setLinkRole('coplanner'); setShowLinkDialog(true); }}>
              <Link2 className="w-4 h-4 ml-2" />
              צור קישור הזמנה
            </Button>
            <Button onClick={() => setShowInviteDialog(true)} className="bg-gradient-to-l from-rose to-rose-deep hover:from-rose-deep hover:to-rose-deep">
              <Plus className="w-4 h-4 ml-2" />
              הזמן משתמש
            </Button>
          </div>
        )}
      </div>

      <Card className="overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted">
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
                <TableRow><TableCell colSpan={canManage ? 6 : 5} className="text-center py-8 text-muted-foreground">טוען...</TableCell></TableRow>
              ) : members.length === 0 ? (
                <TableRow><TableCell colSpan={canManage ? 6 : 5} className="text-center py-8 text-muted-foreground">אין משתמשים בחתונה זו עדיין</TableCell></TableRow>
              ) : (
                members.map(member => (
                  <TableRow key={member.id} className="hover:bg-muted">
                    <TableCell className="font-medium">{member.profiles?.full_name || '-'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{member.profiles?.email || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={ROLE_BADGE_STYLES[member.role] || 'bg-muted border-border text-foreground'}>
                        {ROLE_LABELS[member.role] || member.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {member.wedding_sides && member.wedding_sides.length > 0 ? (
                        <span className="text-sm text-foreground">{member.wedding_sides.join(', ')}</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">גישה מלאה</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {member.max_guests != null ? `${member.max_guests}` : '-'}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        {member.role !== 'owner' && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleOpenEdit(member)} className="p-2 hover:bg-muted rounded-lg transition-colors" title="עריכה">
                              <Pencil className="w-4 h-4 text-muted-foreground" />
                            </button>
                            <button onClick={() => handleRemove(member)} className="p-2 hover:bg-destructive/10 rounded-lg transition-colors" title="הסרה">
                              <Trash2 className="w-4 h-4 text-destructive" />
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
                  <p className="text-sm text-muted-foreground mb-2">אם לא תבחר צדדים, המשתמש יקבל גישה מלאה לכל המוזמנים</p>
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
              <Button onClick={handleInvite} disabled={isInviting || !email} className="flex-1 bg-gradient-to-l from-rose to-rose-deep hover:from-rose-deep hover:to-rose-deep">
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
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium">{editingMember?.profiles?.full_name || editingMember?.profiles?.email || '-'}</p>
                <p className="text-sm text-muted-foreground">{editingMember?.profiles?.email || ''}</p>
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
                  <p className="text-sm text-muted-foreground mb-2">אם לא תבחר צדדים, המשתמש יקבל גישה מלאה לכל המוזמנים</p>
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
              <Button onClick={handleSaveEdit} className="flex-1 bg-gradient-to-l from-rose to-rose-deep hover:from-rose-deep hover:to-rose-deep">שמור שינויים</Button>
              <Button variant="outline" onClick={() => { setShowEditDialog(false); setEditingMember(null); }}>ביטול</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Invite Link Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={(open) => { setShowLinkDialog(open); if (!open) setGeneratedLink(null); }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>קישור הזמנה משותף לחתונה של {activeWedding?.couple_names || ''}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              כל מי שמקבל את הקישור יכול להצטרף לחתונה בעצמו, ללא צורך בהזמנה אישית. הקישור תקף ל-48 שעות ואפשר להשתמש בו כמה פעמים.
            </p>
            {!generatedLink ? (
              <>
                <div className="space-y-2">
                  <Label>תפקיד למצטרפים</Label>
                  <Select value={linkRole} onValueChange={setLinkRole}>
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
                <div className="flex gap-3 pt-2">
                  <Button onClick={handleCreateLink} disabled={isCreatingLink} className="flex-1 bg-gradient-to-l from-rose to-rose-deep hover:from-rose-deep hover:to-rose-deep">
                    {isCreatingLink ? 'יוצר קישור…' : 'צור קישור'}
                  </Button>
                  <Button variant="outline" onClick={() => setShowLinkDialog(false)}>ביטול</Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>הקישור להעברה</Label>
                  <div className="flex gap-2">
                    <Input readOnly value={generatedLink.url} className="text-left" dir="ltr" onFocus={(e) => e.target.select()} />
                    <Button type="button" variant="outline" onClick={handleCopyLink} title="העתקה">
                      {linkCopied ? <Check className="w-4 h-4 text-sage-deep" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    תפקיד: {ROLE_LABELS[generatedLink.role] || generatedLink.role} · פג תוקף ב-{new Date(generatedLink.expires_at).toLocaleString('he-IL')}
                  </p>
                </div>
                <div className="flex gap-3 pt-2">
                  <Button variant="outline" onClick={() => setGeneratedLink(null)} className="flex-1">צור קישור נוסף</Button>
                  <Button onClick={() => setShowLinkDialog(false)} className="flex-1 bg-gradient-to-l from-rose to-rose-deep hover:from-rose-deep hover:to-rose-deep">סגירה</Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
