# Dashboard Quick-Action Modals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dashboard's three Quick-Action buttons open modals in place (Add Expense, Add Guest, Mark Payment) instead of navigating to other pages.

**Architecture:** Extract the pages' save logic (expense create + payment-sync, guest create, payment mark-as-paid, all with ActivityLog) into shared hooks so the dashboard and pages use one source of truth. Add a new `MarkPaymentModal`. Wire `Dashboard.jsx` to render the existing `ExpenseForm` / `GuestForm` dialogs plus the new modal, opened by the QuickActions callbacks.

**Tech Stack:** React 18, react-query (`@tanstack/react-query`), Vite, vitest (node env), shadcn/ui dialogs, `wedflow` client (`@/api/wedflowClient`), `useWedding()` (`@/lib/WeddingContext`).

## Global Constraints

- All user-facing strings are Hebrew, matching existing copy exactly (e.g. `'הוספת הוצאה'`, `'שולם'`, `'מתוכנן'`).
- All mutations scope writes with `wedding_id: activeWeddingId` from `useWedding()`.
- Every create/update/delete/mark writes a matching `wedflow.entities.ActivityLog.create({...})` entry, preserving the existing `action_type` / `description` wording.
- Query keys: expenses `['expenses']`, payments `['payments']`, guests `['guests']`. Invalidate the same keys the pages invalidate today.
- Test env is `node` (no jsdom/RTL) — only pure logic gets unit tests; component/hook wiring is verified with `npm run lint`, `npm run typecheck`, and the browser preview.
- Hooks perform data + logging + invalidation only. They MUST NOT touch page UI state; callers close their own modals via a per-call `mutate(vars, { onSuccess })`.
- Commit after each task. This repo commits directly to `main` (no PR).

---

### Task 1: Pending-payments helper (pure, TDD)

**Files:**
- Create: `src/lib/payments.js`
- Test: `tests/unit/payments.test.js`

**Interfaces:**
- Produces: `pendingPayments(payments: Array): Array` — returns payments whose `status === 'מתוכנן'`, sorted ascending by `due_date` (ISO `YYYY-MM-DD` string compare). Does not mutate the input.

- [ ] **Step 1: Write the failing test**

```js
// tests/unit/payments.test.js
import { describe, it, expect } from 'vitest';
import { pendingPayments } from '@/lib/payments';

describe('pendingPayments', () => {
  const rows = [
    { id: 'a', status: 'שולם', due_date: '2026-01-01' },
    { id: 'b', status: 'מתוכנן', due_date: '2026-03-01' },
    { id: 'c', status: 'מתוכנן', due_date: '2026-02-01' },
  ];

  it('keeps only planned payments', () => {
    expect(pendingPayments(rows).map(p => p.id)).toEqual(['c', 'b']);
  });

  it('sorts planned payments by due_date ascending', () => {
    const result = pendingPayments(rows);
    expect(result[0].id).toBe('c');
    expect(result[1].id).toBe('b');
  });

  it('does not mutate the input array', () => {
    const copy = [...rows];
    pendingPayments(rows);
    expect(rows).toEqual(copy);
  });

  it('returns an empty array when nothing is planned', () => {
    expect(pendingPayments([{ id: 'x', status: 'שולם', due_date: '2026-01-01' }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- payments`
