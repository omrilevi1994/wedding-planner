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

  const totalPeople = guests.reduce((sum, g) => sum + (g.total_people || 1), 0);
  const childrenBySide = {};
  guests.forEach((g) => {
    const kids = Math.min(g.children_count || 0, g.total_people || 1);
    if (kids > 0) childrenBySide[g.side || 'אחר'] = (childrenBySide[g.side || 'אחר'] || 0) + kids;
  });
  const totalChildren = Object.values(childrenBySide).reduce((a, b) => a + b, 0);
  const ageData = [
    { name: 'מבוגרים', value: totalPeople - totalChildren, color: 'hsl(var(--sage))' },
    { name: 'ילדים', value: totalChildren, color: 'hsl(var(--primary))' },
  ].filter((d) => d.value > 0);

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

      <Card className="shadow-md h-full lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">מבוגרים וילדים</CardTitle>
        </CardHeader>
        <CardContent>
          <DonutChart
            data={ageData}
            centerValue={totalChildren.toLocaleString('he-IL')}
            centerLabel="ילדים"
            legendValueFormatter={peopleFormatter}
            tooltipFormatter={(value) => `${peopleFormatter(value)} אנשים`}
          />
          {totalChildren > 0 && (
            <p className="text-sm text-muted-foreground mt-3">
              ילדים לפי צד: {Object.entries(childrenBySide).map(([side, n]) => `${side} ${n}`).join(' · ')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
