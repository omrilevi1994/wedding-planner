import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';

export default function MonthlyTimeline({ expenses, payments }) {
  // Group expenses and payments by month
  const monthlyData = {};

  // Add paid expenses
  expenses.forEach(expense => {
    if (expense.status === 'שולם' && expense.paid_date) {
      const month = format(parseISO(expense.paid_date), 'yyyy-MM');
      if (!monthlyData[month]) {
        monthlyData[month] = { month, paid: 0, planned: 0 };
      }
      monthlyData[month].paid += expense.amount || 0;
    }
  });

  // Add planned payments
  payments.forEach(payment => {
    if (payment.status === 'מתוכנן' && payment.due_date) {
      const month = format(parseISO(payment.due_date), 'yyyy-MM');
      if (!monthlyData[month]) {
        monthlyData[month] = { month, paid: 0, planned: 0 };
      }
      monthlyData[month].planned += (payment.amount || 0) * ((payment.probability || 100) / 100);
    } else if (payment.status === 'שולם' && payment.paid_date) {
      const month = format(parseISO(payment.paid_date), 'yyyy-MM');
      if (!monthlyData[month]) {
        monthlyData[month] = { month, paid: 0, planned: 0 };
      }
      monthlyData[month].paid += payment.amount || 0;
    }
  });

  const data = Object.values(monthlyData)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map(item => ({
      ...item,
      monthLabel: format(parseISO(item.month + '-01'), 'MMM yyyy', { locale: he })
    }));

  if (data.length === 0) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">ציר זמן חודשי - הוצאות ותשלומים</CardTitle>
        </CardHeader>
        <CardContent className="h-64 flex items-center justify-center">
          <p className="text-gray-400 text-sm">אין עדיין נתונים להצגה</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="text-lg">ציר זמן חודשי - הוצאות ותשלומים</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="monthLabel" />
            <YAxis />
            <Tooltip
              formatter={(value) => `₪${value.toLocaleString('he-IL')}`}
              contentStyle={{ direction: 'rtl' }}
            />
            <Legend wrapperStyle={{ direction: 'rtl' }} />
            <Bar dataKey="paid" fill="#D4AF37" name="שולם" />
            <Bar dataKey="planned" fill="#F4E4C1" name="מתוכנן" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}