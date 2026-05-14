// ── STRIKER history.js ──
// Záznamy, detail, edit, mazanie, nový vstup
// Závisí na: allRecords, taskStatusMap, getTaskDone(), setTaskDone(), fmt(), escHtml(), showToast(), showModal() (app.js/tasks.js)

// ── CATEGORY FILTER ──────────────────────────────────────────────────────────
let activeCategory = ''

function setCategoryFilter(btn, cat) {
  activeCategory = cat
  document.querySelectorAll('.cat-chip').forEach(b => b.classList.remove('active'))
  btn.classList.add('active')
  renderList()
}
// ── DETAIL ──
function openDetail(record){
  currentDetail=record;hideAllPanels();
  document.getElementById('detailPanel').style.display='block';
  document.getElementById('editForm').style.display='none';
  document.getElementById('detailGrid').style.display='flex';
  document.getElementById('btnEdit').textContent='✏️ Upraviť';
  const eventDateHtml=record.datum&&record.datum.trim()?`<div class="detail-event-date">Dátum udalosti: ${record.datum}</div>`:'';
  document.getElementById('detailHeader').innerHTML=`<div class="detail-date">${record.created_at?fmt(record.created_at):'—'}</div>${eventDateHtml}<div class="detail-title">${escHtml(record.co_sa_riesilo||'—')}</div>`;
  const grid=document.getElementById('detailGrid');grid.innerHTML='';
  [{key:'vysledok',label:'Výsledok',cls:''},{key:'problem',label:'Problém',cls:''},{key:'dalsi_krok',label:'Ďalší krok',cls:''}].forEach(f=>{
    const div=document.createElement('div');div.className='field';
    const lbl=document.createElement('div');lbl.className='field-label';lbl.textContent=f.label;
    const vdiv=document.createElement('div');vdiv.className='field-value';
    const val=record[f.key];if(val&&val!==''){vdiv.textContent=val;}else{vdiv.textContent='—';vdiv.classList.add('empty');}
    div.appendChild(lbl);div.appendChild(vdiv);grid.appendChild(div);
  });
  [{key:'ulohy_staubert',label:'Úlohy – Staubert',cls:'st',taskCls:'st-task'},{key:'ulohy_szabo',label:'Úlohy – Szabó',cls:'sz',taskCls:'sz-task'}].forEach(f=>{
    const div=document.createElement('div');div.className='field';
    const lbl=document.createElement('div');lbl.className=`field-label ${f.cls}`;lbl.textContent=f.label;
    div.appendChild(lbl);
    const val=record[f.key];
    if(Array.isArray(val)&&val.length>0){
      const tl=document.createElement('div');tl.className='task-list';
      val.forEach((item,i)=>{
        const done=getTaskDone(record.id,f.key,i);
        const t=document.createElement('div');t.className=`task-item ${f.taskCls}`+(done?' done':'');
        const icon=document.createElement('span');icon.className='task-icon';icon.textContent=done?'✅':'❌';
        const txt=document.createElement('span');txt.textContent=item;
        t.appendChild(icon);t.appendChild(txt);
        t.addEventListener('click',()=>{const nd=t.classList.toggle('done');icon.textContent=nd?'✅':'❌';setTaskDone(record.id,f.key,i,nd);updateDashboard();});
        tl.appendChild(t);
      });
      div.appendChild(tl);
    } else {
      const vdiv=document.createElement('div');vdiv.className='field-value empty';vdiv.textContent='—';div.appendChild(vdiv);
    }
    grid.appendChild(div);
  });
}
function copyDetail(){
  if(!currentDetail)return;const r=currentDetail;
  const fT=(f,arr)=>{if(!Array.isArray(arr)||!arr.length)return'—';return arr.map((item,i)=>(getTaskDone(r.id,f,i)?'✅':'❌')+' '+item).join('\n');};
  navigator.clipboard.writeText([`Dátum: ${r.datum||'—'}`,r.created_at?`Uložené: ${fmt(r.created_at)}`:'',`Čo sa riešilo: ${r.co_sa_riesilo||'—'}`,`Výsledok: ${r.vysledok||'—'}`,`Problém: ${r.problem||'—'}`,`Úlohy Staubert:\n${fT('ulohy_staubert',r.ulohy_staubert)}`,`Úlohy Szabó:\n${fT('ulohy_szabo',r.ulohy_szabo)}`,`Ďalší krok: ${r.dalsi_krok||'—'}`].join('\n\n')).then(()=>showToast('Skopírovaný')).catch(()=>showToast('Chyba'));
}

