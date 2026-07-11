import { track } from '@/lib/track';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { wedflow } from '@/api/wedflowClient';
import { useWedding } from '@/lib/WeddingContext';

export function useExpenseMutations() {
  const queryClient = useQueryClient();
  const { activeWeddingId } = useWedding();

  // Sync Payment records for an expense (deposit + remainder or single).
  const syncPayments = async (expense) => {
    const existing = await wedflow.entities.Payment.filter({ expense_id: expense.id, wedding_id: activeWeddingId });
    await Promise.all(existing.map(p => wedflow.entities.Payment.delete(p.id)));

    if (expense.has_deposit && expense.deposit_amount) {
      const remainderAmount = expense.amount - expense.deposit_amount;
      await wedflow.entities.Payment.create({
        wedding_id: activeWeddingId,
        expense_id: expense.id,
        expense_vendor: `${expense.vendor} - מקדמה`,
        amount: expense.deposit_amount,
        due_date: expense.deposit_status === 'שולם' ? expense.deposit_paid_date : (expense.deposit_due_date || expense.due_date || new Date().toISOString().split('T')[0]),
        status: expense.deposit_status || 'מתוכנן',
        paid_date: expense.deposit_paid_date || null,
        probability: 100,
        notes: expense.notes,
      });
      if (remainderAmount > 0) {
        await wedflow.entities.Payment.create({
          wedding_id: activeWeddingId,
          expense_id: expense.id,
          expense_vendor: `${expense.vendor} - יתרה`,
          amount: remainderAmount,
          due_date: expense.status === 'שולם' ? expense.paid_date : (expense.due_date || new Date().toISOString().split('T')[0]),
          status: expense.status || 'מתוכנן',
          paid_date: expense.paid_date || null,
          probability: expense.probability || 100,
          notes: expense.notes,
        });
      }
    } else {
      const date = expense.status === 'שולם' ? expense.paid_date : expense.due_date;
      if (date) {
        await wedflow.entities.Payment.create({
          wedding_id: activeWeddingId,
          expense_id: expense.id,
          expense_vendor: expense.vendor,
          amount: expense.amount,
          due_date: date,
          status: expense.status,
          paid_date: expense.paid_date || null,
          probability: expense.probability || 100,
          notes: expense.notes,
        });
      }
    }
    queryClient.invalidateQueries(['payments']);
  };

  // Payment sync + activity logging run detached (not awaited) so a caller's
  // per-call onSuccess — e.g. closing the form — fires immediately on success,
  // matching the pages' original "close first, then background work" behavior.
  const runExpenseSideEffects = (expense, activity) => {
    syncPayments(expense)
      .then(async () => {
        const user = await wedflow.auth.me();
        await wedflow.entities.ActivityLog.create({
          wedding_id: activeWeddingId,
          user_email: user.email,
          user_name: user.full_name,
          entity_type: 'Expense',
          entity_id: expense.id,
          entity_name: expense.vendor,
          ...activity,
        });
      })
      .catch(() => {});
  };

  const createExpense = useMutation({
    mutationFn: (data) => wedflow.entities.Expense.create({ ...data, wedding_id: activeWeddingId }),
    onSuccess: (expense) => {
      track('expense_added');
      queryClient.invalidateQueries(['expenses']);
      runExpenseSideEffects(expense, {
        action_type: 'הוספת הוצאה',
        description: `הוסף הוצאה: ${expense.vendor} - ₪${expense.amount?.toLocaleString('he-IL')}`,
      });
    },
  });

  const updateExpense = useMutation({
    mutationFn: ({ id, data }) => wedflow.entities.Expense.update(id, data),
    onSuccess: (expense) => {
      track('expense_updated');
      queryClient.invalidateQueries(['expenses']);
      runExpenseSideEffects(expense, {
        action_type: 'עדכון הוצאה',
        description: `עדכן הוצאה: ${expense.vendor}`,
      });
    },
  });

  const deleteExpense = useMutation({
    mutationFn: (expense) => wedflow.entities.Expense.delete(expense.id),
    onSuccess: async (_, expense) => {
      track('expense_deleted');
      queryClient.invalidateQueries(['expenses']);
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'מחיקת הוצאה',
        entity_type: 'Expense',
        entity_id: expense.id,
        entity_name: expense.vendor || 'הוצאה',
        description: `מחק הוצאה: ${expense.vendor || expense.id}`,
      });
    },
  });

  return { createExpense, updateExpense, deleteExpense };
}
