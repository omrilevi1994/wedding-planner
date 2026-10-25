// Pure helpers for the WedFlow MCP server: roles/visibility, domain enums, money
// calculations and query utilities. No Deno APIs or remote imports here, so vitest can
// import this module directly (the Supabase client is always injected).

// deno-lint-ignore no-explicit-any
export type Any = any;

/** Minimal structural view of a supabase-js client (injected; RLS-scoped user client). */
export interface Db {
  from: (table: string) => Any;
  rpc: (fn: string, args?: Record<string, unknown>) => Any;
}

export type Role = 'owner' | 'coplanner' | 'event_manager' | 'family';
export const ROLES: readonly Role[] = ['owner', 'coplanner', 'event_manager', 'family'];

export interface Access {
  weddingId: string;
  role: Role;
  /** Raw wedding_members.role, or 'platform_admin' when access comes from the admin flag. */
  memberRole: string;
  isPlatformAdmin: boolean;
  /** Family members: the guest `side` values they may see. Empty for other roles. */
  sides: string[];
}

/** Thrown for problems the agent should see as an MCP tool error (isError: true). */
export class ToolError extends Error {}

export const NOT_MEMBER = 'wedding not found or you are not a member';

// ---- role capabilities (docs/mcp.md "Role-based visibility") ----
export const canSeeMoney = (r: Role) => r === 'owner' || r === 'coplanner';
export const canSeeVendors = (r: Role) => r !== 'family';
export const canSeeVendorCosts = (r: Role) => canSeeMoney(r);
/** phone/notes: owner/coplanner, and family (who only ever see their own sides). */
export const canSeeGuestContact = (r: Role) => r !== 'event_manager';
export const isSideScoped = (r: Role) => r === 'family';

export function moneyRefusal(role: Role): string {
  return `Budget and money data (budget, expenses, payments, gifts) is only available to the couple and co-planners; your role in this wedding is '${role}'.`;
}
export function vendorRefusal(role: Role): string {
  return `Vendor information is not available to your role in this wedding ('${role}').`;
}

/**
 * Resolve the caller's role in a wedding using the SQL helpers, called as the user
 * (they key off auth.uid()). Platform admins count as owner.
 */
export async function resolveAccess(db: Db, weddingId: string): Promise<Access> {
  const [roleRes, adminRes] = await Promise.all([
    db.rpc('wedding_role', { wid: weddingId }),
    db.rpc('is_platform_admin'),
  ]);
  if (roleRes.error) throw new Error(`wedding_role failed: ${roleRes.error.message}`);
  if (adminRes.error) throw new Error(`is_platform_admin failed: ${adminRes.error.message}`);
  const memberRole: string | null = roleRes.data ?? null;
  const isPlatformAdmin = adminRes.data === true;

  if (isPlatformAdmin) {
    // Admins pass RLS for every wedding, so make sure the id actually exists.
    const { data, error } = await db.from('weddings').select('id').eq('id', weddingId).maybeSingle();
    if (error) throw new Error(`wedding lookup failed: ${error.message}`);
    if (!data) throw new ToolError(NOT_MEMBER);
    return { weddingId, role: 'owner', memberRole: memberRole ?? 'platform_admin', isPlatformAdmin, sides: [] };
  }
  if (!memberRole || !(ROLES as readonly string[]).includes(memberRole)) throw new ToolError(NOT_MEMBER);
  const role = memberRole as Role;
  let sides: string[] = [];
  if (role === 'family') {
    const { data, error } = await db.rpc('wedding_member_sides', { wid: weddingId });
    if (error) throw new Error(`wedding_member_sides failed: ${error.message}`);
    sides = Array.isArray(data) ? data.filter((s: unknown) => typeof s === 'string' && s) : [];
  }
  return { weddingId, role, memberRole, isPlatformAdmin, sides };
}

