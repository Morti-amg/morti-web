import { T, LEARN, LEVELS, TOPIC_KEYS, topicFa, LANGS } from './i18n.js';
import { api } from './api.js';
import { store, on, wordShown, uuid, tickerLive, msgTitle } from './store.js';
import { h, clear, mount, field, val, select, modal, toast, confirmBox, spinner, formatDate } from './ui.js';
import { chatPanel } from './chat.js';
import { newWord, parseBulk, parseCSVWords, bulkOrder } from './csv.js';

const A = 'wide';
const page = (...c) => h('div', { class: 'page wide stack' }, ...c);
const bar = (title, { back = null, right = null } = {}) => h('div', { class: 'topbar' },
  back ? h('button', { class: 'back', onclick: () => { location.hash = back; } }, '‹') : null, h('h1', null, title), right);
const statCard = (v, l, gold) => h('div', { class: 'card stat' + (gold ? ' gold' : '') }, h('b', null, String(v)), h('span', null, l));

export function lastSeenText(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'آنلاین';
  if (s < 3600) return Math.floor(s / 60) + ' دقیقه پیش';
  if (s < 86400) return Math.floor(s / 3600) + ' ساعت پیش';
  return formatDate(iso);
}
const dot = on => h('span', { class: 'dot' + (on ? ' on' : '') });

// =====================================================================
// DASHBOARD
// =====================================================================
export function dashboardView(root) {
  const learners = store.learners;
  const today = new Date().toDateString();
  const activeToday = learners.filter(a => new Date(a.last_active).toDateString() === today).length;
  const totalPoints = learners.reduce((s, a) => s + a.points, 0);
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d; });
  const counts = days.map(d => learners.filter(a => new Date(a.joined_at).toDateString() === d.toDateString()).length);
  const max = Math.max(1, ...counts);

  const online = h('div', { class: 'card stack', style: { gap: '8px' } });
  const paintOnline = () => {
    const list = store.onlineLearners;
    mount(online, h('div', { class: 'row between' }, h('span', { class: 'bold' }, 'آنلاین الان'), h('span', { class: 'pill', style: { color: 'var(--ok)' } }, String(list.length))),
      list.length ? list.map(a => h('a', { href: '#/a-user/' + a.id, class: 'row small', style: { color: 'inherit', textDecoration: 'none' } }, dot(true), a.full_name, h('span', { class: 'mute' }, `${LEARN[a.learning].flag} ${a.level}`)))
        : h('div', { class: 'mute small' }, 'الان کسی آنلاین نیست'));
  };
  paintOnline();
  const off = on('presence', paintOnline);

  const eventsCount = h('span', { class: 'pill' }, '…');
  (async () => { const ev = await store.loadAccountEvents(); const open = ev.filter(e => !e.resolved).length; eventsCount.textContent = String(open); if (open) eventsCount.style.color = 'var(--accent)'; })();

  const link = (href, icon, title, sub, extra) => h('a', { href, class: 'card link row' }, h('span', { style: { fontSize: '24px' } }, icon),
    h('div', { class: 'grow' }, h('div', { class: 'bold small' }, title), h('div', { class: 'mute tiny' }, sub)), extra, h('span', { class: 'mute' }, '›'));

  root.append(page(
    bar('داشبورد', { right: h('button', { class: 'btn small ghost', onclick: () => store.logout() }, 'خروج') }),
    h('div', { class: 'grid2', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' } },
      statCard(learners.length, 'کل کاربران'), statCard(activeToday, 'فعال امروز'), statCard(store.words.length, 'لغت و جمله'), statCard(totalPoints, 'مجموع امتیازها', true)),
    online,
    link('#/a-ticker', '📣', 'نوار متحرک بالای اپ', 'یک جملهٔ انگیزشی یا خبر برای همهٔ کاربران'),
    link('#/a-grammar', '📘', 'درس‌های گرامر', 'وارد کردن فایل CSV گرامر (آلمانی، انگلیسی، اسپانیایی)'),
    link('#/a-access', '🔒', 'قفل و قیمت', 'سطح‌های پولی، قیمت، و باز کردن دسترسی برای کاربران'),
    link('#/a-events', '🔑', 'تغییرات و درخواست‌های حساب', 'تغییر نام، ایمیل، رمز عبور و درخواست کمک کاربران', eventsCount),
    store.unreadFromUsers > 0 ? h('div', { class: 'card row' }, '🔔', h('b', null, `${store.unreadFromUsers} پیام جدید از ${store.unreadUsersCount} کاربر`)) : null,
    h('div', { class: 'card stack' }, h('div', { class: 'bold' }, 'ثبت‌نام ۷ روز اخیر'),
      h('div', { class: 'chart' }, days.map((d, i) => h('div', null, h('span', { class: 'tiny mute' }, String(counts[i])),
        h('i', { style: { height: (counts[i] / max * 80 + 4) + 'px' } }), h('span', { class: 'tiny mute' }, d.toLocaleDateString(undefined, { weekday: 'short' }))))))));
  store.refreshPresence();
  return off;
}

