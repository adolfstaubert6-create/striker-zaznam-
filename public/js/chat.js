// ── STRIKER Team Chat JS ──
// Závisí na: SUPABASE_URL, SUPABASE_KEY, _supabase (globals z chat.html)
// Auth: getAuthUserName(), getAuthUser() z /auth.js

let _chatMsgs      = [];
let _linkedEntries = [];
let _selectedIds   = new Set();
let _selectMode    = false;
let _currentType   = 'info';
let _chatChannel   = null;
let _chatReady     = false;
let _lastDateSep   = null;
let _lastMsgAuthor = null;
let _aiSuggestions = {};

// ── INIT ─────────────────────────────────────────────────────────────────────
async function initChat() {
  if (_chatReady) return;
  _chatReady = true;

  _setDBStatus(false);
  try {
    await _loadMessages();
    await _loadLinkedEntries();
    _renderMessages();
    _renderPinned();
    _renderLinkedEntries();
    _initRealtime();
    await _loadAiSuggestions();
    _setDBStatus(true);
    scrollToBottom();
    document.getElementById('composeInput').focus();
  } catch (err) {
    console.error('[chat] init:', err);
    _setDBStatus(false);
  }
}

// ── TOKEN ─────────────────────────────────────────────────────────────────────
async function _token() {
  const { data: { session } } = await _supabase.auth.getSession();
  return session?.access_token || SUPABASE_KEY;
}

// ── LOAD DATA ─────────────────────────────────────────────────────────────────
async function _loadMessages() {
  const tok = await _token();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/chat_messages?select=*&order=created_at.asc`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tok}` } }
  );
  if (!res.ok) throw new Error('DB error: ' + res.status);
  _chatMsgs = await res.json();
}

async function _loadLinkedEntries() {
  const tok = await _token();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/linked_entries?select=*&order=created_at.desc`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tok}` } }
  );
  if (res.ok) _linkedEntries = await res.json();
}

// ── REALTIME ──────────────────────────────────────────────────────────────────
function _initRealtime() {
  _chatChannel = window.supabase
    .createClient(SUPABASE_URL, SUPABASE_KEY)
    .channel('striker-chat')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages' },
      (p) => {
        const msg = p.new;
        if (_chatMsgs.find(m => m.id === msg.id)) return;
        _chatMsgs.push(msg);
        const atBottom = _isAtBottom();
        _appendMessage(msg, true);
        _renderPinned();
        _hideEmpty();
        if (atBottom || msg.author === getAuthUserName()) scrollToBottom();
      }
    )
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
      (p) => {
        const idx = _chatMsgs.findIndex(m => m.id === p.new.id);
        if (idx !== -1) _chatMsgs[idx] = p.new;
        _renderMessages();
        _renderPinned();
      }
    )
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'linked_entries' },
      (p) => {
        if (!_linkedEntries.find(e => e.id === p.new.id)) {
          _linkedEntries.unshift(p.new);
          _renderLinkedEntries();
        }
      }
    )
    .subscribe((status) => {
      const dot = document.getElementById('dotRT');
      if (!dot) return;
      if (status === 'SUBSCRIBED') {
        dot.className = 'sys-dot';
        _setOnlineLabel('live');
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        dot.className = 'sys-dot err';
        _setOnlineLabel('offline');
      } else {
        dot.className = 'sys-dot dim';
      }
    });
}

function _isAtBottom() {
  const el = document.getElementById('chatMessages');
  return !el || (el.scrollHeight - el.scrollTop - el.clientHeight) < 90;
}

function scrollToBottom() {
  const el = document.getElementById('chatMessages');
  if (el) el.scrollTop = el.scrollHeight;
}