Expected: FAIL — cannot resolve `@/lib/payments` / `pendingPayments is not a function`.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/payments.js
// Planned payments (status 'מתוכנן'), sorted ascending by due_date.
export function pendingPayments(payments = []) {
  return payments
    .filter(p => p.status === 'מתוכנן')
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- payments`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments.js tests/unit/payments.test.js
git commit -m "feat(payments): add pendingPayments helper"
```

---

### Task 2: `usePaymentMutations` hook + refactor Payments page

**Files:**
- Create: `src/hooks/usePaymentMutations.js`
- Modify: `src/pages/Payments.jsx` (add import; replace the mark-as-paid path in `handleMarkAsPaid`, lines 50-65)

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces: `usePaymentMutations(): { markPaid }` — a react-query mutation. `markPaid.mutate({ payment, paidDate })` where `paidDate` is an ISO `YYYY-MM-DD` string. Sets `status: 'שולם'`, `paid_date: paidDate`, logs an ActivityLog `action_type: 'עדכון תשלום'`, and invalidates `['payments']`.

- [ ] **Step 1: Create the hook**

```jsx
// src/hooks/usePaymentMutations.js
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { wedflow } from '@/api/wedflowClient';
import { useWedding } from '@/lib/WeddingContext';

export function usePaymentMutations() {
  const queryClient = useQueryClient();
  const { activeWeddingId } = useWedding();

  const markPaid = useMutation({
    mutationFn: ({ payment, paidDate }) =>
      wedflow.entities.Payment.update(payment.id, {
        ...payment,
        status: 'שולם',
        paid_date: paidDate,
      }),
    onSuccess: async (payment) => {
      queryClient.invalidateQueries(['payments']);
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'עדכון תשלום',
        entity_type: 'Payment',
        entity_id: payment.id,
        entity_name: payment.expense_vendor,
        description: `סימן תשלום כשולם: ${payment.expense_vendor}`,
      });
    },
  });

  return { markPaid };
}
```

- [ ] **Step 2: Wire the hook into Payments.jsx**

Add the import near the other imports (after line 11):

```jsx
import { usePaymentMutations } from '@/hooks/usePaymentMutations';
```

Inside the component, after the existing `updateMutation` declaration (keep `updateMutation` — it still serves the `handleSetPaidBy` / paid-by flow), add:

```jsx
  const { markPaid } = usePaymentMutations();
```

Replace the body of `handleMarkAsPaid` (currently lines 50-65) so the update goes through the shared hook:

```jsx
  const handleMarkAsPaid = (payment) => {
    const paidDate = prompt('הזן תאריך תשלום בפועל (DD/MM/YYYY):', format(new Date(), 'dd/MM/yyyy'));
    if (!paidDate) return;

    const [day, month, year] = paidDate.split('/');
    const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    markPaid.mutate({ payment, paidDate: dateStr });
  };
```

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Verify in preview**

Start the app (preview_start / `npm run dev`), open the Payments page, click "סמן כשולם" on a planned payment, enter a date. Expected: the row flips to `שולם` with the paid date, and an ActivityLog entry is written. Confirm via preview_snapshot.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePaymentMutations.js src/pages/Payments.jsx
git commit -m "refactor(payments): share mark-as-paid via usePaymentMutations"
```

---

### Task 3: `useExpenseMutations` hook + refactor Expenses page

**Files:**
- Create: `src/hooks/useExpenseMutations.js`
- Modify: `src/pages/Expenses.jsx` (remove inline `syncPayments` + `createMutation`/`updateMutation`/`deleteMutation`, lines 27-146; rewire `handleSave`/`handleDelete`, lines 148-165)

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces: `useExpenseMutations(): { createExpense, updateExpense, deleteExpense }`.
  - `createExpense.mutate(data)` — creates the expense (adds `wedding_id`), regenerates linked Payment records, logs `'הוספת הוצאה'`, invalidates `['expenses']` + `['payments']`.
  - `updateExpense.mutate({ id, data })` — updates, regenerates payments, logs `'עדכון הוצאה'`.
  - `deleteExpense.mutate(expense)` — deletes `expense.id`, logs `'מחיקת הוצאה'` using `expense.vendor`, invalidates `['expenses']`.

- [ ] **Step 1: Create the hook (move `syncPayments` + mutations verbatim)**

```jsx
// src/hooks/useExpenseMutations.js
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { wedflow } from '@/api/wedflowClient';
import { useWedding } from '@/lib/WeddingContext';

export function useExpenseMutations() {
  const queryClient = useQueryClient();
  const { activeWeddingId } = useWedding();

  // Sync Payment records for an expense (deposit + remainder or single).
  const syncPayments = async (expense) => {
    const existing = await wedflow.entities.Payment.filter({ expense_id: expense.id, wedding_id: activeWeddingId });
    await Promise.all(existing.map(p => wedflow.entities.Payment.delete(p.id)));

    if (expense.has_deposit && expense.deposit_amount) {
      const remainderAmount = expense.amount - expense.deposit_amount;
      await wedflow.entities.Payment.create({
        wedding_id: activeWeddingId,
        expense_id: expense.id,
        expense_vendor: `${expense.vendor} - מקדמה`,
        amount: expense.deposit_amount,
        due_date: expense.deposit_status === 'שולם' ? expense.deposit_paid_date : (expense.deposit_due_date || expense.due_date || new Date().toISOString().split('T')[0]),
        status: expense.deposit_status || 'מתוכנן',
        paid_date: expense.deposit_paid_date || null,
        probability: 100,
        notes: expense.notes,
      });
      if (remainderAmount > 0) {
        await wedflow.entities.Payment.create({
          wedding_id: activeWeddingId,
          expense_id: expense.id,
          expense_vendor: `${expense.vendor} - יתרה`,
          amount: remainderAmount,
          due_date: expense.status === 'שולם' ? expense.paid_date : (expense.due_date || new Date().toISOString().split('T')[0]),
          status: expense.status || 'מתוכנן',
          paid_date: expense.paid_date || null,
          probability: expense.probability || 100,
          notes: expense.notes,
        });
      }
    } else {
      const date = expense.status === 'שולם' ? expense.paid_date : expense.due_date;
      if (date) {
        await wedflow.entities.Payment.create({
          wedding_id: activeWeddingId,
          expense_id: expense.id,
          expense_vendor: expense.vendor,
          amount: expense.amount,
          due_date: date,
          status: expense.status,
          paid_date: expense.paid_date || null,
          probability: expense.probability || 100,
          notes: expense.notes,
        });
      }
    }
    queryClient.invalidateQueries(['payments']);
  };

  const createExpense = useMutation({
    mutationFn: (data) => wedflow.entities.Expense.create({ ...data, wedding_id: activeWeddingId }),
    onSuccess: async (expense) => {
      queryClient.invalidateQueries(['expenses']);
      await syncPayments(expense);
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'הוספת הוצאה',
        entity_type: 'Expense',
        entity_id: expense.id,
        entity_name: expense.vendor,
        description: `הוסף הוצאה: ${expense.vendor} - ₪${expense.amount?.toLocaleString('he-IL')}`,
      });
    },
  });

  const updateExpense = useMutation({
    mutationFn: ({ id, data }) => wedflow.entities.Expense.update(id, data),
    onSuccess: async (expense) => {
      queryClient.invalidateQueries(['expenses']);
      await syncPayments(expense);
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'עדכון הוצאה',
        entity_type: 'Expense',
        entity_id: expense.id,
        entity_name: expense.vendor,
        description: `עדכן הוצאה: ${expense.vendor}`,
      });
    },
  });

  const deleteExpense = useMutation({
    mutationFn: (expense) => wedflow.entities.Expense.delete(expense.id),
    onSuccess: async (_, expense) => {
      queryClient.invalidateQueries(['expenses']);
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'מחיקת הוצאה',
        entity_type: 'Expense',
        entity_id: expense.id,
        entity_name: expense.vendor || 'הוצאה',
        description: `מחק הוצאה: ${expense.vendor || expense.id}`,
      });
    },
  });

  return { createExpense, updateExpense, deleteExpense };
}
```

- [ ] **Step 2: Refactor Expenses.jsx to consume the hook**

Add the import after line 12:

```jsx
import { useExpenseMutations } from '@/hooks/useExpenseMutations';
```

Delete the inline `syncPayments`, `createMutation`, `updateMutation`, and `deleteMutation` blocks (current lines 27-146). In their place add:

```jsx
  const { createExpense, updateExpense, deleteExpense } = useExpenseMutations();
