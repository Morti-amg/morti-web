import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const rid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)).replace(/-/g, '').slice(0, 32);
const get = (s, k) => { try { return s.getItem(k); } catch (e) { return null; } };
const put = (s, k, v) => { try { s.setItem(k, v); } catch (e) {} };

async function country() {
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 3500);
    const r = await fetch('https://api.country.is/', { signal: c.signal });
    const j = await r.json();
    return /^[A-Z]{2}$/.test(j.country) ? j.country : null;
  } catch (e) { return null; }
}

/** Counts one visit per browser session. Stores only a random id, country, language, device and referrer host. */
export async function trackVisit(signedIn) {
  if (get(localStorage, 'morti_admin') === '1') return;   // the admin's own visits are not counted
  if (get(sessionStorage, 'morti_vs')) return;
  put(sessionStorage, 'morti_vs', '1');
  let vid = get(localStorage, 'morti_vid');
  if (!vid) { vid = rid(); put(localStorage, 'morti_vid', vid); }
  const w = Math.min(screen.width || 0, window.innerWidth || 9999);
  const device = /iPad|Tablet/i.test(navigator.userAgent) || (w >= 600 && w < 1000) ? 'tablet' : (w < 600 ? 'mobile' : 'desktop');
  let ref = '';
  try { ref = document.referrer ? new URL(document.referrer).hostname.replace(/^www\./, '').slice(0, 60) : ''; } catch (e) {}
  if (!ref && /Instagram/i.test(navigator.userAgent)) ref = 'instagram.com';
  const cc = await country();
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/visits`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ visitor: vid, country: cc, lang: (document.documentElement.lang || '').slice(0, 8), device, referrer: ref, signed_in: !!signedIn }),
    });
  } catch (e) {}
}
