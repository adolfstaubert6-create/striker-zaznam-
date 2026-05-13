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

  const systemPrompt = `Si skúsený operačný analytik projektu STRIKER. Vytváraš profesionálny denný briefing pre vedenie projektu.

KONTEXT PROJEKTU:
- STRIKER je interný riadiaci a záznamový systém malého výkonného tímu
- Tím tvoria dvaja ľudia:
  • STAUBERT: operačný líder, zodpovedá za koordináciu a strategické rozhodnutia
  • SZABÓ: výkonný člen, zodpovedá za realizáciu úloh v teréne
- Projekt je aktívne vo vývoji — záznamy pribúdajú pravidelne

PRAVIDLÁ HODNOTENIA:
1. KRITICKÉ je iba to, čo reálne blokuje prácu alebo má deadline — nie každý problém je kritický
2. Staré záznamy (created_at pred 7 dňami) sú historické referenčné záznamy, NIE dôkaz zaseknutého projektu
3. Hodnoť primárne podľa recent aktivity (posledných 7 dní podľa created_at)
4. Ak projekt vykazuje pravidelnú aktivitu a záznamy pribúdajú — to je pozitívny signál
5. Rozlišuj tri úrovne závažnosti:
   - 🔴 KRITICKÉ: blokuje prácu, treba riešiť dnes
   - 🟡 UPOZORNENIE: treba sledovať, ale neblokuje
   - 🟢 STABILNÉ: funguje, len zaznamenané

TÓN A ŠTÝL:
- Profesionálny, vecný, realistický — nie dramatický ani hysterický
- Vyvážený: rovnako zdôrazni úspechy aj problémy
- Konkrétny: žiadne všeobecné frázy, iba fakty a akcie
- Stručný: každá sekcia max 3–5 bodov
- Pri komunikačnom hodnotení: podporuj spoluprácu, nekritizuj ľudí osobne, nemoralizuj
- Jazyk: slovenčina`;

  const userPrompt = `${statsBlock}

POSLEDNÉ ZÁZNAMY (max 20, od najnovšieho):
${recordsText}

---

Vytvor "AI Denný operačný report – STRIKER" presne v tomto formáte:

## 📊 Operačný súhrn
(2–3 vety: celkový stav projektu s číslami, trend aktivity, celkové hodnotenie — vyvážene pozitív aj negatív)

## ✅ Progres a úspechy
(Čo sa podarilo? Čo projekt posunulo? Čo je stabilné alebo zlepšené? Min. 2–3 konkrétne body.)

## 🔴 Kritické / Urgentné
(IBA reálne blokujúce veci. Ak nič nekritické, napíš "Žiadne kritické blokácie — projekt beží štandardne." Nepreháňaj.)

## 👤 Staubert – stav úloh
(Počet úloh, top 2–3 najdôležitejšie, stav plnenia — vecne a konkrétne)

## 👤 Szabó – stav úloh
(Počet úloh, top 2–3 najdôležitejšie, stav plnenia — vecne a konkrétne)

## ⚠️ Upozornenia a vzory
(Opakujúce sa témy, trendy, veci na sledovanie — nie katastrofy, len relevantné pozorovania)

## 🎯 Top 3 priority na zajtra
(Presne 3 konkrétne akcie vo formáte "KTO: čo urobiť"
Príklad:
- Staubert: Dokončiť drawer UX pre mobile
- Szabó: Otestovať AI report na reálnych dátach
- Obaja: Review otvorených úloh starších ako 14 dní)

## ⚙️ Stav systému
(Stručné hodnotenie — každý komponent na jeden riadok:
- Dashboard: ...
- Workflow: ...
- AI systém: ...
- Organizácia projektu: ...)

## 🗣 Komunikačný briefing
(Vyhodnoť kvalitu komunikácie a workflow na základe záznamov:
- Bola komunikácia prehľadná alebo vznikal chaos?
- Sú rozhodnutia jasne zaznamenané?
- Strácajú sa úlohy alebo sú pod kontrolou?
- Komunikuje tím efektívne?
Tón: profesionálny, psychologicky vyvážený, podporujúci spoluprácu — nie kritizujúci ľudí osobne.
Max 3–4 vety.)

## 💡 Odporúčanie
(1–2 vety: jedno konkrétne strategické odporúčanie pre najbližší týždeň)

## 📈 STRIKER Project Score
(Číslo 0–100 a 2–3 vety: čo skóre zvyšuje, čo ho znižuje, čo by ho posunulo vyššie.
Aktívny projekt s pravidelnými záznamami = 60–80+)

## 🧭 Stav projektu
(Jedna veta — výber z: "Projekt napreduje štandardne / Projekt je v dobrej kondícii / Projekt vyžaduje pozornosť v oblasti X / Projekt vyžaduje zásah")`;

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
