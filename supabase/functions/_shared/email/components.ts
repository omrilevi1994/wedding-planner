// Reusable, inline-styled HTML fragments for WedFlow emails.
// Every fragment renders LIGHT-mode inline styles and carries a data-t="..." hook so
// layout.ts's dark-mode <style> block can swap colors. Table-based for client support.

import { colors, fonts, layout } from './theme.ts';

const L = colors.light;

/** Escape user-supplied text before it enters HTML. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** The engraved-invitation divider: a hairline gold rule pierced by a small diamond. */
export function divider(): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
    <tr>
      <td style="width:44%;"><div data-t="rule" style="height:1px;background-color:${L.gold};opacity:0.55;line-height:1px;font-size:1px;">&nbsp;</div></td>
      <td style="width:12%;text-align:center;"><span data-t="diamond" style="color:${L.gold};font-size:11px;line-height:11px;">&#9670;</span></td>
      <td style="width:44%;"><div data-t="rule" style="height:1px;background-color:${L.gold};opacity:0.55;line-height:1px;font-size:1px;">&nbsp;</div></td>
    </tr>
  </table>`;
}

/** Small gold eyebrow label above a heading. */
export function eyebrow(text: string): string {
  return `<div data-t="gold" style="font-family:${fonts.body};font-size:12px;font-weight:700;letter-spacing:2px;color:${L.gold};text-transform:uppercase;margin:0 0 10px;">${esc(text)}</div>`;
}

export function heading(text: string): string {
  return `<h1 data-t="ink" style="font-family:${fonts.body};font-size:26px;line-height:1.3;font-weight:800;color:${L.ink};margin:0 0 14px;">${esc(text)}</h1>`;
}

export function paragraph(html: string): string {
  // `html` may contain <strong>/<br> from callers; callers must esc() dynamic values.
  return `<p data-t="muted" style="font-family:${fonts.body};font-size:16px;line-height:1.7;color:${L.muted};margin:0 0 16px;">${html}</p>`;
}

/** Primary call-to-action button (bulletproof, table-based). */
export function button(label: string, href: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
    <tr>
      <td data-t="btn" align="center" bgcolor="${L.gold}" style="border-radius:10px;background-color:${L.gold};">
        <a data-t="btntext" href="${esc(href)}" target="_blank" style="display:inline-block;padding:14px 34px;font-family:${fonts.body};font-size:16px;font-weight:700;color:${L.btnText};text-decoration:none;border-radius:10px;">${esc(label)}</a>
      </td>
    </tr>
  </table>`;
}

/** A soft-gold info panel of label/value rows (e.g. wedding, role). */
export function infoCard(rows: Array<{ label: string; value: string }>): string {
  const body = rows.map((r) => `
      <tr>
        <td data-t="muted" style="font-family:${fonts.body};font-size:13px;color:${L.muted};padding:3px 0;white-space:nowrap;">${esc(r.label)}</td>
        <td data-t="ink" style="font-family:${fonts.body};font-size:15px;font-weight:700;color:${L.ink};padding:3px 0 3px 14px;text-align:left;">${esc(r.value)}</td>
      </tr>`).join('');
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" data-t="info" style="background-color:${L.goldSoft};border:1px solid ${L.border};border-radius:${layout.radius - 4}px;margin:8px 0 20px;">
    <tr><td style="padding:16px 20px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${body}</table>
    </td></tr>
  </table>`;
}

/** Small muted note, e.g. link fallback or expiry. */
export function note(html: string): string {
  return `<p data-t="muted" style="font-family:${fonts.body};font-size:13px;line-height:1.6;color:${L.muted};margin:16px 0 0;">${html}</p>`;
}

/** A raw fallback URL rendered small and wrappable (for clients that strip buttons). */
export function urlFallback(href: string): string {
  return `<p data-t="muted" style="font-family:${fonts.body};font-size:12px;line-height:1.6;color:${L.muted};margin:6px 0 0;word-break:break-all;"><a data-t="gold" href="${esc(href)}" target="_blank" style="color:${L.gold};text-decoration:underline;">${esc(href)}</a></p>`;
}
