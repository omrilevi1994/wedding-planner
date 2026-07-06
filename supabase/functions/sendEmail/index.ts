// Authenticated dispatch endpoint for APP-triggered emails (notifications, etc.).
// Auth emails are NOT sent here — they go through the authEmailHook. Wedding invites are
// sent directly from inviteUserToWedding. This endpoint is the plug-in point for future
// app notifications; kept intentionally small.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { sendEmail } from '../_shared/email/send.ts';

// Templates a client is allowed to trigger. Auth templates are deliberately excluded.
const ALLOWED_TEMPLATES = new Set(['weddingInvite', 'memberAdded']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
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

    const { to, templateId, data = {}, wedding_id = null } = await req.json();
    if (!to || !templateId) {
      return Response.json({ error: 'to and templateId are required' }, { status: 400, headers: corsHeaders });
    }
    if (!ALLOWED_TEMPLATES.has(templateId)) {
      return Response.json({ error: `templateId must be one of: ${[...ALLOWED_TEMPLATES].join(', ')}` }, { status: 400, headers: corsHeaders });
    }

    // If scoped to a wedding, only its owner or a platform admin may send.
    if (wedding_id) {
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
    }

    const result = await sendEmail({ to, templateId, data, weddingId: wedding_id, createdById: user.id });
    return Response.json({ sent: true, providerId: result.providerId }, { headers: corsHeaders });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500, headers: corsHeaders });
  }
});
