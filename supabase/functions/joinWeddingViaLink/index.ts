import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // --- Authenticate caller (joining requires being signed in) ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });
    }
    const caller = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await caller.auth.getUser();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors });
    }

    // --- Parse + validate body ---
    const { token } = await req.json();
    if (!token) {
      return Response.json({ error: 'token is required' }, { status: 400, headers: cors });
    }

    // --- Look up the link (service role bypasses RLS — this table has no select policy) ---
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: link, error: linkError } = await service.from('wedding_invite_links')
      .select('id, wedding_id, role, used_at, revoked_at, expires_at').eq('token', token).maybeSingle();
    if (linkError) {
      return Response.json({ error: linkError.message }, { status: 500, headers: cors });
    }
    if (!link) {
      return Response.json({ error: 'invalid_token', message: 'קישור ההזמנה אינו תקין' }, { status: 404, headers: cors });
    }

    // Already a member? Return success WITHOUT consuming the token (lets an owner test their
    // own link and lets a legitimate invitee refresh the page without burning the link).
    // Owner links transfer ownership even to an existing member, so they must NOT short-circuit.
    const isOwnerLink = link.role === 'owner';
    const { data: existingMembership } = await service.from('wedding_members')
      .select('id, role').eq('wedding_id', link.wedding_id).eq('user_id', user.id).maybeSingle();
    if (existingMembership && !isOwnerLink) {
      // Already a member of a collaborator link: return success WITHOUT consuming the token.
      const { data: w0 } = await service.from('weddings').select('couple_names').eq('id', link.wedding_id).maybeSingle();
      return Response.json({
        wedding_id: link.wedding_id, couple_names: w0?.couple_names ?? null,
        role: existingMembership.role, already_member: true,
      }, { headers: cors });
    }

    // --- Atomically claim the token (single-use). Exactly one caller can win this UPDATE. ---
    const { data: claimed, error: claimError } = await service.from('wedding_invite_links')
      .update({ used_at: new Date().toISOString(), used_by: user.id })
      .eq('token', token).is('used_at', null).is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .select('wedding_id, role, wedding_sides, max_guests').maybeSingle();
    if (claimError) {
      return Response.json({ error: claimError.message }, { status: 500, headers: cors });
    }
    if (!claimed) {
      // Claim lost — disambiguate the reason from the current row state.
      const { data: cur } = await service.from('wedding_invite_links')
        .select('used_at, revoked_at, expires_at').eq('token', token).maybeSingle();
      if (cur?.revoked_at) {
        return Response.json({ error: 'revoked_token', message: 'קישור ההזמנה בוטל' }, { status: 409, headers: cors });
      }
      if (cur?.used_at) {
        return Response.json({ error: 'used_token', message: 'קישור ההזמנה כבר נוצל' }, { status: 409, headers: cors });
      }
      return Response.json({ error: 'expired_token', message: 'קישור ההזמנה פג תוקף' }, { status: 410, headers: cors });
    }

    // Stored role is trusted: owner links can only be created by platform admins (RLS 0024 +
    // createWeddingInviteLink), so honor role='owner' instead of downgrading it.
    const role = claimed.role;

    if (role === 'owner') {
      // Promote an existing member, or add a new owner membership.
      const memErr = existingMembership
        ? (await service.from('wedding_members')
            .update({ role: 'owner', wedding_sides: [], max_guests: null })
            .eq('id', existingMembership.id)).error
        : (await service.from('wedding_members')
            .insert({ id: crypto.randomUUID(), wedding_id: claimed.wedding_id, user_id: user.id, role: 'owner', wedding_sides: [], max_guests: null })).error;
      if (memErr) {
        return Response.json({ error: memErr.message }, { status: 500, headers: cors });
      }
      // Transfer canonical ownership (full handoff).
      const { error: transferErr } = await service.from('weddings')
        .update({ owner_id: user.id }).eq('id', claimed.wedding_id);
      if (transferErr) {
        return Response.json({ error: transferErr.message }, { status: 500, headers: cors });
      }
    } else {
      // Collaborator link: existingMembership is null here (the short-circuit returned earlier).
      const wedding_sides = role === 'family' ? (claimed.wedding_sides ?? []) : [];
      const max_guests = role === 'family' ? (claimed.max_guests ?? null) : null;
      const { error: insertError } = await service.from('wedding_members')
        .insert({ id: crypto.randomUUID(), wedding_id: claimed.wedding_id, user_id: user.id, role, wedding_sides, max_guests });
      if (insertError) {
        return Response.json({ error: insertError.message }, { status: 500, headers: cors });
      }
    }

    const { data: wedding } = await service.from('weddings')
      .select('couple_names').eq('id', claimed.wedding_id).maybeSingle();

    return Response.json({
      wedding_id: claimed.wedding_id,
      couple_names: wedding?.couple_names ?? null,
      role,
      already_member: false,
    }, { headers: cors });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: cors });
  }
});
