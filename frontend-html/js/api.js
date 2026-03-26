/**
 * Save Point Finanças — API Client
 *
 * FIX COOLIFY: API_BASE é detectado dinamicamente.
 * No Coolify os serviços têm domínios separados:
 *   Frontend: https://savepoint.161.153.204.226.sslip.io
 *   Backend:  https://api.161.153.204.226.sslip.io
 *
 * O frontend detecta o padrão e chama o backend diretamente via HTTPS,
 * eliminando dependência do proxy Nginx interno (que pode falhar no Coolify).
 */

function detectApiBase() {
  const { protocol, hostname, port } = window.location;

  // Desenvolvimento local → usa proxy Nginx
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return '/api/v1';
  }

  // Padrão Coolify: frontend tem subdomínio, backend tem prefixo "api."
  // Ex: savepoint.161.153.204.226.sslip.io → api.161.153.204.226.sslip.io
  const parts = hostname.split('.');
  if (parts.length >= 2) {
    const baseHost = parts.slice(1).join('.'); // remove primeiro subdomínio
    return `${protocol}//api.${baseHost}/api/v1`;
  }

  // Fallback: mesmo host, path relativo
  return '/api/v1';
}

const API_BASE = detectApiBase();

// Log para diagnóstico (visível no console do browser)
console.info(`[SavePoint] API_BASE detectado: ${API_BASE}`);

// ── Auth ──────────────────────────────────────────────────────────────────────

export const Auth = {
  getToken()        { return localStorage.getItem('ff_access_token'); },
  getRefreshToken() { return localStorage.getItem('ff_refresh_token'); },
  getUser() {
    try { return JSON.parse(localStorage.getItem('ff_user') || 'null'); }
    catch { return null; }
  },
  setTokens(access, refresh) {
    localStorage.setItem('ff_access_token', access);
    localStorage.setItem('ff_refresh_token', refresh);
  },
  setUser(user) { localStorage.setItem('ff_user', JSON.stringify(user)); },
  clear() {
    localStorage.removeItem('ff_access_token');
    localStorage.removeItem('ff_refresh_token');
    localStorage.removeItem('ff_user');
  },
  isLoggedIn()    { return !!this.getToken(); },
  isSuperadmin()  { return this.getUser()?.role === 'superadmin'; },
  requireAuth() {
    if (!this.isLoggedIn()) { window.location.href = '/login.html'; return false; }
    return true;
  },
};

// ── Fetch core ────────────────────────────────────────────────────────────────

