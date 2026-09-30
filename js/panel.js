// Panel technika: komunikaty, linie, stacje, użytkownicy, konto.
import { getApi, errMsg } from './api.js';
import { SITE_NAME } from './config.js';
import * as U from './util.js';
import { mountHeader, demoBanner, toast, renderInto, route } from './common.js';
import { seedData } from './seed.js';

const { esc } = U;
const app = document.getElementById('app');
const state = { stacje: [], linie: [], komunikaty: [], users: [], ready: {}, profile: null, uid: null, error: null };
let api;
let rendered = null;          // hash, dla którego wyrenderowano formularz (żeby nie kasować wpisywanych danych)
let tab = 'aktywny';
let pq = '';
let sq = '';

const FORM_VIEWS = new Set(['komunikat', 'duplikuj', 'linia', 'stacja', 'uzytkownicy', 'konto']);
const byId = (col, id) => state[col].find((x) => x.id === id);
const actor = () => ({ uid: state.uid, nazwa: state.profile?.nazwa || '?' });
const isAdmin = () => state.profile?.rola === 'admin';
const histEntry = (akcja) => ({ akcja, uid: state.uid, nazwa: state.profile?.nazwa || '?', kiedy: new Date() });

// ---------- start ----------
async function main() {
  document.title = `Panel technika — ${SITE_NAME}`;
  api = await getApi();
  let started = false;
  api.onUser((user, profile) => {
    if (!user) { location.href = 'login.html'; return; }
    if (!profile || !profile.aktywny || !U.ROLE[profile.rola]) {
      mountHeader('auth');
      app.innerHTML = `<div class="card center narrow"><h1>Brak dostępu</h1>
        <p>${!profile ? 'To konto nie ma przypisanej roli technika.' : 'To konto zostało wyłączone przez administratora.'}</p>
        <button class="btn primary" id="lo">Wyloguj</button></div>`;
      app.querySelector('#lo').onclick = () => api.logout();
      return;
    }
    state.uid = user.uid;
    state.profile = profile;
    if (started) return;
    started = true;
    mountHeader('panel', profile);
    document.getElementById('logout').onclick = async () => { await api.logout(); location.href = 'login.html'; };
    demoBanner(api);
    const cols = ['stacje', 'linie', 'komunikaty'];
    if (isAdmin()) cols.push('users');
    for (const col of cols) {
      api.subscribe(col, (docs) => { state[col] = docs; state.ready[col] = true; render(); }, (err) => { state.error = err; render(true); });
    }
    window.addEventListener('hashchange', () => { render(true); window.scrollTo(0, 0); });
    window.addEventListener('beforeunload', (e) => { if (document.querySelector('form.dirty')) { e.preventDefault(); e.returnValue = ''; } });
  });
}

function render(force = false) {
  if (state.error) { app.innerHTML = `<div class="alert bad">${esc(errMsg(state.error))}</div>`; return; }
  if (!['stacje', 'linie', 'komunikaty'].every((c) => state.ready[c])) { app.innerHTML = '<p class="loading">Ładowanie…</p>'; rendered = null; return; }
  const { p, id } = route();
  const key = location.hash || '#/';
  if (FORM_VIEWS.has(p) && rendered === key && !force) {
    if (p === 'uzytkownicy') drawUsersList();
    return;
  }
  rendered = key;
  const v = {
    '': viewKomunikaty, komunikaty: viewKomunikaty,
    komunikat: () => formKomunikat(id, false), duplikuj: () => formKomunikat(id, true),
    linie: viewLinie, linia: () => formLinia(id),
    stacje: viewStacje, stacja: () => formStacja(id),
    uzytkownicy: viewUsers, konto: viewKonto,
  }[p];
  if (!v) { app.innerHTML = `<div class="card center"><h1>Nie ma takiej strony</h1><a class="btn" href="#/">Wróć</a></div>`; return; }
  v();
}

// ---------- pomocnicze do formularzy ----------
function setErrors(form, errs) {
  form.querySelectorAll('[data-err]').forEach((el) => { el.textContent = errs[el.dataset.err] || ''; });
  form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
  Object.keys(errs).forEach((k) => form.querySelector(`[name="${k}"]`)?.classList.add('invalid'));
  const box = form.querySelector('.form-errors');
  const list = Object.values(errs);
  if (box) box.innerHTML = list.length ? `<b>Popraw błędy:</b><ul>${list.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>` : '';
  if (list.length) (form.querySelector('.invalid') || box)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return list.length === 0;
}
const err = (name) => `<div class="field-err" data-err="${name}"></div>`;
function trackDirty(form) { form.addEventListener('input', () => form.classList.add('dirty')); }
async function busy(btn, fn) {
  const t = btn.textContent;
  btn.disabled = true; btn.textContent = 'Zapisywanie…';
  try { await fn(); } finally { btn.disabled = false; btn.textContent = t; }
}

