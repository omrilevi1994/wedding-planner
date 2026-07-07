import React, { useState } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { CheckCircle2, Circle, X } from 'lucide-react';
import { useWedding } from '@/lib/WeddingContext';

export default function WeddingDayChecklist() {
  const queryClient = useQueryClient();
  const { activeWeddingId } = useWedding();
  const [confirmItem, setConfirmItem] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);

  const { data: groups = [] } = useQuery({
    queryKey: ['checklistGroups', activeWeddingId],
    queryFn: () => wedflow.entities.ChecklistGroup.filter({ wedding_id: activeWeddingId }, 'order'),
    enabled: !!activeWeddingId
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['checklist', activeWeddingId],
    queryFn: () => wedflow.entities.ChecklistItem.filter({ wedding_id: activeWeddingId }, 'order'),
    enabled: !!activeWeddingId
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => wedflow.entities.ChecklistItem.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(['checklist'])
  });

  // Use the last group (highest order) as the wedding day group
  const weddingDayGroup = groups.length > 0 ? groups[groups.length - 1] : null;
  const weddingDayItems = weddingDayGroup
    ? items.filter(i => i.group === weddingDayGroup.id)
    : [];

  const completedCount = weddingDayItems.filter(i => i.completed).length;
  const totalCount = weddingDayItems.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleToggle = (item) => {
    if (!item.completed) {
      // Show confirmation dialog only when marking as completed
      setConfirmItem(item);
    } else {
      // Allow unmarking without confirmation
      updateMutation.mutate({ id: item.id, data: { ...item, completed: false } });
    }
  };

  const handleConfirm = () => {
    if (confirmItem) {
      updateMutation.mutate({ id: confirmItem.id, data: { ...confirmItem, completed: true } });
      setConfirmItem(null);
    }
  };

  if (isLoading) {
    return <div className="text-center py-16 text-muted-foreground text-lg">טוען...</div>;
  }

  if (!weddingDayGroup) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-xl">אין קבוצות בצ'ק ליסט</p>
        <p className="text-sm mt-2">ניתן ליצור קבוצות בצ'ק ליסט הרגיל</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Progress */}
      <Card className="p-5 bg-gradient-to-br from-champagne to-card shadow-md">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-muted-foreground">התקדמות - {weddingDayGroup.title}</p>
            <p className="text-4xl font-bold text-rose-deep">{progressPercent}%</p>
          </div>
          <div className="text-left">
            <p className="text-sm text-muted-foreground">בוצע</p>
            <p className="text-3xl font-bold text-foreground">{completedCount} / {totalCount}</p>
          </div>
        </div>
        <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
          <div
            className="bg-gradient-to-l from-rose to-rose-deep h-4 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </Card>

      {/* Items */}
      <Card className="overflow-hidden shadow-sm">
        <div className="divide-y divide-border">
          {weddingDayItems.length === 0 && (
            <p className="text-center text-muted-foreground py-10">אין משימות בקבוצה זו</p>
          )}
          {weddingDayItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleToggle(item)}
              className={`w-full flex items-center gap-4 px-6 py-4 text-right transition-colors active:scale-98 ${
                item.completed ? 'bg-sage/15' : 'hover:bg-champagne/40'
              }`}
            >
              {item.completed ? (
                <CheckCircle2 className="w-7 h-7 text-sage-deep flex-shrink-0" />
              ) : (
                <Circle className="w-7 h-7 text-muted-foreground flex-shrink-0" />
              )}
              <div className="flex-1">
                <span className={`text-base font-medium ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {item.title}
                </span>
                {item.notes && (
                  <p className="text-sm text-muted-foreground mt-0.5">{item.notes}</p>
                )}
              </div>
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt={item.title}
                  className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border border-border cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); setSelectedImage(item.image_url); }}
                />
              )}
            </button>
          ))}
        </div>
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmItem} onOpenChange={(open) => !open && setConfirmItem(null)}>
        <AlertDialogContent dir="rtl" className="max-w-sm">
          <AlertDialogTitle className="text-right">האם אתה בטוח?</AlertDialogTitle>
          <AlertDialogDescription className="text-right">
            לסימון "<strong>{confirmItem?.title}</strong>" כבוצע
          </AlertDialogDescription>
          <div className="flex gap-2 justify-end">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} className="bg-sage hover:bg-sage-deep">
              אישור
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Image Viewer Dialog */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-2xl p-0 bg-black border-0">
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 z-50 bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <img
            src={selectedImage}
            alt="תמונה גדולה"
            className="w-full h-auto"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}