// ── RENDER ALL ────────────────────────────────────────────────────────────────
function _renderMessages() {
  const wrap = document.getElementById('chatMessages');
  if (!wrap) return;

  _hideEmpty();
  if (!_chatMsgs.length) { _showEmpty(); return; }

  const self = getAuthUserName();
  _lastDateSep = null;
  _lastMsgAuthor = null;
  let html = '';

  _chatMsgs.forEach(msg => {
    html += _buildMessageHTML(msg, self);
  });

  wrap.innerHTML = html;
  wrap.querySelectorAll('[data-pin-id]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); togglePin(btn.dataset.pinId); });
  });
  wrap.querySelectorAll('[data-sel-id]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); _selectMessage(btn.dataset.selId); });
  });
}

function _appendMessage(msg, animate) {
  const wrap = document.getElementById('chatMessages');
  if (!wrap) return;

  const self = getAuthUserName();
  const frag = document.createElement('div');
  const needSep = _needDateSep(msg.created_at);
  frag.innerHTML = (needSep ? _buildDateSep(msg.created_at) : '') + _buildMessageHTML(msg, self, true);

  frag.querySelectorAll('[data-pin-id]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); togglePin(btn.dataset.pinId); });
  });
  frag.querySelectorAll('[data-sel-id]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); _selectMessage(btn.dataset.selId); });
  });

  while (frag.firstChild) wrap.appendChild(frag.firstChild);
}

function _buildMessageHTML(msg, self, skipDateSep) {
  const isAgent = msg.author === 'ai-agent';
  const isSelf  = !isAgent && msg.author === self;
  const authorClass = isAgent ? 'ai' : msg.author.toLowerCase().includes('staubert') ? 'st' : 'sz';
  const timeStr = _fmtTime(msg.created_at);
  const selectedClass = _selectedIds.has(msg.id) ? ' selected' : '';

  // Date separator resets grouping
  const hasSep = !skipDateSep && _needDateSep(msg.created_at);
  if (hasSep) _lastMsgAuthor = null;
  const grouped = !hasSep && _lastMsgAuthor === msg.author && !_selectedIds.has(msg.id);
  _lastMsgAuthor = msg.author;

  let bubbleExtra = ` bub-${msg.type}`;
  if (msg.pinned) bubbleExtra += ' is-pinned';

  const pinMark = msg.pinned ? '<span class="pin-mark">📌</span>' : '';
  const pinBtnClass = msg.pinned ? 'msg-act-btn pinned-active' : 'msg-act-btn';
  const pinLabel = msg.pinned ? '📌 Odopnúť' : '📌 Pripnúť';
  const selBtnClass = _selectedIds.has(msg.id) ? 'msg-act-btn selected-active' : 'msg-act-btn';
  const selLabel = _selectedIds.has(msg.id) ? '☑ Odznačiť' : '☐ Vybrať';
  const dateSep = hasSep ? _buildDateSep(msg.created_at) : '';
  const groupCls = grouped ? ' grouped' : '';

  const agentCls   = isAgent ? ' agent-msg' : '';
  const authorDisp  = isAgent ? '🤖 AI Agent' : msg.author;

  return `${dateSep}<div class="chat-msg ${isSelf ? 'self' : 'other'}${selectedClass}${groupCls}${agentCls}" data-msg-id="${escHtml(msg.id)}">
  <div class="chat-msg-header">
    <span class="chat-msg-author ${authorClass}">${escHtml(authorDisp)}</span>
    <span class="chat-msg-time">${timeStr}</span>
    <span class="chat-type-badge ctb-${msg.type}">${_typeLabel(msg.type)}</span>
  </div>
  <div class="chat-msg-bubble${bubbleExtra}">
    ${pinMark}${escHtml(msg.text)}
  </div>
  <div class="chat-msg-actions">
    <button class="${pinBtnClass}" data-pin-id="${escHtml(msg.id)}">${pinLabel}</button>
    <button class="${selBtnClass}" data-sel-id="${escHtml(msg.id)}">${selLabel}</button>
  </div>
</div>
<div class="ai-card-slot" id="ai-slot-${escHtml(msg.id)}"></div>`;
}

function _needDateSep(iso) {
  const d = iso ? iso.slice(0, 10) : '';
  if (d !== _lastDateSep) { _lastDateSep = d; return true; }
  return false;
}

