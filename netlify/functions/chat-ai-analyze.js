// ── STRIKER Team Chat – AI Analysis ──
// POST { transcript: string }
// Returns { rozhodnutia, ulohy, kriticke_body }

const https = require('https');

exports.handler = async (event) => {
  const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Chýba ANTHROPIC_API_KEY' }) };
  }

  let transcript;
  try {
    const body = JSON.parse(event.body || '{}');
    transcript = (body.transcript || '').trim();
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Neplatný JSON' }) };
  }

  if (!transcript) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Prázdna konverzácia' }) };
  }

  const systemPrompt = 'Si asistent pre firmu STRIKER. Analyzuj konverzáciu a odpovedaj LEN v JSON.';

  const userMessage =
    'Analyzuj túto konverzáciu a navrhni v slovenčine. Odpovedz LEN v JSON bez markdown:\n' +
    '{"rozhodnutia": "čo bolo rozhodnuté", "ulohy": "kto má čo urobiť vo formáte Meno: úloha", "kriticke_body": "riziká a dôležité veci"}\n\n' +
    'Konverzácia: ' + transcript;

  const requestBody = JSON.stringify({
    model: 'claude-sonnet-4-5',
    max_tokens: 1000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(requestBody)
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.setTimeout(25000, () => { req.destroy(); reject(new Error('Timeout')); });
      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });

    let parsed;
    try { parsed = JSON.parse(result.body); }
    catch { return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'Neplatná odpoveď od AI' }) }; }

    if (result.status !== 200) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: parsed.error?.message || 'AI chyba' }) };
    }

    const rawText = (parsed.content?.[0]?.text || '').trim();

    // Strip optional markdown fences and parse JSON
    let aiData;
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
      aiData = JSON.parse(cleaned);
    } catch {
      // Fallback: surface raw text so nothing is lost
      aiData = { rozhodnutia: rawText, ulohy: '', kriticke_body: '' };
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        rozhodnutia:   String(aiData.rozhodnutia   || ''),
        ulohy:         String(aiData.ulohy         || ''),
        kriticke_body: String(aiData.kriticke_body || '')
      })
    };

  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message || 'Neznáma chyba' }) };
  }
};
