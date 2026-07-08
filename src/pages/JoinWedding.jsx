import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { wedflow } from '@/api/wedflowClient';
import { useAuth } from '@/lib/AuthContext';
import { useWedding } from '@/lib/WeddingContext';
import Login from '@/components/Login';

// Landing page for shareable "open invite link" URLs (createWeddingInviteLink), as opposed
// to AcceptInvite.jsx which handles the per-email invite flow. Joining requires an
// authenticated session — if the visitor isn't signed in yet we render the normal Login
// screen right here (rather than navigating away) so the `?token=` query param in this
// page's URL is never lost. Once AuthContext reports a session, we automatically call
// joinWeddingViaLink and drop the user straight into the wedding.
export default function JoinWedding() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');
  const { isAuthenticated, isLoadingAuth } = useAuth();
  const { refreshWeddings, selectWedding } = useWedding();

  const [status, setStatus] = useState('idle'); // idle | joining | done | error
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!token || !isAuthenticated || status !== 'idle') return;
    setStatus('joining');
    (async () => {
      try {
        const data = await wedflow.weddingInviteLinks.join({ token });
        setResult(data);
        await refreshWeddings();
        selectWedding(data.wedding_id);
        setStatus('done');
      } catch (err) {
        setError(
          err?.message === 'expired_token' || err?.message?.includes('פג תוקף')
            ? 'קישור ההזמנה פג תוקף. בקשו מהמארגן/ת קישור חדש.'
            : err?.message === 'invalid_token' || err?.message?.includes('אינו תקין')
            ? 'קישור ההזמנה אינו תקין. בקשו מהמארגן/ת קישור חדש.'
            : err?.message || 'שגיאה בהצטרפות לחתונה'
        );
        setStatus('error');
      }
    })();
  }, [token, isAuthenticated, status]);

  useEffect(() => {
    if (status === 'done') {
      const t = setTimeout(() => navigate('/'), 1200);
      return () => clearTimeout(t);
    }
  }, [status, navigate]);

  if (!token) {
    return (
      <Shell>
        <p className="text-sm text-destructive text-center">
          קישור ההזמנה אינו תקין. בקשו מהמארגן/ת לשלוח קישור חדש.
        </p>
      </Shell>
    );
  }

  if (isLoadingAuth) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground text-center">טוען…</p>
      </Shell>
    );
  }

  // Not signed in: show the normal login/sign-up screen right on this page so the token
  // query param stays in the URL bar; once auth succeeds this component re-renders with
  // isAuthenticated=true and the effect above fires automatically.
  if (!isAuthenticated) {
    return (
      <div dir="rtl">
        <div className="fixed top-0 inset-x-0 z-10 flex justify-center pt-6 pointer-events-none">
          <p className="text-sm bg-card/90 border border-border rounded-full px-4 py-2 shadow-sm text-foreground">
            🎉 התחברו או הירשמו כדי להצטרף לתכנון החתונה!
          </p>
        </div>
        <Login />
      </div>
    );
  }

  return (
    <Shell>
      {status === 'joining' && (
        <p className="text-sm text-muted-foreground text-center">מצרף אתכם לחתונה…</p>
      )}
      {status === 'done' && (
        <div className="space-y-2 text-center">
          <p className="text-lg font-semibold text-foreground">🎉 הצטרפתם בהצלחה!</p>
          <p className="text-sm text-muted-foreground">
            {result?.couple_names ? `אתם עכשיו חלק מתכנון החתונה של ${result.couple_names}` : 'אתם עכשיו חלק מתכנון החתונה'}
          </p>
          <p className="text-xs text-muted-foreground">מעביר אתכם למערכת…</p>
        </div>
      )}
      {status === 'error' && (
        <div className="space-y-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-medium shadow-sm hover:bg-primary-hover transition"
          >
            למעבר למערכת
          </button>
        </div>
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