// Edytor trasy: lista stacji z przeciąganiem, strzałkami i opcjonalnym czasem przejazdu.
function routeEditor(el, value, { withTimes = false } = {}) {
  let items = value.map((v) => (typeof v === 'string' ? { stacja: v, czas: null } : { stacja: v.stacja, czas: v.czas ?? null }));
  let drag = null;
  const stations = [...state.stacje].sort(U.byName);
  const draw = () => {
    el.innerHTML = `
      ${items.length ? `<ol class="route-ed">${items.map((it, i) => {
        const s = byId('stacje', it.stacja);
        return `<li draggable="true" data-i="${i}">
          <span class="handle" title="Przeciągnij">⋮⋮</span>
          <span class="num">${i + 1}</span>
          <span class="name">${s ? `${esc(s.nazwa)} <small class="code">${esc(s.kod)}</small>` : '<i class="muted">usunięta stacja</i>'}</span>
          ${withTimes && i > 0 ? (() => {
            const tot = it.czas != null ? Math.round(it.czas * 60) : null;
            const m = tot != null ? Math.floor(tot / 60) : '', s = tot != null ? tot % 60 : '';
            return `<span class="time" title="Czas przejazdu od poprzedniej stacji">+<input type="number" min="0" step="1" value="${m}" data-tm="${i}" aria-label="minuty" placeholder="0">min<input type="number" min="0" max="59" step="1" value="${s}" data-ts="${i}" aria-label="sekundy" placeholder="0">s</span>`;
          })() : '<span class="time"></span>'}
          <span class="re-btns">
            <button type="button" class="btn xs" data-mv="-1" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="W górę">↑</button>
            <button type="button" class="btn xs" data-mv="1" data-i="${i}" ${i === items.length - 1 ? 'disabled' : ''} aria-label="W dół">↓</button>
            <button type="button" class="btn xs danger" data-rm="${i}" aria-label="Usuń">✕</button>
          </span></li>`; }).join('')}</ol>` : '<p class="muted small">Brak stacji — dodaj pierwszą poniżej.</p>'}
      <div class="route-add">
        <select aria-label="Stacja do dodania"><option value="">— wybierz stację —</option>${stations.map((s) => `<option value="${esc(s.id)}">${esc(s.nazwa)} (${esc(s.kod)})</option>`).join('')}</select>
        <button type="button" class="btn sm" data-add>+ Dodaj na koniec</button>
      </div>`;
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.add !== undefined) {
      const sel = el.querySelector('.route-add select');
      if (!sel.value) { sel.focus(); return; }
      items.push({ stacja: sel.value, czas: null });
    } else if (b.dataset.rm !== undefined) {
      items.splice(+b.dataset.rm, 1);
    } else if (b.dataset.mv) {
      const i = +b.dataset.i, j = i + +b.dataset.mv;
      [items[i], items[j]] = [items[j], items[i]];
    } else return;
    el.closest('form')?.classList.add('dirty');
    draw();
  });
  el.addEventListener('input', (e) => {
    const i = e.target.dataset.tm ?? e.target.dataset.ts;
    if (i === undefined) return;
    const li = e.target.closest('li');
    const mv = li.querySelector('[data-tm]').value, sv = li.querySelector('[data-ts]').value;
    const tot = (Number(mv) || 0) * 60 + (Number(sv) || 0);
    items[+i].czas = mv === '' && sv === '' ? null : Math.max(0, tot) / 60;
  });
  el.addEventListener('dragstart', (e) => { const li = e.target.closest('li[data-i]'); if (li) { drag = +li.dataset.i; li.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; } });
  el.addEventListener('dragend', () => { drag = null; el.querySelectorAll('.dragging,.over').forEach((x) => x.classList.remove('dragging', 'over')); });
  el.addEventListener('dragover', (e) => { const li = e.target.closest('li[data-i]'); if (li && drag !== null) { e.preventDefault(); el.querySelectorAll('.over').forEach((x) => x.classList.remove('over')); li.classList.add('over'); } });
  el.addEventListener('drop', (e) => {
    const li = e.target.closest('li[data-i]');
    if (!li || drag === null) return;
    e.preventDefault();
    const to = +li.dataset.i;
    const [m] = items.splice(drag, 1);
    items.splice(to, 0, m);
    drag = null;
    el.closest('form')?.classList.add('dirty');
    draw();
  });
  draw();
  return { get: () => items.map((it, i) => ({ stacja: it.stacja, czas: i > 0 && it.czas != null && !isNaN(it.czas) ? it.czas : null })) };
}

