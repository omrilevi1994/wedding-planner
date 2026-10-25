// Unit tests for the pure modules of the MCP edge function (no Deno, no network).
import { describe, it, expect } from 'vitest';
import { handleMessage, negotiateVersion, LATEST_PROTOCOL_VERSION } from '../../supabase/functions/mcp/protocol.ts';
import { createHandler } from '../../supabase/functions/mcp/server.ts';
import { validateArgs, listTools } from '../../supabase/functions/mcp/tools.ts';
import {
  budgetTotals, createRateLimiter, guestCounts, mergeWeddingSettings, searchTokens,
} from '../../supabase/functions/mcp/access.ts';

const ctx = (over = {}) => ({ tool: { db: {}, userId: 'u1' }, ...over });

describe('protocol', () => {
  it('negotiates versions', () => {
    expect(negotiateVersion('2025-03-26')).toBe('2025-03-26');
    expect(negotiateVersion('2024-11-05')).toBe('2024-11-05');
    expect(negotiateVersion('2030-01-01')).toBe(LATEST_PROTOCOL_VERSION);
    expect(negotiateVersion(undefined)).toBe(LATEST_PROTOCOL_VERSION);
  });

  it('handles notifications, client responses, batches and bad envelopes', async () => {
    expect(await handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, ctx())).toEqual({ status: 202, body: null });
    expect(await handleMessage({ jsonrpc: '2.0', id: 1, result: {} }, ctx())).toEqual({ status: 202, body: null });
    expect((await handleMessage([], ctx())).body.error.code).toBe(-32600);
    expect((await handleMessage({ id: 1, method: 'ping' }, ctx())).body.error.code).toBe(-32600);
    expect((await handleMessage({ jsonrpc: '2.0', id: {}, method: 'ping' }, ctx())).body.error.code).toBe(-32600);
    expect((await handleMessage({ jsonrpc: '2.0', id: 'a', method: 'nope' }, ctx())).body).toMatchObject({ id: 'a', error: { code: -32601 } });
    expect((await handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'x' } }, ctx())).body.error.code).toBe(-32602);
  });

  it('rate-limits tools/call with a tool error and skips audit', async () => {
    let audited = 0;
    const out = await handleMessage(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'list_weddings' } },
      ctx({ rateLimit: () => 12, audit: () => { audited++; } }),
    );
    expect(out.body.result.isError).toBe(true);
    expect(out.body.result.content[0].text).toMatch(/12 seconds/);
    expect(audited).toBe(0);
  });

  it('turns bad tool arguments into tool errors (not protocol errors)', async () => {
    const out = await handleMessage(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'search_guests', arguments: { wedding_id: 'w', limit: 0 } } },
      ctx(),
    );
    expect(out.body.result).toMatchObject({ isError: true, content: [{ type: 'text', text: "'limit' must be >= 1" }] });
  });
});

