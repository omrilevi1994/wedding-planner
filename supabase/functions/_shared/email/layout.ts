// The master WedFlow email shell: RTL doc, dark/light-safe <style>, wordmark header,
// content card, footer. Content is supplied by templates as an HTML string.

import { brand, colors, fonts, layout as L } from './theme.ts';

const LT = colors.light;
const DK = colors.dark;

export interface LayoutInput {
  /** Hidden inbox-preview line (first ~90 chars shown next to the subject). */
  preheader: string;
  /** Rendered card content (headings, paragraphs, buttons…). */
  content: string;
  appUrl?: string;
}

/** prefers-color-scheme:dark overrides, keyed to the data-t hooks in components/layout. */
function darkStyles(): string {
  return `
    @media (prefers-color-scheme: dark) {
      body, [data-t="body"] { background-color:${DK.pageBg} !important; }
      [data-t="card"] { background-color:${DK.card} !important; border-color:${DK.border} !important; }
      [data-t="ink"] { color:${DK.ink} !important; }
      [data-t="muted"] { color:${DK.muted} !important; }
      [data-t="gold"], [data-t="diamond"] { color:${DK.gold} !important; }
      [data-t="rule"] { background-color:${DK.gold} !important; }
      [data-t="btn"] { background-color:${DK.gold} !important; }
      [data-t="btntext"] { color:${DK.btnText} !important; }
      [data-t="info"] { background-color:${DK.goldSoft} !important; border-color:${DK.border} !important; }
      [data-t="footer"] { color:${DK.footer} !important; }
      [data-t="wordmark"] { color:${DK.gold} !important; }
    }`;
}

export function renderLayout({ preheader, content, appUrl = brand.appUrl }: LayoutInput): string {
  const year = 2026; // stamped by caller/config; keep static for deterministic render.
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="he" dir="rtl" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${brand.name}</title>
  <style>
    body { margin:0; padding:0; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table { border-collapse:collapse; }
    img { border:0; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
    a { text-decoration:none; }
    @media only screen and (max-width:620px) {
      .wf-container { width:100% !important; }
      .wf-card { padding:28px 22px !important; }
    }
    ${darkStyles()}
  </style>
</head>
<body data-t="body" style="margin:0;padding:0;background-color:${LT.pageBg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${LT.pageBg};">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" data-t="body" style="background-color:${LT.pageBg};">
    <tr>
      <td align="center" style="padding:32px 16px 40px;">
        <table role="presentation" class="wf-container" width="${L.maxWidth}" cellpadding="0" cellspacing="0" style="width:${L.maxWidth}px;max-width:${L.maxWidth}px;">

          <!-- Header: engraved wordmark -->
          <tr>
            <td align="center" style="padding:4px 0 22px;">
              <div data-t="wordmark" style="font-family:${fonts.display};font-size:30px;letter-spacing:1px;font-weight:400;color:${LT.gold};">${brand.name}</div>
              <div data-t="muted" style="font-family:${fonts.body};font-size:11px;letter-spacing:3px;color:${LT.muted};text-transform:uppercase;margin-top:4px;">תכנון חתונות</div>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td data-t="card" class="wf-card" dir="rtl" style="background-color:${LT.card};border:1px solid ${LT.border};border-radius:${L.radius}px;padding:38px 40px;text-align:right;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 20px 0;">
              <p data-t="footer" style="font-family:${fonts.body};font-size:12px;line-height:1.7;color:${LT.footer};margin:0;">
                נשלח באהבה מ־<a data-t="gold" href="${appUrl}" target="_blank" style="color:${LT.gold};text-decoration:none;">${brand.name}</a><br />
                © ${year} ${brand.name} · תכנון החתונה שלכם, במקום אחד
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
