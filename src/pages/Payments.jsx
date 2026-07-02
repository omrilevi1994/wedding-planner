import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parseISO, isAfter, isBefore, addDays } from 'date-fns';
import { he } from 'date-fns/locale';
import { Calendar, CheckCircle, Clock, AlertCircle, User } from 'lucide-react';
import { useWedding } from '@/lib/WeddingContext';

const PAID_BY_OPTIONS = ['חתן', 'חתן - אבא', 'חתן - אמא', 'כלה', 'כלה - אבא', 'כלה - אמא', 'משותף'];

export default function Payments() {
  const queryClient = useQueryClient();
  const [editingPaidBy, setEditingPaidBy] = useState(null); // payment id being edited
  const { activeWeddingId } = useWedding();

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments', activeWeddingId],
    queryFn: () => base44.entities.Payment.filter({ wedding_id: activeWeddingId }, 'due_date'),
    enabled: !!activeWeddingId
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Payment.update(id, data),
    onSuccess: async (payment) => {
      queryClient.invalidateQueries(['payments']);
      // Log activity
      const user = await base44.auth.me();
      await base44.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'עדכון תשלום',
        entity_type: 'Payment',
        entity_id: payment.id,
        entity_name: payment.expense_vendor,
        description: `עדכן תשלום ל-${payment.expense_vendor} - סטטוס: ${payment.status}`
      });
    }
  });

  const handleSetPaidBy = (payment, paidBy) => {
    updateMutation.mutate({ id: payment.id, data: { ...payment, paid_by: paidBy } });
    setEditingPaidBy(null);
  };

  const handleMarkAsPaid = (payment) => {
    const paidDate = prompt('הזן תאריך תשלום בפועל (DD/MM/YYYY):', format(new Date(), 'dd/MM/yyyy'));
    if (!paidDate) return;

    const [day, month, year] = paidDate.split('/');
    const dateStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    updateMutation.mutate({
      id: payment.id,
      data: {
        ...payment,
        status: 'שולם',
        paid_date: dateStr
      }
    });
  };

  // Group by month
  const groupedPayments = payments.reduce((acc, payment) => {
    const monthKey = format(parseISO(payment.due_date), 'yyyy-MM');
    if (!acc[monthKey]) {
      acc[monthKey] = [];
    }
    acc[monthKey].push(payment);
    return acc;
  }, {});

  const sortedMonths = Object.keys(groupedPayments).sort();

  // Upcoming in next 2 weeks
  const now = new Date();
  const twoWeeksFromNow = addDays(now, 14);
  const upcomingPayments = payments.filter(
    p => p.status === 'מתוכנן' && 
    isBefore(parseISO(p.due_date), twoWeeksFromNow) &&
    isAfter(parseISO(p.due_date), addDays(now, -1))
  );

  const totalPlanned = payments
    .filter(p => p.status === 'מתוכנן')
    .reduce((sum, p) => sum + (p.amount || 0) * ((p.probability || 100) / 100), 0);

  const totalPaid = payments
    .filter(p => p.status === 'שולם')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">תשלומים</h1>
        <p className="text-gray-600">מעקב אחר תשלומים ותאריכי יעד</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 bg-gradient-to-br from-yellow-50 to-white">
          <p className="text-sm text-gray-600 mb-1">תשלומים מתוכננים</p>
          <p className="text-2xl font-bold">₪{totalPlanned.toLocaleString('he-IL')}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-50 to-white">
          <p className="text-sm text-gray-600 mb-1">תשלומים ששולמו</p>
          <p className="text-2xl font-bold text-green-600">₪{totalPaid.toLocaleString('he-IL')}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-red-50 to-white">
          <p className="text-sm text-gray-600 mb-1">תשלומים בשבועיים הקרובים</p>
          <p className="text-2xl font-bold text-red-600">{upcomingPayments.length}</p>
        </Card>
      </div>

      {/* Upcoming Payments */}
      {upcomingPayments.length > 0 && (
        <Card className="shadow-md border-amber-200 bg-gradient-to-br from-amber-50 to-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              תשלומים דחופים - שבועיים הקרובים
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingPayments.map((payment) => (
              <div
                key={payment.id}
                className="flex items-center justify-between p-4 bg-white rounded-lg border border-amber-200"
              >
                <div className="flex-1">
                  <p className="font-medium">{payment.expense_vendor}</p>
                  <p className="text-sm text-gray-600">
                    {format(parseISO(payment.due_date), 'dd MMMM yyyy', { locale: he })}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-lg font-bold">₪{(payment.amount || 0).toLocaleString('he-IL')}</p>
                  <Button
                    size="sm"
                    onClick={() => handleMarkAsPaid(payment)}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4 ml-1" />
                    סמן כשולם
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Payments by Month */}
      <div className="space-y-6">
        {isLoading ? (
          <Card className="p-8 text-center text-gray-400">טוען...</Card>
        ) : sortedMonths.length === 0 ? (
          <Card className="p-8 text-center text-gray-400">
            אין עדיין תשלומים מתוכננים
          </Card>
        ) : (
          sortedMonths.map((monthKey) => (
            <Card key={monthKey} className="shadow-md">
              <CardHeader className="bg-gradient-to-l from-amber-50 to-white border-b">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="w-5 h-5 text-[var(--gold-dark)]" />
                  {format(parseISO(monthKey + '-01'), 'MMMM yyyy', { locale: he })}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {groupedPayments[monthKey].map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-4 flex-1">
                        {payment.status === 'שולם' ? (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        ) : (
                          <Clock className="w-5 h-5 text-yellow-500" />
                        )}
                        <div className="flex-1">
                          <p className="font-medium">{payment.expense_vendor}</p>
                          <p className="text-sm text-gray-600">
                            יעד: {format(parseISO(payment.due_date), 'dd/MM/yyyy')}
                            {payment.status === 'שולם' && payment.paid_date && (
                              <span className="mr-2">
                                | שולם: {format(parseISO(payment.paid_date), 'dd/MM/yyyy')}
                              </span>
                            )}
                          </p>
                          {payment.notes && (
                            <p className="text-xs text-gray-500 mt-1">{payment.notes}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap justify-end">
                        <Badge
                          className={
                            payment.status === 'שולם'
                              ? 'bg-green-100 text-green-800 border-green-200'
                              : 'bg-yellow-100 text-yellow-800 border-yellow-200'
                          }
                        >
                          {payment.status}
                        </Badge>
                        {/* Paid By */}
                        {editingPaidBy === payment.id ? (
                          <Select
                            value={payment.paid_by || ''}
                            onValueChange={(val) => handleSetPaidBy(payment, val)}
                            onOpenChange={(open) => { if (!open) setEditingPaidBy(null); }}
                            defaultOpen
                          >
                            <SelectTrigger className="w-36 h-8 text-sm">
                              <SelectValue placeholder="מי שילם?" />
                            </SelectTrigger>
                            <SelectContent>
                              {PAID_BY_OPTIONS.map(opt => (
                                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <button
                            onClick={() => setEditingPaidBy(payment.id)}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                          >
                            <User className="w-3 h-3 text-gray-400" />
                            <span className={payment.paid_by ? 'text-gray-700 font-medium' : 'text-gray-400'}>
                              {payment.paid_by || 'מי שילם?'}
                            </span>
                          </button>
                        )}
                        <p className="text-lg font-bold min-w-[100px] text-left">
                          ₪{(payment.amount || 0).toLocaleString('he-IL')}
                        </p>
                        {payment.status === 'מתוכנן' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkAsPaid(payment)}
                            className="border-green-300 hover:bg-green-50"
                          >
                            סמן כשולם
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}