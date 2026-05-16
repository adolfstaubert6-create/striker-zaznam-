// ── STRIKER dashboard.js ──
// Dashboard karty, drawers, panels, open tasks
// Závisí na: allRecords, taskStatusMap, getTaskDone(), setTaskDone(), fmt(), escHtml() (app.js/tasks.js)

// ─── DRAWER ENGINE ───────────────────────────────────────────
function toggleDrawer(drawerId, cardId) {
  const drawer = document.getElementById(drawerId);
  const card = document.getElementById(cardId);
  const isOpen = drawer.classList.contains('open');

  // Close any open drawer first
  if (activeDrawer && activeDrawer !== drawer) {
    activeDrawer.classList.remove('open');
    if (activeCard) activeCard.classList.remove('expanded');
  }

  if (isOpen) {
    drawer.classList.remove('open');
    card.classList.remove('expanded');
    activeDrawer = null;
    activeCard = null;
  } else {
    // Render content before opening
    renderDrawerContent(drawerId);
    drawer.classList.add('open');
    card.classList.add('expanded');
    activeDrawer = drawer;
    activeCard = card;
  }
}

function closeAllDrawers() {
  document.querySelectorAll('.detail-drawer.open').forEach(d => d.classList.remove('open'));
  document.querySelectorAll('.dcard.expanded').forEach(c => c.classList.remove('expanded'));
  activeDrawer = null;
  activeCard = null;
}

function renderDrawerContent(drawerId) {
  const content = document.getElementById(drawerId + 'Content');
  if (!content) return;

  if (drawerId === 'drawerOpen') renderDrawerOpen(content);
  else if (drawerId === 'drawerCrit') renderDrawerCrit(content);
  else if (drawerId === 'drawerToday') renderDrawerToday(content);
  else if (drawerId === 'drawerSt') renderDrawerPerson(content, 'Staubert', 'ulohy_staubert', 'st');
  else if (drawerId === 'drawerSz') renderDrawerPerson(content, 'Szabó', 'ulohy_szabo', 'sz');
  else if (drawerId === 'drawerSys') renderDrawerSys(content);
}

// ─── DRAWER: Otvorené úlohy ──────────────────────────────────
function buildTaskItem(item, showPerson, showSplnit) {
  const pid = `dt_${item.rid}_${item.field}_${item.idx}`;
  const person = showPerson ? `<span class="drawer-task-person ${item.cls}">${item.label}</span>` : '';
  const splnitBtn = showSplnit
    ? `<button class="drawer-splnit-btn" title="Splniť úlohu"
         onclick="event.stopPropagation();splnitUlohu('${item.rid}','${item.field}',${item.idx},decodeURIComponent('${encodeURIComponent(item.text)}'))">✅</button>`
    : '';
  return `<div class="drawer-task ${item.cls}-task" id="${pid}" onclick="toggleDrawerTask(event,'${item.rid}','${item.field}',${item.idx})">
    <span class="drawer-task-icon">❌</span>
    <div style="flex:1;min-width:0">
      <div class="drawer-task-text" id="${pid}_txt" onclick="expandDrawerText(event,'${pid}_txt')">${escHtml(item.text)}</div>
      <div class="drawer-task-from">${escHtml(item.co||'—')} · ${item.datum||'—'}</div>
    </div>
    ${splnitBtn}${person}
  </div>`;
}

function expandDrawerText(e, txtId) {
  e.stopPropagation();
  const el = document.getElementById(txtId);
  if (el) el.classList.toggle('expanded');
}

