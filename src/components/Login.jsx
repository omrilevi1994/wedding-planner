import React, { useState } from 'react';
import { wedflow } from '@/api/wedflowClient';

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
        await wedflow.auth.signUp({ email, password, full_name: fullName });
      } else {
        await wedflow.auth.signInWithPassword({ email, password });
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
      await wedflow.auth.signInWithGoogle();
    } catch (err) {
      setError(err?.message || 'התחברות Google נכשלה');
    }
  };

  return (
    <div
      dir="rtl"
      className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-background via-secondary to-rose-light/20 p-4"
    >
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <img src="/monogram.png" alt="" className="w-24 mx-auto mb-2" />
          <h1 className="text-3xl font-bold bg-gradient-to-l from-rose-light via-rose to-rose-deep bg-clip-text text-transparent mb-1">
            WedFlow
          </h1>
          <p className="text-sm text-muted-foreground">מטה החתונה שלכם</p>
        </div>

        {/* Card */}
        <div className="bg-card/90 backdrop-blur rounded-2xl shadow-lg shadow-rose-light/20 border border-border p-8">
          <h2 className="text-lg font-semibold text-foreground text-center mb-6">
            {mode === 'signup' ? 'הרשמה למערכת' : 'כניסה למערכת'}
          </h2>

          <form onSubmit={submit} className="space-y-3">
            {mode === 'signup' && (
              <input
                required value={fullName} onChange={(e) => setFullName(e.target.value)}
                placeholder="שם מלא"
                className="w-full px-4 py-2.5 border border-input rounded-xl text-right focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
              />
            )}
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="אימייל"
              className="w-full px-4 py-2.5 border border-input rounded-xl text-right focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
            />
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="סיסמה"
              className="w-full px-4 py-2.5 border border-input rounded-xl text-right focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
            />
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
            <button
              type="submit" disabled={busy}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-medium shadow-sm hover:bg-primary-hover disabled:opacity-50 transition"
            >
              {busy ? (mode === 'signup' ? 'נרשם…' : 'מתחבר…') : (mode === 'signup' ? 'הרשמה' : 'התחברות')}
            </button>
          </form>

          <div className="flex items-center gap-2 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">או</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <button
            onClick={google}
            className="w-full py-2.5 border border-input rounded-xl font-medium text-foreground hover:bg-secondary transition"
          >
            התחברות עם Google
          </button>

          <button type="button" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
            className="w-full text-sm text-muted-foreground mt-3">
            {mode === 'signup' ? 'כבר יש לי חשבון' : 'אין לי חשבון — הרשמה'}
          </button>
        </div>
      </div>
    </div>
  );
}
