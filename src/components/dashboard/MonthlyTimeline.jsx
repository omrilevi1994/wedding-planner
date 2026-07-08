import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { format, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';
import { ChartTooltip, formatILS } from './ChartTooltip';

const PAID_COLOR = 'hsl(var(--chart-3))';
const PLANNED_COLOR = 'hsl(var(--chart-2))';

// Compact axis labels like "₪12.5k" instead of the full localized number,
// which quickly overflows the plot on months with large totals.
const formatCompactILS = (value) => {
  const abs = Math.abs(value);
  if (abs >= 1000) return `₪${(value / 1000).toLocaleString('he-IL', { maximumFractionDigits: 1 })}k`;
  return `₪${value.toLocaleString('he-IL')}`;
};

export default function MonthlyTimeline({ payments }) {
  // Every Expense automatically has one or two mirrored Payment records
  // (deposit + remainder, or a single payment) created in Expenses.jsx's
  // syncPayments(). Payments is therefore the single source of truth for
  // what's paid vs. planned, already correctly split by deposit and
  // weighted by probability. The previous version summed *both* Expense
  // records (status === 'שולם') AND Payment records (status === 'שולם')
  // into the "paid" bucket, double-counting every settled expense in this
  // chart. It now reads only from payments.
  const monthlyData = {};

  payments.forEach((payment) => {
    if (payment.status === 'שולם' && payment.paid_date) {
      const month = format(parseISO(payment.paid_date), 'yyyy-MM');
      if (!monthlyData[month]) monthlyData[month] = { month, paid: 0, planned: 0 };
      monthlyData[month].paid += payment.amount || 0;
    } else if (payment.status !== 'שולם' && payment.due_date) {
      const month = format(parseISO(payment.due_date), 'yyyy-MM');
      if (!monthlyData[month]) monthlyData[month] = { month, paid: 0, planned: 0 };
      monthlyData[month].planned += (payment.amount || 0) * ((payment.probability ?? 100) / 100);
    }
  });

  const data = Object.values(monthlyData)
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((item) => ({
      ...item,
      monthLabel: format(parseISO(item.month + '-01'), 'MMMM yyyy', { locale: he }),
    }));

  if (data.length === 0) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">ציר זמן חודשי — הוצאות ותשלומים</CardTitle>
        </CardHeader>
        <CardContent className="h-64 flex items-center justify-center">
          <p className="text-muted-foreground text-sm">אין עדיין נתונים להצגה</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg">ציר זמן חודשי — הוצאות ותשלומים</CardTitle>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PAID_COLOR }} />
            שולם
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: PLANNED_COLOR }} />
            מתוכנן
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="monthLabel"
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatCompactILS}
              orientation="right"
              width={56}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
              content={
                <ChartTooltip
                  formatter={(value, name) => [formatILS(value), name]}
                />
              }
            />
            <Bar
              dataKey="paid"
              fill={PAID_COLOR}
              name="שולם"
              radius={[4, 4, 0, 0]}
              animationDuration={700}
            />
            <Bar
              dataKey="planned"
              fill={PLANNED_COLOR}
              name="מתוכנן"
              radius={[4, 4, 0, 0]}
              animationDuration={700}
              animationBegin={120}
            />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
