import 'dotenv/config';
import ws from 'ws';
globalThis.WebSocket = globalThis.WebSocket || ws; // Node < 22 has no native WebSocket
import { createClient } from '@supabase/supabase-js';

export const admin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

export async function makeWedding() {
  const { data, error } = await admin.from('weddings')
    .insert({ couple_names: 'Test Couple', wedding_date: '2027-01-01' }).select().single();
  if (error) throw error;
  return data;
}

export async function makeUser(email, password = 'Passw0rd!1') {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const client = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
  await client.auth.signInWithPassword({ email, password });
  return { id: data.user.id, client };
}
