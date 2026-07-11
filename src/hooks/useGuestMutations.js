import { track } from '@/lib/track';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { wedflow } from '@/api/wedflowClient';
import { useWedding } from '@/lib/WeddingContext';

const guestName = (g) => `${g?.first_name || ''} ${g?.last_name || ''}`.trim();

export function useGuestMutations() {
  const queryClient = useQueryClient();
  const { activeWeddingId } = useWedding();

  // Activity logging runs detached (not awaited) so a caller's per-call
  // onSuccess — e.g. closing the form — fires immediately on success,
  // matching the page's original "close first, then background work" behavior.
  const logGuestActivity = (guest, activity) => {
    (async () => {
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        entity_type: 'Guest',
        entity_id: guest.id,
        entity_name: guestName(guest),
        ...activity,
      });
    })().catch(() => {});
  };

  const createGuest = useMutation({
    mutationFn: (data) => wedflow.entities.Guest.create({ ...data, wedding_id: activeWeddingId }),
    onSuccess: (guest) => {
      track('guest_added');
      queryClient.invalidateQueries(['guests']);
      logGuestActivity(guest, {
        action_type: 'הוספת מוזמן',
        description: `הוסף מוזמן חדש: ${guestName(guest)}`,
      });
    },
  });

  const updateGuest = useMutation({
    mutationFn: ({ id, data }) => wedflow.entities.Guest.update(id, data),
    onSuccess: (guest) => {
      track('guest_updated');
      queryClient.invalidateQueries(['guests']);
      logGuestActivity(guest, {
        action_type: 'עדכון מוזמן',
        description: `עדכן מוזמן: ${guestName(guest)}`,
      });
    },
  });

  const deleteGuest = useMutation({
    mutationFn: (guest) => wedflow.entities.Guest.delete(guest.id),
    onSuccess: async (_, guest) => {
      track('guest_deleted');
      queryClient.invalidateQueries(['guests']);
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'מחיקת מוזמן',
        entity_type: 'Guest',
        entity_id: guest.id,
        entity_name: guestName(guest) || 'מוזמן',
        description: `מחק מוזמן: ${guestName(guest) || guest.id}`,
      });
    },
  });

  return { createGuest, updateGuest, deleteGuest };
}
