// ── STRIKER reports.js ──
// AI operačný report a strategický briefing
// Závisí na: allRecords, fmt(), escHtml(), showToast(), hideAllPanels() (app.js)

// ── AI REPORT ──
async function createAiReport(){
  if(!allRecords.length){showToast('Žiadne záznamy');return;}
  const btn=document.getElementById('btnAiReport');btn.disabled=true;btn.textContent='⏳ Generujem...';
  const teraz=fmtNow();lastReportMeta=`${teraz} · ${allRecords.length} záznamov`;lastReportTime=teraz;
  hideAllPanels();document.getElementById('reportPanel').style.display='block';
  document.getElementById('reportMeta').textContent=lastReportMeta;
  document.getElementById('reportBody').innerHTML=`<div class="report-loading"><div class="spinner"></div><br>AI analyzuje záznamy...</div>`;
  try{
    const res=await fetch('/.netlify/functions/ai-report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records:allRecords})});
    const data=await res.json();if(!res.ok)throw new Error(data.error||'Chyba');
    lastReport=data.report;
    document.getElementById('reportBody').innerHTML=data.report.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
    updateDashboard();
  }catch(e){document.getElementById('reportBody').innerHTML=`<div style="color:var(--danger);font-size:12px;font-family:'IBM Plex Mono',monospace">✗ ${e.message}</div>`;}
  finally{btn.disabled=false;btn.textContent='🧠 AI report';}
}
function copyReport(){if(!lastReport){showToast('Žiadny report');return;}navigator.clipboard.writeText(`${lastReportMeta}\n\n${lastReport}`).then(()=>showToast('Skopírovaný')).catch(()=>showToast('Chyba'));}


// ── STRATEGIC REPORT ──
async function createStrategicReport(){
  if(!allRecords.length){showToast('Žiadne záznamy');return;}
  const btn=document.getElementById('btnStrategic');
  if(btn){btn.disabled=true;btn.textContent='⏳ Analyzujem...';}
  const teraz=fmtNow();lastStrategicMeta=teraz+' · '+allRecords.length+' záznamov';
  hideAllPanels();document.getElementById('strategicPanel').style.display='block';
  document.getElementById('strategicMeta').textContent=lastStrategicMeta;
  document.getElementById('strategicBody').innerHTML='<div class="report-loading"><div class="spinner"></div><br>AI vykonáva strategickú analýzu...</div>';
  try{
    const res=await fetch('/.netlify/functions/ai-strategic',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({records:allRecords})});
    const data=await res.json();if(!res.ok)throw new Error(data.error||'Chyba');
    lastStrategic=data.report;
    document.getElementById('strategicBody').innerHTML=data.report.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/^## (.+)$/gm,'<h2>$1</h2>').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  }catch(e){document.getElementById('strategicBody').innerHTML=`<div style="color:var(--danger);font-size:12px;font-family:'IBM Plex Mono',monospace">✗ ${e.message}</div>`;}
  finally{if(btn){btn.disabled=false;btn.textContent='🔭 Strategický';}}
}
function goBackFromStrategic(){hideAllPanels();document.getElementById('historyPanel').style.display='block';document.querySelectorAll('.tab').forEach((t,i)=>{t.classList.remove('active');if(i===2)t.classList.add('active');});}
function copyStrategic(){if(!lastStrategic){showToast('Žiadny report');return;}navigator.clipboard.writeText(lastStrategicMeta+'\n\n'+lastStrategic).then(()=>showToast('Skopírovaný')).catch(()=>showToast('Chyba'));}
