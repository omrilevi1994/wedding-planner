// WedFlow email design tokens.
// Email cannot read Tailwind CSS variables, so brand colors are hard-coded here as
// light + dark twins. Components render light values inline; layout.ts emits a
// prefers-color-scheme:dark <style> block that swaps to the dark twin via [data-t] hooks.

export const colors = {
  light: {
    pageBg: '#F5F1E9', // warm paper
    card: '#FFFFFF',
    ink: '#201E1A', // near-black, warm
    muted: '#6B655C',
    gold: '#B8893B', // deep champagne — legible on white
    goldSoft: '#F3E9D6',
    border: '#E7DFD1',
    btnText: '#FFFFFF',
    footer: '#8A8073',
  },
  dark: {
    pageBg: '#161311',
    card: '#211C18',
    ink: '#F3EEE6',
    muted: '#B3A99B',
    gold: '#D8B36A', // lighter gold — legible on dark
    goldSoft: '#2C2419',
    border: '#3A322A',
    btnText: '#201E1A', // dark ink on the lighter gold button
    footer: '#8A8073',
  },
} as const;

export const fonts = {
  // Latin wordmark / numerals — Georgia is elegant and near-universal in mail clients.
  display: "Georgia, 'Times New Roman', serif",
  // Hebrew-capable stack (no reliable web-safe Hebrew serif exists).
  body: "'Heebo', 'Assistant', Arial, 'Helvetica Neue', 'Segoe UI', sans-serif",
} as const;

export const layout = {
  maxWidth: 600,
  radius: 14,
} as const;

// Brand constants (overridable via env at send time in send.ts / edge fns).
export const brand = {
  name: 'WedFlow',
  appUrl: 'https://wedflow.live',
  from: 'WedFlow <noreply@wedflow.live>',
  supportEmail: 'hello@wedflow.live',
} as const;