// ---- domain enums (values are stored in Hebrew; see src/components/guests/GuestForm.jsx) ----
export const GUEST_STATUSES: Record<string, string> = {
  invited: 'הוזמן',
  confirmed: 'אישר',
  maybe: 'אולי',
  declined: 'לא מגיע',
  arrived: 'הגיע',
};
export const GUEST_STATUS_CONFIRMED = 'אישר';
export const GUEST_STATUS_DECLINED = 'לא מגיע';
export const GUEST_STATUS_ARRIVED = 'הגיע';
/** Expense / payment / deposit status (src/components/expenses/ExpenseForm.jsx). */
export const MONEY_STATUSES: Record<string, string> = { paid: 'שולם', planned: 'מתוכנן' };
export const MONEY_STATUS_PAID = 'שולם';
/** Expenses paid by these parties are excluded from the couple's totals (Dashboard.jsx). */
export const NON_BILLABLE_PARTIES = ['אחר', 'הורים'];

/** Map an English alias to the stored value; unknown values pass through unchanged. */
export function normalizeEnum(value: string, aliases: Record<string, string>): string {
  const v = value.trim();
  return aliases[v.toLowerCase()] ?? v;
}

// ---- guest people counts (mirror src/pages/Guests.jsx / Dashboard.jsx) ----
export interface GuestCountRow {
  status?: string | null;
  side?: string | null;
  total_people?: number | null;
  confirmed_people?: number | null;
  children_count?: number | null;
}
export const invitedPeople = (g: GuestCountRow) => Number(g.total_people) || 1;
export const confirmedPeople = (g: GuestCountRow) =>
  g.confirmed_people != null ? Number(g.confirmed_people) : invitedPeople(g);
export const childrenPeople = (g: GuestCountRow) =>
  Math.min(Number(g.children_count) || 0, invitedPeople(g));
/** People occupying seats (SeatingPlan.jsx). */
export const seatedPeople = (g: GuestCountRow) => confirmedPeople(g);

export function guestCounts(guests: GuestCountRow[]) {
  const totals = { guest_records: 0, invited_people: 0, confirmed_people: 0, declined_people: 0, arrived_people: 0, children: 0 };
  const byStatus = new Map<string, { status: string; guest_records: number; people: number }>();
  const bySide = new Map<string, { side: string; guest_records: number; invited_people: number; confirmed_people: number; children: number }>();
  for (const g of guests) {
    const invited = invitedPeople(g);
    const isConfirmed = g.status === GUEST_STATUS_CONFIRMED;
    totals.guest_records += 1;
    totals.invited_people += invited;
    totals.children += childrenPeople(g);
    if (isConfirmed) totals.confirmed_people += confirmedPeople(g);
    if (g.status === GUEST_STATUS_DECLINED) totals.declined_people += invited;
    if (g.status === GUEST_STATUS_ARRIVED) totals.arrived_people += confirmedPeople(g);

    const st = g.status || '(none)';
    const s = byStatus.get(st) ?? { status: st, guest_records: 0, people: 0 };
    s.guest_records += 1;
    s.people += isConfirmed || g.status === GUEST_STATUS_ARRIVED ? confirmedPeople(g) : invited;
    byStatus.set(st, s);

    const sd = g.side || '(none)';
    const d = bySide.get(sd) ?? { side: sd, guest_records: 0, invited_people: 0, confirmed_people: 0, children: 0 };
    d.guest_records += 1;
    d.invited_people += invited;
    d.children += childrenPeople(g);
    if (isConfirmed) d.confirmed_people += confirmedPeople(g);
    bySide.set(sd, d);
  }
  return { ...totals, by_status: [...byStatus.values()], by_side: [...bySide.values()] };
}

// ---- money (mirror src/pages/Dashboard.jsx) ----
export interface ExpenseRow {
  amount?: number | null;
  status?: string | null;
  paid_by_party?: string | null;
  has_deposit?: boolean | null;
  deposit_amount?: number | null;
  deposit_status?: string | null;
  probability?: number | null;
  category?: string | null;
}
export const isBillable = (e: ExpenseRow) => !NON_BILLABLE_PARTIES.includes(e.paid_by_party ?? '');