// =====================================================================
// CHATS
// =====================================================================
export function adminChatsView(root) {
  const host = h('div', { class: 'stack', style: { gap: '10px' } });
  root.append(page(bar('گفتگوها'), host));
  const paint = () => {
    const by = {};
    for (const m of store.chat) (by[m.user_id] ||= []).push(m);
    const threads = Object.entries(by).map(([uid, msgs]) => {
      const sorted = [...msgs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return { uid, last: sorted[0], unread: msgs.filter(m => !m.from_admin && m.read !== true).length };
    }).sort((a, b) => new Date(b.last.created_at) - new Date(a.last.created_at));
    mount(host, threads.length ? threads.map(t => {
      const a = store.accounts.find(x => x.id === t.uid);
      return h('a', { href: '#/a-chat/' + t.uid, class: 'card link row' }, dot(a && store.isOnline(a)),
        h('div', { class: 'grow' }, h('div', { class: 'bold' }, a ? a.full_name : t.uid.slice(0, 8)),
          h('div', { class: 'mute small', style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, (t.last.from_admin ? '↩ ' : '') + t.last.body)),
        t.unread ? h('span', { class: 'pill', style: { color: '#fff', background: 'var(--accent)' } }, String(t.unread)) : null);
    }) : h('div', { class: 'empty' }, 'هنوز کسی پیام نداده'));
  };
  paint();
  return on('chat', paint);
}

export function adminChatThreadView(root, [uid]) {
  const a = store.accounts.find(x => x.id === uid);
  const host = h('div');
  root.append(page(bar(a ? a.full_name : 'گفتگو', { back: '#/a-chats', right: a ? h('a', { class: 'btn small ghost', href: '#/a-user/' + uid }, '👤') : null }), host));
  return chatPanel(host, uid, true, { fullHeight: true });
}

// =====================================================================
// USERS
// =====================================================================
export function usersView(root) {
  let q = '', onlineOnly = false;
  const list = h('div', { class: 'card list' });
  const search = h('input', { class: 'field', placeholder: '🔍 جستجوی نام، ایمیل یا تلفن', oninput: e => { q = e.target.value.toLowerCase(); paint(); } });
  const toggle = h('input', { type: 'checkbox', onchange: e => { onlineOnly = e.target.checked; paint(); } });
  function paint() {
    const users = store.learners.filter(a => (!onlineOnly || store.isOnline(a)) &&
      (!q || [a.full_name, a.email, a.phone].some(s => (s || '').toLowerCase().includes(q))));
    mount(list, users.length ? users.map(a => h('a', { href: '#/a-user/' + a.id, class: 'list-item', style: { color: 'inherit', textDecoration: 'none' } },
      dot(store.isOnline(a)),
      h('div', { class: 'grow' }, h('div', { class: 'bold' }, a.full_name), h('div', { class: 'mute tiny' }, `${LEARN[a.learning].flag} ${a.level} · ${a.country}`)),
      a.is_blocked ? h('span', { class: 'red tiny' }, 'مسدود') : null, h('b', { class: 'gold' }, String(a.points)))) : h('div', { class: 'empty' }, 'کاربری پیدا نشد'));
  }
  paint();
  root.append(page(bar(`کاربران (${store.learners.length})`), search, h('label', { class: 'switch small' }, h('span', null, 'فقط آنلاین‌ها'), toggle), list));
  return on('presence', paint);
}

export function userDetailView(root, [uid]) {
  const a = store.accounts.find(x => x.id === uid);
  if (!a) { root.append(page(bar('کاربر', { back: '#/a-users' }), h('div', { class: 'empty' }, 'پیدا نشد'))); return; }
  const kv = (k, v) => h('div', { class: 'kv' }, h('span', null, k), h('span', { style: { direction: 'ltr', textAlign: 'end' } }, v));
  root.append(page(bar(a.full_name, { back: '#/a-users' }),
    h('div', { class: 'card' }, kv('ایمیل', a.email), kv('تلفن', a.phone), kv('کشور', a.country), kv('زبان مادری', a.native_language),
      kv('در حال یادگیری', `${LEARN[a.learning].flag} ${a.level}`), kv('امتیاز', a.points), kv('رکورد روزانه', a.streak), kv('لغت‌های یادگرفته', a.learned_ids.length),
      kv('عضویت', formatDate(a.joined_at)), kv('آخرین فعالیت', lastSeenText(a.last_active)), kv('رضایت حریم خصوصی', a.consent_at ? formatDate(a.consent_at) : '—')),
    h('a', { class: 'btn ghost', href: '#/a-chat/' + a.id, style: { textDecoration: 'none' } }, '💬 گفتگو با کاربر · Chat'),
    h('button', { class: 'btn ghost', onclick: () => pointsModal(a) }, 'امتیاز یا پیام شخصی'),
    h('label', { class: 'switch' }, h('span', null, 'مسدود کردن کاربر'), h('input', { type: 'checkbox', checked: a.is_blocked, onchange: async e => { await store.setBlocked(a.id, e.target.checked); toast('✓', true); } })),
    h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox(`حذف ${a.full_name}؟ این کار برگشت‌پذیر نیست.`, 'حذف')) { await store.deleteAccount(a.id); location.hash = '#/a-users'; } } }, 'حذف کاربر')));
}

