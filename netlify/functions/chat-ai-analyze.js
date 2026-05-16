// ── STRIKER Team Chat – AI Analysis ──
// POST { transcript: string }
// Returns { rozhodnutia, ulohy_staubert, ulohy_szabo, ulohy_obaja, kriticke_body }

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

  const systemPrompt =
    'Si asistent pre firmu STRIKER. Analyzuj konverzáciu a priraď úlohy podľa týchto pravidiel:\n' +
    '1. Kto dal sľub ("ja to urobím", "pozriem sa na to", "zariadim") → priraď tejto osobe\n' +
    '2. Ak je meno priamo spomenuté ("Szabó urob", "Adolf zavolaj", "Staubert skontroluj") → priraď tejto osobe\n' +
    '3. Podľa témy: klient/zmluva/obchod/financie/stretnutie → Staubert; systém/dokument/technické/dodávateľ → Szabó\n' +
    '4. Urgentné (urgent/asap/hneď/čo najskôr) → zaznač ako KRITICKÉ a pridaj deadline ak je uvedený\n' +
    '5. Ak nie je jasné komu → priraď obom (ulohy_obaja)\n' +
    'Odpovedaj LEN v JSON bez markdown.';

  const userMessage =
    'Analyzuj túto konverzáciu a navrhni v slovenčine. Odpovedz LEN v JSON bez markdown:\n' +
    '{"rozhodnutia": "čo bolo rozhodnuté", "ulohy_staubert": "úlohy pre Staubert, každá na nový riadok", "ulohy_szabo": "úlohy pre Szabó, každá na nový riadok", "ulohy_obaja": "úlohy pre oboch ak nie je jasné, každá na nový riadok", "kriticke_body": "riziká a urgentné veci s deadlinom ak je uvedený"}\n\n' +
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
      aiData = { rozhodnutia: rawText, ulohy_staubert: '', ulohy_szabo: '', ulohy_obaja: '', kriticke_body: '' };
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        rozhodnutia:    String(aiData.rozhodnutia    || ''),
        ulohy_staubert: String(aiData.ulohy_staubert || ''),
        ulohy_szabo:    String(aiData.ulohy_szabo    || ''),
        ulohy_obaja:    String(aiData.ulohy_obaja    || ''),
        kriticke_body:  String(aiData.kriticke_body  || '')
      })
    };

  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message || 'Neznáma chyba' }) };
  }
};
