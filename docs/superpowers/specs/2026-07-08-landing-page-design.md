# WedFlow Landing Page — Design

**Date:** 2026-07-08
**Status:** Approved (design), pending spec review

## Problem

`https://wedflow.live/` currently renders `src/components/Login.jsx` — a bare, centered
sign-in card. Couples arriving from Instagram / paid ads meet a technical login form before
any promise, emotion, or differentiation. That's high friction and hurts conversion.

## Goal

Turn the entry screen into a minimalist, luxurious, RTL Hebrew **landing page** that leads
with the promise and emotion, then invites a fast Google sign-up. No auth logic changes —
only the layout and copy around it.

## Constraints

- Reuse the existing brand palette and fonts — **no new design tokens**. Key tokens:
  `--background` (ivory), `--primary` (rose gold), `--accent` (champagne), `--foreground`
  (charcoal ink), `--muted-foreground`, `--border`, plus `rose-light` / `rose-deep` / `sage`.
- Keep all auth logic in `wedflow.auth` exactly as-is: `signInWithGoogle()`,
  `signInWithPassword()`, `signUp()`. No changes to `wedflowClient.js` or `AuthContext`.
- RTL (`dir="rtl"`), Hebrew copy.
- Responsive: single column on mobile (primary target — Instagram traffic), centered
  max-width (~640px) column on desktop.
- Dark mode must keep working via existing tokens.

## Layout (top → bottom)

The page is a vertically scrolling column, centered, `max-w-[640px]`, generous vertical
rhythm. `bg-background` with the existing soft gradient retained as a subtle top wash.

### 1. Hero
- Monogram (`/monogram.png`) + `WedFlow` wordmark (existing gradient treatment).
- Headline: **אומרים שלום לאקסלים.**
- Subhead: הדרך החכמה, האסתטית והרגועה ביותר לתכנן את החתונה שלכם.
- **Primary CTA:** full-width rose-gold button — "הרשמה מהירה עם Google" (calls `google()`).
- Secondary: quiet text link "או המשיכו עם אימייל" that toggles the email/password form
  open inline (`showEmail` state).

### 2. Story paragraph
One soft paragraph in `text-muted-foreground`, centered, comfortable line length:
> כי לתכנן חתונה בשנת 2026 עם טבלאות אקסל ופתקים מפוזרים בטלפון – זה פשוט לא תואם את הדרך
> שבה אנחנו חיים היום. בנינו את WedFlow מתוך החתונה שלנו, כדי להעניק לכם מרחב דיגיטלי אחד,
> מעוצב ונקי, שמאגד הכל במקום אחד. מעדכנים על הדרך, שומרים על שליטה מלאה – והופכים את
> ההפקה לחוויה מהנה.

### 3. Three pillars
Three minimalist cards (stacked on mobile, may sit in a column throughout given the narrow
max-width). Each: a small line-icon (lucide, already a dependency), a bold benefit line, and
a supporting sentence.

1. **שליטה מלאה בתקציב (בלי הפתעות):** כל שקל, כל ספק וכל הצעת מחיר מעודכנים ברגע, ישירות
   מהנייד של שניכם.
2. **הצעד הבא שלכם תמיד ברור:** צ'ק-ליסט חכם שעושה לכם סדר מהדבר הכי קטן ועד ליום הגדול,
   בלי החשש ששכחתם משהו.
3. **בכל מקום, בכל זמן, ביחד:** נפרדים מהצורך לפתוח מחשב. נכנסים בשנייה, מעדכנים 'על הדרך',
   ומתקדמים בראש שקט.

Suggested icons (lucide-react): `Wallet` / `ListChecks` / `Smartphone`.

### 4. Founder note
Quiet bordered block, italic, signed:
> יצרנו את WedFlow צעד אחר צעד מתוך הצרכים שעלו תוך כדי תנועה בחתונה שלנו. מאחלים לכם תכנון
> מרגש, פשוט ובעיקר – מהנה. דניאל ועמרי.

### 5. Footer CTA
Repeat the primary Google button so long-scroll readers convert without scrolling back up.

## Component structure

Everything stays inside `src/components/Login.jsx`, decomposed into small presentational
pieces in the same file for readability:

- `Login` (default export) — owns all state (`email`, `password`, `fullName`, `mode`,
  `error`, `busy`, `showEmail`) and handlers (`submit`, `google`). Renders the page shell
  and composes the sections.
- `Hero({ onGoogle, showEmail, onToggleEmail, formProps })` — headline, subhead, primary
  CTA, and the collapsible email/password form (existing inputs, restyled).
- `Pillars()` — pure, static three-card list.
- `FounderNote()` — pure, static signed block.
- `GoogleButton({ onClick })` — shared, used in hero and footer.

## Data flow / behavior

- Google button (hero + footer) → `google()` → `wedflow.auth.signInWithGoogle()` (unchanged).
- "המשיכו עם אימייל" link → `setShowEmail(true)` reveals the form; the existing
  signin/signup mode toggle lives inside it.
- Form submit → existing `submit()` (unchanged): `signUp` or `signInWithPassword`.
- On success, `AuthContext`'s `onAuthStateChange` re-renders into the app (unchanged).
- Errors render inline near the form, as today.

## Error handling

Unchanged from current: `error` state caught from auth calls, shown in
`text-destructive` near the relevant control. Google errors surface near the hero CTA.

## Testing / verification

- No unit tests exist for `Login.jsx`; this is presentational. Verify via the browser
  preview: hero renders, Google button fires `signInWithGoogle`, email toggle reveals the
  form, signup/signin toggle works, responsive at mobile width, dark mode intact.
- Confirm no console errors and that the existing auth flow still lands in `/app`.

## Out of scope

- No changes to auth backend, OAuth provider config, routing, or `AuthContext`.
- No new brand tokens, fonts, or images beyond the existing monogram + lucide icons.
- No analytics/tracking wiring (can be a follow-up).
