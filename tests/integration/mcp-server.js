// Spawns the `mcp` edge function under Deno on the host for integration tests.
// (The local edge-runtime container isn't required: the function is plain Deno.)
// Requires `deno` on PATH and the local Supabase stack running.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import path from 'node:path';

const ENTRY = path.resolve(__dirname, '../../supabase/functions/mcp/index.ts');

export async function startMcp({ port = 8000 + Math.floor(Math.random() * 900) } = {}) {
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
      MCP_PUBLIC_URL: `http://127.0.0.1:${port}/mcp`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (d) => { output += d; });
  child.stderr.on('data', (d) => { output += d; });

  const url = `http://127.0.0.1:${port}/mcp`;
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
    child.kill();
    throw new Error(`mcp server did not start:\n${output}`);
  }
  return { url, stop: () => child.kill(), output: () => output };
}
