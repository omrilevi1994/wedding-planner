// OAuth (AI agent / MCP) access tokens are read-only: migration 0026 + docs/mcp.md.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { admin, makeWedding } from './setup.js';
import { oauthToken, refreshOAuthToken, tokenClient, userClient, decodeJwt } from './oauth-helpers.js';
import { startMcp } from './mcp-server.js';

const PASSWORD = 'Passw0rd!1';

// Shared fixture: an owner of one wedding with a guest, a checklist item and an uploaded file,
// signed in both normally (session) and via OAuth (agent).
let w, ownerId, session, agent, oauth, guest, group, item, filePath, other;

beforeAll(async () => {
  const email = `oauth-ro-${Date.now()}@t.local`;
  const { data: u, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw error;
  ownerId = u.user.id;
  const { data: o } = await admin.auth.admin.createUser({
    email: `oauth-ro-other-${Date.now()}@t.local`, password: PASSWORD, email_confirm: true,
  });
  other = o.user.id;

  w = await makeWedding();
  // owner_id matters: weddings_update/delete key on it, so the agent denials below are real.
  await admin.from('weddings').update({ owner_id: ownerId }).eq('id', w.id).throwOnError();
  await admin.from('wedding_members').insert({ wedding_id: w.id, user_id: ownerId, role: 'owner' }).throwOnError();
  ({ data: guest } = await admin.from('guests')
    .insert({ wedding_id: w.id, first_name: 'Agent', last_name: 'Visible', side: 'bride', status: 'pending' }).select().single());
  ({ data: group } = await admin.from('checklist_groups')
    .insert({ wedding_id: w.id, title: 'Venue', order: 1 }).select().single());
  ({ data: item } = await admin.from('checklist_items')
    .insert({ wedding_id: w.id, group: group.id, title: 'Sign contract' }).select().single());

  session = userClient();
  const s = await session.auth.signInWithPassword({ email, password: PASSWORD });
  if (s.error) throw s.error;
  filePath = `${w.id}/oauth-ro-${Date.now()}.txt`;
  const up = await session.storage.from('uploads').upload(filePath, new Blob(['original']));
  if (up.error) throw up.error;

  oauth = await oauthToken(email, PASSWORD, { client: session });
  agent = tokenClient(oauth.access_token);
}, 60_000);

describe('OAuth access token', () => {
  it('is a user JWT carrying client_id (what 0026 keys on)', () => {
    const claims = decodeJwt(oauth.access_token);
    expect(claims.sub).toBe(ownerId);
    expect(claims.role).toBe('authenticated');
    expect(claims.client_id).toBe(oauth.client_id);
    expect(claims.amr?.[0]?.method).toBe('oauth_provider/authorization_code');
  });

  it('keeps client_id after refresh', async () => {
    const { status, body } = await refreshOAuthToken(oauth.refresh_token, oauth.client_id);
    expect(status).toBe(200);
    expect(decodeJwt(body.access_token).client_id).toBe(oauth.client_id);
    const { error } = await tokenClient(body.access_token).from('guests')
      .insert({ wedding_id: w.id, first_name: 'via', last_name: 'refresh', side: 'bride' });
    expect(error?.code).toBe('42501');
  });
});

describe('(a) OAuth token can read own wedding data', () => {
  it('reads weddings, guests, checklist, members and own profile', async () => {
    const { data: weddings, error } = await agent.from('weddings').select('id, couple_names');
    expect(error).toBeNull();
    expect(weddings.map((x) => x.id)).toContain(w.id);

    const { data: guests } = await agent.from('guests').select('id, first_name').eq('wedding_id', w.id);
    expect(guests.map((g) => g.id)).toEqual([guest.id]);

    const { data: items } = await agent.from('checklist_items').select('id').eq('wedding_id', w.id);
    expect(items.map((i) => i.id)).toEqual([item.id]);

    const { data: members } = await agent.from('wedding_members').select('user_id, role').eq('wedding_id', w.id);
    expect(members).toEqual([{ user_id: ownerId, role: 'owner' }]);

    const { data: profile } = await agent.from('profiles').select('id').eq('id', ownerId).single();
    expect(profile.id).toBe(ownerId);
  });

  it('downloads wedding files from storage', async () => {
    const { data, error } = await agent.storage.from('uploads').download(filePath);
    expect(error).toBeNull();
    expect(await data.text()).toBe('original');
  });

  it('still cannot see other weddings', async () => {
    const w2 = await makeWedding();
    const { data } = await agent.from('weddings').select('id').eq('id', w2.id);
    expect(data).toEqual([]);
  });
});

describe('(b) OAuth token cannot write', () => {
  // INSERT is rejected outright; UPDATE/DELETE are filtered to 0 rows, so assert via admin.
  const expectRls = (res) => expect(res.error?.code).toBe('42501');

  it('guests: insert / update / delete', async () => {
    expectRls(await agent.from('guests').insert({ wedding_id: w.id, first_name: 'Injected', last_name: 'x', side: 'bride' }));
    await agent.from('guests').update({ first_name: 'Renamed' }).eq('id', guest.id);
    await agent.from('guests').delete().eq('id', guest.id);
    const { data } = await admin.from('guests').select('first_name').eq('id', guest.id).single();
    expect(data.first_name).toBe('Agent');
    const { count } = await admin.from('guests').select('id', { count: 'exact', head: true }).eq('wedding_id', w.id);
    expect(count).toBe(1);
  });

  it('guests: upsert', async () => {
    expectRls(await agent.from('guests').upsert({ id: guest.id, wedding_id: w.id, first_name: 'Upserted', last_name: 'x', side: 'bride' }));
    const { data } = await admin.from('guests').select('first_name').eq('id', guest.id).single();
    expect(data.first_name).toBe('Agent');
  });

  it('checklist_items: insert / update / delete', async () => {
    expectRls(await agent.from('checklist_items').insert({ wedding_id: w.id, group: group.id, title: 'x' }));
    await agent.from('checklist_items').update({ completed: true }).eq('id', item.id);
    await agent.from('checklist_items').delete().eq('id', item.id);
    const { data } = await admin.from('checklist_items').select('completed').eq('id', item.id).single();
    expect(data.completed).toBe(false);
  });

  it('weddings: insert / update / delete', async () => {
    expectRls(await agent.from('weddings').insert({ couple_names: 'Agent Wedding', owner_id: ownerId }));
    await agent.from('weddings').update({ couple_names: 'Hijacked' }).eq('id', w.id);
    await agent.from('weddings').delete().eq('id', w.id);
    const { data } = await admin.from('weddings').select('couple_names').eq('id', w.id).single();
    expect(data.couple_names).toBe('Test Couple');
  });

  it('profiles: own row update', async () => {
    const before = (await admin.from('profiles').select('full_name').eq('id', ownerId).single()).data;
    const res = await agent.from('profiles').update({ full_name: 'Agent Was Here' }).eq('id', ownerId).select();
    expect(res.data ?? []).toEqual([]);
    const { data } = await admin.from('profiles').select('full_name').eq('id', ownerId).single();
    expect(data.full_name).toBe(before.full_name);
  });

  it('wedding_members: add / change role / remove', async () => {
    expectRls(await agent.from('wedding_members').insert({ wedding_id: w.id, user_id: other, role: 'coplanner' }));
    await agent.from('wedding_members').update({ role: 'family' }).eq('wedding_id', w.id).eq('user_id', ownerId);
    await agent.from('wedding_members').delete().eq('wedding_id', w.id).eq('user_id', ownerId);
    const { data } = await admin.from('wedding_members').select('user_id, role').eq('wedding_id', w.id);
    expect(data).toEqual([{ user_id: ownerId, role: 'owner' }]);
  });

  it('storage: upload / overwrite / delete', async () => {
    const up = await agent.storage.from('uploads').upload(`${w.id}/agent-${Date.now()}.txt`, new Blob(['x']));
    expect(up.error).not.toBeNull();
    const over = await agent.storage.from('uploads').upload(filePath, new Blob(['overwritten']), { upsert: true });
    expect(over.error).not.toBeNull();
    await agent.storage.from('uploads').remove([filePath]);
    const { data } = await admin.storage.from('uploads').download(filePath);
    expect(await data.text()).toBe('original');
  });

  // NOT covered by 0026: GoTrue accepts PUT /auth/v1/user (incl. password change) with an
  // OAuth access token. Needs an Auth-side fix; see docs/mcp.md "Read-only".
  it.todo('auth: OAuth token cannot change the user\'s password/email via /auth/v1/user');
});

describe('(c) regression: the same user\'s normal session can still write', () => {
  it('guests and checklist_items CRUD', async () => {
    const { data: g, error } = await session.from('guests')
      .insert({ wedding_id: w.id, first_name: 'Session', last_name: 'Guest', side: 'groom' }).select().single();
    expect(error).toBeNull();
    const upd = await session.from('guests').update({ status: 'confirmed' }).eq('id', g.id).select().single();
    expect(upd.data.status).toBe('confirmed');
    const del = await session.from('guests').delete().eq('id', g.id).select();
    expect(del.data).toHaveLength(1);

    const ci = await session.from('checklist_items').update({ completed: true }).eq('id', item.id).select().single();
    expect(ci.data.completed).toBe(true);
    await session.from('checklist_items').update({ completed: false }).eq('id', item.id);
  });

  it('own profile, wedding and storage', async () => {
    const p = await session.from('profiles').update({ full_name: 'Session Name' }).eq('id', ownerId).select().single();
    expect(p.data.full_name).toBe('Session Name');
    const wu = await session.from('weddings').update({ venue: 'Session Venue' }).eq('id', w.id).select().single();
    expect(wu.data.venue).toBe('Session Venue');
    const wi = await session.from('weddings').insert({ couple_names: 'Session Wedding', owner_id: ownerId }).select().single();
    expect(wi.error).toBeNull();
    expect((await session.from('weddings').delete().eq('id', wi.data.id).select()).data).toHaveLength(1);
    const path = `${w.id}/session-${Date.now()}.txt`;
    expect((await session.storage.from('uploads').upload(path, new Blob(['s']))).error).toBeNull();
    expect((await session.storage.from('uploads').remove([path])).error).toBeNull();
  });

  it('wedding_members: owner adds and removes a member', async () => {
    const add = await session.from('wedding_members').insert({ wedding_id: w.id, user_id: other, role: 'coplanner' });
    expect(add.error).toBeNull();
    const del = await session.from('wedding_members').delete().eq('wedding_id', w.id).eq('user_id', other).select();
    expect(del.data).toHaveLength(1);
  });
});

describe('(d) e2e: MCP server with an OAuth token', () => {
  let mcp;
  beforeAll(async () => { mcp = await startMcp(); }, 90_000);
  afterAll(() => mcp?.stop());

  const rpc = (body, token) => fetch(mcp.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  it('unauthenticated request gets 401 with a resource_metadata challenge', async () => {
    const res = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toMatch(/resource_metadata=/);
  });

  it('protected-resource metadata points at Supabase Auth', async () => {
    const res = await fetch(`${mcp.url}/.well-known/oauth-protected-resource`);
    expect(res.status).toBe(200);
    const meta = await res.json();
    expect(meta.authorization_servers[0]).toBe(`${process.env.VITE_SUPABASE_URL}/auth/v1`);
  });

  it('tools/call list_weddings returns the user\'s wedding', async () => {
    const res = await rpc({
      jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'list_weddings', arguments: {} },
    }, oauth.access_token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeUndefined();
    expect(body.result.isError).toBeFalsy();
    const text = body.result.content[0].text;
    expect(text).toContain(w.id);
    expect(JSON.stringify(body.result.structuredContent ?? JSON.parse(text))).toContain('"owner"');
  });
});