```

Rewire the handlers (current lines 148-165) so modal-close stays in the page via per-call `onSuccess`:

```jsx
  const handleSave = (data) => {
    if (editingExpense) {
      updateExpense.mutate({ id: editingExpense.id, data }, { onSuccess: handleCloseForm });
    } else {
      createExpense.mutate(data, { onSuccess: handleCloseForm });
    }
  };

  const handleEdit = (expense) => {
    setEditingExpense(expense);
    setShowForm(true);
  };

  const handleDelete = (expense) => {
    if (window.confirm(`האם למחוק את ההוצאה "${expense.vendor}"?`)) {
      deleteExpense.mutate(expense);
    }
  };
```

`handleCloseForm` already exists below and sets `setShowForm(false)` + `setEditingExpense(null)`. Since `handleSave` now references it, ensure `handleCloseForm` is defined before `handleSave` OR that both are function declarations hoisted — move `handleCloseForm` above `handleSave` if it is a `const` arrow (it is), to avoid a TDZ error. Place `handleCloseForm` immediately after the `useExpenseMutations()` line.

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: no new errors, no unused `useMutation` import (remove `useMutation` from the react-query import in Expenses.jsx if it is now unused; keep `useQuery`/`useQueryClient` only if still referenced — `useQueryClient` is no longer needed after removing the mutations, remove it too if unused).

- [ ] **Step 4: Verify in preview**

Open the Expenses page. Add a new expense with a deposit. Expected: the expense appears AND linked payment rows (`… - מקדמה`, `… - יתרה`) are generated (check the Payments page). Edit and delete an expense; confirm behavior is unchanged. Confirm via preview_snapshot.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useExpenseMutations.js src/pages/Expenses.jsx
git commit -m "refactor(expenses): extract useExpenseMutations with payment sync"
```

