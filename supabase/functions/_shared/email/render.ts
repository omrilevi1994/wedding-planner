// Pure rendering entry point — no Deno / Supabase deps, so it runs under Vitest.
// Looks up a template by id, builds subject/html/text, and guards against any
// unresolved {{placeholder}} that a template author forgot to interpolate.

import { templates, type TemplateId } from './templates/index.ts';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderEmail(templateId: string, data: Record<string, unknown>): RenderedEmail {
  const template = templates[templateId as TemplateId];
  if (!template) {
    throw new Error(`Unknown email template: "${templateId}"`);
  }

  const subject = template.subject(data);
  const html = template.html(data);
  const text = template.text(data);

  for (const [name, value] of Object.entries({ subject, html, text })) {
    const leftover = String(value).match(/\{\{[^}]+\}\}/);
    if (leftover) {
      throw new Error(`Unresolved placeholder ${leftover[0]} in ${templateId}.${name}`);
    }
  }
  if (!subject.trim()) throw new Error(`Empty subject for template "${templateId}"`);

  return { subject, html, text };
}

export { templates, type TemplateId };
