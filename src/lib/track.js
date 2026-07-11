// Tiny analytics helper. No-ops if PostHog is absent or the user opted out
// (PostHog drops events while opted out). NEVER pass PII here — only event
// names and non-identifying counts/categories. Must never throw.
export function track(event, props) {
  try {
    if (typeof window !== 'undefined' && window.posthog && window.posthog.capture) {
      window.posthog.capture(event, props);
    }
  } catch (e) { /* analytics must never break the app */ }
}
