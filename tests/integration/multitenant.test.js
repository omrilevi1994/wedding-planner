import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin } from './setup.js';

const url = process.env.VITE_SUPABASE_URL;
const anon = process.env.VITE_SUPABASE_ANON_KEY;

async function makeUser(email) {
  const { data } = await admin.auth.admin.createUser({ email, password: 'Passw0rd!1', email_confirm: true });
  const c = createClient(url, anon, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email, password: 'Passw0rd!1' });
  return { id: data.user.id, client: c };
}

let alice, bob, weddingId;
beforeAll(async () => {
  alice = await makeUser(`alice-${Date.now()}@t.local`);
  bob = await makeUser(`bob-${Date.now()}@t.local`);
});

describe('multi-tenant RLS', () => {
  it('a user can create a wedding they own and read it', async () => {
    const { data: w, error } = await alice.client.from('weddings')
      .insert({ couple_names: 'Alice & X', owner_id: alice.id, status: 'active' }).select().single();
    expect(error).toBeNull();
    weddingId = w.id;
    await alice.client.from('wedding_members').insert({ wedding_id: w.id, user_id: alice.id, role: 'owner' });
    const { data: seen } = await alice.client.from('weddings').select('*').eq('id', w.id);
    expect(seen.length).toBe(1);
  });

  it('a non-member cannot see the wedding or its guests', async () => {
    const { data: w } = await bob.client.from('weddings').select('*').eq('id', weddingId);
    expect(w.length).toBe(0);
    await admin.from('guests').insert({ id: `g-${Date.now()}`, wedding_id: weddingId, first_name: 'A', last_name: 'B', side: 'חתן' });
    const { data: g } = await bob.client.from('guests').select('*').eq('wedding_id', weddingId);
    expect(g.length).toBe(0);
  });

  it('only the owner can delete the wedding', async () => {
    await bob.client.from('weddings').delete().eq('id', weddingId);       // no-op under RLS
    const { data: still } = await admin.from('weddings').select('id').eq('id', weddingId);
    expect(still.length).toBe(1);
    await alice.client.from('weddings').delete().eq('id', weddingId);
    const { data: gone } = await admin.from('weddings').select('id').eq('id', weddingId);
    expect(gone.length).toBe(0);
  });
});
