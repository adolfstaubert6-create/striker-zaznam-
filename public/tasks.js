// ── STRIKER tasks.js ──
// Task status logika — Supabase upsert
// Závisí na: SUPABASE_URL, SUPABASE_KEY (app.js)

// ── TASK STATUS (Supabase) ──
let taskStatusMap = {};

function getTaskDone(rid, field, i) {
  const key = `${rid}__${field}__${i}`;
  return taskStatusMap[key] === true;
}

async function setTaskDone(rid, field, i, done) {
  const key = `${rid}__${field}__${i}`;
  taskStatusMap[key] = done;
  console.log('TASK UPSERT START', {rid:String(rid), field:String(field), i:Number(i), done:Boolean(done)});
  try {
    const body = JSON.stringify({
      record_id: String(rid),
      field: String(field),
      task_index: Number(i),
      done: Boolean(done),
      updated_at: new Date().toISOString(),
      updated_by: 'user'
    });
    const res = await fetch(`${SUPABASE_URL}/rest/v1/task_status?on_conflict=record_id,field,task_index`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation'
      },
      body: body
    });
    const txt = await res.text();
    console.log('TASK UPSERT RESULT:', res.status, res.statusText, txt);
    if(!res.ok) throw new Error(txt||'TASK UPSERT FAILED');
  } catch(e) { console.error('setTaskDone fetch error:', e); }
}

async function loadTaskStatus() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/task_status?select=record_id,field,task_index,done`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const data = await res.json();
    if (Array.isArray(data)) {
      data.forEach(row => {
        taskStatusMap[`${row.record_id}__${row.field}__${row.task_index}`] = row.done;
      });
    }
  } catch(e) { console.error('loadTaskStatus error:', e); }
}