function renderDrawerOpen(el) {
  const items = [];
  allRecords.forEach(r => {
    [{field:'ulohy_staubert',label:'Staubert',cls:'st'},{field:'ulohy_szabo',label:'Szabó',cls:'sz'}].forEach(f => {
      const arr = r[f.field]; if (!Array.isArray(arr)) return;
      arr.forEach((item, i) => {
        if (!getTaskDone(r.id, f.field, i)) items.push({rid:r.id, field:f.field, idx:i, label:f.label, cls:f.cls, text:item, datum:r.datum, co:r.co_sa_riesilo});
      });
    });
  });

  const stCount = items.filter(i=>i.cls==='st').length;
  const szCount = items.filter(i=>i.cls==='sz').length;
  const total = stCount + szCount;
  const LIMIT = 5;

  let html = `<div class="drawer-stat-row">
    <div class="drawer-stat"><div class="drawer-stat-val" style="color:var(--st)">${stCount}</div><div class="drawer-stat-lbl">Staubert</div></div>
    <div class="drawer-stat"><div class="drawer-stat-val" style="color:var(--sz)">${szCount}</div><div class="drawer-stat-lbl">Szabó</div></div>
    <div class="drawer-stat"><div class="drawer-stat-val" style="color:var(--accent)">${total}</div><div class="drawer-stat-lbl">Celkom</div></div>
  </div>`;

  if (!items.length) {
    html += `<div class="drawer-empty">✅ Všetky úlohy sú splnené!</div>`;
  } else {
    html += `<div class="drawer-section-label">Otvorené úlohy</div><div class="drawer-task-list">`;
    items.slice(0, LIMIT).forEach(item => { html += buildTaskItem(item, true, true); });
    if (items.length > LIMIT) {
      html += `</div><div class="drawer-tasks-hidden" id="drawerOpenExtra"><div class="drawer-task-list" style="margin-top:5px">`;
      items.slice(LIMIT).forEach(item => { html += buildTaskItem(item, true, true); });
      html += `</div></div>
      <button class="drawer-action" id="drawerOpenShowAll" onclick="event.stopPropagation();drawerShowAll('drawerOpenExtra','drawerOpenShowAll',${items.length})">Zobraziť všetky (${items.length}) →</button>`;
    }
    html += items.length <= LIMIT ? `</div>` : ``;
  }
  el.innerHTML = html;
}

function drawerShowAll(extraId, btnId, total) {
  const extra = document.getElementById(extraId);
  const btn = document.getElementById(btnId);
  if (!extra) return;
  extra.classList.add('visible');
  if (btn) btn.style.display = 'none';
}

function toggleDrawerTask(e, rid, field, idx) {
  e.stopPropagation();
  setTaskDone(rid, field, idx, true);
  const el = document.getElementById(`dt_${rid}_${field}_${idx}`);
  if (el) { el.querySelector('.drawer-task-icon').textContent='✅'; el.style.opacity='0.4'; el.style.pointerEvents='none'; }
  updateDashboard();
  setTimeout(() => {
    if (activeDrawer) renderDrawerContent(activeDrawer.id);
  }, 400);
}

// ─── DRAWER: Kritické body ───────────────────────────────────
function renderDrawerCrit(el) {
  const crits = allRecords.filter(r => r.problem && r.problem.trim() !== '');
  if (!crits.length) {
    el.innerHTML = `<div class="drawer-empty" style="color:var(--ok)">✅ Žiadne kritické problémy!</div>`; return;
  }
  let html = `<div class="drawer-section-label">Záznamy s problémom (${crits.length})</div><div class="drawer-crit-list">`;
  crits.slice(0, 5).forEach(r => {
    html += `<div class="drawer-crit-item" onclick="event.stopPropagation();openDetailFromDash(${JSON.stringify(r.id)});" style="cursor:pointer">
      <div class="drawer-crit-item-date">${r.datum||'—'}</div>
      <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:3px">${escHtml(r.co_sa_riesilo||'—')}</div>
      <div class="drawer-crit-item-text">⚠️ ${escHtml(r.problem)}</div>
    </div>`;
  });
  html += `</div>`;
  if (crits.length > 5) html += `<button class="drawer-action danger" onclick="event.stopPropagation();showTab('history',document.querySelectorAll('.tab')[2])">Zobraziť všetky v histórii →</button>`;
  el.innerHTML = html;
}

