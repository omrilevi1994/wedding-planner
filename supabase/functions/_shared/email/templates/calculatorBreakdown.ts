// Sent when a /calc visitor asks to "email me the breakdown". RTL Hebrew, uses the shared
// brand layout/components. Bridges to the full platform with an /app CTA.

import { renderLayout } from '../layout.ts';
import { button, divider, eyebrow, heading, infoCard, note, paragraph } from '../components.ts';

interface Data {
  guestCount?: number | null;
  costPerHead?: number | null;
  totalCost?: number | null;
  budgetStatus?: string | null;
}

const APP_URL = 'https://wedflow.live/app';
const shekel = (n: unknown): string => `₪${(Math.round(Number(n) || 0)).toLocaleString('he-IL')}`;
const STATUS_LABEL: Record<string, string> = {
  ok: '✓ בתקציב', warn: '⚠ קרוב לגבול', over: '✗ חורג מהתקציב',
};

function rows(d: Data): Array<{ label: string; value: string }> {
  const r = [
    { label: 'מספר מוזמנים', value: d.guestCount != null ? String(d.guestCount) : '—' },
    { label: 'עלות אולם לראש', value: d.costPerHead != null ? shekel(d.costPerHead) : '—' },
    { label: 'סה״כ עלות', value: d.totalCost != null ? shekel(d.totalCost) : '—' },
  ];
  if (d.budgetStatus && STATUS_LABEL[d.budgetStatus]) {
    r.push({ label: 'סטטוס תקציב', value: STATUS_LABEL[d.budgetStatus] });
  }
  return r;
}

export function subject(_d: Data): string {
  return 'החישוב שלכם: כמה תעלה החתונה';
}

export function html(d: Data): string {
  const content = `
    ${eyebrow('מחשבון WedFlow')}
    ${heading('החישוב שלכם')}
    ${paragraph('הנה סיכום עלות החתונה שחישבתם במחשבון WedFlow.')}
    ${infoCard(rows(d))}
    ${divider()}
    ${paragraph('רוצים לעקוב אחרי כל התקציב, לא רק האולם? נהלו את כל החתונה במקום אחד ב-WedFlow — מוזמנים, ספקים, תשלומים וצ׳קליסט.')}
    <div style="text-align:center;">
      ${button('להתחיל בחינם ב-WedFlow', APP_URL)}
    </div>
    ${note('קיבלתם את המייל הזה כי ביקשתם לשלוח לעצמכם את החישוב מהמחשבון של WedFlow.')}
  `;
  return renderLayout({ preheader: 'סיכום עלות החתונה שחישבתם ב-WedFlow', content });
}

export function text(d: Data): string {
  return [
    'החישוב שלכם — WedFlow',
    '',
    `מספר מוזמנים: ${d.guestCount != null ? d.guestCount : '—'}`,
    `עלות אולם לראש: ${d.costPerHead != null ? shekel(d.costPerHead) : '—'}`,
    `סה״כ עלות: ${d.totalCost != null ? shekel(d.totalCost) : '—'}`,
    d.budgetStatus && STATUS_LABEL[d.budgetStatus] ? `סטטוס תקציב: ${STATUS_LABEL[d.budgetStatus]}` : '',
    '',
    'רוצים לעקוב אחרי כל התקציב? התחילו בחינם:',
    APP_URL,
    '',
    '— WedFlow',
  ].filter(Boolean).join('\n');
}
