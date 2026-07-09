import { useMutation, useQueryClient } from '@tanstack/react-query';
import { wedflow } from '@/api/wedflowClient';
import { useWedding } from '@/lib/WeddingContext';

const guestName = (g) => `${g?.first_name || ''} ${g?.last_name || ''}`.trim();

export function useGuestMutations() {
  const queryClient = useQueryClient();
  const { activeWeddingId } = useWedding();

  const createGuest = useMutation({
    mutationFn: (data) => wedflow.entities.Guest.create({ ...data, wedding_id: activeWeddingId }),
    onSuccess: async (guest) => {
      queryClient.invalidateQueries(['guests']);
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'הוספת מוזמן',
        entity_type: 'Guest',
        entity_id: guest.id,
        entity_name: guestName(guest),
        description: `הוסף מוזמן חדש: ${guestName(guest)}`,
      });
    },
  });

  const updateGuest = useMutation({
    mutationFn: ({ id, data }) => wedflow.entities.Guest.update(id, data),
    onSuccess: async (guest) => {
      queryClient.invalidateQueries(['guests']);
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'עדכון מוזמן',
        entity_type: 'Guest',
        entity_id: guest.id,
        entity_name: guestName(guest),
        description: `עדכן מוזמן: ${guestName(guest)}`,
      });
    },
  });

  const deleteGuest = useMutation({
    mutationFn: (guest) => wedflow.entities.Guest.delete(guest.id),
    onSuccess: async (_, guest) => {
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
