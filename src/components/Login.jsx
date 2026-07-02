import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Heart } from 'lucide-react';

// Sign-in screen shown when no authenticated Supabase session exists.
// Email/password works locally; Google is enabled once OAuth is configured (Phase 2).
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await base44.auth.signInWithPassword({ email, password });
      // AuthContext's onAuthStateChange picks up the new session and re-renders.
    } catch (err) {
      setError(err?.message || 'ההתחברות נכשלה');
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
    <div
      dir="rtl"
      className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-pink-50 p-4"
    >
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="bg-gradient-to-br from-amber-100 to-amber-200 p-5 rounded-full inline-block mb-4 shadow-sm">
            <Heart className="w-12 h-12 text-[#D4AF37]" fill="currentColor" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-l from-[#D4AF37] to-amber-600 bg-clip-text text-transparent mb-1">
            Wedding HQ
          </h1>
          <p className="text-sm text-gray-500">מטה החתונה שלכם</p>
        </div>

        {/* Card */}
        <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg shadow-amber-100/50 border border-amber-100 p-8">
          <h2 className="text-lg font-semibold text-slate-800 text-center mb-6">כניסה למערכת</h2>

          <form onSubmit={submit} className="space-y-3">
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="אימייל"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-right focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300 transition"
            />
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="סיסמה"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-right focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-300 transition"
            />
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
            <button
              type="submit" disabled={busy}
              className="w-full py-2.5 bg-gradient-to-l from-[#D4AF37] to-amber-600 text-white rounded-xl font-medium shadow-sm hover:opacity-90 disabled:opacity-50 transition"
            >
              {busy ? 'מתחבר…' : 'התחברות'}
            </button>
          </form>

          <div className="flex items-center gap-2 my-5">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-xs text-slate-400">או</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          <button
            onClick={google}
            className="w-full py-2.5 border border-slate-200 rounded-xl font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            התחברות עם Google
          </button>
        </div>
      </div>
    </div>
  );
}
