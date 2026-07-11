import { track } from '@/lib/track';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { wedflow } from '@/api/wedflowClient';
import { useWedding } from '@/lib/WeddingContext';

export function usePaymentMutations() {
  const queryClient = useQueryClient();
  const { activeWeddingId } = useWedding();

  const markPaid = useMutation({
    mutationFn: ({ payment, paidDate }) =>
      wedflow.entities.Payment.update(payment.id, {
        ...payment,
        status: 'שולם',
        paid_date: paidDate,
      }),
    onSuccess: async (payment) => {
      track('payment_marked_paid');
      queryClient.invalidateQueries(['payments']);
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'עדכון תשלום',
        entity_type: 'Payment',
        entity_id: payment.id,
        entity_name: payment.expense_vendor,
        description: `סימן תשלום כשולם: ${payment.expense_vendor}`,
      });
    },
  });

  return { markPaid };
}