function pointsModal(a) {
  modal((body, close) => {
    let amount = 10;
    const out = h('div', { class: 'center big gold' }, '+10');
    const slider = h('input', { type: 'range', min: '-100', max: '100', step: '5', value: '10', style: { width: '100%' }, oninput: e => { amount = Number(e.target.value); out.textContent = (amount > 0 ? '+' : '') + amount; } });
    const note = field('پیام شخصی (اختیاری)');
    body.append(h('div', { class: 'center' }, 'امتیاز'), out, slider, note,
      h('button', { class: 'btn primary', onclick: async () => { await store.givePoints(amount, a.id, val(note).trim()); toast('✓', true); close(); } }, 'ثبت'));
  }, { title: 'امتیاز و پیام شخصی' });
}

// =====================================================================
// WORDS
// =====================================================================
export function wordsView(root) {
  let filter = '', q = '', selecting = false; const selected = new Set();
  const list = h('div', { class: 'card list' });
  const count = h('span', { class: 'mute small' });
  function paint() {
    const words = store.words.filter(w => (!filter || w.language === filter) &&
      (!q || [w.text, w.translation, w.tr_fa, w.tr_de, w.tr_en, w.tr_es].some(s => (s || '').toLowerCase().includes(q))));
    count.textContent = `${words.length} / ${store.words.length}`;
    mount(list, words.slice(0, 300).map(w => h('div', { class: 'list-item', style: { cursor: 'pointer' }, onclick: () => {
      if (selecting) { selected.has(w.id) ? selected.delete(w.id) : selected.add(w.id); paint(); } else wordEditor(w, paint);
    } },
      selecting ? h('input', { type: 'checkbox', checked: selected.has(w.id), style: { pointerEvents: 'none' } }) : null,
      h('div', { class: 'grow' }, h('div', { class: 'bold' }, w.text), h('div', { class: 'mute small' }, wordShown(w))),
      w.audio_path ? '🎙' : null, w.video_path ? '🎬' : null, w.is_word_of_day ? '⭐' : null,
      h('span', { class: 'mute tiny' }, `${LEARN[w.language].flag} ${w.level}`))));
    if (words.length > 300) list.append(h('div', { class: 'empty small' }, `… ${words.length - 300} مورد دیگر (جستجو یا فیلتر کن)`));
    delBtn.hidden = !selecting || !selected.size; delBtn.textContent = `حذف ${selected.size} مورد`;
  }
  const delBtn = h('button', { class: 'btn danger small', hidden: true, onclick: async () => {
    if (await confirmBox(`${selected.size} مورد حذف شود؟`, 'حذف')) { await store.deleteWords([...selected]); selected.clear(); selecting = false; selBtn.textContent = 'انتخاب'; paint(); }
  } });
  const selBtn = h('button', { class: 'btn small ghost', onclick: () => { selecting = !selecting; selected.clear(); selBtn.textContent = selecting ? 'پایان' : 'انتخاب'; paint(); } }, 'انتخاب');
  const seg = h('div', { class: 'seg' }, [['', 'همه'], ...Object.entries(LEARN).map(([k, v]) => [k, v.flag + ' ' + v.title])].map(([k, t]) =>
    h('button', { class: k === filter ? 'on' : '', onclick: e => { filter = k; [...seg.children].forEach(b => b.classList.remove('on')); e.currentTarget.classList.add('on'); paint(); } }, t)));
  root.append(page(bar('لغت‌ها و جمله‌ها', { right: h('div', { class: 'row' }, selBtn, h('button', { class: 'btn small primary', onclick: addMenu }, '＋ افزودن')) }),
    seg, h('input', { class: 'field', placeholder: '🔍 جستجو', oninput: e => { q = e.target.value.toLowerCase(); paint(); } }),
    h('div', { class: 'row between' }, count, delBtn), list));
  paint();
  const off = on('data', paint);
  function addMenu() {
    modal((body, close) => body.append(
      h('button', { class: 'btn ghost', onclick: () => { close(); wordEditor(null, paint); } }, '＋ افزودن یک مورد'),
      h('button', { class: 'btn ghost', onclick: () => { close(); bulkModal(paint); } }, '📝 افزودن گروهی (متن)'),
      h('button', { class: 'btn ghost', onclick: () => { close(); csvModal(paint); } }, '📄 وارد کردن فایل CSV')), { title: 'افزودن' });
  }
  return off;
}