// ─── DRAWER: Dnešná aktivita ─────────────────────────────────
function renderDrawerToday(el) {
  const today = new Date().toISOString().slice(0,10);
  const todayRecs = allRecords.filter(r => r.created_at && r.created_at.slice(0,10) === today);

  let html = `<div class="drawer-stat-row">
    <div class="drawer-stat"><div class="drawer-stat-val" style="color:var(--ok)">${todayRecs.length}</div><div class="drawer-stat-lbl">Dnes</div></div>
    <div class="drawer-stat"><div class="drawer-stat-val" style="color:var(--text)">${allRecords.length}</div><div class="drawer-stat-lbl">Celkom</div></div>
  </div>`;

  if (!todayRecs.length) {
    html += `<div class="drawer-empty">Dnes žiadna aktivita</div>`;
  } else {
    html += `<div class="drawer-section-label">Dnešné záznamy</div><div class="drawer-today-list">`;
    todayRecs.forEach(r => {
      const time = r.created_at ? fmt(r.created_at).split(' – ')[1] : '—';
      html += `<div class="drawer-today-item" onclick="event.stopPropagation();openDetailFromDash('${r.id}')">
        <div class="drawer-today-time">${time}</div>
        <div class="drawer-today-title">${escHtml(r.co_sa_riesilo||'—')}</div>
      </div>`;
    });
    html += `</div>`;
  }
  el.innerHTML = html;
}

// ─── DRAWER: Osobné karty (Staubert / Szabó) ────────────────
function renderDrawerPerson(el, name, field, cls) {
  const items = [];
  allRecords.forEach(r => {
    const arr = r[field]; if (!Array.isArray(arr)) return;
    arr.forEach((item, i) => {
      if (!getTaskDone(r.id, field, i)) items.push({rid:r.id, field, idx:i, cls, text:item, datum:r.datum, co:r.co_sa_riesilo});
    });
  });

  const done = allRecords.reduce((acc, r) => {
    const arr = r[field]; if (!Array.isArray(arr)) return acc;
    return acc + arr.filter((_,i) => getTaskDone(r.id,field,i)).length;
  }, 0);
  const total = items.length + done;
  const pct = total > 0 ? Math.round(done/total*100) : 100;
  const color = cls === 'st' ? 'var(--st)' : 'var(--sz)';
  const drawerId = cls === 'st' ? 'drawerStExtra' : 'drawerSzExtra';
  const btnId = cls === 'st' ? 'drawerStShowAll' : 'drawerSzShowAll';
  const LIMIT = 5;

  const completedId = `completedList_${cls}`;

  let html = `<div class="drawer-stat-row">
    <div class="drawer-stat"><div class="drawer-stat-val" style="color:${color}">${items.length}</div><div class="drawer-stat-lbl">Otvorené</div></div>
    <div class="drawer-stat drawer-hotove-stat" id="hotoveBtn_${cls}" style="cursor:pointer">
      <div class="drawer-stat-val" style="color:var(--ok)">${done}</div>
      <div class="drawer-stat-lbl">Hotové ↗</div>
    </div>
    <div class="drawer-stat"><div class="drawer-stat-val" style="color:var(--muted)">${pct}%</div><div class="drawer-stat-lbl">Splnené</div></div>
  </div>
  <div class="drawer-progress-bar"><div class="drawer-progress-fill" style="width:${pct}%;background:${color}"></div></div>`;

  if (!items.length) {
    html += `<div class="drawer-empty" style="margin-top:12px">✅ ${name} nemá žiadne otvorené úlohy!</div>`;
  } else {
    html += `<div class="drawer-section-label" style="margin-top:12px">Otvorené úlohy</div><div class="drawer-task-list">`;
    items.slice(0, LIMIT).forEach(item => { html += buildTaskItem(item, false, true); });
    if (items.length > LIMIT) {
      html += `</div><div class="drawer-tasks-hidden" id="${drawerId}"><div class="drawer-task-list" style="margin-top:5px">`;
      items.slice(LIMIT).forEach(item => { html += buildTaskItem(item, false, true); });
      html += `</div></div>
      <button class="drawer-action" id="${btnId}" onclick="event.stopPropagation();drawerShowAll('${drawerId}','${btnId}',${items.length})">Zobraziť všetky (${items.length}) →</button>`;
    }
    html += items.length <= LIMIT ? `</div>` : ``;
  }
  el.innerHTML = html;

  // Bind HOTOVÉ click via addEventListener — immune to global-scope timing issues
  const hotoveBtn = document.getElementById(`hotoveBtn_${cls}`);
  if (hotoveBtn) {
    hotoveBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      window.openHistoryModal(cls);
    });
  }
}

