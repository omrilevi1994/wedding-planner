import { describe, it, expect } from 'vitest';
import { nextToursSeen } from '@/lib/tours/toursSeen';

describe('nextToursSeen', () => {
  it('marks a page as seen', () => {
    expect(nextToursSeen({}, 'Dashboard')).toEqual({ Dashboard: true });
  });
  it('keeps previously seen pages', () => {
    expect(nextToursSeen({ Guests: true }, 'Dashboard')).toEqual({ Guests: true, Dashboard: true });
  });
  it('handles null/undefined prev', () => {
    expect(nextToursSeen(null, 'Dashboard')).toEqual({ Dashboard: true });
    expect(nextToursSeen(undefined, 'Checklist')).toEqual({ Checklist: true });
  });
  it('is idempotent for an already-seen page', () => {
    expect(nextToursSeen({ Dashboard: true }, 'Dashboard')).toEqual({ Dashboard: true });
  });
});
