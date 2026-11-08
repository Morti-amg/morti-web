import { T, LEARN, LEVELS, lang } from './i18n.js';
import { api } from './api.js';
import { store } from './store.js';
import { h, clear, mount, modal, toast, confirmBox, spinner, Speech, select } from './ui.js';

// ---------- data (loaded on demand, cached) ----------
let cache = null;
export async function loadGrammar(force = false) {
  if (cache && !force) return cache;
  cache = await api.fetchAll('grammar_view?select=*&order=language.asc,level.asc,sort.asc');
  return cache;
}
const pick = (g, base) => (g[base + '_' + lang] || g[base + '_en'] || g[base + '_fa'] || g[base + '_de'] || g[base + '_es'] || '').trim();
const UI = {
  fa: { title: 'گرامر', empty: 'هنوز درس گرامری برای این زبان نیست.', ex: 'مثال‌ها', all: 'همه', back: 'بازگشت', next: 'درس بعدی', prev: 'درس قبلی', locked: 'این درس قفل است', lockedText: 'برای دیدن این درس، سطح {0} را باز کن.', price: 'قیمت', soon: 'پرداخت به‌زودی فعال می‌شود.' },
  de: { title: 'Grammatik', empty: 'Für diese Sprache gibt es noch keine Grammatik.', ex: 'Beispiele', all: 'Alle', back: 'Zurück', next: 'Nächste Lektion', prev: 'Vorherige Lektion', locked: 'Diese Lektion ist gesperrt', lockedText: 'Schalte die Stufe {0} frei, um diese Lektion zu sehen.', price: 'Preis', soon: 'Die Bezahlung wird bald freigeschaltet.' },
  en: { title: 'Grammar', empty: 'No grammar lessons for this language yet.', ex: 'Examples', all: 'All', back: 'Back', next: 'Next lesson', prev: 'Previous lesson', locked: 'This lesson is locked', lockedText: 'Unlock level {0} to see this lesson.', price: 'Price', soon: 'Payment will be available soon.' },
  es: { title: 'Gramática', empty: 'Aún no hay lecciones de gramática para este idioma.', ex: 'Ejemplos', all: 'Todos', back: 'Volver', next: 'Siguiente lección', prev: 'Lección anterior', locked: 'Esta lección está bloqueada', lockedText: 'Desbloquea el nivel {0} para ver esta lección.', price: 'Precio', soon: 'El pago estará disponible pronto.' },
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
        h('span', { class: 'pill' }, g.level), h('div', { class: 'grow bold' }, (g.locked ? '🔒 ' : '') + pick(g, 'title')), h('span', { class: 'mute' }, lang === 'fa' ? '‹' : '›'))))
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
    if (g.locked) {
      const box = h('div', { class: 'card stack', style: { textAlign: 'center' } },
        h('div', { style: { fontSize: '44px' } }, '🔒'), h('div', { class: 'bold' }, L().locked),
        h('div', { class: 'mute' }, L().lockedText.replace('{0}', LEARN[g.language].flag + ' ' + g.level)));
      mount(host, topbar(pick(g, 'title'), `#/grammar/${g.language}`), box);
      api.fetch(`level_access?language=eq.${g.language}&level=eq.${g.level}&select=price_eur`).then(r => {
        if (r[0] && r[0].price_eur != null) box.append(h('div', { class: 'bold' }, `${L().price}: ${Number(r[0].price_eur).toFixed(2)} €`));
        box.append(h('div', { class: 'tiny mute' }, L().soon));
      }).catch(() => {});
      return;
    }
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


