// Magic-link sign in — routed through the Supabase Send Email auth hook (magiclink).

import { renderLayout } from '../layout.ts';
import { button, divider, eyebrow, heading, note, paragraph, urlFallback } from '../components.ts';

interface Data {
  actionUrl?: string;
  recipientEmail?: string;
}

export function subject(_d: Data): string {
  return 'קישור הכניסה שלכם ל-WedFlow';
}

export function html(d: Data): string {
  const url = d.actionUrl || '#';
  const content = `
    ${eyebrow('כניסה')}
    ${heading('כניסה מהירה לחשבון')}
    ${paragraph('לחצו על הכפתור כדי להיכנס לחשבון WedFlow שלכם — הקישור מחבר אתכם אוטומטית, בלי צורך בסיסמה.')}
    ${divider()}
    <div style="text-align:center;">
      ${button('כניסה לחשבון', url)}
    </div>
    ${note('הקישור לשימוש חד-פעמי ותקף לזמן מוגבל. אם לא ביקשתם להיכנס, אפשר להתעלם מהמייל.')}
    ${urlFallback(url)}
  `;
  return renderLayout({
    preheader: 'קישור כניסה חד-פעמי לחשבון WedFlow שלכם',
    content,
  });
}

export function text(d: Data): string {
  return [
    'קישור הכניסה שלכם ל-WedFlow',
    '',
    'היכנסו לחשבון באמצעות הקישור הבא:',
    d.actionUrl || '',
    '',
    'הקישור חד-פעמי ותקף לזמן מוגבל. אם לא ביקשתם להיכנס, אפשר להתעלם.',
    '— WedFlow',
  ].join('\n');
}
