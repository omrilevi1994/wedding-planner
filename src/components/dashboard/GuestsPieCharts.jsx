import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import DonutChart from './DonutChart';

const SIDE_COLORS = ['hsl(var(--primary))', 'hsl(var(--sage))', 'hsl(var(--taupe))'];
const RELATIONSHIP_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--sage))',
  'hsl(var(--chart-2))',
  'hsl(var(--rose-deep))',
  'hsl(var(--sage-deep))',
  'hsl(var(--taupe))',
];

function groupByPeople(guests, keyFn) {
  const totals = {};
  guests.forEach((g) => {
    const key = keyFn(g) || 'אחר';
    totals[key] = (totals[key] || 0) + (g.total_people || 1);
  });
  return totals;
}

function toChartData(totals, palette) {
  return Object.entries(totals)
    .map(([name, value], i) => ({ name, value, color: palette[i % palette.length] }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);
}

const peopleFormatter = (v) => `${v.toLocaleString('he-IL')}`;

export default function GuestsPieCharts({ guests }) {
  const sideData = toChartData(groupByPeople(guests, (g) => g.side), SIDE_COLORS);
  const relationshipData = toChartData(groupByPeople(guests, (g) => g.relationship), RELATIONSHIP_COLORS);

  const totalSide = sideData.reduce((sum, d) => sum + d.value, 0);
  const totalRelationship = relationshipData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="shadow-md h-full">
        <CardHeader>
          <CardTitle className="text-lg">פילוח מוזמנים לפי צד</CardTitle>
        </CardHeader>
        <CardContent>
          <DonutChart
            data={sideData}
            centerValue={totalSide.toLocaleString('he-IL')}
            centerLabel="סה״כ מוזמנים"
            legendValueFormatter={peopleFormatter}
            tooltipFormatter={(value) => `${peopleFormatter(value)} אנשים`}
          />
        </CardContent>
      </Card>

      <Card className="shadow-md h-full">
        <CardHeader>
          <CardTitle className="text-lg">פילוח מוזמנים לפי קרבה</CardTitle>
        </CardHeader>
        <CardContent>
          <DonutChart
            data={relationshipData}
            centerValue={totalRelationship.toLocaleString('he-IL')}
            centerLabel="סה״כ מוזמנים"
            legendValueFormatter={peopleFormatter}
            tooltipFormatter={(value) => `${peopleFormatter(value)} אנשים`}
          />
        </CardContent>
      </Card>
    </div>
  );
}
