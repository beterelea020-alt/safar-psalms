/**
 * app.js — boots on every page. Theme, reading prefs, toasts, nav wiring, PWA install prompt hook.
 */

const App = {
  init() {
    this.applyTheme(Store.getTheme());
    this.applyReadingPrefs();
    this.wireMobileNav();
    this.wireThemeSystemPreference();
    this.markCurrentNav();
  },

  applyTheme(theme) {
    let t = theme;
    if (!t) {
      t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    if (t === 'light') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', t);
    }
    document.querySelectorAll('[data-swatch]').forEach(el => {
      el.classList.toggle('active', el.dataset.swatch === t);
    });
    this._currentTheme = t;
  },

  setTheme(t) {
    Store.setTheme(t);
    this.applyTheme(t);
    toast('تم تغيير المظهر');
  },

  wireThemeSystemPreference() {
    if (Store.getTheme()) return; // user has an explicit choice, don't override
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', () => { if (!Store.getTheme()) this.applyTheme(null); });
  },

  applyReadingPrefs() {
    const size = Store.getFontSize();
    const lh = Store.getLineHeight();
    document.documentElement.style.setProperty('--verse-size', size + 'rem');
    document.documentElement.style.setProperty('--verse-line-height', lh);
  },

  changeFontSize(delta) {
    let size = Store.getFontSize() + delta;
    size = Math.max(1.0, Math.min(2.2, Math.round(size * 100) / 100));
    Store.setFontSize(size);
    this.applyReadingPrefs();
  },
  resetFontSize() { Store.setFontSize(1.35); this.applyReadingPrefs(); },
  changeLineHeight(delta) {
    let lh = Store.getLineHeight() + delta;
    lh = Math.max(1.6, Math.min(3.2, Math.round(lh * 100) / 100));
    Store.setLineHeight(lh);
    this.applyReadingPrefs();
  },
  resetLineHeight() { Store.setLineHeight(2.35); this.applyReadingPrefs(); },

  wireMobileNav() {
    const toggle = document.querySelector('.mobile-nav-toggle');
    const links = document.querySelector('.nav-links');
    if (!toggle || !links) return;
    toggle.addEventListener('click', () => {
      const open = links.style.display === 'flex';
      links.style.display = open ? '' : 'flex';
      links.style.flexDirection = 'column';
      links.style.position = 'absolute';
      links.style.top = 'var(--nav-height)';
      links.style.insetInline = '0';
      links.style.background = 'var(--bg)';
      links.style.padding = '1rem 1.5rem';
      links.style.borderBottom = '1px solid var(--line)';
      toggle.setAttribute('aria-expanded', String(!open));
    });
  },

  markCurrentNav() {
    const path = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(a => {
      const href = a.getAttribute('href');
      if (href === path) a.setAttribute('aria-current', 'page');
    });
  },
};

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

function toast(msg, ms = 2600) {
  let region = document.getElementById('toast-region');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  region.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 350);
  }, ms);
}

/* Keyboard shortcuts (section 32) — global, but never inside inputs/textareas/editable fields */
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

  if (e.key === '/' || e.key.toLowerCase() === 'f') {
    const searchBtn = document.querySelector('[data-open-search]');
    if (searchBtn) { e.preventDefault(); searchBtn.click(); }
  }
  if (e.key === 'Escape') {
    document.querySelectorAll('.popover.open, [data-modal].open').forEach(el => el.classList.remove('open'));
  }
  if (e.code === 'Space' && window.AudioController?.isReady?.()) {
    e.preventDefault();
    window.AudioController.toggle();
  }
  if (e.key === 'ArrowLeft' && window.__psalmNav?.next) location.href = window.__psalmNav.next;
  if (e.key === 'ArrowRight' && window.__psalmNav?.prev) location.href = window.__psalmNav.prev;
});

document.addEventListener('DOMContentLoaded', () => App.init());
