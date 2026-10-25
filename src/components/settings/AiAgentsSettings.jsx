import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Copy, Check, Unplug, Lock } from 'lucide-react';
import { wedflow } from '@/api/wedflowClient';
import { track } from '@/lib/track';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getMcpServerUrl, claudeCodeCommand, normalizeScopes } from '@/lib/mcp';

// Settings → AI agents: where to point an MCP client (Claude, ChatGPT, Cursor…) at WedFlow's
// read-only MCP server, and the list of agents the user has approved (OAuth grants), each of
// which can be disconnected. Grants are per user, not per wedding — so this section is shown
// regardless of the active wedding. See docs/mcp.md.

const GRANTS_KEY = ['oauth-grants'];

function CopyField({ value, label }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — the text is selectable anyway */ }
  };
  return (
    <div className="flex items-stretch gap-2">
      <code
        dir="ltr"
        className="flex-1 min-w-0 rounded-md border border-input bg-secondary/40 px-3 py-2 text-xs font-mono text-foreground break-all select-all text-left"
      >
        {value}
      </code>
      <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={label} className="shrink-0 h-auto">
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        <span className="mr-1">{copied ? 'הועתק' : 'העתקה'}</span>
      </Button>
    </div>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function ConnectedAgents() {
  const queryClient = useQueryClient();
  const { data: grants = [], isLoading, isError } = useQuery({
    queryKey: GRANTS_KEY,
    queryFn: () => wedflow.oauth.listGrants(),
  });

  const revoke = useMutation({
    mutationFn: (clientId) => wedflow.oauth.revokeGrant(clientId),
    onSuccess: (_data, clientId) => {
      const grant = grants.find((g) => g.client?.id === clientId);
      track('mcp_agent_disconnected', { client_name: grant?.client?.name });
      queryClient.setQueryData(GRANTS_KEY, (old = []) => old.filter((g) => g.client?.id !== clientId));
      queryClient.invalidateQueries({ queryKey: GRANTS_KEY });
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">טוען…</p>;
  if (isError) return <p className="text-sm text-destructive">לא ניתן לטעון את רשימת הסוכנים המחוברים. נסו לרענן את העמוד.</p>;
  if (grants.length === 0) {
    return (
      <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-4 py-3 text-center">
        עדיין לא חיברתם סוכני AI.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border" data-testid="connected-agents">
      {grants.map((g) => {
        const scopes = normalizeScopes(g.scopes);
        const pending = revoke.isPending && revoke.variables === g.client?.id;
        return (
          <li key={g.client?.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 space-y-1">
              <p className="font-medium text-foreground break-words"><bdi>{g.client?.name || 'סוכן ללא שם'}</bdi></p>
              <p className="text-xs text-muted-foreground">חובר ב-{formatDate(g.granted_at)}</p>
              {scopes.length > 0 && (
                <div className="flex flex-wrap gap-1" dir="ltr">
                  {scopes.map((s) => (
                    <Badge key={s} variant="outline" className="text-[10px] font-mono font-normal">{s}</Badge>
                  ))}
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => revoke.mutate(g.client.id)}
              className="shrink-0 text-destructive hover:text-destructive"
            >
              <Unplug className="w-4 h-4 ml-1" />
              {pending ? 'מנתק…' : 'ניתוק'}
            </Button>
          </li>
        );
      })}
      {revoke.isError && (
        <li className="px-4 py-2 text-sm text-destructive">הניתוק נכשל. נסו שוב.</li>
      )}
    </ul>
  );
}

export default function AiAgentsSettings() {
  const url = getMcpServerUrl();

  return (
    <Card className="shadow-md" id="ai-agents">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-rose-deep" strokeWidth={1.75} />
          סוכני AI
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          חברו את Claude, ChatGPT, Cursor או כל סוכן AI שתומך ב-MCP, ושאלו שאלות על החתונה —
          למשל "מי עוד לא אישר הגעה מצד החתן?" או "כמה נשאר לנו לשלם לספקים?".
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">כתובת שרת ה-MCP</p>
          <CopyField value={url} label="העתקת כתובת השרת" />
        </div>

        <div className="space-y-3 text-sm">
          <p className="font-medium text-foreground">איך מתחברים</p>
          <div className="space-y-1">
            <p className="text-foreground font-medium">Claude — באתר או באפליקציה</p>
            <p className="text-muted-foreground">
              הגדרות ← <span dir="ltr">Connectors</span> ← <span dir="ltr">Add custom connector</span> ← הדביקו את הכתובת והתחברו עם חשבון ה-WedFlow שלכם.
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-foreground font-medium">Claude Code</p>
            <p className="text-muted-foreground">הריצו בטרמינל, ואז <code dir="ltr" className="font-mono">/mcp</code> כדי להתחבר:</p>
            <CopyField value={claudeCodeCommand(url)} label="העתקת הפקודה" />
          </div>
          <div className="space-y-1">
            <p className="text-foreground font-medium">ChatGPT, Cursor וסוכנים אחרים</p>
            <p className="text-muted-foreground">
              הוסיפו שרת MCP מרוחק (<span dir="ltr">remote MCP server</span>) עם הכתובת שלמעלה. ההתחברות לחשבון תיפתח אוטומטית.
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-champagne border border-taupe/40 p-4 text-sm space-y-2">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <Lock className="w-4 h-4 text-rose-deep" />
            קריאה בלבד — הסוכן לא יכול לשנות שום דבר
          </p>
          <p className="text-muted-foreground">הסוכן רואה רק חתונות שאתם חברים בהן, ולפי התפקיד שלכם בכל חתונה:</p>
          <ul className="list-disc pr-5 text-muted-foreground space-y-0.5">
            <li><strong className="text-foreground">בעלי האירוע ומתכננים שותפים:</strong> הכל, כולל תקציב, הוצאות, תשלומים ומתנות</li>
            <li><strong className="text-foreground">מנהל/ת אירוע:</strong> מוזמנים, הושבה, ספקים (בלי עלויות) וצ'ק-ליסט — בלי טלפונים וכספים</li>
            <li><strong className="text-foreground">בני משפחה:</strong> מוזמנים והושבה של הצד שלהם בלבד, וצ'ק-ליסט</li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">סוכנים מחוברים</p>
          <ConnectedAgents />
        </div>
      </CardContent>
    </Card>
  );
}