function mimeOf(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return { m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', aac: 'audio/aac', mov: 'video/quicktime', mp4: 'video/mp4', webm: 'video/webm', ogg: 'audio/ogg' }[ext] || 'application/octet-stream';
}

function wordEditor(existing, onSaved) {
  const d = existing ? { ...existing } : newWord(store.current?.learning || 'de', 'A1', '');
  let audioFile = null, videoFile = null, removeAudio = false, removeVideo = false;
  modal((body, close) => {
    const text = field('لغت یا جمله (مثلاً Guten Morgen)', { value: d.text, dir: 'auto' });
    const topic = field('موضوع (مثلاً restaurant)', { value: d.topic || '' });
    const example = field('مثال (اختیاری)', { value: d.example || '', dir: 'auto' });
    const tr = {}; LANGS.forEach(l => { tr[l.code] = field(`ترجمه · ${l.name}`, { value: d['tr_' + l.code] || '', dir: l.dir }); });
    const err = h('div', { class: 'err', hidden: true });
    const audioInfo = h('div', { class: 'small mute' }), videoInfo = h('div', { class: 'small mute' });
    const paintMedia = () => {
      audioInfo.textContent = audioFile ? '🎙 ' + audioFile.name : (d.audio_path && !removeAudio ? '🎙 صدا موجود است' : 'بدون صدا');
      videoInfo.textContent = videoFile ? '🎬 ' + videoFile.name : (d.video_path && !removeVideo ? '🎬 ویدیو موجود است' : 'بدون ویدیو');
    }; paintMedia();
    const pickFile = (accept, set) => { const i = h('input', { type: 'file', accept, onchange: () => { if (i.files[0]) { set(i.files[0]); paintMedia(); } } }); i.click(); };
    const save = h('button', { class: 'btn primary' }, 'ذخیره');
    save.addEventListener('click', async () => {
      err.hidden = true;
      d.text = val(text).trim(); d.topic = val(topic).trim().toLowerCase(); d.example = val(example).trim();
      LANGS.forEach(l => { d['tr_' + l.code] = val(tr[l.code]).trim(); });
      if (!d.text) { err.textContent = 'لغت خالی است'; err.hidden = false; return; }
      if (!LANGS.some(l => d['tr_' + l.code])) { err.textContent = 'حداقل یک ترجمه بنویس'; err.hidden = false; return; }
      save.disabled = true; save.textContent = 'در حال ذخیره…';
      try {
        if (removeAudio) d.audio_path = null; if (removeVideo) d.video_path = null;
        const up = async (file, folder, maxMB) => {
          if (file.size > maxMB * 1024 * 1024) throw new Error(`فایل بزرگ‌تر از ${maxMB} مگابایت است`);
          const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
          const path = `${folder}/${d.id.toLowerCase()}-${Date.now()}.${ext}`;
          await api.upload('media', path, file, file.type || mimeOf(file.name), true); return path;
        };
        if (audioFile) d.audio_path = await up(audioFile, 'audio', 20);
        if (videoFile) d.video_path = await up(videoFile, 'video', 50);
        await store.saveWord(d); close(); onSaved && onSaved();
      } catch (e) { err.textContent = e.message || 'خطا'; err.hidden = false; save.disabled = false; save.textContent = 'ذخیره'; }
    });
    body.append(
      h('div', { class: 'row gap' }, select(Object.entries(LEARN).map(([k, v]) => ({ value: k, label: v.flag + ' ' + v.title })), d.language, v => d.language = v),
        select(LEVELS.map(l => ({ value: l, label: l })), d.level, v => d.level = v)),
      text, topic,
      h('div', { class: 'chips' }, TOPIC_KEYS.map(k => h('button', { class: 'chip', type: 'button', onclick: () => { topic.value = k; } }, `${k} · ${topicFa(k)}`))),
      example, LANGS.map(l => tr[l.code]),
      h('label', { class: 'switch' }, h('span', null, '⭐ لغت روز'), h('input', { type: 'checkbox', checked: d.is_word_of_day, onchange: e => d.is_word_of_day = e.target.checked })),
      h('div', { class: 'card stack' }, audioInfo,
        h('div', { class: 'row gap' }, h('button', { class: 'btn small ghost', type: 'button', onclick: () => pickFile('audio/*', f => { audioFile = f; removeAudio = false; }) }, 'انتخاب فایل صدا'),
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => { audioFile = null; removeAudio = true; paintMedia(); } }, 'حذف صدا'))),
      h('div', { class: 'card stack' }, videoInfo,
        h('div', { class: 'row gap' }, h('button', { class: 'btn small ghost', type: 'button', onclick: () => pickFile('video/*', f => { videoFile = f; removeVideo = false; }) }, 'انتخاب ویدیو'),
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => { videoFile = null; removeVideo = true; paintMedia(); } }, 'حذف ویدیو'))),
      err, save);
  }, { title: existing ? 'ویرایش' : 'افزودن' });
}

