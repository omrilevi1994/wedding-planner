import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { wedflow } from '@/api/wedflowClient';
import VenueCalculator from '../components/dashboard/VenueCalculator';

export default function Calculator() {
  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => wedflow.entities.Expense.list()
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['payments'],
    queryFn: () => wedflow.entities.Payment.list()
  });

  const { data: guests = [] } = useQuery({
    queryKey: ['guests'],
    queryFn: () => wedflow.entities.Guest.list()
  });

  const { data: settings = [] } = useQuery({
    queryKey: ['weddingSettings'],
    queryFn: () => wedflow.entities.WeddingSetting.list()
  });

  const weddingSetting = settings[0] || {};
  const expectedGuests = weddingSetting.expected_guests || 0;

  // הוצאות אולם מוחרגות כי זה מה שאנחנו מחשבים במחשבון
  const nonVenueExpenses = expenses.filter(e => e.category !== 'אולם');

  const totalPaid = nonVenueExpenses
    .filter(e => e.status === 'שולם')
    .reduce((sum, e) => sum + (e.amount || 0), 0) +
    payments
    .filter(p => p.status === 'שולם')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const totalPlanned = nonVenueExpenses
    .filter(e => e.status === 'מתוכנן')
    .reduce((sum, e) => sum + (e.amount || 0) * ((e.probability || 100) / 100), 0) +
    payments
    .filter(p => p.status === 'מתוכנן')
    .reduce((sum, p) => sum + (p.amount || 0) * ((p.probability || 100) / 100), 0);

  const totalExpected = totalPaid + totalPlanned;

  const totalConfirmed = guests
    .filter(g => g.status === 'אישר')
    .reduce((sum, g) => sum + (g.total_people || 1), 0);

  const totalInvited = guests.reduce((sum, g) => sum + (g.total_people || 1), 0);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">מחשבון אולם</h1>
        <p className="text-gray-600">חשב עלות חתונה לפי מחיר האולם</p>
      </div>
      <VenueCalculator
        totalExpenses={totalExpected}
        totalConfirmed={totalConfirmed}
        totalInvited={expectedGuests || totalInvited}
      />
    </div>
  );
}