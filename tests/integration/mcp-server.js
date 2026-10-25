// Spawns the `mcp` edge function under Deno on the host for integration tests.
// (The local edge-runtime container isn't required: the function is plain Deno.)
// Requires `deno` on PATH and the local Supabase stack running.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { admin } from './setup.js';
import { createKeys, seal } from '../../supabase/functions/mcp/seal.ts';

const ENTRY = path.resolve(__dirname, '../../supabase/functions/mcp/index.ts');

/**
 * Starts the MCP with its own upstream Supabase OAuth client (confidential, redirect
 * `<url>/callback`) — what scripts/register-mcp-oauth-client.mjs does for a real project.
 * Returns { url, upstreamClientId, wrap, stop, output }.
 */
export async function startMcp({ port = 8000 + Math.floor(Math.random() * 900) } = {}) {
  const url = `http://127.0.0.1:${port}/mcp`;
  const tokenSecret = crypto.randomBytes(32).toString('base64url');
  const { data: upstream, error } = await admin.auth.admin.oauth.createClient({
    client_name: 'WedFlow MCP (vitest)',
    redirect_uris: [`${url}/callback`],
    client_type: 'confidential',
    token_endpoint_auth_method: 'client_secret_basic',
  });
  if (error) throw error;

  // --node-modules-dir=none: don't let Deno resolve npm deps from the frontend's
  // package.json/node_modules; --no-lock: don't write a deno.lock into the repo.
  const args = ['run', '--node-modules-dir=none', '--no-lock', '--allow-net', '--allow-env', ENTRY];
  const child = spawn('deno', args, {
    env: {
      ...process.env,
      PORT: String(port),
      SUPABASE_URL: process.env.VITE_SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      MCP_PUBLIC_URL: url,
      MCP_TOKEN_SECRET: tokenSecret,
      MCP_UPSTREAM_CLIENT_ID: upstream.client_id,
      MCP_UPSTREAM_CLIENT_SECRET: upstream.client_secret,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });

  const stop = async () => {
    child.kill();
    await admin.auth.admin.oauth.deleteClient(upstream.client_id).catch(() => {});
  };

  const deadline = Date.now() + 60_000; // first run downloads jsr/npm deps
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`mcp server exited:\n${output}`);
    try {
      const res = await fetch(`${url}/.well-known/oauth-protected-resource`);
      if (res.ok) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (Date.now() >= deadline) {
    await stop();
    throw new Error(`mcp server did not start:\n${output}`);
  }

  const keys = await createKeys(tokenSecret);
  /**
   * Mint an agent access token around an existing Supabase access token, with a fresh
   * mcp_connections row — for tool tests that don't need to walk the OAuth flow
   * (tests/integration/mcp-oauth.test.js does).
   */
  async function wrap(userId, supabaseToken, { clientName = 'vitest agent' } = {}) {
    const { data, error: e } = await admin.from('mcp_connections')
      .insert({ user_id: userId, client_name: clientName, redirect_host: 'localhost' }).select('id').single();
    if (e) throw e;
    const token = await seal(keys, 'access', { at: supabaseToken, cid: data.id, ch: 'vitest', exp: Date.now() + 3600_000 });
    return { token, connectionId: data.id };
  }

  return { url, upstreamClientId: upstream.client_id, wrap, stop, output: () => output };
}
