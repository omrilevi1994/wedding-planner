import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const COLORS = [
  '#D4AF37', '#F4E4C1', '#B8962E', '#E8C368', '#A67C52',
  '#FFD700', '#DAA520', '#B8860B', '#CD853F', '#DEB887',
  '#F5DEB3', '#FFE4B5', '#FFDAB9'
];

export default function ExpensesPieChart({ expenses }) {
  // Group by category and sum amounts (exclude "אחר" paid_by_party)
  const categoryData = expenses.filter(e => e.paid_by_party !== 'אחר' && e.paid_by_party !== 'הורים').reduce((acc, expense) => {
    const category = expense.category || 'אחר';
    if (!acc[category]) {
      acc[category] = 0;
    }
    // Only count paid expenses or planned with probability
    if (expense.status === 'שולם') {
      acc[category] += expense.amount || 0;
    } else if (expense.status === 'מתוכנן') {
      acc[category] += (expense.amount || 0) * ((expense.probability || 100) / 100);
    }
    return acc;
  }, {});

  const data = Object.entries(categoryData)
    .map(([name, value]) => ({ name, value }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value);

  if (data.length === 0) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="text-lg">התפלגות הוצאות לפי קטגוריות</CardTitle>
        </CardHeader>
        <CardContent className="h-64 flex items-center justify-center">
          <p className="text-gray-400 text-sm">אין עדיין הוצאות להצגה</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle className="text-lg">התפלגות הוצאות לפי קטגוריות</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => `₪${value.toLocaleString('he-IL')}`}
              contentStyle={{ direction: 'rtl' }}
            />
            <Legend wrapperStyle={{ direction: 'rtl' }} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}