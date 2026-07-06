// The single choke point for every WedFlow email. Renders a template, sends it via
// Resend, and records the attempt in email_log. Deno/Supabase-only (runs in edge fns).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { renderEmail } from './render.ts';
import { sendViaResend } from './resend.ts';
import { brand } from './theme.ts';

export interface SendEmailInput {
  to: string;
  templateId: string;
  data: Record<string, unknown>;
  weddingId?: string | null;
  createdById?: string | null;
  replyTo?: string;
}

export interface SendEmailResult {
  status: 'sent' | 'failed';
  providerId: string | null;
}

/**
 * Render + send + log. Throws on send failure (after logging it), so callers can
 * surface the error; the email_log row is written either way.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const { to, templateId, data, weddingId = null, createdById = null, replyTo } = input;

  const { subject, html, text } = renderEmail(templateId, data);
  const apiKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const from = Deno.env.get('EMAIL_FROM') ?? brand.from;

  let status: 'sent' | 'failed' = 'sent';
  let providerId: string | null = null;
  let errorMessage: string | null = null;

  try {
    const result = await sendViaResend({ apiKey, from, to, subject, html, text, replyTo });
    providerId = result.id;
  } catch (e) {
    status = 'failed';
    errorMessage = e instanceof Error ? e.message : String(e);
  }

  // Best-effort audit log via the service role (bypasses RLS; inserts are service-only).
  try {
    const service = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    await service.from('email_log').insert({
      to_email: to,
      template_id: templateId,
      subject,
      status,
      provider_id: providerId,
      error: errorMessage,
      wedding_id: weddingId,
      created_by_id: createdById,
    });
  } catch (logErr) {
    console.error('email_log insert failed:', logErr);
  }

  if (status === 'failed') {
    throw new Error(errorMessage ?? 'Email send failed');
  }
  return { status, providerId };
}
