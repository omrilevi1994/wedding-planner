// Sealed (encrypted + authenticated) blobs for the MCP's OAuth server: client ids, the upstream
// `state`, authorization codes, and the access / refresh tokens agents hold. AES-256-GCM with a
// key derived from MCP_TOKEN_SECRET; the blob type is bound as additional authenticated data so
// one kind can never be opened as another. Pure WebCrypto: runs under Deno and in vitest.

export type SealType = 'client' | 'state' | 'code' | 'access' | 'refresh';

// Readable prefixes only — the type that matters is the one bound into the ciphertext.
const PREFIX: Record<SealType, string> = {
  client: 'wfc_',
  state: 'wfs_',
  code: 'wfo_',
  access: 'wfa_',
  refresh: 'wfr_',
};

export interface Keys {
  aes: CryptoKey;
  hmac: CryptoKey;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** base64url(SHA-256(text)) — PKCE S256 challenges and client-id fingerprints. */
export async function sha256(text: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export async function createKeys(secret: string): Promise<Keys> {
  if (!secret || secret.length < 32) throw new Error('MCP_TOKEN_SECRET must be at least 32 characters');
  const aesRaw = await crypto.subtle.digest('SHA-256', enc.encode(`wedflow-mcp/aes/${secret}`));
  const hmacRaw = await crypto.subtle.digest('SHA-256', enc.encode(`wedflow-mcp/hmac/${secret}`));
  return {
    aes: await crypto.subtle.importKey('raw', aesRaw, 'AES-GCM', false, ['encrypt', 'decrypt']),
    hmac: await crypto.subtle.importKey('raw', hmacRaw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
  };
}

/** Seal `payload` as `type`. Put an `exp` (epoch ms) in the payload to make it expire. */
export async function seal(keys: Keys, type: SealType, payload: Record<string, unknown>): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(`wedflow-mcp:${type}`) },
    keys.aes,
    enc.encode(JSON.stringify(payload)),
  );
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ct), iv.length);
  return PREFIX[type] + b64url(out);
}

/** Open a sealed blob of `type`. Null if malformed, tampered, of another type, or expired. */
export async function open<T extends Record<string, unknown>>(
  keys: Keys,
  type: SealType,
  token: unknown,
  now = Date.now(),
): Promise<T | null> {
  if (typeof token !== 'string' || !token.startsWith(PREFIX[type]) || token.length > 16_384) return null;
  try {
    const raw = fromB64url(token.slice(PREFIX[type].length));
    if (raw.length < 13) return null;
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: raw.slice(0, 12), additionalData: enc.encode(`wedflow-mcp:${type}`) },
      keys.aes,
      raw.slice(12),
    );
    const payload = JSON.parse(dec.decode(pt));
    if (!payload || typeof payload !== 'object') return null;
    if (typeof payload.exp === 'number' && payload.exp <= now) return null;
    return payload as T;
  } catch {
    return null;
  }
}

/** Deterministic secret for confidential dynamically-registered clients (nothing to store). */
export async function clientSecretFor(keys: Keys, clientId: string): Promise<string> {
  return b64url(await crypto.subtle.sign('HMAC', keys.hmac, enc.encode(`client-secret:${clientId}`)));
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
