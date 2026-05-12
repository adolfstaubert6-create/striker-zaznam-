// ── STRIKER history.js ──
// Záznamy, detail, edit, mazanie, nový vstup
// Závisí na: allRecords, taskStatusMap, getTaskDone(), setTaskDone(), fmt(), escHtml(), showToast(), showModal() (app.js/tasks.js)

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
    document.getElementById('editStatus').textContent='';document.getElementById('editStatus').className='edit-status';
    ef.style.display='block';dg.style.display='none';be.textContent='👁 Detail';
  } else {ef.style.display='none';dg.style.display='flex';be.textContent='✏️ Upraviť';}
}
function cancelEdit(){document.getElementById('editForm').style.display='none';document.getElementById('detailGrid').style.display='flex';document.getElementById('btnEdit').textContent='✏️ Upraviť';}
async function saveEdit(){
  if(!currentDetail)return;
  const btn=document.getElementById('btnSave'),se=document.getElementById('editStatus');
  btn.disabled=true;se.textContent='Ukladám...';se.className='edit-status';
  const payload={id:currentDetail.id,datum:document.getElementById('edit-datum').value,co_sa_riesilo:document.getElementById('edit-co_sa_riesilo').value.trim(),vysledok:document.getElementById('edit-vysledok').value.trim(),problem:document.getElementById('edit-problem').value.trim(),dalsi_krok:document.getElementById('edit-dalsi_krok').value.trim(),ulohy_staubert:document.getElementById('edit-ulohy_staubert').value.split('\n').map(l=>l.trim()).filter(Boolean),ulohy_szabo:document.getElementById('edit-ulohy_szabo').value.split('\n').map(l=>l.trim()).filter(Boolean)};
  try{
    const res=await fetch('/.netlify/functions/update-record',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await res.json();if(!res.ok)throw new Error(data.error||'Chyba');
    const updated=data.record?data.record:{...currentDetail,...payload};
    currentDetail=updated;const idx=allRecords.findIndex(r=>r.id===updated.id);if(idx!==-1)allRecords[idx]=updated;
    se.textContent='✓ Uložené';se.className='edit-status ok';
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
    allRecords.unshift(data);updateDashboard();
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

// ── DELETE ──
function deleteSingle(id){showModal('Naozaj chceš vymazať tento záznam?',()=>executeDelete([id]));}
function deleteSelected(){const ids=[...selectedIds];showModal(`Naozaj vymazať ${ids.length} záznam${ids.length>1?'ov':''}?`,()=>executeDelete(ids));}
function showModal(text,cb){document.getElementById('modalText').textContent=text;document.getElementById('modal').classList.add('show');deleteCallback=cb;}
function closeModal(){document.getElementById('modal').classList.remove('show');}
function confirmDelete(){const cb=deleteCallback;closeModal();deleteCallback=null;if(cb)cb();}
async function executeDelete(ids){
  pendingDelete=allRecords.filter(r=>ids.includes(r.id));
  allRecords=allRecords.filter(r=>!ids.includes(r.id));
  ids.forEach(id=>selectedIds.delete(id));updateToolbar();renderList();updateDashboard();
  try{
    const res=await fetch('/.netlify/functions/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids})});
    if(!res.ok)throw new Error(await res.text());
    showToast(`${ids.length} záznam${ids.length>1?'y':''} vymazaný`);
  }catch(e){allRecords=[...allRecords,...pendingDelete];renderList();updateDashboard();showToast('Chyba: '+e.message);}
}
function undoDelete(){if(!pendingDelete.length)return;allRecords=[...allRecords,...pendingDelete].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));pendingDelete=[];renderList();updateDashboard();hideToast();}
