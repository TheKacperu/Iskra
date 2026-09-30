// Strona publiczna: utrudnienia, linie, stacje, archiwum.
import { getApi, errMsg } from './api.js';
import { SITE_NAME } from './config.js';
import * as U from './util.js';
import { mountHeader, demoBanner, renderInto, route, copyText } from './common.js';

const { esc } = U;
const app = document.getElementById('app');
const state = { stacje: [], linie: [], komunikaty: [], ready: {}, error: null };
const f = { linia: '', typ: '', status: 'biezace', q: '' };
const af = { linia: '', q: '' };
let sq = '';

const byId = (col, id) => state[col].find((x) => x.id === id);
const L = (id) => U.lineChip(byId('linie', id), `#/linia/${id}`);
const S = (id) => U.stationChip(byId('stacje', id), `#/stacja/${id}`);
const withStatus = (now = new Date()) => state.komunikaty.map((k) => ({ ...k, _s: U.statusOf(k, now) }));

function sortCurrent(a, b) {
  if (a._s !== b._s) return a._s === 'aktywny' ? -1 : 1;
  if (a._s === 'aktywny') return U.rank(b.waznosc) - U.rank(a.waznosc) || (b.od || 0) - (a.od || 0);
  return (a.od || 0) - (b.od || 0);
}
const matchesQ = (k, q) => !q || U.norm(`${k.tytul} ${k.tresc}`).includes(U.norm(q));

// ---------- karta komunikatu ----------
function card(k, { full = false } = {}) {
  const t = U.TYPY[k.typ] || U.TYPY.informacja;
  const now = new Date();
  const kiedy = k._s === 'nadchodzacy'
    ? `Od <b>${U.fmt(k.od)}</b> <span class="muted">(${U.rel(k.od, now)})</span>`
    : `Od ${U.fmt(k.od)}`;
  const doKiedy = k.do
    ? `do <b>${U.fmt(k.do)}</b>${k._s !== 'zakonczony' ? ` <span class="muted">(${U.rel(k.do, now)})</span>` : ''}`
    : (k._s === 'zakonczony' ? '' : 'do odwołania');
  const chips = [...(k.linie || []).map(L), ...(k.stacje || []).map(S)].filter(Boolean).join('');
  const objazd = (k.objazd || []).map((id) => byId('stacje', id)).filter(Boolean);
  return `
  <article class="card kom sev-${esc(k.waznosc)} st-${k._s}">
    <div class="kom-top">
      <span class="badge typ">${t.icon} ${esc(t.label)}</span>
      <span class="badge s-${k._s}">${U.STATUS_K[k._s]}</span>
      <span class="sev-tag">${esc(U.WAZNOSC[k.waznosc]?.label || '')}</span>
    </div>
    <h3><a href="#/komunikat/${esc(k.id)}">${esc(k.tytul)}</a></h3>
    <div class="when">🕒 ${kiedy} ${doKiedy ? '· ' + doKiedy : ''}</div>
    ${chips ? `<div class="chips">${chips}</div>` : ''}
    <div class="md">${U.md(k.tresc)}</div>
    ${objazd.length ? `<div class="objazd"><span class="objazd-l">Trasa ${k.typ === 'objazd' ? 'objazdowa' : 'zastępcza'}:</span> ${objazd.map((s) => `<a href="#/stacja/${esc(s.id)}">${esc(s.nazwa)}</a>`).join(' <span class="arr">→</span> ')}</div>` : ''}
    <div class="kom-foot muted">Aktualizacja: ${U.fmt(k.zmieniono || k.utworzono)}${k.zmienil?.nazwa ? ` · ${esc(k.zmienil.nazwa)}` : ''}</div>
    ${full && (k.historia || []).length ? `<details class="hist"><summary>Historia zmian (${k.historia.length})</summary><ul>${k.historia.map((h) => `<li>${U.fmt(h.kiedy)} — ${esc(h.akcja)} · ${esc(h.nazwa)}</li>`).join('')}</ul></details>` : ''}
  </article>`;
}
const list = (arr, empty) => (arr.length ? `<div class="stack">${arr.map((k) => card(k)).join('')}</div>` : `<p class="empty">${empty}</p>`);

