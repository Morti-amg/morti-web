import { T, LEARN, LEVELS, topicName, label, lang, COUNTRIES, NATIVE_LANGS, LANGS } from './i18n.js';
import { api } from './api.js';
import { store, on, wordShown, msgTitle, msgBody, UserError } from './store.js';
import { study, GRADES } from './study.js';
import { h, clear, mount, field, val, select, modal, toast, confirmBox, spinner, Speech, haptic, getMedia, formatDate,
  ACCENTS, currentAccent, setAccent, languageSelect, logo } from './ui.js';
import { chatPanel } from './chat.js';
import { privacyModal } from './views-auth.js';

// =====================================================================
// small shared pieces
// =====================================================================
const stat = (v, l, gold) => h('div', { class: 'card stat' + (gold ? ' gold' : '') }, h('b', null, String(v)), h('span', null, l));

function topbar(title, { back = false, right = null } = {}) {
  return h('div', { class: 'topbar' },
    back ? h('button', { class: 'back', onclick: () => history.length > 1 ? history.back() : (location.hash = '#/home') }, '‹') : null,
    h('h1', null, title), right);
}

export function levelBar() {
  return h('div', { class: 'stack', style: { gap: '8px' } },
    h('div', { class: 'row' },
      h('div', { class: 'lvl' }, String(study.level)),
      h('div', { class: 'grow' }, h('div', { class: 'bold' }, T('xp_level', study.level)), h('div', { class: 'mute small' }, T('xp_to_next', study.xpToNext))),
      h('div', { class: 'gold bold' }, '⚡ ' + study.xp)),
    h('div', { class: 'bar' }, h('i', { style: { width: Math.max(3, study.levelFraction * 100) + '%' } })));
}

function ring(done, goal) {
  const p = goal <= 0 ? 0 : Math.min(100, (done / goal) * 100);
  return h('div', { class: 'ring', style: { '--p': p } }, h('span', null, `${Math.min(done, 99)}/${goal}`));
}

function confetti() {
  const colors = ['#ffd34d', '#e5251b', '#2f7bff', '#22b35a', '#9b5cf6'];
  const box = h('div', { class: 'confetti' });
  for (let i = 0; i < 40; i++) {
    box.append(h('i', { style: { left: Math.random() * 100 + '%', background: colors[i % 5], animationDelay: Math.random() * 0.6 + 's', transform: `rotate(${Math.random() * 90}deg)` } }));
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 3500);
}
function floatXP(n) {
  const el = h('div', { class: 'floatxp' }, T('xp_gain', n));
  document.body.append(el); setTimeout(() => el.remove(), 1000);
}

/** Round buttons: listen (voice of the device), audio (recorded by the admin), video. */
function mediaBar(word) {
  const bar = h('div', { class: 'row', style: { gap: '22px', alignItems: 'flex-start', justifyContent: 'center' } });
  const speakBtn = h('button', { class: 'mbtn', type: 'button', onclick: e => {
    e.stopPropagation(); haptic(); Speech.speak(word.text, LEARN[word.language].speech);
    speakBtn.classList.add('on'); setTimeout(() => speakBtn.classList.remove('on'), 1600);
  } }, h('i', null, '🔊'), T('btn_listen'));
  bar.append(speakBtn);
  if (word.audio_path) {
    let audio = null;
    const ic = h('i', null, '▶');
    const b = h('button', { class: 'mbtn', type: 'button', onclick: async e => {
      e.stopPropagation();
      if (audio && !audio.paused) { audio.pause(); ic.textContent = '▶'; b.classList.remove('on'); return; }
      try {
        ic.textContent = '…';
        if (!audio) { audio = new Audio(await getMedia(api, 'media', word.audio_path)); audio.onended = () => { ic.textContent = '▶'; b.classList.remove('on'); }; }
        await audio.play(); ic.textContent = '⏸'; b.classList.add('on');
      } catch (x) { ic.textContent = '▶'; toast(T('media_fail')); }
    } }, ic, T('btn_audio'));
    bar.append(b);
  }
  if (word.video_path) {
    bar.append(h('button', { class: 'mbtn', type: 'button', onclick: async e => {
      e.stopPropagation();
      modal(async body => {
        const holder = h('div', { class: 'center' }, spinner()); body.append(holder);
        try { holder.replaceChildren(h('video', { src: await getMedia(api, 'media', word.video_path), controls: true, autoplay: true, playsinline: true, style: { width: '100%', borderRadius: '14px', maxHeight: '70vh' } })); }
        catch (x) { holder.replaceChildren(h('div', { class: 'err' }, T('media_fail'))); }
      }, { title: T('btn_video') });
    } }, h('i', null, '🎬'), T('btn_video')));
  }
  return bar;
}

