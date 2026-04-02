/**
 * Save Point Finanças Utilities
 * Validações, Formatações, Animações Premium
 */

// ── Formatting ───────────────────────────────────────────────────────────────

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value ?? 0);
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr + (isoStr.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('pt-BR');
}

function formatMonth(year, month) {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function monthLabel(period) {
  // period = "2025-03"
  const [y, m] = period.split('-');
  return new Date(+y, +m - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
}

function typeLabel(type) {
  return type === 'income' ? 'Receita' : 'Despesa';
}

function paymentLabel(pm) {
  const map = {
    credit_card: 'Cartão de Crédito',
    debit_card: 'Cartão de Débito',
    pix: 'Pix',
    money: 'Dinheiro',
    transfer: 'Transferência',
  };
  return map[pm] || pm;
}

// ── Form Validation ────────────────────────────────────────────────────────────

const Validation = {
  required(value, message = 'Campo obrigatório') {
    if (!value || (typeof value === 'string' && !value.trim())) {
      return message;
    }
    return null;
  },
  
  email(value, message = 'Email inválido') {
    if (!value) return null;
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!regex.test(value)) {
      return message;
    }
    return null;
  },
  
  minLength(min, message = null) {
    return (value, fieldName = 'Campo') => {
      if (!value) return null;
      if (value.length < min) {
        return message || `${fieldName} deve ter pelo menos ${min} caracteres`;
      }
      return null;
    };
  },
  
  maxLength(max, message = null) {
    return (value, fieldName = 'Campo') => {
      if (!value) return null;
      if (value.length > max) {
        return message || `${fieldName} deve ter no máximo ${max} caracteres`;
      }
      return null;
    };
  },
  
  minValue(min, message = null) {
    return (value, fieldName = 'Valor') => {
      if (!value) return null;
      const num = parseFloat(value);
      if (isNaN(num) || num < min) {
        return message || `${fieldName} deve ser maior que ${min}`;
      }
      return null;
    };
  },
  
  password(value, message = 'Senha muito fraca') {
    if (!value) return null;
    if (value.length < 6) return 'Senha deve ter pelo menos 6 caracteres';
    if (!/[A-Z]/.test(value)) return 'Senha deve conter pelo menos uma letra maiúscula';
    if (!/[0-9]/.test(value)) return 'Senha deve conter pelo menos um número';
    return null;
  },
  
  confirm(password, confirmPassword, message = 'As senhas não coincidem') {
    if (!confirmPassword) return null;
    if (password !== confirmPassword) return message;
    return null;
  },
  
  cpf(value, message = 'CPF inválido') {
    if (!value) return null;
    const clean = value.replace(/\D/g, '');
    if (clean.length !== 11) return message;
    // Basic CPF validation
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(clean[i]) * (10 - i);
    let digit1 = (sum * 10) % 11;
    if (digit1 === 10) digit1 = 0;
    if (digit1 !== parseInt(clean[9])) return message;
    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(clean[i]) * (11 - i);
    let digit2 = (sum * 10) % 11;
    if (digit2 === 10) digit2 = 0;
    if (digit2 !== parseInt(clean[10])) return message;
    return null;
  },
  
  phone(value, message = 'Telefone inválido') {
    if (!value) return null;
    const clean = value.replace(/\D/g, '');
    if (clean.length < 10 || clean.length > 11) return message;
    return null;
  },
  
  date(value, message = 'Data inválida') {
    if (!value) return null;
    const d = new Date(value);
    if (isNaN(d.getTime())) return message;
    return null;
  },
  
  positiveNumber(value, message = 'Valor deve ser positivo') {
    if (!value) return null;
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0) return message;
    return null;
  },
};

// Form Validator Class
class FormValidator {
  constructor(formId) {
    this.form = document.getElementById(formId);
    this.errors = {};
    this.fieldRules = {};
  }
  
  addField(fieldName, ...rules) {
    this.fieldRules[fieldName] = rules;
    return this;
  }
  
  validate() {
    this.errors = {};
    const formData = new FormData(this.form);
    
    for (const [fieldName, rules] of Object.entries(this.fieldRules)) {
      const value = formData.get(fieldName);
      
      for (const rule of rules) {
        let error;
        if (typeof rule === 'function') {
          error = rule(value, fieldName);
        } else if (rule instanceof Validation && typeof rule.validate === 'function') {
          error = rule.validate(value);
        } else if (typeof rule === 'string') {
          error = Validation.required(value, rule);
        }
        
        if (error) {
          this.errors[fieldName] = error;
          break;
        }
      }
    }
    
    return Object.keys(this.errors).length === 0;
  }
  
  getErrors() {
    return this.errors;
  }
  
  getError(fieldName) {
    return this.errors[fieldName];
  }
  