// ---------- KOMUNIKATY ----------
function viewKomunikaty() {
  const now = new Date();
  const all = state.komunikaty.map((k) => ({ ...k, _s: U.statusOf(k, now) }));
  const counts = { aktywny: 0, nadchodzacy: 0, zakonczony: 0 };
  all.forEach((k) => counts[k._s]++);
  const q = U.norm(pq);
  let rows = all.filter((k) => (tab === 'wszystkie' || k._s === tab) && (!q || U.norm(k.tytul + ' ' + k.tresc).includes(q)));
  rows.sort((a, b) => (tab === 'nadchodzacy' ? a.od - b.od : (b.zmieniono || b.od) - (a.zmieniono || a.od)));
  const empty = !state.stacje.length && !state.linie.length && !state.komunikaty.length;
  const tabs = [['aktywny', 'Aktywne'], ['nadchodzacy', 'Nadchodzące'], ['zakonczony', 'Zakończone'], ['wszystkie', 'Wszystkie']];

  renderInto(app, `
  ${empty && isAdmin() ? `<div class="card seed"><b>Baza jest pusta.</b> Możesz zacząć od dodania stacji i linii albo wgrać przykładowe dane (i potem je przerobić).
    <button class="btn" data-act="seed">Wgraj przykładowe dane</button></div>` : ''}
  <div class="page-head"><h1>Komunikaty</h1><a class="btn primary" href="#/komunikat/nowy">+ Nowy komunikat</a></div>
  <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<button role="tab" class="tab${tab === k ? ' on' : ''}" data-tab="${k}">${l}${counts[k] !== undefined ? ` <span class="count">${counts[k]}</span>` : ''}</button>`).join('')}</div>
  <div class="filters card"><label class="grow">Szukaj<input id="pq" type="search" data-pq value="${esc(pq)}" placeholder="tytuł lub treść"></label></div>
  ${rows.length ? `<div class="rows">${rows.map((k) => {
    const t = U.TYPY[k.typ] || U.TYPY.informacja;
    return `<div class="row-item sev-${esc(k.waznosc)}">
      <div class="ri-main">
        <div class="ri-badges"><span class="badge s-${k._s}">${U.STATUS_K[k._s]}</span><span class="badge typ">${t.icon} ${esc(t.label)}</span>${(k.linie || []).map((id) => U.lineChip(byId('linie', id))).join('')}</div>
        <a class="ri-title" href="#/komunikat/${esc(k.id)}">${esc(k.tytul)}</a>
        <div class="muted small">${U.fmt(k.od)} → ${k.do ? U.fmt(k.do) : 'do odwołania'} · zmienił(a): ${esc(k.zmienil?.nazwa || '?')}</div>
      </div>
      <div class="ri-actions">
        <a class="btn sm" href="#/komunikat/${esc(k.id)}">Edytuj</a>
        <a class="btn sm" href="#/duplikuj/${esc(k.id)}">Duplikuj</a>
        ${k._s !== 'zakonczony' ? `<button class="btn sm" data-act="end" data-id="${esc(k.id)}">Zakończ</button>` : ''}
        <button class="btn sm danger" data-act="del" data-id="${esc(k.id)}">Usuń</button>
      </div></div>`; }).join('')}</div>` : `<p class="empty">Brak komunikatów w tej zakładce.</p>`}`);
}

function formKomunikat(id, dup) {
  const isNew = !id || id === 'nowy';
  const src = isNew ? null : byId('komunikaty', id);
  if (!isNew && !src) { app.innerHTML = `<div class="card center"><h1>Nie znaleziono komunikatu</h1><a class="btn" href="#/komunikaty">Wróć</a></div>`; return; }
  const editing = src && !dup;
  const k = src ? { ...src } : { tytul: '', typ: 'utrudnienie', waznosc: 'srednia', od: new Date(), do: null, linie: [], stacje: [], tresc: '', objazd: [], zakonczony: false };
  if (dup) Object.assign(k, { od: new Date(), do: null, zakonczony: false });
  const linie = [...state.linie].sort(U.byName);
  const stacje = [...state.stacje].sort(U.byName);

  app.innerHTML = `
  <a class="back" href="#/komunikaty">← Komunikaty</a>
  <h1>${editing ? 'Edycja komunikatu' : dup ? 'Nowy komunikat (kopia)' : 'Nowy komunikat'}</h1>
  <form class="card form" novalidate>
    <div class="form-errors" role="alert"></div>
    <label class="f">Tytuł *<input name="tytul" maxlength="200" value="${esc(k.tytul)}" placeholder="np. Wstrzymany ruch Zamek – Lodowe Szczyty" required>${err('tytul')}</label>
    <div class="f-row">
      <label class="f">Rodzaj<select name="typ">${U.options(U.TYPY, k.typ)}</select></label>
      <fieldset class="f"><legend>Ważność</legend><div class="seg">${Object.entries(U.WAZNOSC).map(([v, o]) => `<label class="seg-i sev-${v}"><input type="radio" name="waznosc" value="${v}"${k.waznosc === v ? ' checked' : ''}><span>${o.label}</span></label>`).join('')}</div></fieldset>
    </div>
    <div class="f-row">
      <label class="f">Od *<input type="datetime-local" name="od" value="${U.toLocalInput(k.od)}" required>${err('od')}</label>
      <label class="f">Do <span class="muted small">(puste = do odwołania)</span><input type="datetime-local" name="do" value="${U.toLocalInput(k.do)}">${err('do')}
        <span class="quick">${[['1h', 1], ['3h', 3], ['1 dzień', 24], ['3 dni', 72], ['tydzień', 168]].map(([l, h]) => `<button type="button" class="btn xs" data-plus="${h}">+${l}</button>`).join('')}<button type="button" class="btn xs" data-plus="0">wyczyść</button></span></label>
    </div>
    <fieldset class="f"><legend>Linie, których dotyczy</legend>
      ${linie.length ? `<div class="checks">${linie.map((l) => `<label class="chk"><input type="checkbox" name="linie" value="${esc(l.id)}"${(k.linie || []).includes(l.id) ? ' checked' : ''}>${U.lineChip(l)}</label>`).join('')}</div>` : '<p class="muted small">Brak linii — dodaj je w zakładce Linie.</p>'}
    </fieldset>
    <fieldset class="f"><legend>Stacje, których dotyczy</legend>
      ${stacje.length > 8 ? `<input type="search" class="st-filter" placeholder="Filtruj stacje…" aria-label="Filtruj stacje">` : ''}
      ${stacje.length ? `<div class="checks st-checks">${stacje.map((s) => `<label class="chk" data-name="${esc(U.norm(s.nazwa + ' ' + s.kod))}"><input type="checkbox" name="stacje" value="${esc(s.id)}"${(k.stacje || []).includes(s.id) ? ' checked' : ''}><span class="st-chip">${esc(s.nazwa)} <small>${esc(s.kod)}</small></span></label>`).join('')}</div>` : '<p class="muted small">Brak stacji.</p>'}
    </fieldset>
    <label class="f">Treść
      <textarea name="tresc" rows="7" maxlength="10000" placeholder="Opisz, co się stało, jak ominąć utrudnienie…">${esc(k.tresc)}</textarea>
      <span class="hint">Formatowanie: <code>**pogrubienie**</code> <code>*kursywa*</code> <code>- punkt listy</code> <code>[link](https://…)</code></span>
    </label>
    <details class="f preview"><summary>Podgląd treści</summary><div class="md" id="pv"></div></details>
    <fieldset class="f"><legend>Trasa objazdowa / zastępcza <span class="muted small">(opcjonalnie)</span></legend><div id="objazd"></div>${err('objazd')}</fieldset>
    ${editing ? `<label class="chk-line"><input type="checkbox" name="zakonczony"${k.zakonczony ? ' checked' : ''}> Zakończony ręcznie (ukryj ze strony głównej)</label>` : ''}
    <div class="form-actions">
      <button class="btn primary" type="submit">${editing ? 'Zapisz zmiany' : 'Opublikuj komunikat'}</button>
      <a class="btn" href="#/komunikaty">Anuluj</a>
      ${editing ? `<button class="btn danger push" type="button" data-act="del" data-id="${esc(k.id)}">Usuń</button>` : ''}
    </div>
    ${editing && (k.historia || []).length ? `<details class="hist"><summary>Historia zmian (${k.historia.length})</summary><ul>${[...k.historia].reverse().map((h) => `<li>${U.fmt(h.kiedy)} — <b>${esc(h.akcja)}</b> · ${esc(h.nazwa)}</li>`).join('')}</ul></details>` : ''}
  </form>`;

  const form = app.querySelector('form');
  trackDirty(form);
  const objazd = routeEditor(form.querySelector('#objazd'), k.objazd || []);
  const pv = form.querySelector('#pv');
  const ta = form.querySelector('[name="tresc"]');
  const upd = () => { pv.innerHTML = U.md(ta.value) || '<p class="muted">Brak treści.</p>'; };
  ta.addEventListener('input', upd); upd();
  form.querySelector('.st-filter')?.addEventListener('input', (e) => {
    const q = U.norm(e.target.value);
    form.querySelectorAll('.st-checks .chk').forEach((l) => { l.hidden = q && !l.dataset.name.includes(q) && !l.querySelector('input').checked; });
  });
  form.querySelectorAll('[data-plus]').forEach((b) => b.onclick = () => {
    const doI = form.querySelector('[name="do"]');
    const h = +b.dataset.plus;
    if (!h) { doI.value = ''; return; }
    const base = U.fromLocalInput(form.querySelector('[name="od"]').value) || new Date();
    doI.value = U.toLocalInput(new Date(base.getTime() + h * 3600e3));
    form.classList.add('dirty');
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const d = {
      tytul: String(fd.get('tytul') || '').trim(),
      typ: fd.get('typ'),
      waznosc: fd.get('waznosc') || 'srednia',
      od: U.fromLocalInput(fd.get('od')),
      do: U.fromLocalInput(fd.get('do')),
      linie: fd.getAll('linie'),
      stacje: fd.getAll('stacje'),
      tresc: String(fd.get('tresc') || '').trim(),
      objazd: objazd.get().map((x) => x.stacja),
      zakonczony: editing ? fd.get('zakonczony') === 'on' : false,
    };
    const errs = {};
    if (!d.tytul) errs.tytul = 'Tytuł jest wymagany.';
    if (!d.od) errs.od = 'Podaj datę i godzinę rozpoczęcia.';
    if (d.od && d.do && d.do < d.od) errs.do = 'Data „do” nie może być wcześniejsza niż „od”.';
    if (d.objazd.length === 1) errs.objazd = 'Trasa objazdowa musi mieć co najmniej 2 stacje (albo żadnej).';
    if (!setErrors(form, errs)) return;
    const now = new Date();
    await busy(form.querySelector('[type="submit"]'), async () => {
      try {
        if (editing) {
          await api.update('komunikaty', k.id, { ...d, zmieniono: now, zmienil: actor(), historia: [...(k.historia || []), histEntry(d.zakonczony && !k.zakonczony ? 'zakończono' : 'edytowano')] });
        } else {
          await api.add('komunikaty', { ...d, autor: actor(), utworzono: now, zmieniono: now, zmienil: actor(), historia: [histEntry(dup ? 'utworzono (kopia)' : 'utworzono')] });
        }
        form.classList.remove('dirty');
        toast(editing ? 'Zapisano zmiany' : 'Opublikowano komunikat');
        location.hash = '#/komunikaty';
      } catch (ex) { setErrors(form, { _: errMsg(ex) }); }
    });
  };
}

async function endKomunikat(id) {
  const k = byId('komunikaty', id);
  if (!k || !confirm(`Zakończyć komunikat „${k.tytul}”? Trafi do archiwum.`)) return;
  const now = new Date();
  try {
    await api.update('komunikaty', id, { zakonczony: true, do: !k.do || k.do > now ? now : k.do, zmieniono: now, zmienil: actor(), historia: [...(k.historia || []), histEntry('zakończono')] });
    toast('Komunikat zakończony');
  } catch (e) { toast(errMsg(e), 'bad'); }
}
async function delKomunikat(id) {
  const k = byId('komunikaty', id);
  if (!k || !confirm(`Usunąć na zawsze komunikat „${k.tytul}”?\n\nJeśli utrudnienie po prostu minęło, lepiej użyć „Zakończ” — zostanie w archiwum.`)) return;
  try {
    document.querySelector('form')?.classList.remove('dirty');
    await api.remove('komunikaty', id);
    toast('Usunięto komunikat');
    if (route().p === 'komunikat') location.hash = '#/komunikaty';
  } catch (e) { toast(errMsg(e), 'bad'); }
}

// ---------- LINIE ----------
function viewLinie() {
  const linie = [...state.linie].sort(U.byName);
  renderInto(app, `
  <div class="page-head"><h1>Linie</h1><a class="btn primary" href="#/linia/nowa">+ Nowa linia</a></div>
  ${linie.length ? `<div class="rows">${linie.map((l) => {
    const tr = (l.trasa || []).map((t) => byId('stacje', t.stacja)).filter(Boolean);
    return `<div class="row-item">
      <div class="ri-main"><div class="ri-badges">${U.lineChip(l)}<span class="pill ${l.status === 'czynna' ? 'ok' : l.status === 'zawieszona' ? 'bad' : 'info'}">${esc(U.LINIA_STATUS[l.status] || '')}</span><span class="muted small">${esc(U.LINIA_TYPY[l.typ] || '')}</span></div>
        <a class="ri-title" href="#/linia/${esc(l.id)}">${esc(l.opis || l.nazwa)}</a>
        <div class="muted small">${tr.map((s) => esc(s.nazwa)).join(' → ') || 'brak trasy'}</div></div>
      <div class="ri-actions"><a class="btn sm" href="#/linia/${esc(l.id)}">Edytuj</a></div></div>`; }).join('')}</div>`
    : `<p class="empty">Brak linii. ${state.stacje.length < 2 ? 'Najpierw dodaj co najmniej 2 stacje w zakładce <a href="#/stacje">Stacje</a>.' : ''}</p>`}`);
}

function formLinia(id) {
  const isNew = !id || id === 'nowa';
  const src = isNew ? null : byId('linie', id);
  if (!isNew && !src) { app.innerHTML = `<div class="card center"><h1>Nie znaleziono linii</h1><a class="btn" href="#/linie">Wróć</a></div>`; return; }
  const l = src || { nazwa: '', kolor: '#d62828', typ: 'osobowa', status: 'czynna', opis: '', trasa: [] };
  app.innerHTML = `
  <a class="back" href="#/linie">← Linie</a>
  <h1>${isNew ? 'Nowa linia' : 'Edycja linii'}</h1>
  <form class="card form" novalidate>
    <div class="form-errors" role="alert"></div>
    <div class="f-row">
      <label class="f">Numer / nazwa *<input name="nazwa" maxlength="40" value="${esc(l.nazwa)}" placeholder="np. S1">${err('nazwa')}</label>
      <label class="f narrow-f">Kolor<span class="color-row"><input type="color" name="kolor" value="${U.safeColor(l.kolor)}"><span id="chip-pv"></span></span></label>
    </div>
    <label class="f">Opis <span class="muted small">(np. „Centralna – Port Północny”)</span><input name="opis" maxlength="120" value="${esc(l.opis)}"></label>
    <div class="f-row">
      <label class="f">Typ<select name="typ">${U.options(U.LINIA_TYPY, l.typ)}</select></label>
      <label class="f">Status<select name="status">${U.options(U.LINIA_STATUS, l.status)}</select></label>
    </div>
    <fieldset class="f"><legend>Trasa * <span class="muted small">(kolejność przejazdu; przeciągnij lub użyj strzałek; czas przejazdu od poprzedniej stacji w min i s)</span></legend>
      <div id="trasa"></div>${err('trasa')}
      ${!state.stacje.length ? '<p class="muted small">Najpierw dodaj stacje w zakładce <a href="#/stacje">Stacje</a>.</p>' : ''}
    </fieldset>
    <div class="form-actions">
      <button class="btn primary" type="submit">${isNew ? 'Dodaj linię' : 'Zapisz zmiany'}</button>
      <a class="btn" href="#/linie">Anuluj</a>
      ${!isNew ? `<button class="btn danger push" type="button" id="del">Usuń linię</button>` : ''}
    </div>
  </form>`;
  const form = app.querySelector('form');
  trackDirty(form);
  const trasa = routeEditor(form.querySelector('#trasa'), l.trasa || [], { withTimes: true });
  const pvChip = () => { form.querySelector('#chip-pv').innerHTML = U.lineChip({ nazwa: form.nazwa.value || 'Linia', kolor: form.kolor.value }); };
  form.addEventListener('input', pvChip); pvChip();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = { nazwa: form.nazwa.value.trim(), kolor: U.safeColor(form.kolor.value), opis: form.opis.value.trim(), typ: form.typ.value, status: form.status.value, trasa: trasa.get() };
    const errs = {};
    if (!d.nazwa) errs.nazwa = 'Podaj numer lub nazwę linii.';
    else if (state.linie.some((x) => x.id !== src?.id && U.norm(x.nazwa) === U.norm(d.nazwa))) errs.nazwa = 'Linia o takiej nazwie już istnieje.';
    if (d.trasa.length < 2) errs.trasa = 'Trasa musi mieć co najmniej 2 stacje.';
    if (!setErrors(form, errs)) return;
    await busy(form.querySelector('[type="submit"]'), async () => {
      try {
        if (isNew) await api.add('linie', d); else await api.update('linie', src.id, d);
        form.classList.remove('dirty');
        toast(isNew ? 'Dodano linię' : 'Zapisano linię');
        location.hash = '#/linie';
      } catch (ex) { setErrors(form, { _: errMsg(ex) }); }
    });
  };
  form.querySelector('#del')?.addEventListener('click', async () => {
    const n = state.komunikaty.filter((k) => (k.linie || []).includes(src.id)).length;
    if (!confirm(`Usunąć linię ${src.nazwa}?${n ? `\n\nUwaga: ${n} komunikat(ów) odnosi się do tej linii — zostaną, ale bez tej linii.` : ''}`)) return;
    try { form.classList.remove('dirty'); await api.remove('linie', src.id); toast('Usunięto linię'); location.hash = '#/linie'; }
    catch (ex) { toast(errMsg(ex), 'bad'); }
  });
}

// ---------- STACJE ----------
function viewStacje() {
  const q = U.norm(sq);
  const st = [...state.stacje].sort(U.byName).filter((s) => !q || U.norm(s.nazwa + ' ' + s.kod).includes(q));
  renderInto(app, `
  <div class="page-head"><h1>Stacje</h1><a class="btn primary" href="#/stacja/nowa">+ Nowa stacja</a></div>
  <div class="filters card"><label class="grow">Szukaj<input id="sq" type="search" data-sq value="${esc(sq)}" placeholder="nazwa lub kod"></label></div>
  ${st.length ? `<div class="rows">${st.map((s) => {
    const ls = state.linie.filter((l) => (l.trasa || []).some((t) => t.stacja === s.id));
    return `<div class="row-item">
      <div class="ri-main"><div class="ri-badges"><span class="code">${esc(s.kod)}</span>${s.status !== 'czynna' ? `<span class="pill warn">${esc(U.STACJA_STATUS[s.status])}</span>` : ''}${ls.map((l) => U.lineChip(l)).join('')}</div>
        <a class="ri-title" href="#/stacja/${esc(s.id)}">${esc(s.nazwa)}</a>
        <div class="muted small mono">${esc(U.WYMIARY[s.wymiar] || '')} · ${U.coordsText(s) || 'bez koordynatów'}</div></div>
      <div class="ri-actions"><a class="btn sm" href="#/stacja/${esc(s.id)}">Edytuj</a></div></div>`; }).join('')}</div>` : '<p class="empty">Brak stacji.</p>'}`);
}

function formStacja(id) {
  const isNew = !id || id === 'nowa';
  const src = isNew ? null : byId('stacje', id);
  if (!isNew && !src) { app.innerHTML = `<div class="card center"><h1>Nie znaleziono stacji</h1><a class="btn" href="#/stacje">Wróć</a></div>`; return; }
  const s = src || { nazwa: '', kod: '', x: null, y: null, z: null, wymiar: 'overworld', status: 'czynna', opis: '' };
  app.innerHTML = `
  <a class="back" href="#/stacje">← Stacje</a>
  <h1>${isNew ? 'Nowa stacja' : 'Edycja stacji'}</h1>
  <form class="card form" novalidate>
    <div class="form-errors" role="alert"></div>
    <div class="f-row">
      <label class="f">Nazwa *<input name="nazwa" maxlength="60" value="${esc(s.nazwa)}" placeholder="np. Centralna">${err('nazwa')}</label>
      <label class="f narrow-f">Kod *<input name="kod" maxlength="5" value="${esc(s.kod)}" placeholder="CEN" class="upper">${err('kod')}</label>
    </div>
    <fieldset class="f"><legend>Koordynaty <span class="muted small">(opcjonalnie — wciśnij F3 w grze)</span></legend>
      <div class="f-row three">
        <label class="f">X<input name="x" type="number" step="any" value="${esc(s.x ?? '')}"></label>
        <label class="f">Y<input name="y" type="number" step="any" value="${esc(s.y ?? '')}"></label>
        <label class="f">Z<input name="z" type="number" step="any" value="${esc(s.z ?? '')}"></label>
      </div>${err('x')}${err('y')}${err('z')}
    </fieldset>
    <div class="f-row">
      <label class="f">Wymiar<select name="wymiar">${U.options(U.WYMIARY, s.wymiar)}</select></label>
      <label class="f">Status<select name="status">${U.options(U.STACJA_STATUS, s.status)}</select></label>
    </div>
    <label class="f">Opis<textarea name="opis" rows="3" maxlength="2000" placeholder="np. perony, przesiadki, co jest w okolicy">${esc(s.opis)}</textarea></label>
    <div class="form-actions">
      <button class="btn primary" type="submit">${isNew ? 'Dodaj stację' : 'Zapisz zmiany'}</button>
      <a class="btn" href="#/stacje">Anuluj</a>
      ${!isNew ? `<button class="btn danger push" type="button" id="del">Usuń stację</button>` : ''}
    </div>
  </form>`;
  const form = app.querySelector('form');
  trackDirty(form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    // Puste pole = brak koordynatu; ułamki zaokrąglamy do pełnych kratek.
    const num = (el) => (el.value.trim() === '' ? null : Math.round(Number(el.value)));
    const d = { nazwa: form.nazwa.value.trim(), kod: form.kod.value.trim().toUpperCase(), x: num(form.x), y: num(form.y), z: num(form.z), wymiar: form.wymiar.value, status: form.status.value, opis: form.opis.value.trim() };
    const errs = {};
    if (!d.nazwa) errs.nazwa = 'Podaj nazwę stacji.';
    if (!/^[A-Z0-9]{2,5}$/.test(d.kod)) errs.kod = 'Kod: 2–5 liter lub cyfr, np. CEN.';
    else if (state.stacje.some((x) => x.id !== src?.id && x.kod === d.kod)) errs.kod = `Kod ${d.kod} jest już zajęty.`;
    for (const k of ['x', 'y', 'z']) if (d[k] !== null && !Number.isFinite(d[k])) errs[k] = `${k.toUpperCase()} musi być liczbą.`;
    if (!setErrors(form, errs)) return;
    await busy(form.querySelector('[type="submit"]'), async () => {
      try {
        if (isNew) await api.add('stacje', d); else await api.update('stacje', src.id, d);
        form.classList.remove('dirty');
        toast(isNew ? 'Dodano stację' : 'Zapisano stację');
        location.hash = '#/stacje';
      } catch (ex) { setErrors(form, { _: errMsg(ex) }); }
    });
  };
  form.querySelector('#del')?.addEventListener('click', async () => {
    const used = state.linie.filter((l) => (l.trasa || []).some((t) => t.stacja === src.id));
    if (used.length) { alert(`Nie można usunąć — stacja jest na trasie linii: ${used.map((l) => l.nazwa).join(', ')}.\nNajpierw usuń ją z tych tras.`); return; }
    if (!confirm(`Usunąć stację ${src.nazwa}?`)) return;
    try { form.classList.remove('dirty'); await api.remove('stacje', src.id); toast('Usunięto stację'); location.hash = '#/stacje'; }
    catch (ex) { toast(errMsg(ex), 'bad'); }
  });
}

// ---------- UŻYTKOWNICY (admin) ----------
function viewUsers() {
  if (!isAdmin()) { app.innerHTML = `<div class="alert bad">Tylko administrator może zarządzać kontami.</div>`; return; }
  app.innerHTML = `
  <h1>Użytkownicy</h1>
  <div class="two-col">
    <section><h2 class="sec">Konta techników</h2><div id="users-list"></div></section>
    <section>
      <h2 class="sec">Dodaj technika</h2>
      <form class="card form" novalidate autocomplete="off">
        <div class="form-errors" role="alert"></div>
        <label class="f">Login *<input name="login" maxlength="30" placeholder="np. kacper" autocomplete="off">${err('login')}<span class="hint">Małe litery, cyfry, kropka, myślnik. Tym loginem technik będzie się logował.</span></label>
        <label class="f">Wyświetlana nazwa *<input name="nazwa" maxlength="40" placeholder="np. Kacper (nick w grze)">${err('nazwa')}</label>
        <label class="f">Hasło startowe *<input name="haslo" type="text" minlength="6" autocomplete="new-password">${err('haslo')}<span class="hint">Min. 6 znaków. Przekaż je technikowi — zmieni je w „Moje konto”.</span></label>
        <label class="f">Rola<select name="rola">${U.options(U.ROLE, 'technik')}</select></label>
        <div class="form-actions"><button class="btn primary" type="submit">Utwórz konto</button></div>
      </form>
    </section>
  </div>`;
  drawUsersList();
  const form = app.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = { login: form.login.value.trim().toLowerCase(), nazwa: form.nazwa.value.trim(), password: form.haslo.value, rola: form.rola.value };
    const errs = {};
    if (!/^[a-z0-9._-]{3,30}$/.test(d.login)) errs.login = 'Login: 3–30 znaków (a-z, 0-9, kropka, myślnik, podkreślnik).';
    else if (state.users.some((u) => u.login === d.login)) errs.login = 'Taki login już istnieje.';
    if (!d.nazwa) errs.nazwa = 'Podaj nazwę.';
    if (d.password.length < 6) errs.haslo = 'Hasło musi mieć co najmniej 6 znaków.';
    if (!setErrors(form, errs)) return;
    await busy(form.querySelector('[type="submit"]'), async () => {
      try { await api.createStaff(d); form.reset(); toast(`Utworzono konto ${d.login}`); }
      catch (ex) { setErrors(form, { _: errMsg(ex) }); }
    });
  };
}

function drawUsersList() {
  const el = document.getElementById('users-list');
  if (!el) return;
  if (!state.ready.users) { el.innerHTML = '<p class="loading">Ładowanie…</p>'; return; }
  const users = [...state.users].sort((a, b) => String(a.login).localeCompare(String(b.login)));
  el.innerHTML = `<div class="rows">${users.map((u) => {
    const me = u.id === state.uid;
    return `<div class="row-item${u.aktywny ? '' : ' off'}">
      <div class="ri-main"><div class="ri-badges"><span class="pill ${u.rola === 'admin' ? 'info' : 'ok'}">${esc(U.ROLE[u.rola] || u.rola)}</span>${u.aktywny ? '' : '<span class="pill bad">Wyłączone</span>'}${me ? '<span class="pill">To Ty</span>' : ''}</div>
        <b>${esc(u.nazwa)}</b> <span class="muted mono small">${esc(u.login)}</span></div>
      <div class="ri-actions">${me ? '' : `
        <button class="btn sm" data-act="role" data-id="${esc(u.id)}">${u.rola === 'admin' ? 'Zrób technikiem' : 'Zrób adminem'}</button>
        <button class="btn sm ${u.aktywny ? 'danger' : ''}" data-act="toggle" data-id="${esc(u.id)}">${u.aktywny ? 'Wyłącz' : 'Włącz'}</button>`}</div></div>`; }).join('')}</div>
    <p class="hint">Zapomniane hasło? Wyłącz stare konto i utwórz nowe z innym loginem (albo usuń użytkownika w Firebase Console → Authentication i utwórz go ponownie).</p>`;
}

async function userAction(act, id) {
  const u = state.users.find((x) => x.id === id);
  if (!u) return;
  try {
    if (act === 'toggle') {
      if (u.aktywny && !confirm(`Wyłączyć konto ${u.login}? Nie będzie mógł niczego zmieniać.`)) return;
      await api.update('users', id, { aktywny: !u.aktywny });
      toast(u.aktywny ? 'Wyłączono konto' : 'Włączono konto');
    } else if (act === 'role') {
      const rola = u.rola === 'admin' ? 'technik' : 'admin';
      if (!confirm(`Zmienić rolę ${u.login} na: ${U.ROLE[rola]}?`)) return;
      await api.update('users', id, { rola });
      toast('Zmieniono rolę');
    }
  } catch (e) { toast(errMsg(e), 'bad'); }
}

// ---------- MOJE KONTO ----------
function viewKonto() {
  const p = state.profile;
  app.innerHTML = `
  <h1>Moje konto</h1>
  <div class="two-col">
    <section class="card">
      <dl class="dl"><dt>Nazwa</dt><dd>${esc(p.nazwa)}</dd><dt>Login</dt><dd class="mono">${esc(p.login)}</dd><dt>Rola</dt><dd>${esc(U.ROLE[p.rola])}</dd></dl>
      <p class="muted small">Nazwę i rolę zmienia administrator.</p>
    </section>
    <form class="card form" novalidate>
      <h2 class="sec-s">Zmiana hasła</h2>
      <div class="form-errors" role="alert"></div>
      <label class="f">Obecne hasło<input name="old" type="password" autocomplete="current-password">${err('old')}</label>
      <label class="f">Nowe hasło<input name="nw" type="password" autocomplete="new-password">${err('nw')}</label>
      <label class="f">Powtórz nowe hasło<input name="nw2" type="password" autocomplete="new-password">${err('nw2')}</label>
      <div class="form-actions"><button class="btn primary" type="submit">Zmień hasło</button></div>
    </form>
  </div>`;
  const form = app.querySelector('form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (!form.old.value) errs.old = 'Podaj obecne hasło.';
    if (form.nw.value.length < 6) errs.nw = 'Nowe hasło: min. 6 znaków.';
    if (form.nw.value !== form.nw2.value) errs.nw2 = 'Hasła nie są takie same.';
    if (!setErrors(form, errs)) return;
    await busy(form.querySelector('[type="submit"]'), async () => {
      try { await api.changePassword(form.old.value, form.nw.value); form.reset(); toast('Hasło zmienione'); }
      catch (ex) { setErrors(form, { _: ex.code === 'auth/invalid-credential' || ex.code === 'auth/wrong-password' ? 'Obecne hasło jest nieprawidłowe.' : errMsg(ex) }); }
    });
  };
}

// ---------- przykładowe dane ----------
async function seed() {
  if (!confirm('Wgrać przykładowe stacje, linie i komunikaty?')) return;
  const s = seedData(actor());
  try {
    for (const col of ['stacje', 'linie', 'komunikaty']) for (const { id, ...rest } of s[col]) await api.set(col, id, rest);
    toast('Wgrano przykładowe dane');
  } catch (e) { toast(errMsg(e), 'bad'); }
}

// ---------- zdarzenia globalne ----------
app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab],[data-act]');
  if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; render(true); return; }
  const { act, id } = t.dataset;
  if (act === 'end') endKomunikat(id);
  if (act === 'del') delKomunikat(id);
  if (act === 'seed') seed();
  if (act === 'toggle' || act === 'role') userAction(act, id);
});
app.addEventListener('input', (e) => {
  if (e.target.dataset.pq !== undefined) { pq = e.target.value; render(true); }
  if (e.target.dataset.sq !== undefined) { sq = e.target.value; render(true); }
});

main().catch((e) => { app.innerHTML = `<div class="alert bad">${esc(errMsg(e))}</div>`; console.error(e); });