export function expensePaid(e: ExpenseRow): number {
  const amount = Number(e.amount) || 0;
  if (e.has_deposit && e.deposit_amount) {
    const dep = Number(e.deposit_amount);
    return (e.deposit_status === MONEY_STATUS_PAID ? dep : 0) + (e.status === MONEY_STATUS_PAID ? amount - dep : 0);
  }
  return e.status === MONEY_STATUS_PAID ? amount : 0;
}

/** Unpaid remainder weighted by `probability` (percent, default 100). */
export function expensePlannedWeighted(e: ExpenseRow): number {
  const prob = (Number(e.probability) || 100) / 100;
  const amount = Number(e.amount) || 0;
  if (e.has_deposit && e.deposit_amount) {
    const dep = Number(e.deposit_amount);
    return ((e.deposit_status !== MONEY_STATUS_PAID ? dep : 0) + (e.status !== MONEY_STATUS_PAID ? amount - dep : 0)) * prob;
  }
  return e.status !== MONEY_STATUS_PAID ? amount * prob : 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function budgetTotals(expenses: ExpenseRow[], budgetTarget: number | null) {
  const billable = expenses.filter(isBillable);
  const committed = billable.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const paid = billable.reduce((s, e) => s + expensePaid(e), 0);
  const plannedWeighted = billable.reduce((s, e) => s + expensePlannedWeighted(e), 0);
  const expected = paid + plannedWeighted;
  const paidByOthers = expenses.filter((e) => !isBillable(e)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  return {
    budget_target: budgetTarget,
    committed: round2(committed),
    paid: round2(paid),
    remaining_to_pay: round2(committed - paid),
    expected_total: round2(expected),
    remaining_budget: budgetTarget != null ? round2(budgetTarget - expected) : null,
    excluded_paid_by_parents_or_other: round2(paidByOthers),
  };
}

// ---- wedding fields: wedding_settings (edited on the Settings page) wins, weddings fills gaps ----
export const WEDDING_FIELDS = [
  'wedding_date', 'venue', 'event_manager_name', 'reception_time', 'ceremony_time',
  'budget_target', 'expected_guests', 'currency', 'cost_calc_mode',
] as const;

export function mergeWeddingSettings(
  wedding: Record<string, unknown>,
  settings: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...wedding };
  for (const f of WEDDING_FIELDS) {
    const s = settings?.[f];
    if (s != null && s !== '') out[f] = s;
  }
  return out;
}

// ---- query helpers ----
/** Split a free-text search into PostgREST-safe tokens (letters, digits, - and '). */
export function searchTokens(query: string): string[] {
  return query
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}\-']/gu, ''))
    .filter(Boolean)
    .slice(0, 5);
}

/** Build a PostgREST `or` filter matching one token against several columns (substring). */
export function tokenOrFilter(token: string, columns: string[]): string {
  return columns.map((c) => `${c}.ilike.*${token}*`).join(',');
}

export const PAGE_SIZE = 1000; // matches supabase/config.toml [api] max_rows

/**
 * Fetch up to `cap` rows by paging with .range(). `build` must return a fresh query
 * (with a deterministic order) each call.
 */
export async function fetchAll<T = Any>(
  build: () => Any,
  cap: number,
): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from <= cap; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE, cap + 1) - 1; // fetch one extra row past cap to detect truncation
    const { data, error } = await build().range(from, to);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < to - from + 1) break;
  }
  const truncated = rows.length > cap;
  return { rows: truncated ? rows.slice(0, cap) : rows, truncated };
}

// ---- rate limiting (in-memory, per isolate, best effort) ----
export function createRateLimiter(limit = 60, windowMs = 60_000, now: () => number = Date.now) {
  const hits = new Map<string, number[]>();
  return {
    /** Records a hit; returns 0 if allowed, else seconds until the next slot frees up. */
    hit(key: string): number {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((ts) => t - ts < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return Math.max(1, Math.ceil((recent[0] + windowMs - t) / 1000));
      }
      recent.push(t);
      hits.set(key, recent);
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (!v.length || t - v[v.length - 1] >= windowMs) hits.delete(k);
      }
      return 0;
    },
  };
}