async function request(method, path, body = null, skipRefresh = false) {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const cfg = { method, headers };
  if (body) cfg.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, cfg);
  } catch (networkErr) {
    // Falha de rede / CORS / backend offline
    throw new ApiError(
      `Sem conexão com o backend (${API_BASE}). Verifique se o serviço está rodando no Coolify.`,
      0
    );
  }

  // Tentar refresh automático em 401
  if (res.status === 401 && !skipRefresh) {
    const rt = Auth.getRefreshToken();
    if (rt) {
      try {
        const rr = await fetch(
          `${API_BASE}/auth/refresh?refresh_token=${encodeURIComponent(rt)}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' } }
        );
        if (rr.ok) {
          const rd = await rr.json();
          Auth.setTokens(rd.access_token, rd.refresh_token);
          headers['Authorization'] = `Bearer ${rd.access_token}`;
          res = await fetch(`${API_BASE}${path}`, { ...cfg, headers });
        }
      } catch (_) { /* refresh falhou */ }
    }

    // Ainda 401 após tentativa de refresh → redirecionar
    if (res.status === 401) {
      Auth.clear();
      window.location.href = '/login.html';
      throw new ApiError('Sessão expirada. Faça login novamente.', 401);
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `Erro HTTP ${res.status}` }));
    throw new ApiError(err.detail || `Erro HTTP ${res.status}`, res.status);
  }

  if (res.status === 204) return null;
  return res.json();
}

async function tryRefresh() {
  const rt = Auth.getRefreshToken();
  if (!rt) return false;
  try {
    const res = await fetch(
      `${API_BASE}/auth/refresh?refresh_token=${encodeURIComponent(rt)}`,
      { method: 'POST' }
    );
    if (!res.ok) return false;
    const data = await res.json();
    Auth.setTokens(data.access_token, data.refresh_token);
    return true;
  } catch { return false; }
}

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

const get  = (path, params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  ).toString();
  return request('GET', qs ? `${path}?${qs}` : path);
};
const post  = (path, body)  => request('POST',   path, body);
const put   = (path, body)  => request('PUT',    path, body);
const patch = (path, body)  => request('PATCH',  path, body);
const del   = (path)        => request('DELETE', path);

// ── Endpoints ─────────────────────────────────────────────────────────────────

export const authApi = {
  login:          (email, password)      => post('/auth/login',           { email, password }),
  register:       (workspace_name, name, email, password) =>
                  post('/auth/register', { workspace_name, name, email, password }),
  me:             ()                     => get('/auth/me'),
  forgotPassword: (email)                => post('/auth/forgot-password', { email }),
  resetPassword:  (token, new_password)  => post('/auth/reset-password',  { token, new_password }),
  changePassword: (current_password, new_password) =>
                  post('/auth/change-password', { current_password, new_password }),
};

export const transactionsApi = {
  list:   (params = {}) => get('/transactions', params),
  get:    (id)          => get(`/transactions/${id}`),
  create: (body)        => post('/transactions', body),
  update: (id, body)    => put(`/transactions/${id}`, body),
  delete: (id, all = false) =>
    del(`/transactions/${id}${all ? '?delete_all_installments=true' : ''}`),
};

export const categoriesApi = {
  list:   ()           => get('/categories'),
  create: (body)       => post('/categories', body),
  update: (id, body)   => put(`/categories/${id}`, body),
  delete: (id)         => del(`/categories/${id}`),
};

export const accountsApi = {
  list:   ()           => get('/accounts'),
  create: (body)       => post('/accounts', body),
  update: (id, body)   => put(`/accounts/${id}`, body),
  delete: (id)         => del(`/accounts/${id}`),
};

export const cardsApi = {
  list:   ()           => get('/cards'),
  create: (body)       => post('/cards', body),
  update: (id, body)   => put(`/cards/${id}`, body),
  delete: (id)         => del(`/cards/${id}`),
};

export const subscriptionsApi = {
  list:                (params = {}) => get('/subscriptions/', params),
  create:              (body)        => post('/subscriptions/', body),
  update:              (id, body)    => put(`/subscriptions/${id}`, body),
  delete:              (id)          => del(`/subscriptions/${id}`),
  generateTransaction: (id)          => post(`/subscriptions/${id}/generate-transaction`),
};

export const installmentsApi = {
  list:    (params = {})       => get('/installments', params),
  byMonth: (year, month)       => get('/installments/by-month', { year, month }),
};

export const reportsApi = {
  summary:          (year, month)                  => get('/reports/summary',           { year, month }),
  monthlyEvolution: (months = 12, future_months = 0) =>
                    get('/reports/monthly-evolution', { months, future_months }),
  byCategory:       (year, month, type = 'expense') => get('/reports/by-category',     { year, month, type }),
  topTransactions:  (year, month, limit = 10)        => get('/reports/top-transactions', { year, month, limit }),
  cardsUsage:       (year, month)                  => get('/reports/cards-usage',       { year, month }),
};

export const adminApi = {
  stats:        ()           => get('/admin/stats'),
  listTenants:  (params = {}) => get('/admin/tenants', params),
  getTenant:    (id)         => get(`/admin/tenants/${id}`),
  updateTenant: (id, body)   => patch(`/admin/tenants/${id}`, body),
  deleteTenant: (id)         => del(`/admin/tenants/${id}`),
  listUsers:    (params = {}) => get('/admin/users', params),
  updateUser:   (id, body)   => patch(`/admin/users/${id}`, body),
  deleteUser:   (id)         => del(`/admin/users/${id}`),
};

export const goalsApi = {
  list:   ()           => get('/goals'),
  create: (body)       => post('/goals', body),
  update: (id, body)   => put(`/goals/${id}`, body),
  delete: (id)         => del(`/goals/${id}`),
};
