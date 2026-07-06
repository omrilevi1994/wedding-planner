// Password reset — routed through the Supabase Send Email auth hook (recovery).

import { renderLayout } from '../layout.ts';
import { button, divider, eyebrow, heading, note, paragraph, urlFallback } from '../components.ts';

interface Data {
  actionUrl?: string;
  recipientEmail?: string;
}

export function subject(_d: Data): string {
  return 'איפוס הסיסמה שלכם ב-WedFlow';
}

export function html(d: Data): string {
  const url = d.actionUrl || '#';
  const content = `
    ${eyebrow('אבטחה')}
    ${heading('איפוס סיסמה')}
    ${paragraph('קיבלנו בקשה לאפס את הסיסמה לחשבון WedFlow שלכם. לחצו על הכפתור כדי לבחור סיסמה חדשה.')}
    ${divider()}
    <div style="text-align:center;">
      ${button('בחירת סיסמה חדשה', url)}
    </div>
    ${note('הקישור תקף לזמן מוגבל. אם לא ביקשתם לאפס את הסיסמה, אפשר להתעלם מהמייל — הסיסמה שלכם לא תשתנה.')}
    ${urlFallback(url)}
  `;
  return renderLayout({
    preheader: 'בקשה לאיפוס הסיסמה של חשבון WedFlow שלכם',
    content,
  });
}

export function text(d: Data): string {
  return [
    'איפוס הסיסמה שלכם ב-WedFlow',
    '',
    'קיבלנו בקשה לאפס את הסיסמה. בחרו סיסמה חדשה:',
    d.actionUrl || '',
    '',
    'אם לא ביקשתם לאפס סיסמה, אפשר להתעלם — הסיסמה לא תשתנה.',
    '— WedFlow',
  ].join('\n');
}
