import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderEmail } from '../../supabase/functions/_shared/email/render.ts';
import { templates } from '../../supabase/functions/_shared/email/templates/index.ts';
import { sendViaResend } from '../../supabase/functions/_shared/email/resend.ts';

// Realistic sample data covering the fields the templates interpolate.
const sampleData = {
  inviterName: 'דנה כהן',
  weddingName: 'החתונה של דנה ויוסי',
  roleLabel: 'מתכנן/ת שותף/ה',
  actionUrl: 'https://wedflow.live/invite?token=abc123',
  recipientEmail: 'guest@example.com',
};

const TEMPLATE_IDS = ['weddingInvite', 'memberAdded', 'authVerification', 'authPasswordReset', 'authMagicLink'];

describe('renderEmail — templates map', () => {
  it('exposes exactly the five expected template ids', () => {
    expect(Object.keys(templates).sort()).toEqual([...TEMPLATE_IDS].sort());
  });
});

describe('renderEmail — HTML injection is escaped (body + preheader)', () => {
  const payload = '</div><img src=x onerror=alert(1)>';
  for (const id of ['weddingInvite', 'memberAdded']) {
    it(`${id}: malicious inviterName/weddingName cannot break out anywhere in the HTML`, () => {
      const out = renderEmail(id, { ...sampleData, inviterName: payload, weddingName: payload });
      // The raw tag must never appear as live markup — including inside the hidden
      // preheader div. (The escaped form still contains the text "onerror=", which is
      // inert, so we assert on the tag-opening "<img" instead.)
      expect(out.html).not.toContain('<img');
      // The escaped form should be present instead.
      expect(out.html).toContain('&lt;img src=x');
    });
  }
});

describe('renderEmail — per template', () => {
  for (const id of TEMPLATE_IDS) {
    it(`${id}: returns non-empty subject/html/text strings`, () => {
      const out = renderEmail(id, sampleData);

      expect(typeof out.subject).toBe('string');
      expect(typeof out.html).toBe('string');
      expect(typeof out.text).toBe('string');

      expect(out.subject.trim().length).toBeGreaterThan(0);
      expect(out.html.trim().length).toBeGreaterThan(0);
      expect(out.text.trim().length).toBeGreaterThan(0);
    });

    it(`${id}: html is a valid RTL, dark-mode-aware document`, () => {
      const { html } = renderEmail(id, sampleData);
      expect(html).toContain('<!DOCTYPE');
      expect(html).toContain('dir="rtl"');
      expect(html).toContain('prefers-color-scheme');
    });

    it(`${id}: leaves no unresolved {{placeholder}} and does not throw`, () => {
      expect(() => renderEmail(id, sampleData)).not.toThrow();
      const { subject, html, text } = renderEmail(id, sampleData);
      expect(subject).not.toMatch(/\{\{[^}]+\}\}/);
      expect(html).not.toMatch(/\{\{[^}]+\}\}/);
      expect(text).not.toMatch(/\{\{[^}]+\}\}/);
    });
  }
});

describe('renderEmail — weddingInvite content', () => {
  it('renders the passed weddingName and actionUrl, with actionUrl inside an href', () => {
    const { html } = renderEmail('weddingInvite', sampleData);
    expect(html).toContain(sampleData.weddingName);
    expect(html).toContain(sampleData.actionUrl);
    expect(html).toContain(`href="${sampleData.actionUrl}"`);
  });
});

describe('renderEmail — unknown template', () => {
  it('throws for an unknown template id', () => {
    expect(() => renderEmail('nonExistentTemplate', {})).toThrow();
  });
});

describe('sendViaResend', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts to the Resend endpoint and returns the created id on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'abc' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendViaResend({
      apiKey: 'test_key',
      from: 'WedFlow <hello@wedflow.live>',
      to: 'guest@example.com',
      subject: 'שלום',
      html: '<p>hi</p>',
      text: 'hi',
    });

    expect(result).toEqual({ id: 'abc' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer test_key');

    const body = JSON.parse(options.body);
    expect(Array.isArray(body.to)).toBe(true);
    expect(body.to).toEqual(['guest@example.com']);
    expect(body.from).toBe('WedFlow <hello@wedflow.live>');
    expect(body.subject).toBe('שלום');
    expect(body.html).toBe('<p>hi</p>');
    expect(body.text).toBe('hi');
  });

  it('throws when Resend responds with a non-ok status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ message: 'invalid to address' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendViaResend({
        apiKey: 'test_key',
        from: 'WedFlow <hello@wedflow.live>',
        to: 'guest@example.com',
        subject: 'שלום',
        html: '<p>hi</p>',
        text: 'hi',
      }),
    ).rejects.toThrow(/Resend send failed/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws without calling fetch when apiKey is empty', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendViaResend({
        apiKey: '',
        from: 'WedFlow <hello@wedflow.live>',
        to: 'guest@example.com',
        subject: 'שלום',
        html: '<p>hi</p>',
        text: 'hi',
      }),
    ).rejects.toThrow(/RESEND_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
