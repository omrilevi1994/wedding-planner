// Template registry. Each template exposes subject/html/text builders.
// Adding a new email = create a file here and add one line to this map.

import * as weddingInvite from './weddingInvite.ts';
import * as memberAdded from './memberAdded.ts';
import * as authVerification from './authVerification.ts';
import * as authPasswordReset from './authPasswordReset.ts';
import * as authMagicLink from './authMagicLink.ts';

export interface EmailTemplate {
  subject: (data: Record<string, unknown>) => string;
  html: (data: Record<string, unknown>) => string;
  text: (data: Record<string, unknown>) => string;
}

export const templates = {
  weddingInvite,
  memberAdded,
  authVerification,
  authPasswordReset,
  authMagicLink,
} satisfies Record<string, EmailTemplate>;

export type TemplateId = keyof typeof templates;

// Hebrew labels for per-wedding roles (used by invite/member emails).
export const ROLE_LABELS: Record<string, string> = {
  owner: 'בעלים',
  coplanner: 'מתכנן/ת שותף/ה',
  family: 'בן/בת משפחה',
  event_manager: 'מנהל/ת אירוע',
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