// ── EDIT ──
function toggleEditMode(){
  const ef=document.getElementById('editForm'),dg=document.getElementById('detailGrid'),be=document.getElementById('btnEdit');
  if(ef.style.display==='none'){
    if(!currentDetail)return;const r=currentDetail;
    ['datum','co_sa_riesilo','vysledok','problem','dalsi_krok'].forEach(k=>document.getElementById('edit-'+k).value=r[k]||'');
    document.getElementById('edit-ulohy_staubert').value=Array.isArray(r.ulohy_staubert)?r.ulohy_staubert.join('\n'):'';
    document.getElementById('edit-ulohy_szabo').value=Array.isArray(r.ulohy_szabo)?r.ulohy_szabo.join('\n'):'';
    document.getElementById('edit-kategoria').value=r.kategoria||'Iné';
    document.getElementById('edit-tagy').value=Array.isArray(r.tagy)?r.tagy.join(', '):'';
    document.getElementById('editStatus').textContent='';document.getElementById('editStatus').className='edit-status';
    ef.style.display='block';dg.style.display='none';be.textContent='👁 Detail';
  } else {ef.style.display='none';dg.style.display='flex';be.textContent='✏️ Upraviť';}
}
function cancelEdit(){document.getElementById('editForm').style.display='none';document.getElementById('detailGrid').style.display='flex';document.getElementById('btnEdit').textContent='✏️ Upraviť';}
async function saveEdit(){
  if(!currentDetail)return;
  const btn=document.getElementById('btnSave'),se=document.getElementById('editStatus');
  btn.disabled=true;se.textContent='Ukladám...';se.className='edit-status';
  const payload={
    id:currentDetail.id,
    datum:document.getElementById('edit-datum').value,
    co_sa_riesilo:document.getElementById('edit-co_sa_riesilo').value.trim(),
    vysledok:document.getElementById('edit-vysledok').value.trim(),
    problem:document.getElementById('edit-problem').value.trim(),
    dalsi_krok:document.getElementById('edit-dalsi_krok').value.trim(),
    ulohy_staubert:document.getElementById('edit-ulohy_staubert').value.split('\n').map(l=>l.trim()).filter(Boolean),
    ulohy_szabo:document.getElementById('edit-ulohy_szabo').value.split('\n').map(l=>l.trim()).filter(Boolean),
    kategoria:document.getElementById('edit-kategoria').value,
    tagy:document.getElementById('edit-tagy').value.split(',').map(t=>t.trim().toLowerCase()).filter(Boolean).slice(0,5),
  };
  try{
    const res=await fetch('/.netlify/functions/update-record',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await res.json();if(!res.ok)throw new Error(data.error||'Chyba');
    const updated=data.record?data.record:{...currentDetail,...payload};
    currentDetail=updated;const idx=allRecords.findIndex(r=>r.id===updated.id);if(idx!==-1)allRecords[idx]=updated;
    se.textContent='✓ Uložené';se.className='edit-status ok';
    markLocalMutation(updated.id);
    logActivity('edit', `Upravený záznam: ${updated.co_sa_riesilo||'–'}`, updated.id);
    setTimeout(()=>{cancelEdit();openDetail(updated);updateDashboard();},700);
  }catch(e){se.textContent='✗ '+e.message;se.className='edit-status error';}finally{btn.disabled=false;}
}

// ── NEW ENTRY ──
async function spracovat(){
  const text=document.getElementById('inputText').value.trim();
  if(!text){setStatus('Vlož text.','error');return;}
  const btn=document.getElementById('btn');btn.disabled=true;setStatus('Spracúvam...','');
  try{
    const res=await fetch('/.netlify/functions/process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});
    const data=await res.json();if(!res.ok)throw new Error(data.error||'Chyba');
    document.getElementById('inputText').value='';zobrazVysledok(data);setStatus('✓ Uložené','ok');
    if(data.id) markLocalMutation(data.id);
    allRecords.unshift(data);updateDashboard();
    logActivity('create', `Vytvorený záznam: ${data.co_sa_riesilo||'–'}`, data.id);
  }catch(e){setStatus('✗ '+e.message,'error');}finally{btn.disabled=false;}
}
function setStatus(msg,type){const el=document.getElementById('status');el.textContent=msg;el.className=type;}
function zobrazVysledok(d){
  const grid=document.getElementById('resultGrid');grid.innerHTML='';
  [{key:'datum',label:'Dátum'},{key:'co_sa_riesilo',label:'Čo sa riešilo'},{key:'vysledok',label:'Výsledok'},{key:'problem',label:'Problém'},{key:'ulohy_staubert',label:'Úlohy – Staubert',isArr:true,cls:'st'},{key:'ulohy_szabo',label:'Úlohy – Szabó',isArr:true,cls:'sz'},{key:'dalsi_krok',label:'Ďalší krok'}].forEach(f=>{
    const val=d[f.key],div=document.createElement('div');div.className='field';
    const lbl=document.createElement('div');lbl.className='field-label'+(f.cls?' '+f.cls:'');lbl.textContent=f.label;
    const vdiv=document.createElement('div');vdiv.className='field-value';
    if(f.isArr&&Array.isArray(val)&&val.length>0){const tl=document.createElement('div');tl.className='tag-list';val.forEach(item=>{const t=document.createElement('span');t.className='tag';t.textContent=item;tl.appendChild(t);});vdiv.appendChild(tl);}
    else if(val&&val!==''){vdiv.textContent=val;}else{vdiv.textContent='—';vdiv.classList.add('empty');}
    div.appendChild(lbl);div.appendChild(vdiv);grid.appendChild(div);
  });
  document.getElementById('result').style.display='block';
}

<<<<<<< HEAD
// ── HISTORY — paginated ───────────────────────────────────────────────────────
const PAGE_SIZE   = 50;
let   _page       = 0;      // current page index (0-based)
let   _hasMore    = false;  // more pages available
let   _totalCount = 0;      // total rows in DB (from Prefer: count=exact)
let   _loading    = false;

async function loadHistory(reset = true) {
  if (_loading) return;
  _loading = true;

  const list = document.getElementById('recordsList');

  if (reset) {
    _page = 0;
    allRecords = [];
    selectedIds.clear();
    updateToolbar();
    list.innerHTML = '<div class="no-records">Načítavam...</div>';
  }

  const offset = _page * PAGE_SIZE;

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/zaznam?select=*&order=created_at.desc&limit=${PAGE_SIZE}&offset=${offset}`,
      {
        headers: {
          'apikey':        SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer':        'count=exact',   // tells Supabase to return total count
        },
      }
    );

    // Total count comes from Content-Range header: "0-49/312"
    const range = res.headers.get('Content-Range') || '';
    const totalMatch = range.match(/\/(\d+)$/);
    if (totalMatch) _totalCount = parseInt(totalMatch[1], 10);

    const page = await res.json();
    if (!res.ok) throw new Error(page.message || page.error || 'Chyba');

    if (reset) {
      allRecords = page;
    } else {
      allRecords = [...allRecords, ...page];
    }

    _hasMore = allRecords.length < _totalCount;
    setDBStatus(true);
    renderList();
    updateDashboard();
    _renderPaginationFooter();
  } catch (e) {
    list.innerHTML = '<div class="no-records">Chyba načítania</div>';
    setDBStatus(false);
  } finally {
    _loading = false;
  }
}

async function loadMoreRecords() {
  if (!_hasMore || _loading) return;
  _page++;
  await loadHistory(false);
}

function _renderPaginationFooter() {
  const existing = document.getElementById('paginationFooter');
  if (existing) existing.remove();

  const list = document.getElementById('recordsList');
  if (!list) return;

  const footer = document.createElement('div');
  footer.id = 'paginationFooter';
  footer.style.cssText = 'text-align:center;padding:12px 0 4px;font-size:11px;font-family:"IBM Plex Mono",monospace;color:var(--muted)';

  const shown = allRecords.length;
  const total = _totalCount;
  const info  = document.createElement('div');
  info.textContent = `Zobrazených ${shown} z ${total} záznamov`;
  footer.appendChild(info);

  if (_hasMore) {
    const btn = document.createElement('button');
    btn.textContent = _loading ? '⏳ Načítavam...' : `Načítať ďalšie (zostatok: ${total - shown})`;
    btn.style.cssText = 'margin-top:8px;padding:6px 16px;background:transparent;border:1px solid var(--accent);color:var(--accent);border-radius:4px;font-family:"IBM Plex Mono",monospace;font-size:11px;cursor:pointer;letter-spacing:1px;text-transform:uppercase';
    btn.onclick = loadMoreRecords;
    footer.appendChild(btn);
  }

  list.after(footer);
}
const CAT_ICON = { Obchod: '💼', Technické: '⚙️', Financie: '💰', HR: '👥', Marketing: '📣', Iné: '📌' }

function renderList() {
  const list = document.getElementById('recordsList')
  const q    = (document.getElementById('searchInput')?.value || '').toLowerCase().trim()

  let filtered = allRecords

  // Category filter
  if (activeCategory) {
    filtered = filtered.filter(r => r.kategoria === activeCategory)
  }

  // Text search
  if (q) {
    filtered = filtered.filter(r =>
      [r.datum, r.co_sa_riesilo, r.vysledok, r.problem, r.dalsi_krok, r.kategoria,
       ...(r.ulohy_staubert || []), ...(r.ulohy_szabo || []), ...(r.tagy || [])]
        .some(v => v && v.toString().toLowerCase().includes(q))
    )
  }

  if (!filtered.length) { list.innerHTML = '<div class="no-records">Žiadne záznamy</div>'; return }
  list.innerHTML = ''

  filtered.forEach(r => {
    const item     = document.createElement('div')
    item.className = 'zaznam-item' + (selectedIds.has(r.id) ? ' selected' : '')

    const hasSt   = Array.isArray(r.ulohy_staubert) && r.ulohy_staubert.length > 0
    const hasSz   = Array.isArray(r.ulohy_szabo)    && r.ulohy_szabo.length    > 0
    const hasProb = r.problem && r.problem.trim() !== ''
    const catIcon = r.kategoria ? (CAT_ICON[r.kategoria] || '📌') : ''
    const catPill = r.kategoria ? `<span class="pill cat">${catIcon} ${escHtml(r.kategoria)}</span>` : ''
    const tagPills = Array.isArray(r.tagy) && r.tagy.length
      ? r.tagy.map(t => `<span class="pill tag">#${escHtml(t)}</span>`).join('')
      : ''
    const pills = (hasSt ? '<span class="pill st">Staubert</span>' : '')
                + (hasSz ? '<span class="pill sz">Szabó</span>' : '')
                + (hasProb ? '<span class="pill prob">⚠ Problém</span>' : '')
                + catPill + tagPills

    const mainDate  = r.created_at ? fmt(r.created_at) : '—'
    const eventDate = r.datum && r.datum.trim()
      ? `<span class="zaznam-event-date">Udalosť: ${r.datum}</span>` : ''

    item.innerHTML = `<div class="zaznam-check"></div><div class="zaznam-body"><div class="zaznam-date">${mainDate}</div>${eventDate}<div class="zaznam-title">${escHtml(r.co_sa_riesilo || '—')}</div><div class="zaznam-sub">${escHtml(r.dalsi_krok || '')}</div>${pills ? '<div class="zaznam-pills">' + pills + '</div>' : ''}</div><button class="zaznam-delete" onclick="event.stopPropagation();deleteSingle('${r.id}')">🗑</button>`
    item.querySelector('.zaznam-check').addEventListener('click', e => { e.stopPropagation(); toggleSelect(r.id) })
    item.addEventListener('click', () => openDetail(r))
    list.appendChild(item)
  })
=======
// ── HISTORY ──
async function loadHistory(){
  const list=document.getElementById('recordsList');list.innerHTML='<div class="no-records">Načítavam...</div>';
  selectedIds.clear();updateToolbar();
  try{
    const res=await fetch(`${SUPABASE_URL}/rest/v1/zaznam?select=*&order=created_at.desc`,{headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`}});
    allRecords=await res.json();setDBStatus(true);renderList();updateDashboard();
  }catch(e){list.innerHTML='<div class="no-records">Chyba načítania</div>';setDBStatus(false);}
}
function renderList(){
  const list=document.getElementById('recordsList');
  const q=(document.getElementById('searchInput')?.value||'').toLowerCase().trim();
  const filtered=q?allRecords.filter(r=>[r.datum,r.co_sa_riesilo,r.vysledok,r.problem,r.dalsi_krok,...(r.ulohy_staubert||[]),...(r.ulohy_szabo||[])].some(v=>v&&v.toString().toLowerCase().includes(q))):allRecords;
  if(!filtered.length){list.innerHTML='<div class="no-records">Žiadne záznamy</div>';return;}
  list.innerHTML='';
  filtered.forEach(r=>{
    const item=document.createElement('div');item.className='zaznam-item'+(selectedIds.has(r.id)?' selected':'');
    const hasSt=Array.isArray(r.ulohy_staubert)&&r.ulohy_staubert.length>0;
    const hasSz=Array.isArray(r.ulohy_szabo)&&r.ulohy_szabo.length>0;
    const hasProb=r.problem&&r.problem.trim()!=='';
    const pills=(hasSt?'<span class="pill st">Staubert</span>':'')+(hasSz?'<span class="pill sz">Szabó</span>':'')+(hasProb?'<span class="pill prob">⚠ Problém</span>':'');
    const mainDate=r.created_at?fmt(r.created_at):'—';
    const eventDate=r.datum&&r.datum.trim()?`<span class="zaznam-event-date">Udalosť: ${r.datum}</span>`:'';
    item.innerHTML=`<div class="zaznam-check"></div><div class="zaznam-body"><div class="zaznam-date">${mainDate}</div>${eventDate}<div class="zaznam-title">${escHtml(r.co_sa_riesilo||'—')}</div><div class="zaznam-sub">${escHtml(r.dalsi_krok||'')}</div>${pills?'<div class="zaznam-pills">'+pills+'</div>':''}</div><button class="zaznam-delete" onclick="event.stopPropagation();deleteSingle('${r.id}')">🗑</button>`;
    item.querySelector('.zaznam-check').addEventListener('click',e=>{e.stopPropagation();toggleSelect(r.id);});
    item.addEventListener('click',()=>openDetail(r));
    list.appendChild(item);
  });
>>>>>>> e35371ce5980d630bcaba189eef59f9a79114cd0
}
function toggleSelect(id){if(selectedIds.has(id))selectedIds.delete(id);else selectedIds.add(id);updateToolbar();renderList();}
function toggleSelectAll(){if(selectedIds.size===allRecords.length)selectedIds.clear();else allRecords.forEach(r=>selectedIds.add(r.id));updateToolbar();renderList();}
function updateToolbar(){
  const n=selectedIds.size;
  document.getElementById('btnDeleteSelected').textContent=`🗑 Vymazať (${n})`;
  document.getElementById('btnDeleteSelected').disabled=n===0;
  document.getElementById('selectedCount').textContent=n>0?`${n} označených`:'';
  document.getElementById('btnSelectAll').textContent=selectedIds.size===allRecords.length&&allRecords.length>0?'Zrušiť':'Označiť';
}

<<<<<<< HEAD
// ── EXPORT ───────────────────────────────────────────────────────────────────

const EXPORT_FIELDS = [
  { key: 'id',              label: 'ID' },
  { key: 'created_at',      label: 'Uložené' },
  { key: 'datum',           label: 'Dátum udalosti' },
  { key: 'kategoria',       label: 'Kategória' },
  { key: 'tagy',            label: 'Tagy' },
  { key: 'co_sa_riesilo',   label: 'Čo sa riešilo' },
  { key: 'vysledok',        label: 'Výsledok' },
  { key: 'problem',         label: 'Problém' },
  { key: 'dalsi_krok',      label: 'Ďalší krok' },
  { key: 'ulohy_staubert',  label: 'Úlohy Staubert' },
  { key: 'ulohy_szabo',     label: 'Úlohy Szabó' },
]

// Fetch ALL records from DB (bypasses pagination for export)
async function fetchAllForExport() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/zaznam?select=*&order=created_at.desc&limit=10000`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  )
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || data.error || 'Chyba načítania')
  return data
}

function csvEscape(val) {
  if (val === null || val === undefined) return ''
  const str = Array.isArray(val) ? val.join(' | ') : String(val)
  // Wrap in quotes if contains comma, quote, newline; double existing quotes
  if (/[",\n\r]/.test(str)) return '"' + str.replace(/"/g, '""') + '"'
  return str
}

function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
}

function exportJSON(records) {
  const payload = {
    exportedAt: new Date().toISOString(),
    count:      records.length,
    records,
  }
  const ts = new Date().toISOString().slice(0, 10)
  downloadFile(JSON.stringify(payload, null, 2), `striker-zaznam-${ts}.json`, 'application/json')
  showToast(`✓ JSON export — ${records.length} záznamov`)
}

function exportCSV(records) {
  const header = EXPORT_FIELDS.map(f => csvEscape(f.label)).join(',')
  const rows   = records.map(r =>
    EXPORT_FIELDS.map(f => csvEscape(r[f.key])).join(',')
  )
  const csv  = [header, ...rows].join('\r\n')
  const bom  = '﻿'  // UTF-8 BOM for Excel compatibility
  const ts   = new Date().toISOString().slice(0, 10)
  downloadFile(bom + csv, `striker-zaznam-${ts}.csv`, 'text/csv;charset=utf-8')
  showToast(`✓ CSV export — ${records.length} záznamov`)
}

async function handleExport(format) {
  const btn = document.getElementById(`btnExport${format.toUpperCase()}`)
  if (btn) { btn.disabled = true; btn.textContent = '⏳...' }
  try {
    const records = await fetchAllForExport()
    if (format === 'json') { exportJSON(records); logActivity('export_json', `Export JSON — ${records.length} záznamov`) }
    else                   { exportCSV(records);  logActivity('export_csv',  `Export CSV — ${records.length} záznamov`) }
  } catch (e) {
    showToast('Chyba exportu: ' + e.message)
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = format === 'json' ? '⬇ JSON' : '⬇ CSV'
    }
  }
}

=======
>>>>>>> e35371ce5980d630bcaba189eef59f9a79114cd0
// ── DELETE ──
function deleteSingle(id){showModal('Naozaj chceš vymazať tento záznam?',()=>executeDelete([id]));}
function deleteSelected(){const ids=[...selectedIds];showModal(`Naozaj vymazať ${ids.length} záznam${ids.length>1?'ov':''}?`,()=>executeDelete(ids));}
function showModal(text,cb){document.getElementById('modalText').textContent=text;document.getElementById('modal').classList.add('show');deleteCallback=cb;}
function closeModal(){document.getElementById('modal').classList.remove('show');}
function confirmDelete(){const cb=deleteCallback;closeModal();deleteCallback=null;if(cb)cb();}
async function executeDelete(ids){
  pendingDelete=allRecords.filter(r=>ids.includes(r.id));
  allRecords=allRecords.filter(r=>!ids.includes(r.id));
  ids.forEach(id=>{ selectedIds.delete(id); markLocalMutation(id); });updateToolbar();renderList();updateDashboard();
  try{
    const res=await fetch('/.netlify/functions/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
    if(!res.ok)throw new Error(await res.text());
    showToast(`${ids.length} záznam${ids.length>1?'y':''} vymazaný`);
    logActivity(ids.length>1?'delete_bulk':'delete', `Zmazaných ${ids.length} záznam${ids.length>1?'ov':''}`);
  }catch(e){allRecords=[...allRecords,...pendingDelete];renderList();updateDashboard();showToast('Chyba: '+e.message);}
}
function undoDelete(){if(!pendingDelete.length)return;allRecords=[...allRecords,...pendingDelete].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));pendingDelete=[];renderList();updateDashboard();hideToast();}
