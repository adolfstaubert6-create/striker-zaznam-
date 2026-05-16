// ── STRIKER Team Chat (inline panel) ──
// Prefix ic = inline-chat.  Závisí na: SUPABASE_URL, SUPABASE_KEY, _supabase,
// getAuthUserName() (auth.js), showToast() (app.js)

let _icMsgs     = [];
let _icType     = 'info';
let _icReady    = false;
let _icChannel  = null;
let _icLastDate = null;

// ── INIT (lazy — called by showTab('chat')) ───────────────────────────────────
async function icInit() {
  if (_icReady) return;
  _icReady = true;

  try {
    await _icLoad();
    _icRender();
    _icRealtime();
    _icScrollBottom();
  } catch (err) {
    console.error('[ic] init:', err);
  }
}

// ── DATA ─────────────────────────────────────────────────────────────────────
async function _icToken() {
  const { data: { session } } = await _supabase.auth.getSession();
  return session?.access_token || SUPABASE_KEY;
}

async function _icLoad() {
  const tok = await _icToken();
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/chat_messages?select=*&order=created_at.asc`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tok}` } }
  );
  if (!res.ok) throw new Error('DB ' + res.status);
  _icMsgs = await res.json();
}

// ── REALTIME ──────────────────────────────────────────────────────────────────
function _icRealtime() {
  _icChannel = window.supabase
    .createClient(SUPABASE_URL, SUPABASE_KEY)
    .channel('ic-chat-panel')
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_messages' },
      (p) => {
        if (_icMsgs.find(m => m.id === p.new.id)) return;
        _icMsgs.push(p.new);
        const atBottom = _icAtBottom();
        _icAppend(p.new);
        if (atBottom || p.new.author === getAuthUserName()) _icScrollBottom();
      }
    )
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'chat_messages' },
      (p) => {
        const idx = _icMsgs.findIndex(m => m.id === p.new.id);
        if (idx !== -1) _icMsgs[idx] = p.new;
        _icRender();
      }
    )
    .subscribe((status) => {
      const dot = document.getElementById('icDotRT');
      if (!dot) return;
      if (status === 'SUBSCRIBED') {
        dot.className = 'sys-dot';
        _icSetStatus('live');
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        dot.className = 'sys-dot err';
        _icSetStatus('offline');
      } else {
        dot.className = 'sys-dot dim';
      }
    });
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function _icRender() {
  const wrap = document.getElementById('icMessages');
  if (!wrap) return;
  _icLastDate = null;
  const self = getAuthUserName();

  if (!_icMsgs.length) {
    wrap.innerHTML = '<div class="chat-empty" id="icEmpty"><span class="chat-empty-icon">💬</span>Žiadne správy. Začni konverzáciu.</div>';
    return;
  }

  wrap.innerHTML = _icMsgs.map(m => _icBuildMsg(m, self, false)).join('');
  _icBindActions(wrap);
}

function _icAppend(msg) {
  const wrap = document.getElementById('icMessages');
  if (!wrap) return;

  const emptyEl = document.getElementById('icEmpty');
  if (emptyEl) emptyEl.remove();

  const self = getAuthUserName();
  const d = (msg.created_at || '').slice(0, 10);
  let prefix = '';
  if (d !== _icLastDate) { _icLastDate = d; prefix = _icDateSep(msg.created_at); }

  const frag = document.createElement('div');
  frag.innerHTML = prefix + _icBuildMsg(msg, self, true);
  _icBindActions(frag);
  while (frag.firstChild) wrap.appendChild(frag.firstChild);
}

