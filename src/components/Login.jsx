import React, { useState } from 'react';
import { Wallet, ListChecks, Smartphone } from 'lucide-react';
import { wedflow } from '@/api/wedflowClient';

// Landing page shown when no authenticated Supabase session exists.
// Leads with the promise + emotion, then a fast Google sign-up; email/password
// is tucked behind a toggle. Email/password works locally; Google is enabled
// once OAuth is configured on the Supabase project.

function GoogleButton({ onClick, children = 'הרשמה מהירה עם Google' }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center gap-3 py-3 bg-primary text-primary-foreground rounded-xl font-medium shadow-sm shadow-rose-light/30 hover:bg-primary-hover transition"
    >
      <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true">
        <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
        <path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
        <path fill="#1976D2" d="M43.6 20.5H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.3 5.3C41.4 36.5 44 30.8 44 24c0-1.3-.1-2.3-.4-3.5z" />
      </svg>
      {children}
    </button>
  );
}

function EmailForm({ mode, setMode, email, setEmail, password, setPassword, fullName, setFullName, error, busy, onSubmit }) {
  return (
    <form onSubmit={onSubmit} className="space-y-3 mt-4 pt-4 border-t border-border">
      {mode === 'signup' && (
        <input
          required value={fullName} onChange={(e) => setFullName(e.target.value)}
          placeholder="שם מלא"
          className="w-full px-4 py-2.5 border border-input rounded-xl text-right bg-card focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
        />
      )}
      <input
        type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="אימייל"
        className="w-full px-4 py-2.5 border border-input rounded-xl text-right bg-card focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
      />
      <input
        type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
        placeholder="סיסמה"
        className="w-full px-4 py-2.5 border border-input rounded-xl text-right bg-card focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition"
      />
      {error && <p className="text-sm text-destructive text-center">{error}</p>}
      <button
        type="submit" disabled={busy}
        className="w-full py-2.5 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-accent disabled:opacity-50 transition"
      >
        {busy ? (mode === 'signup' ? 'נרשם…' : 'מתחבר…') : (mode === 'signup' ? 'הרשמה' : 'התחברות')}
      </button>
      <button type="button" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}
        className="w-full text-sm text-muted-foreground pt-1">
        {mode === 'signup' ? 'כבר יש לי חשבון — התחברות' : 'אין לי חשבון — הרשמה'}
      </button>
    </form>
  );
}

const PILLARS = [
  {
    Icon: Wallet,
    title: 'שליטה מלאה בתקציב (בלי הפתעות)',
    body: 'כל שקל, כל ספק וכל הצעת מחיר מעודכנים ברגע, ישירות מהנייד של שניכם.',
  },
  {
    Icon: ListChecks,
    title: 'הצעד הבא שלכם תמיד ברור',
    body: "צ'ק-ליסט חכם שעושה לכם סדר מהדבר הכי קטן ועד ליום הגדול, בלי החשש ששכחתם משהו.",
  },
  {
    Icon: Smartphone,
    title: 'בכל מקום, בכל זמן, ביחד',
    body: "נפרדים מהצורך לפתוח מחשב. נכנסים בשנייה, מעדכנים 'על הדרך', ומתקדמים בראש שקט.",
  },
];

function Pillars() {
  return (
    <div className="space-y-3">
      {PILLARS.map(({ Icon, title, body }) => (
        <div
          key={title}
          className="flex items-start gap-4 bg-card/70 backdrop-blur rounded-2xl border border-border p-5"
        >
          <div className="shrink-0 w-11 h-11 rounded-full bg-accent/60 flex items-center justify-center">
            <Icon className="w-5 h-5 text-rose-deep" strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="font-semibold text-foreground leading-snug">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function FounderNote() {
  return (
    <div className="rounded-2xl border border-border bg-secondary/50 p-6 text-center">
      <p className="text-sm text-muted-foreground italic leading-relaxed">
        יצרנו את WedFlow צעד אחר צעד מתוך הצרכים שעלו תוך כדי תנועה בחתונה שלנו.
        מאחלים לכם תכנון מרגש, פשוט ובעיקר – מהנה.
      </p>
      <p className="mt-3 text-sm font-medium text-rose-deep tracking-wide">דניאל ועמרי</p>
    </div>
  );
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [mode, setMode] = useState('signup');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

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
      className="min-h-screen overflow-y-auto bg-gradient-to-b from-rose-light/15 via-background to-background"
    >
      <div className="mx-auto w-full max-w-[640px] px-5 py-12 sm:py-16 space-y-12">
        {/* Hero */}
        <header className="text-center">
          <img src="/monogram.png" alt="" className="w-20 mx-auto mb-3" />
          <p className="text-xs tracking-[0.3em] text-muted-foreground uppercase mb-6">WedFlow</p>
          <h1 className="text-4xl sm:text-5xl font-bold text-foreground leading-tight">
            אומרים שלום לאקסלים.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed max-w-md mx-auto">
            הדרך החכמה, האסתטית והרגועה ביותר לתכנן את החתונה שלכם.
          </p>

          {/* Primary auth */}
          <div className="mt-8 max-w-sm mx-auto">
            <GoogleButton onClick={google} />
            {error && !showEmail && (
              <p className="text-sm text-destructive text-center mt-3">{error}</p>
            )}
            {!showEmail ? (
              <button
                type="button"
                onClick={() => setShowEmail(true)}
                className="w-full text-sm text-muted-foreground mt-4 hover:text-foreground transition"
              >
                או המשיכו עם אימייל
              </button>
            ) : (
              <EmailForm
                mode={mode} setMode={setMode}
                email={email} setEmail={setEmail}
                password={password} setPassword={setPassword}
                fullName={fullName} setFullName={setFullName}
                error={error} busy={busy} onSubmit={submit}
              />
            )}
          </div>
        </header>

        {/* Story */}
        <p className="text-center text-muted-foreground leading-relaxed max-w-lg mx-auto">
          כי לתכנן חתונה בשנת 2026 עם טבלאות אקסל ופתקים מפוזרים בטלפון – זה פשוט לא תואם את
          הדרך שבה אנחנו חיים היום. בנינו את WedFlow מתוך החתונה שלנו, כדי להעניק לכם מרחב
          דיגיטלי אחד, מעוצב ונקי, שמאגד הכל במקום אחד. מעדכנים על הדרך, שומרים על שליטה מלאה
          – והופכים את ההפקה לחוויה מהנה.
        </p>

        {/* Pillars */}
        <Pillars />

        {/* Founder note */}
        <FounderNote />

        {/* Footer CTA */}
        <div className="max-w-sm mx-auto pb-4">
          <GoogleButton onClick={google} children="בואו נתחיל — התחברות עם Google" />
        </div>
      </div>
    </div>
  );
}
