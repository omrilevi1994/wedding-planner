import React from 'react';
import { Card } from '@/components/ui/card';
import { Users, Clock, Heart, Building2, User } from 'lucide-react';
import { useWedding } from '@/lib/WeddingContext';

export default function EventDashboard() {
  const { activeWedding } = useWedding();

  const cards = [
    {
      icon: <Building2 className="w-6 h-6 text-rose-deep" />,
      label: 'אולם',
      value: activeWedding?.venue || '—',
      bg: 'from-champagne to-card',
    },
    {
      icon: <User className="w-6 h-6 text-taupe" />,
      label: 'מנהל אירוע מטעם האולם',
      value: activeWedding?.event_manager_name || '—',
      bg: 'from-taupe/15 to-card',
    },
    {
      icon: <Users className="w-6 h-6 text-sage-deep" />,
      label: 'כמות מוזמנים (התחייבות)',
      value: activeWedding?.expected_guests != null ? String(activeWedding.expected_guests) : '—',
      bg: 'from-sage/15 to-card',
    },
    {
      icon: <Clock className="w-6 h-6 text-taupe" />,
      label: 'שעת קבלת פנים',
      value: activeWedding?.reception_time || '—',
      bg: 'from-taupe/15 to-card',
    },
    {
      icon: <Heart className="w-6 h-6 text-rose-600" />,
      label: 'שעת חופה',
      value: activeWedding?.ceremony_time || '—',
      bg: 'from-rose-50 to-card',
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-foreground text-right">פרטי האירוע</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((card, i) => (
          <Card key={i} className={`p-4 bg-gradient-to-br ${card.bg} shadow-sm text-right`}>
            <div className="flex justify-end mb-2">{card.icon}</div>
            <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
            <p className="text-xl font-bold text-foreground">{card.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}