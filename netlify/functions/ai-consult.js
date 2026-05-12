const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Chýba OPENAI_API_KEY' }) };
  }

  let records, messages, taskStatus;
  try {
    const body = JSON.parse(event.body);
    records = body.records || [];
    messages = body.messages || [];
    taskStatus = body.taskStatus || {};
  } catch (e) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Neplatný JSON' }) };
  }

  const today = new Date().toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const recentRecords = records.filter(r => r.created_at && r.created_at.slice(0, 10) >= sevenDaysAgo);
  const recordsWithProblem = records.filter(r => r.problem && r.problem.trim() !== '');

  const openTasksSt = [];
  const openTasksSz = [];
  records.forEach(r => {
    if (Array.isArray(r.ulohy_staubert)) {
      r.ulohy_staubert.forEach((t, i) => {
        const key = `${r.id}__ulohy_staubert__${i}`;
        if (!taskStatus[key]) openTasksSt.push({ text: t, datum: r.datum, zaznam: r.co_sa_riesilo });
      });
    }
    if (Array.isArray(r.ulohy_szabo)) {
      r.ulohy_szabo.forEach((t, i) => {
        const key = `${r.id}__ulohy_szabo__${i}`;
        if (!taskStatus[key]) openTasksSz.push({ text: t, datum: r.datum, zaznam: r.co_sa_riesilo });
      });
    }
  });

  const contextBlock = `
PROJEKT STRIKER – OPERAČNÝ KONTEXT
Dátum: ${today}

ŠTATISTIKY:
- Celkový počet záznamov: ${records.length}
- Záznamy za posledných 7 dní: ${recentRecords.length}
- Záznamy s problémom: ${recordsWithProblem.length}
- Otvorené úlohy Staubert: ${openTasksSt.length}
- Otvorené úlohy Szabó: ${openTasksSz.length}

OTVORENÉ ÚLOHY – STAUBERT:
${openTasksSt.slice(0, 10).map(t => `  • ${t.text} [${t.datum || '—'}]`).join('\n') || '  Žiadne'}

OTVORENÉ ÚLOHY – SZABÓ:
${openTasksSz.slice(0, 10).map(t => `  • ${t.text} [${t.datum || '—'}]`).join('\n') || '  Žiadne'}

AKTUÁLNE PROBLÉMY:
${recordsWithProblem.slice(0, 5).map(r => `  • ${r.problem} (${r.datum || '—'})`).join('\n') || '  Žiadne'}

POSLEDNÉ ZÁZNAMY (7 dní):
${recentRecords.slice(0, 8).map(r => `  [${r.created_at ? r.created_at.slice(0,10) : '—'}] ${r.co_sa_riesilo || '—'}`).join('\n') || '  Žiadna aktivita'}
`.trim();

  const systemPrompt = `Si AI strategický agent projektu STRIKER. Si priamym poradcom vedenia projektu.

TVOJA ROLA:
- Poznáš celý kontext projektu STRIKER — záznamy, úlohy, problémy, históriu
- Si k dispozícii na živú konzultáciu o prioritách, rizikách, rozhodnutiach a ďalších krokoch
- Nie si obyčajný chatbot — si strategický partner tímu
- Tím tvoria: STAUBERT (operačný líder) a SZABÓ (výkonný člen)

PRAVIDLÁ:
- Odpovedaj stručne, konkrétne a akčne
- Ak nevieš niečo z kontextu, povedz to priamo
- Navrhuj konkrétne kroky, nie vágne odporúčania
- Tón: profesionálny, priamy, partnerský
- Jazyk: slovenčina

PROJEKTOVÝ KONTEXT:
${contextBlock}`;

  const requestBody = JSON.stringify({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages
    ],
    max_tokens: 1000,
    temperature: 0.6
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
      req.setTimeout(25000, () => { req.destroy(); reject(new Error('Timeout')); });
      req.on('error', reject);
      req.write(requestBody);
      req.end();
    });

    const parsed = safeJson(result.body);
    if (!parsed.ok) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Neplatná odpoveď od AI' }) };
    }

    if (result.status !== 200) {
      return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: parsed.data.error?.message || 'AI chyba' }) };
    }

    const reply = parsed.data.choices?.[0]?.message?.content || 'Bez odpovede.';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply })
    };

  } catch (e) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: e.message || 'Neznáma chyba' }) };
  }
};