---

### Task 4: `useGuestMutations` hook + refactor Guests page

**Files:**
- Create: `src/hooks/useGuestMutations.js`
- Modify: `src/pages/Guests.jsx` (remove inline `createMutation`/`updateMutation`/`deleteMutation`, lines 83-142; rewire `handleSave` line 144, `handleConfirmDelete` line ~178)

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces: `useGuestMutations(): { createGuest, updateGuest, deleteGuest }`.
  - `createGuest.mutate(data)` — creates guest (adds `wedding_id`), logs `'הוספת מוזמן'`, invalidates `['guests']`.
  - `updateGuest.mutate({ id, data })` — updates, logs `'עדכון מוזמן'`.
  - `deleteGuest.mutate(guest)` — deletes `guest.id`, logs `'מחיקת מוזמן'` using `guest.first_name`/`guest.last_name`.

- [ ] **Step 1: Create the hook**

```jsx
// src/hooks/useGuestMutations.js
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { wedflow } from '@/api/wedflowClient';
import { useWedding } from '@/lib/WeddingContext';

const guestName = (g) => `${g?.first_name || ''} ${g?.last_name || ''}`.trim();

export function useGuestMutations() {
  const queryClient = useQueryClient();
  const { activeWeddingId } = useWedding();

  const createGuest = useMutation({
    mutationFn: (data) => wedflow.entities.Guest.create({ ...data, wedding_id: activeWeddingId }),
    onSuccess: async (guest) => {
      queryClient.invalidateQueries(['guests']);
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'הוספת מוזמן',
        entity_type: 'Guest',
        entity_id: guest.id,
        entity_name: guestName(guest),
        description: `הוסף מוזמן חדש: ${guestName(guest)}`,
      });
    },
  });

  const updateGuest = useMutation({
    mutationFn: ({ id, data }) => wedflow.entities.Guest.update(id, data),
    onSuccess: async (guest) => {
      queryClient.invalidateQueries(['guests']);
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'עדכון מוזמן',
        entity_type: 'Guest',
        entity_id: guest.id,
        entity_name: guestName(guest),
        description: `עדכן מוזמן: ${guestName(guest)}`,
      });
    },
  });

  const deleteGuest = useMutation({
    mutationFn: (guest) => wedflow.entities.Guest.delete(guest.id),
    onSuccess: async (_, guest) => {
      queryClient.invalidateQueries(['guests']);
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'מחיקת מוזמן',
        entity_type: 'Guest',
        entity_id: guest.id,
        entity_name: guestName(guest) || 'מוזמן',
        description: `מחק מוזמן: ${guestName(guest) || guest.id}`,
      });
    },
  });

  return { createGuest, updateGuest, deleteGuest };
}
```

- [ ] **Step 2: Refactor Guests.jsx to consume the hook**

Add the import after the `GuestForm` import (line 15):

```jsx
import { useGuestMutations } from '@/hooks/useGuestMutations';
```

Delete the inline `createMutation`, `updateMutation`, `deleteMutation` blocks (current lines 83-142). In their place add:

```jsx
  const { createGuest, updateGuest, deleteGuest } = useGuestMutations();
```

Rewire `handleSave` (keep the quota check exactly as-is) so it closes the form via per-call `onSuccess`:

```jsx
  const handleSave = (data) => {
    if (editingGuest) {
      updateGuest.mutate({ id: editingGuest.id, data }, { onSuccess: handleCloseForm });
    } else {
      const newTotalPeople = myTotalPeople + (data.total_people || 1);
      if (hasQuota && newTotalPeople > user?.max_guests) {
        alert(`חרגת ממכסת המוזמנים שלך (${user?.max_guests} אנשים)`);
        return;
      }
      createGuest.mutate(data, { onSuccess: handleCloseForm });
    }
  };
```