function bulkModal(onDone) {
  modal((body, close) => {
    let language = 'de', level = 'A1';
    const topic = field('موضوع (مثلاً airport)');
    const names = { fa: 'فارسی', de: 'Deutsch', en: 'English', es: 'Español' };
    const hint = h('div', { class: 'small mute' });
    const paintHint = () => { hint.textContent = 'هر خط: لغت = ' + bulkOrder(language).map(l => names[l]).join(' | '); };
    paintHint();
    const ta = h('textarea', { class: 'field', rows: '10', placeholder: 'Guten Abend = عصر بخیر | Good evening | Buenas tardes', dir: 'auto' });
    const out = h('div', { class: 'small' });
    const go = h('button', { class: 'btn primary' }, 'افزودن همه');
    go.addEventListener('click', async () => {
      const r = parseBulk(ta.value, language, level, val(topic).trim().toLowerCase());
      out.innerHTML = ''; r.errors.forEach(e => out.append(h('div', { class: 'red' }, e)));
      if (!r.words.length) return;
      go.disabled = true; go.textContent = '…';
      const ok = await store.importWords(r.words);
      if (ok) { toast(`${r.words.length} مورد افزوده شد ✓`, true); close(); onDone && onDone(); } else { go.disabled = false; go.textContent = 'افزودن همه'; }
    });
    body.append(h('div', { class: 'row gap' }, select(Object.entries(LEARN).map(([k, v]) => ({ value: k, label: v.flag + ' ' + v.title })), language, v => { language = v; paintHint(); }),
      select(LEVELS.map(l => ({ value: l, label: l })), level, v => level = v)),
      topic, hint, ta, h('div', { class: 'tiny mute' }, 'اگر فقط یک ترجمه بنویسی، همان فارسی حساب می‌شود.'), out, go);
  }, { title: 'افزودن گروهی' });
}

