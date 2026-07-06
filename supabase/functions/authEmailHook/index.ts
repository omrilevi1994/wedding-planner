// Supabase "Send Email" auth hook. Supabase POSTs here for every auth email; we verify
// the standard-webhooks signature, map the action type to one of our branded templates,
// build the verification URL, and send via the shared email service.
//
// Configure in Supabase: Auth > Hooks > Send Email > point at this function's URL and set
// SEND_EMAIL_HOOK_SECRET to the generated secret (format: v1,whsec_<base64>).

import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';
import { sendEmail } from '../_shared/email/send.ts';

interface EmailData {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url: string;
  token_new?: string;
  token_hash_new?: string;
}

// auth action type -> our template id
const TEMPLATE_BY_ACTION: Record<string, string> = {
  signup: 'authVerification',
  invite: 'authVerification', // invites normally use our own branded flow; defensive fallback
  magiclink: 'authMagicLink',
  recovery: 'authPasswordReset',
  email_change: 'authVerification',
  email_change_current: 'authVerification',
  email_change_new: 'authVerification',
};

function buildVerifyUrl(supabaseUrl: string, data: EmailData, fallbackRedirect: string): string {
  const redirectTo = data.redirect_to || fallbackRedirect;
  const params = new URLSearchParams({
    token: data.token_hash,
    type: data.email_action_type,
    redirect_to: redirectTo,
  });
  return `${supabaseUrl}/auth/v1/verify?${params.toString()}`;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const rawSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const appUrl = Deno.env.get('APP_URL') ?? 'https://wedflow.live';

  // Fail closed and loudly if the hook secret is missing/misformatted — never verify
  // against an empty key, which would be a silent misconfiguration.
  if (!rawSecret.startsWith('v1,whsec_')) {
    console.error('SEND_EMAIL_HOOK_SECRET is not configured (expected format: v1,whsec_...)');
    return Response.json(
      { error: { http_code: 500, message: 'Server misconfigured' } },
      { status: 500 },
    );
  }

  const payload = await req.text();
  const headers = Object.fromEntries(req.headers);

  let user: { id: string; email: string };
  let emailData: EmailData;
  try {
    // standardwebhooks expects the base64 secret without the "v1,whsec_" prefix.
    const secret = rawSecret.replace(/^v1,whsec_/, '');
    const wh = new Webhook(secret);
    const verified = wh.verify(payload, headers) as { user: typeof user; email_data: EmailData };
    user = verified.user;
    emailData = verified.email_data;
  } catch (e) {
    console.error('auth hook signature verification failed:', e);
    return Response.json(
      { error: { http_code: 401, message: 'Invalid webhook signature' } },
      { status: 401 },
    );
  }

  const templateId = TEMPLATE_BY_ACTION[emailData.email_action_type];
  if (!templateId) {
    console.error('unmapped email_action_type:', emailData.email_action_type);
    // Return 200 so Supabase does not treat it as a hard failure / block the auth action.
    return Response.json({});
  }

  try {
    const actionUrl = buildVerifyUrl(supabaseUrl, emailData, appUrl);
    await sendEmail({
      to: user.email,
      templateId,
      data: { actionUrl, recipientEmail: user.email },
      createdById: user.id,
    });
    return Response.json({});
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('auth hook send failed:', message);
    return Response.json({ error: { http_code: 500, message } }, { status: 500 });
  }
});
