import { describe, it, expect } from 'vitest';
import { hasFeature, planLabel, PLANS, FEATURES } from '@/lib/features';

describe('hasFeature', () => {
  it('returns true for a known feature on the free plan', () => {
    expect(hasFeature('free', 'guests')).toBe(true);
  });
  it('returns false for an unknown feature', () => {
    expect(hasFeature('free', 'nonexistent_feature')).toBe(false);
  });
  it('treats an unknown plan as free', () => {
    expect(hasFeature('gold', 'seating')).toBe(FEATURES.seating.free);
    expect(hasFeature(undefined, 'expenses')).toBe(true);
  });
});

describe('planLabel', () => {
  it('returns the Hebrew label for known plans', () => {
    expect(planLabel('free')).toBe(PLANS.free.label);
    expect(planLabel('premium')).toBe('פרימיום');
  });
  it('falls back to the raw plan string for unknown plans', () => {
    expect(planLabel('gold')).toBe('gold');
  });
});
