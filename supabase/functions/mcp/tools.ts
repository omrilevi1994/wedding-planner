// WedFlow MCP tools: definitions (JSON Schema generated from one param spec), argument
// validation, role checks and implementations. Pure module — the RLS-scoped Supabase
// client is injected via ToolContext; no Deno APIs.
import {
  type Access,
  type Any,
  budgetTotals,
  canSeeGuestContact,
  canSeeMoney,
  canSeeVendorCosts,
  canSeeVendors,
  confirmedPeople,
  type Db,
  fetchAll,
  GUEST_STATUSES,
  guestCounts,
  isSideScoped,
  mergeWeddingSettings,
  MONEY_STATUS_PAID,
  MONEY_STATUSES,
  moneyRefusal,
  normalizeEnum,
  resolveAccess,
  searchTokens,
  seatedPeople,
  tokenOrFilter,
  ToolError,
  vendorRefusal,
} from './access.ts';

export interface ToolContext {
  db: Db;
  userId: string;
  /** Override "today" (tests). */
  today?: () => Date;
}

type ParamType = 'string' | 'integer' | 'boolean' | 'date';
interface ParamSpec {
  type: ParamType;
  description: string;
  required?: boolean;
  minimum?: number;
  maximum?: number;
  default?: unknown;
}
type Args = Record<string, Any>;

interface ToolDef {
  name: string;
  title: string;
  description: string;
  params: Record<string, ParamSpec>;
  run: (ctx: ToolContext, args: Args, access: Access | null) => Promise<Record<string, unknown>>;
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
export const ROW_CAP = 2000; // get_seating / get_checklist / aggregate inputs
const SUMMARY_CAP = 20_000; // rows aggregated by get_wedding_summary / get_budget
const MAX_STRING = 200;

// ---------------------------------------------------------------- param specs
const P = {
  wedding_id: { type: 'string', required: true, description: 'Wedding id from list_weddings.' },
  limit: { type: 'integer', minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT, description: `Page size (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT}).` },
  offset: { type: 'integer', minimum: 0, default: 0, description: 'Number of items to skip (default 0).' },
} satisfies Record<string, ParamSpec>;

const GUEST_STATUS_DOC =
  "Guest RSVP status. Stored values are Hebrew: 'הוזמן' (invited), 'אישר' (confirmed), 'אולי' (maybe), " +
  "'לא מגיע' (declined), 'הגיע' (arrived, on the day). You may pass either the Hebrew value or the English " +
  "word (invited/confirmed/maybe/declined/arrived), or 'none' for guests with no status.";
const MONEY_STATUS_DOC = "Status: 'שולם' (paid) or 'מתוכנן' (planned/unpaid); English 'paid'/'planned' also accepted.";

// ---------------------------------------------------------------- validation
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isRealDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function validateArgs(def: Pick<ToolDef, 'params'>, raw: unknown): Args {
  if (raw == null) raw = {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new ToolError('arguments must be an object');
  const input = raw as Record<string, unknown>;
  for (const k of Object.keys(input)) {
    if (!(k in def.params)) throw new ToolError(`unknown argument '${k}'`);
  }
  const out: Args = {};
  for (const [name, spec] of Object.entries(def.params)) {
    const v = input[name];
    if (v === undefined || v === null) {
      if (spec.required) throw new ToolError(`'${name}' is required`);
      if (spec.default !== undefined) out[name] = spec.default;
      continue;
    }
    switch (spec.type) {
      case 'string':
        if (typeof v !== 'string' || !v.trim()) throw new ToolError(`'${name}' must be a non-empty string`);
        if (v.length > MAX_STRING) throw new ToolError(`'${name}' is too long (max ${MAX_STRING} characters)`);
        out[name] = v.trim();
        break;
      case 'date':
        if (typeof v !== 'string' || !isRealDate(v)) throw new ToolError(`'${name}' must be a date in YYYY-MM-DD format`);
        out[name] = v;
        break;
      case 'boolean':
        if (typeof v !== 'boolean') throw new ToolError(`'${name}' must be a boolean`);
        out[name] = v;
        break;
      case 'integer':
        if (typeof v !== 'number' || !Number.isInteger(v)) throw new ToolError(`'${name}' must be an integer`);
        if (spec.minimum != null && v < spec.minimum) throw new ToolError(`'${name}' must be >= ${spec.minimum}`);
        if (spec.maximum != null && v > spec.maximum) throw new ToolError(`'${name}' must be <= ${spec.maximum}`);
        out[name] = v;
        break;
    }
  }
  return out;
}

function inputSchema(params: Record<string, ParamSpec>) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, s] of Object.entries(params)) {
    const prop: Record<string, unknown> = s.type === 'date'
      ? { type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }
      : { type: s.type };
    prop.description = s.description;
    if (s.minimum != null) prop.minimum = s.minimum;
    if (s.maximum != null) prop.maximum = s.maximum;
    if (s.default !== undefined) prop.default = s.default;
    properties[name] = prop;
    if (s.required) required.push(name);
  }
  return { type: 'object', properties, ...(required.length ? { required } : {}), additionalProperties: false };
}