function _buildDateSep(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const label = `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  return `<div class="chat-date-sep">${label}</div>`;
}

// ── PINNED SIDEBAR ────────────────────────────────────────────────────────────
function _renderPinned() {
  const list = document.getElementById('pinnedList');
  if (!list) return;
  const pinned = _chatMsgs.filter(m => m.pinned);
  if (!pinned.length) {
    list.innerHTML = '<div class="sidebar-empty">Žiadne pripnuté správy</div>';
    return;
  }
  list.innerHTML = pinned.map(m => `
    <div class="pinned-item" onclick="_scrollToMsg('${escHtml(m.id)}')">
      <div class="pinned-item-text">${escHtml(m.text)}</div>
      <div class="pinned-item-meta">
        <span class="pinned-type-dot ptd-${m.type}"></span>
        <span class="pinned-item-author">${escHtml(m.author)} · ${_fmtTime(m.created_at)}</span>
      </div>
    </div>`).join('');
}

function _scrollToMsg(id) {
  const el = document.querySelector(`[data-msg-id="${id}"] .chat-msg-bubble`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.transition = 'box-shadow .3s';
    el.style.boxShadow = '0 0 0 2px var(--chat-cyan)';
    setTimeout(() => { el.style.boxShadow = ''; }, 1400);
  }
}

// ── LINKED ENTRIES SIDEBAR ────────────────────────────────────────────────────
function _renderLinkedEntries() {
  const list = document.getElementById('linkedEntriesList');
  if (!list) return;
  if (!_linkedEntries.length) {
    list.innerHTML = '<div class="sidebar-empty">Žiadne záznamy</div>';
    return;
  }
  list.innerHTML = _linkedEntries.map(e => `
    <div class="linked-entry-item" onclick="openEntryDetail('${escHtml(e.id)}')">
      <div class="linked-entry-title">${escHtml(e.title)}</div>
      <div class="linked-entry-meta">
        <span>${escHtml(e.created_by)}</span>
        <span>${_fmtDate(e.created_at)}</span>
        <span>${Array.isArray(e.message_ids) ? e.message_ids.length : 0} správ</span>
      </div>
    </div>`).join('');
}

// ── SEND MESSAGE ─────────────────────────────────────────────────────────────
async function sendMessage() {
  const input = document.getElementById('composeInput');
  const text = (input.value || '').trim();
  if (!text) return;

  const author = getAuthUserName();
  const btn    = document.getElementById('composeSend');
  btn.disabled = true;
  input.value  = '';
  autoResize(input);

  try {
    const tok = await _token();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/chat_messages`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${tok}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({ author, text, type: _currentType, pinned: false })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.message || `HTTP ${res.status}`);
    }
    const saved  = await res.json().catch(() => []);
    const newMsg = Array.isArray(saved) ? saved[0] : saved;
    if (newMsg?.id) {
      const msgId    = newMsg.id;
      const msgText  = text;
      const msgAuthor = author;
      setTimeout(() => _triggerAiExtract(msgId, msgText, msgAuthor), 200);
    }
  } catch (err) {
    console.error('[chat] send:', err);
    _showToast('❌ Chyba: ' + err.message);
    input.value = text;
    autoResize(input);
  } finally {
    btn.disabled = false;
    input.focus();
  }
}

function composeKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden';
}

// ── TYPE SELECTOR ─────────────────────────────────────────────────────────────
function setType(type) {
  _currentType = type;
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.className = btn.dataset.type === type ? `type-btn act-${type}` : 'type-btn';
  });
}

// ── PIN / UNPIN ───────────────────────────────────────────────────────────────
async function togglePin(id) {
  const msg = _chatMsgs.find(m => m.id === id);
  if (!msg) return;
  const next = !msg.pinned;
  msg.pinned = next;

  try {
    const tok = await _token();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/chat_messages?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${tok}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ pinned: next })
    });
    if (!res.ok) throw new Error('PATCH failed');
    _renderMessages();
    _renderPinned();
    _showToast(next ? '📌 Správa pripnutá' : '🔓 Správa odopnutá');
  } catch (err) {
    msg.pinned = !next;
    _showToast('❌ Chyba pri pripínaní');
  }
}

