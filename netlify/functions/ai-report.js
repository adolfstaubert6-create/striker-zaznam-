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

  const today = new Date().toISOString().slice(0, 10);

  const todayRecords = records.filter(r =>
    r.created_at && r.created_at.slice(0, 10) === today
  );

  const recordsWithProblem = records.filter(r =>
    r.problem && r.problem.trim() !== ''
  );

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

  const sortByDate = (a, b) => {
    const da = a.datum || a.created_at || '';
    const db = b.datum || b.created_at || '';
    return da.localeCompare(db);
  };
  const oldestSt = [...allTasksSt].sort(sortByDate).slice(0, 3);
  const oldestSz = [...allTasksSz].sort(sortByDate).slice(0, 3);

  const problemTexts = recordsWithProblem.map(r => r.problem.trim());

  const statsBlock = `
ŠTATISTIKY PROJEKTU:
- Celkový počet záznamov: ${records.length}
- Dnešné záznamy (created_at): ${todayRecords.length}
- Záznamy s problémom: ${recordsWithProblem.length}
- Počet úloh Staubert celkom: ${allTasksSt.length}
- Počet úloh Szabó celkom: ${allTasksSz.length}

NAJSTARŠIE ÚLOHY – STAUBERT:
${oldestSt.length ? oldestSt.map(t => `  • [${t.datum || '?'}] ${t.text} (zo záznamu: ${t.zaznam || '—'})`).join('\n') : '  Žiadne'}

NAJSTARŠIE ÚLOHY – SZABÓ:
${oldestSz.length ? oldestSz.map(t => `  • [${t.datum || '?'}] ${t.text} (zo záznamu: ${t.zaznam || '—'})`).join('\n') : '  Žiadne'}

PROBLÉMY / RIZIKÁ:
${problemTexts.length ? problemTexts.map((p, i) => `  ${i + 1}. ${p}`).join('\n') : '  Žiadne zaznamenané problémy'}
`.trim();

  const recentRecords = [...records]
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 20);

  const recordsText = recentRecords.map((r, i) => {
    const ulohy_s = Array.isArray(r.ulohy_staubert) ? r.ulohy_staubert.join(' | ') : (r.ulohy_staubert || '—');
    const ulohy_sz = Array.isArray(r.ulohy_szabo) ? r.ulohy_szabo.join(' | ') : (r.ulohy_szabo || '—');
    const isToday = r.created_at && r.created_at.slice(0, 10) === today ? ' [DNES]' : '';
    return `Záznam ${i + 1}${isToday} | Udalosť: ${r.datum || '—'} | Uložené: ${r.created_at ? r.created_at.slice(0, 10) : '—'}
  Čo sa riešilo: ${r.co_sa_riesilo || '—'}
  Výsledok: ${r.vysledok || '—'}
  Problém: ${r.problem || '—'}
  Úlohy Staubert: ${ulohy_s}
  Úlohy Szabó: ${ulohy_sz}
  Ďalší krok: ${r.dalsi_krok || '—'}`;
  }).join('\n\n');

  const systemPrompt = `Si operačný analytik a strategický asistent projektu STRIKER.

STRIKER je interný riadiaci systém malého výkonného tímu. Tím tvoria dvaja ľudia:
- STAUBERT: operačný líder, zodpovedá za realizáciu a koordináciu
- SZABÓ: výkonný člen tímu, zodpovedá za konkrétne úlohy v teréne

Tvoja úloha NIE JE jednoducho opakovať alebo sumarizovať záznamy. Tvoja úloha je:
1. Vyhodnotiť situáciu ako skúsený operačný manažér
2. Identifikovať čo skutočne horí a čo môže počkať
3. Odhaliť vzory — opakujúce sa problémy, zaseknuté úlohy, riziká
4. Dať konkrétne, akcieschopné odporúčania
5. Byť stručný, razantný a rozhodovací — nie vágny

Tón: profesionálny, priamy, mierne veliteľský. Ako brífingovanie pre generálneho riaditeľa.
Jazyk: slovenčina, bez zbytočných frází.
Formát: presne podľa zadaných sekcií, každá sekcia má byť stručná ale hodnotná.`;

  const userPrompt = `${statsBlock}

POSLEDNÉ ZÁZNAMY (max 20, od najnovšieho):
${recordsText}

---

Vytvor "AI Denný operačný report – STRIKER" presne v tomto formáte:

## 📊 Operačný súhrn
(2–4 vety: celkový stav projektu, aktivita, trend — čísla zo štatistík)

## 🔴 Kritické / Urgentné
(Čo horí? Čo je blokujúce? Ak nič, napíš prečo je situácia stabilná.)

## 👤 Staubert – stav úloh
(Koľko úloh, ktoré sú najdôležitejšie, čo je zaseknuté)

## 👤 Szabó – stav úloh
(Koľko úloh, ktoré sú najdôležitejšie, čo je zaseknuté)

## ⚠️ Opakujúce sa problémy
(Vzory ktoré vidíš naprieč záznamami — nie len zoznam, ale vyhodnotenie)

## 🎯 Top 3 priority na zajtra
(Konkrétne 3 veci s tým KTO ich má urobiť)

## 💡 Odporúčanie
(1–2 vety: strategické odporúčanie pre tím)

## 🧭 Stav projektu
(Jedna veta: napr. "Projekt je na dobrej ceste / v rizikovej zóne / vyžaduje zásah")`;

  const requestBody = JSON.stringify({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 3000,
    temperature: 0.4
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
