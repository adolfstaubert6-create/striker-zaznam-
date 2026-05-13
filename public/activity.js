// ── STRIKER activity.js ──
// Activity log — sleduje kto čo robil v appke
// Závisí na: SUPABASE_URL, SUPABASE_KEY (globals z index.html)

// ── Current user (persisted in localStorage) ─────────────────────────────────
const USERS = ['Staubert', 'Szabó']

function getCurrentUser() {
  return localStorage.getItem('striker_user') || 'Staubert'
}

function setCurrentUser(name) {
  localStorage.setItem('striker_user', name)
  const el = document.getElementById('currentUserLabel')
  if (el) el.textContent = name
  renderUserSelector()
}

function renderUserSelector() {
  const user = getCurrentUser()
  document.querySelectorAll('.user-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.user === user)
  })
}

// ── Action definitions ────────────────────────────────────────────────────────
const ACTION_META = {
  create:           { icon: '➕', label: 'Vytvorený záznam' },
  edit:             { icon: '✏️', label: 'Upravený záznam' },
  delete:           { icon: '🗑️', label: 'Zmazaný záznam' },
  delete_bulk:      { icon: '🗑️', label: 'Hromadné mazanie' },
  export_csv:       { icon: '⬇️', label: 'Export CSV' },
  export_json:      { icon: '⬇️', label: 'Export JSON' },
  ai_report:        { icon: '🧠', label: 'AI Report vygenerovaný' },
  ai_strategic:     { icon: '🔭', label: 'Strategický report vygenerovaný' },
  ai_consult:       { icon: '🤖', label: 'AI Konzultácia' },
  view_detail:      { icon: '👁', label: 'Otvorený detail' },
}

// ── Log to Supabase ───────────────────────────────────────────────────────────
async function logActivity(action, description = '', recordId = null) {
  const user = getCurrentUser()
  const meta = ACTION_META[action] || { icon: '•', label: action }

  const entry = {
    user_name:   user,
    action,
    icon:        meta.icon,
    description: description || meta.label,
    record_id:   recordId || null,
    created_at:  new Date().toISOString(),
  }

  // Fire-and-forget — don't block UI on logging failures
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
      method:  'POST',
      headers: {
        'apikey':        SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify(entry),
    })
  } catch (e) {
    console.warn('[activity] log failed:', e.message)
  }

  // Also append to local in-memory log for immediate UI update
  _activityCache.unshift(entry)
  if (_activityCache.length > 200) _activityCache.pop()
  _renderActivityIfOpen()
}

// ── Load from Supabase ────────────────────────────────────────────────────────
let _activityCache  = []
let _activityLoaded = false

async function loadActivityLog() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/activity_log?select=*&order=created_at.desc&limit=100`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    )
    if (!res.ok) throw new Error('HTTP ' + res.status)
    _activityCache  = await res.json()
    _activityLoaded = true
  } catch (e) {
    console.warn('[activity] load failed:', e.message)
  }
}

// ── Drawer UI ─────────────────────────────────────────────────────────────────
let _activityOpen = false

async function toggleActivityLog() {
  _activityOpen = !_activityOpen
  const drawer = document.getElementById('activityDrawer')
  if (!drawer) return

  if (_activityOpen) {
    drawer.style.display = 'flex'
    if (!_activityLoaded) {
      document.getElementById('activityList').innerHTML =
        '<div class="activity-loading">Načítavam...</div>'
      await loadActivityLog()
    }
    renderActivityLog()
  } else {
    drawer.style.display = 'none'
  }
}

function _renderActivityIfOpen() {
  if (_activityOpen) renderActivityLog()
}

function renderActivityLog() {
  const list = document.getElementById('activityList')
  if (!list) return

  if (!_activityCache.length) {
    list.innerHTML = '<div class="activity-empty">Žiadna aktivita</div>'
    return
  }

  // Group by date
  const groups = {}
  _activityCache.forEach(e => {
    const day = e.created_at ? e.created_at.slice(0, 10) : 'Neznáme'
    if (!groups[day]) groups[day] = []
    groups[day].push(e)
  })

  list.innerHTML = ''
  Object.entries(groups).forEach(([day, entries]) => {
    const label = document.createElement('div')
    label.className = 'activity-day-label'
    label.textContent = formatActivityDay(day)
    list.appendChild(label)

    entries.forEach(e => {
      const row  = document.createElement('div')
      row.className = 'activity-row'
      const userCls = e.user_name === 'Staubert' ? 'activity-user st' : 'activity-user sz'

      const time = e.created_at
        ? new Date(e.created_at).toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit' })
        : ''

      row.innerHTML = `
        <span class="activity-icon">${e.icon || '•'}</span>
        <div class="activity-body">
          <div class="activity-desc">${escHtml(e.description || '')}</div>
          <div class="activity-meta">
            <span class="${userCls}">${escHtml(e.user_name || '')}</span>
            <span class="activity-time">${time}</span>
          </div>
        </div>`
      list.appendChild(row)
    })
  })
}

function formatActivityDay(dateStr) {
  try {
    const d   = new Date(dateStr)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const yest  = new Date(today); yest.setDate(today.getDate() - 1)
    const dDay  = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (dDay.getTime() === today.getTime()) return 'Dnes'
    if (dDay.getTime() === yest.getTime())  return 'Včera'
    return d.toLocaleDateString('sk', { day: 'numeric', month: 'long' })
  } catch { return dateStr }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderUserSelector()
  const label = document.getElementById('currentUserLabel')
  if (label) label.textContent = getCurrentUser()
})
