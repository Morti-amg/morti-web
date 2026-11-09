import DATA from './i18n-data.js';
import EXTRA from './i18n-extra.js';

export const LANGS = [
  { code: 'fa', name: 'فارسی', dir: 'rtl' },
  { code: 'de', name: 'Deutsch', dir: 'ltr' },
  { code: 'en', name: 'English', dir: 'ltr' },
  { code: 'es', name: 'Español', dir: 'ltr' },
];
/** Extra interface-only languages (no database columns; content falls back to English). */
export const UI_LANGS = [
  ...LANGS,
  { code: 'fr', name: 'Français', dir: 'ltr' },
  { code: 'it', name: 'Italiano', dir: 'ltr' },
  { code: 'tr', name: 'Türkçe', dir: 'ltr' },
  { code: 'sv', name: 'Svenska', dir: 'ltr' },
];
const INDEX = { fa: 0, de: 1, en: 2, es: 3, fr: 4, it: 5, tr: 6, sv: 7 };
const XI = { fr: 0, it: 1, tr: 2, sv: 3 };
/** Value from a 4-column row (fa,de,en,es) or, for the new languages, from the extra table (English fallback). */
function cell(row, extraRow) {
  if (INDEX[lang] < 4) return row[INDEX[lang]];
  return (extraRow && extraRow[XI[lang]]) || row[2];
}

function initial() {
  try {
    const s = localStorage.getItem('uiLang');
    if (s && INDEX[s] !== undefined) return s;
  } catch (e) {}
  const c = (navigator.language || 'fa').slice(0, 2).toLowerCase();
  return INDEX[c] !== undefined ? c : 'fa';
}

export let lang = initial();

export function setLang(code) {
  lang = code;
  try { localStorage.setItem('uiLang', code); } catch (e) {}
  applyDir();
  try { window.dispatchEvent(new CustomEvent('morti-langchange', { detail: code })); } catch (e) {}
}

export function applyDir() {
  const l = UI_LANGS.find(x => x.code === lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = l.dir;
}

/** Translate a key. {0},{1} are replaced by the arguments. */
export function T(key, ...args) {
  const row = DATA.t[key];
  if (!row) return key;
  let text = cell(row, EXTRA.t[key]);
  args.forEach((a, i) => { text = text.split('{' + i + '}').join(String(a)); });
  return text;
}

export function topicName(stored) {
  const key = (stored || '').toLowerCase().trim();
  const row = DATA.topics[key];
  return row ? cell(row, EXTRA.topics[key]) : stored;
}
export const TOPIC_KEYS = Object.keys(DATA.topics);
export function topicFa(key) { return (DATA.topics[key] || [''])[0]; }

export function label(stored) {
  const row = DATA.names[stored];
  return row ? cell(row, EXTRA.names[stored]) : stored;
}

export const COUNTRIES = ['آلمان', 'اتریش', 'سوئیس', 'ایران', 'افغانستان', 'ترکیه', 'اسپانیا', 'بریتانیا', 'آمریکا', 'کانادا', 'سایر'];
export const NATIVE_LANGS = ['فارسی', 'دری', 'Deutsch', 'English', 'Español', 'العربية', 'Türkçe', 'سایر'];
export const LEARN = {
  de: { title: 'Deutsch', flag: '🇩🇪', speech: 'de-DE' },
  en: { title: 'English', flag: '🇬🇧', speech: 'en-GB' },
  es: { title: 'Español', flag: '🇪🇸', speech: 'es-ES' },
  fr: { title: 'Français', flag: '🇫🇷', speech: 'fr-FR' },
  it: { title: 'Italiano', flag: '🇮🇹', speech: 'it-IT' },
  tr: { title: 'Türkçe', flag: '🇹🇷', speech: 'tr-TR' },
  sv: { title: 'Svenska', flag: '🇸🇪', speech: 'sv-SE' },
};
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
