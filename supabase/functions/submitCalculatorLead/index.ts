// PUBLIC (verify_jwt=false): the /calc "email me the breakdown" endpoint. Inserts a lead
// via the service role, then best-effort sends the branded email. Insert BEFORE send so an
// email failure never loses the lead. v1 hardening: email format + numeric bounds only.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email/send.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATUS = new Set(['ok', 'warn', 'over']);

// Coerce to a non-negative number capped at `max`, or null if unusable.
function boundedNum(v: unknown, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(n, max);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      return Response.json({ error: 'invalid_email' }, { status: 400, headers: corsHeaders });
    }

    const guestCount = boundedNum(body.guestCount, 100000);
    const costPerHead = boundedNum(body.costPerHead, 1000000);
    const totalCost = boundedNum(body.totalCost, 1000000000);
    const budgetStatus = VALID_STATUS.has(body.budgetStatus) ? body.budgetStatus : null;
    const payload = (body.payload && typeof body.payload === 'object') ? body.payload : {};

    const service = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { error: insertErr } = await service.from('leads').insert({
      email, source: 'calculator',
      guest_count: guestCount, cost_per_head: costPerHead,
      total_cost: totalCost, budget_status: budgetStatus, payload,
    });
    if (insertErr) {
      console.error('leads insert failed:', insertErr.message);
      return Response.json({ error: 'save_failed' }, { status: 500, headers: corsHeaders });
    }

    // Best-effort — the lead is already persisted; email failure is logged, not fatal.
    try {
      await sendEmail({
        to: email, templateId: 'calculatorBreakdown',
        data: { guestCount, costPerHead, totalCost, budgetStatus },
      });
    } catch (e) {
      console.error('calculatorBreakdown email failed:', e instanceof Error ? e.message : String(e));
    }

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: corsHeaders },
    );
  }
});
