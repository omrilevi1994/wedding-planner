import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email/send.ts';
import { roleLabel } from '../_shared/email/templates/index.ts';

const INVITABLE_ROLES = ['coplanner', 'family', 'event_manager'];

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    // --- Authenticate caller ---
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
    const { email, wedding_id, role = 'family', wedding_sides = [], max_guests = null } = await req.json();
    if (!email || !wedding_id) {
      return Response.json({ error: 'email and wedding_id are required' }, { status: 400, headers: cors });
    }
    if (!INVITABLE_ROLES.includes(role)) {
      return Response.json({ error: `role must be one of: ${INVITABLE_ROLES.join(', ')}` }, { status: 400, headers: cors });
    }

    // --- Authorize: wedding owner or platform admin (via service client) ---
    const service = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: ownerMembership } = await service.from('wedding_members')
      .select('id').eq('wedding_id', wedding_id).eq('user_id', user.id).eq('role', 'owner').maybeSingle();
    if (!ownerMembership) {
      const { data: profile } = await service.from('profiles')
        .select('is_platform_admin').eq('id', user.id).maybeSingle();
      if (!profile?.is_platform_admin) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: cors });
      }
    }

    const normalizedEmail = String(email).toLowerCase();
    const appUrl = Deno.env.get('APP_URL') ?? 'https://wedflow.live';

    // --- Find existing user by email ---
    const { data: existingProfile, error: profileError } = await service.from('profiles')
      .select('id').eq('email', normalizedEmail).maybeSingle();
    if (profileError) {
      return Response.json({ error: profileError.message }, { status: 500, headers: cors });
    }

    let userId: string;
    let existing: boolean;
    let actionUrl = appUrl;
    if (existingProfile) {
      userId = existingProfile.id;
      existing = true;
    } else {
      // Generate an invite link WITHOUT sending Supabase's default email — we send our own
      // branded invite below. generateLink creates the user and returns the action link.
      const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
        type: 'invite',
        email: normalizedEmail,
        options: { redirectTo: appUrl },
      });
      if (linkError || !linkData?.user) {
        return Response.json({ error: linkError?.message ?? 'Failed to generate invite link' }, { status: 400, headers: cors });
      }
      userId = linkData.user.id;
      existing = false;
      // IMPORTANT: do NOT send Supabase's raw action_link (a GET request straight to
      // /auth/v1/verify that consumes the one-time token). Corporate email security
      // scanners / link-preview bots (Outlook Safe Links, Gmail, antivirus, etc.) often
      // GET-request every link in an email before the recipient ever opens it, which
      // burns the single-use invite token and makes it appear "expired" instantly for
      // the real user. Instead, point to our own app page with the token as a plain
      // query param; that page only calls supabase.auth.verifyOtp() after an explicit
      // user click, so a passive prefetch can't consume it.
      const hashedToken = linkData.properties?.hashed_token;
      actionUrl = hashedToken
        ? `${appUrl}/app/accept-invite?token_hash=${encodeURIComponent(hashedToken)}&type=invite`
        : (linkData.properties?.action_link ?? appUrl);
    }

    // --- Upsert membership (manual, to avoid rewriting the text pk on conflict) ---
    const { data: membership } = await service.from('wedding_members')
      .select('id').eq('wedding_id', wedding_id).eq('user_id', userId).maybeSingle();
    if (membership) {
      const { error: updateError } = await service.from('wedding_members')
        .update({ role, wedding_sides, max_guests, updated_date: new Date().toISOString() })
        .eq('id', membership.id);
      if (updateError) {
        return Response.json({ error: updateError.message }, { status: 500, headers: cors });
      }
    } else {
      const { error: insertError } = await service.from('wedding_members')
        .insert({ id: crypto.randomUUID(), wedding_id, user_id: userId, role, wedding_sides, max_guests });
      if (insertError) {
        return Response.json({ error: insertError.message }, { status: 500, headers: cors });
      }
    }

    // --- Send the branded invite / member-added email ---
    // Context: who invited, which wedding, what role. A send failure must not undo the
    // membership just created, so we report emailSent rather than throwing.
    const [{ data: inviterProfile }, { data: wedding }] = await Promise.all([
      service.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle(),
      service.from('weddings').select('couple_names').eq('id', wedding_id).maybeSingle(),
    ]);
    const inviterName = inviterProfile?.full_name || inviterProfile?.email || 'מארגן/ת החתונה';
    const weddingName = wedding?.couple_names || 'החתונה';

    let emailSent = true;
    let emailError: string | null = null;
    try {
      await sendEmail({
        to: normalizedEmail,
        templateId: existing ? 'memberAdded' : 'weddingInvite',
        data: { inviterName, weddingName, roleLabel: roleLabel(role), actionUrl },
        weddingId: wedding_id,
        createdById: user.id,
      });
    } catch (e) {
      emailSent = false;
      emailError = e instanceof Error ? e.message : String(e);
      console.error('invite email send failed:', emailError);
    }

    return Response.json({ invited: normalizedEmail, existing, emailSent, emailError }, { headers: cors });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: cors });
  }
});
