/**
 * Save Point Finanças API Client
 * Central module for all API calls to the FastAPI backend.
 */

const API_BASE = '/api/v1';

// ── Token Management ─────────────────────────────────────────────────────────

export const Auth = {
  getToken() { return localStorage.getItem('ff_access_token'); },
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
  isLoggedIn() { return !!this.getToken(); },
  isSuperadmin() { return this.getUser()?.role === 'superadmin'; },
  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '/login.html';
      return false;
    }
    return true;
  },
  requireSuperadmin() {
    if (!this.isLoggedIn() || !this.isSuperadmin()) {
      window.location.href = '/dashboard.html';
      return false;
    }
    return true;
  },
};

// ── Core Fetch Wrapper ───────────────────────────────────────────────────────

async function request(method, path, body = null, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = Auth.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);

  try {
    let res = await fetch(`${API_BASE}${path}`, config);

    // Auto-refresh on 401
    if (res.status === 401 && !options.skipRefresh) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        headers['Authorization'] = `Bearer ${Auth.getToken()}`;
        res = await fetch(`${API_BASE}${path}`, { ...config, headers });
      } else {
        Auth.clear();
        window.location.href = '/login.html';
        return null;
      }
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new ApiError(err.detail || 'Erro desconhecido', res.status);
    }

    if (res.status === 204) return null;
    return res.json();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('Sem conexão com o servidor. Verifique se o backend está rodando.', 0);
  }
}

async function tryRefresh() {
  const rt = Auth.getRefreshToken();
  if (!rt) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh?refresh_token=${encodeURIComponent(rt)}`, {
      method: 'POST',
    });
    if (!res.ok) return false;
    const data = await res.json();
    Auth.setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const get = (path, params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return request('GET', qs ? `${path}?${qs}` : path);
};
const post = (path, body) => request('POST', path, body);
const put = (path, body) => request('PUT', path, body);
const patch = (path, body) => request('PATCH', path, body);
const del = (path) => request('DELETE', path);

// ── Auth Endpoints ───────────────────────────────────────────────────────────

export const authApi = {
  login: (email, password) => post('/auth/login', { email, password }),
  register: (workspace_name, name, email, password) =>
    post('/auth/register', { workspace_name, name, email, password }),
  me: () => get('/auth/me'),
  forgotPassword: (email) => post('/auth/forgot-password', { email }),
  resetPassword: (token, new_password) => post('/auth/reset-password', { token, new_password }),
  changePassword: (current_password, new_password) =>
    post('/auth/change-password', { current_password, new_password }),
};

// ── Transactions ─────────────────────────────────────────────────────────────

export const transactionsApi = {
  list: (params = {}) => get('/transactions', params),
  get: (id) => get(`/transactions/${id}`),
  create: (body) => post('/transactions', body),
  update: (id, body) => put(`/transactions/${id}`, body),
  delete: (id, deleteAll = false) =>
    del(`/transactions/${id}${deleteAll ? '?delete_all_installments=true' : ''}`),
};

// ── Categories ───────────────────────────────────────────────────────────────

export const categoriesApi = {
  list: () => get('/categories'),
  create: (body) => post('/categories', body),
  update: (id, body) => put(`/categories/${id}`, body),
  delete: (id) => del(`/categories/${id}`),
};

// ── Accounts & Cards ─────────────────────────────────────────────────────────

export const accountsApi = {
  list: () => get('/accounts'),
  create: (body) => post('/accounts', body),
  update: (id, body) => put(`/accounts/${id}`, body),
  delete: (id) => del(`/accounts/${id}`),
};

export const cardsApi = {
  list: () => get('/cards'),
  create: (body) => post('/cards', body),
  update: (id, body) => put(`/cards/${id}`, body),
  delete: (id) => del(`/cards/${id}`),
};

// ── Subscriptions ────────────────────────────────────────────────────────────

export const subscriptionsApi = {
  list: (params = {}) => get('/subscriptions/', params),
  create: (body) => post('/subscriptions/', body),
  update: (id, body) => put(`/subscriptions/${id}`, body),
  delete: (id) => del(`/subscriptions/${id}`),
  generateTransaction: (id) => post(`/subscriptions/${id}/generate-transaction`),
};

// ── Installments ─────────────────────────────────────────────────────────────

export const installmentsApi = {
  list: (params = {}) => get('/installments', params),
  byMonth: (year, month) => get('/installments/by-month', { year, month }),
};

// ── Reports ──────────────────────────────────────────────────────────────────

export const reportsApi = {
  summary: (year, month) => get('/reports/summary', { year, month }),
  monthlyEvolution: (months = 12, future_months = 0) => get('/reports/monthly-evolution', { months, future_months }),
  byCategory: (year, month, type = 'expense') =>
    get('/reports/by-category', { year, month, type }),
  topTransactions: (year, month, limit = 10) =>
    get('/reports/top-transactions', { year, month, limit }),
  cardsUsage: (year, month) => get('/reports/cards-usage', { year, month }),
};

// ── Admin ────────────────────────────────────────────────────────────────────

export const adminApi = {
  stats: () => get('/admin/stats'),
  listTenants: (params = {}) => get('/admin/tenants', params),
  getTenant: (id) => get(`/admin/tenants/${id}`),
  updateTenant: (id, body) => patch(`/admin/tenants/${id}`, body),
  deleteTenant: (id) => del(`/admin/tenants/${id}`),
  listUsers: (params = {}) => get('/admin/users', params),
  updateUser: (id, body) => patch(`/admin/users/${id}`, body),
  deleteUser: (id) => del(`/admin/users/${id}`),
};

// ── Goals ─────────────────────────────────────────────────────────────────────

export const goalsApi = {
  list: () => get('/goals'),
  create: (body) => post('/goals', body),
  update: (id, body) => put(`/goals/${id}`, body),
  delete: (id) => del(`/goals/${id}`),
};
