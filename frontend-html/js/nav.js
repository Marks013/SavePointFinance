/**
 * Shared sidebar + nav helpers — injected into every page.
 */

import { Auth } from './api.js';

const NAV_ITEMS = [
  { section: 'Principal' },
  { href: 'dashboard.html', icon: 'home', label: 'Dashboard' },
  { href: 'transactions.html', icon: 'list', label: 'Transações' },
  { href: 'installments.html', icon: 'credit-card', label: 'Parcelados' },
  { href: 'subscriptions.html', icon: 'refresh-cw', label: 'Assinaturas' },
  { section: 'Análise' },
  { href: 'reports.html', icon: 'bar-chart-2', label: 'Relatórios' },
  { href: 'goals.html', icon: 'target', label: 'Metas & Sonhos' },
  { section: 'Configurações' },
  { href: 'categories.html', icon: 'tag', label: 'Categorias' },
  { href: 'settings.html', icon: 'settings', label: 'Contas & Cartões' },
];

const ICONS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline>',
  list: '<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>',
  'credit-card': '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line>',
  'refresh-cw': '<polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>',
  'bar-chart-2': '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line>',
  settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line>',
  'dollar-sign': '<line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>',
  'trending-up': '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline>',
  'trending-down': '<polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline>',
  'target': '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>',
};

function icon(name) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor">${ICONS[name] || ''}</svg>`;
}

export function renderSidebar(activePage) {
  const user = Auth.getUser();
  if (!user) return;

  const initials = (user.name || user.email)
    .split(' ')
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase())
    .join('');

  let navHtml = '';
  for (const item of NAV_ITEMS) {
    if (item.section) {
      // Conditionally show admin item
      if (item.section === 'Admin' && !Auth.isSuperadmin()) continue;
      navHtml += `<div class="nav-section-label">${item.section}</div>`;
    } else {
      const isActive = activePage === item.href;
      navHtml += `
        <a href="${item.href}" class="nav-link${isActive ? ' active' : ''}">
          ${icon(item.icon)}
          ${item.label}
        </a>`;
    }
  }

  // Add admin link for superadmins
  if (Auth.isSuperadmin()) {
    navHtml += `
      <div class="nav-section-label">Admin</div>
      <a href="admin.html" class="nav-link${activePage === 'admin.html' ? ' active' : ''}">
        ${icon('shield')}
        Painel Admin
      </a>`;
  }

  const sidebarHtml = `
    <nav class="sidebar" id="sidebar">
      <div class="sidebar-logo">
        <div class="sidebar-logo-mark">
          ${icon('dollar-sign')}
        </div>
        <div class="sidebar-logo-text">Save Point <span>Finanças</span></div>
      </div>
      <div class="sidebar-nav">${navHtml}</div>
      <div class="sidebar-footer">
        <div class="sidebar-user" title="${user.email}">
          <div class="user-avatar">${initials}</div>
          <div class="user-info">
            <div class="user-name">${user.name || 'Usuário'}</div>
            <div class="user-role">${user.role}</div>
          </div>
          <button class="logout-btn" id="logout-btn" title="Sair">
            ${icon('log-out')}
          </button>
        </div>
      </div>
    </nav>`;

  const target = document.getElementById('sidebar-mount');
  if (target) {
    target.outerHTML = sidebarHtml;
    document.getElementById('logout-btn')?.addEventListener('click', () => {
      Auth.clear();
      window.location.href = 'login.html';
    });
  }
}

export function requireAuthAndRender(activePage) {
  if (!Auth.requireAuth()) return false;
  // Load user info if needed
  const user = Auth.getUser();
  if (!user) {
    Auth.clear();
    window.location.href = 'login.html';
    return false;
  }
  renderSidebar(activePage);
  return true;
}
