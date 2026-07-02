import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';

// Sign-in screen shown when no authenticated Supabase session exists.
// Email/password works locally; Google is enabled once OAuth is configured (Phase 2).
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mode, setMode] = useState('signin');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') {
        await base44.auth.signUp({ email, password, full_name: fullName });
      } else {
        await base44.auth.signInWithPassword({ email, password });
      }
      // AuthContext's onAuthStateChange picks up the new session and re-renders.
    } catch (err) {
      setError(err?.message || 'שגיאה');
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    try {
      await base44.auth.signInWithGoogle();
    } catch (err) {
      setError(err?.message || 'התחברות Google נכשלה');
    }
  };

  return (
    <div dir="rtl" className="fixed inset-0 flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
        <h1 className="text-2xl font-bold text-slate-800 text-center mb-1">
          {mode === 'signup' ? 'הרשמה למערכת' : 'כניסה למערכת'}
        </h1>
        <p className="text-sm text-slate-500 text-center mb-6">ניהול החתונה</p>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'signup' && (
            <input required value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="שם מלא"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-right" />
          )}
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="אימייל"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <input
            type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="סיסמה"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          <button
            type="submit" disabled={busy}
            className="w-full py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? (mode === 'signup' ? 'נרשם…' : 'מתחבר…') : (mode === 'signup' ? 'הרשמה' : 'התחברות')}
          </button>
        </form>

        <div className="flex items-center gap-2 my-4">
          <div className="flex-1 h-px bg-slate-100" />
          <span className="text-xs text-slate-400">או</span>
          <div className="flex-1 h-px bg-slate-100" />
        </div>

        <button
          onClick={google}
          className="w-full py-2 border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50"
        >
          התחברות עם Google
        </button>

        <button type="button" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
          className="w-full text-sm text-slate-500 mt-2">
          {mode === 'signup' ? 'כבר יש לי חשבון' : 'אין לי חשבון — הרשמה'}
        </button>
      </div>
    </div>
  );
}
