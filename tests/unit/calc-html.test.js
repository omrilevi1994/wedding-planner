import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const html = readFileSync(fileURLToPath(new URL('../../calc.html', import.meta.url)), 'utf8');

describe('calc.html shell', () => {
  it('is Hebrew RTL', () => {
    expect(html).toMatch(/<html lang="he" dir="rtl">/);
  });
  it('has the canonical /calc URL', () => {
    expect(html).toContain('<link rel="canonical" href="https://wedflow.live/calc" />');
  });
  it('has a Hebrew title and meta description', () => {
    expect(html).toMatch(/<title>[^<]*חתונה[^<]*<\/title>/);
    expect(html).toMatch(/<meta\s+name="description"\s+content="[^"]{40,}"/);
  });
  it('places the H1 and intro statically (pre-hydration, outside the React root)', () => {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    expect(h1).not.toBeNull();
    expect(h1[1]).toContain('כמה תעלה');
    // H1 appears before the React root div in source order
    expect(html.indexOf('<h1')).toBeLessThan(html.indexOf('id="calc-root"'));
  });
  it('has Open Graph + SoftwareApplication JSON-LD', () => {
    expect(html).toContain('property="og:title"');
    expect(html).toContain('"@type": "SoftwareApplication"');
  });
  it('mounts calc-main and links back to the app', () => {
    expect(html).toContain('src="/src/calc-main.jsx"');
    expect(html).toContain('href="/app"');
  });
});
