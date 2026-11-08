import { T, LEARN, LEVELS, lang } from './i18n.js';
import { api } from './api.js';
import { store } from './store.js';
import { h, clear, mount, modal, toast, confirmBox, spinner, Speech } from './ui.js';

// ---------- data (loaded on demand, cached) ----------
let cache = null;
export async function loadGrammar(force = false) {
  if (cache && !force) return cache;
  cache = await api.fetchAll('grammar?select=*&order=language.asc,level.asc,sort.asc');
  return cache;
}
const pick = (g, base) => (g[base + '_' + lang] || g[base + '_en'] || g[base + '_fa'] || g[base + '_de'] || g[base + '_es'] || '').trim();
const UI = {
  fa: { title: 'گرامر', empty: 'هنوز درس گرامری برای این زبان نیست.', ex: 'مثال‌ها', all: 'همه', back: 'بازگشت', next: 'درس بعدی', prev: 'درس قبلی' },
  de: { title: 'Grammatik', empty: 'Für diese Sprache gibt es noch keine Grammatik.', ex: 'Beispiele', all: 'Alle', back: 'Zurück', next: 'Nächste Lektion', prev: 'Vorherige Lektion' },
  en: { title: 'Grammar', empty: 'No grammar lessons for this language yet.', ex: 'Examples', all: 'All', back: 'Back', next: 'Next lesson', prev: 'Previous lesson' },
  es: { title: 'Gramática', empty: 'Aún no hay lecciones de gramática para este idioma.', ex: 'Ejemplos', all: 'Todos', back: 'Volver', next: 'Siguiente lección', prev: 'Lección anterior' },
};
const L = () => UI[lang] || UI.en;
const topbar = (title, back) => h('div', { class: 'topbar' }, back ? h('button', { class: 'back', onclick: () => { location.hash = back; } }, '‹') : null, h('h1', null, title));

/** examples string -> [{t, tr:{fa,de,en,es}}] */
export function parseExamples(s) {
  return (s || '').split(';;').map(x => x.trim()).filter(Boolean).map(item => {
    const p = item.split('|').map(v => v.trim());
    return { t: p[0], tr: { fa: p[1] || '', de: p[2] || '', en: p[3] || '', es: p[4] || '' } };
  });
}

// ---------- learner: list ----------
export function grammarListView(root, params) {
  const language = LEARN[params[0]] ? params[0] : (store.current?.learning || 'de');
  let level = null;
  const head = h('div', { class: 'stack' }), body = h('div', { class: 'stack' });
  root.append(h('div', { class: 'page stack' }, topbar(`${LEARN[language].flag} ${L().title}`, '#/'), head, body));
  mount(body, spinner());
  loadGrammar().then(all => {
    const mine = all.filter(g => g.language === language);
    const draw = () => {
      mount(head, h('div', { class: 'chips' },
        h('button', { class: 'chip' + (!level ? ' on' : ''), onclick: () => { level = null; draw(); } }, L().all),
        LEVELS.filter(l => mine.some(g => g.level === l)).map(l => h('button', { class: 'chip' + (level === l ? ' on' : ''), onclick: () => { level = l; draw(); } }, l))));
      const shown = mine.filter(g => !level || g.level === level);
      mount(body, shown.length ? h('div', { class: 'card list' }, shown.map(g => h('a', { href: `#/gram/${g.id}`, class: 'list-item', style: { color: 'inherit', textDecoration: 'none' } },
        h('span', { class: 'pill' }, g.level), h('div', { class: 'grow bold' }, pick(g, 'title')), h('span', { class: 'mute' }, lang === 'fa' ? '‹' : '›'))))
        : h('div', { class: 'empty' }, L().empty));
    };
    draw();
  }).catch(e => mount(body, h('div', { class: 'empty' }, L().empty)));
}

// ---------- learner: one lesson ----------
export function grammarLessonView(root, params) {
  const id = params[0];
  const host = h('div', { class: 'stack' });
  root.append(h('div', { class: 'page stack' }, host));
  mount(host, spinner());
  loadGrammar().then(all => {
    const g = all.find(x => x.id === id);
    if (!g) { mount(host, topbar(L().title, '#/'), h('div', { class: 'empty' }, L().empty)); return; }
    const sibs = all.filter(x => x.language === g.language && x.level === g.level);
    const i = sibs.findIndex(x => x.id === g.id);
    const exs = parseExamples(g.examples);
    const speech = LEARN[g.language].speech;
    mount(host,
      topbar(pick(g, 'title'), `#/grammar/${g.language}`),
      h('div', { class: 'row' }, h('span', { class: 'pill' }, LEARN[g.language].flag + ' ' + g.level)),
      h('div', { class: 'card', style: { whiteSpace: 'pre-wrap', lineHeight: 1.7 } }, pick(g, 'body')),
      exs.length ? h('div', { class: 'bold' }, L().ex) : null,
      exs.map(e => h('div', { class: 'card stack', style: { gap: '6px' } },
        h('div', { class: 'row between' },
          h('div', { class: 'bold', dir: 'auto', style: { fontSize: '18px' } }, e.t),
          h('button', { class: 'mbtn', onclick: () => Speech.speak(e.t, speech) }, h('i', null, '🔊'))),
        h('div', { class: 'mute', dir: 'auto' }, e.tr[lang] || e.tr.en || e.tr.fa))),
      h('div', { class: 'row between' },
        i > 0 ? h('a', { class: 'btn small ghost', href: '#/gram/' + sibs[i - 1].id, style: { textDecoration: 'none' } }, L().prev) : h('span'),
        i < sibs.length - 1 ? h('a', { class: 'btn small primary', href: '#/gram/' + sibs[i + 1].id, style: { textDecoration: 'none' } }, L().next) : h('span')));
  }).catch(() => mount(host, h('div', { class: 'empty' }, L().empty)));
}

