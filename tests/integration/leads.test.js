import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin } from './setup.js';

describe('leads RLS + service-role insert', () => {
  it('service role can insert a lead', async () => {
    const { data, error } = await admin.from('leads').insert({
      email: 'lead-test@example.com', source: 'calculator',
      guest_count: 200, cost_per_head: 450, total_cost: 90000, budget_status: 'ok',
      payload: { dishCost: '450' },
    }).select().single();
    expect(error).toBeNull();
    expect(data.email).toBe('lead-test@example.com');
    await admin.from('leads').delete().eq('id', data.id);
  });

  it('anon cannot select or insert leads', async () => {
    const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    const { data: rows } = await anon.from('leads').select('*').limit(1);
    expect(rows?.length ?? 0).toBe(0);
    const { error: insErr } = await anon.from('leads').insert({ email: 'x@y.com' });
    expect(insErr).not.toBeNull(); // blocked by revoked grant / RLS
  });
});