// ─── DRAWER: Stav systému ────────────────────────────────────
function renderDrawerSys(el) {
  const isPWA = window.matchMedia('(display-mode: standalone)').matches;
  const dbOk = document.getElementById('sysDB').textContent === 'OK';
  const total = allRecords.length;
  const today = new Date().toISOString().slice(0,10);
  const todayCount = allRecords.filter(r => r.created_at && r.created_at.slice(0,10) === today).length;

  const row = (name, val, ok) => `<div class="sys-line" style="padding:6px 0;border-bottom:1px solid var(--border)">
    <span class="sys-line-name">${name}</span>
    <span class="sys-line-val ${ok ? 'ok' : 'err'}">${val}</span>
  </div>`;

  el.innerHTML = `
    <div class="drawer-section-label">Detaily systému</div>
    <div style="display:flex;flex-direction:column;gap:0">
      ${row('Supabase DB', dbOk ? 'Pripojená' : 'Odpojená', dbOk)}
      ${row('AI Claude', 'Online', true)}
      ${row('PWA režim', isPWA ? 'Aktívne' : 'Browser', isPWA)}
      ${row('Celkom záznamov', total, true)}
      ${row('Dnes pridaných', todayCount, true)}
      ${row('localStorage', (() => { try { localStorage.setItem('_t','1'); localStorage.removeItem('_t'); return true; } catch(e) { return false; } })() ? 'Dostupný' : 'Nedostupný', true)}
    </div>`;
}

// Helper: open detail from dashboard
function openDetailFromDash(id) {
  const r = allRecords.find(rec => rec.id === id);
  if (!r) return;
  closeAllDrawers();
  openDetail(r);
  document.querySelectorAll('.tab').forEach((t,i) => { t.classList.remove('active'); if(i===2) t.classList.add('active'); });
}

// ── DASHBOARD ──
function updateDashboard(){
  const total=allRecords.length;
  document.getElementById('sysTotal').textContent=total;

  let stOpen=0,szOpen=0;
  allRecords.forEach(r=>{
    if(Array.isArray(r.ulohy_staubert))r.ulohy_staubert.forEach((_,i)=>{if(!getTaskDone(r.id,'ulohy_staubert',i))stOpen++;});
    if(Array.isArray(r.ulohy_szabo))r.ulohy_szabo.forEach((_,i)=>{if(!getTaskDone(r.id,'ulohy_szabo',i))szOpen++;});
  });
  const openTotal=stOpen+szOpen;
  document.getElementById('dOpenTotal').textContent=openTotal;
  document.getElementById('dOpenSub').textContent=`Staubert: ${stOpen}  ·  Szabó: ${szOpen}`;
  document.getElementById('dStVal').textContent=stOpen;
  document.getElementById('dSzVal').textContent=szOpen;
  document.getElementById('dStSub').textContent=stOpen===0?'všetky splnené':'otvorených úloh';
  document.getElementById('dSzSub').textContent=szOpen===0?'všetky splnené':'otvorených úloh';

  let stDone=0,szDone=0;
  allRecords.forEach(r=>{
    const s=r.ulohy_splnene||{};
    if(Array.isArray(r.ulohy_staubert))r.ulohy_staubert.forEach(t=>{if(s[t])stDone++;});
    if(Array.isArray(r.ulohy_szabo))r.ulohy_szabo.forEach(t=>{if(s[t])szDone++;});
  });
  const elStH=document.getElementById('dStHotove');
  const elSzH=document.getElementById('dSzHotove');
  if(elStH)elStH.textContent=stDone;
  if(elSzH)elSzH.textContent=szDone;
  const tot=stOpen+szOpen||1;
  document.getElementById('dSplitSt').style.width=Math.round(stOpen/tot*100)+'%';

  const crit=allRecords.filter(r=>r.problem&&r.problem.trim()!=='').length;
  document.getElementById('dCritVal').textContent=crit;
  document.getElementById('dCritSub').textContent=crit===0?'žiadne problémy':'záznamov s problémom';
  document.getElementById('cardCrit').style.borderColor=crit>0?'rgba(255,69,0,.35)':'rgba(255,69,0,.12)';

  const today=new Date().toISOString().slice(0,10);
  const todayRecs=allRecords.filter(r=>r.created_at&&r.created_at.slice(0,10)===today);
  document.getElementById('dTodayVal').textContent=todayRecs.length;
  document.getElementById('dTodaySub').textContent=todayRecs.length>0?'posledná: '+fmt(todayRecs[0].created_at).split(' – ')[1]:'dnes žiadna aktivita';

  if(lastReportTime){
    document.getElementById('dReportVal').textContent=lastReportTime;
    document.getElementById('dReportSub').textContent=`${allRecords.length} záznamov analyzovaných`;
  }

  const isPWA=window.matchMedia('(display-mode: standalone)').matches;
  document.getElementById('sysPWA').textContent=isPWA?'Aktívne':'Browser';
  document.getElementById('sysPWA').className='sys-line-val '+(isPWA?'ok':'dim');
  document.getElementById('dotPWA').className='sys-dot'+(isPWA?'':' dim');

  // Re-render open drawers with fresh data
  if (activeDrawer) renderDrawerContent(activeDrawer.id);
}

