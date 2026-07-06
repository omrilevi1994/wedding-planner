import React, { useState } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Pencil, Trash2, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import ExpenseForm from '../components/expenses/ExpenseForm';
import { useWedding } from '@/lib/WeddingContext';

export default function Expenses() {
  const queryClient = useQueryClient();
  const { activeWeddingId } = useWedding();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses', activeWeddingId],
    queryFn: () => wedflow.entities.Expense.filter({ wedding_id: activeWeddingId }, '-created_date'),
    enabled: !!activeWeddingId
  });

  // Sync Payment records for an expense (deposit + remainder or single)
  const syncPayments = async (expense) => {
    const existing = await wedflow.entities.Payment.filter({ expense_id: expense.id, wedding_id: activeWeddingId });

    // Delete all existing payments for this expense and recreate
    await Promise.all(existing.map(p => wedflow.entities.Payment.delete(p.id)));

    if (expense.has_deposit && expense.deposit_amount) {
      const remainderAmount = expense.amount - expense.deposit_amount;

      // Deposit payment
      await wedflow.entities.Payment.create({
        wedding_id: activeWeddingId,
        expense_id: expense.id,
        expense_vendor: `${expense.vendor} - מקדמה`,
        amount: expense.deposit_amount,
        due_date: expense.deposit_status === 'שולם' ? expense.deposit_paid_date : (expense.deposit_due_date || expense.due_date || new Date().toISOString().split('T')[0]),
        status: expense.deposit_status || 'מתוכנן',
        paid_date: expense.deposit_paid_date || null,
        probability: 100,
        notes: expense.notes,
      });

      // Remainder payment
      if (remainderAmount > 0) {
        await wedflow.entities.Payment.create({
          wedding_id: activeWeddingId,
          expense_id: expense.id,
          expense_vendor: `${expense.vendor} - יתרה`,
          amount: remainderAmount,
          due_date: expense.status === 'שולם' ? expense.paid_date : (expense.due_date || new Date().toISOString().split('T')[0]),
          status: expense.status || 'מתוכנן',
          paid_date: expense.paid_date || null,
          probability: expense.probability || 100,
          notes: expense.notes,
        });
      }
    } else {
      // Single payment
      const date = expense.status === 'שולם' ? expense.paid_date : expense.due_date;
      if (date) {
        await wedflow.entities.Payment.create({
          wedding_id: activeWeddingId,
          expense_id: expense.id,
          expense_vendor: expense.vendor,
          amount: expense.amount,
          due_date: date,
          status: expense.status,
          paid_date: expense.paid_date || null,
          probability: expense.probability || 100,
          notes: expense.notes,
        });
      }
    }

    queryClient.invalidateQueries(['payments']);
  };

  const createMutation = useMutation({
    mutationFn: (data) => wedflow.entities.Expense.create({ ...data, wedding_id: activeWeddingId }),
    onSuccess: async (expense) => {
      queryClient.invalidateQueries(['expenses']);
      setShowForm(false);
      await syncPayments(expense);
      // Log activity
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'הוספת הוצאה',
        entity_type: 'Expense',
        entity_id: expense.id,
        entity_name: expense.vendor,
        description: `הוסף הוצאה: ${expense.vendor} - ₪${expense.amount?.toLocaleString('he-IL')}`
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => wedflow.entities.Expense.update(id, data),
    onSuccess: async (expense) => {
      queryClient.invalidateQueries(['expenses']);
      setShowForm(false);
      setEditingExpense(null);
      await syncPayments(expense);
      // Log activity
      const user = await wedflow.auth.me();
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'עדכון הוצאה',
        entity_type: 'Expense',
        entity_id: expense.id,
        entity_name: expense.vendor,
        description: `עדכן הוצאה: ${expense.vendor}`
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => wedflow.entities.Expense.delete(id),
    onSuccess: async (_, id) => {
      queryClient.invalidateQueries(['expenses']);
      // Log activity
      const user = await wedflow.auth.me();
      const deletedExpense = expenses.find(e => e.id === id);
      await wedflow.entities.ActivityLog.create({
        wedding_id: activeWeddingId,
        user_email: user.email,
        user_name: user.full_name,
        action_type: 'מחיקת הוצאה',
        entity_type: 'Expense',
        entity_id: id,
        entity_name: deletedExpense?.vendor || 'הוצאה',
        description: `מחק הוצאה: ${deletedExpense?.vendor || id}`
      });
    }
  });

  const handleSave = (data) => {
    if (editingExpense) {
      updateMutation.mutate({ id: editingExpense.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (expense) => {
    setEditingExpense(expense);
    setShowForm(true);
  };

  const handleDelete = (expense) => {
    if (window.confirm(`האם למחוק את ההוצאה "${expense.vendor}"?`)) {
      deleteMutation.mutate(expense.id);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingExpense(null);
  };

  const filteredExpenses = expenses.filter(expense =>
    expense.vendor?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    expense.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // הוצאות שנכנסות לחישוב (לא "אחר")
  const billableExpenses = filteredExpenses.filter(e => e.paid_by_party !== 'אחר' && e.paid_by_party !== 'הורים');
  const externalExpenses = filteredExpenses.filter(e => e.paid_by_party === 'אחר' || e.paid_by_party === 'הורים');

  const totalAmount = billableExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalExternalAmount = externalExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const paidAmount = billableExpenses.reduce((sum, e) => {
    let paid = 0;
    if (e.has_deposit && e.deposit_amount) {
      if (e.deposit_status === 'שולם') paid += e.deposit_amount;
      if (e.status === 'שולם') paid += (e.amount - e.deposit_amount);
    } else {
      if (e.status === 'שולם') paid += (e.amount || 0);
    }
    return sum + paid;
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">הוצאות</h1>
          <p className="text-gray-600">נהל את כל ההוצאות של החתונה</p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="bg-gradient-to-l from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700"
        >
          <Plus className="w-4 h-4 ml-2" />
          הוסף הוצאה
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-white">
          <p className="text-sm text-gray-600 mb-1">סה״כ הוצאות שלנו</p>
          <p className="text-2xl font-bold">₪{totalAmount.toLocaleString('he-IL')}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-green-50 to-white">
          <p className="text-sm text-gray-600 mb-1">שולם</p>
          <p className="text-2xl font-bold text-green-600">₪{paidAmount.toLocaleString('he-IL')}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-gray-50 to-white border-dashed">
          <p className="text-sm text-gray-500 mb-1">הוצאות חיצוניות (לא בחישוב)</p>
          <p className="text-2xl font-bold text-gray-400">₪{totalExternalAmount.toLocaleString('he-IL')}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-amber-50 to-white">
          <p className="text-sm text-gray-600 mb-1">מספר הוצאות</p>
          <p className="text-2xl font-bold">{filteredExpenses.length}</p>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <Input
          type="text"
          placeholder="חיפוש לפי ספק או קטגוריה..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pr-10"
        />
      </div>

      {/* Table */}
      <Card className="overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>ספק / שם</TableHead>
                <TableHead>קטגוריה</TableHead>
                <TableHead>סכום</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>תאריך</TableHead>
                <TableHead>הערות</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-400">
                    טוען...
                  </TableCell>
                </TableRow>
              ) : filteredExpenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-gray-400">
                    אין עדיין הוצאות. הוסף את ההוצאה הראשונה!
                  </TableCell>
                </TableRow>
              ) : (
                filteredExpenses.map((expense) => (
                  <TableRow key={expense.id} className={`hover:bg-gray-50 ${(expense.paid_by_party === 'אחר' || expense.paid_by_party === 'הורים') ? 'opacity-60' : ''}`}>
                    <TableCell className="font-medium">
                      <div>{expense.vendor}</div>
                      {expense.paid_by_party && (
                        <div className="text-xs mt-0.5">
                          {(expense.paid_by_party === 'אחר' || expense.paid_by_party === 'הורים')
                            ? <span className="text-gray-400">שילם: {expense.paid_by_party} (לא בחישוב)</span>
                            : <span className="text-gray-400">שילם: {expense.paid_by_party}</span>
                          }
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-amber-50 border-amber-200">
                        {expense.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold">
                      <div>₪{(expense.amount || 0).toLocaleString('he-IL')}</div>
                      {expense.has_deposit && expense.deposit_amount && (
                        <div className="text-xs text-blue-600 mt-0.5">מקדמה: ₪{expense.deposit_amount.toLocaleString('he-IL')}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge
                          className={
                            expense.status === 'שולם'
                              ? 'bg-green-100 text-green-800 border-green-200'
                              : 'bg-yellow-100 text-yellow-800 border-yellow-200'
                          }
                        >
                          {expense.status}
                        </Badge>
                        {expense.has_deposit && (
                          <Badge className={expense.deposit_status === 'שולם' ? 'bg-green-50 text-green-700 border-green-100 text-xs' : 'bg-blue-50 text-blue-700 border-blue-100 text-xs'}>
                            מקדמה: {expense.deposit_status || 'מתוכנן'}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {expense.status === 'שולם' && expense.paid_date
                        ? format(parseISO(expense.paid_date), 'dd/MM/yyyy')
                        : expense.due_date
                        ? format(parseISO(expense.due_date), 'dd/MM/yyyy')
                        : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 max-w-[200px] truncate">
                      {expense.notes || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {expense.receipt_url && (
                          <a
                            href={expense.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <FileText className="w-4 h-4 text-blue-600" />
                          </a>
                        )}
                        <button
                          onClick={() => handleEdit(expense)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <Pencil className="w-4 h-4 text-gray-600" />
                        </button>
                        <button
                          onClick={() => handleDelete(expense)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ExpenseForm
        open={showForm}
        onClose={handleCloseForm}
        expense={editingExpense}
        onSave={handleSave}
      />
    </div>
  );
}