// ── SELECT MODE ───────────────────────────────────────────────────────────────
function toggleSelectMode() {
  if (_selectMode) cancelSelectMode(); else _enterSelect();
}

function _enterSelect() {
  _selectMode = true;
  _selectedIds.clear();
  document.getElementById('selectBar').classList.add('visible');
  const btn = document.getElementById('btnSelectMode');
  btn.textContent = '✕ Ukončiť';
  btn.style.cssText = 'border-color:var(--danger);color:var(--danger)';
  _updateSelectBar();
}

function cancelSelectMode() {
  _selectMode = false;
  _selectedIds.clear();
  document.getElementById('selectBar').classList.remove('visible');
  const btn = document.getElementById('btnSelectMode');
  btn.textContent = '☑ Vybrať';
  btn.style.cssText = '';
  _renderMessages();
}

function _selectMessage(id) {
  if (_selectedIds.has(id)) _selectedIds.delete(id);
  else _selectedIds.add(id);

  if (!_selectMode) _enterSelect();

  const el = document.querySelector(`[data-msg-id="${id}"]`);
  if (el) {
    el.classList.toggle('selected', _selectedIds.has(id));
    const btn = el.querySelector('[data-sel-id]');
    if (btn) {
      btn.textContent = _selectedIds.has(id) ? '☑ Odznačiť' : '☐ Vybrať';
      btn.className   = _selectedIds.has(id) ? 'msg-act-btn selected-active' : 'msg-act-btn';
    }
  }
  _updateSelectBar();
}

function _updateSelectBar() {
  const n = _selectedIds.size;
  const el = document.getElementById('selectBarInfo');
  if (el) el.textContent = `${n} správ${n === 1 ? 'a' : ''} vybraných`;
}

// ── CREATE LINKED ENTRY ───────────────────────────────────────────────────────
function openCreateEntry() {
  if (!_selectedIds.size) { _showToast('Vyber najprv správy'); return; }
  const sub = document.getElementById('entryMsgCount');
  if (sub) sub.textContent = `Prepája ${_selectedIds.size} správ`;

  // Clear manual fields
  ['entryTitle','entryDecisions','entryTasksSt','entryTasksSz','entryTasksObaja','entryCritical'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  // Auto-fill Zhrnutie with selected messages as chronological transcript
  const transcript = [..._selectedIds]
    .map(id => _chatMsgs.find(m => m.id === id))
    .filter(Boolean)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map(m => `${m.author} (${_fmtTime(m.created_at)}): ${m.text}`)
    .join('\n');

  const summaryEl = document.getElementById('entrySummary');
  if (summaryEl) summaryEl.value = transcript;

  document.getElementById('entryModalOverlay').classList.add('show');
  setTimeout(() => document.getElementById('entryTitle')?.focus(), 80);
}

async function aiAnalyzeEntry() {
  const transcript = (document.getElementById('entrySummary')?.value || '').trim();
  if (!transcript) { _showToast('Najprv vyber správy – ZHRNUTIE je prázdne'); return; }

  const btn = document.getElementById('btnAiFill');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ AI analyzuje...'; }

  try {
    const res = await fetch('/.netlify/functions/chat-ai-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    // Parse "Person: task" lines into 3 modal fields
    const stLines = [], szLines = [], bothLines = [];
    (data.ulohy || '').split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
      if      (/^staubert\s*:/i.test(line)) stLines.push(line.replace(/^staubert\s*:\s*/i,   '').trim());
      else if (/^szab[oó]\s*:/i.test(line)) szLines.push(line.replace(/^szab[oó]\s*:\s*/i,   '').trim());
      else if (/^obaja\s*:/i.test(line))    bothLines.push(line.replace(/^obaja\s*:\s*/i,     '').trim());
      else                                  bothLines.push(line);
    });

    const fill = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    fill('entryDecisions',  data.rozhodnutia);
    fill('entryTasksSt',    stLines.join('\n'));
    fill('entryTasksSz',    szLines.join('\n'));
    fill('entryTasksObaja', bothLines.join('\n'));
    fill('entryCritical',   data.kriticke_body);

    _showToast('🤖 AI doplnilo polia');
  } catch (err) {
    console.error('[chat] aiAnalyze:', err);
    _showToast('❌ AI chyba: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '🤖 AI návrh'; }
  }
}

function closeEntryModal() {
  document.getElementById('entryModalOverlay').classList.remove('show');
}

function entryModalBgClick(e) {
  if (e.target === document.getElementById('entryModalOverlay')) closeEntryModal();
}

// Split free-text tasks into Staubert / Szabó arrays by line prefix
function _parseTasksByPerson(tasksText) {
  if (!tasksText) return { st: [], sz: [] };
  const st = [], sz = [];
  tasksText.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
    if (/^szab[oó]\s*:/i.test(line)) sz.push(line.replace(/^szab[oó]\s*:\s*/i, '').trim());
    else if (/^staubert\s*:/i.test(line)) st.push(line.replace(/^staubert\s*:\s*/i, '').trim());
    else st.push(line);
  });
  return { st, sz };
}

