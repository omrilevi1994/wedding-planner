import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Wallet, TrendingDown, TrendingUp, DollarSign, Users, UserCheck, Gift } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../utils';
import KPICard from '../components/dashboard/KPICard';
import ExpensesPieChart from '../components/dashboard/ExpensesPieChart';
import MonthlyTimeline from '../components/dashboard/MonthlyTimeline';
import QuickActions from '../components/dashboard/QuickActions';
import GuestsPieCharts from '../components/dashboard/GuestsPieCharts';
import { useWedding } from '@/lib/WeddingContext';


export default function Dashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const { activeWedding, activeWeddingId } = useWedding();

  useEffect(() => {
    base44.auth.me().then(currentUser => {
      setCurrentUser(currentUser);
      setIsCheckingAuth(false);
    }).catch(() => {
      setCurrentUser(null);
      setIsCheckingAuth(false);
    });
  }, []);

  const { data: settings } = useQuery({
    queryKey: ['settings', activeWeddingId],
    queryFn: async () => {
      const list = await base44.entities.WeddingSetting.filter({ wedding_id: activeWeddingId });
      return list[0] || null;
    },
    enabled: !!activeWeddingId
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses', activeWeddingId],
    queryFn: () => base44.entities.Expense.filter({ wedding_id: activeWeddingId }),
    enabled: !!activeWeddingId
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['payments', activeWeddingId],
    queryFn: () => base44.entities.Payment.filter({ wedding_id: activeWeddingId }),
    enabled: !!activeWeddingId
  });

  const { data: guests = [] } = useQuery({
    queryKey: ['guests', activeWeddingId],
    queryFn: () => base44.entities.Guest.filter({ wedding_id: activeWeddingId }),
    enabled: !!activeWeddingId
  });

  // Determine greeting message
  const greetingMessage = React.useMemo(() => {
    if (!currentUser?.wedding_sides || currentUser.wedding_sides.length === 0) return null;
    if (currentUser.wedding_sides.length > 1) return null;
    
    const side = currentUser.wedding_sides[0];
    const greetings = {
      'כלה - אבא': 'ברוכים הבאים לאבא של הכלה',
      'כלה - אמא': 'ברוכים הבאים לאמא של הכלה',
      'חתן - אבא': 'ברוכים הבאים לאבא של החתן',
      'חתן - אמא': 'ברוכים הבאים לאמא של החתן'
    };
    
    return greetings[side] || null;
  }, [currentUser]);

  // הוצאות שנכנסות לחישוב (לא "אחר")
  const billableExpenses = expenses.filter(e => e.paid_by_party !== 'אחר' && e.paid_by_party !== 'הורים');

  // Calculate metrics from expenses only
  const totalPaid = billableExpenses.reduce((sum, e) => {
    let paid = 0;
    if (e.has_deposit && e.deposit_amount) {
      if (e.deposit_status === 'שולם') paid += e.deposit_amount;
      if (e.status === 'שולם') paid += (e.amount - e.deposit_amount);
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
      if (e.status !== 'שולם') planned += (e.amount - e.deposit_amount) * prob;
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

  if (isCheckingAuth) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Greeting */}
      {greetingMessage && (
        <div className="bg-gradient-to-l from-amber-100 to-amber-50 border border-amber-200 rounded-xl p-6 text-center shadow-sm">
          <h2 className="text-2xl font-bold text-amber-900">{greetingMessage}</h2>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">דשבורד</h1>
        <p className="text-gray-600">סקירה כללית של החתונה שלכם</p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="תקציב כולל"
          value={`₪${budgetTarget.toLocaleString('he-IL')}`}
          subtitle="יעד שהוגדר"
          icon={Wallet}
          colorClass="from-blue-100 to-blue-50"
        />
        <KPICard
          title="סה״כ שולם בפועל"
          value={`₪${totalPaid.toLocaleString('he-IL')}`}
          subtitle="תשלומים שבוצעו"
          icon={TrendingDown}
          colorClass="from-red-100 to-red-50"
        />
        <KPICard
          title="סה״כ מתוכנן לעתיד"
          value={`₪${totalPlanned.toLocaleString('he-IL')}`}
          subtitle="תשלומים עתידיים"
          icon={TrendingUp}
          colorClass="from-purple-100 to-purple-50"
        />
        <KPICard
          title="יתרה לתשלום"
          value={`₪${remaining.toLocaleString('he-IL')}`}
          subtitle={remaining >= 0 ? 'נשאר בתקציב' : 'חריגה מהתקציב'}
          icon={DollarSign}
          colorClass={remaining >= 0 ? 'from-green-100 to-green-50' : 'from-red-100 to-red-50'}
        />
      </div>

      {/* Gifts Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <KPICard
          title="סה״כ מתנות שהתקבלו"
          value={`₪${totalGifts.toLocaleString('he-IL')}`}
          subtitle="סכום כל המתנות שהוזנו"
          icon={Gift}
          colorClass="from-pink-100 to-pink-50"
        />
        <KPICard
          title={netAfterGifts >= 0 ? 'רווח נקי מהחתונה' : 'עלות נטו של החתונה'}
          value={`₪${Math.abs(netAfterGifts).toLocaleString('he-IL')}`}
          subtitle={netAfterGifts >= 0 ? 'מתנות פחות עלות האירוע' : 'עלות האירוע פחות מתנות'}
          icon={DollarSign}
          colorClass={netAfterGifts >= 0 ? 'from-green-100 to-green-50' : 'from-orange-100 to-orange-50'}
        />
      </div>

      {/* Guest & Cost Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <KPICard
          title="מספר מוזמנים"
          value={`${totalInvited}`}
          subtitle={`${totalConfirmed} אישרו | ${totalAttended} הגיעו`}
          icon={Users}
          colorClass="from-amber-100 to-amber-50"
        />
        {expectedGuestsCount > 0 ? (
          <KPICard
            title="עלות ממוצעת למוזמן (לפי צפי)"
            value={`₪${Math.round(costPerExpectedGuest).toLocaleString('he-IL')}`}
            subtitle={`מחושב לפי צפי של ${expectedGuestsCount} מוזמנים`}
            icon={UserCheck}
            colorClass="from-yellow-100 to-yellow-50"
          />
        ) : (
          <KPICard
            title="עלות ממוצעת למוזמן (צפי)"
            value={`₪${Math.round(costPerGuest).toLocaleString('he-IL')}`}
            subtitle={`מחושב לפי ${calcMode === 'confirmed' ? 'מאושרים' : 'מוזמנים'}`}
            icon={UserCheck}
            colorClass="from-yellow-100 to-yellow-50"
          />
        )}
        <KPICard
          title="עלות חתונה עד עכשיו"
          value={`₪${totalPaid.toLocaleString('he-IL')}`}
          subtitle={`₪${Math.round(actualCostPerGuest).toLocaleString('he-IL')} למוזמן מאושר`}
          icon={DollarSign}
          colorClass="from-orange-100 to-orange-50"
        />
      </div>

      {/* Charts & Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ExpensesPieChart expenses={billableExpenses} />
        </div>
        <QuickActions
          onAddExpense={() => navigate(createPageUrl('Expenses'))}
          onAddGuest={() => navigate(createPageUrl('Guests'))}
          onMarkPayment={() => navigate(createPageUrl('Payments'))}
        />
      </div>

      {/* Guest Analytics */}
      <GuestsPieCharts guests={guests} />

      {/* Timeline */}
      <MonthlyTimeline expenses={billableExpenses} payments={payments} />
    </div>
  );
}