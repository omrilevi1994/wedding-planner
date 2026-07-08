// Shared helpers for the gift "payment method" (איך התקבלה המתנה) field.
//
// `payment_method` is a plain free-text column on the `gifts` table (no DB enum/check
// constraint), so any wedding can introduce custom values. This helper merges a small
// set of sensible defaults (so a brand-new wedding isn't left with an empty dropdown)
// with whatever distinct values are already used on that wedding's gifts (so custom
// values created from the gift form show up everywhere gifts are filtered/displayed).

export const DEFAULT_PAYMENT_METHODS = ['מזומן', 'אשראי', 'ביט', "צ'ק"];

function dedupe(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

/**
 * Available "payment method" options for a wedding: the default list plus any custom
 * values already used on real gifts.
 */
export function getPaymentMethodOptions(gifts = []) {
  const used = gifts.map(g => g.payment_method);
  return dedupe([...DEFAULT_PAYMENT_METHODS, ...used]);
}
