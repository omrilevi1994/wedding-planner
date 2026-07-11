import React, { useState } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { useQuery } from '@tanstack/react-query';
import { Wallet, TrendingDown, TrendingUp, DollarSign, Users, UserCheck, Gift } from 'lucide-react';
import KPICard from '../components/dashboard/KPICard';
import ExpensesPieChart from '../components/dashboard/ExpensesPieChart';
import MonthlyTimeline from '../components/dashboard/MonthlyTimeline';
import QuickActions from '../components/dashboard/QuickActions';
import GuestsPieCharts from '../components/dashboard/GuestsPieCharts';
import { useWedding } from '@/lib/WeddingContext';
import ExpenseForm from '../components/expenses/ExpenseForm';
import GuestForm from '../components/guests/GuestForm';
import MarkPaymentModal from '../components/payments/MarkPaymentModal';
import { useExpenseMutations } from '@/hooks/useExpenseMutations';
import { useGuestMutations } from '@/hooks/useGuestMutations';
import { usePaymentMutations } from '@/hooks/usePaymentMutations';


export default function Dashboard() {
  // `user` comes from WeddingContext (synthUser: profile + active-membership
  // fields like wedding_sides). Dashboard only mounts after that context has
  // finished loading, so re-fetching the profile here was both a redundant
  // network round-trip and a bug — auth.me() doesn't return wedding_sides, so
  // the greeting below never matched.
  const { activeWedding, activeWeddingId, user } = useWedding();

  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [showMarkPayment, setShowMarkPayment] = useState(false);

  const { createExpense } = useExpenseMutations();
  const { createGuest } = useGuestMutations();
  const { markPaid } = usePaymentMutations();

  const { data: settings } = useQuery({
    queryKey: ['settings', activeWeddingId],
    queryFn: async () => {
      const list = await wedflow.entities.WeddingSetting.filter({ wedding_id: activeWeddingId });
      return list[0] || null;
    },
    enabled: !!activeWeddingId
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', activeWeddingId],
    queryFn: () => wedflow.entities.Expense.filter({ wedding_id: activeWeddingId }),
    enabled: !!activeWeddingId
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['payments', activeWeddingId],
    queryFn: () => wedflow.entities.Payment.filter({ wedding_id: activeWeddingId }),
    enabled: !!activeWeddingId
  });

  const { data: guests = [] } = useQuery({
    queryKey: ['guests', activeWeddingId],
    queryFn: () => wedflow.entities.Guest.filter({ wedding_id: activeWeddingId }),
    enabled: !!activeWeddingId
  });

  // Determine greeting message
  const greetingMessage = React.useMemo(() => {
    if (!user?.wedding_sides || user.wedding_sides.length === 0) return null;
    if (user.wedding_sides.length > 1) return null;

    const side = user.wedding_sides[0];
    const greetings = {
      'כלה - אבא': 'ברוכים הבאים לאבא של הכלה',
      'כלה - אמא': 'ברוכים הבאים לאמא של הכלה',
      'חתן - אבא': 'ברוכים הבאים לאבא של החתן',
      'חתן - אמא': 'ברוכים הבאים לאמא של החתן'
    };
    
    return greetings[side] || null;
  }, [user]);

  // הוצאות שנכנסות לחישוב (לא "אחר")
  const billableExpenses = expenses.filter(e => e.paid_by_party !== 'אחר' && e.paid_by_party !== 'הורים');

  // Calculate metrics from expenses only
  const totalPaid = billableExpenses.reduce((sum, e) => {
    let paid = 0;
    if (e.has_deposit && e.deposit_amount) {
      if (e.deposit_status === 'שולם') paid += e.deposit_amount;
      if (e.status === 'שולם') paid += ((e.amount || 0) - e.deposit_amount);
    } else {
      if (e.status === 'שולם') paid += (e.amount || 0);
    }
    return sum + paid;
  }, 0);

  const totalPlanned = billableExpenses.reduce((sum, e) => {
    const prob = (e.probability || 100) / 100;
    let planned = 0;
    if (e.has_deposit && e.deposit_amount) {
      if (e.deposit_status !== 'שולם') planned += e.deposit_amount * prob;
      if (e.status !== 'שולם') planned += ((e.amount || 0) - e.deposit_amount) * prob;
    } else {
      if (e.status !== 'שולם') planned += (e.amount || 0) * prob;
    }
    return sum + planned;
  }, 0);

  const totalExpected = totalPaid + totalPlanned;
  const budgetTarget = settings?.budget_target || 0;
  const remaining = budgetTarget - totalExpected;

  const totalInvited = guests.reduce((sum, g) => sum + (g.total_people || 1), 0);
  const totalConfirmed = guests
    .filter(g => g.status === 'אישר')
    .reduce((sum, g) => sum + (g.confirmed_people != null ? g.confirmed_people : (g.total_people || 1)), 0);
  const totalAttended = guests
    .filter(g => g.status === 'הגיע')
    .reduce((sum, g) => sum + (g.confirmed_people != null ? g.confirmed_people : (g.total_people || 1)), 0);

  // Gifts
  const totalGifts = guests.reduce((sum, g) => sum + (g.gift_amount || 0), 0);
  const netAfterGifts = totalGifts - totalPaid;

  const calcMode = settings?.cost_calc_mode || 'confirmed';
  const guestCountForCalc = calcMode === 'confirmed' ? totalConfirmed : totalInvited;
  const costPerGuest = guestCountForCalc > 0 ? totalExpected / guestCountForCalc : 0;
  const actualCostPerGuest = totalConfirmed > 0 ? totalPaid / totalConfirmed : 0;

  // עלות לפי צפי המוזמנים
  const expectedGuestsCount = settings?.expected_guests;
  const costPerExpectedGuest = expectedGuestsCount > 0 ? totalExpected / expectedGuestsCount : 0;

  // Every Expense record automatically has one or two mirrored Payment
  // records (see Expenses.jsx's syncPayments), so filter payments down to
  // the same "billable" expenses used for the KPI totals above — otherwise
  // the monthly timeline would include costs paid by parents / "other" that
  // the rest of the dashboard deliberately excludes.
  const billableExpenseIds = new Set(billableExpenses.map((e) => e.id));
  const billablePayments = payments.filter((p) => billableExpenseIds.has(p.expense_id));

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Greeting */}
      {greetingMessage && (
        <div className="bg-gradient-to-l from-rose-light/40 to-champagne/40 border border-rose/30 rounded-xl p-6 text-center shadow-sm">
          <h2 className="text-2xl font-bold text-rose-deep">{greetingMessage}</h2>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">דשבורד</h1>
        <p className="text-muted-foreground">סקירה כללית של החתונה שלכם</p>
      </div>

      {/* KPI Cards Grid */}
      <div>
      <p className="text-xs font-semibold tracking-wide text-rose-deep/80 mb-3">תקציב</p>
      <div data-tour="dashboard-kpis" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="תקציב כולל"
          value={`₪${budgetTarget.toLocaleString('he-IL')}`}
          subtitle="יעד שהוגדר"
          icon={Wallet}
          colorClass="from-taupe/30 to-taupe/10"
        />
        <KPICard
          title="סה״כ שולם בפועל"
          value={`₪${totalPaid.toLocaleString('he-IL')}`}
          subtitle="תשלומים שבוצעו"
          icon={TrendingDown}
          colorClass="from-rose-light/60 to-rose-light/20"
        />
        <KPICard
          title="סה״כ מתוכנן לעתיד"
          value={`₪${totalPlanned.toLocaleString('he-IL')}`}
          subtitle="תשלומים עתידיים"
          icon={TrendingUp}
          colorClass="from-taupe/30 to-taupe/10"
        />
        <KPICard
          title="יתרה לתשלום"
          value={`₪${remaining.toLocaleString('he-IL')}`}
          subtitle={remaining >= 0 ? 'נשאר בתקציב' : 'חריגה מהתקציב'}
          icon={DollarSign}
          colorClass={remaining >= 0 ? 'from-sage/30 to-sage/10' : 'from-destructive/30 to-destructive/10'}
        />
      </div>
      </div>

      {/* Gifts Section */}
      <div>
      <p className="text-xs font-semibold tracking-wide text-rose-deep/80 mb-3">מתנות</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <KPICard
          title="סה״כ מתנות שהתקבלו"
          value={`₪${totalGifts.toLocaleString('he-IL')}`}
          subtitle="סכום כל המתנות שהוזנו"
          icon={Gift}
          colorClass="from-rose-light/60 to-rose-light/20"
        />
        <KPICard
          title={netAfterGifts >= 0 ? 'רווח נקי מהחתונה' : 'עלות נטו של החתונה'}
          value={`₪${Math.abs(netAfterGifts).toLocaleString('he-IL')}`}
          subtitle={netAfterGifts >= 0 ? 'מתנות פחות עלות האירוע' : 'עלות האירוע פחות מתנות'}
          icon={DollarSign}
          colorClass={netAfterGifts >= 0 ? 'from-sage/30 to-sage/10' : 'from-champagne to-champagne/40'}
        />
      </div>
      </div>

      {/* Guest & Cost Stats */}
      <div>
      <p className="text-xs font-semibold tracking-wide text-rose-deep/80 mb-3">אורחים ועלויות</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <KPICard
          title="מספר מוזמנים"
          value={`${totalInvited}`}
          subtitle={`${totalConfirmed} אישרו | ${totalAttended} הגיעו`}
          icon={Users}
          colorClass="from-rose-light/60 to-rose-light/20"
        />
        {expectedGuestsCount > 0 ? (
          <KPICard
            title="עלות ממוצעת למוזמן (לפי צפי)"
            value={`₪${Math.round(costPerExpectedGuest).toLocaleString('he-IL')}`}
            subtitle={`מחושב לפי צפי של ${expectedGuestsCount} מוזמנים`}
            icon={UserCheck}
            colorClass="from-champagne to-champagne/40"
          />
        ) : (
          <KPICard
            title="עלות ממוצעת למוזמן (צפי)"
            value={`₪${Math.round(costPerGuest).toLocaleString('he-IL')}`}
            subtitle={`מחושב לפי ${calcMode === 'confirmed' ? 'מאושרים' : 'מוזמנים'}`}
            icon={UserCheck}
            colorClass="from-champagne to-champagne/40"
          />
        )}
        <KPICard
          title="עלות חתונה עד עכשיו"
          value={`₪${totalPaid.toLocaleString('he-IL')}`}
          subtitle={`₪${Math.round(actualCostPerGuest).toLocaleString('he-IL')} למוזמן מאושר`}
          icon={DollarSign}
          colorClass="from-rose to-rose-light/40"
        />
      </div>
      </div>

      {/* Charts & Actions */}
      <div>
      <p className="text-xs font-semibold tracking-wide text-rose-deep/80 mb-3">פילוח וניתוח</p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ExpensesPieChart expenses={billableExpenses} />
        </div>
        <div data-tour="dashboard-quick-actions">
          <QuickActions
            onAddExpense={() => setShowExpenseForm(true)}
            onAddGuest={() => setShowGuestForm(true)}
            onMarkPayment={() => setShowMarkPayment(true)}
          />
        </div>
      </div>

      {/* Guest Analytics */}
      <div className="mt-6">
        <GuestsPieCharts guests={guests} />
      </div>

      {/* Timeline */}
      <div className="mt-6">
        <MonthlyTimeline payments={billablePayments} />
      </div>
      </div>

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
    </div>
  );
}