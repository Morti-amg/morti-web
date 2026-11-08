import { applyDir, T, lang } from './i18n.js';
import { store, on, tickerText, tickerLive } from './store.js';
import { api } from './api.js';
import { h, mount, toast, setAccent, currentAccent, clear } from './ui.js';
import { authView } from './views-auth.js';
import { homeView, lessonView, reviewView, leaderboardView, inboxView, userChatView, profileView } from './views-user.js';
import { grammarListView, grammarLessonView, adminGrammarView } from './grammar.js';
import { dashboardView, adminChatsView, adminChatThreadView, usersView, userDetailView, wordsView, messagesView, tickerView, eventsView } from './views-admin.js';

applyDir();
setAccent(currentAccent());

const app = document.getElementById('app');

const ROUTES = {
  grammar: grammarListView, gram: grammarLessonView, 'a-grammar': adminGrammarView,
  home: homeView, lesson: lessonView, review: reviewView, leaderboard: leaderboardView,
  inbox: inboxView, chat: userChatView, profile: profileView,
  admin: dashboardView, 'a-chats': adminChatsView, 'a-chat': adminChatThreadView, 'a-users': usersView,
  'a-user': userDetailView, 'a-words': wordsView, 'a-messages': messagesView, 'a-ticker': tickerView, 'a-events': eventsView,
};
const TAB_OF = { grammar: 'home', gram: 'home', 'a-grammar': 'admin', home: 'home', lesson: 'home', review: 'home', leaderboard: 'home', inbox: 'inbox', chat: 'chat', profile: 'profile',
  admin: 'admin', 'a-ticker': 'admin', 'a-events': 'admin', 'a-chats': 'a-chats', 'a-chat': 'a-chats', 'a-users': 'a-users', 'a-user': 'a-users',
  'a-words': 'a-words', 'a-messages': 'a-messages' };

const ADMIN_ROUTES = new Set(['a-grammar', 'admin', 'a-chats', 'a-chat', 'a-users', 'a-user', 'a-words', 'a-messages', 'a-ticker', 'a-events']);
let cleanup = null;
let shell = null;

function parseHash() {
  const parts = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || '', params: parts.slice(1) };
}
export function go(path) { location.hash = '#/' + path; }

function tabs(isAdmin) {
  if (isAdmin) return [
    ['admin', '📊', 'داشبورد'], ['a-chats', '💬', 'گفتگوها'], ['a-users', '👥', 'کاربران'], ['a-words', '📚', 'لغت‌ها'], ['a-messages', '📣', 'پیام'],
  ];
  return [['home', '🏠', T('tab_home')], ['inbox', '🔔', T('tab_messages')], ['chat', '💬', T('tab_chat')], ['profile', '👤', T('tab_profile')]];
}

function renderShell() {
  const me = store.current;
  clear(app);
  const ticker = h('div', { class: 'ticker', hidden: true }, h('span'));
  const view = h('main', { id: 'view' });
  const bar = h('nav', { class: 'tabbar' }, h('div', { class: 'tabs' }));
  app.append(ticker, view, bar);
  shell = { ticker, view, bar: bar.firstChild, isAdmin: !!me.is_admin };
  updateTicker();
  route();
}

function updateTabs(active) {
  if (!shell) return;
  const unread = shell.isAdmin ? store.unreadFromUsers : store.unreadForUser;
  mount(shell.bar, tabs(shell.isAdmin).map(([id, icon, label]) => {
    const cnt = (shell.isAdmin ? id === 'a-chats' : id === 'chat') ? unread : 0;
    return h('button', { class: 'tab' + (id === active ? ' on' : ''), onclick: () => go(id) },
      h('span', { class: 'ic' }, icon), label, cnt > 0 ? h('span', { class: 'badge' }, String(Math.min(cnt, 99))) : null);
  }));
}

function updateTicker() {
  if (!shell) return;
  const t = store.ticker;
  if (tickerLive(t)) {
    shell.ticker.hidden = false;
    const span = shell.ticker.firstChild;
    span.textContent = tickerText(t);
    span.style.color = '#' + (t.color || 'FFD34D').replace('#', '');
  } else shell.ticker.hidden = true;
}

function route() {
  if (!shell) return;
  if (cleanup) { try { cleanup(); } catch (e) {} cleanup = null; }
  let { name, params } = parseHash();
  const admin = shell.isAdmin;
  if (!ROUTES[name] || ADMIN_ROUTES.has(name) !== admin) {
    name = admin ? 'admin' : 'home'; params = [];
    history.replaceState(null, '', '#/' + name);
  }
  updateTabs(TAB_OF[name]);
  const view = shell.view;
  clear(view);
  window.scrollTo(0, 0);
  cleanup = ROUTES[name](view, params, { go, refreshTabs: () => updateTabs(TAB_OF[name]) }) || null;
}

function renderAuth() {
  shell = null;
  clear(app);
  const box = h('div', { class: 'page noTab' });
  app.append(box);
  authView(box);
}

function blockedView() {
  shell = null;
  mount(app, h('div', { class: 'page noTab center stack', style: { justifyContent: 'center', minHeight: '80vh' } },
    h('div', { style: { fontSize: '56px' } }, '⛔'), h('h2', null, T('err_blocked')),
    h('button', { class: 'btn ghost', onclick: () => store.logout() }, T('logout'))));
}

function render() {
  if (!api.signedIn || !store.current) return renderAuth();
  if (store.current.is_blocked) return blockedView();
  renderShell();
}

on('auth', render);
on('ticker', updateTicker);
on('chat', () => { if (shell) updateTabs(TAB_OF[parseHash().name] || ''); });
on('banner', () => { if (store.banner) toast(store.banner); });
window.addEventListener('hashchange', () => { if (shell) route(); });
// language / color changes re-draw everything
window.addEventListener('morti:rerender', render);

// ---------- polling (like the iPhone app) ----------
setInterval(() => {
  if (!store.currentID) return;
  store.refreshChat(); store.refreshTicker(); store.refreshPresence(); store.refreshAdminOnline();
}, 8000);
setInterval(() => { if (store.currentID) store.heartbeat(); }, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && store.currentID) store.refresh(); });

// ---------- start ----------
(async () => {
  const splash = document.getElementById('splash');
  const t0 = Date.now();
  let ok = false;
  try { ok = await store.restoreSession(); } catch (e) {}
  const wait = Math.max(0, 1300 - (Date.now() - t0));
  setTimeout(() => {
    render();
    splash.classList.add('out');
    setTimeout(() => splash.remove(), 600);
  }, wait);
})();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
