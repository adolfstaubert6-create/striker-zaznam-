// ── STRIKER notifications.js ──
// In-app notification stack + browser Web Notifications
// Závisí na: escHtml() (index.html globals)

// ── Config ────────────────────────────────────────────────────────────────────
const NOTIF_DURATION = 5000   // ms before auto-dismiss
const NOTIF_MAX      = 4      // max visible at once

const NOTIF_TYPES = {
  new:    { icon: '✨', color: '#00c896', label: 'Nový záznam' },
  update: { icon: '✏️',  color: '#3b82f6', label: 'Zmenený záznam' },
  delete: { icon: '🗑️',  color: '#f97316', label: 'Zmazaný záznam' },
  task:   { icon: '✅',  color: '#a855f7', label: 'Úloha zmenená' },
  info:   { icon: 'ℹ️',  color: '#6b7280', label: 'Info' },
  error:  { icon: '⚠️',  color: '#ef4444', label: 'Chyba' },
}

// ── Local mutation tracker — prevents self-notifications ──────────────────────
// When the LOCAL user creates/updates/deletes, add the record ID here.
// The realtime handler checks this set and skips notification if ID is here.
const _localMutations = new Set()

function markLocalMutation(id) {
  _localMutations.add(id)
  // Auto-remove after 3s (realtime event usually arrives within 500ms)
  setTimeout(() => _localMutations.delete(id), 3000)
}

function isLocalMutation(id) {
  if (_localMutations.has(id)) {
    _localMutations.delete(id)  // consume it
    return true
  }
  return false
}

// ── Notification state ────────────────────────────────────────────────────────
let _notifs = []   // [{ id, type, message, detail, ts, timer }]

function showNotification({ type = 'info', message, detail = '' }) {
  const meta    = NOTIF_TYPES[type] || NOTIF_TYPES.info
  const id      = Date.now() + Math.random()
  const timer   = setTimeout(() => dismissNotification(id), NOTIF_DURATION)
  const notif   = { id, type, message: message || meta.label, detail, meta, timer }

  _notifs.unshift(notif)
  if (_notifs.length > NOTIF_MAX) {
    const old = _notifs.pop()
    clearTimeout(old.timer)
  }

  _renderNotifications()

  // Browser notification when window is not focused
  if (document.hidden || !document.hasFocus()) {
    _triggerBrowserNotif(meta, message || meta.label, detail)
  }
}

function dismissNotification(id) {
  const idx = _notifs.findIndex(n => n.id === id)
  if (idx === -1) return
  clearTimeout(_notifs[idx].timer)
  _notifs.splice(idx, 1)
  _renderNotifications()
}

// ── Render ────────────────────────────────────────────────────────────────────
function _renderNotifications() {
  const container = document.getElementById('notifContainer')
  if (!container) return
  container.innerHTML = ''

  _notifs.forEach(n => {
    const el = document.createElement('div')
    el.className = 'notif-item'
    el.style.borderLeftColor = n.meta.color
    el.innerHTML = `
      <div class="notif-top">
        <span class="notif-icon">${n.meta.icon}</span>
        <span class="notif-msg">${escHtml(n.message)}</span>
        <button class="notif-close" onclick="dismissNotification(${n.id})">✕</button>
      </div>
      ${n.detail ? `<div class="notif-detail">${escHtml(String(n.detail).slice(0, 80))}</div>` : ''}
      <div class="notif-bar" style="--notif-color:${n.meta.color};animation-duration:${NOTIF_DURATION}ms"></div>
    `
    container.appendChild(el)
  })
}

// ── Browser Web Notifications ─────────────────────────────────────────────────
let _browserNotifGranted = false

async function requestBrowserNotifPermission() {
  if (!('Notification' in window)) return
  if (Notification.permission === 'granted') { _browserNotifGranted = true; return }
  if (Notification.permission === 'denied') return
  const result = await Notification.requestPermission()
  _browserNotifGranted = result === 'granted'
}

function _triggerBrowserNotif(meta, title, body) {
  if (!_browserNotifGranted || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  try {
    const n = new Notification(`${meta.icon} ${title}`, {
      body:    body || '',
      icon:    '/icon-192x192.png',
      badge:   '/favicon-32x32.png',
      tag:     'striker-realtime',  // replaces previous notif of same type
      silent:  false,
    })
    n.onclick = () => { window.focus(); n.close() }
    setTimeout(() => n.close(), 6000)
  } catch (e) {
    console.warn('[notif] browser notif failed:', e.message)
  }
}

// ── Notification bell badge ───────────────────────────────────────────────────
let _unreadCount = 0

function _incrementUnread() {
  if (document.hasFocus()) return
  _unreadCount++
  _updateBellBadge()
}

function _updateBellBadge() {
  const badge = document.getElementById('notifBadge')
  if (!badge) return
  if (_unreadCount > 0) {
    badge.textContent = _unreadCount > 9 ? '9+' : _unreadCount
    badge.style.display = 'inline-flex'
  } else {
    badge.style.display = 'none'
  }
}

function clearUnreadCount() {
  _unreadCount = 0
  _updateBellBadge()
}

// Reset unread when window regains focus
window.addEventListener('focus', clearUnreadCount)

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  requestBrowserNotifPermission()
})
