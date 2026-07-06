import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

const INVITABLE_ROLES = ['coplanner', 'family', 'event_manager'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // --- Authenticate caller ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
    }

    // --- Parse + validate body ---
    const { email, wedding_id, role = 'family', wedding_sides = [], max_guests = null } = await req.json();
    if (!email || !wedding_id) {
      return Response.json({ error: 'email and wedding_id are required' }, { status: 400, headers: corsHeaders });
    }
    if (!INVITABLE_ROLES.includes(role)) {
      return Response.json({ error: `role must be one of: ${INVITABLE_ROLES.join(', ')}` }, { status: 400, headers: corsHeaders });
    }

    // --- Authorize: wedding owner or platform admin (via service client) ---
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: ownerMembership } = await service.from('wedding_members')
      .select('id').eq('wedding_id', wedding_id).eq('user_id', user.id).eq('role', 'owner').maybeSingle();
    if (!ownerMembership) {
      const { data: profile } = await service.from('profiles')
        .select('is_platform_admin').eq('id', user.id).maybeSingle();
      if (!profile?.is_platform_admin) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
      }
    }

    const normalizedEmail = String(email).toLowerCase();

    // --- Find existing user by email ---
    const { data: existingProfile, error: profileError } = await service.from('profiles')
      .select('id').eq('email', normalizedEmail).maybeSingle();
    if (profileError) {
      return Response.json({ error: profileError.message }, { status: 500, headers: corsHeaders });
    }

    let userId: string;
    let existing: boolean;
    if (existingProfile) {
      userId = existingProfile.id;
      existing = true;
    } else {
      const { data: invite, error: inviteError } = await service.auth.admin.inviteUserByEmail(normalizedEmail);
      if (inviteError) {
        return Response.json({ error: inviteError.message }, { status: 400, headers: corsHeaders });
      }
      userId = invite.user.id;
      existing = false;
    }

    // --- Upsert membership (manual, to avoid rewriting the text pk on conflict) ---
    const { data: membership } = await service.from('wedding_members')
      .select('id').eq('wedding_id', wedding_id).eq('user_id', userId).maybeSingle();
    if (membership) {
      const { error: updateError } = await service.from('wedding_members')
        .update({ role, wedding_sides, max_guests, updated_date: new Date().toISOString() })
        .eq('id', membership.id);
      if (updateError) {
        return Response.json({ error: updateError.message }, { status: 500, headers: corsHeaders });
      }
    } else {
      const { error: insertError } = await service.from('wedding_members')
        .insert({ id: crypto.randomUUID(), wedding_id, user_id: userId, role, wedding_sides, max_guests });
      if (insertError) {
        return Response.json({ error: insertError.message }, { status: 500, headers: corsHeaders });
      }
    }

    return Response.json({ invited: normalizedEmail, existing }, { headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: corsHeaders });
  }
});
