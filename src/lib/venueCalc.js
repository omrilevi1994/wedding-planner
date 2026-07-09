// Pure cost math for the venue calculator. No React, no DOM — imported by both the
// in-app (Calculator.jsx) and standalone (/calc) calculators so the arithmetic never drifts.
// Extracted verbatim from VenueCalculator.jsx; coercion rules match the original component.

// ₪/head budget thresholds (were hardcoded in the component).
export const TARGET = 570; // green at or below
export const WARN = 580;   // orange up to and including; red above

const money = (v) => parseFloat(v) || 0;
const count = (v) => parseInt(v, 10) || 0;

// Per-head venue cost: dish + bar + service + each per-head extra item.
export function computeCostPerHead({ dishCost, barCost, serviceCost, extraItems = [] } = {}) {
  return money(dishCost) + money(barCost) + money(serviceCost) +
    extraItems.reduce((sum, i) => sum + money(i.amount), 0);
}

// All money totals. `systemExpenses` is the platform-only "rest of expenses" figure;
// it is 0 on the standalone calculator (showSystemExpenses=false) and for guest-less input.
export function computeTotals({
  dishCost, barCost, serviceCost, extraItems = [],
  fixedItems = [], guestCount, systemExpenses = 0,
} = {}) {
  const costPerHead = computeCostPerHead({ dishCost, barCost, serviceCost, extraItems });
  const totalFixed = fixedItems.reduce((sum, i) => sum + money(i.amount), 0);
  const guests = count(guestCount);
  const totalVenueCost = costPerHead * guests + totalFixed;
  const grandTotal = totalVenueCost + money(systemExpenses);
  const costPerGuest = guests > 0 ? grandTotal / guests : 0;
  return { costPerHead, totalFixed, totalVenueCost, grandTotal, costPerGuest };
}

// Green/orange/red verdict for an average ₪/head figure. `value` is the rounded ₪/head.
export function budgetStatus(costPerGuest) {
  const value = Math.round(costPerGuest || 0);
  if (!(costPerGuest > 0)) return { level: 'none', value, label: '' };
  if (value <= TARGET) return { level: 'ok', value, label: '✓ בתקציב' };
  if (value <= WARN) return { level: 'warn', value, label: '⚠ קרוב לגבול' };
  return { level: 'over', value, label: '✗ חורג מהתקציב' };
}