async function saveEntry() {
  const title = (document.getElementById('entryTitle')?.value || '').trim();
  if (!title) { _showToast('Zadaj názov záznamu'); document.getElementById('entryTitle')?.focus(); return; }

  const btn = document.getElementById('btnSaveEntry');
  btn.disabled = true;
  btn.textContent = '⏳ Ukladám...';

  const stTasks   = (document.getElementById('entryTasksSt')?.value    || '').trim();
  const szTasks   = (document.getElementById('entryTasksSz')?.value    || '').trim();
  const bothTasks = (document.getElementById('entryTasksObaja')?.value || '').trim();
  const combined  = [
    stTasks   && `[Staubert]\n${stTasks}`,
    szTasks   && `[Szabó]\n${szTasks}`,
    bothTasks && `[Obaja]\n${bothTasks}`
  ].filter(Boolean).join('\n\n');

  const payload = {
    message_ids:     [..._selectedIds],
    title,
    summary:         (document.getElementById('entrySummary')?.value   || '').trim() || null,
    decisions:       (document.getElementById('entryDecisions')?.value || '').trim() || null,
    tasks:           combined || null,
    critical_points: (document.getElementById('entryCritical')?.value  || '').trim() || null,
    created_by:      getAuthUserName()
  };

  try {
    const tok = await _token();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/linked_entries`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${tok}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.message || `HTTP ${res.status}`);
    }
    // Mirror to zaznam so it appears in História tab
    const _toLines = t => t ? t.split('\n').map(l => l.trim()).filter(Boolean) : [];
    const bothArr  = _toLines(bothTasks);
    await fetch(`${SUPABASE_URL}/rest/v1/zaznam`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${tok}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({
        datum:          new Date().toISOString().slice(0, 10),
        co_sa_riesilo:  title,
        vysledok:       payload.summary         || '',
        problem:        payload.critical_points || '',
        ulohy_staubert: [..._toLines(stTasks),  ...bothArr],
        ulohy_szabo:    [..._toLines(szTasks),   ...bothArr],
        dalsi_krok:     payload.decisions       || '',
        kategoria:      'Chat',
        tagy:           ['chat']
      })
    });

    closeEntryModal();
    cancelSelectMode();
    _showToast('🔗 Záznam uložený a pridaný do histórie');
  } catch (err) {
    console.error('[chat] saveEntry:', err);
    _showToast('❌ Chyba: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔗 Uložiť záznam';
  }
}

// ── ENTRY DETAIL ──────────────────────────────────────────────────────────────
function openEntryDetail(id) {
  const entry = _linkedEntries.find(e => e.id === id);
  if (!entry) return;

  document.getElementById('detailEntryTitle').textContent = entry.title;
  document.getElementById('detailEntryMeta').textContent =
    `${entry.created_by} · ${_fmtDateTime(entry.created_at)} · ${(entry.message_ids || []).length} správ`;

  const sections = document.getElementById('detailEntrySections');
  const fields = [
    { key: 'summary',         label: 'Zhrnutie' },
    { key: 'decisions',       label: 'Rozhodnutia' },
    { key: 'tasks',           label: 'Úlohy' },
    { key: 'critical_points', label: 'Kritické body' }
  ];
  sections.innerHTML = fields.filter(f => entry[f.key]).map(f => `
    <div>
      <div class="entry-section-label">${f.label}</div>
      <div class="entry-section-body">${escHtml(entry[f.key])}</div>
    </div>`).join('');

  // Linked messages
  const msgIds = entry.message_ids || [];
  const msgs   = msgIds.map(mid => _chatMsgs.find(m => m.id === mid)).filter(Boolean);
  const msgWrap = document.getElementById('detailEntryMessages');
  msgWrap.innerHTML = msgs.length
    ? msgs.map(m => `
      <div class="entry-msg-preview">
        <span class="entry-msg-preview-type chat-type-badge ctb-${m.type}">${_typeLabel(m.type)}</span>
        <div class="entry-msg-preview-body">
          <div class="entry-msg-preview-author">${escHtml(m.author)} · ${_fmtTime(m.created_at)}</div>
          <div class="entry-msg-preview-text">${escHtml(m.text)}</div>
        </div>
      </div>`).join('')
    : '<div style="font-size:11px;color:var(--muted)">Správy neboli nájdené.</div>';

  document.getElementById('entryDetailOverlay').classList.add('show');
}

function closeEntryDetail() {
  document.getElementById('entryDetailOverlay').classList.remove('show');
}

function entryDetailBgClick(e) {
  if (e.target === document.getElementById('entryDetailOverlay')) closeEntryDetail();
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function _fmtTime(iso) {
  if (!iso) return '–';
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  } catch { return '–'; }
}

function _fmtDate(iso) {
  if (!iso) return '–';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;
  } catch { return '–'; }
}

function _fmtDateTime(iso) {
  if (!iso) return '–';
  return _fmtDate(iso) + ' ' + _fmtTime(iso);
}

function _typeLabel(type) {
  return { info:'info', warning:'upoz', critical:'krit', ai_note:'ai' }[type] || type;
}

function _setDBStatus(ok) {
  const dot = document.getElementById('dotDB');
  if (dot) dot.className = ok ? 'sys-dot' : 'sys-dot err';
}

function _setOnlineLabel(state) {
  const el = document.getElementById('chatOnlineIndicator');
  if (!el) return;
  if (state === 'live')    { el.textContent = '● online';      el.style.color = 'var(--ok)'; }
  else if (state === 'offline') { el.textContent = '● nedostupný'; el.style.color = 'var(--danger)'; }
}

function _showEmpty() {
  const el = document.getElementById('chatEmpty');
  if (el) el.style.display = 'block';
}
function _hideEmpty() {
  const el = document.getElementById('chatEmpty');
  if (el) el.style.display = 'none';
}

let _toastTimer = null;
function _showToast(text, dur = 3500) {
  clearTimeout(_toastTimer);
  const t  = document.getElementById('toast');
  const tx = document.getElementById('toastText');
  if (!t || !tx) return;
  tx.textContent = text;
  t.classList.add('show');
  _toastTimer = setTimeout(() => t.classList.remove('show'), dur);
}

// ── AI TASK EXTRACTION ────────────────────────────────────────────────────────
async function _loadAiSuggestions() {
  try {
    const tok = await _token();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ai_task_suggestions?status=eq.pending&order=created_at.desc`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tok}` } }
    );
    if (!res.ok) return;
    const rows = await res.json();
    rows.forEach(s => { _aiSuggestions[s.message_id] = s; });
    _renderAllAiCards();
  } catch(e) { console.warn('[ai-suggestions] load:', e); }
}

function _renderAllAiCards() {
  Object.entries(_aiSuggestions).forEach(([msgId, s]) => {
    if (s.status === 'pending') _renderAiCard(msgId, s);
  });
}

async function _triggerAiExtract(msgId, content, authorId) {
  try {
    const res = await fetch('/.netlify/functions/extract-task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: msgId, content, author_id: authorId })
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.has_task && data.confidence_score > 0.6) {
      _aiSuggestions[msgId] = { ...data, message_id: msgId, status: 'pending' };
      _renderAiCard(msgId, _aiSuggestions[msgId]);
      _updateAiPanel();
    }
  } catch(e) { console.warn('[ai-extract]', e); }
}

function _renderAiCard(msgId, s) {
  const slot = document.getElementById(`ai-slot-${msgId}`);
  if (!slot) return;
  slot.innerHTML = _aiCardHTML(s);
}

function _aiCardHTML(s) {
  const assignedLabel = s.assigned_to === 'staubert' ? '👤 Staubert' : s.assigned_to === 'szabo' ? '👤 Szabó' : '👥 Obaja';
  const prioClass = s.priority === 'KRITICKÉ' ? 'ai-card-prio-crit' : 'ai-card-prio-norm';
  const deadlineStr = s.deadline ? `📅 ${s.deadline}` : '📅 –';
  const pct = Math.round((s.confidence_score || 0) * 100);
  const confClass = pct >= 85 ? 'high' : 'med';
  const confLabel = pct >= 85 ? 'HIGH' : 'MED';
  return `<div class="ai-task-card" data-msg-id="${escHtml(s.message_id)}">
  <div class="ai-card-header">
    <div class="ai-card-badge">
      <span class="ai-card-icon">🤖</span>
      <span class="ai-card-label">AI návrh úlohy</span>
    </div>
    <div class="ai-card-confidence">
      <span class="ai-card-conf-label ${confClass}">${confLabel}</span>
      <span class="ai-card-conf-pct">${pct}%</span>
    </div>
  </div>
  <div class="ai-card-title">${escHtml(s.task_title || '')}</div>
  <div class="ai-card-meta">
    <span class="ai-card-chip">${assignedLabel}</span>
    <span class="ai-card-chip ${prioClass}">${escHtml(s.priority || 'NORMÁLNA')}</span>
    <span class="ai-card-chip">${deadlineStr}</span>
  </div>
  <div class="ai-card-reason">${escHtml(s.reason || '')}</div>
  <div class="ai-card-actions">
    <button class="ai-btn ai-btn-confirm" onclick="aiConfirmTask('${escHtml(s.message_id)}')">✅ Potvrdiť</button>
    <button class="ai-btn ai-btn-edit"    onclick="aiOpenEdit('${escHtml(s.message_id)}')">✏️ Upraviť</button>
    <button class="ai-btn ai-btn-discard" onclick="aiDiscardTask('${escHtml(s.message_id)}')">❌ Zahodiť</button>
  </div>
</div>`;
}

async function aiConfirmTask(msgId) {
  const s = _aiSuggestions[msgId];
  if (!s) return;
  await _createZaznamFromTask(s);
  await _updateSuggestionStatus(msgId, s.id, 'confirmed');
  s.status = 'confirmed';
  const slot = document.getElementById(`ai-slot-${msgId}`);
  if (slot) slot.innerHTML = '<div class="ai-card-done">✅ Úloha pridaná do záznamu</div>';
  _showToast('✅ Úloha vytvorená');
}

async function aiDiscardTask(msgId) {
  const s = _aiSuggestions[msgId];
  if (!s) return;
  await _updateSuggestionStatus(msgId, s.id, 'discarded');
  s.status = 'discarded';
  const slot = document.getElementById(`ai-slot-${msgId}`);
  if (slot) slot.innerHTML = '';
  _showToast('🗑 Návrh zahodený');
}

function aiOpenEdit(msgId) {
  const s = _aiSuggestions[msgId];
  if (!s) return;
  document.getElementById('aiEditMsgId').value    = msgId;
  document.getElementById('aiEditTitle').value    = s.task_title || '';
  document.getElementById('aiEditAssigned').value = s.assigned_to || 'both';
  document.getElementById('aiEditPriority').value = s.priority || 'NORMÁLNA';
  document.getElementById('aiEditDeadline').value = s.deadline || '';
  document.getElementById('aiEditCategory').value = s.category || 'Iné';
  document.getElementById('aiEditDesc').value     = s.description || '';
  document.getElementById('aiEditOverlay').classList.add('show');
}

async function aiSaveEdit() {
  const msgId   = document.getElementById('aiEditMsgId').value;
  const s       = _aiSuggestions[msgId];
  if (!s) return;
  s.task_title  = document.getElementById('aiEditTitle').value.trim();
  s.assigned_to = document.getElementById('aiEditAssigned').value;
  s.priority    = document.getElementById('aiEditPriority').value;
  s.deadline    = document.getElementById('aiEditDeadline').value || null;
  s.category    = document.getElementById('aiEditCategory').value;
  s.description = document.getElementById('aiEditDesc').value.trim();
  document.getElementById('aiEditOverlay').classList.remove('show');
  await _createZaznamFromTask(s);
  await _updateSuggestionStatus(msgId, s.id, 'confirmed');
  s.status = 'confirmed';
  const slot = document.getElementById(`ai-slot-${msgId}`);
  if (slot) slot.innerHTML = '<div class="ai-card-done">✅ Úloha upravená a pridaná</div>';
  _showToast('✅ Úloha uložená');
}

async function _createZaznamFromTask(s) {
  const stArr = (s.assigned_to === 'staubert' || s.assigned_to === 'both') ? [s.task_title] : [];
  const szArr = (s.assigned_to === 'szabo'    || s.assigned_to === 'both') ? [s.task_title] : [];
  const tok   = await _token();
  await fetch(`${SUPABASE_URL}/rest/v1/zaznam`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      datum:          new Date().toISOString().slice(0, 10),
      co_sa_riesilo:  s.task_title,
      vysledok:       s.description || '',
      problem:        s.priority === 'KRITICKÉ' ? s.task_title : '',
      ulohy_staubert: stArr,
      ulohy_szabo:    szArr,
      ulohy_splnene:  {},
      dalsi_krok:     s.deadline ? `Deadline: ${s.deadline}` : '',
      kategoria:      s.category || 'Iné',
      tagy:           ['chat', 'auto-ai']
    })
  });
}

async function _updateSuggestionStatus(msgId, id, status) {
  if (!id) return;
  const tok = await _token();
  await fetch(`${SUPABASE_URL}/rest/v1/ai_task_suggestions?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  _updateAiPanel();
}

