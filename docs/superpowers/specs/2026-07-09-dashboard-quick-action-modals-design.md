# Dashboard quick actions open modals in place

**Date:** 2026-07-09
**Status:** Approved (design)

## Problem

The dashboard's "פעולות מהירות" (Quick Actions) card has three buttons — הוסף הוצאה
(Add Expense), הוסף מוזמן (Add Guest), סמן תשלום שבוצע (Mark payment done). Today each
one calls `navigate(createPageUrl(...))` and sends the user to the Expenses / Guests /
Payments page. The user wants the corresponding modal to open **in place on the
dashboard** instead of navigating away.

## Current state

- `src/components/dashboard/QuickActions.jsx` is already decoupled — it takes
  `onAddExpense`, `onAddGuest`, `onMarkPayment` callbacks. Only the callbacks passed from
  `Dashboard.jsx` navigate.
- `src/components/expenses/ExpenseForm.jsx` — self-contained dialog:
  `{ open, onClose, expense, onSave }`.
- `src/components/guests/GuestForm.jsx` — self-contained dialog:
  `{ open, onClose, guest, onSave, guests }`.
- **Payments has no modal.** On `Payments.jsx` you pick a specific payment row and
  `handleMarkAsPaid` uses a browser `prompt()` to read the paid date.
- Creating an expense on `Expenses.jsx` also auto-generates linked `Payment` records via a
  local `syncPayments` routine (deposit + remainder, or single payment). Create/update/
  delete on all three pages also write an `ActivityLog` entry.
- `Dashboard.jsx` already runs react-query `useQuery`s for `expenses`, `payments`, and
  `guests`. Invalidating those keys after a save refreshes the KPIs automatically.

## Approach — share the save logic, don't duplicate it

The save logic (payment sync + activity logging) must not be copy-pasted into the
dashboard, or the two copies will drift. Extract it into hooks that both the pages and the
dashboard consume.

### New files

1. **`src/hooks/useExpenseMutations.js`**
   - Moves `syncPayments` and the create / update / delete expense mutations (including
     `ActivityLog` writes and `queryClient` invalidation of `['expenses']` and
     `['payments']`) out of `Expenses.jsx`.
   - Signature: `useExpenseMutations()` reading `activeWeddingId` from `useWedding()` and
     `useQueryClient()` internally. Returns `{ createExpense, updateExpense, deleteExpense }`
     (react-query mutation objects).
   - The mutations' own `onSuccess` does data work only (sync, log, invalidate) — **no UI
     state**. Callers close their own modal by passing a per-call
     `mutate(data, { onSuccess })`.

2. **`src/hooks/useGuestMutations.js`**
   - Same pattern for guests: create / update / delete + `ActivityLog` + invalidate
     `['guests']`. Returns `{ createGuest, updateGuest, deleteGuest }`.

3. **`src/hooks/usePaymentMutations.js`**
   - Extracts the "mark as paid" update + `ActivityLog` from `Payments.jsx`. Returns
     `{ markPaid }` where `markPaid.mutate({ payment, paidDate })` sets
     `status: 'שולם'`, `paid_date: <ISO>` and invalidates `['payments']`.

4. **`src/components/payments/MarkPaymentModal.jsx`** — NEW dialog.
   - Props: `{ open, onClose, payments, onMarkPaid }`.
   - Shows the pending payments (`status === 'מתוכנן'`) sorted by `due_date`. User selects
     one, picks a paid date with a real date input (default = today) — replacing the
     `prompt()` — and confirms.
   - On confirm calls `onMarkPaid({ payment, paidDate })` (an ISO `YYYY-MM-DD` string) and
     closes.
   - Empty state when there are no pending payments.
   - A small pure helper (filter + sort pending payments; `dd/MM/yyyy`↔ISO date
     conversion) lives in a testable module.

### Modified files

- **`src/pages/Expenses.jsx`** — replace the inline `syncPayments` + create/update/delete
  mutations with `useExpenseMutations()`. Modal close (`setShowForm(false)`,
  `setEditingExpense(null)`) moves to the per-call `onSuccess`. Visible behavior unchanged.
- **`src/pages/Guests.jsx`** — replace inline create/update/delete mutations with
  `useGuestMutations()`. Visible behavior unchanged.
- **`src/pages/Payments.jsx`** — `handleMarkAsPaid` uses `usePaymentMutations().markPaid`.
  Keeps its existing per-row inline trigger and `prompt()` date entry (out of scope to
  redesign the page); only the mutation is shared.
- **`src/pages/Dashboard.jsx`**
  - Add three `useState` flags: `showExpenseForm`, `showGuestForm`, `showMarkPayment`.
  - Consume `useExpenseMutations`, `useGuestMutations`, `usePaymentMutations`.
  - `QuickActions` callbacks open the modals instead of navigating.
  - Render `<ExpenseForm open onClose onSave>`, `<GuestForm open onClose onSave
    guests={guests}>`, `<MarkPaymentModal open onClose payments={payments} onMarkPaid>`.
  - Each `onSave`/`onMarkPaid` calls the shared mutation and closes its modal on success.
  - `navigate` / `createPageUrl` imports can be dropped if no longer used.

## Data flow

QuickActions button → dashboard opens modal → user submits → shared mutation hook writes
data + `ActivityLog` + invalidates query keys → dashboard's existing `useQuery`s refetch →
KPIs update. No page navigation.

## Out of scope

- Redesigning the Payments page row UI or its `prompt()` flow.
- Any change to the visible behavior of the Expenses / Guests / Payments pages (pure
  refactor for them).

## Testing

- Unit-test the `MarkPaymentModal` pure helper (pending-payment filter/sort + date
  conversion) with vitest under `tests/unit/`, matching existing test style.
- Manual/preview verification: on the dashboard, each button opens its modal; saving an
  expense creates the expense **and** its linked payment(s); adding a guest and marking a
  payment paid update the dashboard KPIs without navigation.
- `npm run lint` and `npm run test:unit` pass.
