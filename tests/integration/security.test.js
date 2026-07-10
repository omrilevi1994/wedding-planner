import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, makeUser, makeWedding } from './setup.js';

describe('profiles privilege escalation', () => {
  let user;
  beforeAll(async () => { user = await makeUser(`esc-${Date.now()}@t.local`); });

  it('a non-admin cannot make themselves platform admin', async () => {
    await user.client.from('profiles').update({ is_platform_admin: true }).eq('id', user.id);
    const { data } = await admin.from('profiles').select('is_platform_admin').eq('id', user.id).single();
    expect(data.is_platform_admin).toBe(false);
  });

  it('a non-admin cannot change their profile email (invite-squatting)', async () => {
    await user.client.from('profiles').update({ email: `squatter-${Date.now()}@t.local` }).eq('id', user.id);
    const { data } = await admin.from('profiles').select('email').eq('id', user.id).single();
    expect(data.email).toContain('esc-');
  });
});

describe('storage wedding-scoping', () => {
  let alice, bob;
  beforeAll(async () => {
    alice = await makeUser(`sa-${Date.now()}@t.local`);
    bob = await makeUser(`sb-${Date.now()}@t.local`);
  });

  it('a non-member cannot download another wedding\'s file', async () => {
    const w = await makeWedding();
    await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: alice.id, role: 'owner' });
    const path = `${w.id}/secret-${Date.now()}.txt`;

    const up = await alice.client.storage.from('uploads').upload(path, new Blob(['secret']));
    expect(up.error).toBeNull();

    const dl = await bob.client.storage.from('uploads').download(path);
    expect(dl.data).toBeNull();

    const list = await bob.client.storage.from('uploads').list('');
    expect((list.data ?? []).length).toBe(0);
  });
});

describe('role-based write authorization', () => {
  let owner, family, em, w;
  beforeAll(async () => {
    owner = await makeUser(`ro-${Date.now()}@t.local`);
    family = await makeUser(`rf-${Date.now()}@t.local`);
    em = await makeUser(`re-${Date.now()}@t.local`);
    w = await makeWedding();
    await admin.from('weddings').update({ owner_id: owner.id }).eq('id', w.id);
    await admin.from('wedding_members').insert([
      { wedding_id: w.id, user_id: owner.id, role: 'owner' },
      { wedding_id: w.id, user_id: family.id, role: 'family', wedding_sides: ['חתן'] },
      { wedding_id: w.id, user_id: em.id, role: 'event_manager' },
    ]);
  });

  it('family cannot write expenses', async () => {
    const { error } = await family.client.from('expenses')
      .insert({ id: `e-${Date.now()}`, wedding_id: w.id, vendor: 'V', category: 'x', amount: 5, status: 'pending' });
    expect(error).not.toBeNull();
  });

  it('family can add a guest on their own side but not another side', async () => {
    const ok = await family.client.from('guests')
      .insert({ id: `gf-${Date.now()}`, wedding_id: w.id, first_name: 'A', last_name: 'B', side: 'חתן' });
    expect(ok.error).toBeNull();
    const bad = await family.client.from('guests')
      .insert({ id: `gb-${Date.now()}`, wedding_id: w.id, first_name: 'C', last_name: 'D', side: 'כלה' });
    expect(bad.error).not.toBeNull();
  });

  it('event_manager can toggle a checklist item but not write guests', async () => {
    // checklist_items only requires title (the group column is "group" and is nullable).
    const item = await admin.from('checklist_items')
      .insert({ id: `ci-${Date.now()}`, wedding_id: w.id, title: 'X', completed: false })
      .select().single();
    const toggle = await em.client.from('checklist_items').update({ completed: true }).eq('id', item.data.id);
    expect(toggle.error).toBeNull();
    const { data: after } = await admin.from('checklist_items').select('completed').eq('id', item.data.id).single();
    expect(after.completed).toBe(true);

    const badGuest = await em.client.from('guests')
      .insert({ id: `ge-${Date.now()}`, wedding_id: w.id, first_name: 'E', last_name: 'M', side: 'חתן' });
    expect(badGuest.error).not.toBeNull();
  });

  it('owner has full write', async () => {
    const { error } = await owner.client.from('expenses')
      .insert({ id: `eo-${Date.now()}`, wedding_id: w.id, vendor: 'V', category: 'y', amount: 9, status: 'pending' });
    expect(error).toBeNull();
  });
});

describe('anon RPC oracle is closed', () => {
  it('anon cannot call membership helpers', async () => {
    const anon = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    const { error } = await anon.rpc('is_platform_admin');
    expect(error).not.toBeNull();
  });
});

describe('invite-link single-use DB primitive', () => {
  let w;
  beforeAll(async () => { w = await makeWedding(); });

  const makeLink = async (over = {}) => {
    const row = {
      id: `il-${Date.now()}-${Math.round(performance.now())}`,
      wedding_id: w.id,
      token: `tok-${Date.now()}-${Math.round(performance.now())}`,
      role: 'coplanner',
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      ...over,
    };
    const { data, error } = await admin.from('wedding_invite_links').insert(row).select().single();
    if (error) throw error;
    return data;
  };

  it('new columns default to null (link starts redeemable)', async () => {
    const link = await makeLink();
    expect(link.used_at).toBeNull();
    expect(link.used_by).toBeNull();
    expect(link.revoked_at).toBeNull();
  });

  it('atomic claim succeeds once and returns no row the second time', async () => {
    const link = await makeLink();
    const claim = () => admin.from('wedding_invite_links')
      .update({ used_at: new Date().toISOString() })
      .eq('token', link.token).is('used_at', null).is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id').maybeSingle();

    const first = await claim();
    expect(first.data).not.toBeNull();
    const second = await claim();
    expect(second.data).toBeNull();
  });

  it('a revoked link cannot be claimed', async () => {
    const link = await makeLink({ revoked_at: new Date().toISOString() });
    const { data } = await admin.from('wedding_invite_links')
      .update({ used_at: new Date().toISOString() })
      .eq('token', link.token).is('used_at', null).is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('id').maybeSingle();
    expect(data).toBeNull();
  });
});

