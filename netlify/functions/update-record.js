const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Chýbajú ENV premenné' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Neplatný JSON' }) };
  }

<<<<<<< HEAD
  const { id, datum, co_sa_riesilo, vysledok, problem, dalsi_krok, ulohy_staubert, ulohy_szabo, kategoria, tagy } = body;
=======
  const { id, datum, co_sa_riesilo, vysledok, problem, dalsi_krok, ulohy_staubert, ulohy_szabo } = body;
>>>>>>> e35371ce5980d630bcaba189eef59f9a79114cd0

  if (!id) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Chýba id' }) };
  }

<<<<<<< HEAD
  const ALLOWED_CATEGORIES = ['Obchod', 'Technické', 'Financie', 'HR', 'Marketing', 'Iné'];
=======
>>>>>>> e35371ce5980d630bcaba189eef59f9a79114cd0
  const updateData = JSON.stringify({
    datum,
    co_sa_riesilo,
    vysledok,
    problem,
    dalsi_krok,
    ulohy_staubert: Array.isArray(ulohy_staubert) ? ulohy_staubert : [],
<<<<<<< HEAD
    ulohy_szabo:    Array.isArray(ulohy_szabo)    ? ulohy_szabo    : [],
    kategoria:      ALLOWED_CATEGORIES.includes(kategoria) ? kategoria : 'Iné',
    tagy:           Array.isArray(tagy) ? tagy.slice(0, 5).map(t => String(t).toLowerCase().trim()).filter(Boolean) : [],
=======
    ulohy_szabo: Array.isArray(ulohy_szabo) ? ulohy_szabo : [],
>>>>>>> e35371ce5980d630bcaba189eef59f9a79114cd0
  });

  const urlObj = new URL(`${SUPABASE_URL}/rest/v1/zaznam?id=eq.${encodeURIComponent(id)}`);

  try {
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_SERVICE_ROLE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Prefer': 'return=representation',
          'Content-Length': Buffer.byteLength(updateData),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });

      req.on('error', reject);
      req.write(updateData);
      req.end();
    });

    if (result.status < 200 || result.status >= 300) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Supabase chyba: ' + result.body }) };
    }

    const rows = JSON.parse(result.body);
    const record = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, record }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
