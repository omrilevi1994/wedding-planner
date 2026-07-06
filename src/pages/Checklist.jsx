import React, { useState } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, Calendar, Plus, X, Image, Loader2, Pencil, Check, Trash2 } from 'lucide-react';
import { subMonths, subWeeks, subDays, format, isPast } from 'date-fns';
import { useWedding } from '@/lib/WeddingContext';

// Map group title to date offset from wedding date
function getGroupDate(groupTitle, weddingDate) {
  if (!weddingDate) return null;
  const d = new Date(weddingDate);
  const t = groupTitle;
  if (t === 'מתחילים') return null;
  if (t.includes('שלב')) return null;
  if (t === '3 חודשים לחתונה') return subMonths(d, 3);
  if (t === 'חודשיים לחתונה') return subMonths(d, 2);
  if (t === 'חודש לחתונה') return subMonths(d, 1);
  if (t === 'שבועיים לחתונה') return subWeeks(d, 2);
  if (t === 'שבוע לחתונה') return subWeeks(d, 1);
  if (t === 'יום לפני החתונה') return subDays(d, 1);
  if (t === 'יום החתונה') return d;
  return null;
}

export default function Checklist() {
  const queryClient = useQueryClient();
  const { activeWeddingId } = useWedding();
  const [collapsedGroups, setCollapsedGroups] = useState(null); // null = all collapsed by default

  // Add item state
  const [addingToGroup, setAddingToGroup] = useState(null); // group id
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemNotes, setNewItemNotes] = useState('');

  // Image state
  const [uploadingItemId, setUploadingItemId] = useState(null);
  const [previewItem, setPreviewItem] = useState(null); // item with image to preview

  // Edit item state
  const [editingItemId, setEditingItemId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Add group state
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupTitle, setNewGroupTitle] = useState('');

  const { data: settings = [] } = useQuery({
    queryKey: ['weddingSettings', activeWeddingId],
    queryFn: () => wedflow.entities.WeddingSetting.filter({ wedding_id: activeWeddingId }),
    enabled: !!activeWeddingId
  });
  const weddingDate = settings[0]?.wedding_date || null;

  const { data: groups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['checklistGroups', activeWeddingId],
    queryFn: () => wedflow.entities.ChecklistGroup.filter({ wedding_id: activeWeddingId }, 'order'),
    enabled: !!activeWeddingId
  });

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ['checklist', activeWeddingId],
    queryFn: () => wedflow.entities.ChecklistItem.filter({ wedding_id: activeWeddingId }, 'order'),
    enabled: !!activeWeddingId
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => wedflow.entities.ChecklistItem.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(['checklist'])
  });

  const createItemMutation = useMutation({
    mutationFn: (data) => wedflow.entities.ChecklistItem.create({ ...data, wedding_id: activeWeddingId }),
    onSuccess: () => {
      queryClient.invalidateQueries(['checklist']);
      setNewItemTitle('');
      setNewItemNotes('');
      setAddingToGroup(null);
    }
  });

  const createGroupMutation = useMutation({
    mutationFn: (data) => wedflow.entities.ChecklistGroup.create({ ...data, wedding_id: activeWeddingId }),
    onSuccess: () => {
      queryClient.invalidateQueries(['checklistGroups']);
      setNewGroupTitle('');
      setShowAddGroup(false);
    }
  });

  const handleAddItem = (groupId) => {
    if (!newItemTitle.trim()) return;
    const groupItems = items.filter(i => i.group === groupId);
    const maxOrder = groupItems.reduce((max, i) => Math.max(max, i.order || 0), 0);
    createItemMutation.mutate({
      title: newItemTitle.trim(),
      notes: newItemNotes.trim() || undefined,
      group: groupId,
      completed: false,
      order: maxOrder + 1
    });
  };

  const handleAddGroup = () => {
    if (!newGroupTitle.trim()) return;
    const maxOrder = groups.reduce((max, g) => Math.max(max, g.order || 0), 0);
    createGroupMutation.mutate({ title: newGroupTitle.trim(), order: maxOrder + 1 });
  };

  const handleToggle = (item) => {
    updateMutation.mutate({ id: item.id, data: { ...item, completed: !item.completed } });
  };

  const handleImageUpload = async (item, file) => {
    if (!file) return;
    setUploadingItemId(item.id);
    const { file_url } = await wedflow.integrations.Core.UploadFile({ file });
    updateMutation.mutate({ id: item.id, data: { ...item, image_url: file_url } });
    setUploadingItemId(null);
  };

  const handleEditItem = (item) => {
    setEditingItemId(item.id);
    setEditTitle(item.title);
    setEditNotes(item.notes || '');
  };

  const handleSaveEdit = (item) => {
    if (!editTitle.trim()) return;
    updateMutation.mutate({ id: item.id, data: { ...item, title: editTitle.trim(), notes: editNotes.trim() || undefined } });
    setEditingItemId(null);
  };

  const handleRemoveImage = (item) => {
    updateMutation.mutate({ id: item.id, data: { ...item, image_url: null } });
  };

  const deleteItemMutation = useMutation({
    mutationFn: (id) => wedflow.entities.ChecklistItem.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['checklist'])
  });

  const handleDeleteItem = (item) => {
    if (window.confirm(`למחוק את "${item.title}"?`)) {
      deleteItemMutation.mutate(item.id);
    }
  };

  const toggleGroup = (groupId) => {
    setCollapsedGroups(prev => {
      const current = prev || {};
      // default = collapsed (true), so toggling means setting to false (open) or back to true
      return { ...current, [groupId]: current[groupId] === false ? true : false };
    });
  };

  const completedCount = items.filter(i => i.completed).length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const isLoading = loadingGroups || loadingItems;

  return (
    <div className="space-y-6">
      {/* Image Preview Modal */}
      {previewItem && (
        <div
          className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewItem(null)}
        >
          <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setPreviewItem(null)}
              className="absolute -top-3 -left-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg z-10"
            >
              <X className="w-4 h-4 text-gray-700" />
            </button>
            <img
              src={previewItem.image_url}
              alt={previewItem.title}
              className="w-full rounded-xl shadow-2xl object-contain max-h-[80vh]"
            />
            <p className="text-white text-center mt-3 font-medium text-lg">{previewItem.title}</p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">צ'ק ליסט</h1>
          <p className="text-gray-600">מעקב אחר משימות וסידורים לחתונה</p>
        </div>
      </div>

      {/* Global Progress */}
      <Card className="p-6 bg-gradient-to-br from-green-50 to-white shadow-md">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm text-gray-600 mb-1">התקדמות כללית</p>
            <p className="text-3xl font-bold text-green-600">{progressPercent}%</p>
          </div>
          <div className="text-left">
            <p className="text-sm text-gray-600">בוצע</p>
            <p className="text-2xl font-bold">{completedCount} / {totalCount}</p>
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className="bg-gradient-to-l from-green-500 to-green-600 h-3 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </Card>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">טוען...</div>
      ) : (
        <div className="space-y-4">
          {/* Add Group */}
          {showAddGroup ? (
            <Card className="p-4 border-2 border-dashed border-amber-300 bg-amber-50/30 space-y-2">
              <input
                autoFocus
                type="text"
                value={newGroupTitle}
                onChange={(e) => setNewGroupTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
                placeholder="שם הקבוצה החדשה..."
                className="w-full text-sm border border-amber-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddGroup}
                  disabled={!newGroupTitle.trim() || createGroupMutation.isPending}
                  className="px-4 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
                >
                  הוסף קבוצה
                </button>
                <button
                  onClick={() => { setShowAddGroup(false); setNewGroupTitle(''); }}
                  className="px-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  ביטול
                </button>
              </div>
            </Card>
          ) : (
            <button
              onClick={() => setShowAddGroup(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50/30 transition-colors"
            >
              <Plus className="w-4 h-4" />
              הוסף קבוצה חדשה
            </button>
          )}

          {groups.map((group) => {
            const groupItems = items.filter(i => i.group === group.id);
            const groupCompleted = groupItems.filter(i => i.completed).length;
            const groupTotal = groupItems.length;
            const groupProgress = groupTotal > 0 ? Math.round((groupCompleted / groupTotal) * 100) : 0;
            const isCollapsed = !collapsedGroups || collapsedGroups[group.id] !== false;
            const allDone = groupTotal > 0 && groupCompleted === groupTotal;

            return (
              <Card key={group.id} className={`overflow-hidden shadow-sm border ${allDone ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}>
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {allDone ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-amber-400 flex-shrink-0" />
                    )}
                    <div className="text-right">
                      <p className={`font-semibold text-base ${allDone ? 'text-green-700' : 'text-gray-800'}`}>
                        {group.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-gray-500">{groupCompleted}/{groupTotal} משימות</p>
                        {(() => {
                          const gDate = getGroupDate(group.title, weddingDate);
                          if (!gDate) return null;
                          const past = isPast(gDate);
                          return (
                            <span className={`flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full ${past ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                              <Calendar className="w-3 h-3" />
                              {format(gDate, 'd/M/yyyy')}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Mini progress bar */}
                    <div className="hidden sm:flex items-center gap-2">
                      <div className="w-24 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-300 ${allDone ? 'bg-green-500' : 'bg-amber-500'}`}
                          style={{ width: `${groupProgress}%` }}
                        />
                      </div>
                      <span className={`text-xs font-medium ${allDone ? 'text-green-600' : 'text-amber-600'}`}>
                        {groupProgress}%
                      </span>
                    </div>
                    {isCollapsed ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Group Items */}
                {!isCollapsed && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {groupItems.map((item) => (
                      <div
                        key={item.id}
                        className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors ${item.completed ? 'bg-green-50/40' : ''}`}
                      >
                        {/* Toggle button */}
                        <button onClick={() => handleToggle(item)} className="flex-shrink-0">
                          {item.completed ? (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                          ) : (
                            <Circle className="w-5 h-5 text-gray-300" />
                          )}
                        </button>

                        {/* Title + notes (or edit mode) */}
                        {editingItemId === item.id ? (
                          <div className="flex-1 text-right min-w-0 space-y-1">
                            <input
                              autoFocus
                              type="text"
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(item); if (e.key === 'Escape') setEditingItemId(null); }}
                              className="w-full text-sm border border-amber-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                            />
                            <input
                              type="text"
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              placeholder="הערה (אופציונלי)..."
                              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(item); if (e.key === 'Escape') setEditingItemId(null); }}
                              className="w-full text-xs border border-amber-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-300 bg-white"
                            />
                          </div>
                        ) : (
                          <div className="flex-1 text-right min-w-0">
                            <span className={`text-sm ${item.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                              {item.title}
                            </span>
                            {item.notes && (
                              <p className="text-xs text-gray-400 truncate">{item.notes}</p>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {editingItemId === item.id ? (
                            <>
                              <button
                                onClick={() => handleSaveEdit(item)}
                                className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setEditingItemId(null)}
                                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleEditItem(item)}
                                className="p-1.5 rounded-lg hover:bg-amber-50 text-gray-300 hover:text-amber-500 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item)}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {/* Image thumbnail or upload */}
                          {item.image_url ? (
                            <div className="relative group">
                              <img
                                src={item.image_url}
                                alt={item.title}
                                onClick={() => setPreviewItem(item)}
                                className="w-10 h-10 rounded-lg object-cover cursor-pointer border border-gray-200 hover:opacity-80 transition-opacity"
                              />
                              <button
                                onClick={() => handleRemoveImage(item)}
                                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-xs items-center justify-center hidden group-hover:flex"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ) : (
                            <label className="cursor-pointer p-1.5 rounded-lg hover:bg-amber-50 text-gray-400 hover:text-amber-500 transition-colors">
                              {uploadingItemId === item.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                              ) : (
                                <Image className="w-4 h-4" />
                              )}
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => handleImageUpload(item, e.target.files[0])}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    ))}
                    {groupItems.length === 0 && (
                      <p className="text-center text-sm text-gray-400 py-4">אין משימות בקבוצה זו</p>
                    )}

                    {/* Add item form */}
                    {addingToGroup === group.id ? (
                      <div className="px-5 py-3 bg-amber-50/50 space-y-2">
                        <input
                          autoFocus
                          type="text"
                          value={newItemTitle}
                          onChange={(e) => setNewItemTitle(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddItem(group.id)}
                          placeholder="שם המשימה..."
                          className="w-full text-sm border border-amber-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                        />
                        <input
                          type="text"
                          value={newItemNotes}
                          onChange={(e) => setNewItemNotes(e.target.value)}
                          placeholder="הערה (אופציונלי)..."
                          className="w-full text-sm border border-amber-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAddItem(group.id)}
                            disabled={!newItemTitle.trim() || createItemMutation.isPending}
                            className="px-4 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
                          >
                            הוסף
                          </button>
                          <button
                            onClick={() => { setAddingToGroup(null); setNewItemTitle(''); setNewItemNotes(''); }}
                            className="px-4 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                          >
                            ביטול
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingToGroup(group.id); setNewItemTitle(''); setNewItemNotes(''); }}
                        className="w-full flex items-center gap-2 px-5 py-2.5 text-right text-sm text-amber-600 hover:bg-amber-50 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        הוסף משימה
                      </button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}