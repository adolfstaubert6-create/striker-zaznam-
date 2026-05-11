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
    .slice(0, 30)
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

  const systemPrompt = `Si strategický poradca projektu STRIKER. Nepíšeš operačný denný report — píšeš strategický briefing pre vedenie projektu.

KONTEXT:
- STRIKER je interný riadiaci a záznamový systém malého tímu
- STAUBERT: operačný líder, koordinácia a rozhodnutia
- SZABÓ: výkonný člen, realizácia úloh
- Projekt je vo vývoji — budujú sa funkcie, workflow, AI integrácia

TVOJA ROLA:
Si kritický, ale konštruktívny strategický poradca. Tvoja úloha je:
1. Vyhodnotiť či projekt ide správnym smerom z dlhodobého pohľadu
2. Identifikovať technický dlh, zbytočnú komplexitu, slepé uličky
3. Určiť čo má najvyšší ROI a čo je strata času
4. Povedať jasne čo robiť a čo nerobiť
5. Myslieť v horizonte týždňov a mesiacov, nie dní

PRAVIDLÁ:
- Nie si motivačný rečník — povieš aj nepríjemné pravdy
- Nie si dramatický — nadsádzaš nič
- Si vecný a konkrétny — žiadne všeobecné frázy
- Hodnotíš trend a smer, nie len aktuálny deň
- Jazyk: slovenčina`;

  const userPrompt = `${statsBlock}

ZÁZNAMY (posledných 30, od najnovšieho):
${recordsText}

---

Vytvor "AI Strategický briefing – STRIKER" presne v tomto formáte:

## 🧭 Strategický súhrn
(3–4 vety: celkové strategické hodnotenie projektu)

## 📈 Smer projektu
(Ide projekt správnym smerom? Je fokus jasný alebo rozptýlený?)

## ⚙️ Technický stav a technický dlh
(Kde sa hromadí technický dlh? Čo treba upratať?)

## 💰 ROI a priorita práce
(Čo má najvyššiu hodnotu? Čo je zbytočná práca?)

## ⚠️ Dlhodobé riziká
(Čo môže projekt zablokovať v horizonte 1–3 mesiacov?)

## 🔁 Opakujúce sa vzory
(Čo sa opakuje? Čo to hovorí o projekte?)

## 👥 Tím a kapacita
(Ako efektívne pracuje tím? Je rozdelenie práce optimálne?)

## 🚫 Čo nerobiť teraz
(Konkrétne veci ktoré by mali počkať)

## 🎯 Strategické priority na najbližších 7 dní
(3–5 strategických priorít — nie operačné úlohy, ale smer)

## 🧠 AI strategické odporúčanie
(2–3 vety: hlavné strategické odporúčanie pre dlhodobý úspech)`;

  const requestBody = JSON.stringify({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: 3500,
    temperature: 0.5
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