// =====================================================================
// HOME
// =====================================================================
export function homeView(root, params, ctx) {
  const me = store.current;
  const first = (me.full_name || '').split(' ')[0];
  const learnLang = me.learning || 'de';
  const pool = store.words.filter(w => w.language === learnLang);
  const due = study.dueWords(pool).length;
  const streak = Math.max(me.streak || 0, 0);

  const cards = Object.keys(LEARN).map((code, i) => {
    const p = store.progress(code);
    return h('a', { class: 'glass link appear', href: '#/lesson/' + code, style: { animationDelay: (0.12 + i * 0.05) + 's' } },
      h('div', { class: 'row between' },
        h('div', { class: 'row' }, h('span', { style: { fontSize: '26px' } }, LEARN[code].flag), h('span', { class: 'big' }, LEARN[code].title)),
        h('span', { class: 'mute' }, T('lang_' + code))),
      h('div', { class: 'bar', style: { margin: '12px 0 6px' } }, h('i', { style: { width: Math.max(2, p * 100) + '%' } })),
      h('div', { class: 'mute small' }, Math.round(p * 100) + (lang === 'fa' ? '٪' : '%')));
  });

  root.append(h('div', { class: 'page stack' },
    h('div', { class: 'row between' }, logo(true), h('span', { class: 'pill' }, '⭐ ' + (me.points || 0))),
    h('h2', null, T('hello', first)),
    streak > 0 ? h('div', { class: 'gold' }, '🔥 ' + T('streak_days', streak)) : null,
    h('div', { class: 'glass appear row' },
      ring(study.todayCount, study.goal),
      h('div', { class: 'grow' }, h('div', { class: 'bold' }, T('daily_goal')),
        study.todayCount >= study.goal ? h('div', { class: 'gold small' }, T('goal_done')) : null),
      h('a', { href: '#/leaderboard', class: 'gold bold small', style: { textDecoration: 'none' } }, '🏆 ' + T('leaderboard'))),
    h('div', { class: 'glass appear', style: { animationDelay: '.05s' } }, levelBar()),
    h('a', { class: 'glass link appear row', href: '#/review', style: { animationDelay: '.1s' } },
      h('span', { style: { fontSize: '30px' } }, '🧠'),
      h('div', { class: 'grow' }, h('div', { class: 'bold' }, T('home_review_card')), h('div', { class: 'mute small' }, T('rv_due', due))),
      h('span', { class: 'mute' }, lang === 'fa' ? '‹' : '›')),
    h('a', { class: 'glass link appear row', href: '#/grammar/' + learnLang },
      h('span', { style: { fontSize: '30px' } }, '📘'),
      h('div', { class: 'grow' }, h('div', { class: 'bold' }, ({ fa: 'گرامر', de: 'Grammatik', en: 'Grammar', es: 'Gramática', fr: 'Grammaire', it: 'Grammatica', tr: 'Dilbilgisi', sv: 'Grammatik' })[lang] || 'Grammar'), h('div', { class: 'mute small' }, LEARN[learnLang].flag + ' ' + LEARN[learnLang].title)),
      h('span', { class: 'mute' }, lang === 'fa' ? '‹' : '›')),
    cards,
    h('button', { class: 'btn primary', onclick: wordOfDayModal }, T('word_of_day'))));
}

