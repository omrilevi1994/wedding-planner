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

async function functionsUp() {
  try {
    const r = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/joinWeddingViaLink`, {
      method: 'OPTIONS', headers: { Origin: 'http://localhost:5173' },
    });
    return r.status === 200;
  } catch { return false; }
}
const FUNCTIONS = await functionsUp();

describe.skipIf(!FUNCTIONS)('invite-link single-use join', () => {
  let owner, w;
  beforeAll(async () => {
    owner = await makeUser(`jo-${Date.now()}@t.local`);
    w = await makeWedding();
    await admin.from('weddings').update({ owner_id: owner.id }).eq('id', w.id);
    await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: owner.id, role: 'owner' });
  });

  const createLink = async (role = 'coplanner') => {
    const { data, error } = await owner.client.functions.invoke('createWeddingInviteLink', {
      body: { wedding_id: w.id, role },
    });
    if (error) throw error;
    return data.token;
  };

  it('first join consumes the token; a second user cannot reuse it', async () => {
    const token = await createLink();
    const a = await makeUser(`ja-${Date.now()}@t.local`);
    const b = await makeUser(`jb-${Date.now()}@t.local`);

    const r1 = await a.client.functions.invoke('joinWeddingViaLink', { body: { token } });
    expect(r1.error).toBeNull();
    expect(r1.data.wedding_id).toBe(w.id);

    const { data: link } = await admin.from('wedding_invite_links')
      .select('used_at, used_by').eq('token', token).single();
    expect(link.used_at).not.toBeNull();
    expect(link.used_by).toBe(a.id);

    const r2 = await b.client.functions.invoke('joinWeddingViaLink', { body: { token } });
    expect(r2.error).not.toBeNull(); // 409 used_token
    const { count } = await admin.from('wedding_members')
      .select('*', { count: 'exact', head: true }).eq('wedding_id', w.id).eq('user_id', b.id);
    expect(count).toBe(0);
  });

  it('an already-member re-opening the link does NOT consume it', async () => {
    // owner is already a member; a fresh link should not be burned by their click.
    const token2 = await createLink();
    const r = await owner.client.functions.invoke('joinWeddingViaLink', { body: { token: token2 } });
    expect(r.error).toBeNull();
    expect(r.data.already_member).toBe(true);
    const { data: link } = await admin.from('wedding_invite_links')
      .select('used_at').eq('token', token2).single();
    expect(link.used_at).toBeNull(); // not consumed
  });

  it('an expired link cannot be joined', async () => {
    const token = `exp-${Date.now()}`;
    await admin.from('wedding_invite_links').insert({
      id: `ilx-${Date.now()}`, wedding_id: w.id, token, role: 'coplanner',
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const d = await makeUser(`jd-${Date.now()}@t.local`);
    const r = await d.client.functions.invoke('joinWeddingViaLink', { body: { token } });
    expect(r.error).not.toBeNull(); // 410 expired_token
  });
});

describe.skipIf(!FUNCTIONS)('invite-link revoke', () => {
  let owner, w;
  beforeAll(async () => {
    owner = await makeUser(`rvo-${Date.now()}@t.local`);
    w = await makeWedding();
    await admin.from('weddings').update({ owner_id: owner.id }).eq('id', w.id);
    await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: owner.id, role: 'owner' });
  });

  const createLink = async () => {
    const { data } = await owner.client.functions.invoke('createWeddingInviteLink', { body: { wedding_id: w.id, role: 'coplanner' } });
    const { data: row } = await admin.from('wedding_invite_links').select('id').eq('token', data.token).single();
    return { token: data.token, id: row.id };
  };

  it('owner can revoke a pending link, after which it cannot be joined', async () => {
    const { token, id } = await createLink();
    const rev = await owner.client.functions.invoke('revokeWeddingInviteLink', { body: { id } });
    expect(rev.error).toBeNull();
    expect(rev.data.revoked).toBe(true);

    const joiner = await makeUser(`rvj-${Date.now()}@t.local`);
    const r = await joiner.client.functions.invoke('joinWeddingViaLink', { body: { token } });
    expect(r.error).not.toBeNull(); // 409 revoked_token
  });

  it('a non-owner member cannot revoke a link', async () => {
    const { id } = await createLink();
    const family = await makeUser(`rvf-${Date.now()}@t.local`);
    await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: family.id, role: 'family' });
    const rev = await family.client.functions.invoke('revokeWeddingInviteLink', { body: { id } });
    expect(rev.error).not.toBeNull(); // 403
  });
});

describe.skipIf(!FUNCTIONS)('invite-link list', () => {
  let owner, w;
  beforeAll(async () => {
    owner = await makeUser(`lso-${Date.now()}@t.local`);
    w = await makeWedding();
    await admin.from('weddings').update({ owner_id: owner.id }).eq('id', w.id);
    await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: owner.id, role: 'owner' });
    await owner.client.functions.invoke('createWeddingInviteLink', { body: { wedding_id: w.id, role: 'coplanner' } });
  });

  it('owner sees links with a status but never a token', async () => {
    const res = await owner.client.functions.invoke('listWeddingInviteLinks', { body: { wedding_id: w.id } });
    expect(res.error).toBeNull();
    expect(Array.isArray(res.data.links)).toBe(true);
    expect(res.data.links.length).toBeGreaterThan(0);
    for (const l of res.data.links) {
      expect(l).not.toHaveProperty('token');
      expect(['pending', 'used', 'revoked', 'expired']).toContain(l.status);
    }
  });

  it('a non-member cannot list links', async () => {
    const outsider = await makeUser(`lsx-${Date.now()}@t.local`);
    const res = await outsider.client.functions.invoke('listWeddingInviteLinks', { body: { wedding_id: w.id } });
    expect(res.error).not.toBeNull(); // 403
  });
});

describe('invite-link owner insert RLS', () => {
  let owner, w;
  beforeAll(async () => {
    owner = await makeUser(`orls-${Date.now()}@t.local`);
    w = await makeWedding();
    await admin.from('weddings').update({ owner_id: owner.id }).eq('id', w.id);
    await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: owner.id, role: 'owner' });
  });

  it('a wedding owner cannot directly insert an owner-role link', async () => {
    const { error } = await owner.client.from('wedding_invite_links').insert({
      id: `ilo-${Date.now()}`, wedding_id: w.id,
      token: `tko-${Date.now()}-${Math.round(performance.now())}`,
      role: 'owner', expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it('a wedding owner can still directly insert a non-owner link', async () => {
    const { error } = await owner.client.from('wedding_invite_links').insert({
      id: `iln-${Date.now()}`, wedding_id: w.id,
      token: `tkn-${Date.now()}-${Math.round(performance.now())}`,
      role: 'coplanner', expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(error).toBeNull();
  });
});

describe.skipIf(!FUNCTIONS)('owner-link creation authz', () => {
  let owner, w;
  beforeAll(async () => {
    owner = await makeUser(`oca-${Date.now()}@t.local`);
    w = await makeWedding();
    await admin.from('weddings').update({ owner_id: owner.id }).eq('id', w.id);
    await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: owner.id, role: 'owner' });
  });

  it('a regular owner cannot create an owner link', async () => {
    const res = await owner.client.functions.invoke('createWeddingInviteLink', {
      body: { wedding_id: w.id, role: 'owner' },
    });
    expect(res.error).not.toBeNull(); // 400: role not allowed for non-admin
  });

  it('a platform admin can create an owner link', async () => {
    const email = `opa-${Date.now()}@t.local`;
    const padmin = await makeUser(email);
    // NOTE: migration 0019's protect_profile_privileged_cols trigger (a BEFORE UPDATE trigger)
    // pins is_platform_admin back to its old value unless is_platform_admin() is already true for
    // the caller — and that's true even for the service-role client, since auth.uid() resolves to
    // null for the service-role JWT (no `sub` claim), so a plain .update() here is silently a
    // no-op. The trigger only fires on UPDATE, not INSERT, so delete + re-insert the profile row
    // (still via the service-role client, which bypasses RLS as usual) to set the flag instead.
    await admin.from('profiles').delete().eq('id', padmin.id);
    await admin.from('profiles').insert({ id: padmin.id, email, full_name: email, is_platform_admin: true });
    const res = await padmin.client.functions.invoke('createWeddingInviteLink', {
      body: { wedding_id: w.id, role: 'owner' },
    });
    expect(res.error).toBeNull();
    expect(res.data.role).toBe('owner');
    expect(typeof res.data.token).toBe('string');
  });
});

describe.skipIf(!FUNCTIONS)('owner-link redemption', () => {
  let padmin, w;
  beforeAll(async () => {
    const email = `orp-${Date.now()}@t.local`;
    padmin = await makeUser(email);
    // See the 'owner-link creation authz' block above: plain .update({is_platform_admin: true})
    // is a silent no-op because of migration 0019's BEFORE UPDATE trigger. Delete + re-insert
    // the profile row instead so the flag actually sticks.
    await admin.from('profiles').delete().eq('id', padmin.id);
    await admin.from('profiles').insert({ id: padmin.id, email, full_name: email, is_platform_admin: true });
    w = await makeWedding(); // owner_id starts null
  });

  const ownerLink = async () => {
    const { data } = await padmin.client.functions.invoke('createWeddingInviteLink', { body: { wedding_id: w.id, role: 'owner' } });
    return data.token;
  };

  it('redeeming an owner link makes the joiner owner and transfers weddings.owner_id', async () => {
    const token = await ownerLink();
    const joiner = await makeUser(`orj-${Date.now()}@t.local`);
    const r = await joiner.client.functions.invoke('joinWeddingViaLink', { body: { token } });
    expect(r.error).toBeNull();
    expect(r.data.role).toBe('owner');

    const { data: mem } = await admin.from('wedding_members')
      .select('role').eq('wedding_id', w.id).eq('user_id', joiner.id).single();
    expect(mem.role).toBe('owner');
    const { data: wed } = await admin.from('weddings').select('owner_id').eq('id', w.id).single();
    expect(wed.owner_id).toBe(joiner.id);
  });

  it('an existing collaborator is promoted to owner (token is consumed)', async () => {
    const token = await ownerLink();
    const member = await makeUser(`orm-${Date.now()}@t.local`);
    await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: member.id, role: 'coplanner' });
    const r = await member.client.functions.invoke('joinWeddingViaLink', { body: { token } });
    expect(r.error).toBeNull();
    expect(r.data.role).toBe('owner');
    expect(r.data.already_member).toBe(false);

    const { data: mem } = await admin.from('wedding_members')
      .select('role').eq('wedding_id', w.id).eq('user_id', member.id).single();
    expect(mem.role).toBe('owner');
    const { data: link } = await admin.from('wedding_invite_links').select('used_at').eq('token', token).single();
    expect(link.used_at).not.toBeNull();
  });
});