Rewire `handleConfirmDelete` (current line ~177) to pass the full object:

```jsx
  const handleConfirmDelete = () => {
    if (guestToDelete) {
      deleteGuest.mutate(guestToDelete);
      setGuestToDelete(null);
    }
  };
```

`handleCloseForm` is a `const` arrow defined later in the file; move it above `handleSave` (place it right after the `useGuestMutations()` line) to avoid a TDZ error.

- [ ] **Step 3: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: no new errors. Remove `useMutation` and `useQueryClient` from the react-query import in Guests.jsx if they are now unused (check — `queryClient` is used elsewhere in Guests.jsx, e.g. table assignment/sync at lines ~219/353/806, so keep `useQueryClient`; keep `useQuery`).

- [ ] **Step 4: Verify in preview**

Open the Guests page. Add a guest, edit a guest, delete a guest. Expected: identical behavior to before, ActivityLog entries written, quota alert still fires when over `max_guests`. Confirm via preview_snapshot.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useGuestMutations.js src/pages/Guests.jsx
git commit -m "refactor(guests): extract useGuestMutations"
```

---

### Task 5: `MarkPaymentModal` component

**Files:**
- Create: `src/components/payments/MarkPaymentModal.jsx`

**Interfaces:**
- Consumes: `pendingPayments` from `@/lib/payments` (Task 1).
- Produces: default export `MarkPaymentModal`, props `{ open, onClose, payments, onMarkPaid }`. On confirm it calls `onMarkPaid({ payment, paidDate })` where `payment` is the selected payment object and `paidDate` is an ISO `YYYY-MM-DD` string, then calls `onClose()`.

- [ ] **Step 1: Create the component**

```jsx
// src/components/payments/MarkPaymentModal.jsx
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO } from 'date-fns';
import { pendingPayments } from '@/lib/payments';

