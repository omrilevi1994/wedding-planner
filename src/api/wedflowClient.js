import { supabase } from '@/lib/supabaseClient';
import { TABLE_MAP } from '@/api/entities-config';

// sort strings: 'field' asc, '-field' desc
export function parseSort(sortBy) {
  if (!sortBy) return null;
  const ascending = !sortBy.startsWith('-');
  const column = ascending ? sortBy : sortBy.slice(1);
  return { column, ascending };
}

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

function entityApi(entityName) {
  const table = TABLE_MAP[entityName];
  return {
    async list(sortBy) {
      let q = supabase.from(table).select('*');
      const s = parseSort(sortBy);
      if (s) q = q.order(s.column, { ascending: s.ascending });
      return unwrap(await q);
    },
    async filter(query = {}, sortBy) {
      let q = supabase.from(table).select('*');
      for (const [k, v] of Object.entries(query)) q = q.eq(k, v);
      const s = parseSort(sortBy);
      if (s) q = q.order(s.column, { ascending: s.ascending });
      return unwrap(await q);
    },
    async get(id) {
      return unwrap(await supabase.from(table).select('*').eq('id', id).single());
    },
    async create(data) {
      return unwrap(await supabase.from(table).insert(data).select().single());
    },
    async update(id, data) {
      return unwrap(await supabase.from(table).update(data).eq('id', id).select().single());
    },
    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return { success: true };
    },
    async bulkCreate(rows) {
      return unwrap(await supabase.from(table).insert(rows).select());
    },
    async bulkUpdate(updates) {
      // updates: [{id, ...fields}] — upsert on primary key
      return unwrap(await supabase.from(table).upsert(updates).select());
    },
  };
}

const entities = new Proxy({}, {
  get: (_t, name) => entityApi(String(name)),
});

const auth = {
  // Returns the app-shaped user: merged auth user + profile fields
  async me() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', user.id).single();
    return {
      id: user.id,
      email: user.email,
      full_name: profile?.full_name ?? user.email,
      is_platform_admin: profile?.is_platform_admin ?? false,
      tours_seen: profile?.tours_seen ?? {},
    };
  },
  async isAuthenticated() {
    const { data: { session } } = await supabase.auth.getSession();
    return !!session;
  },
  async signInWithPassword({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },
  async signUp({ email, password, full_name }) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name } },
    });
    if (error) throw error;
    return data;
  },
  async signInWithGoogle() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/app` },
    });
    if (error) throw error;
    return data;
  },
  onAuthStateChange(cb) {
    return supabase.auth.onAuthStateChange(cb);
  },
  async logout() {
    await supabase.auth.signOut();
  },
  // Consumes an invite's one-time token_hash. Must only be called from an explicit
  // user action (button click) — never automatically on page load — so that email
  // security scanners prefetching the invite link can't burn the token before the
  // real recipient clicks it. See AcceptInvite.jsx.
  async acceptInvite({ token_hash, type }) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (error) throw error;
    return data;
  },
  async setPassword(password) {
    const { data, error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    return data;
  },
  redirectToLogin() {
    // Unauthenticated visits to /app render the Login screen (see App.jsx).
    window.location.href = '/app';
  },
};

const BUCKET = 'uploads';

// Files are stored under a per-wedding folder so Storage RLS can scope them (see 0016).
// We persist the object PATH (not a public URL); reads mint a short-lived signed URL.
export function buildUploadPath(weddingId, fileName) {
  return `${weddingId}/${crypto.randomUUID()}-${fileName}`;
}

const integrations = {
  Core: {
    async UploadFile({ file, weddingId }) {
      if (!weddingId) throw new Error('weddingId is required to upload a file');
      const path = buildUploadPath(weddingId, file.name);
      const { error } = await supabase.storage.from(BUCKET).upload(path, file);
      if (error) throw error;
      return { file_path: path };
    },
    async getSignedUrl(path) {
      if (!path) return null;
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
    async DeleteFile(path) {
      if (!path) return;
      const { error } = await supabase.storage.from(BUCKET).remove([path]);
      if (error) throw error;
    },
  },
};

const functions = {
  async invoke(name, body) {
    const { data, error } = await supabase.functions.invoke(name, { body });
    if (error) throw error;
    return data;
  },
};

const appLogs = { logUserInApp: async () => {} }; // no-op

const users = {
  async inviteUser(payload) {
    const { data, error } = await supabase.functions.invoke('inviteUserToWedding', { body: payload });
    if (error) throw error;
    return data;
  },
};

// Reads the JSON error body an edge function returned alongside a non-2xx status (supabase-js
// only puts a generic "non-2xx status code" string on error.message; the useful `error`/`message`
// fields the function actually sent live on error.context, a Response, and must be parsed).
async function unwrapFunctionError(error) {
  try {
    const body = await error?.context?.json?.();
    if (body?.message || body?.error) return new Error(body.message || body.error);
  } catch { /* body wasn't JSON / already consumed — fall through to the generic message */ }
  return error;
}

const weddingInviteLinks = {
  // Shareable, multi-use, 2-day link that lets anyone holding it join as a collaborator
  // (never as owner) — distinct from inviteUserToWedding's per-email flow.
  async create({ wedding_id, role = 'coplanner', wedding_sides = [], max_guests = null }) {
    const { data, error } = await supabase.functions.invoke('createWeddingInviteLink', { body: { wedding_id, role, wedding_sides, max_guests } });
    if (error) throw await unwrapFunctionError(error);
    return data;
  },
  async join({ token }) {
    const { data, error } = await supabase.functions.invoke('joinWeddingViaLink', { body: { token } });
    if (error) throw await unwrapFunctionError(error);
    return data;
  },
};

export const wedflow = { entities, auth, integrations, functions, appLogs, users, weddingInviteLinks };
export default wedflow;