  showErrors() {
    // Clear previous error displays
    this.form.querySelectorAll('.form-error').forEach(el => el.remove());
    this.form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    
    for (const [fieldName, error] of Object.entries(this.errors)) {
      const input = this.form.querySelector(`[name="${fieldName}"]`);
      if (input) {
        input.classList.add('is-invalid');
        
        // Create error element
        const errorEl = document.createElement('div');
        errorEl.className = 'form-error';
        errorEl.textContent = error;
        input.parentElement.appendChild(errorEl);
        
        // Animate shake
        input.classList.add('form-error');
        setTimeout(() => input.classList.remove('form-error'), 400);
      }
    }
  }
  
  clearErrors() {
    this.errors = {};
    this.form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    this.form.querySelectorAll('.form-error').forEach(el => el.remove());
  }
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

function toast(message, type = 'info', duration = 4000) {
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

function openModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) { m.classList.add('modal--open'); document.body.style.overflow = 'hidden'; }
}

function closeModal(modalId) {
  const m = document.getElementById(modalId);
  if (m) { m.classList.remove('modal--open'); document.body.style.overflow = ''; }
}

function setupModalClose(modalId) {
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

function el(selector) { return document.querySelector(selector); }
function els(selector) { return [...document.querySelectorAll(selector)]; }

function setHTML(selector, html) {
  const e = el(selector);
  if (e) e.innerHTML = html;
}

function setText(selector, text) {
  const e = el(selector);
  if (e) e.textContent = text;
}

function show(selector) {
  const e = typeof selector === 'string' ? el(selector) : selector;
  if (e) e.style.display = '';
}

function hide(selector) {
  const e = typeof selector === 'string' ? el(selector) : selector;
  if (e) e.style.display = 'none';
}

function setLoading(buttonEl, loading) {
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

function confirmDialog(message) {
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

function fillSelect(selectEl, items, valueKey, labelKey, placeholder = '— Selecione —') {
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

function typeBadge(type) {
  return type === 'income'
    ? '<span class="badge badge--income">Receita</span>'
    : '<span class="badge badge--expense">Despesa</span>';
}

// ── Real-time Validation Helpers ───────────────────────────────────────────

function setupFieldValidation(formId, fieldName, validators) {
  const form = document.getElementById(formId);
  if (!form) return;
  
  const input = form.querySelector(`[name="${fieldName}"]`);
  if (!input) return;
  
  const showError = (message) => {
    input.classList.add('is-invalid');
    let errorEl = input.parentElement.querySelector('.form-error');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'form-error';
      input.parentElement.appendChild(errorEl);
    }
    errorEl.textContent = message;
  };
  
  const clearError = () => {
    input.classList.remove('is-invalid');
    input.classList.add('is-valid');
    const errorEl = input.parentElement.querySelector('.form-error');
    if (errorEl) errorEl.remove();
  };
  
  const validate = () => {
    const value = input.value;
    for (const validator of validators) {
      const error = typeof validator === 'function' ? validator(value) : null;
      if (error) {
        showError(error);
        return false;
      }
    }
    if (value) clearError();
    return true;
  };
  
  input.addEventListener('blur', validate);
  input.addEventListener('input', () => {
    if (input.classList.contains('is-invalid')) {
      validate();
    }
  });
}

// ── Auto-format helpers ───────────────────────────────────────────────────

function setupAutoFormat() {
  // CPF
  document.querySelectorAll('[data-format="cpf"]').forEach(input => {
    input.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '');
      if (v.length > 11) v = v.slice(0, 11);
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
      e.target.value = v;
    });
  });
  
  // Phone
  document.querySelectorAll('[data-format="phone"]').forEach(input => {
    input.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '');
      if (v.length > 11) v = v.slice(0, 11);
      if (v.length >= 10) {
        v = v.replace(/(\d{2})(\d)/, '($1) $2');
        v = v.replace(/(\d{4})(\d)/, '$1-$2');
      } else if (v.length >= 2) {
        v = v.replace(/(\d{2})(\d)/, '($1) $2');
      }
      e.target.value = v;
    });
  });
  
  // Currency
  document.querySelectorAll('[data-format="currency"]').forEach(input => {
    input.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '');
      if (!v) { e.target.value = ''; return; }
      v = (parseInt(v) / 100).toFixed(2);
      v = v.replace('.', ',');
      e.target.value = v;
    });
  });
  
  // Date
  document.querySelectorAll('[data-format="date"]').forEach(input => {
    input.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '');
      if (v.length > 8) v = v.slice(0, 8);
      if (v.length >= 4) {
        v = v.replace(/(\d{2})(\d)/, '$1/$2');
      }
      if (v.length >= 7) {
        v = v.replace(/(\d{2})(\d{2})(\d)/, '$1/$2/$3');
      }
      e.target.value = v;
    });
  });
}

// Initialize auto-format on DOM ready
document.addEventListener('DOMContentLoaded', setupAutoFormat);