// ---------- manual editor (admin) ----------
function openGrammarEditor(g, done) {
  const isNew = !g;
  g = g || { language: 'de', level: 'A1', sort: 1, examples: '' };
  const state = { language: g.language, level: g.level };
  const mk = (ph, v, rows, dir) => { const t = h('textarea', { class: 'field', rows: String(rows), placeholder: ph, dir: dir || 'auto' }); t.value = v || ''; return t; };
  const sortIn = h('input', { class: 'field', type: 'number', min: '1', value: String(g.sort || 1), dir: 'ltr' });
  const titles = { fa: mk('عنوان · فارسی', g.title_fa, 1, 'rtl'), de: mk('Titel · Deutsch', g.title_de, 1, 'ltr'), en: mk('Title · English', g.title_en, 1, 'ltr'), es: mk('Título · Español', g.title_es, 1, 'ltr') };
  const bodies = { fa: mk('توضیح · فارسی', g.body_fa, 6, 'rtl'), de: mk('Erklärung · Deutsch', g.body_de, 6, 'ltr'), en: mk('Explanation · English', g.body_en, 6, 'ltr'), es: mk('Explicación · Español', g.body_es, 6, 'ltr') };
  const exLines = (g.examples || '').split(' ;; ').filter(Boolean).join('\n');
  const freeCb = h('input', { type: 'checkbox' }); freeCb.checked = !!g.is_free;
  const examples = mk('Ich bin müde. | من خسته‌ام. | Ich bin müde. | I am tired. | Estoy cansado.', exLines, 6, 'ltr');
  const m = modal((body, close) => {
    const save = h('button', { class: 'btn primary' }, 'ذخیره');
    save.addEventListener('click', async () => {
      const row = {
        language: state.language, level: state.level, sort: parseInt(sortIn.value, 10),
        title_fa: titles.fa.value.trim(), title_de: titles.de.value.trim(), title_en: titles.en.value.trim(), title_es: titles.es.value.trim(),
        body_fa: bodies.fa.value.trim(), body_de: bodies.de.value.trim(), body_en: bodies.en.value.trim(), body_es: bodies.es.value.trim(),
        is_free: freeCb.checked,
        examples: examples.value.split('\n').map(x => x.trim()).filter(Boolean).map(x => x.replace(/;;/g, ';')).join(' ;; '),
      };
      if (!Number.isFinite(row.sort)) return toast('شمارهٔ ترتیب را وارد کن');
      if (!row.title_fa && !row.title_en && !row.title_de && !row.title_es) return toast('حداقل یک عنوان لازم است');
      save.disabled = true;
      try {
        await api.upsert('grammar?on_conflict=language,level,sort', [row]);
        toast('ذخیره شد ✓', true); await loadGrammar(true); close(); done && done();
      } catch (e) { toast(e.message || 'خطا'); save.disabled = false; }
    });
    body.append(h('div', { class: 'stack' },
      h('div', { class: 'row', style: { gap: '8px' } },
        select(Object.keys(LEARN).map(k => ({ value: k, label: LEARN[k].flag + ' ' + k.toUpperCase() })), state.language, v => { state.language = v; }),
        select(LEVELS.map(l => ({ value: l, label: l })), state.level, v => { state.level = v; }),
        sortIn),
      h('div', { class: 'tiny mute' }, 'زبان یادگیری · سطح · شمارهٔ ترتیب (اگر همان شماره را دوباره ذخیره کنی، درس قبلی به‌روز می‌شود)'),
      titles.fa, titles.de, titles.en, titles.es,
      bodies.fa, bodies.de, bodies.en, bodies.es,
      h('label', { class: 'row small', style: { gap: '8px' } }, freeCb, 'رایگان (حتی اگر سطح پولی باشد)'),
      h('div', { class: 'small bold' }, 'مثال‌ها (هر مثال یک خط)'),
      h('div', { class: 'tiny mute', style: { direction: 'ltr' } }, 'جمله | فارسی | آلمانی | English | Español'),
      examples, save));
  }, { title: isNew ? 'درس جدید' : 'ویرایش درس' });
  return m;
}


