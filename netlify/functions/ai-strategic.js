const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Chýba OPENAI_API_KEY' }) };
  }

  let records;
  try {
    const body = JSON.parse(event.body);
    records = body.records;
    if (!Array.isArray(records) || records.length === 0) {
      return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Žiadne záznamy' }) };
    }
  } catch (e) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Neplatný JSON' }) };
  }

  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const recentRecords = records.filter(r => r.created_at && r.created_at.slice(0, 10) >= sevenDaysAgo);
  const monthRecords = records.filter(r => r.created_at && r.created_at.slice(0, 10) >= thirtyDaysAgo);
  const recordsWithProblem = records.filter(r => r.problem && r.problem.trim() !== '');
  const recentWithProblem = recentRecords.filter(r => r.problem && r.problem.trim() !== '');

  const allTasksSt = [];
  const allTasksSz = [];
  records.forEach(r => {
    if (Array.isArray(r.ulohy_staubert)) {
      r.ulohy_staubert.forEach(t => allTasksSt.push({ text: t, datum: r.datum, created_at: r.created_at, zaznam: r.co_sa_riesilo }));
    }
    if (Array.isArray(r.ulohy_szabo)) {
      r.ulohy_szabo.forEach(t => allTasksSz.push({ text: t, datum: r.datum, created_at: r.created_at, zaznam: r.co_sa_riesilo }));
    }
  });

  const problemTexts = recordsWithProblem.map(r => r.problem.trim());
  const recentTopics = recentRecords.map(r => r.co_sa_riesilo).filter(Boolean);

  const statsBlock = `
CELKOVÉ ŠTATISTIKY:
- Celkový počet záznamov: ${records.length}
- Záznamy za posledných 7 dní: ${recentRecords.length}
- Záznamy za posledných 30 dní: ${monthRecords.length}
- Záznamy s problémom celkom: ${recordsWithProblem.length}
- Záznamy s problémom za posledných 7 dní: ${recentWithProblem.length}
- Úlohy Staubert celkom: ${allTasksSt.length}
- Úlohy Szabó celkom: ${allTasksSz.length}
- Pomer problémových záznamov: ${records.length > 0 ? Math.round(recordsWithProblem.length / records.length * 100) : 0}%

TÉMY POSLEDNÝCH 7 DNÍ:
${recentTopics.length ? recentTopics.map((t, i) => `  ${i + 1}. ${t}`).join('\n') : '  Žiadna aktivita'}

VŠETKY ZAZNAMENANÉ PROBLÉMY:
${problemTexts.length ? problemTexts.map((p, i) => `  ${i + 1}. ${p}`).join('\n') : '  Žiadne problémy'}
`.trim();

  const recordsText = [...records]
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 20)
    .map((r, i) => {
      const ulohy_s = Array.isArray(r.ulohy_staubert) ? r.ulohy_staubert.join(' | ') : (r.ulohy_staubert || '—');
      const ulohy_sz = Array.isArray(r.ulohy_szabo) ? r.ulohy_szabo.join(' | ') : (r.ulohy_szabo || '—');
      const age = r.created_at ? r.created_at.slice(0, 10) : '—';
      return `[${age}] ${r.co_sa_riesilo || '—'}
  Výsledok: ${r.vysledok || '—'}
  Problém: ${r.problem || '—'}
  Úlohy St: ${ulohy_s}
  Úlohy Sz: ${ulohy_sz}
  Ďalší krok: ${r.dalsi_krok || '—'}`;
    }).join('\n\n');

  const systemPrompt = `Si strategický poradca projektu STRIKER. Píšeš strategický briefing pre vedenie projektu.

KONTEXT:
- STRIKER je interný riadiaci systém malého tímu
- STAUBERT: operačný líder, koordinácia a rozhodnutia
- SZABÓ: výkonný člen, realizácia úloh

PRAVIDLÁ:
- Vecný, konkrétny, žiadne všeobecné frázy
- Hodnotíš trend a smer, nie len aktuálny deň
- Jazyk: slovenčina
- Každá sekcia max 3-4 vety`;

  const userPrompt = `${statsBlock}

ZÁZNAMY (posledných 20):
${recordsText}

---

Vytvor "AI Strategický briefing – STRIKER" v tomto formáte:

## 🧭 Strategický súhrn
## 📈 Smer projektu
## ⚙️ Technický stav a technický dlh
## 💰 ROI a priorita práce
## ⚠️ Dlhodobé riziká
## 🔁 Opakujúce sa vzory
## 👥 Tím a kapacita
## 🚫 Čo nerobiť teraz
## 🎯 Strategické priority na najbližších 7 dní
## 🧠 AI strategické odporúčanie`;

  const requestBody = JSON.stringify({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 1800,
    temperature: 0.5
  });

  const safeJson = (body) => {
    try { return { ok: true, data: JSON.parse(body) }; }
    catch (e) { return { ok: false, raw: body.slice(0, 300) }; }
  };

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

      req.setTimeout(25000, () => {
        req.destroy();
        reject(new Error('OpenAI timeout po 25s'));
      });

      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });

    const parsed = safeJson(result.body);

    if (!parsed.ok) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'OpenAI vrátila neplatný JSON', raw: parsed.raw })
      };
    }

    const json = parsed.data;

    if (result.status !== 200) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: json.error?.message || 'OpenAI chyba ' + result.status })
      };
    }

    const report = json.choices?.[0]?.message?.content || 'Report sa nepodarilo vygenerovať.';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report })
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: e.message || 'Neznáma chyba' })
    };
  }
};
