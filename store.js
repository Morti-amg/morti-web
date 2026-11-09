import { api, ApiError } from './api.js';
import { T, lang } from './i18n.js';
import { study, dayString } from './study.js';

const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
}));
export { uuid };

/** An error with a text that is already translated. */
export class UserError extends Error {}

function mapAuth(e) {
  if (!(e instanceof ApiError)) return new UserError(T('err_network'));
  if (e.status === 0) return new UserError(T('err_network'));
  const m = (e.message || '').toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid_credentials')) return new UserError(T('err_credentials'));
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user_already_exists')) return new UserError(T('err_taken'));
  if (m.includes('not confirmed')) return new UserError(T('err_confirm'));
  if (m.includes('password should be')) return new UserError(T('err_pw_short'));
  return new UserError(e.message || (T('err_generic') + ' (' + e.status + ')'));
}

const listeners = {};
export function on(topic, fn) { (listeners[topic] ||= new Set()).add(fn); return () => listeners[topic].delete(fn); }
export function emit(topic) { (listeners[topic] || []).forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }

let pushTimer = null;

export const store = {
  accounts: [], words: [], messages: [], chat: [], ticker: null,
  currentID: null, adminOnline: false, banner: null,

  get current() { return this.accounts.find(a => a.id === this.currentID) || null; },
  get learners() { return this.accounts.filter(a => !a.is_admin); },
  isOnline(a) { return Date.now() - new Date(a.last_active).getTime() < 90000; },
  get onlineLearners() {
    return this.learners.filter(a => this.isOnline(a)).sort((a, b) => new Date(b.last_active) - new Date(a.last_active));
  },

  report(e) {
    const text = e instanceof ApiError ? (e.status === 0 ? T('err_network') : (e.message || T('err_server'))) : (e.message || T('err_network'));
    this.banner = text; emit('banner');
    setTimeout(() => { this.banner = null; emit('banner'); }, 4000);
  },

  // ---------- loading ----------
  async loadAll() {
    if (!api.session) return;
    const uid = api.session.userID;
    const [profiles, words, msgs] = await Promise.all([
      api.fetch('profiles?select=*&order=joined_at.desc'),
      api.fetchAll('words?select=*&order=created_at.desc,id.asc'),
      api.fetch('messages?select=*&order=created_at.desc'),
    ]);
    this.accounts = profiles; this.words = words; this.messages = msgs;
    if (!this._langSynced) { this._langSynced = true; api.setUserLang(lang).catch(() => {}); }
    this.currentID = uid;
    study.load(uid);
    await Promise.all([this.refreshChat(), this.refreshTicker()]);
    emit('data');
  },
  async refresh() { try { await this.loadAll(); } catch (e) { this.report(e); } },

  async restoreSession() {
    if (!api.session) return false;
    try { await this.loadAll(); } catch (e) { if (e.status === 401 || e.status === 400) { await this.logout(); } return !!this.current; }
    if (this.current && this.current.is_blocked) { await this.logout(); return false; }
    return !!this.current;
  },

  clearLocal() {
    this.accounts = []; this.words = []; this.messages = []; this.chat = [];
    this.ticker = null; this.currentID = null; study.load(null);
  },
  async logout() { await api.signOut(); this.clearLocal(); emit('auth'); },

  // ---------- auth ----------
  async login(email, password) {
    const e = email.trim().toLowerCase();
    if (!e || !password) throw new UserError(T('err_empty'));
    try { await api.signIn(e, password); } catch (x) { throw mapAuth(x); }
    try { await this.loadAll(); } catch (x) { await api.signOut(); throw new UserError(T('err_network')); }
    if (this.current && this.current.is_blocked) { await api.signOut(); this.clearLocal(); throw new UserError(T('err_blocked')); }
    this.touch();
    emit('auth');
  },
  async register(f) {
    const name = f.fullName.trim(), e = f.email.trim().toLowerCase(), ph = f.phone.trim();
    if (!name || !ph) throw new UserError(T('err_empty'));
    if (!e.includes('@') || !e.includes('.')) throw new UserError(T('err_bad_email'));
    if (f.password.length < 8) throw new UserError(T('err_pw_short'));
    if (f.password !== f.confirm) throw new UserError(T('err_pw_mismatch'));
    if (!f.consent) throw new UserError(T('err_consent'));
    const meta = { full_name: name, phone: ph, country: f.country, native_language: f.native, learning: f.learning, level: f.level, lang };
    let signedIn;
    try { signedIn = await api.signUp(e, f.password, meta); } catch (x) { throw mapAuth(x); }
    if (!signedIn) throw new UserError(T('err_confirm'));
    try { await this.loadAll(); } catch (x) { throw new UserError(T('err_network')); }
    this.touch();
    emit('auth');
  },
  async sendResetCode(email) {
    const e = email.trim().toLowerCase();
    if (!e.includes('@') || !e.includes('.')) throw new UserError(T('err_bad_email'));
    try { await api.publicInsert('account_events', { kind: 'reset_requested', user_email: e, detail: 'Password reset code requested' }); } catch (x) {}
    try { await api.requestPasswordReset(e); } catch (x) { throw mapAuth(x); }
  },
  async resetPassword(email, code, pw, confirm) {
    const e = email.trim().toLowerCase(), c = code.trim();
    if (!c) throw new UserError(T('err_empty'));
    if (pw.length < 8) throw new UserError(T('err_pw_short'));
    if (pw !== confirm) throw new UserError(T('err_pw_mismatch'));
    try { await api.resetPassword(e, c, pw); } catch (x) {
      if (x instanceof ApiError && [400, 401, 403, 422].includes(x.status)) {
        if ((x.message || '').toLowerCase().includes('password')) throw new UserError(T('err_pw_short'));
        throw new UserError(T('fp_bad_code'));
      }
      throw mapAuth(x);
    }
    try { await this.loadAll(); } catch (x) { await api.signOut(); throw new UserError(T('err_network')); }
    if (this.current && this.current.is_blocked) { await api.signOut(); this.clearLocal(); throw new UserError(T('err_blocked')); }
    emit('auth');
  },
  async changePassword(pw, confirm) {
    if (pw.length < 8) throw new UserError(T('err_pw_short'));
    if (pw !== confirm) throw new UserError(T('err_pw_mismatch'));
    try { await api.updatePassword(pw); } catch (x) { throw mapAuth(x); }
  },
  async sendHelpRequest(name, phone, note) {
    if (!name.trim() && !phone.trim()) throw new UserError(T('err_empty'));
    try { await api.publicInsert('account_events', { kind: 'help_request', user_name: name.trim(), phone: phone.trim(), detail: note }); }
    catch (x) { throw new UserError(T('err_network')); }
  },
  async updateMyName(n) {
    n = n.trim();
    if (n.length < 2) throw new UserError(T('err_empty'));
    try { await api.patch('profiles?id=eq.' + this.currentID, { full_name: n }); } catch (x) { throw new UserError(T('err_network')); }
    this.current.full_name = n;
  },
  async requestEmailChange(email) {
    const e = email.trim().toLowerCase();
    if (!e.includes('@') || !e.includes('.')) throw new UserError(T('err_bad_email'));
    try { await api.requestEmailChange(e); } catch (x) { throw mapAuth(x); }
  },
  async confirmEmailChange(email, code) {
    const e = email.trim().toLowerCase(), c = code.trim();
    if (!c) throw new UserError(T('err_empty'));
    try { await api.confirmEmailChange(e, c); } catch (x) {
      if (x instanceof ApiError && [400, 401, 403, 422].includes(x.status)) throw new UserError(T('fp_bad_code'));
      throw mapAuth(x);
    }
    try { await api.patch('profiles?id=eq.' + this.currentID, { email: e }); } catch (x) {}
    this.current.email = e;
  },

  // ---------- online status / light polling ----------
  async heartbeat() {
    if (!this.currentID || !api.session) return;
    const now = new Date().toISOString();
    try { await api.patch('profiles?id=eq.' + this.currentID, { last_active: now }); } catch (e) {}
    if (this.current) this.current.last_active = now;
  },
  async refreshPresence() {
    if (!this.current?.is_admin || !api.session) return;
    try {
      const rows = await api.fetch('profiles?select=id,last_active');
      for (const r of rows) { const a = this.accounts.find(x => x.id === r.id); if (a) a.last_active = r.last_active; }
      emit('presence');
    } catch (e) {}
  },
  async refreshAdminOnline() {
    if (!this.current || this.current.is_admin || !api.session) return;
    try {
      const t = await api.rpc('admin_last_seen');
      this.adminOnline = !!t && (Date.now() - new Date(t).getTime() < 90000);
    } catch (e) { this.adminOnline = false; }
    emit('presence');
  },
  async refreshTicker() {
    if (!api.session) return;
    try {
      const rows = await api.fetch('ticker?select=*&id=eq.1');
      const n = rows[0] || null;
      if (JSON.stringify(n) !== JSON.stringify(this.ticker)) { this.ticker = n; emit('ticker'); }
    } catch (e) {}
  },
  async saveTicker(t) {
    try {
      await api.patch('ticker?id=eq.1', {
        tx_fa: t.tx_fa, tx_de: t.tx_de, tx_en: t.tx_en, tx_es: t.tx_es,
        color: t.color, active: t.active, expires_at: t.expires_at || null,
        updated_at: new Date().toISOString(),
      });
      await this.refreshTicker();
      return true;
    } catch (e) { this.report(e); return false; }
  },
  async refreshChat() {
    if (!api.session || !this.currentID) return;
    try {
      const rows = await api.fetch('chat_messages?select=*&order=created_at.desc&limit=500');
      if (JSON.stringify(rows) !== JSON.stringify(this.chat)) { this.chat = rows; emit('chat'); }
    } catch (e) {}
  },
  get unreadFromUsers() { return this.chat.filter(m => !m.from_admin && m.read !== true).length; },
  get unreadUsersCount() { return new Set(this.chat.filter(m => !m.from_admin && m.read !== true).map(m => m.user_id)).size; },
  get unreadForUser() { return this.chat.filter(m => m.from_admin && m.read !== true).length; },

  // ---------- learning ----------
  award(points, word) {
    const a = this.current; if (!a) return;
    a.points += points;
    if (word && !a.learned_ids.includes(word.id)) a.learned_ids.push(word.id);
    this.touch();
  },
  progress(language) {
    const a = this.current; if (!a) return 0;
    const ids = new Set(this.words.filter(w => w.language === language).map(w => w.id));
    if (!ids.size) return 0;
    return a.learned_ids.filter(id => ids.has(id)).length / ids.size;
  },
  wordOfDay(language) {
    const pool = this.words.filter(w => w.language === language);
    if (!pool.length) return null;
    const chosen = pool.find(w => w.is_word_of_day);
    if (chosen) return chosen;
    const start = new Date(new Date().getFullYear(), 0, 0);
    const day = Math.floor((new Date() - start) / 86400000);
    return pool[day % pool.length];
  },
  inbox(id) {
    return this.messages.filter(m => !m.user_id || m.user_id === id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  },
  /** Updates "last active" and the day streak, then saves my own profile. */
  touch() {
    const a = this.current; if (!a) return;
    const today = dayString();
    if (a.last_streak_day !== today) {
      const y = new Date(); y.setDate(y.getDate() - 1);
      a.streak = a.last_streak_day === dayString(y) ? a.streak + 1 : 1;
      a.last_streak_day = today;
    }
    a.last_active = new Date().toISOString();
    this.pushProfile();
  },
  updateCurrent(change) { const a = this.current; if (!a) return; change(a); this.pushProfile(); },
  pushProfile() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      const a = this.current; if (!a) return;
      try {
        await api.patch('profiles?id=eq.' + a.id, {
          points: a.points, streak: a.streak, learned_ids: a.learned_ids,
          last_active: a.last_active, learning: a.learning, level: a.level,
          last_streak_day: a.last_streak_day || null,
        });
      } catch (e) { this.report(e); }
    }, 350);
  },
  async setHideOnLeaderboard(hide) {
    const a = this.current; if (!a) return;
    a.hide_on_leaderboard = hide;
    try { await api.patch('profiles?id=eq.' + a.id, { hide_on_leaderboard: hide }); } catch (e) { this.report(e); }
  },

  // ---------- admin actions ----------
  async run(work) { try { await work(); } catch (e) { this.report(e); } try { await this.loadAll(); } catch (e) {} },

  async givePoints(amount, id, note) {
    const a = this.accounts.find(x => x.id === id); if (!a) return;
    const newPoints = Math.max(0, a.points + amount);
    const sign = amount >= 0 ? '+' : '', pts = sign + amount;
    const msg = {
      id: uuid(), user_id: id, title: 'پیام از مدیر',
      body: note ? `${note}\n(${pts} امتیاز)` : `امتیاز شما تغییر کرد: ${pts}`,
      title_de: 'Nachricht vom Admin', title_en: 'Message from the admin', title_es: 'Mensaje del administrador',
      body_de: note ? `${note}\n(${pts} Punkte)` : `Deine Punkte wurden geändert: ${pts}`,
      body_en: note ? `${note}\n(${pts} points)` : `Your points have changed: ${pts}`,
      body_es: note ? `${note}\n(${pts} puntos)` : `Tus puntos han cambiado: ${pts}`,
    };
    await this.run(async () => {
      await api.patch('profiles?id=eq.' + id, { points: newPoints });
      await api.insert('messages', [msg]);
    });
  },
  async setBlocked(id, blocked) { await this.run(() => api.patch('profiles?id=eq.' + id, { is_blocked: blocked })); },
  async deleteAccount(id) {
    if (id === this.currentID) {
      try { await api.rpc('delete_my_account'); } catch (e) {}
      await this.logout();
    } else {
      await this.run(() => api.rpc('admin_delete_user', { target: id }));
    }
  },
  baseTranslation(w) {
    for (const t of [w.tr_fa, w.tr_en, w.tr_de, w.tr_es, w.translation]) {
      const x = (t || '').trim(); if (x) return x;
    }
    return '-';
  },
  wordRow(w) {
    return {
      id: w.id, language: w.language, level: w.level, text: w.text, translation: this.baseTranslation(w),
      topic: w.topic || '', tr_fa: w.tr_fa || '', tr_de: w.tr_de || '', tr_en: w.tr_en || '', tr_es: w.tr_es || '',
      example: w.example || '', is_word_of_day: !!w.is_word_of_day,
      audio_path: w.audio_path || null, video_path: w.video_path || null,
    };
  },
  async saveWord(w) {
    await this.run(async () => {
      if (w.is_word_of_day) {
        await api.patch(`words?language=eq.${w.language}&id=neq.${w.id}`, { is_word_of_day: false });
      }
      await api.upsert('words', [this.wordRow(w)]);
    });
  },
  async importWords(list) {
    if (!list.length) return true;
    let ok = true;
    for (let i = 0; i < list.length; i += 200) {
      try { await api.upsert('words', list.slice(i, i + 200).map(w => this.wordRow(w))); }
      catch (e) { this.report(e); ok = false; break; }
    }
    try { await this.loadAll(); } catch (e) {}
    return ok;
  },
  async deleteWords(ids) {
    if (!ids.length) return;
    await this.run(() => api.delete(`words?id=in.(${ids.join(',')})`));
  },
  async deleteMessage(id) { await this.run(() => api.delete('messages?id=eq.' + id)); },
  async sendMessage(m, userID = null) {
    const row = { id: uuid(), user_id: userID, title: m.title, body: m.body };
    for (const l of ['de', 'en', 'es']) { row['title_' + l] = m['title_' + l] || ''; row['body_' + l] = m['body_' + l] || ''; }
    await this.run(() => api.insert('messages', [row]));
  },
  async loadAccountEvents() {
    if (!this.current?.is_admin) return [];
    try { return await api.fetch('account_events?select=*&order=created_at.desc&limit=300'); } catch (e) { return []; }
  },
};

