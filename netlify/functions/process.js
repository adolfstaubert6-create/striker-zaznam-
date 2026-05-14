const https = require('https');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  let body;
  try { body = JSON.parse(event.body) } catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) } }
  const { text } = body;
  if (!text) return { statusCode: 400, body: JSON.stringify({ error: 'Chýba text' }) };

  const OPENAI_KEY  = process.env.OPENAI_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  const prompt = `Si asistent ktorý spracúva záznamy z pracovných stretnutí.
Zo zadaného textu extrahuj informácie a vráť IBA čistý JSON bez backtick-ov.
JSON musí mať PRESNE túto štruktúru:
{
  "datum": "YYYY-MM-DD",
  "co_sa_riesilo": "",
  "vysledok": "",
  "problem": "",
  "ulohy_staubert": [],
  "ulohy_szabo": [],
  "dalsi_krok": "",
  "tagy": []
}

Pravidlá pre tagy — pole max 5 krátkych kľúčových slov (lowercase), napr. ["klient", "urgent", "bug", "striker"]

Text: ${text}`;

  let aiResult;
  try { aiResult = await callOpenAI(OPENAI_KEY, prompt) }
  catch (e) { return { statusCode: 500, body: JSON.stringify({ error: 'OpenAI: ' + e.message }) } }

  let parsed;
  try { parsed = JSON.parse(aiResult.replace(/```json|```/g, '').trim()) }
  catch { return { statusCode: 500, body: JSON.stringify({ error: 'Neplatný JSON', raw: aiResult }) } }

  // Sanitize — kategoria column doesn't exist in DB yet (run migration to add it)
  delete parsed.kategoria;
  if (!Array.isArray(parsed.tagy)) parsed.tagy = [];
  parsed.tagy = parsed.tagy.slice(0, 5).map(t => String(t).toLowerCase().trim()).filter(Boolean);

  try { await saveToSupabase(SUPABASE_URL, SUPABASE_KEY, parsed) }
  catch (e) { return { statusCode: 500, body: JSON.stringify({ error: 'Supabase: ' + e.message }) } }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed) };
};

function callOpenAI(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ model: 'gpt-4o-mini', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] });
    const req = https.request({
      hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey, 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { const j = JSON.parse(data); if (j.error) return reject(new Error(j.error.message)); resolve(j.choices[0].message.content) } catch (e) { reject(e) } });
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}

function saveToSupabase(url, key, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const u = new URL(url + '/rest/v1/zaznam');
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': key, 'Authorization': 'Bearer ' + key, 'Prefer': 'return=minimal', 'Content-Length': Buffer.byteLength(payload) },
    }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => { if (res.statusCode >= 200 && res.statusCode < 300) resolve(); else reject(new Error('Status ' + res.statusCode + ': ' + d)) });
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}