function wordOfDayModal() {
  modal(body => {
    const lng = store.current?.learning || 'de';
    const w = store.wordOfDay(lng);
    if (!w) { body.append(h('p', { class: 'mute center' }, T('no_words'))); return; }
    body.append(
      h('div', { class: 'center mute' }, T('word_of_day')),
      h('div', { class: 'word-big center' }, w.text),
      h('div', { class: 'word-tr center', style: { fontSize: '22px' } }, wordShown(w)),
      w.example ? h('div', { class: 'mute center' }, w.example) : null,
      mediaBar(w));
  }, { title: LEARN[store.current?.learning || 'de'].flag + ' ' + T('word_of_day') });
}

// =====================================================================
// LESSONS
// =====================================================================
export function lessonView(root, params) {
  const language = LEARN[params[0]] ? params[0] : 'de';
  let mode = 0, levelFilter = null, topicFilter = null, favOnly = false;
  const all = () => store.words.filter(w => w.language === language);
  const topics = () => [...new Set(all().map(w => w.topic).filter(Boolean))].sort();
  const pool = () => all().filter(w => (!levelFilter || w.level === levelFilter) && (!topicFilter || w.topic === topicFilter) && (!favOnly || study.isFavorite(w)));

  const head = h('div', { class: 'stack', style: { gap: '10px' } });
  const body = h('div', { class: 'stack' });
  root.append(h('div', { class: 'page stack' }, topbar(`${LEARN[language].flag} ${LEARN[language].title}`, { back: true }), head, body));

  const chip = (text, on, fn) => h('button', { class: 'chip' + (on ? ' on' : ''), type: 'button', onclick: fn }, text);
  const modes = [T('flashcards'), T('quiz'), T('listening'), T('pr_practice')];
  let cleanup = null;

  function drawHead() {
    mount(head,
      h('div', { class: 'seg' }, modes.map((m, i) => h('button', { class: i === mode ? 'on' : '', onclick: () => { mode = i; drawAll(); } }, m))),
      h('div', { class: 'chips' }, chip(T('all'), !levelFilter, () => { levelFilter = null; drawAll(); }),
        LEVELS.map(l => chip(l, levelFilter === l, () => { levelFilter = l; drawAll(); }))),
      topics().length ? h('div', { class: 'chips' }, chip('★ ' + T('favorites'), favOnly, () => { favOnly = !favOnly; drawAll(); }),
        chip(T('all'), !topicFilter, () => { topicFilter = null; drawAll(); }),
        topics().map(t => chip(topicName(t), topicFilter === t, () => { topicFilter = t; drawAll(); }))) : null);
  }
  function drawBody() {
    if (cleanup) { cleanup(); cleanup = null; }
    const p = pool();
    clear(body);
    if (!p.length) { body.append(h('div', { class: 'empty' }, T('no_words_section'))); return; }
    body.append(h('div', { class: 'mute small center' }, T('review_due', study.dueCount(p))));
    const host = h('div', { class: 'stack' }); body.append(host);
    if (mode === 0) flashcards(host, p);
    else if (mode === 3) cleanup = pronunciation(host, study.ordered(p));
    else quiz(host, p, mode === 2);
  }
  function drawAll() { drawHead(); drawBody(); }
  drawAll();
  return () => { if (cleanup) cleanup(); window.speechSynthesis && window.speechSynthesis.cancel(); };
}

function flashcards(host, words) {
  let deck = study.ordered(words), index = 0, flipped = false;
  function draw() {
    const w = deck[index % deck.length];
    const flip = h('div', { class: 'flip' + (flipped ? ' on' : '') },
      h('div', { class: 'flip-in glass', style: { padding: 0 } },
        h('div', { class: 'face' },
          h('div', { class: 'word-big' }, w.text), mediaBar(w),
          h('div', { class: 'mute small' }, T('card_hint_front'))),
        h('div', { class: 'face back' },
          h('div', { class: 'mute' }, w.text),
          h('div', { class: 'label-red' }, T('translation_label').toUpperCase()),
          h('div', { class: 'word-tr' }, wordShown(w)),
          w.example ? [h('div', { class: 'label-red' }, T('example_label')), h('div', { class: 'mute' }, w.example)] : null,
          h('div', { class: 'mute small' }, T('card_hint_back')))));
    flip.addEventListener('click', () => { haptic(); flipped = !flipped; flip.classList.toggle('on', flipped); });
    const star = h('button', { class: 'link-btn', style: { fontSize: '22px', color: 'var(--gold)' }, onclick: () => { study.toggleFavorite(w); star.textContent = study.isFavorite(w) ? '★' : '☆'; haptic(); } }, study.isFavorite(w) ? '★' : '☆');
    mount(host,
      h('div', { class: 'row between' }, h('span', { class: 'mute small' }, `${index % deck.length + 1} / ${deck.length}`),
        w.topic ? h('span', { class: 'mute small' }, topicName(w.topic)) : null, star),
      flip,
      h('div', { class: 'row gap' },
        h('button', { class: 'btn ghost', onclick: () => next(w, false) }, T('not_yet')),
        h('button', { class: 'btn primary', onclick: () => next(w, true) }, T('knew_it'))));
  }
  function next(w, known) {
    study.record(w, known);
    if (known) { store.award(5, w); haptic(20); }
    flipped = false; index++; draw();
  }
  draw();
}

