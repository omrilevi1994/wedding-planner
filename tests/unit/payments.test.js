import { describe, it, expect } from 'vitest';
import { pendingPayments } from '@/lib/payments';

describe('pendingPayments', () => {
  const rows = [
    { id: 'a', status: 'שולם', due_date: '2026-01-01' },
    { id: 'b', status: 'מתוכנן', due_date: '2026-03-01' },
    { id: 'c', status: 'מתוכנן', due_date: '2026-02-01' },
  ];

  it('keeps only planned payments', () => {
    expect(pendingPayments(rows).map(p => p.id)).toEqual(['c', 'b']);
  });

  it('sorts planned payments by due_date ascending', () => {
    const result = pendingPayments(rows);
    expect(result[0].id).toBe('c');
    expect(result[1].id).toBe('b');
  });

  it('does not mutate the input array', () => {
    const copy = [...rows];
    pendingPayments(rows);
    expect(rows).toEqual(copy);
  });

  it('returns an empty array when nothing is planned', () => {
    expect(pendingPayments([{ id: 'x', status: 'שולם', due_date: '2026-01-01' }])).toEqual([]);
  });
});
