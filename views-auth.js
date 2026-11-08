import { T, COUNTRIES, NATIVE_LANGS, LEARN, LEVELS, label } from './i18n.js';
import { store, UserError } from './store.js';
import { h, field, val, select, modal, toast, logo, languageSelect } from './ui.js';

function busyButton(text, action, cls = 'btn primary') {
  const btn = h('button', { class: cls, type: 'button' }, text);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    const old = btn.textContent; btn.textContent = '…';
    try { await action(); } finally { btn.disabled = false; btn.textContent = old; }
  });
  return btn;
}

export function privacyModal() {
  modal(body => {
    body.append(
      h('div', { class: 'center' }, logo()),
      h('p', { class: 'mute center small' }, T('priv_intro')),
      [1, 2, 3, 4, 5].map(i => h('div', { class: 'card stack', style: { gap: '8px' } },
        h('div', { class: 'red bold' }, T('priv_h' + i)), h('div', null, T('priv_b' + i)))));
  }, { title: T('priv_title') });
}

export function authView(root) {
  let isRegister = false;

  function draw() {
    root.replaceChildren();
    const f = {
      fullName: field(T('full_name'), { caps: 'words', autocomplete: 'name' }),
      email: field(T('email'), { type: 'email', inputmode: 'email', autocomplete: 'email', dir: 'ltr' }),
      phone: field(T('phone'), { type: 'tel', inputmode: 'tel', autocomplete: 'tel', dir: 'ltr' }),
      password: field(T('password'), { type: 'password', autocomplete: isRegister ? 'new-password' : 'current-password', dir: 'ltr' }),
      confirm: field(T('password_repeat'), { type: 'password', autocomplete: 'new-password', dir: 'ltr' }),
    };
    let country = COUNTRIES[0], native = NATIVE_LANGS[0], learning = 'de', level = 'A1', consent = false;
    const err = h('div', { class: 'err', hidden: true });
    const pick = (title, opts, value, set) => h('div', { class: 'pick' }, h('span', { class: 'mute' }, title),
      select(opts, value, set));

    const submit = async () => {
      err.hidden = true;
      try {
        if (isRegister) {
          await store.register({
            fullName: val(f.fullName), email: val(f.email), phone: val(f.phone), country, native, learning, level,
            password: val(f.password), confirm: val(f.confirm), consent,
          });
        } else {
          await store.login(val(f.email), val(f.password));
        }
      } catch (e) {
        err.textContent = e instanceof UserError ? e.message : T('err_network'); err.hidden = false;
      }
    };
    const onEnter = e => { if (e.key === 'Enter') submit(); };
    [f.email.input || f.email, f.password.input].forEach(i => i.addEventListener('keydown', onEnter));

    root.append(h('div', { class: 'stack', style: { maxWidth: '460px', margin: '0 auto' } },
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, languageSelect()),
      h('div', { class: 'center', style: { padding: '14px 0 6px' } }, logo()),
      h('div', { class: 'center mute', style: { marginTop: '-6px' } }, 'زبان بیاموز با مورتی'),
      h('h2', { class: 'center' }, isRegister ? T('register') : T('login')),
      isRegister ? f.fullName : null,
      f.email,
      isRegister ? [
        f.phone,
        pick(T('country'), COUNTRIES.map(c => ({ value: c, label: label(c) })), country, v => country = v),
        pick(T('native_lang'), NATIVE_LANGS.map(c => ({ value: c, label: label(c) })), native, v => native = v),
        pick(T('want_learn'), Object.entries(LEARN).map(([k, v]) => ({ value: k, label: v.flag + ' ' + v.title })), learning, v => learning = v),
        pick(T('my_level'), LEVELS.map(l => ({ value: l, label: l })), level, v => level = v),
      ] : null,
      f.password,
      isRegister ? [
        f.confirm,
        h('button', { class: 'btn ghost', type: 'button', style: { color: 'var(--accent)' }, onclick: privacyModal }, '🔒 ' + T('priv_link')),
        h('label', { class: 'switch' }, h('span', { class: 'small mute' }, T('consent')),
          h('input', { type: 'checkbox', onchange: e => consent = e.target.checked })),
      ] : null,
      err,
      busyButton(isRegister ? T('register') : T('login'), submit),
      h('button', { class: 'link-btn', type: 'button', onclick: () => { isRegister = !isRegister; draw(); } },
        isRegister ? T('have_account') : T('no_account')),
      !isRegister ? [
        h('button', { class: 'link-btn red', type: 'button', onclick: () => forgotModal(val(f.email)) }, T('fp_forgot')),
        h('button', { class: 'link-btn', type: 'button', onclick: helpModal }, T('help_link')),
        h('button', { class: 'link-btn mute', type: 'button', onclick: privacyModal }, T('priv_link')),
      ] : null));
  }
  draw();
}

// ---------- forgot password: e-mail -> code -> new password ----------
function forgotModal(startEmail) {
  modal((body, close) => {
    let codeSent = false;
    const email = field(T('email'), { type: 'email', value: startEmail, dir: 'ltr', inputmode: 'email' });
    const code = field(T('fp_code'), { inputmode: 'numeric', dir: 'ltr' });
    const pw = field(T('fp_new'), { type: 'password', dir: 'ltr' });
    const pw2 = field(T('fp_repeat'), { type: 'password', dir: 'ltr' });
    const err = h('div', { class: 'err', hidden: true });
    const info = h('div', { class: 'gold small center', hidden: true }, T('fp_sent'));
    const step2 = h('div', { class: 'stack', hidden: true }, code, pw, pw2);
    const action = h('div');

    const fail = e => { err.textContent = e instanceof UserError ? e.message : T('err_network'); err.hidden = false; };
    const sendBtn = () => busyButton(codeSent ? T('fp_save') : T('fp_send'), async () => {
      err.hidden = true;
      try {
        if (!codeSent) {
          await store.sendResetCode(val(email));
          codeSent = true; step2.hidden = false; info.hidden = false; email.disabled = true;
          action.replaceChildren(sendBtn());
        } else {
          await store.resetPassword(val(email), val(code), val(pw), val(pw2));
          close();
        }
      } catch (e) { fail(e); }
    });
    action.append(sendBtn());
    body.append(h('div', { class: 'center', style: { fontSize: '44px' } }, '🔐'),
      h('p', { class: 'mute center' }, T('fp_intro')), email, info, step2, err, action);
  }, { title: T('fp_title') });
}

// ---------- forgot e-mail or name ----------
function helpModal() {
  modal(body => {
    const name = field(T('help_name'), { caps: 'words' });
    const phone = field(T('phone'), { type: 'tel', inputmode: 'tel', dir: 'ltr' });
    const note = field(T('help_note'));
    const err = h('div', { class: 'err', hidden: true });
    const ok = h('div', { class: 'okmsg', hidden: true }, '✓ ' + T('help_sent'));
    const btn = busyButton(T('help_send'), async () => {
      err.hidden = true;
      try { await store.sendHelpRequest(val(name), val(phone), val(note)); ok.hidden = false; btn.hidden = true; }
      catch (e) { err.textContent = e instanceof UserError ? e.message : T('err_network'); err.hidden = false; }
    });
    body.append(h('div', { class: 'center', style: { fontSize: '44px' } }, '🙋'),
      h('p', { class: 'mute center' }, T('help_intro')), name, phone, note, err, ok, btn);
  }, { title: T('help_title') });
}
