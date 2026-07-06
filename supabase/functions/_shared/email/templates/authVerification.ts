// Signup email verification — routed through the Supabase Send Email auth hook.

import { renderLayout } from '../layout.ts';
import { button, divider, eyebrow, heading, note, paragraph, urlFallback } from '../components.ts';

interface Data {
  actionUrl?: string;
  recipientEmail?: string;
}

export function subject(_d: Data): string {
  return 'אימות כתובת האימייל שלכם ב-WedFlow';
}

export function html(d: Data): string {
  const url = d.actionUrl || '#';
  const content = `
    ${eyebrow('ברוכים הבאים')}
    ${heading('רק עוד צעד אחד')}
    ${paragraph('תודה שנרשמתם ל-WedFlow — כמעט סיימנו. כדי להפעיל את החשבון ולהתחיל לתכנן, נותר רק לאמת את כתובת האימייל.')}
    ${divider()}
    <div style="text-align:center;">
      ${button('אימות האימייל', url)}
    </div>
    ${note('אם לא נרשמתם ל-WedFlow, אפשר להתעלם מהמייל הזה.')}
    ${urlFallback(url)}
  `;
  return renderLayout({
    preheader: 'אמתו את כתובת האימייל כדי להפעיל את חשבון WedFlow שלכם',
    content,
  });
}

export function text(d: Data): string {
  return [
    'אימות כתובת האימייל שלכם ב-WedFlow',
    '',
    'תודה שנרשמתם! כדי להפעיל את החשבון, אמתו את כתובת האימייל:',
    d.actionUrl || '',
    '',
    'אם לא נרשמתם ל-WedFlow, אפשר להתעלם מהמייל.',
    '— WedFlow',
  ].join('\n');
}
