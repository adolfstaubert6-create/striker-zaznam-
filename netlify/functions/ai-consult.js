// ── STRIKER consult.js ──
// AI konzultačný panel + história konzultácií
// Závisí na: SUPABASE_URL, SUPABASE_KEY, allRecords, taskStatusMap, fmt(), escHtml(), setAiState(), aiLog(), loadConsultSidebar() (ai-core.js)

// ── AI KONZULTÁCIA ──
let consultHistory = [];

async function showConsult(){
  hideAllPanels();
  document.getElementById('consultPanel').style.display='block';
  document.querySelectorAll('.tab').forEach((t,i)=>{t.classList.remove('active');if(i===2)t.classList.add('active');});
  setTimeout(()=>document.getElementById('consultInput').focus(),100);
  initAiCore();
  loadConsultSidebar();
  if(!allRecords.length){
    try{
      const res=await fetch(SUPABASE_URL+'/rest/v1/zaznam?select=*&order=created_at.desc',{
        headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}
      });
      allRecords=await res.json();
      if(typeof setDBStatus==='function')setDBStatus(true);
      if(typeof loadTaskStatus==='function')await loadTaskStatus();
      if(typeof updateDashboard==='function')updateDashboard();
      if(typeof aiLog==='function')aiLog('[SYNC] Zaznamy nacitane: '+allRecords.length);
    }catch(e){
      if(typeof aiLog==='function')aiLog('[ERR] Chyba nacitania zaznamov');
    }
  }
}

function goBackFromConsult(){
  hideAllPanels();
  document.getElementById('historyPanel').style.display='block';
  document.querySelectorAll('.tab').forEach((t,i)=>{t.classList.remove('active');if(i===2)t.classList.add('active');});
}

function clearConsult(){
  consultHistory=[];
  currentConsultationId=null;
  const msgs=document.getElementById('consultMessages');
  msgs.innerHTML='<div class="consult-msg system">Konverzácia vymazaná. AI agent je pripravený.</div>';
}

function consultKeydown(e){
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendConsult();}
}

function addConsultMsg(role, text){
  const msgs=document.getElementById('consultMessages');
  const div=document.createElement('div');
  div.className='consult-msg '+role;
  const label=document.createElement('div');
  label.className='consult-msg-label';
  label.textContent=role==='user'?'Vy':'AI Agent';
  const body=document.createElement('div');
  body.textContent=text;
  div.appendChild(label);
  div.appendChild(body);
  if(role==='ai'){
    const ttsBtn=document.createElement('button');
    ttsBtn.textContent='🔊';
    ttsBtn.title='Prečítať nahlas';
    ttsBtn.style.cssText='background:none;border:none;cursor:pointer;font-size:12px;color:var(--muted);margin-top:6px;padding:0;opacity:.5;transition:opacity .2s';
    ttsBtn.addEventListener('mouseenter',()=>ttsBtn.style.opacity='1');
    ttsBtn.addEventListener('mouseleave',()=>ttsBtn.style.opacity='.5');
    ttsBtn.addEventListener('click',()=>speakText(text, ttsBtn));
    div.appendChild(ttsBtn);
  }
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
  return div;
}

var _currentAudio=null;

function stopSpeaking(){
  if(_currentAudio){
    _currentAudio.pause();
    _currentAudio=null;
  }
  if(window.speechSynthesis&&window.speechSynthesis.speaking){
    window.speechSynthesis.cancel();
  }
  if(typeof setAiState==='function')setAiState('idle');
  if(typeof aiWave==='function')aiWave(false);
}