function quiz(host, words, listening) {
  if (words.length < 2) { host.append(h('div', { class: 'empty' }, T('need_two'))); return; }
  let score = 0;
  function newQ() {
    const q = words[Math.floor(Math.random() * words.length)];
    const others = words.filter(w => w.id !== q.id && wordShown(w) !== wordShown(q)).sort(() => Math.random() - 0.5).slice(0, 3);
    const opts = [...others, q].sort(() => Math.random() - 0.5);
    let picked = null;
    const next = h('button', { class: 'btn primary', hidden: true, onclick: newQ }, T('next'));
    const reveal = h('div', { class: 'big center', hidden: true }, q.text);
    const buttons = opts.map(o => h('button', { class: 'opt', onclick: () => {
      if (picked) return; picked = o.id;
      const correct = o.id === q.id;
      study.record(q, correct);
      if (correct) { score++; store.award(10, q); haptic(25); }
      buttons.forEach((b, i) => { if (opts[i].id === q.id) b.classList.add('right'); else if (opts[i].id === o.id) b.classList.add('wrong'); });
      next.hidden = false; reveal.hidden = false; scoreEl.textContent = T('quiz_score', score);
    } }, wordShown(o)));
    const scoreEl = h('div', { class: 'mute small center' }, T('quiz_score', score));
    mount(host, scoreEl,
      h('div', { class: 'glass center stack', style: { minHeight: '120px', justifyContent: 'center', alignItems: 'center' } },
        listening ? [h('div', { class: 'mute small' }, T('listen_pick')),
          h('button', { class: 'mbtn', onclick: () => Speech.speak(q.text, LEARN[q.language].speech) }, h('i', null, '🔊')), reveal]
          : h('div', { class: 'word-big' }, q.text)),
      buttons, next);
    if (listening) Speech.speak(q.text, LEARN[q.language].speech);
  }
  newQ();
}

// ---------- pronunciation (Web Speech API) ----------
function normalizeText(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}
export function similarity(a, b) {
  const x = [...normalizeText(a)], y = [...normalizeText(b)];
  if (!x.length || !y.length) return 0;
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    prev = cur;
  }
  return Math.max(0, Math.min(100, Math.round((1 - prev[y.length] / Math.max(x.length, y.length)) * 100)));
}

