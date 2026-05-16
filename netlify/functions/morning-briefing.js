// STRIKER – morning-briefing.js
// GET /.netlify/functions/morning-briefing?token=CRON_SECRET
// Cron: every day 08:00 (cron-job.org)
//
// Logic:
//   1. Load zaznam + task_status
//   2. Count open/done tasks per person
//   3. Find critical records (problem field set)
//   4. Call Claude for a friendly morning briefing
//   5. Post to chat (once per day)

const { sbGet, postAgentMessage, alreadySent, authCron, callClaude } = require('./_sb');

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (!authCron(event)) return { statusCode: 401, body: 'Unauthorized' };

  const todayStr = new Date().toISOString().slice(0, 10);

  // Duplicate guard
  try {
    if (await alreadySent('morning_briefing')) {
      console.log('[morning-briefing] already sent today');
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ status: 'already_sent' }) };
    }
  } catch(e) { console.warn('[morning-briefing] duplicate check failed:', e.message); }

  // Load data
  let zaznam = [], taskStatus = [];
  try {
    [zaznam, taskStatus] = await Promise.all([
      sbGet('/rest/v1/zaznam?select=id,datum,co_sa_riesilo,ulohy_staubert,ulohy_szabo,ulohy_splnene,problem,kategoria&order=created_at.desc&limit=300'),
      sbGet('/rest/v1/task_status?done=eq.true&select=record_id,field,task_index')
    ]);
  } catch(e) {
    console.error('[morning-briefing] load error:', e.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }

  // Build done-task lookup
  const doneSet = new Set();
  taskStatus.forEach(t => doneSet.add(`${t.record_id}__${t.field}__${t.task_index}`));

  let stOpen = 0, szOpen = 0, stDone = 0, szDone = 0;
  let criticalItems = [];
  const urgentTasks = [];

  zaznam.forEach(r => {
    const rId = String(r.id);

    (r.ulohy_staubert || []).forEach((task, i) => {
      if (doneSet.has(`${rId}__ulohy_staubert__${i}`)) stDone++;
      else { stOpen++; if (r.problem) urgentTasks.push(`Staubert: ${task}`); }
    });
    (r.ulohy_szabo || []).forEach((task, i) => {
      if (doneSet.has(`${rId}__ulohy_szabo__${i}`)) szDone++;
      else { szOpen++; if (r.problem) urgentTasks.push(`Szabó: ${task}`); }
    });

    if (r.problem && r.problem.trim()) {
      criticalItems.push({ title: r.co_sa_riesilo || `#${r.id}`, problem: r.problem });
    }
  });

  const totalOpen = stOpen + szOpen;
  const totalDone = stDone + szDone;

  // Build context for Claude
  const dayNames = ['nedeľa','pondelok','utorok','streda','štvrtok','piatok','sobota'];
  const dayName  = dayNames[new Date().getDay()];
  const urgentSample = urgentTasks.slice(0, 5).join('\n');
  const critSample   = criticalItems.slice(0, 3).map(c => `${c.title}: ${c.problem}`).join('\n');

  const stats = [
    `Dnes: ${todayStr} (${dayName})`,
    `Otvorené úlohy: ${totalOpen} (Staubert: ${stOpen}, Szabó: ${szOpen})`,
    `Splnené úlohy: ${totalDone}`,
    `Kritické záznamy: ${criticalItems.length}`,
    urgentSample ? `\nÚlohy v kritických záznamoch:\n${urgentSample}` : '',
    critSample   ? `\nKritické problémy:\n${critSample}` : ''
  ].filter(Boolean).join('\n');

  let text;
  try {
    text = await callClaude(
      'Si AI asistent systému STRIKER pre tím Staubert & Szabó. ' +
      'Generuješ krátke ranné brífingy (max 10 viet) v slovenčine. ' +
      'Tón: profesionálny, priamy, bez zbytočného fluff. ' +
      'Používaj emoji: ☀️ pre úvod, 📋 pre úlohy, 🔴 pre kritické, 📅 pre termíny. ' +
      'Vždy zakonči konkrétnou výzvou na akciu.',
      `Vygeneruj ranné zhrnutie pre tím na základe týchto dát:\n\n${stats}\n\n` +
      `Formát:\n☀️ Dobré ráno! [deň] ${todayStr}\n[zhrnutie stavu]\n[urgentné ak sú]\n[výzva k akcii]`
    );
  } catch(e) {
    console.warn('[morning-briefing] Claude failed, using fallback:', e.message);
    const urgLine = urgentTasks.length
      ? `⚡ Pozor na: ${urgentTasks.slice(0,3).join(' | ')}`
      : '';
    text = [
      `☀️ Dobré ráno! ${dayName.charAt(0).toUpperCase() + dayName.slice(1)} ${todayStr}`,
      `📋 Otvorené úlohy: ${totalOpen} (Staubert: ${stOpen}, Szabó: ${szOpen})`,
      `✅ Splnené celkom: ${totalDone}`,
      criticalItems.length ? `🔴 Kritické záznamy: ${criticalItems.length}` : '',
      urgLine
    ].filter(Boolean).join('\n');
  }

  try {
    await postAgentMessage(text, 'ai_note', 'morning_briefing');
    console.log('[morning-briefing] sent:', { stOpen, szOpen, totalDone, critical: criticalItems.length });
    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({ status: 'sent', stOpen, szOpen, totalDone, critical: criticalItems.length })
    };
  } catch(e) {
    console.error('[morning-briefing] post error:', e.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
