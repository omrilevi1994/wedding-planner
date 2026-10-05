import { describe, it, expect, vi, beforeEach } from 'vitest';

// Record every DELETE ... IN (...) the shim issues, without touching a real Supabase.
const calls = [];
let failWith = null;
vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (table) => ({
      delete: () => ({
        in: async (column, ids) => {
          calls.push({ table, column, ids });
          return { error: failWith };
        },
      }),
    }),
  },
}));

const { wedflow } = await import('@/api/wedflowClient');

describe('entity bulkDelete', () => {
  beforeEach(() => { calls.length = 0; failWith = null; });

  it('is a no-op for an empty id list', async () => {
    const res = await wedflow.entities.Guest.bulkDelete([]);
    expect(res).toEqual({ success: true, count: 0 });
    expect(calls).toHaveLength(0);
  });

  it('deletes by id on the mapped table in one request for a small list', async () => {
    const res = await wedflow.entities.Guest.bulkDelete(['a', 'b', 'c']);
    expect(res).toEqual({ success: true, count: 3 });
    expect(calls).toEqual([{ table: 'guests', column: 'id', ids: ['a', 'b', 'c'] }]);
  });

  it('chunks large lists so the IN-list stays short enough for the URL', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `g${i}`);
    const res = await wedflow.entities.Guest.bulkDelete(ids);
    expect(res.count).toBe(250);
    expect(calls.map(c => c.ids.length)).toEqual([100, 100, 50]);
    expect(calls.flatMap(c => c.ids)).toEqual(ids);
  });

  it('throws the Supabase error', async () => {
    failWith = new Error('permission denied');
    await expect(wedflow.entities.Guest.bulkDelete(['a'])).rejects.toThrow('permission denied');
  });
});