function csvModal(onDone) {
  modal((body, close) => {
    let result = null;
    const fileInput = h('input', { type: 'file', accept: '.csv,text/csv,text/plain', hidden: true });
    const out = h('div', { class: 'stack' });
    const importBtn = h('button', { class: 'btn primary', hidden: true });
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0]; if (!f) return;
      result = parseCSVWords(await f.text());
      mount(out,
        h('div', { class: 'ok bold' }, `${result.words.length} مورد درست پیدا شد`),
        result.words.slice(0, 8).map(w => h('div', { class: 'small' }, `${LEARN[w.language].flag} ${w.text}`)),
        result.words.length > 8 ? h('div', { class: 'tiny mute' }, `… و ${result.words.length - 8} مورد دیگر`) : null,
        result.errors.length ? [h('div', { class: 'red small bold' }, `${result.errors.length} خط مشکل دارد و رد می‌شود:`), result.errors.slice(0, 8).map(e => h('div', { class: 'red tiny' }, e))] : null);
      importBtn.hidden = !result.words.length; importBtn.textContent = `وارد کردن ${result.words.length} مورد`;
    });
    importBtn.addEventListener('click', async () => {
      importBtn.disabled = true; importBtn.textContent = 'در حال ذخیره…';
      const ok = await store.importWords(result.words);
      if (ok) { toast(`${result.words.length} مورد ذخیره شد ✓`, true); close(); onDone && onDone(); } else { importBtn.disabled = false; importBtn.textContent = `وارد کردن ${result.words.length} مورد`; }
    });
    body.append(fileInput, h('button', { class: 'btn ghost', onclick: () => fileInput.click() }, 'انتخاب فایل CSV'),
      h('div', { class: 'small mute', style: { direction: 'ltr' } }, 'language,level,topic,text,fa,de,en,es,example'), out, importBtn);
  }, { title: 'وارد کردن CSV' });
}

