// Email preview harness — renders all WedFlow email templates to standalone
// .html files for visual QA. The email module is Deno-style TypeScript with
// explicit .ts import extensions, which Node can't import directly, so we use
// esbuild to bundle render.ts (a pure dependency graph — layout/components/
// theme/templates; it does NOT import send.ts) into an ESM string, then import
// it via a data: URL.
//
// Usage: node scripts/email-preview.mjs

import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const renderEntry = resolve(repoRoot, 'supabase/functions/_shared/email/render.ts');
const outDir = resolve(repoRoot, '.email-preview');

// --- 1. Bundle render.ts into a single ESM string -------------------------
const result = await build({
  entryPoints: [renderEntry],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  write: false,
  logLevel: 'warning',
});

const bundleCode = result.outputFiles[0].text;

// --- 2. Import the bundle via a data: URL ----------------------------------
const dataUrl = 'data:text/javascript;base64,' + Buffer.from(bundleCode).toString('base64');
const { renderEmail } = await import(dataUrl);

// --- 3. Realistic Hebrew sample data ---------------------------------------
const sample = {
  inviterName: 'דניאל',
  weddingName: 'החתונה של דניאל ועומרי',
  roleLabel: 'בן/בת משפחה',
  actionUrl: 'https://wedflow.live/invite?token=sample',
  recipientEmail: 'guest@example.com',
};

const templateIds = [
  'weddingInvite',
  'memberAdded',
  'authVerification',
  'authPasswordReset',
  'authMagicLink',
];

// --- 4. Render + write each template ---------------------------------------
await mkdir(outDir, { recursive: true });

const written = [];
const indexRows = [];

for (const id of templateIds) {
  const { subject, html } = renderEmail(id, sample);
  const filePath = resolve(outDir, `${id}.html`);
  await writeFile(filePath, html, 'utf8');
  written.push(filePath);
  indexRows.push(
    `      <li><a href="./${id}.html"><code>${id}</code></a> — <span dir="rtl">${subject}</span></li>`
  );
  console.log(`rendered ${id.padEnd(18)} -> ${filePath}`);
}

// --- 5. Write index.html linking to all templates -------------------------
const indexHtml = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WedFlow Email Previews</title>
  <style>
    body { font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif; margin: 2rem auto; max-width: 720px; padding: 0 1rem; color: #1a1a1a; }
    h1 { font-size: 1.5rem; }
    li { margin: 0.5rem 0; line-height: 1.6; }
    code { background: #f2f2f2; padding: 0.1rem 0.35rem; border-radius: 4px; }
    a { color: #b8336a; }
  </style>
</head>
<body>
  <h1>WedFlow Email Previews</h1>
  <p>Rendered from <code>supabase/functions/_shared/email/</code>. Open each to QA visually.</p>
  <ul>
${indexRows.join('\n')}
  </ul>
</body>
</html>
`;

const indexPath = resolve(outDir, 'index.html');
await writeFile(indexPath, indexHtml, 'utf8');
written.push(indexPath);

// --- 6. Report -------------------------------------------------------------
console.log(`\nOutput directory: ${outDir}`);
console.log('Generated files:');
for (const f of written) console.log(`  ${f}`);
console.log(`\nOpen: ${pathToFileURL(indexPath).href}`);
console.log(`\nDone — ${templateIds.length} templates + index.html.`);
