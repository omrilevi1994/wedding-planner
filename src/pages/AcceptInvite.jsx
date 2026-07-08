import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { wedflow } from '@/api/wedflowClient';

// Landing page for invite emails. Deliberately does NOT call verifyOtp() automatically
// on mount — the token_hash in the URL is only consumed once the user explicitly clicks
// "Accept invite". This protects against corporate email security scanners / link
// preview bots that GET-request every link in an email before the recipient opens it,
// which would otherwise burn the one-time invite token and make it look expired.
export default function AcceptInvite() {
  const [params] = useSearchParams();
  const tokenHash = params.get('token_hash');
  const type = params.get('type') || 'invite';

  const [step, setStep] = useState('confirm'); // 'confirm' | 'password' | 'done'
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!tokenHash) {
    return (
      <Shell>
        <p className="text-sm text-destructive text-center">
          קישור ההזמנה אינו תקין. בקשו מהמארגן/ת לשלוח הזמנה חדשה.
        </p>
      </Shell>
    );
  }

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await wedflow.auth.acceptInvite({ token_hash: tokenHash, type });
      setStep('password');
    } catch (err) {
      setError(
        err?.message?.includes('expired') || err?.message?.includes('invalid')
          ? 'קישור ההזמנה כבר נוצל או פג תוקפו. בקשו מהמארגן/ת לשלוח הזמנה חדשה.'
          : err?.message || 'שגיאה באישור ההזמנה'
      );
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים');
      return;
    }
    if (password !== confirmPassword) {
      setError('הסיסמאות אינן תואמות');
      return;
    }
    setBusy(true);
    try {
      await wedflow.auth.setPassword(password);
      setStep('done');
      window.location.href = '/app';
    } catch (err) {
      setError(err?.message || 'שגיאה בהגדרת הסיסמה');
      setBusy(false);
    }
  };

  return (
    <Shell>
      {step === 'confirm' && (
        <div className="space-y-4 text-center">
          <p className="text-lg font-semibold text-foreground">🎉 הוזמנתם!</p>
          <p className="text-sm text-muted-foreground">לחצו לאישור ההצטרפות לתכנון החתונה</p>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <button
            onClick={accept}
            disabled={busy}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-medium shadow-sm hover:bg-primary-hover disabled:opacity-50 transition"
          >
            {busy ? 'מאשר…' : 'אישור הצטרפות'}
          </button>
        </div>
      )}

      {step === 'password' && (
        <form onSubmit={submitPassword} className="space-y-3">
          <p className="text-sm text-muted-foreground text-center mb-2">בחרו סיסמה לחשבון שלכם</p>
          <input
            type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="סיסמה חדשה"
            className="w-full px-4 py-2.5 border border-input rounded-xl text-right focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
          />
          <input
            type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="אימות סיסמה"
            className="w-full px-4 py-2.5 border border-input rounded-xl text-right focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
          />
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <button
            type="submit" disabled={busy}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-medium shadow-sm hover:bg-primary-hover disabled:opacity-50 transition"
          >
            {busy ? 'שומר…' : 'שמירה והמשך'}
          </button>
        </form>
      )}

      {step === 'done' && (
        <p className="text-sm text-muted-foreground text-center">מעביר אתכם למערכת…</p>
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div
      dir="rtl"
      className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-background via-secondary to-rose-light/20 p-4"
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/monogram.png" alt="" className="w-24 mx-auto mb-2" />
          <h1 className="text-3xl font-bold bg-gradient-to-l from-rose-light via-rose to-rose-deep bg-clip-text text-transparent mb-1">
            WedFlow
          </h1>
          <p className="text-sm text-muted-foreground">הצטרפות לתכנון החתונה</p>
        </div>
        <div className="bg-card/90 backdrop-blur rounded-2xl shadow-lg shadow-rose-light/20 border border-border p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
