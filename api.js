import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const SESSION_KEY = 'morti_session';

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

let session = null;
try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) {}

function persist() {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}

function parseSession(obj) {
  if (!obj || !obj.access_token || !obj.user) throw new ApiError(0, 'invalid');
  return {
    accessToken: obj.access_token,
    refreshToken: obj.refresh_token,
    expiresAt: Date.now() + ((obj.expires_in || 3600) * 1000),
    userID: obj.user.id,
  };
}

async function send(url, opts) {
  let res;
  try { res = await fetch(url, opts); } catch (e) { throw new ApiError(0, 'network'); }
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const o = JSON.parse(text);
      msg = o.msg || o.message || o.error_description || o.error || text;
    } catch (e) {}
    throw new ApiError(res.status, String(msg || ''));
  }
  return text ? JSON.parse(text) : null;
}

async function auth(path, body, method = 'POST', token) {
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  return send(`${SUPABASE_URL}/auth/v1/${path}`, { method, headers, body: JSON.stringify(body) });
}

export const api = {
  get session() { return session; },
  get signedIn() { return !!session; },

  async signIn(email, password) {
    session = parseSession(await auth('token?grant_type=password', { email, password }));
    persist();
  },
  /** true = signed in at once, false = e-mail must be confirmed first */
  async signUp(email, password, metadata) {
    const r = await auth('signup', { email, password, data: metadata });
    if (r && r.access_token) { session = parseSession(r); persist(); return true; }
    return false;
  },
  async signOut() {
    const s = session;
    session = null; persist();
    if (s) {
      try {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
          method: 'POST', headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + s.accessToken },
        });
      } catch (e) {}
    }
  },
  async refreshIfNeeded() {
    if (!session) throw new ApiError(401, 'not signed in');
    if (session.expiresAt - Date.now() > 60000) return;
    try {
      session = parseSession(await auth('token?grant_type=refresh_token', { refresh_token: session.refreshToken }));
      persist();
    } catch (e) {
      if (e.status === 400 || e.status === 401) { session = null; persist(); }
      throw e;
    }
  },
  async requestPasswordReset(email) { await auth('recover', { email }); },
  /** Stores the chosen app language in the user's metadata so e-mails (reset code ...) come in that language. */
  async setUserLang(code) {
    if (!session) return;
    const mailLang = ['fa', 'de', 'en', 'es'].includes(code) ? code : 'en'; // e-mail templates exist in 4 languages
    await auth('user', { data: { lang: mailLang } }, 'PUT', session.accessToken);
  },
  async resetPassword(email, code, newPassword) {
    session = parseSession(await auth('verify', { type: 'recovery', email, token: code }));
    persist();
    await this.updatePassword(newPassword);
  },
  async updatePassword(password) {
    await this.refreshIfNeeded();
    await auth('user', { password }, 'PUT', session.accessToken);
  },
  async requestEmailChange(email) {
    await this.refreshIfNeeded();
    await auth('user', { email }, 'PUT', session.accessToken);
  },
  async confirmEmailChange(email, code) {
    const r = await auth('verify', { type: 'email_change', email, token: code });
    if (r && r.access_token) { session = parseSession(r); persist(); }
  },

  // ---- database ----
  async rest(path, { method = 'GET', body, prefer, retry = true } = {}) {
    await this.refreshIfNeeded();
    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + session.accessToken,
      'Content-Type': 'application/json',
    };
    if (prefer) headers.Prefer = prefer;
    try {
      return await send(`${SUPABASE_URL}/rest/v1/${path}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      if (e.status === 401 && retry) {
        session.expiresAt = 0;
        return this.rest(path, { method, body, prefer, retry: false });
      }
      throw e;
    }
  },
  fetch(path) { return this.rest(path); },
  /** Calls a Supabase Edge Function as the signed-in user. */
  async fn(name, body) {
    await this.refreshIfNeeded();
    return send(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + session.accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
  },
  async fetchAll(path) {
    const all = []; let offset = 0; const page = 1000;
    for (;;) {
      const sep = path.includes('?') ? '&' : '?';
      const rows = await this.rest(`${path}${sep}limit=${page}&offset=${offset}`);
      all.push(...rows);
      if (rows.length < page) break;
      offset += page;
    }
    return all;
  },
  patch(path, body) { return this.rest(path, { method: 'PATCH', body, prefer: 'return=minimal' }); },
  insert(table, rows) { return this.rest(table, { method: 'POST', body: rows, prefer: 'return=minimal' }); },
  upsert(table, rows) {
    return this.rest(table, { method: 'POST', body: rows, prefer: 'resolution=merge-duplicates,return=minimal' });
  },
  delete(path) { return this.rest(path, { method: 'DELETE', prefer: 'return=minimal' }); },
  rpc(name, body = {}) { return this.rest('rpc/' + name, { method: 'POST', body }); },

  /** Insert without being signed in (only help requests / reset requests are allowed by the database). */
  async publicInsert(table, row) {
    await send(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
  },

  // ---- storage ----
  async upload(bucket, path, blob, contentType, replace = false) {
    await this.refreshIfNeeded();
    const headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + session.accessToken, 'Content-Type': contentType };
    if (replace) headers['x-upsert'] = 'true';
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, { method: 'POST', headers, body: blob });
    if (!res.ok) throw new ApiError(res.status, await res.text());
  },
  async downloadURL(bucket, path) {
    await this.refreshIfNeeded();
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + session.accessToken },
    });
    if (!res.ok) throw new ApiError(res.status, 'download');
    return URL.createObjectURL(await res.blob());
  },
};
