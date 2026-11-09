import { uuid } from './store.js';
import { LEVELS } from './i18n.js';

export function newWord(language, level, text) {
  return { id: uuid(), language, level, text, translation: '', topic: '', tr_fa: '', tr_de: '', tr_en: '', tr_es: '', example: '',
    is_word_of_day: false, audio_path: null, video_path: null, created_at: new Date().toISOString() };
}

/** Order of the translations after "=": Persian first, then the other languages (not the word's own). */
export function bulkOrder(language) { return ['fa', 'de', 'en', 'es'].filter(l => l !== language || l === 'fa'); }

/** Bulk text:  Guten Abend = عصر بخیر | Good evening | Buenas tardes */
export function parseBulk(text, language, level, topic) {
  const out = { words: [], errors: [] };
  const langs = bulkOrder(language);
  text.split(/\r?\n/).forEach((raw, n) => {
    const line = raw.trim(); if (!line) return;
    const eq = line.indexOf('=');
    if (eq < 0) { out.errors.push(`خط ${n + 1}: علامت = پیدا نشد`); return; }
    const left = line.slice(0, eq).trim();
    const parts = line.slice(eq + 1).split('|').map(s => s.trim());
    if (!left || parts.every(p => !p)) { out.errors.push(`خط ${n + 1}: لغت یا ترجمه خالی است`); return; }
    const w = newWord(language, level, left); w.topic = topic;
    parts.forEach((p, i) => { if (i < langs.length && p) w['tr_' + langs[i]] = p; });
    out.words.push(w);
  });
  return out;
}

/** Reads CSV text: quotes, comma or semicolon, BOM, CRLF. */
export function parseCSV(input) {
  let text = input.replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], field = '', q = false;
  text += '\n';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      if (!(field === '' && row.length === 0)) { row.push(field); rows.push(row); }
      row = []; field = '';
    } else field += c;
  }
  return rows;
}

function langFrom(t) {
  switch ((t || '').toLowerCase().trim()) {
    case 'de': case 'german': case 'deutsch': case 'آلمانی': return 'de';
    case 'en': case 'english': case 'englisch': case 'انگلیسی': return 'en';
    case 'es': case 'spanish': case 'español': case 'espanol': case 'spanisch': case 'اسپانیایی': return 'es';
    case 'fr': case 'french': case 'französisch': case 'franzoesisch': case 'français': case 'francais': case 'فرانسوی': return 'fr';
    case 'it': case 'italian': case 'italienisch': case 'italiano': case 'ایتالیایی': return 'it';
    case 'tr': case 'turkish': case 'türkisch': case 'tuerkisch': case 'türkçe': case 'turkce': case 'ترکی': return 'tr';
    case 'sv': case 'swedish': case 'schwedisch': case 'svenska': case 'سوئدی': return 'sv';
    default: return null;
  }
}

export function parseCSVWords(input) {
  const out = { words: [], errors: [] };
  const rows = parseCSV(input);
  if (!rows.length) { out.errors.push('فایل خالی است'); return out; }
  const names = rows[0].map(s => s.trim().toLowerCase());
  const col = keys => { for (const k of keys) { const i = names.indexOf(k); if (i >= 0) return i; } return -1; };
  const cLang = col(['language', 'lang']), cText = col(['text', 'word']);
  if (cLang < 0 || cText < 0) { out.errors.push('ستون‌های language و text پیدا نشدند. خط اول فایل باید اسم ستون‌ها باشد.'); return out; }
  const cLevel = col(['level']), cTopic = col(['topic']), cFa = col(['fa', 'translation']), cDe = col(['de']), cEn = col(['en']), cEs = col(['es']), cEx = col(['example']);
  const v = (r, c) => (c >= 0 && c < r.length ? r[c].trim() : '');
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const lang = langFrom(v(r, cLang));
    if (!lang) { out.errors.push(`خط ${line}: زبان درست نیست (باید de, en, es, fr, it, tr یا sv باشد)`); return; }
    const text = v(r, cText);
    if (!text) { out.errors.push(`خط ${line}: ستون text خالی است`); return; }
    const lv = (v(r, cLevel) || 'A1').toUpperCase();
    if (!LEVELS.includes(lv)) { out.errors.push(`خط ${line}: سطح درست نیست (${lv})`); return; }
    const w = newWord(lang, lv, text);
    w.topic = v(r, cTopic).toLowerCase(); w.tr_fa = v(r, cFa); w.tr_de = v(r, cDe); w.tr_en = v(r, cEn); w.tr_es = v(r, cEs); w.example = v(r, cEx);
    if (!w.tr_fa && !w.tr_de && !w.tr_en && !w.tr_es) { out.errors.push(`خط ${line}: هیچ ترجمه‌ای ندارد`); return; }
    out.words.push(w);
  });
  return out;
}
