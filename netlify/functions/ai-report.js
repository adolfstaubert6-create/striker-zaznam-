const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Chýba OPENAI_API_KEY' }) };
  }

  let records;
  try {
    const body = JSON.parse(event.body);
    records = body.records;
    if (!Array.isArray(records) || records.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Žiadne záznamy' }) };
    }
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Neplatný JSON' }) };
  }

  const recordsText = records.map((r, i) => {
    const ulohy_s = Array.isArray(r.ulohy_staubert) ? r.ulohy_staubert.join(', ') : (r.ulohy_staubert || '—');
    const ulohy_sz = Array.isArray(r.ulohy_szabo) ? r.ulohy_szabo.join(', ') : (r.ulohy_szabo || '—');
    return `Záznam ${i + 1} (${r.datum || '—'}):
- Čo sa riešilo: ${r.co_sa_riesilo || '—'}
- Výsledok: ${r.vysledok || '—'}
- Problém: ${r.problem || '—'}
- Úlohy Staubert: ${ulohy_s}
- Úlohy Szabó: ${ulohy_sz}
- Ďalší krok: ${r.dalsi_krok || '—'}`;
  }).join('\n\n');

  const prompt = `Si asistent pre operačný systém STRIKER. Na základe nasledujúcich pracovných záznamov vytvor stručný a prehľadný denný report v slovenčine.

ZÁZNAMY:
${recordsText}

Vytvor report v tomto formáte:

## 📋 Čo sa riešilo
## ✅ Čo sa podarilo
## ✅ Hotové úlohy
## ❌ Otvorené úlohy
## ⚠️ Problémy / Riziká
## 🎯 Odporúčanie na ďalší deň

Buď stručný, konkrétny a praktický. Píš v slovenčine.`;

  const requestBody = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'Si asistent pre pracovný operačný systém STRIKER. Vytváraš stručné a praktické reporty v slovenčine.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 1500,
    temperature: 0.3
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Length': Buffer.byteLength(requestBody)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });

      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });

    const json = JSON.parse(result.body);
    if (result.status !== 200) {
      return { statusCode: 500, body: JSON.stringify({ error: json.error?.message || 'OpenAI chyba' }) };
    }

    const report = json.choices?.[0]?.message?.content || 'Report sa nepodarilo vygenerovať.';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
