// Plan + feature-flag foundation.
// NOTE: gating is intentionally all-true today (everything unlocked on free);
// flip flags per-plan when billing lands.

import { useWedding } from '@/lib/WeddingContext';

export const PLANS = {
  free: { label: 'חינם' },
  premium: { label: 'פרימיום' },
};

export const FEATURES = {
  guests: { free: true, premium: true },
  seating: { free: true, premium: true },
  expenses: { free: true, premium: true },
  backup: { free: true, premium: true },
  invites: { free: true, premium: true },
  wedding_mode: { free: true, premium: true },
};

// Unknown plan is treated as 'free'; unknown feature returns false.
export function hasFeature(plan, feature) {
  const flags = FEATURES[feature];
  if (!flags) return false;
  const effectivePlan = PLANS[plan] ? plan : 'free';
  return !!flags[effectivePlan];
}

// Hebrew label for a plan, or the raw plan string if unknown.
export function planLabel(plan) {
  return PLANS[plan]?.label ?? plan;
}

// React hook: is `feature` available on the active wedding's plan?
export function useFeature(feature) {
  const { activeWedding } = useWedding();
  return hasFeature(activeWedding?.plan, feature);
}
