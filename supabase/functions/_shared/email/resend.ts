// Thin Resend API client. Kept dependency-free (uses global fetch) and takes the API
// key as a parameter so it is testable in node with a mocked fetch.

export interface ResendPayload {
  apiKey: string;
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

export interface ResendResult {
  id: string;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function sendViaResend(payload: ResendPayload): Promise<ResendResult> {
  const { apiKey, from, to, subject, html, text, replyTo } = payload;
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');

  const res = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (json && (json.message || json.error)) || `Resend responded ${res.status}`;
    throw new Error(`Resend send failed: ${message}`);
  }
  return { id: json.id };
}
