/**
 * Save Point Finanças API Client
 * Central module for all API calls to the FastAPI backend.
 *
 * BUG FIX #16: O app usa autenticação via cookies HttpOnly definidos pelo servidor
 * em /login. Cookies HttpOnly não são acessíveis via JavaScript — o browser os
 * envia automaticamente em cada requisição quando `credentials: 'include'` é usado.
 *
 * Correções aplicadas:
 * - Removidos `localStorage.getItem('ff_access_token')` e header `Authorization: Bearer`
 * - Todas as chamadas fetch agora usam `credentials: 'include'` para enviar cookies
 * - Auth.getToken() sempre retorna null (tokens não são legíveis por JS em cookies HttpOnly)
 * - Auth.isLoggedIn() tenta verificar via /api/v1/auth/me ao invés de localStorage
 * - Removida lógica de auto-refresh via token (o servidor renova via cookie refresh)
 */

const API_BASE = '/api/v1';

// ── Auth State (client-side apenas, sem acesso aos tokens HttpOnly) ──────────

export const Auth = {
  // Tokens ficam em cookies HttpOnly — JS não pode lê-los.
  // Estes métodos existem apenas para compatibilidade com código legado.
  getToken()        { return null; },
  getRefreshToken() { return null; },

  getUser() {
    try { return JSON.parse(sessionStorage.getItem('ff_user') || 'null'); }
    catch { return null; }
  },

  setUser(user) { sessionStorage.setItem('ff_user', JSON.stringify(user)); },

  // Não armazena mais tokens — o servidor gerencia via Set-Cookie
  setTokens(_access, _refresh) { /* no-op: tokens ficam em cookies HttpOnly */ },

  clear() {
    sessionStorage.removeItem('ff_user');
    // Para logout real, chamar GET /logout que apaga os cookies no servidor
  },

  /**
   * Verifica se está autenticado tentando /api/v1/auth/me.
   * Retorna false em caso de 401.
   * Nota: chamada assíncrona — use `await Auth.checkAuth()`
   */
  async checkAuth() {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
      if (res.ok) {
        const user = await res.json();
        this.setUser(user);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  // Manter isLoggedIn() síncrono — verifica sessionStorage como cache
  isLoggedIn() { return !!this.getUser(); },

  isAdmin() {
    const role = this.getUser()?.role;
    return role === 'admin';
  },

  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '/login';
      return false;
    }
    return true;
  },
};

// ── Health Check ─────────────────────────────────────────────────────────────

export async function checkBackendHealth() {
  try {
    const res = await fetch('/api/health', {
      method: 'GET',
      credentials: 'include',
      signal: AbortSignal.timeout(5000),
    });
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

// ── Error Class ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// ── Core Fetch Wrapper ────────────────────────────────────────────────────────
// BUG FIX #16: Removido header Authorization: Bearer.
// Cookies HttpOnly são enviados automaticamente pelo browser com credentials: 'include'.

async function request(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  // NÃO adicionamos Authorization: Bearer — autenticação é via cookie HttpOnly

  const config = {
    method,
    headers,
    credentials: 'include', // envia cookies HttpOnly automaticamente
  };
  if (body) config.body = JSON.stringify(body);

  try {
    const res = await fetch(`${API_BASE}${path}`, config);

    // 401 → redireciona para login; o servidor renova cookies automaticamente
    // via refresh token se o access token expirou (middleware do backend)
    if (res.status === 401) {
      Auth.clear();
      window.location.href = '/login?expired=1';
      return null;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `Erro HTTP ${res.status}` }));
      throw new ApiError(err.detail || `Erro HTTP ${res.status}`, res.status);
    }

    if (res.status === 204) return null;
    return res.json();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError('Sem conexão com o servidor. Verifique sua internet.', 0);
  }
}

const get = (path, params = {}) => {
  const filteredParams = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  const qs = new URLSearchParams(filteredParams).toString();
  return request('GET', qs ? `${path}?${qs}` : path);
};
const post  = (path, body) => request('POST',   path, body);
const put   = (path, body) => request('PUT',    path, body);
const patch = (path, body) => request('PATCH',  path, body);
const del   = (path)       => request('DELETE', path);

// ── Auth Endpoints ────────────────────────────────────────────────────────────
// Login/register são feitos via formulário HTML POST → o servidor seta os cookies.
// Os endpoints abaixo são para operações autenticadas pós-login.

