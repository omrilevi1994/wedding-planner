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
          <h1 className="text-3xl font-bold text-foreground mb-2">הוצאות</h1>
          <p className="text-muted-foreground">נהל את כל ההוצאות של החתונה</p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          className="bg-gradient-to-l from-rose to-rose-deep hover:from-rose-deep hover:to-rose-deep"
        >
          <Plus className="w-4 h-4 ml-2" />
          הוסף הוצאה
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-gradient-to-br from-taupe/15 to-card">
          <p className="text-sm text-muted-foreground mb-1">סה״כ הוצאות שלנו</p>
          <p className="text-2xl font-bold">₪{totalAmount.toLocaleString('he-IL')}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-sage/15 to-card">
          <p className="text-sm text-muted-foreground mb-1">שולם</p>
          <p className="text-2xl font-bold text-sage-deep">₪{paidAmount.toLocaleString('he-IL')}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-muted to-card border-dashed">
          <p className="text-sm text-muted-foreground mb-1">הוצאות חיצוניות (לא בחישוב)</p>
          <p className="text-2xl font-bold text-muted-foreground">₪{totalExternalAmount.toLocaleString('he-IL')}</p>
        </Card>
        <Card className="p-4 bg-gradient-to-br from-champagne to-card">
          <p className="text-sm text-muted-foreground mb-1">מספר הוצאות</p>
          <p className="text-2xl font-bold">{filteredExpenses.length}</p>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
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
              <TableRow className="bg-muted">
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
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    טוען...
                  </TableCell>
                </TableRow>
              ) : filteredExpenses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    אין עדיין הוצאות. הוסף את ההוצאה הראשונה!
                  </TableCell>
                </TableRow>
              ) : (
                filteredExpenses.map((expense) => (
                  <TableRow key={expense.id} className={`hover:bg-muted ${(expense.paid_by_party === 'אחר' || expense.paid_by_party === 'הורים') ? 'opacity-60' : ''}`}>
                    <TableCell className="font-medium">
                      <div>{expense.vendor}</div>
                      {expense.paid_by_party && (
                        <div className="text-xs mt-0.5">
                          {(expense.paid_by_party === 'אחר' || expense.paid_by_party === 'הורים')
                            ? <span className="text-muted-foreground">שילם: {expense.paid_by_party} (לא בחישוב)</span>
                            : <span className="text-muted-foreground">שילם: {expense.paid_by_party}</span>
                          }
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-champagne border-taupe/40">
                        {expense.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold">
                      <div>₪{(expense.amount || 0).toLocaleString('he-IL')}</div>
                      {expense.has_deposit && expense.deposit_amount && (
                        <div className="text-xs text-taupe mt-0.5">מקדמה: ₪{expense.deposit_amount.toLocaleString('he-IL')}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge
                          className={
                            expense.status === 'שולם'
                              ? 'bg-sage/15 text-sage-deep border-sage/30'
                              : 'bg-champagne text-rose-deep border-taupe/40'
                          }
                        >
                          {expense.status}
                        </Badge>
                        {expense.has_deposit && (
                          <Badge className={expense.deposit_status === 'שולם' ? 'bg-sage/10 text-sage-deep border-sage/20 text-xs' : 'bg-taupe/15 text-taupe border-taupe/30 text-xs'}>
                            מקדמה: {expense.deposit_status || 'מתוכנן'}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {expense.status === 'שולם' && expense.paid_date
                        ? format(parseISO(expense.paid_date), 'dd/MM/yyyy')
                        : expense.due_date
                        ? format(parseISO(expense.due_date), 'dd/MM/yyyy')
                        : '-'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {expense.notes || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {expense.receipt_url && (
                          <a
                            href={expense.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                          >
                            <FileText className="w-4 h-4 text-taupe" />
                          </a>
                        )}
                        <button
                          onClick={() => handleEdit(expense)}
                          className="p-2 hover:bg-muted rounded-lg transition-colors"
                        >
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => handleDelete(expense)}
                          className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
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