import { api } from './api.js';
import { store, on, uuid } from './store.js';
import { T } from './i18n.js';
import { h, clear, getMedia, toast, formatDate, haptic, confirmBox } from './ui.js';
import { dayString } from './study.js';

/** Voice recorder (MediaRecorder). Safari/iPhone gives audio/mp4, which the iPhone app can play too. */
class Recorder {
  constructor() { this.rec = null; this.chunks = []; this.start0 = 0; this.stream = null; }
  static get supported() { return !!(navigator.mediaDevices && window.MediaRecorder); }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const types = ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/webm'];
    const type = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
    this.mime = type || 'audio/webm';
    this.rec = new MediaRecorder(this.stream, type ? { mimeType: type } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.rec.start();
    this.start0 = Date.now();
  }
  get seconds() { return Math.round((Date.now() - this.start0) / 1000); }
  stop() {
    return new Promise(resolve => {
      const secs = this.seconds;
      this.rec.onstop = () => {
        this.stream.getTracks().forEach(t => t.stop());
        const mime = this.mime.split(';')[0];
        resolve({ blob: new Blob(this.chunks, { type: mime }), seconds: secs, mime });
      };
      this.rec.stop();
    });
  }
  cancel() { try { this.rec.onstop = null; this.rec.stop(); } catch (e) {} if (this.stream) this.stream.getTracks().forEach(t => t.stop()); }
}

function dayLabel(d) {
  const t = dayString(d), now = new Date(), y = new Date(); y.setDate(y.getDate() - 1);
  if (t === dayString(now)) return T('today');
  if (t === dayString(y)) return T('yesterday');
  return formatDate(d, false);
}
const pad = n => String(n).padStart(2, '0');

/**
 * One chat thread between the admin and one user.
 * root = element to fill; asAdmin = I am the admin; threadUser = the learner's id.
 */
