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

  if (weddings.length === 0) return null;

  // Regular users / event managers, or anyone with just one wedding, have
  // nothing to switch between — show plain, non-interactive text instead.
  if (!isAdmin || weddings.length === 1) {
    if (!activeWedding) return null;
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-champagne border border-taupe/40 rounded-lg">
        <Heart className="w-4 h-4 text-rose-deep" />
        <span className="text-sm font-medium text-rose-deep max-w-[140px] truncate">{activeWedding.couple_names}</span>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 bg-champagne border border-taupe/40 rounded-lg hover:bg-accent transition-colors"
      >
        <Heart className="w-4 h-4 text-rose-deep" />
        <span className="text-sm font-medium text-rose-deep max-w-[140px] truncate">
          {activeWedding?.couple_names || 'בחר חתונה'}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-rose-deep transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 bg-card border border-border rounded-xl shadow-lg py-1 min-w-[220px] max-w-[calc(100vw-1.5rem)] z-50 max-h-64 overflow-y-auto">
          {weddings.map(w => (
            <button
              key={w.id}
              onClick={() => { selectWedding(w.id); setOpen(false); }}
              className={`w-full text-right px-4 py-2.5 text-sm font-medium transition-all ${
                w.id === activeWeddingId ? 'text-rose-deep bg-champagne' : 'text-foreground hover:bg-muted'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="truncate">{w.couple_names}</span>
                {w.status === 'archived' && <span className="text-xs text-muted-foreground">מוקפא</span>}
              </div>
              {w.wedding_date && (
                <span className="text-xs text-muted-foreground">{new Date(w.wedding_date).toLocaleDateString('he-IL')}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}