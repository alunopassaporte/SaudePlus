/* ==========================================================================
   Saúde+ — Cliente HTTP + helpers de autenticação
   Usado por auth.html, dashboard.html e admin.html.
   Define window.API_BASE antes desse script se a API não estiver em
   http://localhost:4000.
   ========================================================================== */
(function () {
  var DEFAULT_BASE = 'http://localhost:4000';
  window.API_BASE = window.API_BASE || DEFAULT_BASE;

  var TOKEN_KEY = 'saude_token';
  var USER_KEY = 'saude_user';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getStoredUser() {
    var raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }
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
    try { data = await res.json(); } catch (_e) { /* resposta sem corpo JSON */ }

    if (!res.ok) {
      if (res.status === 401) clearSession();
      var message = (data && (data.error || data.message)) || ('Erro inesperado (' + res.status + ')');
      throw new Error(message);
    }
    return data;
  }

  // ---- HTTP genérico ----
  window.apiGet = function (path) { return request('GET', path); };
  window.apiPost = function (path, body) { return request('POST', path, body); };
  window.apiPut = function (path, body) { return request('PUT', path, body); };
  window.apiPatch = function (path, body) { return request('PATCH', path, body); };
  window.apiDelete = function (path) { return request('DELETE', path); };

  // ---- Autenticação ----
  window.authLogin = async function (email, password) {
    var data = await request('POST', '/auth/login', { email: email, password: password });
    setSession(data.token, data.user);
    return data;
  };

  window.authSignup = function (payload) {
    return request('POST', '/auth/signup', payload);
  };

  window.signOut = function () {
    clearSession();
    location.href = 'auth.html';
  };

  // getSession é assíncrono de propósito: mantém espaço para, no futuro,
  // revalidar o token contra GET /auth/me em vez de confiar só no cache local.
  window.getSession = async function () {
    var token = getToken();
    var user = getStoredUser();
    if (!token || !user) return null;
    return { token: token, user: user };
  };

  window.requireAuth = async function () {
    var session = await getSession();
    if (!session) {
      location.replace('auth.html');
      return null;
    }
    return session;
  };

  function redirectByRole(role) {
    if (role === 'admin') {
      location.replace('admin.html');
    } else if (role === 'atendente') {
      location.replace('atendente.html');
    } else {
      location.replace('dashboard.html');
    }
  }

  window.requireRole = async function (allowedRoles) {
    var session = await getSession();
    if (!session) {
      location.replace('auth.html');
      return null;
    }
    if (!Array.isArray(allowedRoles) || !allowedRoles.includes(session.user.role)) {
      redirectByRole(session.user.role);
      return null;
    }
    return session;
  };

  window.isAdmin = async function () {
    var session = await getSession();
    return !!(session && session.user && session.user.role === 'admin');
  };

  // ---- Helpers de UI ----
  window.fmtDate = function (iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  var toastTimer;
  window.toast = function (message, type) {
    var el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = 'toast show' + (type === 'error' ? ' toast-error' : type === 'success' ? ' toast-success' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3500);
  };
})();