// ---------- admin: locks, prices, who has access ----------
export function adminAccessView(root) {
  const host = h('div', { class: 'stack' });
  root.append(h('div', { class: 'page wide stack' },
    h('div', { class: 'topbar' }, h('button', { class: 'back', onclick: () => { location.hash = '#/admin'; } }, '‹'), h('h1', null, 'قفل و قیمت')),
    host));
  const LANGS = ['de', 'en', 'es'];
  async function paint() {
    mount(host, spinner());
    let settings, access, ents;
    try {
      [settings, access, ents] = await Promise.all([
        api.fetch('app_settings?select=*'), api.fetch('level_access?select=*'),
        api.fetch('entitlements?select=*&order=created_at.desc&limit=200')]);
    } catch (e) { mount(host, h('div', { class: 'red small' }, 'جدول‌ها پیدا نشد. اول فایل sql/paywall.sql را در Supabase اجرا کن.')); return; }
    const on = (settings.find(x => x.key === 'paywall_enabled') || {}).value === 'true';
    const rows = {};
    LANGS.forEach(l => LEVELS.forEach(v => { const r = access.find(a => a.language === l && a.level === v); rows[l + v] = { language: l, level: v, paid: r ? r.paid : v !== 'A1', price_eur: r && r.price_eur != null ? String(r.price_eur) : '', product_id: r ? r.product_id : '' }; }));

    const sw = h('button', { class: 'btn ' + (on ? 'danger' : 'primary') }, on ? 'قفل‌ها روشن است — خاموش کن' : 'قفل‌ها خاموش است — روشن کن');
    sw.addEventListener('click', async () => {
      if (!on && !(await confirmBox('قفل‌ها روشن شود؟ کاربران بدون پرداخت یا دسترسی، درس‌های پولی را نمی‌بینند.', 'روشن کن', false))) return;
      try { await api.upsert('app_settings?on_conflict=key', [{ key: 'paywall_enabled', value: on ? 'false' : 'true' }]); toast('ذخیره شد ✓', true); paint(); } catch (e) { toast(e.message || 'خطا'); }
    });

    const lvlRows = [];
    LANGS.forEach(l => {
      lvlRows.push(h('div', { class: 'bold', style: { marginTop: '8px' } }, LEARN[l].flag + ' ' + l.toUpperCase()));
      LEVELS.forEach(v => {
        const r = rows[l + v];
        const sel = select([{ value: 'free', label: 'رایگان' }, { value: 'paid', label: 'پولی' }], r.paid ? 'paid' : 'free', x => { r.paid = x === 'paid'; });
        const price = h('input', { class: 'field', type: 'number', step: '0.01', min: '0', placeholder: 'قیمت €', value: r.price_eur, dir: 'ltr', style: { maxWidth: '110px' } });
        price.addEventListener('input', () => { r.price_eur = price.value; });
        const pid = h('input', { class: 'field', placeholder: 'App Store product id', value: r.product_id, dir: 'ltr' });
        pid.addEventListener('input', () => { r.product_id = pid.value.trim(); });
        lvlRows.push(h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, h('span', { class: 'pill' }, v), sel, price, pid));
      });
    });
    const saveAll = h('button', { class: 'btn primary' }, 'ذخیرهٔ سطح‌ها و قیمت‌ها');
    saveAll.addEventListener('click', async () => {
      saveAll.disabled = true;
      try {
        await api.upsert('level_access?on_conflict=language,level', Object.values(rows).map(r => ({ language: r.language, level: r.level, paid: r.paid, price_eur: r.price_eur === '' ? null : Number(r.price_eur), product_id: r.product_id })));
        toast('ذخیره شد ✓', true);
      } catch (e) { toast(e.message || 'خطا'); }
      saveAll.disabled = false;
    });

    // grant access by e-mail
    const em = h('input', { class: 'field', placeholder: 'ایمیل کاربر', dir: 'ltr', type: 'email', autocapitalize: 'none' });
    const gl = { language: 'de', level: 'A2' };
    const days = h('input', { class: 'field', type: 'number', min: '1', placeholder: 'روز (خالی = همیشه)', dir: 'ltr' });
    const grant = h('button', { class: 'btn primary' }, 'باز کردن برای این کاربر');
    grant.addEventListener('click', async () => {
      const email = em.value.trim().toLowerCase(); if (!email) return toast('ایمیل را وارد کن');
      grant.disabled = true;
      try {
        const u = await api.fetch('profiles?select=id,email&email=eq.' + encodeURIComponent(email));
        if (!u.length) { toast('کاربری با این ایمیل پیدا نشد'); grant.disabled = false; return; }
        const d = parseInt(days.value, 10);
        await api.upsert('entitlements?on_conflict=user_id,language,level', [{ user_id: u[0].id, language: gl.language, level: gl.level, source: 'admin', expires_at: Number.isFinite(d) ? new Date(Date.now() + d * 86400000).toISOString() : null }]);
        toast('باز شد ✓', true); paint();
      } catch (e) { toast(e.message || 'خطا'); grant.disabled = false; }
    });
    const emailOf = id => { const a = (store.accounts || []).find(x => x.id === id); return a ? a.email : id.slice(0, 8); };

    mount(host,
      h('div', { class: 'card stack' }, h('div', { class: 'bold' }, 'قفل‌ها'),
        h('div', { class: 'small mute' }, 'تا وقتی خاموش باشد، همهٔ درس‌ها برای همه رایگان است. هر درس را می‌توانی در ویرایشش «رایگان» کنی.'), sw),
      h('div', { class: 'card stack' }, h('div', { class: 'bold' }, 'سطح‌ها و قیمت‌ها'), lvlRows, saveAll),
      h('div', { class: 'card stack' }, h('div', { class: 'bold' }, 'باز کردن دستی برای یک کاربر'), em,
        h('div', { class: 'row', style: { gap: '8px' } },
          select([{ value: 'all', label: 'همهٔ زبان‌ها' }, ...LANGS.map(l => ({ value: l, label: LEARN[l].flag + ' ' + l.toUpperCase() }))], gl.language, v => { gl.language = v; }),
          select([{ value: 'ALL', label: 'همهٔ سطح‌ها' }, ...LEVELS.map(v => ({ value: v, label: v }))], gl.level, v => { gl.level = v; })),
        days, grant),
      h('div', { class: 'card stack' }, h('div', { class: 'bold' }, `دسترسی‌های داده‌شده: ${ents.length}`),
        ents.map(e => h('div', { class: 'row between small' },
          h('div', { class: 'grow', dir: 'ltr' }, `${emailOf(e.user_id)} · ${e.language} ${e.level}${e.expires_at ? ' · تا ' + e.expires_at.slice(0, 10) : ''} · ${e.source}`),
          h('button', { class: 'btn danger small', onclick: async () => { if (await confirmBox('این دسترسی حذف شود؟', 'حذف')) { await api.delete('entitlements?id=eq.' + e.id); paint(); } } }, 'حذف')))));
  }
  paint();
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
      h('button', { class: 'btn primary', onclick: () => openGrammarEditor(null, paint) }, '＋ نوشتن درس جدید'),
      all.map(g => h('div', { class: 'card row between' },
        h('div', { class: 'grow' }, h('div', { class: 'tiny mute' }, `${LEARN[g.language].flag} ${g.level} · ${g.sort}`), h('div', { class: 'small bold' }, g.title_fa || g.title_en || g.title_de || g.title_es)),
        h('button', { class: 'btn ghost small', onclick: () => openGrammarEditor(g, paint) }, 'ویرایش'),
        h('button', { class: 'btn danger small', onclick: async () => { if (await confirmBox('این درس حذف شود؟', 'حذف')) { await api.delete('grammar?id=eq.' + g.id); await loadGrammar(true); paint(); } } }, 'حذف'))),
      all.length ? h('button', { class: 'btn danger small', onclick: async () => { if (await confirmBox('همهٔ درس‌های گرامر حذف شود؟', 'حذف')) { await api.delete('grammar?id=not.is.null'); paint(); } } }, 'حذف همهٔ درس‌ها') : null);
  }
  page.append(h('div', { class: 'topbar' }, h('button', { class: 'back', onclick: () => { location.hash = '#/admin'; } }, '‹'), h('h1', null, 'درس‌های گرامر')),
    h('p', { class: 'mute small' }, 'فایل CSV گرامر را اینجا وارد کن. هر درس با (زبان، سطح، شماره) شناخته می‌شود؛ وارد کردن دوباره همان درس را به‌روز می‌کند و تکراری نمی‌سازد.'),
    fileInput, h('button', { class: 'btn ghost', onclick: () => fileInput.click() }, 'انتخاب فایل CSV'),
    h('div', { class: 'small mute', style: { direction: 'ltr' } }, COLS.join(',')), report, importBtn, host);
  root.append(page); paint();
}
