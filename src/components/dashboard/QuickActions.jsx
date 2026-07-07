import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, CheckCircle, UserPlus } from 'lucide-react';

export default function QuickActions({ onAddExpense, onAddGuest, onMarkPayment }) {
  return (
    <Card className="shadow-md bg-gradient-to-br from-card to-champagne/30">
      <CardHeader>
        <CardTitle className="text-lg">פעולות מהירות</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          onClick={onAddExpense}
          className="w-full bg-gradient-to-l from-rose to-rose-deep hover:from-rose-deep hover:to-rose-deep text-white shadow-md"
        >
          <Plus className="w-4 h-4 ml-2" />
          הוסף הוצאה
        </Button>
        <Button
          onClick={onAddGuest}
          variant="outline"
          className="w-full border-primary hover:bg-accent"
        >
          <UserPlus className="w-4 h-4 ml-2" />
          הוסף מוזמן
        </Button>
        <Button
          onClick={onMarkPayment}
          variant="outline"
          className="w-full border-sage/40 hover:bg-sage/15"
        >
          <CheckCircle className="w-4 h-4 ml-2" />
          סמן תשלום שבוצע
        </Button>
      </CardContent>
    </Card>
  );
}