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
  const isSelf = msg.author === self;
  const authorClass = msg.author.toLowerCase().includes('staubert') ? 'st' : 'sz';
  const timeStr = _fmtTime(msg.created_at);
  const selectedClass = _selectedIds.has(msg.id) ? ' selected' : '';

  let bubbleExtra = ` bub-${msg.type}`;
  if (msg.pinned) bubbleExtra += ' is-pinned';

  const pinMark = msg.pinned ? '<span class="pin-mark">📌</span>' : '';
  const pinBtnClass = msg.pinned ? 'msg-act-btn pinned-active' : 'msg-act-btn';
  const pinLabel = msg.pinned ? '📌 Odopnúť' : '📌 Pripnúť';

  const selBtnClass = _selectedIds.has(msg.id) ? 'msg-act-btn selected-active' : 'msg-act-btn';
  const selLabel = _selectedIds.has(msg.id) ? '☑ Odznačiť' : '☐ Vybrať';

  const dateSep = (!skipDateSep && _needDateSep(msg.created_at)) ? _buildDateSep(msg.created_at) : '';

  return `${dateSep}<div class="chat-msg ${isSelf ? 'self' : 'other'}${selectedClass}" data-msg-id="${escHtml(msg.id)}">
  <div class="chat-msg-header">
    <span class="chat-msg-author ${authorClass}">${escHtml(msg.author)}</span>
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
</div>`;
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
  ['entryTitle','entrySummary','entryDecisions','entryTasks','entryCritical'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('entryModalOverlay').classList.add('show');
  setTimeout(() => document.getElementById('entryTitle')?.focus(), 80);
}

function closeEntryModal() {
  document.getElementById('entryModalOverlay').classList.remove('show');
}

function entryModalBgClick(e) {
  if (e.target === document.getElementById('entryModalOverlay')) closeEntryModal();
}

async function saveEntry() {
  const title = (document.getElementById('entryTitle')?.value || '').trim();
  if (!title) { _showToast('Zadaj názov záznamu'); document.getElementById('entryTitle')?.focus(); return; }

  const btn = document.getElementById('btnSaveEntry');
  btn.disabled = true;
  btn.textContent = '⏳ Ukladám...';

  const payload = {
    message_ids:     [..._selectedIds],
    title,
    summary:         (document.getElementById('entrySummary')?.value || '').trim() || null,
    decisions:       (document.getElementById('entryDecisions')?.value || '').trim() || null,
    tasks:           (document.getElementById('entryTasks')?.value || '').trim() || null,
    critical_points: (document.getElementById('entryCritical')?.value || '').trim() || null,
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
    closeEntryModal();
    cancelSelectMode();
    _showToast('🔗 Záznam uložený');
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
  return { info:'info', warning:'warn', critical:'crit', ai_note:'ai' }[type] || type;
}

function _setDBStatus(ok) {
  const dot = document.getElementById('dotDB');
  if (dot) dot.className = ok ? 'sys-dot' : 'sys-dot err';
}

function _setOnlineLabel(state) {
  const el = document.getElementById('chatOnlineIndicator');
  if (!el) return;
  if (state === 'live')    { el.textContent = '● online'; el.style.color = 'var(--ok)'; }
  else if (state === 'offline') { el.textContent = '● offline'; el.style.color = 'var(--danger)'; }
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
