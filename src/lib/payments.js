// Planned payments (status 'מתוכנן'), sorted ascending by due_date.
export function pendingPayments(payments = []) {
  return payments
    .filter(p => p.status === 'מתוכנן')
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
}