export const authApi = {
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

// ── Transactions ──────────────────────────────────────────────────────────────

export const transactionsApi = {
  list:   (params = {}) => get('/transactions', params),
  get:    (id) => get(`/transactions/${id}`),
  create: (body) => post('/transactions', body),
  update: (id, body) => put(`/transactions/${id}`, body),
  delete: (id, deleteAll = false) =>
    del(`/transactions/${id}${deleteAll ? '?delete_all_installments=true' : ''}`),
};

// ── Categories ────────────────────────────────────────────────────────────────

export const categoriesApi = {
  list:   () => get('/categories'),
  create: (body) => post('/categories', body),
  update: (id, body) => put(`/categories/${id}`, body),
  delete: (id) => del(`/categories/${id}`),
};

// ── Accounts & Cards ──────────────────────────────────────────────────────────

export const accountsApi = {
  list:   () => get('/accounts'),
  create: (body) => post('/accounts', body),
  update: (id, body) => put(`/accounts/${id}`, body),
  delete: (id) => del(`/accounts/${id}`),
};

export const cardsApi = {
  list:   () => get('/cards'),
  create: (body) => post('/cards', body),
  update: (id, body) => put(`/cards/${id}`, body),
  delete: (id) => del(`/cards/${id}`),
};

// ── Subscriptions ─────────────────────────────────────────────────────────────

export const subscriptionsApi = {
  list:   (params = {}) => get('/subscriptions/', params),
  create: (body) => post('/subscriptions/', body),
  update: (id, body) => put(`/subscriptions/${id}`, body),
  delete: (id) => del(`/subscriptions/${id}`),
  generateTransaction: (id) => post(`/subscriptions/${id}/generate-transaction`),
};

// ── Installments ──────────────────────────────────────────────────────────────

export const installmentsApi = {
  list:    (params = {}) => get('/installments', params),
  byMonth: (year, month) => get('/installments/by-month', { year, month }),
};

// ── Reports ───────────────────────────────────────────────────────────────────

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

// ── Admin ─────────────────────────────────────────────────────────────────────

export const adminApi = {
  stats:        () => get('/admin/stats'),
  listTenants:  (params = {}) => get('/admin/tenants', params),
  getTenant:    (id) => get(`/admin/tenants/${id}`),
  updateTenant: (id, body) => patch(`/admin/tenants/${id}`, body),
  deleteTenant: (id) => del(`/admin/tenants/${id}`),
  listUsers:    (params = {}) => get('/admin/users', params),
  updateUser:   (id, body) => patch(`/admin/users/${id}`, body),
  deleteUser:   (id) => del(`/admin/users/${id}`),
};

// ── Goals ─────────────────────────────────────────────────────────────────────

export const goalsApi = {
  list:    () => get('/goals'),
  create:  (body) => post('/goals', body),
  update:  (id, body) => put(`/goals/${id}`, body),
  delete:  (id) => del(`/goals/${id}`),
  deposit: (id, amount, description) => post(`/goals/${id}/deposit`, { amount, description }),
};

// ── Data Export/Import ────────────────────────────────────────────────────────

export const dataApi = {
  export: (params = {}) => get('/data/export', params),
  import: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    // Para upload de arquivo não usamos Content-Type JSON — o browser define multipart
    return fetch(`${API_BASE}/data/import`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    }).then(res => res.json());
  },
  getTemplate: () => get('/data/import/template'),
};

// ── Tenant Users ──────────────────────────────────────────────────────────────

export const tenantApi = {
  listUsers:    () => get('/auth/users'),
  updateRole:   (userId, role) => patch(`/auth/users/${userId}/role`, { role }),
  toggleActive: (userId, isActive) => patch(`/auth/users/${userId}/active`, { is_active: isActive }),
};

// ── Invites ───────────────────────────────────────────────────────────────────

export const inviteApi = {
  create: (email) => post('/auth/invite', { email }),
  list:   () => get('/auth/invites'),
  revoke: (id) => del(`/auth/invites/${id}`),
};

// ── Plans ─────────────────────────────────────────────────────────────────────

export const plansApi = {
  list: () => get('/admin/plans'),
};

// ── Global error handler para chamadas diretas ao api.js ─────────────────────

window.showApiError = function(error, defaultMsg = 'Ocorreu um erro') {
  let message = defaultMsg;
  let kind = 'error';

  if (error?.message) {
    message = error.message;
    if (error.status === 401) {
      message = 'Sua sessão expirou. Faça login novamente.';
      kind = 'warning';
    } else if (error.status === 403) {
      message = 'Você não tem permissão para esta ação.';
    } else if (error.status === 404) {
      message = 'Item não encontrado.';
    } else if (error.status === 400) {
      message = error.message;
      kind = 'warning';
    } else if (error.status >= 500) {
      message = 'Erro no servidor. Tente novamente mais tarde.';
    }
  } else if (typeof error === 'string') {
    message = error;
  }

  if (typeof addToast === 'function') {
    addToast({ message, kind });
  } else {
    console.error('[API Error]', message);
  }
};