describe('tools', () => {
  it('every tool has a closed object schema and read-only annotations', () => {
    const tools = listTools();
    expect(tools).toHaveLength(10);
    for (const t of tools) {
      expect(t.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
      expect(t.annotations.readOnlyHint).toBe(true);
      if (t.name !== 'list_weddings') expect(t.inputSchema.required).toContain('wedding_id');
    }
  });

  it('validateArgs applies defaults and checks types', () => {
    const def = { params: {
      wedding_id: { type: 'string', required: true, description: '' },
      limit: { type: 'integer', minimum: 1, maximum: 200, default: 50, description: '' },
      d: { type: 'date', description: '' },
      b: { type: 'boolean', default: false, description: '' },
    } };
    expect(validateArgs(def, { wedding_id: ' w1 ' })).toEqual({ wedding_id: 'w1', limit: 50, b: false });
    expect(() => validateArgs(def, {})).toThrow(/required/);
    expect(() => validateArgs(def, { wedding_id: 'w', limit: 201 })).toThrow(/<= 200/);
    expect(() => validateArgs(def, { wedding_id: 'w', limit: 1.5 })).toThrow(/integer/);
    expect(() => validateArgs(def, { wedding_id: 'w', d: '2027-02-30' })).toThrow(/YYYY-MM-DD/);
    expect(validateArgs(def, { wedding_id: 'w', d: '2028-02-29' }).d).toBe('2028-02-29');
    expect(() => validateArgs(def, { wedding_id: 'w', b: 'true' })).toThrow(/boolean/);
    expect(() => validateArgs(def, { wedding_id: 'w', x: 1 })).toThrow(/unknown argument/);
    expect(() => validateArgs(def, [])).toThrow(/object/);
  });
});

describe('access helpers', () => {
  it('guestCounts mirrors the app formulas', () => {
    const c = guestCounts([
      { status: 'אישר', side: 'כלה', total_people: 3, confirmed_people: 2, children_count: 5 },
      { status: 'לא מגיע', side: 'חתן', total_people: 2 },
      { status: null, side: 'חתן', total_people: null },
    ]);
    expect(c).toMatchObject({ guest_records: 3, invited_people: 6, confirmed_people: 2, declined_people: 2, children: 3 });
    expect(c.by_status.find((s) => s.status === '(none)')).toEqual({ status: '(none)', guest_records: 1, people: 1 });
  });

  it('budgetTotals excludes parents/other and handles deposits + probability', () => {
    const t = budgetTotals([
      { amount: 1000, status: 'מתוכנן', has_deposit: true, deposit_amount: 300, deposit_status: 'שולם', paid_by_party: 'חתן' },
      { amount: 500, status: 'מתוכנן', probability: 50, paid_by_party: 'כלה' },
      { amount: 9999, status: 'שולם', paid_by_party: 'הורים' },
    ], 2000);
    expect(t).toEqual({
      budget_target: 2000, committed: 1500, paid: 300, remaining_to_pay: 1200,
      expected_total: 1250, remaining_budget: 750, excluded_paid_by_parents_or_other: 9999,
    });
  });

  it('mergeWeddingSettings prefers non-empty settings values', () => {
    expect(mergeWeddingSettings({ id: 'w', venue: 'A', currency: '₪', wedding_date: '2027-01-01' }, { venue: 'B', currency: null, wedding_date: '' }))
      .toEqual({ id: 'w', venue: 'B', currency: '₪', wedding_date: '2027-01-01' });
    expect(mergeWeddingSettings({ id: 'w', venue: 'A' }, null)).toEqual({ id: 'w', venue: 'A' });
  });

  it('searchTokens strips PostgREST syntax characters', () => {
    expect(searchTokens('dana,cohen)  (or=*% 050-1')).toEqual(['danacohen', 'or', '050-1']);
    expect(searchTokens('דנה כהן')).toEqual(['דנה', 'כהן']);
    expect(searchTokens('*,()')).toEqual([]);
  });

  it('rate limiter allows N per window', () => {
    let now = 0;
    const rl = createRateLimiter(2, 1000, () => now);
    expect(rl.hit('a')).toBe(0);
    expect(rl.hit('a')).toBe(0);
    expect(rl.hit('a')).toBe(1);
    expect(rl.hit('b')).toBe(0);
    now = 1000;
    expect(rl.hit('a')).toBe(0);
  });
});

describe('HTTP handler', () => {
  const handler = createHandler({
    publicUrl: 'https://x.supabase.co/functions/v1/mcp',
    authorizationServer: 'https://x.supabase.co/auth/v1',
    authenticate: async (t) => (t === 'good' ? { userId: 'u', email: 'e', clientId: null, db: {} } : null),
  });
  const req = (method, path = '/mcp', headers = {}, body) =>
    handler(new Request(`http://localhost${path}`, { method, headers, body }));

  it('serves metadata on the well-known suffix under any prefix', async () => {
    for (const p of ['/mcp/.well-known/oauth-protected-resource', '/functions/v1/mcp/.well-known/oauth-protected-resource']) {
      const res = await req('GET', p);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ resource: 'https://x.supabase.co/functions/v1/mcp', authorization_servers: ['https://x.supabase.co/auth/v1'] });
    }
  });

  it('challenges missing / invalid tokens', async () => {
    const r1 = await req('POST', '/mcp', {}, '{}');
    expect(r1.status).toBe(401);
    expect(r1.headers.get('www-authenticate')).toBe('Bearer resource_metadata="https://x.supabase.co/functions/v1/mcp/.well-known/oauth-protected-resource"');
    const r2 = await req('POST', '/mcp', { authorization: 'Bearer bad' }, '{}');
    expect(r2.headers.get('www-authenticate')).toContain('error="invalid_token"');
  });

  it('rejects unsupported MCP-Protocol-Version headers and handles ping', async () => {
    const bad = await req('POST', '/mcp', { authorization: 'Bearer good', 'mcp-protocol-version': '1999-01-01' }, '{}');
    expect(bad.status).toBe(400);
    const ok = await req('POST', '/mcp', { authorization: 'Bearer good', 'mcp-protocol-version': '2025-06-18' },
      JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'ping' }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ jsonrpc: '2.0', id: 9, result: {} });
    expect(ok.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('405 for GET/DELETE, 204 for OPTIONS', async () => {
    expect((await req('GET')).status).toBe(405);
    expect((await req('DELETE')).status).toBe(405);
    expect((await req('OPTIONS')).status).toBe(204);
  });
});
