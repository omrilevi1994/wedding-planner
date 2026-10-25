// Integration tests for the read-only MCP edge function (supabase/functions/mcp), run
// under Deno on the host against the local Supabase stack. See docs/mcp.md.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { admin, makeWedding } from './setup.js';
import { startMcp } from './mcp-server.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;
const PASSWORD = 'Passw0rd!1';
const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function makeUserWithToken(label, fullName) {
  const email = `mcp-${label}-${run}@t.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: fullName ?? label },
  });
  if (error) throw error;
  const c = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (e2) throw e2;
  return { id: data.user.id, email, token: s.session.access_token };
}

const day = (offset) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

let mcp;
let owner, em, fam, other, stranger, platformAdmin;
let wA, wB;
const ids = {};

async function post(token, body, extraHeaders = {}) {
  const res = await fetch(mcp.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { res, status: res.status, body: text ? JSON.parse(text) : null };
}

let nextId = 1;
async function rpc(token, method, params) {
  const { status, body } = await post(token, { jsonrpc: '2.0', id: nextId++, method, ...(params ? { params } : {}) });
  expect(status).toBe(200);
  return body;
}

/** tools/call → { isError, text, data } */
async function call(token, name, args = {}) {
  const body = await rpc(token, 'tools/call', { name, arguments: args });
  expect(body.error).toBeUndefined();
  const r = body.result;
  return { isError: !!r.isError, text: r.content?.[0]?.text, data: r.structuredContent };
}

beforeAll(async () => {
  mcp = await startMcp();
  [owner, em, fam, other, stranger, platformAdmin] = await Promise.all([
    makeUserWithToken('owner', 'Owner Person'),
    makeUserWithToken('em'),
    makeUserWithToken('fam'),
    makeUserWithToken('other'),
    makeUserWithToken('stranger'),
    makeUserWithToken('padmin'),
  ]);
  // .update({ is_platform_admin }) is a silent no-op (migration 0019 trigger), so re-insert the row.
  await admin.from('profiles').delete().eq('id', platformAdmin.id);
  const { error: paErr } = await admin.from('profiles')
    .insert({ id: platformAdmin.id, email: platformAdmin.email, full_name: 'padmin', is_platform_admin: true });
  if (paErr) throw paErr;

  wA = await makeWedding();
  wB = await makeWedding();
  const must = async (p) => { const { data, error } = await p; if (error) throw error; return data; };
  await must(admin.from('weddings').update({ couple_names: 'Alice & Avi', owner_id: owner.id, venue: null, currency: '₪' }).eq('id', wA.id));
  await must(admin.from('weddings').update({ couple_names: 'Bob & Bat', owner_id: other.id }).eq('id', wB.id));
  await must(admin.from('wedding_settings').insert({ wedding_id: wA.id, venue: 'Garden Hall', budget_target: 50000, ceremony_time: '19:30' }));
  await must(admin.from('wedding_members').insert([
    { wedding_id: wA.id, user_id: owner.id, role: 'owner' },
    { wedding_id: wA.id, user_id: em.id, role: 'event_manager' },
    { wedding_id: wA.id, user_id: fam.id, role: 'family', wedding_sides: ['כלה'] },
    { wedding_id: wB.id, user_id: other.id, role: 'owner' },
  ]));

  const [t1, stage] = await must(admin.from('tables').insert([
    { wedding_id: wA.id, name: 'Table 1', capacity: 10, element_type: 'table' },
    { wedding_id: wA.id, name: 'Stage', capacity: 0, element_type: 'stage' },
  ]).select('id, name').order('name'));
  ids.t1 = t1.name === 'Table 1' ? t1.id : stage.id;
  ids.stage = t1.name === 'Table 1' ? stage.id : t1.id;

  const guests = await must(admin.from('guests').insert([
    { wedding_id: wA.id, first_name: 'Dana', last_name: 'Cohen', side: 'כלה', status: 'אישר', total_people: 2, confirmed_people: 2, children_count: 1, phone: '050-1111111', notes: 'vegan', gift_amount: 500, table_id: ids.t1 },
    { wedding_id: wA.id, first_name: 'Moshe', last_name: 'Levi', side: 'חתן', status: 'אישר', total_people: 3, phone: '052-2222222', notes: 'groom secret', table_id: ids.t1 },
    { wedding_id: wA.id, first_name: 'Rina', last_name: 'Katz', side: 'כלה', status: 'לא מגיע', total_people: 1, phone: '053-3333333' },
    { wedding_id: wA.id, first_name: 'Yossi', last_name: 'Mizrahi', side: 'חתן', status: 'הוזמן', total_people: 4, children_count: 2 },
    ...Array.from({ length: 7 }, (_, i) => ({ wedding_id: wA.id, first_name: 'Pag', last_name: `Guest${i}`, side: 'חתן', total_people: 1 })),
  ]).select('id, first_name'));
  ids.dana = guests.find((g) => g.first_name === 'Dana').id;
  await must(admin.from('guests').insert({ wedding_id: wB.id, first_name: 'Secret', last_name: 'B-Guest', side: 'כלה', status: 'אישר' }));

  const exps = await must(admin.from('expenses').insert([
    { wedding_id: wA.id, vendor: 'Hall', category: 'venue', amount: 10000, status: 'שולם', paid_by_party: 'חתן' },
    { wedding_id: wA.id, vendor: 'DJ', category: 'music', amount: 3000, status: 'מתוכנן', paid_by_party: 'כלה' },
    { wedding_id: wA.id, vendor: 'Flowers', category: 'decor', amount: 2000, status: 'מתוכנן', paid_by_party: 'הורים' },
  ]).select('id, vendor'));
  const dj = exps.find((e) => e.vendor === 'DJ').id;
  await must(admin.from('payments').insert([
    { wedding_id: wA.id, expense_id: dj, expense_vendor: 'DJ', amount: 3000, due_date: day(10), status: 'מתוכנן' },
    { wedding_id: wA.id, expense_vendor: 'Hall', amount: 10000, due_date: day(-30), status: 'שולם', paid_date: day(-30) },
    { wedding_id: wA.id, expense_vendor: 'Cake', amount: 500, due_date: day(-5), status: 'מתוכנן' },
  ]));
  await must(admin.from('vendors').insert({ wedding_id: wA.id, name: 'DJ Dave', category: 'music', phone: '054-4444444', total_cost: 3000, estimated_cost: 3500 }));
  await must(admin.from('gifts').insert({ wedding_id: wA.id, guest_id: ids.dana, description: 'Check', amount: 500, payment_method: 'Bit' }));
  const [g1] = await must(admin.from('checklist_groups').insert({ wedding_id: wA.id, title: 'Before', order: 1 }).select('id'));
  await must(admin.from('checklist_items').insert([
    { wedding_id: wA.id, group: g1.id, title: 'Book hall', completed: true, order: 1 },
    { wedding_id: wA.id, group: g1.id, title: 'Send invites', completed: false, order: 2, notes: 'by mail' },
    { wedding_id: wA.id, group: null, title: 'Orphan', completed: false },
  ]));
}, 120_000);

afterAll(async () => {
  mcp?.stop();
  if (wA) await admin.from('weddings').delete().in('id', [wA.id, wB?.id].filter(Boolean));
  // Don't leave a platform admin behind in the local DB.
  if (platformAdmin) await admin.auth.admin.deleteUser(platformAdmin.id);
});

describe('MCP HTTP transport & auth', () => {
  it('rejects requests without a token with 401 + OAuth challenge', async () => {
    const { status, res } = await post(null, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(status).toBe(401);
    const www = res.headers.get('www-authenticate');
    expect(www).toContain(`resource_metadata="${mcp.url}/.well-known/oauth-protected-resource"`);
    expect(www).not.toContain('invalid_token');
  });

  it('rejects an invalid token with error="invalid_token"', async () => {
    const { status, res } = await post('not-a-jwt', { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('error="invalid_token"');
  });

  it('serves RFC 9728 protected resource metadata', async () => {
    const res = await fetch(`${mcp.url}/.well-known/oauth-protected-resource`);
    expect(res.status).toBe(200);
    const meta = await res.json();
    expect(meta).toMatchObject({
      resource: mcp.url,
      authorization_servers: [`${SUPABASE_URL}/auth/v1`],
      bearer_methods_supported: ['header'],
      resource_name: 'WedFlow',
    });
  });

  it('answers GET/DELETE with 405 and OPTIONS with CORS preflight', async () => {
    expect((await fetch(mcp.url, { headers: { Authorization: `Bearer ${owner.token}` } })).status).toBe(405);
    expect((await fetch(mcp.url, { method: 'DELETE' })).status).toBe(405);
    const pre = await fetch(mcp.url, { method: 'OPTIONS', headers: { Origin: 'https://claude.ai', 'Access-Control-Request-Method': 'POST' } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe('*');
    expect(pre.headers.get('access-control-allow-headers')).toContain('mcp-protocol-version');
    expect(pre.headers.get('access-control-expose-headers')).toContain('WWW-Authenticate');
  });
});

describe('MCP protocol', () => {
  it('initialize negotiates the protocol version', async () => {
    const body = await rpc(owner.token, 'initialize', {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' },
    });
    expect(body.result.protocolVersion).toBe('2025-06-18');
    expect(body.result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(body.result.serverInfo).toMatchObject({ name: 'wedflow', version: '1.0.0' });
    expect(body.result.instructions).toContain('list_weddings');
    const old = await rpc(owner.token, 'initialize', { protocolVersion: '1999-01-01' });
    expect(old.result.protocolVersion).toBe('2025-11-25');
  });

  it('acknowledges notifications with 202 and no body', async () => {
    const { status, body } = await post(owner.token, { jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(status).toBe(202);
    expect(body).toBeNull();
  });

  it('lists the read-only tools with input schemas', async () => {
    const body = await rpc(owner.token, 'tools/list');
    const names = body.result.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      'get_budget', 'get_checklist', 'get_seating', 'get_wedding_summary', 'list_expenses',
      'list_gifts', 'list_payments', 'list_vendors', 'list_weddings', 'search_guests',
    ]);
    for (const t of body.result.tools) {
      expect(t.inputSchema.type).toBe('object');
      expect(t.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    }
    const sg = body.result.tools.find((t) => t.name === 'search_guests');
    expect(sg.inputSchema.required).toEqual(['wedding_id']);
    expect(sg.inputSchema.properties.limit.maximum).toBe(200);
  });

  it('returns JSON-RPC errors for unknown methods/tools, batches and bad JSON', async () => {
    expect((await rpc(owner.token, 'resources/list')).error.code).toBe(-32601);
    expect((await rpc(owner.token, 'tools/call', { name: 'delete_wedding', arguments: {} })).error.code).toBe(-32602);
    const batch = await post(owner.token, [{ jsonrpc: '2.0', id: 1, method: 'ping' }]);
    expect(batch.body.error.code).toBe(-32600);
    const bad = await post(owner.token, '{not json');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe(-32700);
    expect((await rpc(owner.token, 'ping')).result).toEqual({});
  });
});

describe('MCP tools: scoping', () => {
  it('list_weddings returns only the caller\'s weddings with role (settings override venue)', async () => {
    const r = await call(owner.token, 'list_weddings');
    expect(r.isError).toBe(false);
    expect(r.data.weddings).toEqual([
      { id: wA.id, couple_names: 'Alice & Avi', wedding_date: '2027-01-01', venue: 'Garden Hall', role: 'owner' },
    ]);
    const s = await call(stranger.token, 'list_weddings');
    expect(s.data.weddings).toEqual([]);
    const f = await call(fam.token, 'list_weddings');
    expect(f.data.weddings.map((w) => [w.id, w.role])).toEqual([[wA.id, 'family']]);
  });

  it('denies access to a wedding the caller is not a member of', async () => {
    for (const [name, args] of [
      ['get_wedding_summary', {}], ['search_guests', {}], ['get_seating', {}], ['get_checklist', {}],
      ['get_budget', {}], ['list_vendors', {}],
    ]) {
      const r = await call(owner.token, name, { wedding_id: wB.id, ...args });
      expect(r.isError, name).toBe(true);
      expect(r.text).toMatch(/not a member/);
      expect(r.text).not.toContain('Secret');
      expect(r.data).toBeUndefined();
    }
    const r = await call(owner.token, 'search_guests', { wedding_id: 'does-not-exist' });
    expect(r.isError).toBe(true);
  });

  it('platform admins act as owner on any existing wedding', async () => {
    const r = await call(platformAdmin.token, 'get_wedding_summary', { wedding_id: wB.id });
    expect(r.isError).toBe(false);
    expect(r.data.your_role).toBe('owner');
    expect(r.data.guests.guest_records).toBe(1);
    expect((await call(platformAdmin.token, 'get_seating', { wedding_id: 'nope' })).isError).toBe(true);
  });
});

describe('MCP tools: content & role filtering', () => {
  it('get_wedding_summary counts guests and shows budget to the owner', async () => {
    const r = await call(owner.token, 'get_wedding_summary', { wedding_id: wA.id });
    expect(r.isError).toBe(false);
    const s = r.data;
    expect(s.wedding).toMatchObject({ couple_names: 'Alice & Avi', venue: 'Garden Hall', ceremony_time: '19:30', wedding_date: '2027-01-01' });
    // 2 + 3 + 1 + 4 + 7*1 invited; confirmed: Dana 2 + Moshe 3 (no confirmed_people → total)
    expect(s.guests).toMatchObject({ guest_records: 11, invited_people: 17, confirmed_people: 5, declined_people: 1, children: 3 });
    const bride = s.guests.by_side.find((x) => x.side === 'כלה');
    expect(bride).toMatchObject({ guest_records: 2, invited_people: 3, confirmed_people: 2, children: 1 });
    expect(s.guests.by_status.find((x) => x.status === 'אישר')).toMatchObject({ guest_records: 2, people: 5 });
    expect(s.checklist).toEqual({ completed: 1, total: 2 }); // orphan item excluded
    // billable: Hall 10000 paid + DJ 3000 planned; Flowers paid by parents excluded
    expect(s.budget).toMatchObject({ budget_target: 50000, committed: 13000, paid: 10000, expected_total: 13000, remaining_budget: 37000, excluded_paid_by_parents_or_other: 2000 });
  });

  it('event_manager and family get no budget in the summary', async () => {
    for (const u of [em, fam]) {
      const r = await call(u.token, 'get_wedding_summary', { wedding_id: wA.id });
      expect(r.isError).toBe(false);
      expect(r.data.budget).toBeUndefined();
      expect(r.text).not.toContain('50000');
      expect(r.data.guests.guest_records).toBe(11);
    }
  });

  it('family sees only own-side guests (with phone); event manager sees all without phone/notes', async () => {
    const f = await call(fam.token, 'search_guests', { wedding_id: wA.id });
    expect(f.data.total).toBe(2);
    expect(f.data.items.map((g) => g.first_name).sort()).toEqual(['Dana', 'Rina']);
    expect(f.data.items.find((g) => g.first_name === 'Dana')).toMatchObject({ phone: '050-1111111', notes: 'vegan', table_name: 'Table 1' });
    expect(f.data.items[0].gift_amount).toBeUndefined();
    // asking for the other side explicitly yields nothing
    expect((await call(fam.token, 'search_guests', { wedding_id: wA.id, side: 'חתן' })).data.total).toBe(0);

    const e = await call(em.token, 'search_guests', { wedding_id: wA.id, limit: 200 });
    expect(e.data.total).toBe(11);
    for (const g of e.data.items) {
      expect(g).not.toHaveProperty('phone');
      expect(g).not.toHaveProperty('notes');
      expect(g).not.toHaveProperty('gift_amount');
    }
    expect(e.text).not.toContain('050-1111111');
    // phone is not searchable for roles that cannot see it
    expect((await call(em.token, 'search_guests', { wedding_id: wA.id, query: '050' })).data.total).toBe(0);

    const o = await call(owner.token, 'search_guests', { wedding_id: wA.id, query: '050' });
    expect(o.data.items.map((g) => g.first_name)).toEqual(['Dana']);
    expect(o.data.items[0]).toMatchObject({ gift_amount: 500, phone: '050-1111111' });
  });

  it('search_guests filters by status (Hebrew or English), name, seating', async () => {
    const conf = await call(owner.token, 'search_guests', { wedding_id: wA.id, status: 'confirmed' });
    expect(conf.data.total).toBe(2);
    const he = await call(owner.token, 'search_guests', { wedding_id: wA.id, status: 'לא מגיע' });
    expect(he.data.items.map((g) => g.first_name)).toEqual(['Rina']);
    const none = await call(owner.token, 'search_guests', { wedding_id: wA.id, status: 'none' });
    expect(none.data.total).toBe(7);
    const name = await call(owner.token, 'search_guests', { wedding_id: wA.id, query: 'dana coh' });
    expect(name.data.items.map((g) => g.last_name)).toEqual(['Cohen']);
    const seated = await call(owner.token, 'search_guests', { wedding_id: wA.id, table_id: ids.t1 });
    expect(seated.data.total).toBe(2);
    const unseated = await call(owner.token, 'search_guests', { wedding_id: wA.id, unseated: true });
    expect(unseated.data.total).toBe(9);
  });

  it('paginates list results', async () => {
    const p1 = await call(owner.token, 'search_guests', { wedding_id: wA.id, query: 'Pag', limit: 3 });
    expect(p1.data).toMatchObject({ total: 7, limit: 3, offset: 0 });
    expect(p1.data.items).toHaveLength(3);
    const p3 = await call(owner.token, 'search_guests', { wedding_id: wA.id, query: 'Pag', limit: 3, offset: 6 });
    expect(p3.data.items).toHaveLength(1);
    const all = new Set([...p1.data.items, ...p3.data.items].map((g) => g.id));
    expect(all.size).toBe(4);
    const past = await call(owner.token, 'search_guests', { wedding_id: wA.id, query: 'Pag', offset: 100 });
    expect(past.data).toMatchObject({ items: [], total: 7 });
  });

  it('validates arguments', async () => {
    expect((await call(owner.token, 'search_guests', { wedding_id: wA.id, limit: 500 })).isError).toBe(true);
    expect((await call(owner.token, 'search_guests', { wedding_id: wA.id, limit: '5' })).isError).toBe(true);
    expect((await call(owner.token, 'search_guests', {})).text).toMatch(/wedding_id/);
    expect((await call(owner.token, 'search_guests', { wedding_id: wA.id, bogus: 1 })).text).toMatch(/unknown argument/);
    expect((await call(owner.token, 'list_payments', { wedding_id: wA.id, due_before: '2027-13-01' })).text).toMatch(/YYYY-MM-DD/);
  });

  it('get_seating: tables with counts; family sees names only for own side', async () => {
    const o = await call(owner.token, 'get_seating', { wedding_id: wA.id });
    expect(o.isError).toBe(false);
    expect(o.data.tables).toHaveLength(1);
    expect(o.data.tables[0]).toMatchObject({ id: ids.t1, name: 'Table 1', capacity: 10, element_type: 'table', seated_people: 5, free_seats: 5 });
    expect(o.data.tables[0].guests.map((g) => g.name).sort()).toEqual(['Dana Cohen', 'Moshe Levi']);
    expect(o.data.layout_elements).toEqual([{ id: ids.stage, name: 'Stage', element_type: 'stage' }]);
    expect(o.data.unseated).toMatchObject({ guest_records: 9, people: 12 });

    const f = await call(fam.token, 'get_seating', { wedding_id: wA.id });
    expect(f.data.tables[0].seated_people).toBe(5);
    expect(f.data.tables[0].guests.map((g) => g.name)).toEqual(['Dana Cohen']);
    expect(f.data.tables[0].other_side_guest_records).toBe(1);
    expect(f.text).not.toContain('Moshe');
  });

  it('money tools are refused for event_manager and family; owner sees budget', async () => {
    for (const u of [em, fam]) {
      for (const name of ['get_budget', 'list_expenses', 'list_payments', 'list_gifts']) {
        const r = await call(u.token, name, { wedding_id: wA.id });
        expect(r.isError, `${name}`).toBe(true);
        expect(r.text).toMatch(/only available to the couple/);
      }
    }
    const b = await call(owner.token, 'get_budget', { wedding_id: wA.id });
    expect(b.isError).toBe(false);
    expect(b.data.totals).toMatchObject({ budget_target: 50000, committed: 13000, paid: 10000 });
    expect(b.data.by_category.map((c) => c.category).sort()).toEqual(['decor', 'music', 'venue']);
    expect(b.data.upcoming_payments).toMatchObject({ count: 1, amount: 3000 });
    expect(b.data.overdue_payments).toMatchObject({ count: 1, amount: 500 });

    const ex = await call(owner.token, 'list_expenses', { wedding_id: wA.id, status: 'paid' });
    expect(ex.data.items.map((e) => e.vendor)).toEqual(['Hall']);
    const pay = await call(owner.token, 'list_payments', { wedding_id: wA.id, due_before: day(0) });
    expect(pay.data.total).toBe(2);
    const gifts = await call(owner.token, 'list_gifts', { wedding_id: wA.id });
    expect(gifts.data.items[0]).toMatchObject({ description: 'Check', amount: 500, payment_method: 'Bit', guest_name: 'Dana Cohen' });
  });

  it('vendors: refused for family, costs stripped for event_manager', async () => {
    const f = await call(fam.token, 'list_vendors', { wedding_id: wA.id });
    expect(f.isError).toBe(true);
    const e = await call(em.token, 'list_vendors', { wedding_id: wA.id });
    expect(e.data.items[0]).toMatchObject({ name: 'DJ Dave', phone: '054-4444444' });
    expect(e.data.items[0]).not.toHaveProperty('total_cost');
    expect(e.data.items[0]).not.toHaveProperty('estimated_cost');
    const o = await call(owner.token, 'list_vendors', { wedding_id: wA.id, category: 'music' });
    expect(o.data.items[0]).toMatchObject({ total_cost: 3000, estimated_cost: 3500 });
  });

  it('get_checklist hides completed items by default', async () => {
    const r = await call(fam.token, 'get_checklist', { wedding_id: wA.id });
    expect(r.data.progress).toEqual({ completed: 1, total: 2 });
    expect(r.data.groups[0].items.map((i) => i.title)).toEqual(['Send invites']);
    const all = await call(fam.token, 'get_checklist', { wedding_id: wA.id, include_completed: true });
    expect(all.data.groups[0].items.map((i) => i.title)).toEqual(['Book hall', 'Send invites']);
    expect(all.text).not.toContain('Orphan');
  });
});

describe('MCP auditing', () => {
  it('writes an mcp_read activity log row for wedding-scoped calls', async () => {
    const r = await call(owner.token, 'get_checklist', { wedding_id: wA.id, include_completed: true });
    expect(r.isError).toBe(false);
    let rows = [];
    for (let i = 0; i < 40 && !rows.length; i++) {
      const { data } = await admin.from('activity_logs')
        .select('user_email, user_name, action_type, entity_type, description, details, created_by_id')
        .eq('wedding_id', wA.id).eq('entity_type', 'get_checklist').eq('user_email', owner.email);
      rows = data ?? [];
      if (!rows.length) await new Promise((res) => setTimeout(res, 100));
    }
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({
      action_type: 'mcp_read', description: 'AI agent read via MCP', user_name: 'Owner Person', created_by_id: owner.id,
    });
    expect(JSON.parse(rows[0].details).args).toMatchObject({ wedding_id: wA.id, include_completed: true });
  });

  it('does not log calls to weddings the caller cannot access', async () => {
    await call(owner.token, 'get_checklist', { wedding_id: wB.id });
    await new Promise((res) => setTimeout(res, 300));
    const { data } = await admin.from('activity_logs').select('id').eq('wedding_id', wB.id).eq('action_type', 'mcp_read').eq('user_email', owner.email);
    expect(data).toEqual([]);
  });
});