// =====================================================================
// BROADCAST MESSAGES
// =====================================================================
async function machineTranslate(text, from, to) {
  try {
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`);
    const o = await r.json();
    let t = o?.responseData?.translatedText;
    if (!t || String(o.responseStatus) !== '200' || t.toUpperCase().includes('MYMEMORY WARNING')) return null;
    return t.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  } catch (e) { return null; }
}

export function messagesView(root) {
  const order = ['fa', 'en', 'de', 'es'];
  const titles = {}, bodies = {};
  const info = h('div', { class: 'ok small center', hidden: true });
  const sentBox = h('div', { class: 'card stack' });
  const blocks = LANGS.map(l => {
    titles[l.code] = field(`عنوان · ${l.name}`, { dir: l.dir, caps: 'sentences' });
    bodies[l.code] = h('textarea', { class: 'field', rows: '3', placeholder: `متن · ${l.name}`, dir: l.dir });
    return h('div', { class: 'card stack' }, h('div', { class: 'bold small' }, l.name), titles[l.code], bodies[l.code]);
  });
  const clean = s => (s || '').trim();
  const t = k => clean(val(titles[k])), b = k => clean(bodies[k].value);
  const trBtn = h('button', { class: 'btn ghost' }, '🌐 ترجمهٔ خودکار به زبان‌های خالی');
  trBtn.addEventListener('click', async () => {
    const src = order.find(k => t(k) && b(k)); if (!src) return;
    trBtn.disabled = true; info.hidden = true;
    for (const target of order) {
      if (target === src || t(target) || b(target)) continue;
      const [tt, tb] = await Promise.all([machineTranslate(t(src), src, target), machineTranslate(b(src), src, target)]);
      if (tt && tb) { titles[target].value = tt; bodies[target].value = tb; }
    }
    trBtn.disabled = false; info.textContent = 'ترجمه شد ✓ متن‌ها را بخوان و بعد ارسال کن'; info.hidden = false;
  });
  const sendBtn = h('button', { class: 'btn primary' }, 'ارسال به همهٔ کاربران');
  sendBtn.addEventListener('click', async () => {
    const baseK = order.find(k => t(k) && b(k)); if (!baseK) return;
    const m = { title: t(baseK), body: b(baseK) };
    for (const k of ['de', 'en', 'es']) if (t(k) && b(k)) { m['title_' + k] = t(k); m['body_' + k] = b(k); }
    sendBtn.disabled = true; await store.sendMessage(m); sendBtn.disabled = false;
    LANGS.forEach(l => { titles[l.code].value = ''; bodies[l.code].value = ''; });
    info.textContent = `برای ${store.learners.length} کاربر ارسال شد ✓`; info.hidden = false; paintSent();
  });
  function paintSent() {
    const sent = store.messages.filter(m => !m.user_id);
    mount(sentBox, h('div', { class: 'bold' }, 'پیام‌های ارسال‌شده'), sent.length ? sent.map(m => h('div', { class: 'row', style: { alignItems: 'flex-start', borderTop: '1px solid var(--line)', paddingTop: '8px' } },
      h('div', { class: 'grow' }, h('div', { class: 'bold' }, m.title), h('div', { class: 'mute small', style: { whiteSpace: 'pre-wrap' } }, m.body), h('div', { class: 'tiny mute' }, formatDate(m.created_at))),
      h('button', { class: 'link-btn red', onclick: async () => { await store.deleteMessage(m.id); paintSent(); } }, '🗑')))
      : h('div', { class: 'mute small' }, 'هنوز چیزی ارسال نشده.'));
  }
  paintSent();
  root.append(page(bar('پیام همگانی'), h('p', { class: 'mute small' }, 'پیام را به هر زبان که می‌خواهی بنویس. هر کاربر پیام را به زبان خودش می‌بیند؛ اگر زبانی خالی بماند، انگلیسی یا فارسی نشان داده می‌شود.'),
    h('div', { class: 'grid2', style: { gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' } }, blocks), trBtn, sendBtn, info, sentBox));
}

// =====================================================================
// TICKER
// =====================================================================
export function tickerView(root) {
  const cur = store.ticker || {};
  const colors = ['FFD34D', 'FF3B30', '34C759', '0A84FF', 'BF5AF2', 'FF9F0A', 'FFFFFF', '64D2FF'];
  let color = (cur.color || 'FFD34D').replace('#', ''), hours = 24;
  const tx = {}; LANGS.forEach(l => { tx[l.code] = field(`متن · ${l.name}`, { value: cur['tx_' + l.code] || '', dir: l.dir }); });
  const preview = h('div', { class: 'ticker', style: { borderRadius: '12px', border: '1px solid var(--line)' } }, h('span'));
  const paintPreview = () => {
    const txt = ['fa', 'en', 'de', 'es'].map(k => val(tx[k]).trim()).find(Boolean) || 'پیش‌نمایش…';
    preview.firstChild.textContent = txt; preview.firstChild.style.color = '#' + color;
  };
  Object.values(tx).forEach(f => f.addEventListener('input', paintPreview)); paintPreview();
  const sw = h('div', { class: 'row', style: { gap: '12px', flexWrap: 'wrap' } });
  const paintSw = () => mount(sw, colors.map(c => h('button', { style: { width: '34px', height: '34px', borderRadius: '50%', background: '#' + c, border: c === color ? '3px solid #fff' : '3px solid transparent' },
    onclick: () => { color = c; paintSw(); paintPreview(); } }))); paintSw();
  const info = h('div', { class: 'ok small center', hidden: true });
  const trBtn = h('button', { class: 'btn ghost' }, '🌐 ترجمهٔ خودکار به زبان‌های خالی');
  trBtn.addEventListener('click', async () => {
    const order = ['fa', 'en', 'de', 'es']; const src = order.find(k => val(tx[k]).trim()); if (!src) return;
    trBtn.disabled = true;
    for (const target of order) { if (target === src || val(tx[target]).trim()) continue; const r = await machineTranslate(val(tx[src]).trim(), src, target); if (r) tx[target].value = r; }
    trBtn.disabled = false; paintPreview(); info.textContent = 'ترجمه شد ✓ بخوان و ذخیره کن'; info.hidden = false;
  });
  const row = () => ({ tx_fa: val(tx.fa).trim(), tx_de: val(tx.de).trim(), tx_en: val(tx.en).trim(), tx_es: val(tx.es).trim(), color,
    active: true, expires_at: hours > 0 ? new Date(Date.now() + hours * 3600000).toISOString() : null });
  const status = h('div', { class: 'small mute center' }, tickerLive(store.ticker) ? '🟢 الان نمایش داده می‌شود' : '⚪ الان خاموش است');
  root.append(page(bar('نوار متحرک', { back: '#/admin' }),
    h('p', { class: 'mute small' }, 'متنی که بالای اپ همهٔ کاربران در حال حرکت نشان داده می‌شود. هر کاربر متن را به زبان خودش می‌بیند. اگر زبانی را خالی بگذاری، انگلیسی یا فارسی نشان داده می‌شود.'),
    status, preview, LANGS.map(l => tx[l.code]), trBtn,
    h('div', { class: 'card stack' }, h('div', { class: 'bold' }, 'رنگ متن'), sw),
    h('div', { class: 'pick' }, h('span', { class: 'mute' }, 'مدت نمایش'),
      select([[1, '۱ ساعت'], [6, '۶ ساعت'], [24, '۲۴ ساعت'], [168, '۷ روز'], [0, 'بدون محدودیت']].map(([v, l]) => ({ value: v, label: l })), 24, v => hours = Number(v))),
    info,
    h('button', { class: 'btn primary', onclick: async () => {
      const r = row(); if (!['tx_fa', 'tx_de', 'tx_en', 'tx_es'].some(k => r[k])) return;
      if (await store.saveTicker(r)) { toast('ذخیره شد ✓', true); status.textContent = '🟢 الان نمایش داده می‌شود'; }
    } }, 'ذخیره و نمایش'),
    h('button', { class: 'btn ghost', onclick: async () => {
      const r = { ...row(), active: false }; if (await store.saveTicker(r)) { toast('خاموش شد', true); status.textContent = '⚪ الان خاموش است'; }
    } }, 'خاموش کردن نوار')));
}

// =====================================================================
// ACCOUNT EVENTS (who changed name / e-mail / password, help requests)
// =====================================================================
export function eventsView(root) {
  let events = [], onlyOpen = true, loading = true;
  const host = h('div', { class: 'stack' }, spinner());
  const kinds = {
    name_changed: ['نام تغییر کرد', '🪪'], email_changed: ['ایمیل تغییر کرد', '✉️'], password_changed: ['رمز عبور تغییر کرد', '🔑'],
    reset_requested: ['درخواست کد بازیابی رمز', '🔄'], help_request: ['کاربر ایمیل یا نام را فراموش کرده', '❓'],
  };
  async function load() { events = await store.loadAccountEvents(); loading = false; paint(); }
  function paint() {
    const shown = onlyOpen ? events.filter(e => !e.resolved) : events;
    mount(host, loading ? spinner() : shown.length ? shown.map(e => {
      const k = kinds[e.kind] || [e.kind, '•'];
      return h('div', { class: 'card stack', style: { gap: '4px', opacity: e.resolved ? .55 : 1 } },
        h('div', { class: 'row between' }, h('b', null, `${k[1]} ${k[0]}`), h('span', { class: 'tiny mute' }, formatDate(e.created_at))),
        e.user_name ? h('div', { class: 'small' }, 'نام: ' + e.user_name) : null,
        e.user_email ? h('div', { class: 'small', style: { direction: 'ltr', textAlign: 'start' } }, 'ایمیل: ' + e.user_email) : null,
        e.phone ? h('div', { class: 'small', style: { direction: 'ltr', textAlign: 'start' } }, 'تلفن: ' + e.phone) : null,
        e.detail ? h('div', { class: 'small mute' }, e.detail) : null,
        h('div', { class: 'row between' },
          h('button', { class: 'link-btn', style: { color: e.resolved ? 'var(--mute)' : 'var(--ok)', fontWeight: 700 }, onclick: async () => { try { await api.patch('account_events?id=eq.' + e.id, { resolved: !e.resolved }); } catch (x) {} load(); } }, e.resolved ? 'باز کردن دوباره' : 'حل شد ✓'),
          h('button', { class: 'link-btn red', onclick: async () => { try { await api.delete('account_events?id=eq.' + e.id); } catch (x) {} load(); } }, 'حذف')));
    }) : h('div', { class: 'empty' }, 'موردی نیست.'));
  }
  root.append(page(bar('تغییرات حساب', { back: '#/admin' }),
    h('label', { class: 'switch small' }, h('span', null, 'فقط موارد باز'), h('input', { type: 'checkbox', checked: true, onchange: e => { onlyOpen = e.target.checked; paint(); } })), host));
  load();
}
