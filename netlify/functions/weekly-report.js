// STRIKER – weekly-report.js
// GET /.netlify/functions/weekly-report?token=CRON_SECRET
// Cron: every Friday 17:00 (cron-job.org)
//
// Logic:
//   1. Find Monday–Friday of current week
//   2. Load task_status updated this week (done=true)
//   3. Load zaznam to get task text for each completed entry
//   4. Count open tasks remaining
//   5. Call Claude for weekly report
//   6. Post to chat (once per week)

const { sbGet, postAgentMessage, alreadySent, authCron, callClaude } = require('./_sb');

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

function getWeekBounds() {
  const now    = new Date();
  const day    = now.getDay(); // 0=Sun..6=Sat
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);
  return {
    monStr: monday.toISOString().slice(0, 10),
    friStr: friday.toISOString().slice(0, 10),
    monISO: monday.toISOString(),
    friISO: friday.toISOString()
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (!authCron(event)) return { statusCode: 401, body: 'Unauthorized' };

  const todayStr = new Date().toISOString().slice(0, 10);

  // Duplicate guard (once per calendar week — use Friday date)
  try {
    if (await alreadySent('weekly_report')) {
      console.log('[weekly-report] already sent this week');
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ status: 'already_sent' }) };
    }
  } catch(e) { console.warn('[weekly-report] duplicate check failed:', e.message); }

  const { monStr, friStr, monISO, friISO } = getWeekBounds();

  // Load this week's completed task_status entries
  let completedThisWeek = [], allZaznam = [], allTaskStatus = [];
  try {
    [completedThisWeek, allZaznam, allTaskStatus] = await Promise.all([
      sbGet(`/rest/v1/task_status?done=eq.true&updated_at=gte.${encodeURIComponent(monISO)}&updated_at=lte.${encodeURIComponent(friISO)}&select=record_id,field,task_index,updated_at`),
      sbGet('/rest/v1/zaznam?select=id,datum,co_sa_riesilo,ulohy_staubert,ulohy_szabo,ulohy_splnene,problem,kategoria&order=created_at.desc&limit=300'),
      sbGet('/rest/v1/task_status?done=eq.true&select=record_id,field,task_index')
    ]);
  } catch(e) {
    console.error('[weekly-report] load error:', e.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }

  // Build zaznam lookup map
  const zaznamMap = {};
  allZaznam.forEach(r => { zaznamMap[String(r.id)] = r; });

  // Build done set (all time) for open task count
  const doneSet = new Set();
  allTaskStatus.forEach(t => doneSet.add(`${t.record_id}__${t.field}__${t.task_index}`));

  // Resolve completed tasks this week to their text
  let stDoneCount = 0, szDoneCount = 0;
  const completedDetails = [];
  const catCounts = {};

  completedThisWeek.forEach(ts => {
    const r = zaznamMap[ts.record_id];
    if (!r) return;
    const arr  = r[ts.field] || [];
    const task = arr[ts.task_index];
    if (!task) return;

    const person = ts.field === 'ulohy_staubert' ? 'Staubert' : 'Szabó';
    if (person === 'Staubert') stDoneCount++; else szDoneCount++;
    completedDetails.push({ person, task, kategoria: r.kategoria || 'Iné' });
    catCounts[r.kategoria || 'Iné'] = (catCounts[r.kategoria || 'Iné'] || 0) + 1;
  });

  // Count still-open tasks
  let stOpen = 0, szOpen = 0;
  allZaznam.forEach(r => {
    const rId = String(r.id);
    (r.ulohy_staubert || []).forEach((_, i) => { if (!doneSet.has(`${rId}__ulohy_staubert__${i}`)) stOpen++; });
    (r.ulohy_szabo    || []).forEach((_, i) => { if (!doneSet.has(`${rId}__ulohy_szabo__${i}`)) szOpen++; });
  });

  const totalDone = stDoneCount + szDoneCount;
  const topCat   = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  const champion = stDoneCount >= szDoneCount ? `Staubert (${stDoneCount})` : `Szabó (${szDoneCount})`;

  // Sample of completed tasks for Claude context
  const completedSample = completedDetails.slice(0, 8).map(c => `${c.person}: ${c.task}`).join('\n');

  const stats = [
    `Týždeň: ${monStr} – ${friStr}`,
    `Splnené úlohy: ${totalDone} (Staubert: ${stDoneCount}, Szabó: ${szDoneCount})`,
    `Stále otvorené: ${stOpen + szOpen} (Staubert: ${stOpen}, Szabó: ${szOpen})`,
    `Najaktívnejší: ${champion}`,
    `Najčastejšia kategória: ${topCat}`,
    completedSample ? `\nPríklady splnených úloh:\n${completedSample}` : '\nŽiadne splnené úlohy tento týždeň.'
  ].join('\n');

  let text;
  try {
    text = await callClaude(
      'Si AI asistent systému STRIKER pre tím Staubert & Szabó. ' +
      'Generuješ týždenné reporty (max 15 viet) v slovenčine. ' +
      'Tón: profesionálny, analytický, konštruktívny. ' +
      'Emoji: 📊 header, ✅ splnené, ❌ nesplnené, 🏆 champion, 📁 kategória, ⚠️ bottleneck.',
      `Vygeneruj týždenný report na základe dát:\n\n${stats}\n\n` +
      `Formát:\n📊 TÝŽDENNÝ REPORT ${monStr} – ${friStr}\n` +
      `✅ Splnené: ${totalDone} (Staubert: ${stDoneCount}, Szabó: ${szDoneCount})\n` +
      `❌ Nesplnené: ${stOpen + szOpen}\n` +
      `🏆 Najaktívnejší: ${champion}\n` +
      `📁 Kategória: ${topCat}\n` +
      `[pridaj krátke zhrnutie týždňa, pochvalu tímu a odporúčanie na ďalší týždeň]`
    );
  } catch(e) {
    console.warn('[weekly-report] Claude failed, using fallback:', e.message);
    text = [
      `📊 TÝŽDENNÝ REPORT ${monStr} – ${friStr}`,
      `✅ Splnené: ${totalDone} (Staubert: ${stDoneCount}, Szabó: ${szDoneCount})`,
      `❌ Nesplnené: ${stOpen + szOpen} (Staubert: ${stOpen}, Szabó: ${szOpen})`,
      `🏆 Najaktívnejší: ${champion}`,
      `📁 Najčastejšia kategória: ${topCat}`,
      totalDone === 0 ? '⚠️ Tento týždeň neboli zaznamenané žiadne splnené úlohy.' :
        `Dobrá práca tímu! Pokračujte v tempe aj budúci týždeň.`
    ].join('\n');
  }

  try {
    await postAgentMessage(text, 'ai_note', 'weekly_report');
    console.log('[weekly-report] sent:', { totalDone, stOpen, szOpen });
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ status: 'sent', week: `${monStr}–${friStr}`, totalDone, open: stOpen + szOpen })
    };
  } catch(e) {
    console.error('[weekly-report] post error:', e.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