// ── AI SUMMARY PANEL ─────────────────────────────────────────────────────────
function _updateAiPanel() {
  const panel = document.getElementById('aiSummaryPanel');
  if (!panel) return;
  const pending = Object.values(_aiSuggestions).filter(s => s.status === 'pending');
  const crit    = pending.filter(s => s.priority === 'KRITICKÉ').length;
  if (!pending.length) { panel.classList.remove('visible'); return; }
  panel.classList.add('visible');
  panel.innerHTML = `<span class="ai-summary-dot"></span>${pending.length} návrh${pending.length > 1 ? 'y' : ''}${crit ? ` · <span style="color:#ef4444">${crit} krit.</span>` : ''}`;
}

// ── SLASH COMMANDS ────────────────────────────────────────────────────────────
function composeInput(e) {
  const val = e.target.value;
  const hint = document.getElementById('composeSlashHint');
  if (hint) hint.classList.toggle('visible', val === '/');
}

function applySlash(cmd) {
  const input = document.getElementById('composeInput');
  const hint  = document.getElementById('composeSlashHint');
  if (cmd === 'urgent')  { setType('critical'); if (input) input.value = ''; }
  if (cmd === 'task')    { setType('ai_note');  if (input) input.value = ''; }
  if (cmd === 'info')    { setType('info');     if (input) input.value = ''; }
  if (cmd === 'warning') { setType('warning');  if (input) input.value = ''; }
  if (hint) hint.classList.remove('visible');
  if (input) input.focus();
}