// ---------- CSV (quoted fields, commas and newlines inside quotes) ----------
export function parseCSVText(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim())) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x.trim())) rows.push(row);
  return rows;
}
const COLS = ['language', 'level', 'sort', 'title_fa', 'title_de', 'title_en', 'title_es', 'body_fa', 'body_de', 'body_en', 'body_es', 'examples'];
export function parseGrammarCSV(text) {
  const out = { rows: [], errors: [] };
  const rows = parseCSVText(text);
  if (!rows.length) { out.errors.push('فایل خالی است'); return out; }
  const head = rows[0].map(s => s.trim().toLowerCase());
  const miss = COLS.filter(c => !head.includes(c));
  if (miss.length) { out.errors.push('ستون‌های ناقص: ' + miss.join(', ')); return out; }
  rows.slice(1).forEach((r, n) => {
    const o = {}; head.forEach((k, i) => { if (COLS.includes(k)) o[k] = (r[i] || '').trim(); });
    if (!LEARN[o.language]) { out.errors.push(`ردیف ${n + 2}: زبان نامعتبر (${o.language})`); return; }
    if (!LEVELS.includes(o.level)) { out.errors.push(`ردیف ${n + 2}: سطح نامعتبر (${o.level})`); return; }
    o.sort = parseInt(o.sort, 10); if (!Number.isFinite(o.sort)) { out.errors.push(`ردیف ${n + 2}: شمارهٔ ترتیب نامعتبر`); return; }
    if (!o.title_fa && !o.title_en && !o.title_de && !o.title_es) { out.errors.push(`ردیف ${n + 2}: عنوان خالی است`); return; }
    out.rows.push(o);
  });
  return out;
}

// ---------- admin ----------
export function adminGrammarView(root) {
  const host = h('div', { class: 'stack' });
  const page = h('div', { class: 'page wide stack' });
  const fileInput = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', hidden: true });
  const importBtn = h('button', { class: 'btn primary', hidden: true });
  const report = h('div', { class: 'stack' });
  let parsed = null;
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files[0]; if (!f) return;
    parsed = parseGrammarCSV(await f.text());
    mount(report, h('div', { class: 'ok bold' }, `${parsed.rows.length} درس درست پیدا شد`),
      parsed.errors.length ? [h('div', { class: 'red small bold' }, `${parsed.errors.length} مشکل:`), parsed.errors.slice(0, 10).map(e => h('div', { class: 'red tiny' }, e))] : null);
    importBtn.hidden = !parsed.rows.length; importBtn.textContent = `ذخیرهٔ ${parsed.rows.length} درس`;
  });
  importBtn.addEventListener('click', async () => {
    importBtn.disabled = true; importBtn.textContent = 'در حال ذخیره…';
    try {
      for (let i = 0; i < parsed.rows.length; i += 100) await api.upsert('grammar?on_conflict=language,level,sort', parsed.rows.slice(i, i + 100));
      toast(`${parsed.rows.length} درس ذخیره شد ✓`, true); await loadGrammar(true); paint();
    } catch (e) { toast(e.message || 'خطا'); }
    importBtn.disabled = false; importBtn.textContent = `ذخیرهٔ ${parsed.rows.length} درس`;
  });
  async function paint() {
    mount(host, spinner());
    const all = await loadGrammar(true).catch(() => null);
    if (!all) { mount(host, h('div', { class: 'red small' }, 'جدول grammar پیدا نشد. اول فایل sql/grammar.sql را در Supabase اجرا کن.')); return; }
    const cnt = {}; all.forEach(g => { const k = g.language + ' ' + g.level; cnt[k] = (cnt[k] || 0) + 1; });
    mount(host, h('div', { class: 'card stack' }, h('div', { class: 'bold' }, `کل درس‌ها: ${all.length}`),
      Object.keys(cnt).sort().map(k => h('div', { class: 'row between small' }, h('span', null, (LEARN[k.split(' ')[0]].flag) + ' ' + k.split(' ')[1]), h('b', null, String(cnt[k]))))),
      all.length ? h('button', { class: 'btn danger small', onclick: async () => { if (await confirmBox('همهٔ درس‌های گرامر حذف شود؟', 'حذف')) { await api.delete('grammar?id=not.is.null'); paint(); } } }, 'حذف همهٔ درس‌ها') : null);
  }
  page.append(h('div', { class: 'topbar' }, h('button', { class: 'back', onclick: () => { location.hash = '#/admin'; } }, '‹'), h('h1', null, 'درس‌های گرامر')),
    h('p', { class: 'mute small' }, 'فایل CSV گرامر را اینجا وارد کن. هر درس با (زبان، سطح، شماره) شناخته می‌شود؛ وارد کردن دوباره همان درس را به‌روز می‌کند و تکراری نمی‌سازد.'),
    fileInput, h('button', { class: 'btn ghost', onclick: () => fileInput.click() }, 'انتخاب فایل CSV'),
    h('div', { class: 'small mute', style: { direction: 'ltr' } }, COLS.join(',')), report, importBtn, host);
  root.append(page); paint();
}
