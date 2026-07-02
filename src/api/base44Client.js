import { supabase } from '@/lib/supabaseClient';
import { TABLE_MAP } from '@/api/entities-config';

// base44 sort strings: 'field' asc, '-field' desc
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
  // Returns the base44-shaped user: merged auth user + profile fields
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
      options: { redirectTo: window.location.origin },
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
  redirectToLogin() {
    window.location.href = '/login';
  },
};

const BUCKET = 'uploads';

const integrations = {
  Core: {
    async UploadFile({ file }) {
      const path = `${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file);
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      return { file_url: data.publicUrl };
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

export const base44 = { entities, auth, integrations, functions, appLogs, users };
export default base44;