function lineState(l, active) {
  if (l.status === 'zawieszona') return ['bad', 'Zawieszona'];
  if (l.status === 'budowa') return ['info', 'W budowie'];
  const hits = active.filter((k) => (k.linie || []).includes(l.id));
  if (hits.some((k) => k.typ === 'zawieszenie' || k.waznosc === 'wysoka')) return ['bad', 'Poważne utrudnienia'];
  if (hits.length) return ['warn', 'Utrudnienia'];
  return ['ok', 'Bez utrudnień'];
}

// ---------- widoki ----------
function viewHome() {
  const all = withStatus();
  const active = all.filter((k) => k._s === 'aktywny');
  const upcoming = all.filter((k) => k._s === 'nadchodzacy');
  const linie = [...state.linie].sort(U.byName);
  const okLines = linie.filter((l) => lineState(l, active)[0] === 'ok').length;

  let cur = all.filter((k) => k._s !== 'zakonczony');
  if (f.status !== 'biezace') cur = cur.filter((k) => k._s === f.status);
  if (f.linia) cur = cur.filter((k) => (k.linie || []).includes(f.linia));
  if (f.typ) cur = cur.filter((k) => k.typ === f.typ);
  cur = cur.filter((k) => matchesQ(k, f.q)).sort(sortCurrent);
  const a = cur.filter((k) => k._s === 'aktywny'), n = cur.filter((k) => k._s === 'nadchodzacy');
  const filtered = f.linia || f.typ || f.q || f.status !== 'biezace';

  return `
  <section class="board">
    <div class="board-head"><span>Stan sieci ${esc(SITE_NAME)}</span><span class="clock" id="clock">${U.fmtTime(new Date())}</span></div>
    <div class="board-grid">
      <div class="stat ${active.length ? 'bad' : 'good'}"><b>${active.length}</b><span>aktywne utrudnienia</span></div>
      <div class="stat"><b>${upcoming.length}</b><span>zaplanowane zmiany</span></div>
      <div class="stat"><b>${okLines}/${linie.length}</b><span>linii bez utrudnień</span></div>
    </div>
  </section>

  ${linie.length ? `<section class="lines-strip">${linie.map((l) => { const [c, t] = lineState(l, active); return `<a class="ls-item" href="#/linia/${esc(l.id)}">${U.lineChip(l)}<span class="dot-s ${c}"></span><span class="ls-t">${t}</span></a>`; }).join('')}</section>` : ''}

  <section class="filters card">
    <label>Linia<select data-f="linia"><option value="">Wszystkie</option>${linie.map((l) => `<option value="${esc(l.id)}"${f.linia === l.id ? ' selected' : ''}>${esc(l.nazwa)}</option>`).join('')}</select></label>
    <label>Rodzaj<select data-f="typ">${U.options(U.TYPY, f.typ, { empty: 'Wszystkie' })}</select></label>
    <label>Status<select data-f="status">${U.options({ biezace: 'Aktywne i nadchodzące', aktywny: 'Tylko aktywne', nadchodzacy: 'Tylko nadchodzące' }, f.status)}</select></label>
    <label class="grow">Szukaj<input id="q" type="search" data-f="q" value="${esc(f.q)}" placeholder="np. most, Centralna…"></label>
    ${filtered ? `<button class="btn sm" data-clear>Wyczyść</button>` : ''}
  </section>

  ${f.status !== 'nadchodzacy' ? `<h2 class="sec">Aktywne <span class="count">${a.length}</span></h2>${list(a, filtered ? 'Brak aktywnych komunikatów dla wybranych filtrów.' : '✓ Ruch odbywa się bez utrudnień.')}` : ''}
  ${f.status !== 'aktywny' ? `<h2 class="sec">Nadchodzące <span class="count">${n.length}</span></h2>${list(n, 'Brak zaplanowanych zmian.')}` : ''}
  <p class="more"><a href="#/archiwum">Zobacz archiwum zakończonych komunikatów →</a></p>`;
}

