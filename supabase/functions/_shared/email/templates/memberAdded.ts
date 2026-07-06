// Member added — sent to an EXISTING WedFlow user who was attached to a wedding.
// No auth link needed; deep-links straight into the app.

import { renderLayout } from '../layout.ts';
import { button, divider, esc, eyebrow, heading, infoCard, note, paragraph } from '../components.ts';

interface Data {
  inviterName?: string;
  weddingName?: string;
  roleLabel?: string;
  actionUrl?: string;
}

export function subject(d: Data): string {
  const w = d.weddingName || 'חתונה';
  return `נוספתם לתכנון ${w}`;
}

export function html(d: Data): string {
  const inviter = esc(d.inviterName || 'מארגן/ת החתונה');
  const wedding = esc(d.weddingName || 'החתונה');
  const url = d.actionUrl || 'https://wedflow.live';

  const content = `
    ${eyebrow('עדכון')}
    ${heading('יש לכם חתונה חדשה לתכנן')}
    ${paragraph(`<strong data-t="ink" style="color:inherit;">${inviter}</strong> צירף/ה אתכם לתכנון של <strong data-t="ink" style="color:inherit;">${wedding}</strong>. הכל כבר מחכה לכם בחשבון — פשוט היכנסו כדי להתחיל.`)}
    ${infoCard([
      { label: 'החתונה', value: d.weddingName || 'החתונה' },
      { label: 'התפקיד שלכם', value: d.roleLabel || 'בן/בת משפחה' },
    ])}
    ${divider()}
    <div style="text-align:center;">
      ${button('כניסה ל-WedFlow', url)}
    </div>
    ${note('החתונה תופיע ברשימת החתונות שלכם מיד עם הכניסה.')}
  `;

  return renderLayout({
    preheader: `${d.inviterName || 'מישהו'} צירף/ה אתכם לתכנון ${d.weddingName || 'החתונה'}`,
    content,
  });
}

export function text(d: Data): string {
  const inviter = d.inviterName || 'מארגן/ת החתונה';
  const wedding = d.weddingName || 'החתונה';
  const role = d.roleLabel || 'בן/בת משפחה';
  return [
    `נוספתם לתכנון ${wedding}`,
    ``,
    `${inviter} צירף/ה אתכם לתכנון של ${wedding}.`,
    `התפקיד שלכם: ${role}`,
    ``,
    `כניסה ל-WedFlow:`,
    d.actionUrl || 'https://wedflow.live',
    ``,
    `— WedFlow`,
  ].join('\n');
}
