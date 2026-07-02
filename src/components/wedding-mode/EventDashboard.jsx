import React from 'react';
import { Card } from '@/components/ui/card';
import { Users, Clock, Heart, Building2, User } from 'lucide-react';
import { useWedding } from '@/lib/WeddingContext';

export default function EventDashboard() {
  const { activeWedding } = useWedding();

  const cards = [
    {
      icon: <Building2 className="w-6 h-6 text-amber-600" />,
      label: 'אולם',
      value: activeWedding?.venue || '—',
      bg: 'from-amber-50 to-white',
    },
    {
      icon: <User className="w-6 h-6 text-blue-600" />,
      label: 'מנהל אירוע מטעם האולם',
      value: activeWedding?.event_manager_name || '—',
      bg: 'from-blue-50 to-white',
    },
    {
      icon: <Users className="w-6 h-6 text-green-600" />,
      label: 'כמות מוזמנים (התחייבות)',
      value: activeWedding?.expected_guests != null ? String(activeWedding.expected_guests) : '—',
      bg: 'from-green-50 to-white',
    },
    {
      icon: <Clock className="w-6 h-6 text-purple-600" />,
      label: 'שעת קבלת פנים',
      value: activeWedding?.reception_time || '—',
      bg: 'from-purple-50 to-white',
    },
    {
      icon: <Heart className="w-6 h-6 text-rose-600" />,
      label: 'שעת חופה',
      value: activeWedding?.ceremony_time || '—',
      bg: 'from-rose-50 to-white',
    },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-700 text-right">פרטי האירוע</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {cards.map((card, i) => (
          <Card key={i} className={`p-4 bg-gradient-to-br ${card.bg} shadow-sm text-right`}>
            <div className="flex justify-end mb-2">{card.icon}</div>
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className="text-xl font-bold text-gray-800">{card.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}