function viewLinie() {
  const active = withStatus().filter((k) => k._s === 'aktywny');
  const linie = [...state.linie].sort(U.byName);
  return `<h1>Linie</h1>
  ${linie.length ? `<div class="grid">${linie.map((l) => {
    const tr = (l.trasa || []).map((t) => byId('stacje', t.stacja)).filter(Boolean);
    const [c, t] = lineState(l, active);
    return `<a class="card line-card" href="#/linia/${esc(l.id)}" style="--lc:${U.safeColor(l.kolor)}">
      <div class="lc-top">${U.lineChip(l)}<span class="muted small">${esc(U.LINIA_TYPY[l.typ] || '')}</span><span class="pill ${c}">${t}</span></div>
      <div class="lc-route">${tr.length ? `${esc(tr[0].nazwa)} <span class="arr">→</span> ${esc(tr[tr.length - 1].nazwa)}` : '<span class="muted">brak trasy</span>'}</div>
      <div class="muted small">${tr.length} ${tr.length === 1 ? 'stacja' : tr.length < 5 && tr.length > 1 ? 'stacje' : 'stacji'}${l.opis ? ' · ' + esc(l.opis) : ''}</div>
    </a>`; }).join('')}</div>` : '<p class="empty">Nie dodano jeszcze żadnych linii.</p>'}`;
}

