// Analytics bootstrap for the static marketing landing page (index.html).
// The landing has no React app, so this tiny module — referenced from index.html —
// initialises PostHog with the same config as the app and /calc.
import { initPostHog } from '@/lib/posthog';

initPostHog();
