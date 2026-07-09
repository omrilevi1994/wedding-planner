import posthog from 'posthog-js';

// Client-side (public) PostHog config, env-driven so the key never lives in source.
// Set VITE_POSTHOG_KEY / VITE_POSTHOG_HOST in .env.local (dev) and Vercel (prod).
const KEY = import.meta.env.VITE_POSTHOG_KEY;
const HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let started = false;

/**
 * Initialise PostHog exactly once. No-ops when no key is configured (e.g. local dev
 * without analytics), so nothing breaks and no events are sent. Shared by all three
 * surfaces: the app (main.jsx), the landing (analytics-bootstrap.js), and /calc.
 */
export function initPostHog() {
  if (started || !KEY || typeof window === 'undefined') return;
  posthog.init(KEY, {
    api_host: HOST,
    // Only create person profiles for identified users — keeps anonymous marketing
    // traffic (landing / calc) from inflating tracked-user counts.
    person_profiles: 'identified_only',
    // Capture the initial pageview and subsequent SPA route changes automatically.
    capture_pageview: 'history_change',
    capture_pageleave: true,
  });
  started = true;
}

/** Capture a custom event; safely no-ops when analytics is disabled. */
export function capture(event, props) {
  if (!started) return;
  posthog.capture(event, props);
}

export { posthog };