function viewLinia(id) {
  const l = byId('linie', id);
  if (!l) return notFound('Nie ma takiej linii.');
  const all = withStatus();
  const mine = all.filter((k) => (k.linie || []).includes(id));
  const active = mine.filter((k) => k._s === 'aktywny');
  const hitSt = new Set(active.flatMap((k) => k.stacje || []));
  const wholeLine = active.filter((k) => !(k.stacje || []).length);
  const [c, t] = lineState(l, all.filter((k) => k._s === 'aktywny'));
  const trasa = (l.trasa || []).filter((x) => byId('stacje', x.stacja));
  const total = trasa.reduce((s, x, i) => s + (i > 0 && x.czas ? Number(x.czas) : 0), 0);
  const cur = mine.filter((k) => k._s !== 'zakonczony').sort(sortCurrent);
  const ended = mine.filter((k) => k._s === 'zakonczony').sort((a, b) => (b.do || b.od) - (a.do || a.od));

  return `
  <a class="back" href="#/linie">← Wszystkie linie</a>
  <header class="line-head" style="--lc:${U.safeColor(l.kolor)}">
    <div>${U.lineChip(l)} <span class="pill ${c}">${t}</span></div>
    <h1>${esc(l.opis || l.nazwa)}</h1>
    <p class="muted">${esc(U.LINIA_TYPY[l.typ] || '')} · ${trasa.length} stacji${U.fmtDur(total) ? ` · ok. ${U.fmtDur(total)} przejazdu` : ''}</p>
  </header>
  ${wholeLine.length ? `<div class="alert warn">⚠ Utrudnienia na całej linii: ${wholeLine.map((k) => `<a href="#/komunikat/${esc(k.id)}">${esc(k.tytul)}</a>`).join(', ')}</div>` : ''}
  <div class="two-col">
    <section class="card">
      <h2 class="sec-s">Trasa</h2>
      ${trasa.length ? `<ol class="schema" style="--lc:${U.safeColor(l.kolor)}">${trasa.map((x, i) => {
        const s = byId('stacje', x.stacja);
        const others = state.linie.filter((o) => o.id !== l.id && (o.trasa || []).some((t) => t.stacja === s.id));
        const hit = hitSt.has(s.id);
        const closed = s.status !== 'czynna';
        return `<li class="stop${hit ? ' hit' : ''}${closed ? ' closed' : ''}${x.nz ? ' nz' : ''}${i === 0 || i === trasa.length - 1 ? ' term' : ''}">
          <span class="dot"></span>
          <div class="stop-body">
            <div><a href="#/stacja/${esc(s.id)}" class="stop-name">${esc(s.nazwa)}</a> <span class="code">${esc(s.kod)}</span>
            ${i > 0 && U.fmtDur(x.czas) ? `<span class="muted small">+${U.fmtDur(x.czas)}</span>` : ''}</div>
            <div class="stop-extra">${x.nz ? '<span class="nz-tag" title="Pociąg zatrzymuje się tylko na żądanie">✋ na żądanie</span>' : ''}${hit ? '<span class="warn-tag">⚠ utrudnienia</span>' : ''}${closed ? `<span class="warn-tag grey">${esc(U.STACJA_STATUS[s.status])}</span>` : ''}${others.map((o) => U.lineChip(o, `#/linia/${o.id}`)).join('')}</div>
          </div></li>`; }).join('')}</ol>` : '<p class="empty">Trasa nie jest jeszcze ustalona.</p>'}
    </section>
    <section>
      <h2 class="sec">Komunikaty <span class="count">${cur.length}</span></h2>
      ${list(cur, '✓ Na tej linii nie ma utrudnień.')}
      ${ended.length ? `<details class="ended"><summary>Zakończone (${ended.length})</summary><div class="stack">${ended.slice(0, 20).map((k) => card(k)).join('')}</div></details>` : ''}
    </section>
  </div>`;
}

function viewStacje() {
  const q = U.norm(sq);
  const st = [...state.stacje].sort(U.byName).filter((s) => !q || U.norm(`${s.nazwa} ${s.kod}`).includes(q));
  return `<h1>Stacje</h1>
  <div class="filters card"><label class="grow">Szukaj stacji<input id="sq" type="search" data-sq value="${esc(sq)}" placeholder="nazwa lub kod"></label></div>
  ${st.length ? `<div class="grid">${st.map((s) => {
    const ls = state.linie.filter((l) => (l.trasa || []).some((t) => t.stacja === s.id)).sort(U.byName);
    return `<a class="card st-card" href="#/stacja/${esc(s.id)}">
      <div class="st-top"><b>${esc(s.nazwa)}</b> <span class="code">${esc(s.kod)}</span>${s.status !== 'czynna' ? `<span class="pill warn">${esc(U.STACJA_STATUS[s.status])}</span>` : ''}</div>
      <div class="muted small mono">${esc(U.WYMIARY[s.wymiar] || '')}${U.coordsText(s) ? ' · ' + U.coordsText(s) : ''}</div>
      <div class="chips">${ls.map((l) => U.lineChip(l)).join('')}</div></a>`; }).join('')}</div>` : '<p class="empty">Brak stacji.</p>'}`;
}

function viewStacja(id) {
  const s = byId('stacje', id);
  if (!s) return notFound('Nie ma takiej stacji.');
  const ls = state.linie.filter((l) => (l.trasa || []).some((t) => t.stacja === id)).sort(U.byName);
  const lids = new Set(ls.map((l) => l.id));
  const rel = withStatus().filter((k) => k._s !== 'zakonczony' &&
    ((k.stacje || []).includes(id) || (!(k.stacje || []).length && (k.linie || []).some((l) => lids.has(l))))).sort(sortCurrent);
  const [hx, hy, hz] = ['x', 'y', 'z'].map((k) => U.hasCoord(s[k]));
  const tp = hx && hy && hz ? `/tp ${s.x} ${s.y} ${s.z}` : '';
  let conv = '';
  if (hx && hz && s.wymiar === 'nether') conv = `W Overworldzie ≈ X ${Math.round(s.x * 8)}, Z ${Math.round(s.z * 8)}`;
  if (hx && hz && s.wymiar === 'overworld') conv = `W Netherze ≈ X ${Math.round(s.x / 8)}, Z ${Math.round(s.z / 8)}`;
  const coords = ['x', 'y', 'z'].filter((k) => U.hasCoord(s[k]));
  return `
  <a class="back" href="#/stacje">← Wszystkie stacje</a>
  <header class="st-head">
    <h1>${esc(s.nazwa)} <span class="code big">${esc(s.kod)}</span></h1>
    <p><span class="pill ${s.status === 'czynna' ? 'ok' : 'warn'}">${esc(U.STACJA_STATUS[s.status] || '')}</span> <span class="muted">${esc(U.WYMIARY[s.wymiar] || '')}</span></p>
  </header>
  <div class="two-col">
    <section class="card">
      <h2 class="sec-s">Położenie</h2>
      ${coords.length ? `<div class="coords mono">${coords.map((k) => `<span>${k.toUpperCase()} <b>${esc(s[k])}</b></span>`).join('')}</div>` : '<p class="muted">Koordynaty nie zostały podane.</p>'}
      ${tp ? `<button class="btn sm" data-copy="${esc(tp)}">📋 Kopiuj <code>${esc(tp)}</code></button>` : ''}
      ${conv ? `<p class="muted small">${conv}</p>` : ''}
      ${s.opis ? `<div class="md">${U.md(s.opis)}</div>` : ''}
      <h2 class="sec-s">Linie</h2>
      ${ls.length ? `<div class="chips">${ls.map((l) => {
        const nz = (l.trasa || []).some((t) => t.stacja === id && t.nz);
        return `<span class="st-line">${U.lineChip(l, `#/linia/${l.id}`)}${nz ? '<span class="nz-tag">✋ na żądanie</span>' : ''}</span>`;
      }).join('')}</div>` : '<p class="muted">Żadna linia nie zatrzymuje się tu.</p>'}
    </section>
    <section>
      <h2 class="sec">Komunikaty <span class="count">${rel.length}</span></h2>
      ${list(rel, '✓ Brak utrudnień dotyczących tej stacji.')}
    </section>
  </div>`;
}

function viewArchiwum() {
  const q = af.q;
  let ended = withStatus().filter((k) => k._s === 'zakonczony');
  if (af.linia) ended = ended.filter((k) => (k.linie || []).includes(af.linia));
  ended = ended.filter((k) => matchesQ(k, q)).sort((a, b) => (b.do || b.od) - (a.do || a.od));
  return `<h1>Archiwum</h1>
  <div class="filters card">
    <label>Linia<select data-af="linia"><option value="">Wszystkie</option>${[...state.linie].sort(U.byName).map((l) => `<option value="${esc(l.id)}"${af.linia === l.id ? ' selected' : ''}>${esc(l.nazwa)}</option>`).join('')}</select></label>
    <label class="grow">Szukaj<input id="aq" type="search" data-af="q" value="${esc(q)}"></label>
  </div>
  ${list(ended, 'Brak zakończonych komunikatów.')}`;
}

function viewKomunikat(id) {
  const k = withStatus().find((x) => x.id === id);
  if (!k) return notFound('Ten komunikat nie istnieje lub został usunięty.');
  return `<a class="back" href="#/">← Wszystkie utrudnienia</a>${card(k, { full: true })}`;
}

const notFound = (msg) => `<div class="card center"><h1>Nie znaleziono</h1><p>${msg}</p><a class="btn" href="#/">Strona główna</a></div>`;

// ---------- render ----------
function render() {
  if (state.error) { app.innerHTML = `<div class="alert bad">Nie udało się wczytać danych. ${esc(errMsg(state.error))}</div>`; return; }
  if (!['stacje', 'linie', 'komunikaty'].every((c) => state.ready[c])) { app.innerHTML = '<p class="loading">Ładowanie…</p>'; return; }
  const { p, id } = route();
  const views = { '': viewHome, linie: viewLinie, linia: () => viewLinia(id), stacje: viewStacje, stacja: () => viewStacja(id), archiwum: viewArchiwum, komunikat: () => viewKomunikat(id) };
  renderInto(app, (views[p] || (() => notFound('Nie ma takiej strony.')))());
}

app.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.f !== undefined) { f[t.dataset.f] = t.value; render(); }
  else if (t.dataset.af !== undefined) { af[t.dataset.af] = t.value; render(); }
  else if (t.dataset.sq !== undefined) { sq = t.value; render(); }
});
app.addEventListener('click', (e) => {
  const c = e.target.closest('[data-copy]');
  if (c) copyText(c.dataset.copy);
  if (e.target.closest('[data-clear]')) { Object.assign(f, { linia: '', typ: '', status: 'biezace', q: '' }); render(); }
});

async function main() {
  document.title = `${SITE_NAME} — utrudnienia i zmiany w ruchu`;
  mountHeader('public');
  const api = await getApi();
  demoBanner(api);
  for (const col of ['stacje', 'linie', 'komunikaty']) {
    api.subscribe(col, (docs) => { state[col] = docs; state.ready[col] = true; render(); }, (err) => { state.error = err; render(); });
  }
  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
  // Zegar co 15 s, pełne odświeżenie co minutę (statusy zmieniają się z upływem czasu).
  setInterval(() => { const c = document.getElementById('clock'); if (c) c.textContent = U.fmtTime(new Date()); }, 15000);
  setInterval(render, 60000);
}
main().catch((e) => { app.innerHTML = `<div class="alert bad">${esc(errMsg(e))}</div>`; console.error(e); });
