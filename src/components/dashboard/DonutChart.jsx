import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartTooltip } from './ChartTooltip';

/**
 * Shared "ring stat" donut used across the dashboard: a soft donut chart with
 * the total centered inside the ring, paired with a legend list where each
 * row carries a mini progress bar. This is the dashboard's signature motif —
 * every breakdown (expenses by category, guests by side/relationship) reads
 * the same way: one number at the center, one ranked list beside it.
 */
export default function DonutChart({
  data,
  centerValue,
  centerLabel,
  tooltipFormatter,
  legendValueFormatter = (v) => v.toLocaleString('he-IL'),
  emptyMessage = 'אין עדיין נתונים',
  height = 240,
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (data.length === 0 || total === 0) {
    return (
      <div className="flex items-center justify-center text-muted-foreground text-sm py-12">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div className="relative shrink-0" style={{ width: height, height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="66%"
              outerRadius="92%"
              paddingAngle={data.length > 1 ? 2 : 0}
              cornerRadius={6}
              stroke="none"
              dataKey="value"
              nameKey="name"
              animationDuration={700}
              animationEasing="ease-out"
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              content={
                <ChartTooltip
                  formatter={(value, name, entry) => [
                    tooltipFormatter ? tooltipFormatter(value, entry) : value,
                    name,
                  ]}
                />
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-4 text-center">
          <span className="text-2xl font-bold text-foreground tabular-nums leading-tight">
            {centerValue}
          </span>
          {centerLabel && (
            <span className="text-xs text-muted-foreground mt-0.5">{centerLabel}</span>
          )}
        </div>
      </div>

      <div className="w-full space-y-2.5">
        {data.map((entry) => {
          const pct = total > 0 ? (entry.value / total) * 100 : 0;
          return (
            <div key={entry.name} className="space-y-1">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 text-foreground min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: entry.color }}
                  />
                  <span className="truncate">{entry.name}</span>
                </span>
                <span className="flex items-baseline gap-1.5 shrink-0 tabular-nums">
                  <span className="font-semibold text-foreground">
                    {legendValueFormatter(entry.value)}
                  </span>
                  <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{ width: `${pct}%`, background: entry.color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
