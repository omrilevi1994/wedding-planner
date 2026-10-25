import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bot, Eye, Lock, Wallet, Unplug, ShieldAlert } from 'lucide-react';
import { wedflow } from '@/api/wedflowClient';
import { useAuth } from '@/lib/AuthContext';
import { track } from '@/lib/track';
import Login from '@/components/Login';
import {
  parseAuthorizationId,
  redirectDisplayHost,
  isAuthorizationRedirect,
  classifyConsentError,
  isTrustedRedirect,
  isMcpCallback,
  readMcpAgentCookie,
  deniedMcpCallbackUrl,
  MCP_AGENT_COOKIE,
} from '@/lib/mcp';

// OAuth 2.1 consent screen for AI agents connecting to WedFlow's read-only MCP server
// (docs/mcp.md). Supabase Auth redirects here with ?authorization_id=… after an agent
// starts the authorization-code flow. Public route (like /join-wedding): if the visitor
// isn't signed in we render <Login/> in place so the query param survives, and Google
// sign-in is told to return to this exact URL.
//
// Agents connect through WedFlow's MCP OAuth server, which is the single upstream client here:
// the redirect is then `<MCP>/callback`, and the agent's own name/destination come from the
// `wedflow_mcp_agent` cookie the MCP's /authorize set. Supabase auto-approves a returning
// user's repeat consent for that client, but every agent is a new connection, so for MCP
// flows we always ask before releasing the (already issued) code.

function clearAgentCookie() {
  document.cookie = `${MCP_AGENT_COOKIE}=; Path=/app/oauth; Max-Age=0; SameSite=Lax`;
}

