import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Copy, Check, Unplug, Lock } from 'lucide-react';
import { wedflow } from '@/api/wedflowClient';
import { track } from '@/lib/track';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getMcpServerUrl, claudeCodeCommand } from '@/lib/mcp';

// Settings → AI agents: where to point an MCP client (Claude, ChatGPT, Cursor…) at WedFlow's
// read-only MCP server, and the agents the user has connected, each of which can be
// disconnected. Connections are per user, not per wedding — so this section is shown
// regardless of the active wedding. See docs/mcp.md.
//
// Agents connect through the MCP's own OAuth server: one mcp_connections row per approved
// agent, disconnected with revoke_mcp_connection (which also ends that agent's Supabase
// session). Supabase Auth's own grant list isn't shown — it only holds the MCP's single
// upstream client, and revoking that would disconnect every agent at once.

const CONNECTIONS_KEY = ['mcp-connections'];

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
  const { data: agents = [], isLoading, isError } = useQuery({
    queryKey: CONNECTIONS_KEY,
    queryFn: () => wedflow.oauth.listConnections(),
  });

  const revoke = useMutation({
    mutationFn: (agent) => wedflow.oauth.revokeConnection(agent.id),
    onSuccess: (_data, agent) => {
      track('mcp_agent_disconnected', { client_name: agent.client_name });
      queryClient.setQueryData(CONNECTIONS_KEY, (old = []) => old.filter((a) => a.id !== agent.id));
      queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">טוען…</p>;
  if (isError) return <p className="text-sm text-destructive">לא ניתן לטעון את רשימת הסוכנים המחוברים. נסו לרענן את העמוד.</p>;
  if (agents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-4 py-3 text-center">
        עדיין לא חיברתם סוכני AI.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border" data-testid="connected-agents">
      {agents.map((a) => {
        const pending = revoke.isPending && revoke.variables?.id === a.id;
        return (
          <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 space-y-1">
              <p className="font-medium text-foreground break-words"><bdi>{a.client_name || 'סוכן ללא שם'}</bdi></p>
              <p className="text-xs text-muted-foreground">
                חובר ב-{formatDate(a.created_at)}
                {a.last_used_at && <> · בשימוש לאחרונה ב-{formatDate(a.last_used_at)}</>}
              </p>
              {a.redirect_host && (
                <p className="text-xs text-muted-foreground">
                  יעד: <span dir="ltr" className="font-mono">{a.redirect_host}</span>
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => revoke.mutate(a)}
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
