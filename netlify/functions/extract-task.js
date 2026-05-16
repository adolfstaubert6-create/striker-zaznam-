// ── STRIKER AI – extract-task.js ─────────────────────────────────────────────
// POST { message_id, content, author_id }
// → calls Claude, extracts task, saves to ai_task_suggestions if confident
// ─────────────────────────────────────────────────────────────────────────────
const https = require('https');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function httpPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data   = JSON.stringify(body);
    const req    = https.request(
      { hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let raw = '';
        res.on('data', c => { raw += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: raw }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpPatch(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const data   = JSON.stringify(body);
    const req    = https.request(
      { hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let raw = '';
        res.on('data', c => { raw += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: raw }));
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const SYSTEM_PROMPT = `Si asistent na extrakciu úloh zo správ v slovenskom tíme.
Analyzuj správu a urči, či obsahuje akčný krok / úlohu, ktorú treba splniť.

Pravidlá priradenia (assigned_to):
- "Szabó pozri/sprav/pre Szabóa" ALEBO technické témy (systém/kód/databáza/Netlify/Supabase/web/bug/deploy) → "szabo"
- "Staubert/Adolf/obchod/klient/faktúra/stretnutie/financie/zmluva/ponuka" → "staubert"
- "ja to spravím/urobím/zariadim/pozriem/dám" → použij hodnotu author_id (buď "staubert" alebo "szabo")
- nejednoznačné → "both"

Pravidlá priority:
- urgentné/asap/hneď/okamžite/dnes večer/čo najskôr → "KRITICKÉ"
- inak → "NORMÁLNA"

Pravidlá deadline:
- "dnes" → dnešný dátum (YYYY-MM-DD)
- "zajtra" → zajtrajší dátum
- "do piatku" → najbližší piatok
- "budúci týždeň" → najbližší pondelok
- konkrétny dátum → YYYY-MM-DD
- žiadny deadline → null

Výstup MUSÍ byť čistý JSON bez markdown, bez komentárov.

Ak správa obsahuje úlohu:
{"has_task":true,"task_title":"stručný popis úlohy","assigned_to":"staubert|szabo|both","priority":"KRITICKÉ|NORMÁLNA","deadline":"YYYY-MM-DD alebo null","confidence_score":0.0-1.0,"reason":"krátke vysvetlenie prečo ide o úlohu"}

Ak správa NEobsahuje úlohu (napr. bežná konverzácia, pozdrav, otázka bez akcie):
{"has_task":false}

Dôležité: confidence_score = 1.0 len ak je to jednoznačná úloha s jasným assignee. Bežná otázka = 0.0.`;

exports.handler = async function (event) {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const SUPABASE_URL      = process.env.SUPABASE_URL;
  const SUPABASE_KEY      = process.env.SUPABASE_KEY;

  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY' }) };
  }

  let message_id, content, author_id;
  try {
    const body = JSON.parse(event.body || '{}');
    message_id = body.message_id;
    content    = body.content;
    author_id  = body.author_id || 'both';
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  if (!message_id || !content) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'message_id and content required' }) };
  }

  // ── Determine today's date for Claude context ───────────────────────────────
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  // Next friday
  const dayOfWeek = today.getDay(); // 0=Sun
  const daysToFri = (5 - dayOfWeek + 7) % 7 || 7;
  const friday = new Date(today); friday.setDate(today.getDate() + daysToFri);
  const fridayStr = friday.toISOString().slice(0, 10);
  // Next monday
  const daysToMon = (1 - dayOfWeek + 7) % 7 || 7;
  const monday = new Date(today); monday.setDate(today.getDate() + daysToMon);
  const mondayStr = monday.toISOString().slice(0, 10);

  const userMsg = `Dnes je ${todayStr}. Zajtra je ${tomorrowStr}. Najbližší piatok je ${fridayStr}. Budúci pondelok je ${mondayStr}.
author_id: ${author_id}

Správa:
"${content}"`;

  // ── Call Claude ─────────────────────────────────────────────────────────────
  let claudeResult;
  try {
    const claudeResp = await Promise.race([
      httpPost('api.anthropic.com', '/v1/messages', {
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json'
      }, {
        model:      'claude-sonnet-4-5',
        max_tokens: 300,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: userMsg }]
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Claude timeout')), 18000))
    ]);

    if (claudeResp.status !== 200) {
      console.error('[extract-task] Claude error:', claudeResp.status, claudeResp.body);
      return { statusCode: 502, headers: CORS, body: JSON.stringify({ error: 'Claude API error', detail: claudeResp.status }) };
    }

    const claudeBody = JSON.parse(claudeResp.body);
    const rawText    = (claudeBody.content?.[0]?.text || '').trim();

    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
    claudeResult  = JSON.parse(cleaned);
  } catch (err) {
    console.error('[extract-task] Claude parse error:', err.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Failed to parse Claude response', detail: err.message }) };
  }

  // ── Gate on confidence ──────────────────────────────────────────────────────
  if (!claudeResult.has_task || (claudeResult.confidence_score || 0) <= 0.6) {
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ has_task: false })
    };
  }

  // ── Save to Supabase ────────────────────────────────────────────────────────
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const sbPayload = {
        message_id,
        task_title:       claudeResult.task_title,
        assigned_to:      claudeResult.assigned_to  || 'both',
        priority:         claudeResult.priority     || 'NORMÁLNA',
        deadline:         claudeResult.deadline     || null,
        confidence_score: claudeResult.confidence_score,
        reason:           claudeResult.reason       || '',
        status:           'pending',
        extracted_by_ai:  true,
        created_from:     'chat_ai'
      };

      const sbHostname = SUPABASE_URL.replace('https://', '').replace('http://', '').split('/')[0];
      await httpPost(sbHostname, '/rest/v1/ai_task_suggestions', {
        'apikey':       SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal'
      }, sbPayload);
    } catch (sbErr) {
      console.warn('[extract-task] Supabase save failed (non-fatal):', sbErr.message);
    }
  }

  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(claudeResult)
  };
};
