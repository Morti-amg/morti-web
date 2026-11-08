import { T, LANGS, lang as currentLang, setLang } from './i18n.js';

/** Tiny element builder: h('div', {class:'x', onclick: fn}, child, 'text') */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function mount(el, ...children) { clear(el); append(el, children); }

// ---------- toast ----------
let toastEl;
export function toast(text, ok = false) {
  if (!toastEl) { toastEl = h('div', { class: 'toast' }); document.body.append(toastEl); }
  toastEl.textContent = text;
  toastEl.className = 'toast show' + (ok ? ' ok' : '');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { toastEl.className = 'toast'; }, 3500);
}

// ---------- modal (sheet) ----------
export function modal(build, { title = '' } = {}) {
  const close = () => { back.classList.add('out'); setTimeout(() => back.remove(), 180); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  const body = h('div', { class: 'sheet-body' });
  const sheet = h('div', { class: 'sheet', role: 'dialog' },
    h('div', { class: 'sheet-head' },
      h('button', { class: 'icon-btn', onclick: close, 'aria-label': T('close') }, '✕'),
      h('div', { class: 'sheet-title' }, title),
      h('span', { style: { width: '36px' } })),
    body);
  const back = h('div', { class: 'backdrop', onclick: e => { if (e.target === back) close(); } }, sheet);
  document.body.append(back);
  document.addEventListener('keydown', onKey);
  build(body, close);
  return close;
}

export function confirmBox(text, okLabel, danger = true) {
  return new Promise(resolve => {
    modal((body, close) => {
      body.append(
        h('p', { class: 'center' }, text),
        h('div', { class: 'row gap' },
          h('button', { class: 'btn ghost', onclick: () => { close(); resolve(false); } }, T('cancel')),
          h('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), onclick: () => { close(); resolve(true); } }, okLabel)));
    });
  });
}

// ---------- form helpers ----------
export function field(placeholder, opts = {}) {
  const input = h('input', {
    class: 'field', placeholder, type: opts.type || 'text', value: opts.value || '',
    autocomplete: opts.autocomplete || 'off', inputmode: opts.inputmode, dir: opts.dir || 'auto',
    autocapitalize: opts.caps || 'none', autocorrect: 'off', spellcheck: 'false',
  });
  if (opts.type === 'password') {
    const eye = h('button', { type: 'button', class: 'eye', onclick: () => {
      input.type = input.type === 'password' ? 'text' : 'password'; eye.textContent = input.type === 'password' ? '👁' : '🙈';
    } }, '👁');
    const wrap = h('div', { class: 'field-wrap' }, input, eye);
    wrap.input = input; return wrap;
  }
  input.input = input; return input;
}
export const val = f => (f.input || f).value;

export function select(options, value, onchange, cls = '') {
  const s = h('select', { class: 'select ' + cls, onchange: e => onchange && onchange(e.target.value) },
    options.map(o => h('option', { value: o.value, selected: o.value === value }, o.label)));
  return s;
}

export function spinner() { return h('div', { class: 'spinner' }); }

export function formatDate(d, withTime = true) {
  const dt = new Date(d);
  try {
    return dt.toLocaleString(document.documentElement.lang || undefined,
      withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
  } catch (e) { return dt.toISOString(); }
}

// ---------- sound / speech ----------
export const Speech = {
  voices: [],
  speak(text, speechLang, slow = false) {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang;
    u.rate = slow ? 0.55 : 0.9;
    const vs = window.speechSynthesis.getVoices();
    const v = vs.find(x => x.lang === speechLang) || vs.find(x => x.lang.startsWith(speechLang.slice(0, 2)));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  },
  get canRecognize() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); },
};

export function haptic(ms = 10) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

// ---------- misc ----------
export function mediaBlobCache() {
  const cache = new Map();
  return async (api, bucket, path) => {
    const k = bucket + '/' + path;
    if (!cache.has(k)) cache.set(k, api.downloadURL(bucket, path));
    try { return await cache.get(k); } catch (e) { cache.delete(k); throw e; }
  };
}
export const getMedia = mediaBlobCache();

export function logo(small = false) {
  return h('div', { class: 'logo' + (small ? ' small' : '') },
    h('span', { class: 'logo-t' }, 'MORTI'),
    h('span', { class: 'slashes' }, h('i'), h('i'), h('i'), h('i')),
    small ? null : h('span', { class: 'logo-t' }, 'AMG'));
}

// ---------- accent color ----------
export const ACCENTS = {
  red: ['#e5251b', '#8a0600'], gold: ['#e0a800', '#7a5c00'], blue: ['#2f7bff', '#123c99'],
  green: ['#22b35a', '#0b6b33'], purple: ['#9b5cf6', '#4c1d95'], orange: ['#ff7a1a', '#8a3a00'],
};
export function currentAccent() {
  try { const a = localStorage.getItem('accent'); if (ACCENTS[a]) return a; } catch (e) {}
  return 'red';
}
export function setAccent(name) {
  const [c, d] = ACCENTS[name] || ACCENTS.red;
  document.documentElement.style.setProperty('--accent', c);
  document.documentElement.style.setProperty('--accent-dark', d);
  try { localStorage.setItem('accent', name); } catch (e) {}
}

export function languageSelect() {
  return select(LANGS.map(l => ({ value: l.code, label: l.name })), currentLang, code => {
    setLang(code);
    window.dispatchEvent(new Event('morti:rerender'));
  }, 'lang-select');
}
