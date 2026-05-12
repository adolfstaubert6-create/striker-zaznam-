// ── STRIKER ai-core.js ──
// AI Robot stavové animácie a AI core panel
// Závisí na: SUPABASE_URL, SUPABASE_KEY, fmt() (app.js)

// ── AI ROBOT CORE ──
var _aiState='idle';
var _aiWaveInt=null;
var _aiStartT=Date.now();
var _aiUptimeInt=null;

var _aiCfg={
  idle:     {c:'#00e5ff',l:'IDLE',    sub:'Čaká na vstup'},
  thinking: {c:'#00e5ff',l:'THINKING',sub:'Spracovávam...'},
  analyzing:{c:'#9b5cf6',l:'ANALYZING',sub:'Analyzujem dáta...'},
  syncing:  {c:'#00cc88',l:'SYNCING', sub:'Synchronizujem...'},
  speaking: {c:'#00e5ff',l:'SPEAKING',sub:'Komunikujem...'},
  error:    {c:'#ff4500',l:'ERROR',   sub:'Kritická chyba!'}
};

function setAiState(s){
  _aiState=s;
  var cf=_aiCfg[s]||_aiCfg.idle;
  var sv=document.getElementById('aiStateVal');
  var ss2=document.getElementById('aiStateSub');
  if(sv){sv.textContent=cf.l;sv.style.color=cf.c;}
  if(ss2)ss2.textContent=cf.sub;
  var eyes=['aiEL','aiER','aiAnt','aiFH','aiChest','aiMouth'];
  eyes.forEach(function(id){var el=document.getElementById(id);if(el)el.setAttribute('fill',cf.c);});
  var lDot=document.getElementById('aiLDot');var rDot=document.getElementById('aiRDot');
  if(lDot)lDot.setAttribute('fill',cf.c);
  if(rDot)rDot.setAttribute('fill',cf.c);
  document.querySelectorAll('.ai-wb').forEach(function(b){b.style.background=cf.c;});
  var orbit=document.getElementById('aiOrbit');
  if(orbit)orbit.style.display=(s==='thinking'||s==='analyzing')?'block':'none';
  var scanFx=document.getElementById('aiScanFx');
  if(scanFx)scanFx.setAttribute('opacity',s==='syncing'?'1':'0');
  var errFx=document.getElementById('aiErrFx');
  if(errFx)errFx.setAttribute('opacity',s==='error'?'1':'0');
  aiLog('[STATE] → '+cf.l);
}

function aiWave(on){
  if(_aiWaveInt)clearInterval(_aiWaveInt);
  var bars=document.querySelectorAll('.ai-wb');
  if(!on){bars.forEach(function(b){b.style.height='4px';});return;}
  _aiWaveInt=setInterval(function(){
    bars.forEach(function(b){b.style.height=(4+Math.random()*18)+'px';});
  },90);
}

function aiLog(msg){
  var log=document.getElementById('aiLog');
  if(!log)return;
  var now=new Date();
  var ts=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0')+':'+now.getSeconds().toString().padStart(2,'0');
  log.innerHTML+='<div>['+ts+'] '+msg+'</div>';
  log.scrollTop=log.scrollHeight;
  if(log.children.length>15)log.removeChild(log.children[0]);
}

function initAiCore(){
  if(_aiUptimeInt)return;
  _aiStartT=Date.now();
  _aiUptimeInt=setInterval(function(){
    var e=Math.floor((Date.now()-_aiStartT)/1000);
    var el=document.getElementById('aiUptime');
    if(el)el.textContent=Math.floor(e/60).toString().padStart(2,'0')+':'+(e%60).toString().padStart(2,'0');
  },1000);
  aiLog('[BOOT] STRIKER AI core initialized');
  aiLog('[SYS] All modules nominal');
  aiLog('[AI] Agent ready — awaiting input');
  loadConsultSidebar();
}

async function loadConsultSidebar(){
  var list=document.getElementById('consultSideList');
  if(!list)return;
  list.innerHTML='<div style="font-size:9px;color:var(--muted);padding:4px">Načítavam...</div>';
  try{
    var res=await fetch(SUPABASE_URL+'/rest/v1/ai_consultations?select=*&order=created_at.desc&limit=20',{
      headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY}
    });
    var data=await res.json();
    list.innerHTML='';
    if(!Array.isArray(data)||!data.length){
      list.innerHTML='<div style="font-size:9px;color:var(--muted);padding:4px">Žiadne konzultácie</div>';
      return;
    }
    data.forEach(function(s){
      var d=document.createElement('div');
      d.style.cssText='background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px 10px;cursor:pointer;transition:border-color .15s';
      var time=s.created_at?fmt(s.created_at).split(' \u2013 ')[1]:'--';
      var day=s.created_at?s.created_at.slice(0,10):'--';
      var titleEl=document.createElement('div');
      titleEl.style.cssText='font-size:8px;color:#8b5cf6;margin-bottom:2px';
      titleEl.textContent=day+' · '+time;
      var bodyEl=document.createElement('div');
      bodyEl.style.cssText='font-size:11px;color:var(--text);overflow:hidden;white-space:nowrap;text-overflow:ellipsis';
      bodyEl.textContent=s.title||'—';
      d.appendChild(titleEl);
      d.appendChild(bodyEl);
      d.addEventListener('mouseenter',function(){d.style.borderColor='#8b5cf6';});
      d.addEventListener('mouseleave',function(){d.style.borderColor='var(--border)';});
      d.addEventListener('click',function(){openConsultSession(s);});
      list.appendChild(d);
    });
  }catch(e){list.innerHTML='<div style="font-size:9px;color:var(--muted)">Chyba</div>';}
}

function startNewConsult(){
  clearConsult();
  var msgs=document.getElementById('consultMessages');
  if(msgs)msgs.innerHTML='<div class="consult-msg system">Nová konzultácia. AI agent je pripravený.</div>';
  aiLog('[NEW] Nová konzultácia spustená');
}
