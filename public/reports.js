// ── STRIKER reports.js ──
// AI operačný report a strategický briefing


// ── Safe markdown renderer (XSS-safe) ────────────────────────────────────────
// Escapes all HTML FIRST, then applies formatting token-by-token.
// $1 capture groups never touch unescaped content.
function escHtmlStr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyInline(escaped) {
  // **bold** — operates on already-escaped text, safe
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function renderMarkdown(rawText) {
  const frag = document.createDocumentFragment();
  const lines = rawText.split('\n');

  for (const line of lines) {
    const esc = escHtmlStr(line);

    if (/^###\s/.test(line)) {
      const h = document.createElement('h3');
      h.innerHTML = applyInline(escHtmlStr(line.replace(/^###\s+/, '')));
      frag.appendChild(h);
    } else if (/^##\s/.test(line)) {
      const h = document.createElement('h2');
      h.innerHTML = applyInline(escHtmlStr(line.replace(/^##\s+/, '')));
      frag.appendChild(h);
    } else if (/^#\s/.test(line)) {
      const h = document.createElement('h1');
      h.innerHTML = applyInline(escHtmlStr(line.replace(/^#\s+/, '')));
      frag.appendChild(h);
    } else if (/^[-*•]\s/.test(line.trim())) {
      const li = document.createElement('div');
      li.className = 'md-li';
      li.innerHTML = applyInline(escHtmlStr(line.trim().replace(/^[-*•]\s+/, '')));
      frag.appendChild(li);
    } else if (line.trim() === '') {
      frag.appendChild(document.createElement('br'));
    } else {
      const p = document.createElement('p');
      p.innerHTML = applyInline(esc);
      frag.appendChild(p);
    }
  }
  return frag;
}

function setReportBody(elementId, rawText) {
  const el = document.getElementById(elementId);
  el.innerHTML = '';
  el.appendChild(renderMarkdown(rawText));
}

// ── AI REPORT ────────────────────────────────────────────────────────────────
async function createAiReport() {
  if (!allRecords.length) { showToast('Žiadne záznamy'); return; }
  const btn = document.getElementById('btnAiReport');
  btn.disabled = true; btn.textContent = '⏳ Generujem...';
  const teraz = fmtNow();
  lastReportMeta = `${teraz} · ${allRecords.length} záznamov`;
  lastReportTime = teraz;
  hideAllPanels();
  document.getElementById('reportPanel').style.display = 'block';
  document.getElementById('reportMeta').textContent = lastReportMeta;
  document.getElementById('reportBody').innerHTML =
    '<div class="report-loading"><div class="spinner"></div><br>AI analyzuje záznamy...</div>';
  try {
    const res  = await fetch('/.netlify/functions/ai-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: allRecords }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Chyba');
    lastReport = data.report;
    setReportBody('reportBody', data.report);
    updateDashboard();
    logActivity('ai_report', `AI Report — ${allRecords.length} záznamov`);
  } catch (e) {
    const err = document.createElement('div');
    err.style.cssText = 'color:var(--danger);font-size:12px;font-family:"IBM Plex Mono",monospace';
    err.textContent = '✗ ' + e.message;
    const body = document.getElementById('reportBody');
    body.innerHTML = ''; body.appendChild(err);
  } finally {
    btn.disabled = false; btn.textContent = '🧠 AI report';
  }
}

function copyReport() {
  if (!lastReport) { showToast('Žiadny report'); return; }
  navigator.clipboard.writeText(`${lastReportMeta}\n\n${lastReport}`)
    .then(() => showToast('Skopírovaný'))
    .catch(() => showToast('Chyba'));
}

// ── STRATEGIC REPORT ─────────────────────────────────────────────────────────
async function createStrategicReport() {
  if (!allRecords.length) { showToast('Žiadne záznamy'); return; }
  const btn = document.getElementById('btnStrategic');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Analyzujem...'; }
  const teraz = fmtNow();
  lastStrategicMeta = `${teraz} · ${allRecords.length} záznamov`;
  hideAllPanels();
  document.getElementById('strategicPanel').style.display = 'block';
  document.getElementById('strategicMeta').textContent = lastStrategicMeta;
  document.getElementById('strategicBody').innerHTML =
    '<div class="report-loading"><div class="spinner"></div><br>AI vykonáva strategickú analýzu...</div>';
  try {
    const res  = await fetch('/.netlify/functions/ai-strategic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: allRecords }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Chyba');
    lastStrategic = data.report;
    setReportBody('strategicBody', data.report);
    logActivity('ai_strategic', `Strategický report — ${allRecords.length} záznamov`);
  } catch (e) {
    const err = document.createElement('div');
    err.style.cssText = 'color:var(--danger);font-size:12px;font-family:"IBM Plex Mono",monospace';
    err.textContent = '✗ ' + e.message;
    const body = document.getElementById('strategicBody');
    body.innerHTML = ''; body.appendChild(err);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🔭 Strategický'; }
  }
}

function goBackFromStrategic() {
  hideAllPanels();
  document.getElementById('historyPanel').style.display = 'block';
  document.querySelectorAll('.tab').forEach((t, i) => {
    t.classList.remove('active');
    if (i === 2) t.classList.add('active');
  });
}

function copyStrategic() {
  if (!lastStrategic) { showToast('Žiadny report'); return; }
  navigator.clipboard.writeText(`${lastStrategicMeta}\n\n${lastStrategic}`)
    .then(() => showToast('Skopírovaný'))
    .catch(() => showToast('Chyba'));
}
