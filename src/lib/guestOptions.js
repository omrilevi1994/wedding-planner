// Shared helpers for the guest "side" (צד) and "relationship"/"closeness" (קרבה) fields.
//
// Both columns are plain free-text columns in the `guests` table (no DB enum/check
// constraint), so any wedding can introduce custom values. These helpers merge a
// small set of sensible defaults (so a brand-new wedding isn't left with an empty
// dropdown) with whatever distinct values are already used on that wedding's guests
// (so custom values created from the guest form show up everywhere guests are
// filtered/grouped).

export const DEFAULT_SIDES = ['חתן', 'חתן - אבא', 'חתן - אמא', 'כלה', 'כלה - אבא', 'כלה - אמא', 'משותף'];
export const DEFAULT_RELATIONSHIPS = ['משפחה', 'חברים', 'עבודה', 'לימודים', 'שכנים', 'אחר'];

function dedupe(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

/**
 * Available "side" options for a wedding: the user's permitted sides (if scoped),
 * or the default full list, plus any custom values already used on real guests.
 */
export function getSideOptions(guests = [], user) {
  const base = (!user?.wedding_sides || user.wedding_sides.length === 0)
    ? DEFAULT_SIDES
    : user.wedding_sides;
  const used = guests.map(g => g.side);
  return dedupe([...base, ...used]);
}

/**
 * Available "relationship"/closeness options for a wedding: the default list plus
 * any custom values already used on real guests.
 */
export function getRelationshipOptions(guests = []) {
  const used = guests.map(g => g.relationship);
  return dedupe([...DEFAULT_RELATIONSHIPS, ...used]);
}
