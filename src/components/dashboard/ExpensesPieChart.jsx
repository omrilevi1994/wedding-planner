import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import DonutChart from './DonutChart';
import { formatILS } from './ChartTooltip';

// Rotates through the brand palette; wedding expense categories rarely
// exceed ~8 in practice so repeats are uncommon, and the legend text always
// disambiguates regardless.
const CATEGORY_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--sage))',
  'hsl(var(--taupe))',
  'hsl(var(--rose-deep))',
  'hsl(var(--sage-deep))',
  'hsl(var(--rose-light))',
  'hsl(var(--chart-2))',
  'hsl(var(--destructive))',
];

export default function ExpensesPieChart({ expenses }) {
  // Group by category using the *same* paid/planned split as the dashboard's
  // KPI cards (deposit-aware, probability-weighted). Previously this chart
  // summed the full expense amount for any "planned" expense — even when a
  // deposit on that expense was already paid in full — which double-counted
  // the deposit portion once here and once in the KPI totals, and made the
  // slices not add up to the "total expected" figure shown above the chart
  // whenever an expense had a deposit and probability < 100%.
  const billable = expenses.filter((e) => e.paid_by_party !== 'אחר' && e.paid_by_party !== 'הורים');

  const categoryTotals = billable.reduce((acc, e) => {
    const category = e.category || 'אחר';
    const prob = (e.probability || 100) / 100;
    let paid = 0;
    let planned = 0;

    if (e.has_deposit && e.deposit_amount) {
      const remainder = (e.amount || 0) - e.deposit_amount;
      if (e.deposit_status === 'שולם') paid += e.deposit_amount;
      else planned += e.deposit_amount * prob;
      if (e.status === 'שולם') paid += remainder;
      else planned += remainder * prob;
    } else {
      if (e.status === 'שולם') paid += e.amount || 0;
      else planned += (e.amount || 0) * prob;
    }

    if (!acc[category]) acc[category] = { paid: 0, planned: 0 };
    acc[category].paid += paid;
    acc[category].planned += planned;
    return acc;
  }, {});

  const data = Object.entries(categoryTotals)
    .map(([name, { paid, planned }], i) => ({
      name,
      value: paid + planned,
      paid,
      planned,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }))
    .filter((item) => item.value > 0.5)
    .sort((a, b) => b.value - a.value);

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card className="shadow-md h-full">
      <CardHeader>
        <CardTitle className="text-lg">התפלגות הוצאות לפי קטגוריות</CardTitle>
      </CardHeader>
      <CardContent>
        <DonutChart
          data={data}
          centerValue={formatILS(total)}
          centerLabel="סה״כ צפי"
          legendValueFormatter={formatILS}
          tooltipFormatter={(value, entry) => (
            <span className="flex flex-col items-end">
              <span>{formatILS(value)}</span>
              {entry?.payload?.paid > 0 && entry?.payload?.planned > 0 && (
                <span className="text-xs text-muted-foreground font-normal">
                  {formatILS(entry.payload.paid)} שולם · {formatILS(entry.payload.planned)} מתוכנן
                </span>
              )}
            </span>
          )}
          emptyMessage="אין עדיין הוצאות להצגה"
        />
      </CardContent>
    </Card>
  );
}
