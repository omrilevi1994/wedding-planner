import React, { useState } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useWedding } from '@/lib/WeddingContext';
import { seedDefaultChecklist } from '@/lib/defaultChecklist';

export default function CreateWedding() {
  const { user } = useAuth();
  const { refreshWeddings, selectWedding } = useWedding();
  const [coupleNames, setCoupleNames] = useState('');
  const [weddingDate, setWeddingDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const wedding = await wedflow.entities.Wedding.create({
        couple_names: coupleNames,
        wedding_date: weddingDate || null,
        owner_id: user.id,
        status: 'active',
      });
      const { error: mErr } = await supabase.from('wedding_members')
        .insert({ wedding_id: wedding.id, user_id: user.id, role: 'owner' });
      if (mErr) throw mErr;
      await seedDefaultChecklist(wedding.id);
      await refreshWeddings();
      selectWedding(wedding.id);
    } catch (err) {
      setError(err?.message || 'שגיאה ביצירת החתונה');
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-background via-secondary to-rose-light/20 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-card rounded-2xl shadow-sm border border-border p-8 space-y-3">
        <img src="/monogram.png" alt="" className="w-16 mx-auto mb-1" />
        <h1 className="text-2xl font-bold text-foreground text-center">יצירת חתונה</h1>
        <p className="text-sm text-muted-foreground text-center mb-4">בואו נתחיל לתכנן</p>
        <input required value={coupleNames} onChange={e => setCoupleNames(e.target.value)}
          placeholder="שמות בני הזוג"
          className="w-full px-3 py-2 border border-input rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition" />
        <input type="date" value={weddingDate} onChange={e => setWeddingDate(e.target.value)}
          className="w-full px-3 py-2 border border-input rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition" />
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary-hover disabled:opacity-50 transition">
          {busy ? 'יוצר…' : 'צור חתונה'}
        </button>
      </form>
    </div>
  );
}