export default function MarkPaymentModal({ open, onClose, payments = [], onMarkPaid }) {
  const options = pendingPayments(payments);
  const [selectedId, setSelectedId] = useState('');
  const [paidDate, setPaidDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (open) {
      setSelectedId('');
      setPaidDate(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [open]);

  const selected = options.find(p => p.id === selectedId);

  const handleConfirm = () => {
    if (!selected || !paidDate) return;
    onMarkPaid({ payment: selected, paidDate });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>סמן תשלום שבוצע</DialogTitle>
        </DialogHeader>

        {options.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            אין תשלומים מתוכננים לסימון
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">תשלום</label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר תשלום" />
                </SelectTrigger>
                <SelectContent>
                  {options.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.expense_vendor} — ₪{(p.amount || 0).toLocaleString('he-IL')} (יעד: {format(parseISO(p.due_date), 'dd/MM/yyyy')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">תאריך תשלום בפועל</label>
              <Input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>ביטול</Button>
              <Button type="button" onClick={handleConfirm} disabled={!selected || !paidDate}>
                סמן כשולם
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/payments/MarkPaymentModal.jsx
git commit -m "feat(payments): add MarkPaymentModal"
```

---

### Task 6: Wire the modals into the Dashboard

**Files:**
- Modify: `src/pages/Dashboard.jsx` (imports; add modal state + hooks; replace `QuickActions` navigate callbacks at lines 254-258; render the three modals)

**Interfaces:**
- Consumes: `useExpenseMutations` (Task 3), `useGuestMutations` (Task 4), `usePaymentMutations` (Task 2), `MarkPaymentModal` (Task 5), and the existing `ExpenseForm` / `GuestForm` dialogs. Uses the dashboard's existing `expenses` / `payments` / `guests` query data.

- [ ] **Step 1: Add imports**

After the existing component imports (around line 12), add:

```jsx
import ExpenseForm from '../components/expenses/ExpenseForm';
import GuestForm from '../components/guests/GuestForm';
import MarkPaymentModal from '../components/payments/MarkPaymentModal';
import { useExpenseMutations } from '@/hooks/useExpenseMutations';
import { useGuestMutations } from '@/hooks/useGuestMutations';
import { usePaymentMutations } from '@/hooks/usePaymentMutations';
```

- [ ] **Step 2: Add modal state + mutation hooks**

Inside the `Dashboard` component, after the existing `useState`/`useWedding` lines (around line 19), add:

```jsx
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [showMarkPayment, setShowMarkPayment] = useState(false);

  const { createExpense } = useExpenseMutations();
  const { createGuest } = useGuestMutations();
  const { markPaid } = usePaymentMutations();
```

- [ ] **Step 3: Point the QuickActions callbacks at the modals**

Replace the `QuickActions` block (current lines 254-258):

```jsx
        <QuickActions
          onAddExpense={() => setShowExpenseForm(true)}
          onAddGuest={() => setShowGuestForm(true)}
          onMarkPayment={() => setShowMarkPayment(true)}
        />
```

- [ ] **Step 4: Render the modals**

Just before the final closing `</div>` of the component's returned JSX (after the Timeline block, current line ~270), add:

```jsx
      <ExpenseForm
        open={showExpenseForm}
        onClose={() => setShowExpenseForm(false)}
        expense={null}
        onSave={(data) => createExpense.mutate(data, { onSuccess: () => setShowExpenseForm(false) })}
      />

      <GuestForm
        open={showGuestForm}
        onClose={() => setShowGuestForm(false)}
        guest={null}
        guests={guests}
        onSave={(data) => createGuest.mutate(data, { onSuccess: () => setShowGuestForm(false) })}
      />

      <MarkPaymentModal
        open={showMarkPayment}
        onClose={() => setShowMarkPayment(false)}
        payments={payments}
        onMarkPaid={({ payment, paidDate }) => markPaid.mutate({ payment, paidDate })}
      />
```

- [ ] **Step 5: Remove now-unused navigation code**

If `navigate` / `createPageUrl` are no longer referenced anywhere in Dashboard.jsx, remove the `useNavigate` import (line 5), the `createPageUrl` import (line 6), and the `const navigate = useNavigate();` line (line 16). Run a grep first: `grep -n "navigate\|createPageUrl" src/pages/Dashboard.jsx`. Only remove what is truly unused.

- [ ] **Step 6: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: no new errors.

- [ ] **Step 7: Verify in preview (the whole feature)**

Open the Dashboard. For each of the three Quick-Action buttons:
- **הוסף הוצאה** → `ExpenseForm` opens in place (no navigation). Save an expense; modal closes; the KPI cards and pie chart update; linked payments are created (check Payments page).
- **הוסף מוזמן** → `GuestForm` opens in place. Save a guest; modal closes; guest KPIs update.
- **סמן תשלום שבוצע** → `MarkPaymentModal` opens; select a planned payment, pick a date, confirm; modal closes; payment KPIs update.

Confirm the URL never changes (stays on the dashboard) using preview_snapshot / preview_screenshot, and that preview_console_logs shows no errors.

- [ ] **Step 8: Commit**

```bash
git add src/pages/Dashboard.jsx
git commit -m "feat(dashboard): open quick-action modals in place instead of navigating"
```

---

## Self-Review

**Spec coverage:**
- Reuse `ExpenseForm` / `GuestForm` in dashboard → Task 6.
- New `MarkPaymentModal` with a real date input replacing `prompt()` → Tasks 1 + 5, wired in Task 6.
- Extract shared save logic (no duplication of `syncPayments` / ActivityLog) → Tasks 3 (expense), 4 (guest), 2 (payment).
- Pages keep visible behavior; only delegate to hooks → Tasks 2/3/4 verification steps.
- Dashboard KPIs refresh via existing query invalidation → covered by hook `invalidateQueries` + Task 6 Step 7.
- QuickActions component unchanged → confirmed (Task 6 only changes the callbacks passed to it).

**Placeholder scan:** No TBD/TODO; every code step contains full code; commands have expected output.

**Type/name consistency:** Hook return shapes (`createExpense`/`updateExpense`/`deleteExpense`, `createGuest`/`updateGuest`/`deleteGuest`, `markPaid`) match their consumers in Tasks 2/3/4/6. `pendingPayments` name matches between Task 1 and Task 5. `markPaid.mutate({ payment, paidDate })` shape matches `MarkPaymentModal`'s `onMarkPaid({ payment, paidDate })` callback.

**Known intentional gaps:** The dashboard's Add-Guest flow does not replicate the Guests page's per-user quota pre-check or the creator-only edit/delete guard (those are page-level concerns for the guest table); dashboard quick-add just creates. Note for reviewer — acceptable per spec's "dashboard uses `createGuest`".