// ── COMPLETED TASKS POPUP ────────────────────────────────────
function toggleCompletedList(id, field) {
  const el = document.getElementById(id);
  if (!el) return;
  const opening = !el.classList.contains('open');
  el.classList.toggle('open', opening);
  if (opening) el.innerHTML = buildCompletedList(field, id);
}

function buildCompletedList(field, containerId) {
  const completed = [];
  allRecords.forEach(r => {
    const arr = r[field];
    const splnene = r.ulohy_splnene || {};
    if (!Array.isArray(arr)) return;
    arr.forEach(task => {
      const meta = splnene[task];
      if (!meta) return;
      const iso = typeof meta === 'string' ? meta : (meta.date || '');
      completed.push({ rid: r.id, text: task, iso });
    });
  });

  if (!completed.length) return '<div class="drawer-completed-empty">Žiadne splnené úlohy</div>';

  completed.sort((a, b) => b.iso.localeCompare(a.iso));
  return completed.map(c => {
    const isoStr = typeof c.iso === 'object' ? (c.iso.date || '') : c.iso;
    const d = new Date(isoStr);
    const dateStr = isNaN(d) ? isoStr
      : `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
    const enc = encodeURIComponent(c.text);
    return `<div class="drawer-completed-item">
      <span>✅</span>
      <span class="drawer-completed-text" title="${escHtml(c.text)}">${escHtml(c.text)}</span>
      <span class="drawer-completed-sep"> · </span>
      <span class="drawer-completed-date">${dateStr}</span>
      <button class="drawer-completed-del" title="Odstrániť"
        onclick="event.stopPropagation();removeCompletedTask('${c.rid}',decodeURIComponent('${enc}'),'${containerId}','${field}')">🗑️</button>
    </div>`;
  }).join('');
}

async function removeCompletedTask(rid, taskText, containerId, field) {
  const record = allRecords.find(r => r.id === rid);
  if (!record) return;

  const splnene = Object.assign({}, record.ulohy_splnene || {});
  delete splnene[taskText];

  try {
    const { data: { session } } = await window._supabase.auth.getSession();
    const token = session?.access_token || SUPABASE_KEY;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/zaznam?id=eq.${encodeURIComponent(rid)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ulohy_splnene: splnene })
    });
    if (res.ok) {
      record.ulohy_splnene = splnene;
      // Refresh completed list in-place — list stays open, counts update
      const listEl = document.getElementById(containerId);
      if (listEl) listEl.innerHTML = buildCompletedList(field, containerId);
      updateDashboard();
    }
  } catch(e) { console.error('[remove-splnit]', e); }
}

async function splnitUlohu(rid, field, idx, taskText) {
  // Mark done via existing task_status mechanism
  setTaskDone(rid, field, idx, true);

  // Update task row visually
  const taskEl = document.getElementById(`dt_${rid}_${field}_${idx}`);
  if (taskEl) {
    taskEl.querySelector('.drawer-task-icon').textContent = '✅';
    taskEl.style.opacity = '0.4';
    taskEl.style.pointerEvents = 'none';
  }

  // Persist completion metadata to ulohy_splnene on the zaznam record
  const record = allRecords.find(r => r.id === rid);
  if (!record) return;

  const now = new Date();
  const splnene = Object.assign({}, record.ulohy_splnene || {});
  let source = 'Manuálne';
  if (Array.isArray(record.tagy)) {
    if (record.tagy.includes('chat')) source = 'AI Chat';
    else if (record.tagy.includes('komunikacia') || record.tagy.includes('komunikácia')) source = 'Komunikácia';
  }
  splnene[taskText] = {
    date: now.toISOString().slice(0, 10),
    time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
    priority: 'Normálna',
    category: record.kategoria || '—',
    source,
    description: ''
  };

  try {
    const { data: { session } } = await window._supabase.auth.getSession();
    const token = session?.access_token || SUPABASE_KEY;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/zaznam?id=eq.${encodeURIComponent(rid)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ulohy_splnene: splnene })
    });
    if (res.ok) {
      record.ulohy_splnene = splnene;
      setTimeout(() => { updateDashboard(); if (activeDrawer) renderDrawerContent(activeDrawer.id); }, 350);
    }
  } catch(e) { console.error('[splnit]', e); }
}

function setDBStatus(ok){
  document.getElementById('dotDB').className='sys-dot'+(ok?'':' err');
  document.getElementById('lblDB').textContent=ok?'DB':'ERR';
  document.getElementById('sysDB').textContent=ok?'OK':'CHYBA';
  document.getElementById('sysDB').className='sys-line-val '+(ok?'ok':'err');
}

// ── PANELS ──
function hideAllPanels(){['dashboardPanel','newPanel','historyPanel','detailPanel','reportPanel','strategicPanel','consultPanel','consultHistoryPanel','openTasksPanel','chatPanel'].forEach(id=>document.getElementById(id).style.display='none');}
function showTab(tab,el){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  hideAllPanels();
  if(tab==='dashboard'){document.getElementById('dashboardPanel').style.display='block';}
  else if(tab==='new'){document.getElementById('newPanel').style.display='block';}
  else if(tab==='history'){document.getElementById('historyPanel').style.display='block';loadHistory();}
  else if(tab==='chat'){document.getElementById('chatPanel').style.display='block';if(typeof icInit==='function')icInit();}
}
function goBack(){currentDetail=null;hideAllPanels();document.getElementById('historyPanel').style.display='block';document.querySelectorAll('.tab').forEach((t,i)=>{t.classList.remove('active');if(i===2)t.classList.add('active');});}
function goBackFromReport(){hideAllPanels();document.getElementById('historyPanel').style.display='block';document.querySelectorAll('.tab').forEach((t,i)=>{t.classList.remove('active');if(i===2)t.classList.add('active');});}
function goBackFromOpenTasks(){hideAllPanels();document.getElementById('historyPanel').style.display='block';document.querySelectorAll('.tab').forEach((t,i)=>{t.classList.remove('active');if(i===2)t.classList.add('active');});}
function showOpenTasksFromDash(){
  if(!allRecords.length){showToast('Najprv načítaj históriu');return;}
  closeAllDrawers();
  hideAllPanels();document.getElementById('openTasksPanel').style.display='block';
  document.querySelectorAll('.tab').forEach((t,i)=>{t.classList.remove('active');if(i===2)t.classList.add('active');});
  renderOpenTasks();
}

// ── OPEN TASKS ──
function showOpenTasks(){
  if(!allRecords.length){showToast('Najprv načítaj históriu');return;}
  hideAllPanels();document.getElementById('openTasksPanel').style.display='block';
  renderOpenTasks();
}
function renderOpenTasks(){
  const list=document.getElementById('openTasksList');list.innerHTML='';
  const items=[];
  allRecords.forEach(r=>{
    [{field:'ulohy_staubert',label:'Staubert'},{field:'ulohy_szabo',label:'Szabó'}].forEach(f=>{
      const arr=r[f.field];if(!Array.isArray(arr))return;
      arr.forEach((item,i)=>{if(!getTaskDone(r.id,f.field,i))items.push({rid:r.id,field:f.field,idx:i,label:f.label,text:item,datum:r.datum,ca:r.created_at,co:r.co_sa_riesilo});});
    });
  });
  document.getElementById('openTasksCount').textContent=`${items.length} otvorených`;
  if(!items.length){list.innerHTML='<div class="no-records">✅ Všetky úlohy sú splnené!</div>';return;}
  items.forEach(item=>{
    const isSt=item.label==='Staubert';
    const div=document.createElement('div');
    div.className='open-task-item '+(isSt?'st-task':'sz-task');
    div.innerHTML=`<span class="open-task-icon">❌</span><div class="open-task-body"><div class="open-task-text">${escHtml(item.text)}</div><div class="open-task-meta"><span class="open-task-kto ${isSt?'staubert':'szabo'}">${item.label}</span><span>${item.datum||'—'}</span></div><div class="open-task-zaznam">${escHtml(item.co||'—')}</div></div>`;
    div.addEventListener('click',()=>{
      setTaskDone(item.rid,item.field,item.idx,true);
      div.querySelector('.open-task-icon').textContent='✅';div.classList.add('hotove');
      setTimeout(()=>{div.remove();const z=document.querySelectorAll('.open-task-item:not(.hotove)').length;document.getElementById('openTasksCount').textContent=`${z} otvorených`;if(z===0)list.innerHTML='<div class="no-records">✅ Všetky úlohy sú splnené!</div>';updateDashboard();},500);
    });
    list.appendChild(div);
  });
}

// ── HISTÓRIA HOTOVÝCH ÚLOH MODAL ─────────────────────────────
let hmCurrentField = 'ulohy_staubert';
let hmAllTasks = [];

window.openHistoryModal = function(person) {
  // Show modal immediately — nothing can block this
  const modal = document.getElementById('taskHistoryModal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  try {
    hmCurrentField = person === 'st' ? 'ulohy_staubert' : 'ulohy_szabo';
    const name = person === 'st' ? 'Staubert' : 'Szabó';
    const titleEl = document.getElementById('hmTitle');
    if (titleEl) titleEl.textContent = `História – ${name}`;
    hmClearFilters();
    hmCollectTasks();
    hmApplyFilters();
  } catch(e) {
    console.error('[openHistoryModal]', e);
    const body = document.getElementById('hmBody');
    if (body) body.innerHTML = '<div style="color:#666;font-family:monospace;padding:40px;text-align:center">Chyba pri načítaní: ' + e.message + '</div>';
  }
};

window.closeHistoryModal = function closeHistoryModal() {
  document.getElementById('taskHistoryModal').style.display = 'none';
  document.body.style.overflow = '';
};

function hmCollectTasks() {
  hmAllTasks = [];
  allRecords.forEach(r => {
    const arr = r[hmCurrentField];
    const splnene = r.ulohy_splnene || {};
    if (!Array.isArray(arr)) return;
    arr.forEach(taskText => {
      const meta = splnene[taskText];
      if (!meta) return;
      if (typeof meta === 'string') {
        hmAllTasks.push({ rid: r.id, field: hmCurrentField, text: taskText, date: meta, time: '—', priority: 'Normálna', category: r.kategoria || '—', source: 'Manuálne', description: '' });
      } else {
        hmAllTasks.push({ rid: r.id, field: hmCurrentField, text: taskText, date: meta.date || '—', time: meta.time || '—', priority: meta.priority || 'Normálna', category: meta.category || r.kategoria || '—', source: meta.source || 'Manuálne', description: meta.description || '' });
      }
    });
  });
  hmAllTasks.sort((a, b) => {
    const da = `${a.date} ${a.time}`, db = `${b.date} ${b.time}`;
    return db.localeCompare(da);
  });
}

function hmApplyFilters() {
  const q = (document.getElementById('hmSearch').value || '').toLowerCase();
  const prio = document.getElementById('hmFilterPriority').value;
  const src = document.getElementById('hmFilterSource').value;
  const dateF = document.getElementById('hmFilterDate').value;
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0, 10);

  let tasks = hmAllTasks;
  if (q) tasks = tasks.filter(t => t.text.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
  if (prio) tasks = tasks.filter(t => t.priority === prio);
  if (src) tasks = tasks.filter(t => t.source === src);
  if (dateF === 'today') tasks = tasks.filter(t => t.date === today);
  else if (dateF === 'week') tasks = tasks.filter(t => t.date >= weekAgo);
  else if (dateF === 'month') tasks = tasks.filter(t => t.date >= monthAgo);

  const countEl = document.getElementById('hmCount');
  if (countEl) countEl.textContent = `(${tasks.length})`;
  hmRenderTimeline(tasks);
}

function hmClearFilters() {
  ['hmSearch','hmFilterPriority','hmFilterSource','hmFilterDate'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
}

function hmRenderTimeline(tasks) {
  const body = document.getElementById('hmBody');
  if (!tasks.length) {
    body.innerHTML = '<div class="hm-empty">Žiadne splnené úlohy</div>';
    return;
  }
  const byDate = {};
  tasks.forEach(t => {
    const d = t.date || '—';
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(t);
  });
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
  let html = '';
  dates.forEach(date => {
    html += `<div class="hm-day-group"><div class="hm-day-label">${hmFormatDate(date)}</div>`;
    byDate[date].forEach(t => { html += hmBuildTaskRow(t); });
    html += '</div>';
  });
  body.innerHTML = html;
}

function hmFormatDate(iso) {
  if (!iso || iso === '—') return '—';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function hmPrioBadge(p) {
  const cls = p === 'Kritická' ? 'kriticka' : p === 'Nízka' ? 'nizka' : 'normalna';
  return `<span class="hm-badge ${cls}">${escHtml(p)}</span>`;
}

function hmBuildTaskRow(t) {
  const enc = encodeURIComponent(t.text);
  const desc = t.description ? `<div class="hm-task-desc">${escHtml(t.description)}</div>` : '';
  const cat = t.category && t.category !== '—' ? `<span class="hm-badge cat">${escHtml(t.category)}</span>` : '';
  return `<div class="hm-task">
    <div class="hm-task-time">${escHtml(t.time)}</div>
    <div class="hm-task-body">
      <div class="hm-task-name">✅ ${escHtml(t.text)}</div>
      ${desc}
      <div class="hm-task-meta">
        ${hmPrioBadge(t.priority)}
        ${cat}
        <span class="hm-badge source">${escHtml(t.source)}</span>
      </div>
    </div>
    <div class="hm-task-actions">
      <button class="hm-btn" title="Kopírovať" onclick="hmCopyTask(decodeURIComponent('${enc}'))">📋</button>
      <button class="hm-btn restore" title="Obnoviť" onclick="hmRestoreTask('${t.rid}',decodeURIComponent('${enc}'))">↩</button>
      <button class="hm-btn del" title="Odstrániť" onclick="hmDeleteTask('${t.rid}',decodeURIComponent('${enc}'),'${t.field}')">🗑</button>
    </div>
  </div>`;
}

function hmCopyTask(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Skopírované')).catch(() => {});
}

async function hmRestoreTask(rid, taskText) {
  const record = allRecords.find(r => r.id == rid);
  if (!record) return;
  const splnene = Object.assign({}, record.ulohy_splnene || {});
  delete splnene[taskText];
  try {
    const { data: { session } } = await window._supabase.auth.getSession();
    const token = session?.access_token || SUPABASE_KEY;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/zaznam?id=eq.${encodeURIComponent(rid)}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ulohy_splnene: splnene })
    });
    if (res.ok) {
      record.ulohy_splnene = splnene;
      hmCollectTasks(); hmApplyFilters(); updateDashboard();
      showToast('Úloha obnovená ako otvorená');
    }
  } catch(e) { console.error('[hmRestore]', e); }
}

async function hmDeleteTask(rid, taskText, field) {
  const record = allRecords.find(r => r.id == rid);
  if (!record) return;
  const splnene = Object.assign({}, record.ulohy_splnene || {});
  delete splnene[taskText];
  const f = field || hmCurrentField;
  const arr = Array.isArray(record[f]) ? record[f].filter(t => t !== taskText) : [];
  try {
    const { data: { session } } = await window._supabase.auth.getSession();
    const token = session?.access_token || SUPABASE_KEY;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/zaznam?id=eq.${encodeURIComponent(rid)}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ulohy_splnene: splnene, [f]: arr })
    });
    if (res.ok) {
      record.ulohy_splnene = splnene;
      record[f] = arr;
      hmCollectTasks(); hmApplyFilters(); updateDashboard();
      showToast('Úloha odstránená');
    }
  } catch(e) { console.error('[hmDelete]', e); }
}
