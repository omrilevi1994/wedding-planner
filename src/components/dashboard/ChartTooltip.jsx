import React from 'react';

// Shared recharts tooltip styled to match the app's card system (rounded-xl,
// warm ivory surface, soft shadow) instead of recharts' default plain-white
// box. Works for bar/area (multiple payload entries) and pie (single entry).
export function ChartTooltip({ active, payload, label, formatter, labelFormatter }) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div
      dir="rtl"
      className="rounded-xl border border-border bg-card/95 backdrop-blur-sm px-4 py-3 shadow-lg text-sm min-w-[9rem]"
    >
      {label != null && (
        <p className="font-semibold text-foreground mb-1.5">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-1.5">
        {payload.map((entry, i) => {
          const [formattedValue, formattedName] = formatter
            ? formatter(entry.value, entry.name, entry)
            : [entry.value, entry.name];
          return (
            <div key={i} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: entry.color || entry.payload?.fill || entry.fill }}
                />
                {formattedName}
              </span>
              <span className="font-semibold text-foreground tabular-nums whitespace-nowrap">
                {formattedValue}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const formatILS = (value) => `₪${Math.round(value || 0).toLocaleString('he-IL')}`;