// ---------------------------------------------------------------- query helpers
function dbFail(what: string, error: { message?: string } | null): never {
  throw new Error(`${what} failed: ${error?.message ?? 'unknown error'}`);
}

/** Paginated list: `build()` returns a fresh query with select(cols, { count: 'exact' }) + order. */
async function paged(build: () => Any, args: Args, map: (r: Any) => Any = (r) => r) {
  const { limit, offset } = args as { limit: number; offset: number };
  const { data, error, count } = await build().range(offset, offset + limit - 1);
  if (error) {
    if (error.code === 'PGRST103') { // offset past the end
      const { count: total, error: e2 } = await build().limit(1);
      if (e2) dbFail('count', e2);
      return { items: [], total: total ?? 0, limit, offset };
    }
    dbFail('query', error);
  }
  return { items: (data ?? []).map(map), total: count ?? 0, limit, offset };
}

async function loadWedding(db: Db, weddingId: string) {
  const [w, s] = await Promise.all([
    db.from('weddings')
      .select('id, couple_names, wedding_date, venue, event_manager_name, reception_time, ceremony_time, budget_target, expected_guests, currency, cost_calc_mode, plan')
      .eq('id', weddingId).maybeSingle(),
    db.from('wedding_settings')
      .select('wedding_date, venue, event_manager_name, reception_time, ceremony_time, budget_target, expected_guests, currency, cost_calc_mode')
      .eq('wedding_id', weddingId).order('created_date', { ascending: true }).limit(1),
  ]);
  if (w.error) dbFail('wedding lookup', w.error);
  if (s.error) dbFail('wedding settings lookup', s.error);
  if (!w.data) throw new ToolError('wedding not found or you are not a member');
  return mergeWeddingSettings(w.data, s.data?.[0]);
}

function isoDay(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}
function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const fullName = (g: { first_name?: string | null; last_name?: string | null } | null | undefined) =>
  g ? [g.first_name, g.last_name].filter(Boolean).join(' ') : null;

/** Load checklist groups + items, dropping orphan items exactly like src/pages/Checklist.jsx. */
async function loadChecklist(db: Db, wid: string, itemCols: string, cap: number) {
  const [groups, items] = await Promise.all([
    fetchAll(() => db.from('checklist_groups').select('id, title, order').eq('wedding_id', wid)
      .order('order', { ascending: true }).order('id'), cap),
    fetchAll(() => db.from('checklist_items').select(itemCols).eq('wedding_id', wid)
      .order('order', { ascending: true, nullsFirst: false }).order('id'), cap),
  ]);
  const groupIds = new Set(groups.rows.map((g: Any) => g.id));
  const visible = items.rows.filter((i: Any) => groupIds.has(i.group));
  return { groups: groups.rows, items: visible, truncated: groups.truncated || items.truncated };
}

// ---------------------------------------------------------------- guest shaping
const GUEST_BASE_COLS = 'id, first_name, last_name, side, relationship, status, total_people, confirmed_people, children_count, table_id';
function guestCols(access: Access) {
  let cols = GUEST_BASE_COLS;
  if (canSeeGuestContact(access.role)) cols += ', phone, notes';
  if (canSeeMoney(access.role)) cols += ', gift_amount, gift_received';
  return `${cols}, table:tables(name)`;
}
function shapeGuest(g: Any) {
  const { table, ...rest } = g;
  return { ...rest, table_name: table?.name ?? null };
}