const ERROR_MESSAGES = {
  missing: 'קישור האישור אינו תקין. חזרו לסוכן ה-AI ונסו להתחבר מחדש.',
  not_found: 'בקשת החיבור לא נמצאה. ייתכן שהקישור שגוי — חזרו לסוכן ה-AI ונסו להתחבר מחדש.',
  expired: 'פג תוקפה של בקשת החיבור. חזרו לסוכן ה-AI ונסו להתחבר מחדש.',
  already_processed: 'בקשת החיבור הזו כבר טופלה (אושרה או נדחתה). אם הסוכן עדיין לא מחובר, התחילו את החיבור מחדש מתוך הסוכן.',
  session: 'פג תוקף ההתחברות שלכם. רעננו את העמוד והתחברו שוב.',
  unknown: 'משהו השתבש בטעינת בקשת החיבור. נסו לרענן את העמוד או להתחיל את החיבור מחדש מתוך הסוכן.',
  untrusted: 'הסוכן הזה אינו ברשימת הסוכנים הנתמכים של WedFlow, ולכן אי אפשר לחבר אותו. אם לא אתם התחלתם את החיבור — ייתכן שמדובר בניסיון הונאה.',
};

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = parseAuthorizationId(params);
  const { isAuthenticated, isLoadingAuth, user, logout } = useAuth();

  // loading | consent | submitting | redirecting | error
  const [status, setStatus] = useState('loading');
  const [details, setDetails] = useState(null);
  const [errorKind, setErrorKind] = useState(null);
  const [decision, setDecision] = useState(null); // 'approve' | 'deny'
  const [agent] = useState(() => readMcpAgentCookie());
  const viewedRef = useRef(null);

  useEffect(() => {
    if (!authorizationId || !isAuthenticated) return;
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const data = await wedflow.oauth.getAuthorizationDetails(authorizationId);
        if (cancelled) return;
        if (isAuthorizationRedirect(data) && isMcpCallback(data.redirect_url)) {
          // The code is already issued (repeat consent for the MCP) — still ask, see above.
          setDetails({ preapprovedUrl: data.redirect_url, redirect_uri: data.redirect_url });
          setStatus('consent');
          if (viewedRef.current !== authorizationId) {
            viewedRef.current = authorizationId;
            track('mcp_consent_viewed', { client_name: agent?.name });
          }
          return;
        }
        if (isAuthorizationRedirect(data)) {
          // Already consented to this client + scopes — Supabase hands back the code directly.
          // A client may register several redirect URIs, so re-check where this code goes.
          if (!isTrustedRedirect(data.redirect_url)) {
            setErrorKind('untrusted');
            setStatus('error');
            return;
          }
          setStatus('redirecting');
          window.location.assign(data.redirect_url);
          return;
        }
        setDetails(data);
        setStatus('consent');
        if (viewedRef.current !== authorizationId) {
          viewedRef.current = authorizationId;
          track('mcp_consent_viewed', { client_name: isMcpCallback(data?.redirect_uri) ? agent?.name : data?.client?.name });
        }
      } catch (err) {
        if (cancelled) return;
        setErrorKind(classifyConsentError(err));
        setStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [authorizationId, isAuthenticated, user?.id]);

  const decide = async (action) => {
    if (status !== 'consent') return;
    if (action === 'approve' && !isTrustedRedirect(details?.redirect_uri)) return;
    setDecision(action);
    const trackedName = isMcpCallback(details?.redirect_uri) ? agent?.name : details?.client?.name;
    if (details?.preapprovedUrl) {
      track(action === 'approve' ? 'mcp_consent_approved' : 'mcp_consent_denied', { client_name: trackedName });
      clearAgentCookie();
      setStatus('redirecting');
      window.location.assign(action === 'approve' ? details.preapprovedUrl : deniedMcpCallbackUrl(details.preapprovedUrl));
      return;
    }
    setStatus('submitting');
    try {
      const data = action === 'approve'
        ? await wedflow.oauth.approve(authorizationId)
        : await wedflow.oauth.deny(authorizationId);
      track(action === 'approve' ? 'mcp_consent_approved' : 'mcp_consent_denied', { client_name: trackedName });
      clearAgentCookie();
      setStatus('redirecting');
      if (data?.redirect_url && isTrustedRedirect(data.redirect_url)) window.location.assign(data.redirect_url);
    } catch (err) {
      setErrorKind(classifyConsentError(err));
      setStatus('error');
    }
  };

  if (!authorizationId) {
    return <Shell><ErrorMessage kind="missing" /></Shell>;
  }

  if (isLoadingAuth) {
    return <Shell><p className="text-sm text-muted-foreground text-center">טוען…</p></Shell>;
  }

  if (!isAuthenticated) {
    return (
      <div dir="rtl">
        <div className="fixed top-0 inset-x-0 z-10 flex justify-center pt-6 px-4 pointer-events-none">
          <p className="text-sm bg-card/90 border border-border rounded-full px-4 py-2 shadow-sm text-foreground text-center">
            🤖 התחברו ל-WedFlow כדי לאשר חיבור של סוכן AI
          </p>
        </div>
        <Login redirectTo={window.location.href} />
      </div>
    );
  }

  if (status === 'error') {
    return <Shell><ErrorMessage kind={errorKind} /></Shell>;
  }

  if (status === 'loading' || !details) {
    return <Shell><p className="text-sm text-muted-foreground text-center">טוען את פרטי הבקשה…</p></Shell>;
  }

  const mcpFlow = isMcpCallback(details.redirect_uri);
  const clientName = (mcpFlow ? agent?.name : details.client?.name) || 'סוכן AI';
  // For MCP flows the code goes to the MCP, which forwards it to the agent's checked address.
  const host = mcpFlow ? (agent?.host || '') : redirectDisplayHost(details.redirect_uri);
  const busy = status === 'submitting' || status === 'redirecting';
  const accountEmail = details.user?.email || user?.email;
  const trusted = isTrustedRedirect(details.redirect_uri);

  if (!trusted) {
    // Unknown destination: never offer "approve"; denying just closes the request (no redirect).
    return (
      <Shell>
        <div className="space-y-4 text-center">
          <ShieldAlert className="w-8 h-8 mx-auto text-destructive" />
          <p className="text-sm text-destructive">{ERROR_MESSAGES.untrusted}</p>
          {host && (
            <p className="text-xs text-muted-foreground">
              יעד הבקשה: <span dir="ltr" className="font-mono text-foreground break-all">{host}</span>
            </p>
          )}
          {status === 'redirecting' ? (
            <p className="text-sm font-medium text-foreground">הבקשה נדחתה. אפשר לסגור את החלון.</p>
          ) : (
            <button
              type="button"
              onClick={() => decide('deny')}
              disabled={busy}
              className="block w-full py-2.5 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-accent disabled:opacity-50 transition"
            >
              {busy ? 'דוחה…' : 'דחיית הבקשה'}
            </button>
          )}
        </div>
      </Shell>
    );
  }

  if (status === 'redirecting') {
    return (
      <Shell>
        <div className="space-y-2 text-center">
          <p className="text-lg font-semibold text-foreground">
            {decision === 'deny' ? 'הבקשה נדחתה' : '✓ החיבור אושר'}
          </p>
          <p className="text-sm text-muted-foreground">
            מעבירים אתכם חזרה ל-<span className="font-medium text-foreground">{clientName}</span>…
          </p>
          <p className="text-xs text-muted-foreground">אם שום דבר לא קורה, אפשר לסגור את החלון ולחזור לסוכן.</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="space-y-5">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-full bg-accent/60 flex items-center justify-center">
            <Bot className="w-6 h-6 text-rose-deep" strokeWidth={1.75} />
          </div>
          <h2 className="text-lg font-semibold text-foreground leading-snug">
            <bdi className="break-words">{clientName}</bdi> מבקש גישה לחשבון ה-WedFlow שלכם
          </h2>
          {host && (
            <p className="text-xs text-muted-foreground">
              לאחר האישור תועברו אל{' '}
              <span dir="ltr" className="font-mono text-foreground break-all">{host}</span>
            </p>
          )}
        </div>

        <div className="rounded-xl bg-secondary/60 border border-border px-3 py-2 text-xs text-muted-foreground flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p>מחוברים בתור</p>
            <p dir="ltr" className="font-medium text-foreground truncate text-right" title={accountEmail}>{accountEmail}</p>
          </div>
          <button type="button" onClick={logout} disabled={busy} className="shrink-0 underline hover:text-foreground disabled:opacity-50">
            החלפת חשבון
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">אם תאשרו, הסוכן יוכל:</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <Item Icon={Eye}>
              <strong className="text-foreground">לקרוא בלבד</strong> מידע מהחתונות שאתם חברים בהן — מוזמנים, הושבה, ספקים וצ'ק-ליסט
            </Item>
            <Item Icon={Wallet}>
              תקציב, הוצאות, תשלומים ומתנות — רק בחתונות שבהן אתם בעלי האירוע או מתכננים שותפים
            </Item>
            <Item Icon={Lock}>
              הסוכן <strong className="text-foreground">לא יוכל לשנות, להוסיף או למחוק</strong> שום דבר
            </Item>
            <Item Icon={Unplug}>
              אפשר לנתק את הסוכן בכל עת בהגדרות ← סוכני AI
            </Item>
          </ul>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-taupe/40 bg-champagne px-3 py-2.5 text-xs text-foreground">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-deep" />
          <p>
            אשרו רק סוכנים שאתם סומכים עליהם ושאתם התחלתם את החיבור אליהם. הסוכן יראה מידע אישי של
            המוזמנים שלכם (כמו שמות וטלפונים) ויעבד אותו אצל ספק ה-AI.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => decide('approve')}
            disabled={busy}
            className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium shadow-sm hover:bg-primary-hover disabled:opacity-50 transition"
          >
            {status === 'submitting' && decision === 'approve' ? 'מאשר…' : 'אישור החיבור'}
          </button>
          <button
            type="button"
            onClick={() => decide('deny')}
            disabled={busy}
            className="flex-1 py-2.5 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-accent disabled:opacity-50 transition"
          >
            {status === 'submitting' && decision === 'deny' ? 'דוחה…' : 'דחיית הבקשה'}
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Item({ Icon, children }) {
  return (
    <li className="flex items-start gap-2">
      <Icon className="w-4 h-4 shrink-0 mt-0.5 text-rose-deep" strokeWidth={1.75} />
      <span>{children}</span>
    </li>
  );
}

function ErrorMessage({ kind }) {
  return (
    <div className="space-y-4 text-center">
      <p className="text-sm text-destructive">{ERROR_MESSAGES[kind] || ERROR_MESSAGES.unknown}</p>
      <a
        href="/app"
        className="block w-full py-2.5 bg-secondary text-secondary-foreground rounded-xl font-medium hover:bg-accent transition"
      >
        למעבר ל-WedFlow
      </a>
    </div>
  );
}

function Shell({ children }) {
  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary to-rose-light/20 p-4"
    >
      <div className="w-full max-w-md py-6">
        <div className="text-center mb-6">
          <img src="/monogram.png" alt="" className="w-20 mx-auto mb-2" />
          <h1 className="text-3xl font-bold bg-gradient-to-l from-rose-light via-rose to-rose-deep bg-clip-text text-transparent mb-1">
            WedFlow
          </h1>
          <p className="text-sm text-muted-foreground">חיבור סוכן AI</p>
        </div>
        <div className="bg-card/90 backdrop-blur rounded-2xl shadow-lg shadow-rose-light/20 border border-border p-6 sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
