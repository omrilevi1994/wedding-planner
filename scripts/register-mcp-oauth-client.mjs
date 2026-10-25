// Registers the MCP's single upstream OAuth client ("WedFlow MCP") with a Supabase project and
// stores its credentials — plus a fresh MCP_TOKEN_SECRET and MCP_PUBLIC_URL — as edge-function
// secrets, without printing any of them. See docs/mcp.md "Configuration / deploy".
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/register-mcp-oauth-client.mjs --project-ref <ref> --public-url https://wedflow.live/mcp
//
// Options:
//   --rotate        an existing "WedFlow MCP" client gets a new secret (otherwise: abort)
//   --keep-token-secret  don't (re)generate MCP_TOKEN_SECRET (rotating it logs every agent out)
//   --dry-run       create nothing; show what would happen
import ws from 'ws';
globalThis.WebSocket = globalThis.WebSocket || ws;
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const NAME = 'WedFlow MCP';
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

const projectRef = opt('--project-ref');
const publicUrl = (opt('--public-url') || '').replace(/\/+$/, '');
const url = process.env.SUPABASE_URL || (projectRef && `https://${projectRef}.supabase.co`);
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!projectRef || !publicUrl || !url || !serviceKey) {
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=… node scripts/register-mcp-oauth-client.mjs --project-ref <ref> --public-url <https://…/mcp> [--rotate] [--keep-token-secret] [--dry-run]');
  process.exit(1);
}
if (!/^https:\/\//.test(publicUrl) && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(publicUrl)) {
  console.error('--public-url must be https (or loopback for local testing)');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const redirect = `${publicUrl}/callback`;

const { data: list, error: listErr } = await admin.auth.admin.oauth.listClients();
if (listErr) throw listErr;
const existing = (list?.clients ?? []).filter((c) => c.client_name === NAME);

let client;
if (existing.length) {
  const c = existing[0];
  console.log(`Found existing "${NAME}" client ${c.client_id} (redirects: ${(c.redirect_uris || []).join(', ')})`);
  if (!flag('--rotate')) {
    console.error('Re-run with --rotate to issue it a new secret, or delete it in the dashboard (Authentication → OAuth Apps).');
    process.exit(1);
  }
  if (!(c.redirect_uris || []).includes(redirect)) {
    console.error(`Its redirect URIs don't include ${redirect}; update it in the dashboard first.`);
    process.exit(1);
  }
  if (flag('--dry-run')) { console.log('[dry-run] would regenerate its secret'); process.exit(0); }
  const { data, error } = await admin.auth.admin.oauth.regenerateClientSecret(c.client_id);
  if (error) throw error;
  client = data;
} else {
  if (flag('--dry-run')) { console.log(`[dry-run] would create confidential client "${NAME}" → ${redirect}`); process.exit(0); }
  const { data, error } = await admin.auth.admin.oauth.createClient({
    client_name: NAME,
    redirect_uris: [redirect],
    client_type: 'confidential',
    token_endpoint_auth_method: 'client_secret_basic',
  });
  if (error) throw error;
  client = data;
}

const secrets = {
  MCP_UPSTREAM_CLIENT_ID: client.client_id,
  MCP_UPSTREAM_CLIENT_SECRET: client.client_secret,
  MCP_PUBLIC_URL: publicUrl,
  ...(flag('--keep-token-secret') ? {} : { MCP_TOKEN_SECRET: crypto.randomBytes(48).toString('base64url') }),
};

// Hand the values to the CLI through a private temp file so they never hit argv or stdout.
const dir = mkdtempSync(path.join(tmpdir(), 'wedflow-mcp-'));
const envFile = path.join(dir, 'secrets.env');
try {
  writeFileSync(envFile, Object.entries(secrets).map(([k, v]) => `${k}=${v}`).join('\n') + '\n', { mode: 0o600 });
  execFileSync('supabase', ['secrets', 'set', '--env-file', envFile, '--project-ref', projectRef], { stdio: ['ignore', 'ignore', 'inherit'] });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`Upstream client ${client.client_id} → ${redirect}`);
console.log(`Set secrets on ${projectRef}: ${Object.keys(secrets).join(', ')}`);
