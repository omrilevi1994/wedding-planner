import React, { useState } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, User, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';
import { useWedding } from '@/lib/WeddingContext';

export default function ActivityLog() {
  const [filterAction, setFilterAction] = useState('all');
  const [filterDateRange, setFilterDateRange] = useState('all');
  const { activeWeddingId } = useWedding();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['activityLogs', activeWeddingId],
    queryFn: () => wedflow.entities.ActivityLog.filter({ wedding_id: activeWeddingId }, '-created_date', 500),
    enabled: !!activeWeddingId,
    refetchInterval: 10000 // Refresh every 10 seconds
  });

  const actionTypes = [
    'הוספת מוזמן',
    'עדכון מוזמן',
    'מחיקת מוזמן',
    'הוספת הוצאה',
    'עדכון הוצאה',
    'מחיקת הוצאה',
    'הוספת ספק',
    'עדכון ספק',
    'מחיקת ספק',
    'הוספת שולחן',
    'עדכון שולחן',
    'מחיקת שולחן',
    'שיבוץ מוזמן לשולחן',
    'הסרת מוזמן משולחן',
    'עדכון הגדרות',
    'הוספת תשלום',
    'עדכון תשלום',
    'מחיקת תשלום',
    'התחברות',
    'התנתקות',
    'אחר'
  ];

  // Filter logs
  const filteredLogs = logs.filter(log => {
    const matchesAction = filterAction === 'all' || log.action_type === filterAction;
    
    if (filterDateRange === 'all') return matchesAction;
    
    const logDate = new Date(log.created_date);
    const now = new Date();
    
    if (filterDateRange === 'today') {
      return matchesAction && logDate.toDateString() === now.toDateString();
    } else if (filterDateRange === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return matchesAction && logDate >= weekAgo;
    } else if (filterDateRange === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return matchesAction && logDate >= monthAgo;
    }
    
    return matchesAction;
  });

  const getActionColor = (actionType) => {
    if (actionType?.includes('הוספ')) return 'bg-sage/15 text-sage-deep border-sage/30';
    if (actionType?.includes('מחיק')) return 'bg-destructive/10 text-destructive border-destructive/30';
    if (actionType?.includes('עדכון')) return 'bg-taupe/15 text-taupe border-taupe/30';
    if (actionType?.includes('שיבוץ') || actionType?.includes('הסר')) return 'bg-taupe/15 text-taupe border-taupe/30';
    return 'bg-muted text-muted-foreground border-border';
  };

  // Calculate stats
  const todayLogs = logs.filter(log => {
    const logDate = new Date(log.created_date);
    return logDate.toDateString() === new Date().toDateString();
  }).length;

  const weekLogs = logs.filter(log => {
    const logDate = new Date(log.created_date);
    const weekAgo = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000);
    return logDate >= weekAgo;
  }).length;

  const uniqueUsers = [...new Set(logs.map(log => log.user_email || log.created_by).filter(Boolean))].length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground mb-2">לוג פעילות</h1>
        <p className="text-muted-foreground">עקוב אחר כל הפעולות והשינויים במערכת</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4 bg-gradient-to-br from-taupe/10 to-card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-taupe/15 rounded-lg">
              <Activity className="w-6 h-6 text-taupe" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">סה״כ פעולות</p>
              <p className="text-2xl font-bold text-foreground">{logs.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-sage/10 to-card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-sage/15 rounded-lg">
              <Calendar className="w-6 h-6 text-sage-deep" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">היום</p>
              <p className="text-2xl font-bold text-foreground">{todayLogs}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-taupe/10 to-card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-taupe/15 rounded-lg">
              <Calendar className="w-6 h-6 text-taupe" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">השבוע</p>
              <p className="text-2xl font-bold text-foreground">{weekLogs}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 bg-gradient-to-br from-rose-light/20 to-card">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-rose-light/30 rounded-lg">
              <User className="w-6 h-6 text-rose-deep" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">משתמשים פעילים</p>
              <p className="text-2xl font-bold text-foreground">{uniqueUsers}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <Select value={filterAction} onValueChange={setFilterAction}>
          <SelectTrigger className="w-full md:w-64">
            <SelectValue placeholder="סוג פעילות" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הפעילויות</SelectItem>
            {actionTypes.map(action => (
              <SelectItem key={action} value={action}>{action}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterDateRange} onValueChange={setFilterDateRange}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue placeholder="תקופה" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל התקופה</SelectItem>
            <SelectItem value="today">היום</SelectItem>
            <SelectItem value="week">שבוע אחרון</SelectItem>
            <SelectItem value="month">חודש אחרון</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1 text-left text-sm text-muted-foreground flex items-center">
          מציג {filteredLogs.length} מתוך {logs.length} פעולות
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden shadow-md">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted">
                <TableHead>תאריך ושעה</TableHead>
                <TableHead>משתמש</TableHead>
                <TableHead>סוג פעולה</TableHead>
                <TableHead>תיאור</TableHead>
                <TableHead>ישות</TableHead>
                <TableHead>פרטים נוספים</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    טוען...
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    אין פעולות להצגה
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <TableRow key={log.id} className="hover:bg-muted">
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">
                            {format(new Date(log.created_date), 'dd/MM/yyyy', { locale: he })}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(log.created_date), 'HH:mm:ss')}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-sm">
                            {log.user_name || log.user_email || log.created_by || 'לא ידוע'}
                          </div>
                          {log.user_email && log.user_email !== log.user_name && (
                            <div className="text-xs text-muted-foreground">{log.user_email}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getActionColor(log.action_type)}>
                        {log.action_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[300px]">
                      {log.description}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.entity_type && (
                        <div>
                          <div className="font-medium">{log.entity_type}</div>
                          {log.entity_name && (
                            <div className="text-xs text-muted-foreground">{log.entity_name}</div>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                      {log.details || '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}