async function speakText(text, btn){
  if(_currentAudio){
    stopSpeaking();
    if(btn)btn.textContent='🔊';
    return;
  }
  if(window.speechSynthesis&&window.speechSynthesis.speaking){
    window.speechSynthesis.cancel();
    if(btn)btn.textContent='🔊';
    return;
  }

  if(btn)btn.textContent='⏹';
  if(typeof setAiState==='function')setAiState('speaking');
  if(typeof aiWave==='function')aiWave(true);

  try{
    const res=await fetch('/.netlify/functions/ai-tts',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:text})
    });

    if(!res.ok)throw new Error('TTS API chyba');

    const arrayBuffer=await res.arrayBuffer();
    const blob=new Blob([arrayBuffer],{type:'audio/mpeg'});
    const url=URL.createObjectURL(blob);
    const audio=new Audio(url);
    _currentAudio=audio;

    audio.onended=()=>{
      _currentAudio=null;
      URL.revokeObjectURL(url);
      if(btn)btn.textContent='🔊';
      if(typeof setAiState==='function')setAiState('idle');
      if(typeof aiWave==='function')aiWave(false);
    };
    audio.onerror=()=>{
      _currentAudio=null;
      URL.revokeObjectURL(url);
      if(btn)btn.textContent='🔊';
      speakFallback(text, btn);
    };
    await audio.play();

  }catch(e){
    if(typeof aiLog==='function')aiLog('[TTS] OpenAI zlyhalo, fallback...');
    speakFallback(text, btn);
  }
}

function speakFallback(text, btn){
  if(!window.speechSynthesis)return;
  const utt=new SpeechSynthesisUtterance(text);
  utt.lang='sk-SK';
  utt.rate=0.9;
  utt.pitch=0.85;
  utt.onend=()=>{
    if(btn)btn.textContent='🔊';
    if(typeof setAiState==='function')setAiState('idle');
    if(typeof aiWave==='function')aiWave(false);
  };
  utt.onerror=()=>{
    if(btn)btn.textContent='🔊';
    if(typeof setAiState==='function')setAiState('idle');
    if(typeof aiWave==='function')aiWave(false);
  };
  window.speechSynthesis.speak(utt);
}

function addThinking(){
  const msgs=document.getElementById('consultMessages');
  const div=document.createElement('div');
  div.className='consult-msg ai';
  div.id='consultThinking';
  div.innerHTML='<div class="consult-thinking"><div class="consult-dot"></div><div class="consult-dot"></div><div class="consult-dot"></div></div>';
  msgs.appendChild(div);
  msgs.scrollTop=msgs.scrollHeight;
}

let currentConsultationId=null;

async function sendConsult(){
  const input=document.getElementById('consultInput');
  const btn=document.getElementById('consultSend');
  const text=input.value.trim();
  if(!text)return;
  if(!allRecords.length){showToast('Najprv načítaj históriu');return;}

  input.value='';
  input.style.height='auto';
  btn.disabled=true;

  const isFirst=consultHistory.length===0;
  addConsultMsg('user', text);
  consultHistory.push({role:'user', content:text});

  addThinking();
  setAiState('thinking');

  try{
    const res=await fetch('/.netlify/functions/ai-consult',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        records:allRecords,
        messages:consultHistory,
        taskStatus:taskStatusMap,
        consultationId:currentConsultationId,
        isFirstMessage:isFirst
      })
    });
    const data=await res.json();
    const thinking=document.getElementById('consultThinking');
    if(thinking)thinking.remove();

    if(!res.ok)throw new Error(data.error||'Chyba');

    const reply=data.reply;
    if(data.consultationId) currentConsultationId=data.consultationId;
    setAiState('idle');
    addConsultMsg('ai', reply);
    speakText(reply, null);
    consultHistory.push({role:'assistant', content:reply});
    aiLog('[AI] Response generated');
    loadConsultSidebar();

    // Limit histórie na 20 správ
    if(consultHistory.length>20) consultHistory=consultHistory.slice(-20);

  }catch(e){
    setAiState('error');
    const thinking=document.getElementById('consultThinking');
    if(thinking)thinking.remove();
    const msgs=document.getElementById('consultMessages');
    const err=document.createElement('div');
    err.className='consult-msg system';
    err.textContent='✗ '+e.message;
    err.style.color='var(--danger)';
    msgs.appendChild(err);
    msgs.scrollTop=msgs.scrollHeight;
  }finally{
    btn.disabled=false;
    input.focus();
  }
}

