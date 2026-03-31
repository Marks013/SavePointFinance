/**
 * Save Point Finanças API Client
 * Central module for all API calls to the FastAPI backend.
 *
 * BUGFIX: Auto-refresh on 401 agora verifica se existe refresh token ANTES
 * de tentar o refresh. Sem isso, o login com credenciais erradas entrava em
   * loop: 401 → tryRefresh falha → Auth.clear() → redirect /login → reload.
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
  isAdmin() { 
    const role = this.getUser()?.role;
    return role === 'superadmin' || role === 'admin';
  },
  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '/login';
      return false;
    }
    return true;
  },
  requireSuperadmin() {
    if (!this.isLoggedIn() || !this.isSuperadmin()) {
      window.location.href = '/dashboard';
      return false;
    }
    return true;
  },
};

// ── Health Check ─────────────────────────────────────────────────────────────

export async function checkBackendHealth() {
  try {
    const res = await fetch('/api/health', { method: 'GET', signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Global Error Banner ───────────────────────────────────────────────────────

export function showGlobalError(message) {
  let banner = document.getElementById('_global_err_banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = '_global_err_banner';
    banner.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; z-index: 9998;
      background: #2D0A0F; border-bottom: 2px solid #FF4D65;
      color: #FF4D65; font-size: 0.8125rem; font-family: inherit;
      padding: 10px 20px; display: flex; align-items: center; gap: 10px;
    `;
    banner.innerHTML = `
      <span style="font-size:1rem">⚠️</span>
      <span id="_global_err_msg"></span>
      <button onclick="this.parentElement.remove()" style="
        margin-left:auto; background:none; border:1px solid #FF4D65;
        color:#FF4D65; cursor:pointer; padding:2px 8px; border-radius:3px;
        font-size:0.75rem;
      ">✕ Fechar</button>
    `;
    document.body.prepend(banner);
  }
  document.getElementById('_global_err_msg').textContent = message;
}

export function hideGlobalError() {
  document.getElementById('_global_err_banner')?.remove();
}

// ── Core Fetch Wrapper ───────────────────────────────────────────────────────

async function request(method, path, body = null, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = Auth.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);

  try {
    let res = await fetch(`${API_BASE}${path}`, config);

    // ── Auto-refresh on 401 ───────────────────────────────────────────────────
    if (res.status === 401 && !options.skipRefresh) {
      const rt = Auth.getRefreshToken();
      if (rt) {
        const refreshed = await tryRefresh();
        if (refreshed) {
          headers['Authorization'] = `Bearer ${Auth.getToken()}`;
          res = await fetch(`${API_BASE}${path}`, { ...config, headers });
        } else {
          Auth.clear();
          window.location.href = '/login';
          return null;
        }
      }
    }
    // ── fim auto-refresh ───────────────────────────────────────────────────────

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `Erro HTTP ${res.status}` }));
      throw new ApiError(err.detail || `Erro HTTP ${res.status}`, res.status);
    }

    if (res.status === 204) return null;
    return res.json();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // Network / CORS error
    throw new ApiError(
      'Sem conexão com o servidor. Verifique sua internet.',
      0
    );
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

// Wrapper para tratar erros automaticamente com toasts
async function requestWithToast(method, path, body = null, options = {}) {
  try {
    return await request(method, path, body, options);
  } catch (e) {
    if (window.showApiError) {
      window.showApiError(e);
    } else {
      console.error('API Error:', e);
    }
    throw e;
  }
}

const get = (path, params = {}) => {
  const filteredParams = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  const qs = new URLSearchParams(filteredParams).toString();
  return request('GET', qs ? `${path}?${qs}` : path);
};
const post = (path, body) => request('POST', path, body);
const put = (path, body) => request('PUT', path, body);
const patch = (path, body) => request('PATCH', path, body);
const del = (path) => request('DELETE', path);

// ── Auth Endpoints ───────────────────────────────────────────────────────────

export const authApi = {
  login: (email, password) => post('/auth/login', { email, password }),
  register: (workspace_name, name, email, password, confirm_password) =>
    post('/auth/register', { workspace_name, name, email, password, confirm_password }),
  me: () => get('/auth/me'),
  forgotPassword: (email) => post('/auth/forgot-password', { email }),
  resetPassword: (token, new_password) => post('/auth/reset-password', { token, new_password }),
  changePassword: (current_password, new_password) =>
    post('/auth/change-password', { current_password, new_password }),
  listUsers: () => get('/auth/users'),
  updateRole: (userId, role) => patch(`/auth/users/${userId}/role`, { role }),
  toggleActive: (userId, isActive) => patch(`/auth/users/${userId}/active`, { is_active: isActive }),
  createInvite: (email) => post('/auth/invite', { email }),
  listInvites: () => get('/auth/invites'),
  revokeInvite: (id) => del(`/auth/invites/${id}`),
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
  monthlyEvolution: (months = 12, future_months = 0) =>
    get('/reports/monthly-evolution', { months, future_months }),
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
  deposit: (id, amount, description) => post(`/goals/${id}/deposit`, { amount, description }),
};

// ── Data Export/Import ───────────────────────────────────────────────────────

export const dataApi = {
  export: (params = {}) => get('/data/export', params),
  import: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return fetch(`${API_BASE}/data/import`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Auth.getToken()}` },
      body: formData,
    }).then(res => res.json());
  },
  getTemplate: () => get('/data/import/template'),
};

// ── Tenant Users (Admin) ───────────────────────────────────────────────────────

export const tenantApi = {
  listUsers: () => get('/auth/users'),
  updateRole: (userId, role) => patch(`/auth/users/${userId}/role`, { role }),
  toggleActive: (userId, isActive) => patch(`/auth/users/${userId}/active`, { is_active: isActive }),
};

// ── Invites (Admin) ────────────────────────────────────────────────────────────

export const inviteApi = {
  create: (email) => post('/auth/invite', { email }),
  list: () => get('/auth/invites'),
  revoke: (id) => del(`/auth/invites/${id}`),
};

// ── Plans ───────────────────────────────────────────────────────────────────────

export const plansApi = {
  list: () => get('/admin/plans'),
};
