import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { capture } from '@/lib/posthog';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submitCalculatorLead`;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// "Email me the breakdown" — always visible below the (never-gated) result. Plain fetch to the
// public edge function; the calculator keeps working regardless of capture success.
export default function LeadCaptureBlock({ snapshot }) {
  const [email, setEmail] = React.useState('');
  const [state, setState] = React.useState('idle'); // idle | sending | done | error
  const [err, setErr] = React.useState('');

  async function submit(e) {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setErr('כתובת אימייל לא תקינה'); return; }
    setErr(''); setState('sending');
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
        body: JSON.stringify({
          email: email.trim(),
          guestCount: snapshot?.guestCount ?? null,
          costPerHead: snapshot?.costPerHead ?? null,
          totalCost: snapshot?.totalCost ?? null,
          budgetStatus: snapshot?.budgetStatus ?? null,
          payload: snapshot?.inputs ?? {},
        }),
      });
      if (!res.ok) throw new Error('bad status');
      setState('done');
      capture('calc_lead_submitted', { budget_status: snapshot?.budgetStatus ?? null });
    } catch {
      setState('error'); setErr('לא הצלחנו לשמור כרגע, נסו שוב');
    }
  }

  if (state === 'done') {
    return (
      <div className="rounded-2xl border border-sage/40 bg-sage/10 px-5 py-6 text-center">
        <p className="text-lg font-bold text-sage-deep">שלחנו לכם את החישוב 🎉</p>
        <p className="text-sm text-muted-foreground mt-1">בדקו את תיבת הדואר שלכם.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-rose/30 bg-card px-5 py-6 space-y-3">
      <p className="font-semibold text-foreground">שלחו לעצמכם את החישוב במייל</p>
      <div className="flex gap-2">
        <Input
          type="email" dir="ltr" placeholder="you@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={state === 'sending'} className="bg-rose-deep text-white hover:opacity-90">
          {state === 'sending' ? 'שולח…' : 'שלחו לי'}
        </Button>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
    </form>
  );
}
