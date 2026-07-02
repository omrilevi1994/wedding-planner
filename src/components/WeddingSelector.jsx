import React, { useState, useRef, useEffect } from 'react';
import { useWedding } from '@/lib/WeddingContext';
import { ChevronDown, Heart } from 'lucide-react';

export default function WeddingSelector() {
  const { user, isAdmin, weddings, activeWedding, activeWeddingId, selectWedding } = useWedding();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Regular users / event managers don't get to switch — just show the name
  if (!isAdmin) {
    if (!activeWedding) return null;
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
        <Heart className="w-4 h-4 text-amber-600" />
        <span className="text-sm font-medium text-amber-800 max-w-[140px] truncate">{activeWedding.couple_names}</span>
      </div>
    );
  }

  if (weddings.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
      >
        <Heart className="w-4 h-4 text-amber-600" />
        <span className="text-sm font-medium text-amber-800 max-w-[140px] truncate">
          {activeWedding?.couple_names || 'בחר חתונה'}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-amber-600 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[220px] z-50 max-h-64 overflow-y-auto">
          {weddings.map(w => (
            <button
              key={w.id}
              onClick={() => { selectWedding(w.id); setOpen(false); }}
              className={`w-full text-right px-4 py-2.5 text-sm font-medium transition-all ${
                w.id === activeWeddingId ? 'text-amber-700 bg-amber-50' : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate">{w.couple_names}</span>
                {w.status === 'archived' && <span className="text-xs text-gray-400">מוקפא</span>}
              </div>
              {w.wedding_date && (
                <span className="text-xs text-gray-400">{new Date(w.wedding_date).toLocaleDateString('he-IL')}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}