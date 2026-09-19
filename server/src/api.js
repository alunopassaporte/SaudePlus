/* ==========================================================================
   Saúde+ — Cliente HTTP + helpers de autenticação
   ========================================================================== */
(function () {
  var DEFAULT_BASE = 'http://localhost:4000';
  window.API_BASE = window.API_BASE || DEFAULT_BASE;

  var TOKEN_KEY = 'saude_token';
  var USER_KEY  = 'saude_user';

  function getToken()      { return localStorage.getItem(TOKEN_KEY); }
  function getStoredUser() { var r = localStorage.getItem(USER_KEY); return r ? JSON.parse(r) : null; }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  async function request(method, path, body) {
    var headers = { 'Content-Type': 'application/json' };
    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    var res = await fetch(window.API_BASE + path, {
      method: method,
      headers: headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if (res.status === 204) return null;

    var data = null;
    try { data = await res.json(); } catch (_e) {}

    if (!res.ok) {
      if (res.status === 401) clearSession();
      var message = (data && (data.error || data.message)) || ('Erro inesperado (' + res.status + ')');
      throw new Error(message);
    }
    return data;
  }

  window.apiGet    = function (path)       { return request('GET',    path);       };
  window.apiPost   = function (path, body) { return request('POST',   path, body); };
  window.apiPut    = function (path, body) { return request('PUT',    path, body); };
  window.apiPatch  = function (path, body) { return request('PATCH',  path, body); };
  window.apiDelete = function (path)       { return request('DELETE', path);       };

  window.authLogin = async function (email, password) {
    var data = await request('POST', '/auth/login', { email: email, password: password });
    setSession(data.token, data.user);
    return data;
  };

  window.authSignup = function (payload) { return request('POST', '/auth/signup', payload); };

  window.signOut = function () { clearSession(); location.href = 'auth.html'; };

  window.getSession = async function () {
    var token = getToken();
    var user  = getStoredUser();
    if (!token || !user) return null;
    return { token: token, user: user };
  };

  function roleRedirect(role) {
    if (role === 'admin')     location.replace('admin.html');
    else if (role === 'atendente') location.replace('atendente.html');
    else                      location.replace('dashboard.html');
  }

  window.requireAuth = async function () {
    var session = await getSession();
    if (!session) { location.replace('auth.html'); return null; }
    return session;
  };

  window.requireRole = async function (allowed) {
    var session = await getSession();
    if (!session) { location.replace('auth.html'); return null; }
    if (!allowed.includes(session.user.role)) {
      roleRedirect(session.user.role);
      return null;
    }
    return session;
  };

  window.isAdmin     = async function () {
    var s = await getSession(); return !!(s && s.user && s.user.role === 'admin');
  };
  window.isAtendente = async function () {
    var s = await getSession(); return !!(s && s.user && s.user.role === 'atendente');
  };
  window.isStaff     = async function () {
    var s = await getSession(); return !!(s && s.user && (s.user.role === 'atendente' || s.user.role === 'admin'));
  };

  window.fmtDate = function (iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit'
    });
  };

  var toastTimer;
  window.toast = function (message, type) {
    var el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = message;
    el.className = 'toast show' + (type==='error' ? ' toast-error' : type==='success' ? ' toast-success' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3500);
  };
})();