// ---------- helpers for words ----------
export function wordTr(w, l) { return w['tr_' + l] || ''; }
/** Translation in the app language (own language skipped; then en, fa, de, es). */
export function wordShown(w) {
  const order = [lang, 'en', 'fa', 'de', 'es'];
  for (const l of order) {
    if (l === w.language) continue;
    const t = (w['tr_' + l] || '').trim();
    if (t) return t;
  }
  return w.translation || '';
}
function pickMsg(m, base, prefix) {
  if (lang === 'fa') return m[base];
  for (const l of [lang, 'en']) { const t = (m[prefix + l] || '').trim(); if (t) return t; }
  return m[base];
}
export function msgTitle(m) { return pickMsg(m, 'title', 'title_'); }
export function msgBody(m) { return pickMsg(m, 'body', 'body_'); }
export function tickerText(t) {
  for (const l of [lang, 'en', 'fa', 'de', 'es']) {
    const x = (t['tx_' + l] || '').trim(); if (x) return x;
  }
  return '';
}
export function tickerLive(t) {
  if (!t || !t.active) return false;
  if (t.expires_at && new Date(t.expires_at) < new Date()) return false;
  return !!tickerText(t);
}

// keep the e-mail language in sync when the user switches the app language
try { window.addEventListener('morti-langchange', e => { if (api.session) api.setUserLang(e.detail).catch(() => {}); }); } catch (e) {}
