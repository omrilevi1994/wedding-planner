import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, makeWedding } from './setup.js';

let weddingId;
beforeAll(async () => { weddingId = (await makeWedding()).id; });

describe('guests CRUD', () => {
  it('creates and reads a guest with a preserved id', async () => {
    const { data: created } = await admin.from('guests')
      .insert({ id: 'test-guest-1', wedding_id: weddingId, first_name: 'A', last_name: 'B', side: 'חתן' })
      .select().single();
    expect(created.id).toBe('test-guest-1');
    const { data: got } = await admin.from('guests').select('*').eq('id','test-guest-1').single();
    expect(got.first_name).toBe('A');
  });

  it('updates and deletes', async () => {
    await admin.from('guests').update({ status: 'אישר' }).eq('id','test-guest-1');
    const { data } = await admin.from('guests').select('status').eq('id','test-guest-1').single();
    expect(data.status).toBe('אישר');
    await admin.from('guests').delete().eq('id','test-guest-1');
    const { data: gone } = await admin.from('guests').select('*').eq('id','test-guest-1');
    expect(gone.length).toBe(0);
  });
});

describe('imported data sanity', () => {
  it('has the expected guest count from base44', async () => {
    const { count } = await admin.from('guests').select('*', { count: 'exact', head: true });
    expect(count).toBeGreaterThanOrEqual(352);
  });
});

describe('RLS', () => {
  it('anon cannot read guests', async () => {
    const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
    const { data } = await anon.from('guests').select('*').limit(1);
    expect(data?.length ?? 0).toBe(0); // RLS blocks unauthenticated reads
  });
});
