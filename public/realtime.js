// ── STRIKER realtime.js ──
// Supabase Realtime synchronizácia
// Závisí na: SUPABASE_URL, SUPABASE_KEY, allRecords, taskStatusMap (app.js)

// ── REALTIME ──
let _realtimeActive=false;
let _renderTimer=null;
let _supabaseClient=null;
let _channel=null;

function scheduleRender(){
  if(_renderTimer)return;
  _renderTimer=setTimeout(()=>{
    _renderTimer=null;
    updateDashboard();
    const hist=document.getElementById('historyPanel');
    if(hist&&hist.style.display!=='none')renderList();
  },300);
}

function refreshTaskUI(){
  updateDashboard();
  if(activeDrawer) renderDrawerContent(activeDrawer.id);
  const openPanel=document.getElementById('openTasksPanel');
  if(openPanel&&openPanel.style.display!=='none') renderOpenTasks();
  const detailPanel=document.getElementById('detailPanel');
  if(detailPanel&&detailPanel.style.display!=='none'&&currentDetail) openDetail(currentDetail);
  const hist=document.getElementById('historyPanel');
  if(hist&&hist.style.display!=='none') renderList();
}

function initRealtime(){
  if(_realtimeActive){console.log('REALTIME: už aktívny, skip');return;}
  _realtimeActive=true;

  console.log('REALTIME: inicializujem...', SUPABASE_URL);

  try{
    if(!window.supabase){
      console.error('REALTIME: window.supabase nie je dostupný!');
      _realtimeActive=false;
      return;
    }

    _supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    console.log('REALTIME: supabase client vytvorený');

    _channel=_supabaseClient
      .channel('zaznam-changes')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'zaznam'},(payload)=>{
        console.log('REALTIME PAYLOAD INSERT:', payload);
        const record=payload.new;
        if(!record||allRecords.find(r=>r.id===record.id))return;
        allRecords.unshift(record);
        allRecords.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
        scheduleRender();
        document.getElementById('dotAI').className='sys-dot';
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'zaznam'},(payload)=>{
        console.log('REALTIME PAYLOAD UPDATE:', payload);
        const record=payload.new;
        if(!record)return;
        const idx=allRecords.findIndex(r=>r.id===record.id);
        if(idx===-1)return;
        allRecords[idx]=record;
        scheduleRender();
        if(currentDetail&&currentDetail.id===record.id){
          currentDetail=record;
          const dp=document.getElementById('detailPanel');
          if(dp&&dp.style.display!=='none')openDetail(record);
        }
      })
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'zaznam'},(payload)=>{
        console.log('REALTIME PAYLOAD DELETE:', payload);
        const old=payload.old;
        if(!old||!old.id)return;
        if(pendingDelete.find(r=>r.id===old.id))return;
        allRecords=allRecords.filter(r=>r.id!==old.id);
        scheduleRender();
        if(currentDetail&&currentDetail.id===old.id){
          goBack();
          showToast('Záznam bol vymazaný iným používateľom');
        }
      })
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'task_status'},(payload)=>{
        console.log('REALTIME TASK INSERT:', payload);
        const r=payload.new; if(!r)return;
        taskStatusMap[`${r.record_id}__${r.field}__${r.task_index}`]=r.done;
        updateDashboard();
        const hist=document.getElementById('historyPanel');
        if(hist&&hist.style.display!=='none') renderList();
        const openPanel=document.getElementById('openTasksPanel');
        if(openPanel&&openPanel.style.display!=='none') renderOpenTasks();
        if(activeDrawer) renderDrawerContent(activeDrawer.id);
        const dp=document.getElementById('detailPanel');
        if(dp&&dp.style.display!=='none'&&currentDetail) openDetail(currentDetail);
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'task_status'},(payload)=>{
        console.log('REALTIME TASK UPDATE:', payload);
        const r=payload.new; if(!r)return;
        taskStatusMap[`${r.record_id}__${r.field}__${r.task_index}`]=r.done;
        updateDashboard();
        const hist=document.getElementById('historyPanel');
        if(hist&&hist.style.display!=='none') renderList();
        const openPanel=document.getElementById('openTasksPanel');
        if(openPanel&&openPanel.style.display!=='none') renderOpenTasks();
        if(activeDrawer) renderDrawerContent(activeDrawer.id);
        const dp=document.getElementById('detailPanel');
        if(dp&&dp.style.display!=='none'&&currentDetail) openDetail(currentDetail);
      })
      .subscribe((status)=>{
        console.log('REALTIME STATUS:', status);
        const dot=document.getElementById('dotAI');
        const lbl=document.querySelector('.sys-item:nth-child(2) span:last-child');
        if(status==='SUBSCRIBED'){
          dot.className='sys-dot';
          if(lbl)lbl.textContent='RT';
        } else if(status==='CLOSED'||status==='CHANNEL_ERROR'){
          dot.className='sys-dot err';
          if(lbl)lbl.textContent='RT!';
        } else {
          dot.className='sys-dot dim';
        }
      });

    console.log('REALTIME: channel subscription spustená');

  }catch(err){
    console.error('REALTIME ERROR:', err);
    _realtimeActive=false;
    document.getElementById('dotAI').className='sys-dot dim';
  }

  window.addEventListener('beforeunload',()=>{
    clearTimeout(_renderTimer);
    if(_channel)_supabaseClient.removeChannel(_channel);
  });
}