export function chatPanel(root, threadUser, asAdmin, { fullHeight = false } = {}) {
  let messages = [];
  let sending = false;
  let recorder = null, recTimer = null;
  let openMenu = null;
  const otherIsAdmin = !asAdmin;

  const list = h('div', { class: 'msgs' });
  const input = h('textarea', { class: 'field', rows: '1', placeholder: T('msg_placeholder') });
  const sendBtn = h('button', { class: 'send', 'aria-label': 'send', onclick: send }, '➤');
  const micBtn = Recorder.supported ? h('button', { class: 'send alt', 'aria-label': 'voice', onclick: toggleRecord }, '🎤') : null;
  const recInfo = h('div', { class: 'small red center', hidden: true });
  const failed = h('div', { class: 'err small', hidden: true }, T('chat_failed'));
  const composer = h('div', { class: 'composer' }, input, micBtn, sendBtn);
  root.append(h('div', { class: 'chatwrap' + (fullHeight ? ' full' : '') }, list, failed, recInfo, composer));

  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 700) { e.preventDefault(); send(); } });

  function ticks(m) { return h('span', null, m.read ? '✓✓' : '✓'); }

  function voiceRow(m) {
    const playBtn = h('button', { type: 'button' }, '▶');
    let audio = null;
    playBtn.addEventListener('click', async e => {
      e.stopPropagation();
      if (audio && !audio.paused) { audio.pause(); playBtn.textContent = '▶'; return; }
      try {
        playBtn.textContent = '…';
        if (!audio) { audio = new Audio(await getMedia(api, 'voice', m.audio_path)); audio.onended = () => { playBtn.textContent = '▶'; }; }
        await audio.play(); playBtn.textContent = '⏸';
      } catch (err) { playBtn.textContent = '▶'; toast(T('media_fail')); }
    });
    const s = m.audio_seconds || 0;
    return h('div', { class: 'voice' }, playBtn, h('span', null, `${Math.floor(s / 60)}:${pad(s % 60)}`));
  }

  function bubble(m) {
    const mine = m.from_admin === asAdmin;
    const d = new Date(m.created_at);
    const actions = h('div', { class: 'row small', style: { gap: '14px', marginTop: '6px', justifyContent: 'flex-end' }, hidden: true },
      h('button', { class: 'link-btn', style: { padding: 0, color: 'inherit' }, onclick: async e => { e.stopPropagation(); try { await navigator.clipboard.writeText(m.body); toast('✓', true); } catch (x) {} } }, T('copy_msg')),
      mine ? h('button', { class: 'link-btn', style: { padding: 0, color: 'inherit' }, onclick: async e => {
        e.stopPropagation();
        if (await confirmBox(T('delete_msg') + '?', T('delete_msg'))) {
          const backup = messages; messages = messages.filter(x => x.id !== m.id); draw();
          try { await api.delete('chat_messages?id=eq.' + m.id); } catch (x) { messages = backup; draw(); failed.hidden = false; }
        }
      } }, T('delete_msg')) : null);
    const el = h('div', { class: 'bubble' + (mine ? ' me' : ''), onclick: () => {
      if (openMenu && openMenu !== actions) openMenu.hidden = true;
      actions.hidden = !actions.hidden; openMenu = actions.hidden ? null : actions;
    } },
      m.audio_path ? voiceRow(m) : h('div', null, m.body),
      h('div', { class: 'meta' }, `${pad(d.getHours())}:${pad(d.getMinutes())}`, mine ? ticks(m) : null), actions);
    return el;
  }

  function draw(scroll = true) {
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
    clear(list);
    if (!messages.length) list.append(h('div', { class: 'empty' }, T('chat_empty')));
    let lastDay = '';
    for (const m of messages) {
      const day = dayString(new Date(m.created_at));
      if (day !== lastDay) { list.append(h('div', { class: 'daysep' }, dayLabel(new Date(m.created_at)))); lastDay = day; }
      list.append(bubble(m));
    }
    if (scroll || nearBottom) list.scrollTop = list.scrollHeight;
  }

  async function load(first = false) {
    try {
      const rows = await api.fetch(`chat_messages?user_id=eq.${threadUser}&select=*&order=created_at.asc`);
      if (JSON.stringify(rows) !== JSON.stringify(messages)) { messages = rows; draw(first); }
      failed.hidden = true;
      markRead();
    } catch (e) { failed.hidden = false; }
  }
  async function markRead() {
    if (!messages.some(m => m.from_admin === otherIsAdmin && m.read !== true)) return;
    try {
      await api.patch(`chat_messages?user_id=eq.${threadUser}&from_admin=eq.${otherIsAdmin}&read=eq.false`, { read: true });
      messages.forEach(m => { if (m.from_admin === otherIsAdmin) m.read = true; });
      store.refreshChat();
    } catch (e) {}
  }

  async function send() {
    const t = input.value.trim();
    if (!t || sending) return;
    sending = true; input.value = ''; input.style.height = 'auto'; haptic();
    const m = { id: uuid(), user_id: threadUser, from_admin: asAdmin, body: t, created_at: new Date().toISOString(), read: false };
    messages.push(m); draw();
    try { await api.insert('chat_messages', [{ id: m.id, user_id: threadUser, from_admin: asAdmin, body: t }]); failed.hidden = true; }
    catch (e) { messages = messages.filter(x => x.id !== m.id); draw(); failed.hidden = false; }
    sending = false;
    load(true);
  }

  async function toggleRecord() {
    if (recorder) {   // stop and send
      clearInterval(recTimer);
      const r = recorder; recorder = null;
      micBtn.classList.remove('rec'); micBtn.textContent = '🎤'; recInfo.hidden = true;
      const { blob, seconds, mime } = await r.stop();
      if (seconds < 1) return;
      const id = uuid();
      const ext = mime.includes('mp4') ? 'm4a' : 'webm';
      const path = `${threadUser.toLowerCase()}/${id.toLowerCase()}.${ext}`;
      try {
        micBtn.disabled = true;
        await api.upload('voice', path, blob, mime);
        await api.insert('chat_messages', [{ id, user_id: threadUser, from_admin: asAdmin, body: '🎤', audio_path: path, audio_seconds: seconds }]);
        failed.hidden = true;
      } catch (e) { failed.hidden = false; }
      micBtn.disabled = false;
      load(true);
      return;
    }
    try {
      recorder = new Recorder(); await recorder.start();
      micBtn.classList.add('rec'); micBtn.textContent = '⏹'; recInfo.hidden = false;
      const tick = () => { const s = recorder ? recorder.seconds : 0; recInfo.textContent = `● ${Math.floor(s / 60)}:${pad(s % 60)}`; };
      tick(); recTimer = setInterval(tick, 500);
    } catch (e) { recorder = null; toast(T('mic_denied')); }
  }

  const off = on('chat', () => load(false));
  load(true);
  return () => { off(); clearInterval(recTimer); if (recorder) recorder.cancel(); };
}
