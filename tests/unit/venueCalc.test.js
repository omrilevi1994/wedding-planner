import { describe, it, expect } from 'vitest';
import {
  TARGET, WARN, computeCostPerHead, computeTotals, budgetStatus,
} from '@/lib/venueCalc';

describe('constants', () => {
  it('uses the 570/580 thresholds verbatim', () => {
    expect(TARGET).toBe(570);
    expect(WARN).toBe(580);
  });
});

describe('computeCostPerHead', () => {
  it('sums dish + bar + service + per-head extras', () => {
    expect(computeCostPerHead({
      dishCost: '370', barCost: '35', serviceCost: '35',
      extraItems: [{ amount: '10' }, { amount: '5' }],
    })).toBe(455);
  });
  it('treats blank/NaN inputs as 0 and defaults missing arrays', () => {
    expect(computeCostPerHead({ dishCost: '', barCost: 'abc' })).toBe(0);
    expect(computeCostPerHead({ dishCost: '370' })).toBe(370);
  });
});

describe('computeTotals', () => {
  it('computes venue, grand total and per-guest with system expenses', () => {
    const t = computeTotals({
      dishCost: '400', barCost: '', serviceCost: '', extraItems: [],
      fixedItems: [{ amount: '3000' }], guestCount: '200', systemExpenses: 20000,
    });
    expect(t.costPerHead).toBe(400);
    expect(t.totalFixed).toBe(3000);
    expect(t.totalVenueCost).toBe(83000);   // 400*200 + 3000
    expect(t.grandTotal).toBe(103000);       // + 20000
    expect(t.costPerGuest).toBe(515);        // 103000 / 200
  });
  it('per-guest is 0 when there are no guests (no divide-by-zero)', () => {
    expect(computeTotals({ dishCost: '400', guestCount: '0' }).costPerGuest).toBe(0);
    expect(computeTotals({ dishCost: '400', guestCount: '' }).costPerGuest).toBe(0);
  });
  it('systemExpenses defaults to 0 (standalone case)', () => {
    const t = computeTotals({ dishCost: '400', guestCount: '100' });
    expect(t.grandTotal).toBe(40000);
    expect(t.costPerGuest).toBe(400);
  });
});

describe('budgetStatus thresholds (rounded ₪/head)', () => {
  it('none when zero/negative', () => {
    expect(budgetStatus(0).level).toBe('none');
    expect(budgetStatus(0).label).toBe('');
  });
  it('ok at and below 570', () => {
    expect(budgetStatus(570).level).toBe('ok');
    expect(budgetStatus(569.4).level).toBe('ok'); // rounds to 569
    expect(budgetStatus(1).level).toBe('ok');
  });
  it('warn above 570 up to and including 580', () => {
    expect(budgetStatus(570.6).level).toBe('warn'); // rounds to 571
    expect(budgetStatus(580).level).toBe('warn');
  });
  it('over above 580', () => {
    expect(budgetStatus(580.6).level).toBe('over'); // rounds to 581
    expect(budgetStatus(1000).level).toBe('over');
  });
  it('carries the exact Hebrew labels', () => {
    expect(budgetStatus(500).label).toBe('✓ בתקציב');
    expect(budgetStatus(575).label).toBe('⚠ קרוב לגבול');
    expect(budgetStatus(600).label).toBe('✗ חורג מהתקציב');
  });
});
