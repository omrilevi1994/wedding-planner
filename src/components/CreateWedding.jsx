import React, { useState } from 'react';
import { wedflow } from '@/api/wedflowClient';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useWedding } from '@/lib/WeddingContext';

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
      await refreshWeddings();
      selectWedding(wedding.id);
    } catch (err) {
      setError(err?.message || 'שגיאה ביצירת החתונה');
      setBusy(false);
    }
  };

  return (
    <div dir="rtl" className="fixed inset-0 flex items-center justify-center bg-slate-50 p-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-3">
        <h1 className="text-2xl font-bold text-slate-800 text-center">יצירת חתונה</h1>
        <p className="text-sm text-slate-500 text-center mb-4">בואו נתחיל לתכנן</p>
        <input required value={coupleNames} onChange={e => setCoupleNames(e.target.value)}
          placeholder="שמות בני הזוג"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-right" />
        <input type="date" value={weddingDate} onChange={e => setWeddingDate(e.target.value)}
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-right" />
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 disabled:opacity-50">
          {busy ? 'יוצר…' : 'צור חתונה'}
        </button>
      </form>
    </div>
  );
}