// skipDateSep = true when caller already handles the separator
function _icBuildMsg(msg, self, skipDateSep) {
  let dateSep = '';
  if (!skipDateSep) {
    const d = (msg.created_at || '').slice(0, 10);
    if (d !== _icLastDate) { _icLastDate = d; dateSep = _icDateSep(msg.created_at); }
  }

  const isSelf    = msg.author === self;
  const authorCls = msg.author.toLowerCase().includes('staubert') ? 'st' : 'sz';
  const time      = _icFmtTime(msg.created_at);
  const pinMark   = msg.pinned ? '<span class="pin-mark">📌</span>' : '';
  const pinLabel  = msg.pinned ? '📌 Odopnúť' : '📌 Pripnúť';
  const pinCls    = msg.pinned ? 'msg-act-btn pinned-active' : 'msg-act-btn';
  let bubExtra    = ` bub-${msg.type}` + (msg.pinned ? ' is-pinned' : '');

  return `${dateSep}<div class="chat-msg ${isSelf ? 'self' : 'other'}">
  <div class="chat-msg-header">
    <span class="chat-msg-author ${authorCls}">${_icEsc(msg.author)}</span>
    <span class="chat-msg-time">${time}</span>
    <span class="chat-type-badge ctb-${msg.type}">${_icTypeLabel(msg.type)}</span>
  </div>
  <div class="chat-msg-bubble${bubExtra}">${pinMark}${_icEsc(msg.text)}</div>
  <div class="chat-msg-actions">
    <button class="${pinCls}" data-ic-pin="${_icEsc(msg.id)}">${pinLabel}</button>
  </div>
</div>`;
}

function _icBindActions(root) {
  root.querySelectorAll('[data-ic-pin]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); icTogglePin(btn.dataset.icPin); });
  });
}

// ── SEND ──────────────────────────────────────────────────────────────────────
async function icSend() {
  const input = document.getElementById('icInput');
  const text  = (input.value || '').trim();
  if (!text) return;

  const btn    = document.getElementById('icSend');
  btn.disabled = true;
  input.value  = '';
  icAutoResize(input);

  try {
    const tok = await _icToken();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/chat_messages`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${tok}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({ author: getAuthUserName(), text, type: _icType, pinned: false })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.message || `HTTP ${res.status}`);
    }
  } catch (err) {
    console.error('[ic] send:', err);
    showToast('❌ Chyba odosielania: ' + err.message);
    input.value = text;
    icAutoResize(input);
  } finally {
    btn.disabled = false;
    input.focus();
  }
}

function icKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); icSend(); }
}

function icAutoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden';
}

// ── TYPE SELECTOR ─────────────────────────────────────────────────────────────
function icSetType(type) {
  _icType = type;
  document.querySelectorAll('#chatPanel .type-btn').forEach(btn => {
    btn.className = btn.dataset.type === type ? `type-btn act-${type}` : 'type-btn';
  });
}

// ── PIN / UNPIN ───────────────────────────────────────────────────────────────
async function icTogglePin(id) {
  const msg = _icMsgs.find(m => m.id === id);
  if (!msg) return;
  const next = !msg.pinned;
  msg.pinned = next;

  try {
    const tok = await _icToken();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/chat_messages?id=eq.${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: next })
      }
    );
    if (!res.ok) throw new Error('PATCH ' + res.status);
    _icRender();
    showToast(next ? '📌 Správa pripnutá' : '🔓 Správa odopnutá');
  } catch (err) {
    msg.pinned = !next;
    showToast('❌ Chyba pri pripínaní');
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function _icAtBottom() {
  const el = document.getElementById('icMessages');
  return !el || (el.scrollHeight - el.scrollTop - el.clientHeight) < 90;
}

function _icScrollBottom() {
  const el = document.getElementById('icMessages');
  if (el) el.scrollTop = el.scrollHeight;
}

function _icSetStatus(s) {
  const el = document.getElementById('icOnlineStatus');
  if (!el) return;
  if (s === 'live')    { el.textContent = '● online';      el.style.color = 'var(--ok)'; }
  else                 { el.textContent = '● nedostupný'; el.style.color = 'var(--danger)'; }
}

function _icDateSep(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `<div class="chat-date-sep">${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}</div>`;
}

function _icFmtTime(iso) {
  if (!iso) return '–';
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  } catch { return '–'; }
}

function _icTypeLabel(t) {
  return { info:'info', warning:'upoz', critical:'krit', ai_note:'ai' }[t] || t;
}

function _icEsc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
