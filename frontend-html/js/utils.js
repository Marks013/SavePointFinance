/**
 * Save Point Finanças Utilities
 */

// ── Formatting ───────────────────────────────────────────────────────────────

export function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value ?? 0);
}

export function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr + (isoStr.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR');
}

export function formatMonth(year, month) {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function monthLabel(period) {
  // period = "2025-03"
  const [y, m] = period.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

export function typeLabel(type) {
  return type === 'income' ? 'Receita' : 'Despesa';
}

export function paymentLabel(pm) {
  const map = {
    credit_card: 'Cartão de Crédito',
    debit_card: 'Cartão de Débito',
    pix: 'Pix',
    money: 'Dinheiro',
    bank_transfer: 'Transferência',
    boleto: 'Boleto',
  };
  return map[pm] || pm;
}

// ── Toast Notifications ──────────────────────────────────────────────────────

let toastContainer;
function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function toast(message, type = 'info', duration = 4000) {
  const c = getToastContainer();
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${message}</span>`;
  c.appendChild(el);

  requestAnimationFrame(() => el.classList.add('toast--show'));

  setTimeout(() => {
    el.classList.remove('toast--show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
  }, duration);
}

// ── Modal ────────────────────────────────────────────────────────────────────

export function openModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) { m.classList.add('modal--open'); document.body.style.overflow = 'hidden'; }
}

export function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) { m.classList.remove('modal--open'); document.body.style.overflow = ''; }
}

export function setupModalClose(modalId) {
  const m = document.getElementById(modalId);
  if (!m) return;
  m.addEventListener('click', (e) => {
    if (e.target === m) closeModal(modalId);
  });
  m.querySelectorAll('[data-close-modal]').forEach(b =>
    b.addEventListener('click', () => closeModal(modalId))
  );
}

// ── DOM Helpers ──────────────────────────────────────────────────────────────

export function el(selector) { return document.querySelector(selector); }
export function els(selector) { return [...document.querySelectorAll(selector)]; }

export function setHTML(selector, html) {
  const e = el(selector);
  if (e) e.innerHTML = html;
}

export function setText(selector, text) {
  const e = el(selector);
  if (e) e.textContent = text;
}

export function show(selector) {
  const e = typeof selector === 'string' ? el(selector) : selector;
  if (e) e.style.display = '';
}

export function hide(selector) {
  const e = typeof selector === 'string' ? el(selector) : selector;
  if (e) e.style.display = 'none';
}

export function setLoading(buttonEl, loading) {
  if (!buttonEl) return;
  if (loading) {
    buttonEl.dataset.originalText = buttonEl.textContent;
    buttonEl.disabled = true;
    buttonEl.innerHTML = '<span class="spinner"></span> Aguarde...';
  } else {
    buttonEl.disabled = false;
    buttonEl.textContent = buttonEl.dataset.originalText || 'Confirmar';
  }
}

// ── Confirm Dialog ───────────────────────────────────────────────────────────

export function confirm(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal modal--open';
    overlay.innerHTML = `
      <div class="modal-box" style="max-width:400px">
        <div class="modal-header"><h3>Confirmar</h3></div>
        <div class="modal-body"><p>${message}</p></div>
        <div class="modal-footer">
          <button class="btn btn--ghost" id="cf-cancel">Cancelar</button>
          <button class="btn btn--danger" id="cf-ok">Confirmar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#cf-cancel').onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('#cf-ok').onclick = () => { overlay.remove(); resolve(true); };
  });
}

// ── Fill Select from API data ─────────────────────────────────────────────────

export function fillSelect(selectEl, items, valueKey, labelKey, placeholder = '— Selecione —') {
  if (!selectEl) return;
  const current = selectEl.value;
  selectEl.innerHTML = `<option value="">${placeholder}</option>`;
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item[valueKey];
    opt.textContent = item[labelKey];
    selectEl.appendChild(opt);
  });
  if (current) selectEl.value = current;
}

// ── Badge helpers ─────────────────────────────────────────────────────────────

export function typeBadge(type) {
  return type === 'income'
    ? '<span class="badge badge--income">Receita</span>'
    : '<span class="badge badge--expense">Despesa</span>';
}
