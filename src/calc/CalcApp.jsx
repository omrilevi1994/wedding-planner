import React from 'react';
import VenueCalculator from '@/components/dashboard/VenueCalculator';
import LeadCaptureBlock from '@/calc/LeadCaptureBlock';
import { capture } from '@/lib/posthog';

// Standalone calculator page body: the shared VenueCalculator (venue-only), the lead-capture
// block, and a persistent bridge CTA into the full app. No auth, no providers.
export default function CalcApp() {
  const [snapshot, setSnapshot] = React.useState(null);

  const onCta = (location) => capture('calc_cta_clicked', { location });

  return (
    <div className="mt-2 space-y-6">
      <VenueCalculator showSystemExpenses={false} onCompute={setSnapshot} />

      <LeadCaptureBlock snapshot={snapshot} />

      {/* Persistent bridge CTA */}
      <div className="text-center rounded-2xl border border-rose/30 bg-champagne/60 px-5 py-6">
        <p className="font-semibold text-rose-deep mb-3">רוצים לעקוב אחרי כל התקציב, לא רק האולם?</p>
        <a
          href="/app"
          onClick={() => onCta('bridge')}
          className="inline-block rounded-full bg-rose-deep px-6 py-2.5 font-bold text-white hover:opacity-90 transition"
        >
          התחילו בחינם ב-WedFlow
        </a>
      </div>
    </div>
  );
}
