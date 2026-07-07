import React from 'react';
import { Card } from '@/components/ui/card';

export default function KPICard({ title, value, subtitle, icon: Icon, colorClass = 'from-champagne to-card' }) {
  return (
    <Card className={`p-6 bg-gradient-to-br ${colorClass} border-0 shadow-md hover:shadow-lg transition-all`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-muted-foreground mb-2">{title}</p>
          <p className="text-3xl font-bold text-foreground mb-1">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="bg-card/60 p-3 rounded-xl">
            <Icon className="w-6 h-6 text-rose-deep" />
          </div>
        )}
      </div>
    </Card>
  );
}