// ── HISTÓRIA AI KONZULTÁCIÍ ──
async function showConsultHistory(){
  hideAllPanels();
  document.getElementById('consultHistoryPanel').style.display='block';
  document.querySelectorAll('.tab').forEach((t,i)=>{t.classList.remove('active');if(i===2)t.classList.add('active');});
  await loadConsultHistory();
}

function goBackFromConsultHistory(){
  hideAllPanels();
  document.getElementById('consultPanel').style.display='block';
}

async function loadConsultHistory(){
  const timeline=document.getElementById('consultTimeline');
  const sub=document.getElementById('consultHistSub');
  timeline.innerHTML='<div class="no-records">Načítavam...</div>';
  try{
    const res=await fetch(`${SUPABASE_URL}/rest/v1/ai_consultations?select=*&order=created_at.desc`,{
      headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`}
    });
    const data=await res.json();
    if(!Array.isArray(data)||!data.length){
      timeline.innerHTML='<div class="no-records">Žiadne konzultácie</div>';
      sub.textContent='0 konzultácií';
      return;
    }
    sub.textContent=`${data.length} konzultácií`;
    renderConsultTimeline(data);
  }catch(e){
    timeline.innerHTML='<div class="no-records">Chyba načítania</div>';
  }
}

function renderConsultTimeline(sessions){
  const timeline=document.getElementById('consultTimeline');
  timeline.innerHTML='';

  // Grupovať podľa dňa
  const byDay={};
  sessions.forEach(s=>{
    const day=s.created_at?s.created_at.slice(0,10):'—';
    if(!byDay[day])byDay[day]=[];
    byDay[day].push(s);
  });

  Object.keys(byDay).sort((a,b)=>b.localeCompare(a)).forEach(day=>{
    const dayEl=document.createElement('div');
    dayEl.className='consult-timeline-day';

    const dateLabel=document.createElement('div');
    dateLabel.className='consult-timeline-date';
    const d=new Date(day);
    dateLabel.textContent=d.toLocaleDateString('sk-SK',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    dayEl.appendChild(dateLabel);

    byDay[day].forEach(s=>{
      const time=s.created_at?fmt(s.created_at).split(' – ')[1]:'—';
      const el=document.createElement('div');
      el.className='consult-session';
      el.innerHTML=`
        <span class="consult-session-icon">🤖</span>
        <div class="consult-session-body">
          <div class="consult-session-title">${escHtml(s.title||'—')}</div>
          <div class="consult-session-preview">${escHtml(s.summary_preview||'—')}</div>
          <div class="consult-session-meta">${time}</div>
        </div>
        <button class="consult-session-del" onclick="event.stopPropagation();deleteConsultSession('${s.id}')">🗑</button>`;
      el.addEventListener('click',()=>openConsultSession(s));
      dayEl.appendChild(el);
    });

    timeline.appendChild(dayEl);
  });
}

async function deleteConsultSession(id){
  showModal('Vymazať túto AI konzultáciu?', async ()=>{
    try{
      await fetch(`${SUPABASE_URL}/rest/v1/ai_consultations?id=eq.${id}`,{
        method:'DELETE',
        headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`}
      });
      await loadConsultHistory();
      showToast('Konzultácia vymazaná');
    }catch(e){showToast('Chyba mazania');}
  });
}

async function openConsultSession(session){
  hideAllPanels();
  document.getElementById('consultPanel').style.display='block';

  // Načítaj správy
  try{
    const res=await fetch(`${SUPABASE_URL}/rest/v1/ai_messages?consultation_id=eq.${session.id}&order=created_at.asc`,{
      headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`}
    });
    const msgs=await res.json();
    currentConsultationId=session.id;
    consultHistory=[];

    const msgsEl=document.getElementById('consultMessages');
    msgsEl.innerHTML='';

    msgs.forEach(m=>{
      addConsultMsg(m.role==='user'?'user':'ai', m.content);
      consultHistory.push({role:m.role, content:m.content});
    });
  }catch(e){showToast('Chyba načítania konzultácie');}
}
