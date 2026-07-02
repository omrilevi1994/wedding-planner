import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { data, old_data, event } = body;

    // Only send when item is being marked as completed
    if (!data?.completed || old_data?.completed === true) {
      return Response.json({ skipped: true });
    }

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
    console.log("chatId:", chatId, "botToken prefix:", botToken?.slice(0, 10));

    const message = `✅ *משימה הושלמה!*\n\n📋 *${data.title}*${data.notes ? `\n📝 ${data.notes}` : ''}`;

    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown'
      })
    });

    const result = await res.json();
    return Response.json({ ok: result.ok, description: result.description, error_code: result.error_code });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});