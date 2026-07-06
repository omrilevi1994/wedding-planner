// Guards the SEO acceptance criteria of the public landing page (tasks/02-landing-page.md).
// The landing page is static: everything asserted here is in the raw HTML by construction.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const html = readFileSync(fileURLToPath(new URL('../../index.html', import.meta.url)), 'utf8');
const text = html
  .replace(/<style[\s\S]*?<\/style>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/g, ' ');

describe('landing page (index.html)', () => {
  it('declares Hebrew RTL', () => {
    expect(html).toMatch(/<html lang="he" dir="rtl">/);
  });

  it('has exactly one H1 containing the primary keyword', () => {
    const h1s = html.match(/<h1[\s>]/g) ?? [];
    expect(h1s).toHaveLength(1);
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1];
    expect(h1).toContain('אפליקציה לתכנון חתונה');
  });

  it('has an H2 for every shipped feature', () => {
    const features = [
      'ניהול אורחים ואישורי הגעה',
      'סידורי הושבה',
      'ניהול ספקים ותשלומים',
      'מעקב תקציב',
      "צ'קליסט לחתונה",
      'מצב יום החתונה',
    ];
    for (const feature of features) {
      expect(html).toContain(`<h2>${feature}</h2>`);
    }
  });

  it('has a meta description and canonical URL', () => {
    expect(html).toMatch(/<meta\s+name="description"\s+content="[^"]{50,}"/);
    expect(html).toContain('<link rel="canonical" href="https://wedflow.live/" />');
  });

  it('has at least 600 words of visible content', () => {
    const words = text.split(/\s+/).filter((w) => /[֐-׿a-zA-Z0-9]/.test(w));
    expect(words.length).toBeGreaterThanOrEqual(600);
  });

  it('links the app under /app only (login CTA present)', () => {
    expect(html).toContain('href="/app"');
    expect(html).toContain('כניסה למערכת');
    // no legacy root-level app-route links
    expect(html).not.toMatch(/href="\/(Dashboard|Guests|SeatingPlan)/);
  });

  it('every image is sized and has Hebrew alt text', () => {
    const imgs = html.match(/<img[\s\S]*?\/>/g) ?? [];
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img).toMatch(/alt="[^"]*[֐-׿][^"]*"/); // descriptive Hebrew alt
      expect(img).toMatch(/width="\d+"/); // explicit dims prevent layout shift (CLS)
      expect(img).toMatch(/height="\d+"/);
    }
  });

  it('below-the-fold images lazy-load; the LCP hero image loads eagerly', () => {
    const imgs = html.match(/<img[\s\S]*?\/>/g) ?? [];
    for (const img of imgs) {
      const isHero = img.includes('fetchpriority="high"');
      if (isHero) {
        expect(img).not.toContain('loading="lazy"'); // never lazy-load the LCP image
      } else {
        expect(img).toContain('loading="lazy"');
      }
    }
  });
});
