import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const { file_url, text } = await req.json();
  const prompt = `Extract wedding guests from the following data as a JSON array of
objects with keys first_name, last_name, phone, side, total_people. Return ONLY JSON.\n\n${text ?? file_url}`;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const json = await resp.json();
  const textOut = json.content?.[0]?.text ?? '[]';
  let rows = [];
  try { rows = JSON.parse(textOut); } catch { rows = []; }
  return Response.json({ output: rows }, { headers: corsHeaders });
});
