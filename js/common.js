// Nagłówek, motyw, powiadomienia, routing po hashu.
import { SITE_NAME, SITE_SUBTITLE } from './config.js';
import { esc } from './util.js';

export function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [p = '', id = null] = h.split('/');
  return { p, id: id ? decodeURIComponent(id) : null };
}

export function toggleTheme() {
  const root = document.documentElement;
  const cur = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('iskra-theme', next); } catch (e) {}
}

const LOGO = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M13.5 2 4 13.5h6.5L9 22l10-12.5h-6.7z"/></svg>`;

const NAV = {
  public: [['', 'Utrudnienia', ['komunikat']], ['polaczenia', 'Połączenia', []], ['linie', 'Linie', ['linia']], ['stacje', 'Stacje', ['stacja']], ['archiwum', 'Archiwum', []]],
  panel: [['komunikaty', 'Komunikaty', ['', 'komunikat', 'duplikuj']], ['linie', 'Linie', ['linia']], ['stacje', 'Stacje', ['stacja']], ['uzytkownicy', 'Użytkownicy', [], 'admin'], ['konto', 'Moje konto', []]],
};

export function mountHeader(kind, profile) {
  const el = document.getElementById('top');
  const items = NAV[kind === 'panel' ? 'panel' : 'public'].filter((n) => !n[3] || (profile && profile.rola === n[3]));
  const nav = kind === 'auth' ? '' : items.map(([p, label]) => `<a href="#/${p}" data-nav="${p}">${label}</a>`).join('');
  let right = '';
  if (kind === 'public' || kind === 'auth') right = `<a class="btn ghost-light sm" href="panel.html">🔧 Panel technika</a>`;
  if (kind === 'panel') right = `
    <span class="who" title="${esc(profile?.login || '')}">👷 ${esc(profile?.nazwa || '')}</span>
    <a class="btn ghost-light sm" href="index.html">Strona publiczna</a>
    <button class="btn ghost-light sm" id="logout">Wyloguj</button>`;
  el.className = 'site-head';
  el.innerHTML = `
    <div class="wrap bar">
      <a class="brand" href="${kind === 'panel' ? 'panel.html' : 'index.html'}#/">
        <span class="logo">${LOGO}</span>
        <span class="brand-txt"><b>${esc(SITE_NAME)}</b><small>${kind === 'panel' ? 'Panel technika' : esc(SITE_SUBTITLE)}</small></span>
      </a>
      <div class="bar-right">${right}<button class="btn ghost-light sm icon" id="theme" title="Zmień motyw" aria-label="Zmień motyw">◐</button></div>
      ${nav ? `<nav class="nav">${nav}</nav>` : ''}
    </div>`;
  el.querySelector('#theme').onclick = toggleTheme;
  markActive();
  window.addEventListener('hashchange', markActive);
}

function markActive() {
  const { p } = route();
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const item = [...NAV.public, ...NAV.panel].find((n) => n[0] === a.dataset.nav && a.textContent === n[1]);
    const on = a.dataset.nav === p || (item && item[2].includes(p));
    a.classList.toggle('on', !!on);
  });
}

export function demoBanner(api) {
  const el = document.getElementById('demo');
  if (!el || !api.demo) return;
  el.innerHTML = `<div class="demo-bar"><div class="wrap">
    <span><b>Tryb demo.</b> Zmiany zapisują się tylko w tej przeglądarce. Aby wszyscy je widzieli, uzupełnij <code>js/config.js</code> danymi z Firebase.</span>
    <button class="btn sm" id="demo-reset">Przywróć przykładowe dane</button></div></div>`;
  el.querySelector('#demo-reset').onclick = () => { if (confirm('Przywrócić przykładowe dane? Twoje zmiany w demo zostaną usunięte.')) { api.resetDemo(); toast('Przywrócono przykładowe dane'); } };
}

export function toast(msg, type = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.setAttribute('role', 'status');
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => t.classList.add('out'), 2800);
  setTimeout(() => t.remove(), 3300);
}

// Podmienia HTML, zachowując fokus i kursor w polu tekstowym (żeby filtr nie „gubił” pisania).
export function renderInto(el, html) {
  const a = document.activeElement;
  const id = a && a.id;
  let s = null, e = null;
  try { s = a.selectionStart; e = a.selectionEnd; } catch (err) {}
  el.innerHTML = html;
  if (id) {
    const n = document.getElementById(id);
    if (n) { n.focus(); try { if (s != null) n.setSelectionRange(s, e); } catch (err) {} }
  }
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (err) {}
    ta.remove();
  }
  toast('Skopiowano: ' + text);
}
