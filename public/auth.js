// ── STRIKER auth.js ──
// Supabase Auth — email/password prihlasenie
// Závisí na: SUPABASE_URL, SUPABASE_KEY, window.supabase (CDN)

let _authClient  = null
let _currentUser = null   // Supabase User object

// ── Init auth client ──────────────────────────────────────────────────────────
function _getAuthClient() {
  if (_authClient) return _authClient
  _authClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  return _authClient
}

// ── Public API ────────────────────────────────────────────────────────────────
function getAuthUser()     { return _currentUser }
function getAuthUserName() { return _displayName(_currentUser) }
function getAuthEmail()    { return _currentUser?.email || '' }
function isAuthenticated() { return !!_currentUser }

function _displayName(user) {
  if (!user) return 'Neznámy'
  const meta = user.user_metadata || {}
  if (meta.display_name) return meta.display_name
  if (meta.name)         return meta.name
  const email = user.email || ''
  const local = email.split('@')[0].toLowerCase()
  if (local.includes('staubert')) return 'Staubert'
  if (local.includes('szabo') || local.includes('szabó')) return 'Szabó'
  return local.charAt(0).toUpperCase() + local.slice(1)
}

// ── Sign in ───────────────────────────────────────────────────────────────────
async function signIn(email, password) {
  const client = _getAuthClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(_translateError(error.message))
  return data.user
}

// ── Sign out ──────────────────────────────────────────────────────────────────
async function signOut() {
  const client = _getAuthClient()
  await client.auth.signOut()
  _currentUser = null
  _showLoginScreen()
}

// ── Session check + auth state listener ──────────────────────────────────────
async function initAuth() {
  const client = _getAuthClient()

  // Restore existing session
  const { data: { session } } = await client.auth.getSession()
  if (session?.user) {
    _currentUser = session.user
    _onAuthSuccess()
    return
  }

  // No session — show login
  _showLoginScreen()

  // Listen for auth changes
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      _currentUser = session.user
      _onAuthSuccess()
    } else if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
      _currentUser = null
      _showLoginScreen()
    } else if (event === 'TOKEN_REFRESHED' && session?.user) {
      _currentUser = session.user
    }
  })
}

// ── On successful auth ────────────────────────────────────────────────────────
function _onAuthSuccess() {
  _hideLoginScreen()
  _updateTopbarUser()
  _initApp()   // kick off the main app init (defined in index.html)
}

function _updateTopbarUser() {
  const name = getAuthUserName()
  const label = document.getElementById('currentUserLabel')
  if (label) label.textContent = name

  // Highlight correct ST/SZ button (read-only now — reflects auth identity)
  document.querySelectorAll('.user-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.user === name)
  })

  // Sync activity.js localStorage for display consistency
  localStorage.setItem('striker_user', name)
}

// ── Login screen UI ───────────────────────────────────────────────────────────
function _showLoginScreen() {
  document.getElementById('loginScreen').style.display  = 'flex'
  document.getElementById('appWrapper').style.display   = 'none'
  document.getElementById('loginEmail').focus()
}

function _hideLoginScreen() {
  document.getElementById('loginScreen').style.display = 'none'
  document.getElementById('appWrapper').style.display  = 'block'
}

// ── Login form handler ────────────────────────────────────────────────────────
async function handleLoginSubmit(e) {
  e && e.preventDefault()
  const email    = document.getElementById('loginEmail').value.trim()
  const password = document.getElementById('loginPassword').value
  const errEl    = document.getElementById('loginError')
  const btn      = document.getElementById('loginBtn')

  if (!email || !password) {
    errEl.textContent = 'Vyplň email a heslo.'
    return
  }

  btn.disabled    = true
  btn.textContent = '⏳ Prihlasovanie...'
  errEl.textContent = ''

  try {
    await signIn(email, password)
    // onAuthStateChange will fire and call _onAuthSuccess
  } catch (err) {
    errEl.textContent   = err.message
    btn.disabled        = false
    btn.textContent     = 'Prihlásiť sa'
    document.getElementById('loginPassword').value = ''
    document.getElementById('loginPassword').focus()
  }
}

// ── Error translation ────────────────────────────────────────────────────────
function _translateError(msg) {
  if (!msg) return 'Neznáma chyba'
  const m = msg.toLowerCase()
  if (m.includes('invalid login') || m.includes('invalid credentials')) return 'Nesprávny email alebo heslo.'
  if (m.includes('email not confirmed'))  return 'Email nie je potvrdený. Skontroluj schránku.'
  if (m.includes('too many requests'))    return 'Príliš veľa pokusov. Skús znova neskôr.'
  if (m.includes('network'))              return 'Sieťová chyba. Skontroluj pripojenie.'
  return msg
}

// ── Password visibility toggle ───────────────────────────────────────────────
function togglePasswordVisibility() {
  const inp = document.getElementById('loginPassword')
  const btn = document.getElementById('togglePwBtn')
  if (inp.type === 'password') {
    inp.type = 'text'; btn.textContent = '🙈'
  } else {
    inp.type = 'password'; btn.textContent = '👁'
  }
}
