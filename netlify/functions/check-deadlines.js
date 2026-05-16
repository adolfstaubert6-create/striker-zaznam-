// STRIKER – check-deadlines.js
// GET /.netlify/functions/check-deadlines?token=CRON_SECRET
// Cron: every day 08:00 (cron-job.org)
//
// Logic:
//   1. Load all zaznam + task_status
//   2. Find records older than N days with still-open tasks
//   3. Find records with non-empty problem field
//   4. Post alert to chat (once per day)

const { sbGet, postAgentMessage, alreadySent, authCron } = require('./_sb');

const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

// Days threshold: normal tasks overdue after 7d, critical (problem set) after 2d
const NORMAL_DAYS  = 7;
const PROBLEM_DAYS = 2;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (!authCron(event)) return { statusCode: 401, body: 'Unauthorized' };

  const today    = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Duplicate guard
  try {
    if (await alreadySent('deadline_alert')) {
      console.log('[check-deadlines] already sent today');
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ status: 'already_sent' }) };
    }
  } catch(e) { console.warn('[check-deadlines] duplicate check failed:', e.message); }

  // Load zaznam + task_status
  let zaznam = [], taskStatus = [];
  try {
    [zaznam, taskStatus] = await Promise.all([
      sbGet('/rest/v1/zaznam?select=id,datum,co_sa_riesilo,ulohy_staubert,ulohy_szabo,ulohy_splnene,problem,kategoria&order=datum.asc&limit=500'),
      sbGet('/rest/v1/task_status?done=eq.true&select=record_id,field,task_index')
    ]);
  } catch(e) {
    console.error('[check-deadlines] load error:', e.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }

  // Build done-task lookup: "recordId__field__idx" → true
  const doneSet = new Set();
  taskStatus.forEach(t => doneSet.add(`${t.record_id}__${t.field}__${t.task_index}`));

  const alerts = [];

  zaznam.forEach(r => {
    if (!r.datum) return;
    const recDate  = new Date(r.datum);
    const ageDays  = Math.floor((today - recDate) / 86400000);
    const hasProblem = r.problem && r.problem.trim().length > 0;
    const threshold  = hasProblem ? PROBLEM_DAYS : NORMAL_DAYS;
    if (ageDays < threshold) return;

    // Count open tasks per person
    const openSt = (r.ulohy_staubert || []).filter((_, i) => !doneSet.has(`${r.id}__ulohy_staubert__${i}`));
    const openSz = (r.ulohy_szabo    || []).filter((_, i) => !doneSet.has(`${r.id}__ulohy_szabo__${i}`));

    if (!openSt.length && !openSz.length) return;

    const title = r.co_sa_riesilo || `Záznam #${r.id}`;
    if (openSt.length) {
      alerts.push({ title, person: 'Staubert', tasks: openSt, ageDays, datum: r.datum, isCrit: hasProblem });
    }
    if (openSz.length) {
      alerts.push({ title, person: 'Szabó', tasks: openSz, ageDays, datum: r.datum, isCrit: hasProblem });
    }
  });

  if (!alerts.length) {
    console.log('[check-deadlines] no overdue tasks');
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ status: 'ok', alerts: 0 }) };
  }

  // Format message (max 10 alerts to keep it readable)
  const shown = alerts.slice(0, 10);
  const lines = shown.map(a => {
    const icon = a.isCrit ? '🔴' : '⚠️';
    const taskList = a.tasks.slice(0, 3).map(t => `• ${t}`).join('\n');
    return `${icon} ${a.person} – "${a.title}" (${a.ageDays} dní bez aktivity, záznam z ${a.datum}):\n${taskList}${a.tasks.length > 3 ? `\n  ...a ${a.tasks.length - 3} ďalšie` : ''}`;
  });

  const extra = alerts.length > 10 ? `\n\n+${alerts.length - 10} ďalších záznamov.` : '';
  const text  = `⚠️ UPOZORNENIE – Nesplnené úlohy (${alerts.length} záznam${alerts.length > 1 ? 'ov' : ''}) k ${todayStr}:\n\n${lines.join('\n\n')}${extra}`;

  try {
    await postAgentMessage(text, 'critical', 'deadline_alert');
    console.log(`[check-deadlines] sent ${alerts.length} alerts`);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ status: 'sent', alerts: alerts.length }) };
  } catch(e) {
    console.error('[check-deadlines] post error:', e.message);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
