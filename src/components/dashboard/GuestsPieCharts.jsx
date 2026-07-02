import React from 'react';
import { Card } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

export default function GuestsPieCharts({ guests }) {
  // By Side
  const sideData = {};
  guests.forEach(g => {
    const side = g.side || 'אחר';
    sideData[side] = (sideData[side] || 0) + (g.total_people || 1);
  });
  const sideChartData = Object.entries(sideData).map(([name, value]) => ({ name, value }));

  // By Relationship
  const relationshipData = {};
  guests.forEach(g => {
    const relationship = g.relationship || 'אחר';
    relationshipData[relationship] = (relationshipData[relationship] || 0) + (g.total_people || 1);
  });
  const relationshipChartData = Object.entries(relationshipData).map(([name, value]) => ({ name, value }));

  const sideColors = ['#3b82f6', '#ec4899', '#8b5cf6'];
  const relationshipColors = ['#8b5cf6', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#6b7280'];

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
    const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);

    if (percent < 0.05) return null;

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor={x > cx ? 'start' : 'end'} 
        dominantBaseline="central"
        className="font-semibold text-sm"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* By Side */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">פילוח מוזמנים לפי צד</h3>
        {sideChartData.length === 0 ? (
          <p className="text-gray-400 text-center py-8">אין עדיין נתונים</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={sideChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {sideChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={sideColors[index % sideColors.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value) => [`${value} אנשים`, '']}
                contentStyle={{ direction: 'rtl' }}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36}
                formatter={(value) => value}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* By Relationship */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">פילוח מוזמנים לפי קרבה</h3>
        {relationshipChartData.length === 0 ? (
          <p className="text-gray-400 text-center py-8">אין עדיין נתונים</p>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={relationshipChartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomLabel}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {relationshipChartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={relationshipColors[index % relationshipColors.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value) => [`${value} אנשים`, '']}
                contentStyle={{ direction: 'rtl' }}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36}
                formatter={(value) => value}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}