function pronunciation(host, words) {
  let index = 0, rec = null, timer = null;
  function stop() { clearTimeout(timer); if (rec) { try { rec.abort(); } catch (e) {} rec = null; } }
  function draw(state = { phase: 'idle' }) {
    const w = words[index % words.length];
    const mic = h('button', { class: 'micbtn' + (state.phase === 'listening' ? ' rec' : ''), onclick: () => toggle(w) }, state.phase === 'listening' ? '⏹' : '🎤');
    let result;
    if (!Speech.canRecognize) result = h('div', { class: 'err small' }, T('pr_unavail'));
    else if (state.phase === 'idle') result = h('div', { class: 'mute small center' }, T('pr_hold'));
    else if (state.phase === 'listening') result = h('div', { class: 'center' }, h('div', { class: 'mute small' }, T('pr_listening')), h('div', { class: 'bold' }, state.heard || ''));
    else if (state.phase === 'done') {
      const sc = state.score, color = sc >= 85 ? 'var(--ok)' : sc >= 60 ? 'var(--gold)' : 'var(--accent)';
      result = h('div', { class: 'stack center', style: { gap: '8px' } },
        h('div', { class: 'score', style: { '--p': sc, '--sc': color } }, h('span', null, String(sc))),
        h('div', { class: 'mute small' }, T('pr_heard') + ' ' + (state.heard || '—')),
        h('div', { class: 'bold' }, sc >= 85 ? T('pr_great') : sc >= 60 ? T('pr_ok') : T('pr_retry')));
    } else result = h('div', { class: 'err small' }, state.phase === 'denied' ? T('pr_denied') : T('pr_unavail'));
    mount(host,
      h('div', { class: 'mute small center' }, `${index % words.length + 1} / ${words.length}`),
      h('div', { class: 'glass center stack', style: { alignItems: 'center', minHeight: '190px', justifyContent: 'center' } },
        h('div', { class: 'word-big' }, w.text), h('div', { class: 'gold' }, wordShown(w)),
        h('div', { class: 'row', style: { gap: '10px' } },
          h('button', { class: 'btn small ghost', onclick: () => Speech.speak(w.text, LEARN[w.language].speech) }, '🔊 ' + T('pr_normal')),
          h('button', { class: 'btn small ghost', onclick: () => Speech.speak(w.text, LEARN[w.language].speech, true) }, '🐢 ' + T('pr_slow')))),
      result, mic,
      state.phase === 'done' ? h('button', { class: 'btn primary', onclick: () => { stop(); index++; draw(); } }, T('pr_next')) : null);
  }
  function toggle(w) {
    if (rec) { rec.stop(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return draw({ phase: 'unavailable' });
    window.speechSynthesis && window.speechSynthesis.cancel();
    rec = new SR(); rec.lang = LEARN[w.language].speech; rec.interimResults = true; rec.maxAlternatives = 1;
    let heard = '';
    rec.onresult = e => { heard = [...e.results].map(r => r[0].transcript).join(' '); draw({ phase: 'listening', heard }); };
    rec.onerror = e => { rec = null; clearTimeout(timer); draw({ phase: e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : (heard ? 'done' : 'idle'), heard, score: similarity(heard, w.text) }); };
    rec.onend = () => {
      if (!rec) return; rec = null; clearTimeout(timer);
      const score = similarity(heard, w.text);
      study.notePronunciation(score);
      if (score >= 85) { store.award(8, w); haptic(30); }
      draw({ phase: 'done', heard, score });
    };
    try { rec.start(); draw({ phase: 'listening', heard: '' }); timer = setTimeout(() => { if (rec) rec.stop(); }, 7000); }
    catch (e) { rec = null; draw({ phase: 'unavailable' }); }
  }
  draw();
  return stop;
}

// =====================================================================
// SMART REVIEW
// =====================================================================
export function reviewView(root) {
  let language = store.current?.learning || 'de';
  const wrap = h('div', { class: 'page stack' });
  root.append(wrap);
  const pool = () => store.words.filter(w => w.language === language);

  function intro() {
    const dueNow = study.dueWords(pool(), 500, 500).length;
    mount(wrap, topbar(T('rv_title'), { back: true }),
      h('div', { class: 'center', style: { fontSize: '60px' } }, '🧠'),
      h('div', { class: 'seg' }, Object.keys(LEARN).map(c => h('button', { class: c === language ? 'on' : '', onclick: () => { language = c; intro(); } }, LEARN[c].flag + ' ' + LEARN[c].title))),
      h('div', { class: 'mute center' }, dueNow === 0 ? T('rv_nothing') : T('rv_due', Math.min(dueNow, 20))),
      h('div', { class: 'glass' }, levelBar()),
      h('button', { class: 'btn primary', disabled: dueNow === 0, onclick: begin }, T('rv_start')));
  }

  function begin() {
    const queue = study.dueWords(pool(), 20, 8);
    if (!queue.length) return intro();
    runSession(queue);
  }

  function runSession(queue) {
    const total = queue.length; let done = 0, sessionXP = 0, flipped = false;
    function draw() {
      if (!queue.length) return summary();
      const w = queue[0];
      const flip = h('div', { class: 'flip' + (flipped ? ' on' : '') },
        h('div', { class: 'flip-in glass', style: { padding: 0 } },
          h('div', { class: 'face' }, h('div', { class: 'word-big' }, w.text),
            h('div', { class: 'row', style: { gap: '14px' } },
              h('button', { class: 'mbtn', onclick: e => { e.stopPropagation(); Speech.speak(w.text, LEARN[w.language].speech); } }, h('i', null, '🔊')),
              h('button', { class: 'mbtn', onclick: e => { e.stopPropagation(); Speech.speak(w.text, LEARN[w.language].speech, true); } }, h('i', null, '🐢')))),
          h('div', { class: 'face back' }, h('div', { class: 'mute' }, w.text), h('div', { class: 'word-tr' }, wordShown(w)),
            w.example ? h('div', { class: 'mute' }, w.example) : null)));
      flip.addEventListener('click', () => { haptic(); flipped = !flipped; draw(); });
      mount(wrap, topbar(T('rv_title'), { back: true }),
        h('div', { class: 'mute small center' }, T('rv_session', Math.min(done + 1, total), total)),
        h('div', { class: 'bar' }, h('i', { style: { width: (total ? done / total * 100 : 0) + '%' } })),
        flip,
        flipped ? h('div', { class: 'grades' }, GRADES.map(g => h('button', { class: 'g-' + g, onclick: () => answer(w, g) }, T('rv_' + g))))
          : h('button', { class: 'btn ghost', onclick: () => { flipped = true; draw(); } }, T('rv_show')));
    }
    function answer(w, g) {
      const gained = study.grade(w, g);
      sessionXP += gained;
      if (g !== 'again') { store.award(5, w); haptic(20); } else haptic(40);
      floatXP(gained);
      queue.shift();
      if (g === 'again') queue.push(w); else done++;
      flipped = false;
      draw();
    }
    function summary() {
      confetti(); haptic(60);
      mount(wrap, topbar(T('rv_title'), { back: true }),
        h('div', { class: 'center', style: { fontSize: '70px', marginTop: '20px' } }, '🏅'),
        h('h2', { class: 'center' }, T('rv_done')),
        h('div', { class: 'mute center' }, T('rv_summary', total, sessionXP)),
        h('div', { class: 'glass' }, levelBar()),
        h('a', { class: 'btn primary', href: '#/home', style: { textDecoration: 'none' } }, T('close')));
    }
    draw();
  }
  intro();
}

// =====================================================================
// LEADERBOARD / INBOX
// =====================================================================
export function leaderboardView(root) {
  const list = h('div', { class: 'stack', style: { gap: '10px' } }, spinner());
  root.append(h('div', { class: 'page stack' }, topbar(T('leaderboard'), { back: true }), list));
  (async () => {
    let rows = [];
    try { rows = await api.rpc('get_leaderboard'); } catch (e) {}
    if (!rows.length) { mount(list, h('div', { class: 'empty' }, T('no_leaders'))); return; }
    const medal = i => ['🥇', '🥈', '🥉'][i] || String(i + 1);
    mount(list, rows.map((r, i) => h('div', { class: 'card row', style: r.is_me ? { borderColor: 'var(--accent)', borderWidth: '2px' } : null },
      h('div', { style: { width: '34px', textAlign: 'center', fontWeight: 700 } }, medal(i)),
      h('div', { class: 'grow bold' }, r.is_me ? `${r.name} (${T('you')})` : r.name),
      h('div', { class: 'gold bold' }, '⭐ ' + r.points))));
  })();
}

export function inboxView(root) {
  const items = store.inbox(store.currentID);
  root.append(h('div', { class: 'page stack' }, topbar(T('tab_messages')),
    items.length ? items.map(m => h('div', { class: 'card stack', style: { gap: '6px' } },
      h('div', { class: 'bold' }, msgTitle(m)), h('div', { class: 'mute', style: { whiteSpace: 'pre-wrap' } }, msgBody(m)),
      h('div', { class: 'tiny mute' }, formatDate(m.created_at)))) : h('div', { class: 'empty' }, T('no_messages'))));
}

// =====================================================================
// CHAT (user side)
// =====================================================================
export function userChatView(root) {
  const status = h('span', { class: 'small mute row', style: { gap: '6px' } });
  const paint = () => mount(status, h('span', { class: 'dot' + (store.adminOnline ? ' on' : '') }), store.adminOnline ? T('online') : T('offline'));
  paint();
  const host = h('div');
  root.append(h('div', { class: 'page stack' },
    h('div', { class: 'topbar' }, h('h1', null, T('chat_title') + ' · ' + T('admin_label')), status), host));
  const stopChat = chatPanel(host, store.currentID, false);
  const off = on('presence', paint);
  store.refreshAdminOnline();
  return () => { stopChat(); off(); };
}

// =====================================================================
// PROFILE
// =====================================================================
const BADGES = (a, d) => [
  ['badge_first', '✨', a.learned_ids.length >= 1], ['badge_10', '📖', a.learned_ids.length >= 10], ['badge_100', '📚', a.learned_ids.length >= 100],
  ['badge_streak3', '🔥', a.streak >= 3], ['badge_streak7', '🌟', a.streak >= 7], ['badge_500', '⭐', a.points >= 500],
  ['badge_xp100', '⚡', d.xp >= 100], ['badge_xp1000', '🚀', d.xp >= 1000], ['badge_rev50', '🔄', d.reviews >= 50],
  ['badge_streak30', '🏅', a.streak >= 30], ['badge_pron', '🎙️', d.pronPerfect >= 5], ['badge_tutor', '🤖', d.tutorMessages >= 10],
];

export function profileView(root) {
  const a = store.current;
  const pick = (title, options, value, set) => h('div', { class: 'pick' }, h('span', { class: 'mute' }, title), select(options, value, set));
  const info = (k, v) => h('div', { class: 'kv' }, h('span', null, k), h('span', null, v));

  root.append(h('div', { class: 'page stack' },
    h('div', { class: 'glass center stack', style: { gap: '4px' } },
      h('div', { class: 'big' }, a.full_name), h('div', { class: 'mute' }, a.email), h('div', null, h('span', { class: 'pill' }, '⭐ ' + a.points))),
    h('div', { class: 'grid2' }, stat(a.streak, T('stat_streak')), stat(a.learned_ids.length, T('stat_learned'))),
    h('div', { class: 'glass' }, levelBar()),
    h('div', { class: 'grid3' }, stat(study.bestStreak, T('xp_best_streak')), stat(study.data.reviews, T('xp_reviews')), stat(study.data.activeDays.length, T('xp_days'))),
    pick(T('goal_setting'), [5, 10, 20, 30].map(n => ({ value: n, label: String(n) })), study.goal, v => study.setGoal(Number(v))),
    h('div', { class: 'card stack' }, h('div', { class: 'bold' }, T('badges')),
      h('div', { class: 'badges' }, BADGES(a, study.data).map(([k, e, on]) => h('div', { class: 'bdg' + (on ? ' on' : '') }, h('div', { class: 'e' }, e), T(k))))),
    h('label', { class: 'switch small' }, h('span', null, T('hide_board')),
      h('input', { type: 'checkbox', checked: a.hide_on_leaderboard, onchange: e => store.setHideOnLeaderboard(e.target.checked) })),
    pick(T('learning_lang'), Object.entries(LEARN).map(([k, v]) => ({ value: k, label: v.flag + ' ' + v.title })), a.learning, v => store.updateCurrent(x => { x.learning = v; })),
    pick(T('level'), LEVELS.map(l => ({ value: l, label: l })), a.level, v => store.updateCurrent(x => { x.level = v; })),
    h('div', { class: 'card' }, info(T('country'), label(a.country)), info(T('native_lang'), label(a.native_language)), info(T('phone'), a.phone), info(T('joined'), formatDate(a.joined_at, false))),
    h('div', { class: 'card row between' }, h('span', { class: 'mute' }, T('app_language')), languageSelect()),
    h('div', { class: 'card stack' }, h('span', { class: 'mute' }, T('app_color')),
      h('div', { class: 'row', style: { gap: '14px', flexWrap: 'wrap' } }, Object.entries(ACCENTS).map(([k, [c]]) => h('button', {
        'aria-label': k, style: { width: '36px', height: '36px', borderRadius: '50%', border: k === currentAccent() ? '3px solid #fff' : '3px solid transparent', background: c },
        onclick: () => { setAccent(k); window.dispatchEvent(new Event('morti:rerender')); } })))),
    h('button', { class: 'btn ghost', onclick: editAccountModal }, T('acc_title')),
    h('button', { class: 'btn ghost', onclick: changePasswordModal }, T('fp_change')),
    h('button', { class: 'link-btn', onclick: privacyModal }, '🔒 ' + T('priv_link')),
    h('button', { class: 'btn ghost', onclick: () => store.logout() }, T('logout')),
    h('button', { class: 'link-btn red', onclick: async () => {
      if (await confirmBox(T('delete_confirm'), T('delete_account')) && await confirmBox(T('delete_final'), T('delete_account'))) store.deleteAccount(a.id);
    } }, T('delete_account'))));
}

function errText(e) { return e instanceof UserError ? e.message : T('err_network'); }

function changePasswordModal() {
  modal((body, close) => {
    const pw = field(T('fp_new'), { type: 'password', dir: 'ltr', autocomplete: 'new-password' });
    const pw2 = field(T('fp_repeat'), { type: 'password', dir: 'ltr', autocomplete: 'new-password' });
    const err = h('div', { class: 'err', hidden: true }), ok = h('div', { class: 'okmsg', hidden: true }, '✓ ' + T('fp_done'));
    const btn = h('button', { class: 'btn primary', onclick: async () => {
      err.hidden = true;
      try { await store.changePassword(val(pw), val(pw2)); ok.hidden = false; btn.hidden = true; setTimeout(close, 1400); }
      catch (e) { err.textContent = errText(e); err.hidden = false; }
    } }, T('fp_save'));
    body.append(pw, pw2, err, ok, btn);
  }, { title: T('fp_change') });
}

function editAccountModal() {
  modal(body => {
    const a = store.current;
    const name = field(T('acc_name'), { value: a.full_name, caps: 'words' });
    const nameOk = h('div', { class: 'okmsg', hidden: true }, '✓ ' + T('acc_name_done'));
    const err = h('div', { class: 'err', hidden: true });
    let codeSent = false;
    const newEmail = field(T('acc_new_email'), { type: 'email', dir: 'ltr', inputmode: 'email' });
    const code = field(T('fp_code'), { inputmode: 'numeric', dir: 'ltr' });
    const codeBox = h('div', { class: 'stack', hidden: true }, h('div', { class: 'gold small center' }, T('fp_sent')), code);
    const emailOk = h('div', { class: 'okmsg', hidden: true }, '✓ ' + T('acc_email_done'));
    const emailBtn = h('button', { class: 'btn primary' }, T('acc_email_send'));
    emailBtn.addEventListener('click', async () => {
      err.hidden = true;
      try {
        if (!codeSent) { await store.requestEmailChange(val(newEmail)); codeSent = true; codeBox.hidden = false; newEmail.disabled = true; emailBtn.textContent = T('acc_email_confirm'); }
        else { await store.confirmEmailChange(val(newEmail), val(code)); emailOk.hidden = false; emailBtn.hidden = true; codeBox.hidden = true; }
      } catch (e) { err.textContent = errText(e); err.hidden = false; }
    });
    body.append(h('p', { class: 'mute small center' }, T('acc_admin_note')),
      h('div', { class: 'card stack' }, name,
        h('button', { class: 'btn primary', onclick: async () => {
          err.hidden = true; nameOk.hidden = true;
          try { await store.updateMyName(val(name)); nameOk.hidden = false; haptic(20); } catch (e) { err.textContent = errText(e); err.hidden = false; }
        } }, T('acc_save_name')), nameOk),
      h('div', { class: 'card stack' }, h('div', { class: 'bold' }, T('acc_email_section')), h('div', { class: 'mute small' }, a.email),
        newEmail, codeBox, emailBtn, emailOk),
      err);
  }, { title: T('acc_title') });
}