// ---------------------------------------------------------------- tools
const TOOLS: ToolDef[] = [
  {
    name: 'list_weddings',
    title: 'List my weddings',
    description: 'List the weddings you are a member of, with your role in each (owner, coplanner, event_manager, family). ' +
      'Call this first: every other tool needs a wedding_id from here. What you can see depends on your role.',
    params: {},
    async run(ctx) {
      const { data, error } = await ctx.db.from('wedding_members')
        .select('role, wedding_id, weddings(id, couple_names, wedding_date, venue)')
        .eq('user_id', ctx.userId)
        .order('created_date', { ascending: true });
      if (error) dbFail('list weddings', error);
      const rows = (data ?? []).filter((r: Any) => r.weddings);
      const ids = rows.map((r: Any) => r.wedding_id);
      const settings = new Map<string, Any>();
      if (ids.length) {
        const { data: s, error: se } = await ctx.db.from('wedding_settings')
          .select('wedding_id, wedding_date, venue').in('wedding_id', ids).order('created_date', { ascending: true });
        if (se) dbFail('wedding settings lookup', se);
        for (const row of s ?? []) if (!settings.has(row.wedding_id)) settings.set(row.wedding_id, row);
      }
      const weddings = rows.map((r: Any) => {
        const w = mergeWeddingSettings(r.weddings, settings.get(r.wedding_id));
        return { id: w.id, couple_names: w.couple_names, wedding_date: w.wedding_date ?? null, venue: w.venue ?? null, role: r.role };
      });
      return { weddings };
    },
  },
  {
    name: 'get_wedding_summary',
    title: 'Wedding summary',
    description: 'Overview of one wedding: date, venue, ceremony/reception times, event manager, currency, guest counts ' +
      '(invited/confirmed/declined people and children, broken down by status and by side), checklist progress, ' +
      'and - for the couple and co-planners only - budget target, committed and paid amounts.',
    params: { wedding_id: P.wedding_id },
    async run(ctx, args, access) {
      const a = access!;
      const wid = args.wedding_id;
      const today = isoDay(ctx.today?.() ?? new Date());
      const [w, guests, checklist, expenses] = await Promise.all([
        loadWedding(ctx.db, wid),
        fetchAll(() => ctx.db.from('guests').select('status, side, total_people, confirmed_people, children_count')
          .eq('wedding_id', wid).order('id'), SUMMARY_CAP),
        loadChecklist(ctx.db, wid, 'group, completed', SUMMARY_CAP),
        canSeeMoney(a.role)
          ? fetchAll(() => ctx.db.from('expenses')
            .select('amount, status, paid_by_party, has_deposit, deposit_amount, deposit_status, probability')
            .eq('wedding_id', wid).order('id'), SUMMARY_CAP)
          : Promise.resolve(null),
      ]);
      const weddingDate = (w.wedding_date as string | null) ?? null;
      const out: Record<string, unknown> = {
        wedding: {
          id: w.id,
          couple_names: w.couple_names,
          wedding_date: weddingDate,
          days_until_wedding: weddingDate ? daysBetween(today, weddingDate) : null,
          venue: w.venue ?? null,
          ceremony_time: w.ceremony_time ?? null,
          reception_time: w.reception_time ?? null,
          event_manager_name: w.event_manager_name ?? null,
          currency: w.currency ?? null,
          expected_guests: w.expected_guests ?? null,
        },
        your_role: a.role,
        guests: { ...guestCounts(guests.rows), ...(guests.truncated ? { truncated: true } : {}) },
        checklist: {
          completed: checklist.items.filter((i: Any) => i.completed).length,
          total: checklist.items.length,
        },
      };
      if (expenses) {
        const target = w.budget_target != null ? Number(w.budget_target) : null;
        out.budget = budgetTotals(expenses.rows, target);
      }
      return out;
    },
  },
  {
    name: 'search_guests',
    title: 'Search guests',
    description: 'Search and filter the guest list. Returns name, side, relationship, status, people counts ' +
      '(total_people invited, confirmed_people, children_count) and table; phone/notes and gift fields only when your ' +
      'role allows. Family members only see guests on their own side(s). ' + GUEST_STATUS_DOC,
    params: {
      wedding_id: P.wedding_id,
      query: { type: 'string', description: 'Substring of first/last name (or phone, if your role can see phones). Multiple words must all match.' },
      side: { type: 'string', description: "Exact side value, e.g. 'חתן' (groom), 'כלה' (bride), 'כלה - אבא' (bride's father). See get_wedding_summary guests.by_side for the values used." },
      status: { type: 'string', description: GUEST_STATUS_DOC },
      table_id: { type: 'string', description: 'Only guests seated at this table (id from get_seating).' },
      unseated: { type: 'boolean', description: 'true: only guests without a table; false: only seated guests.' },
      limit: P.limit,
      offset: P.offset,
    },
    async run(ctx, args, access) {
      const a = access!;
      if (isSideScoped(a.role) && a.sides.length === 0) {
        return { items: [], total: 0, limit: args.limit, offset: args.offset, note: 'No guest sides are assigned to you in this wedding.' };
      }
      const searchCols = canSeeGuestContact(a.role) ? ['first_name', 'last_name', 'phone'] : ['first_name', 'last_name'];
      const tokens = args.query ? searchTokens(args.query) : [];
      if (args.query && !tokens.length) throw new ToolError("'query' has no searchable characters");
      const build = () => {
        let q = ctx.db.from('guests').select(guestCols(a), { count: 'exact' }).eq('wedding_id', a.weddingId);
        if (isSideScoped(a.role)) q = q.in('side', a.sides);
        if (args.side) q = q.eq('side', args.side);
        if (args.status) {
          const st = normalizeEnum(args.status, GUEST_STATUSES);
          q = st.toLowerCase() === 'none' ? q.or('status.is.null,status.eq.""') : q.eq('status', st);
        }
        if (args.table_id) q = q.eq('table_id', args.table_id);
        if (args.unseated === true) q = q.is('table_id', null);
        if (args.unseated === false) q = q.not('table_id', 'is', null);
        for (const t of tokens) q = q.or(tokenOrFilter(t, searchCols));
        return q.order('last_name').order('first_name').order('id');
      };
      return await paged(build, args, shapeGuest);
    },
  },
  {
    name: 'get_seating',
    title: 'Seating plan',
    description: 'Seating plan: guest tables (id, name, capacity, element_type) with seated_people, free_seats and the ' +
      'guests at each table, non-seating layout elements (stage/bar), and how many guests are still unseated. ' +
      "seated_people counts confirmed_people when set, otherwise total_people. Family members see every table's counts " +
      'but only the names of guests on their own side(s).',
    params: { wedding_id: P.wedding_id },
    async run(ctx, args, access) {
      const a = access!;
      const wid = args.wedding_id;
      const ownSides = new Set(a.sides);
      const canName = (g: Any) => !isSideScoped(a.role) || ownSides.has(g.side);
      const [tables, seated, unseated] = await Promise.all([
        fetchAll(() => ctx.db.from('tables').select('id, name, capacity, element_type').eq('wedding_id', wid)
          .order('name').order('id'), ROW_CAP),
        fetchAll(() => ctx.db.from('guests')
          .select('id, first_name, last_name, side, status, total_people, confirmed_people, table_id')
          .eq('wedding_id', wid).not('table_id', 'is', null).order('last_name').order('first_name').order('id'), ROW_CAP),
        fetchAll(() => ctx.db.from('guests').select('side, status, total_people, confirmed_people')
          .eq('wedding_id', wid).is('table_id', null).order('id'), ROW_CAP),
      ]);
      const byTable = new Map<string, Any[]>();
      for (const g of seated.rows as Any[]) {
        const list = byTable.get(g.table_id) ?? [];
        list.push(g);
        byTable.set(g.table_id, list);
      }
      const isSeating = (t: Any) => !t.element_type || t.element_type === 'table';
      const outTables = (tables.rows as Any[]).filter(isSeating).map((t) => {
        const gs = byTable.get(t.id) ?? [];
        const people = gs.reduce((s, g) => s + seatedPeople(g), 0);
        const visible = gs.filter(canName);
        const row: Record<string, unknown> = {
          id: t.id, name: t.name, capacity: t.capacity, element_type: t.element_type ?? 'table',
          seated_people: people,
          free_seats: t.capacity != null ? Number(t.capacity) - people : null,
          guests: visible.map((g) => ({
            id: g.id, name: fullName(g), side: g.side, status: g.status, people: seatedPeople(g),
          })),
        };
        if (visible.length < gs.length) row.other_side_guest_records = gs.length - visible.length;
        return row;
      });
      const unseatedRows = unseated.rows as Any[];
      return {
        tables: outTables,
        layout_elements: (tables.rows as Any[]).filter((t) => !isSeating(t))
          .map((t) => ({ id: t.id, name: t.name, element_type: t.element_type })),
        totals: {
          tables: outTables.length,
          capacity: outTables.reduce((s, t) => s + (Number(t.capacity) || 0), 0),
          seated_people: outTables.reduce((s, t) => s + (t.seated_people as number), 0),
        },
        unseated: {
          guest_records: unseatedRows.length,
          people: unseatedRows.reduce((s, g) => s + seatedPeople(g), 0),
          confirmed_guest_records: unseatedRows.filter((g) => g.status === GUEST_STATUSES.confirmed).length,
          confirmed_people: unseatedRows.filter((g) => g.status === GUEST_STATUSES.confirmed)
            .reduce((s, g) => s + confirmedPeople(g), 0),
        },
        ...(tables.truncated || seated.truncated || unseated.truncated ? { truncated: true } : {}),
      };
    },
  },
  {
    name: 'list_vendors',
    title: 'List vendors',
    description: 'Vendors (supplier name, category, contact person, phone, email, notes). Costs and contract details are ' +
      'included only for the couple and co-planners. Not available to family members.',
    params: {
      wedding_id: P.wedding_id,
      category: { type: 'string', description: 'Exact category value (as returned in results).' },
      limit: P.limit,
      offset: P.offset,
    },
    async run(ctx, args, access) {
      const a = access!;
      if (!canSeeVendors(a.role)) throw new ToolError(vendorRefusal(a.role));
      let cols = 'id, name, category, contact_person, phone, email, notes';
      if (canSeeVendorCosts(a.role)) cols += ', estimated_cost, total_cost, contract_details';
      const build = () => {
        let q = ctx.db.from('vendors').select(cols, { count: 'exact' }).eq('wedding_id', a.weddingId);
        if (args.category) q = q.eq('category', args.category);
        return q.order('category').order('name').order('id');
      };
      return await paged(build, args);
    },
  },
  {
    name: 'get_budget',
    title: 'Budget overview',
    description: 'Budget overview (couple and co-planners only): budget target; committed, paid and expected totals ' +
      "(expenses paid by parents/'other' are excluded from totals, matching the app dashboard; expected weights unpaid " +
      'amounts by probability); totals by category and by status; upcoming payments due in the next 60 days and overdue unpaid payments.',
    params: { wedding_id: P.wedding_id },
    async run(ctx, args, access) {
      const a = access!;
      if (!canSeeMoney(a.role)) throw new ToolError(moneyRefusal(a.role));
      const wid = args.wedding_id;
      const today = isoDay(ctx.today?.() ?? new Date());
      const horizon = addDays(today, 60);
      const payCols = 'id, expense_id, expense_vendor, amount, due_date, status, paid_by, probability';
      const [w, expenses, upcoming, overdue] = await Promise.all([
        loadWedding(ctx.db, wid),
        fetchAll(() => ctx.db.from('expenses')
          .select('category, amount, status, paid_by_party, has_deposit, deposit_amount, deposit_status, probability')
          .eq('wedding_id', wid).order('id'), SUMMARY_CAP),
        fetchAll(() => ctx.db.from('payments').select(payCols).eq('wedding_id', wid)
          .neq('status', MONEY_STATUS_PAID).gte('due_date', today).lte('due_date', horizon)
          .order('due_date').order('id'), ROW_CAP),
        fetchAll(() => ctx.db.from('payments').select(payCols).eq('wedding_id', wid)
          .neq('status', MONEY_STATUS_PAID).lt('due_date', today)
          .order('due_date').order('id'), ROW_CAP),
      ]);
      const rows = expenses.rows as Any[];
      const byCategory = new Map<string, { category: string; expenses: number; amount: number; paid: number }>();
      const byStatus = new Map<string, { status: string; expenses: number; amount: number }>();
      for (const e of rows) {
        const c = byCategory.get(e.category) ?? { category: e.category, expenses: 0, amount: 0, paid: 0 };
        c.expenses += 1;
        c.amount += Number(e.amount) || 0;
        c.paid += e.status === MONEY_STATUS_PAID ? Number(e.amount) || 0
          : (e.has_deposit && e.deposit_status === MONEY_STATUS_PAID ? Number(e.deposit_amount) || 0 : 0);
        byCategory.set(e.category, c);
        const st = e.status || '(none)';
        const s = byStatus.get(st) ?? { status: st, expenses: 0, amount: 0 };
        s.expenses += 1;
        s.amount += Number(e.amount) || 0;
        byStatus.set(st, s);
      }
      const sum = (ps: Any[]) => ps.reduce((s, p) => s + (Number(p.amount) || 0), 0);
      // payments' status is null for some legacy rows; neq() drops nulls, so those are not listed.
      return {
        currency: w.currency ?? null,
        totals: budgetTotals(rows, w.budget_target != null ? Number(w.budget_target) : null),
        by_category: [...byCategory.values()].sort((x, y) => y.amount - x.amount),
        by_status: [...byStatus.values()],
        upcoming_payments: { from: today, to: horizon, count: upcoming.rows.length, amount: sum(upcoming.rows), items: upcoming.rows },
        overdue_payments: { before: today, count: overdue.rows.length, amount: sum(overdue.rows), items: overdue.rows },
        ...(expenses.truncated || upcoming.truncated || overdue.truncated ? { truncated: true } : {}),
      };
    },
  },
  {
    name: 'list_expenses',
    title: 'List expenses',
    description: 'Expenses (couple and co-planners only): vendor, category, amount, status, who pays (paid_by_party), ' +
      'payment method, due/paid dates, deposit details, probability (%) and notes. ' + MONEY_STATUS_DOC,
    params: {
      wedding_id: P.wedding_id,
      category: { type: 'string', description: 'Exact category value (as returned in results).' },
      status: { type: 'string', description: MONEY_STATUS_DOC },
      limit: P.limit,
      offset: P.offset,
    },
    async run(ctx, args, access) {
      const a = access!;
      if (!canSeeMoney(a.role)) throw new ToolError(moneyRefusal(a.role));
      const build = () => {
        let q = ctx.db.from('expenses')
          .select('id, vendor, category, amount, status, paid_by_party, payment_method, due_date, paid_date, has_deposit, deposit_amount, deposit_status, deposit_due_date, deposit_paid_date, probability, notes', { count: 'exact' })
          .eq('wedding_id', a.weddingId);
        if (args.category) q = q.eq('category', args.category);
        if (args.status) q = q.eq('status', normalizeEnum(args.status, MONEY_STATUSES));
        return q.order('due_date', { ascending: true, nullsFirst: false }).order('id');
      };
      return await paged(build, args);
    },
  },
  {
    name: 'list_payments',
    title: 'List payments',
    description: 'Payment schedule (couple and co-planners only): vendor, amount, due date, status, paid date, who paid. ' +
      'Each expense has one or two mirrored payment rows (deposit + balance). ' + MONEY_STATUS_DOC,
    params: {
      wedding_id: P.wedding_id,
      status: { type: 'string', description: MONEY_STATUS_DOC },
      due_before: { type: 'date', description: 'Only payments due strictly before this date (YYYY-MM-DD).' },
      limit: P.limit,
      offset: P.offset,
    },
    async run(ctx, args, access) {
      const a = access!;
      if (!canSeeMoney(a.role)) throw new ToolError(moneyRefusal(a.role));
      const build = () => {
        let q = ctx.db.from('payments')
          .select('id, expense_id, expense_vendor, amount, due_date, status, paid_date, paid_by, probability, notes', { count: 'exact' })
          .eq('wedding_id', a.weddingId);
        if (args.status) q = q.eq('status', normalizeEnum(args.status, MONEY_STATUSES));
        if (args.due_before) q = q.lt('due_date', args.due_before);
        return q.order('due_date', { ascending: true, nullsFirst: false }).order('id');
      };
      return await paged(build, args);
    },
  },
  {
    name: 'list_gifts',
    title: 'List gifts',
    description: 'Gifts received (couple and co-planners only): description, event, amount, payment method, notes and the giving guest\'s name.',
    params: { wedding_id: P.wedding_id, limit: P.limit, offset: P.offset },
    async run(ctx, args, access) {
      const a = access!;
      if (!canSeeMoney(a.role)) throw new ToolError(moneyRefusal(a.role));
      const build = () => ctx.db.from('gifts')
        .select('id, description, event, amount, payment_method, notes, guest_id, guest:guests(first_name, last_name)', { count: 'exact' })
        .eq('wedding_id', a.weddingId)
        .order('created_date', { ascending: false }).order('id');
      return await paged(build, args, ({ guest, ...g }: Any) => ({ ...g, guest_name: fullName(guest) }));
    },
  },
  {
    name: 'get_checklist',
    title: 'Checklist',
    description: 'The planning checklist: groups (in order) with their items (title, completed, notes) and overall progress. ' +
      'By default only open (not completed) items are listed; progress always counts all items.',
    params: {
      wedding_id: P.wedding_id,
      include_completed: { type: 'boolean', default: false, description: 'Also list completed items (default false).' },
    },
    async run(ctx, args) {
      const { groups, items, truncated } = await loadChecklist(ctx.db, args.wedding_id, 'id, title, completed, notes, group', ROW_CAP);
      const byGroup = new Map<string, Any[]>();
      for (const i of items as Any[]) {
        if (!args.include_completed && i.completed) continue;
        const list = byGroup.get(i.group) ?? [];
        list.push({ id: i.id, title: i.title, completed: !!i.completed, notes: i.notes ?? null });
        byGroup.set(i.group, list);
      }
      const completed = (items as Any[]).filter((i) => i.completed).length;
      return {
        progress: { completed, total: items.length },
        groups: (groups as Any[]).map((g) => {
          const all = (items as Any[]).filter((i) => i.group === g.id);
          return {
            id: g.id, title: g.title,
            completed: all.filter((i) => i.completed).length, total: all.length,
            items: byGroup.get(g.id) ?? [],
          };
        }),
        ...(truncated ? { truncated: true } : {}),
      };
    },
  },
];

const BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

export function hasTool(name: string) { return BY_NAME.has(name); }

export function listTools() {
  return TOOLS.map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: inputSchema(t.params),
    annotations: { title: t.title, readOnlyHint: true, openWorldHint: false },
  }));
}

export interface ToolCallOutcome {
  result: { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
  /** Set when a wedding-scoped call succeeded (caller audits it). */
  audit?: { weddingId: string; tool: string; args: Args };
}

export function toolError(text: string): ToolCallOutcome {
  return { result: { isError: true, content: [{ type: 'text', text }] } };
}

/** Run a known tool. Never throws: failures become MCP tool errors (isError: true). */
export async function callTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolCallOutcome> {
  const def = BY_NAME.get(name);
  if (!def) return toolError(`unknown tool '${name}'`);
  try {
    const args = validateArgs(def, rawArgs);
    const scoped = 'wedding_id' in def.params;
    const access = scoped ? await resolveAccess(ctx.db, args.wedding_id) : null;
    const obj = await def.run(ctx, args, access);
    return {
      result: { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }], structuredContent: obj },
      ...(scoped ? { audit: { weddingId: args.wedding_id, tool: name, args } } : {}),
    };
  } catch (e) {
    if (e instanceof ToolError) return toolError(e.message);
    console.error(`[mcp] tool ${name} failed:`, e);
    return toolError(`Internal error while running ${name}. Please try again later.`);
  }
}
