// Strona publiczna: utrudnienia, linie, stacje, archiwum.
import { getApi, errMsg } from './api.js';
import { SITE_NAME } from './config.js';
import * as U from './util.js';
import { mountHeader, demoBanner, renderInto, route, copyText, toast } from './common.js';
import { mapLayout, mapSvg, mapFileSvg, svgToPng, resetMapCache } from './map.js';

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
  const sd = U.segDims(trasa, (sid) => byId('stacje', sid));
  const dimList = [...new Set(sd.dims.filter(Boolean))];
  const multiDim = dimList.some((d) => d !== 'overworld');
  const cur = mine.filter((k) => k._s !== 'zakonczony').sort(sortCurrent);
  const ended = mine.filter((k) => k._s === 'zakonczony').sort((a, b) => (b.do || b.od) - (a.do || a.od));

  return `
  <a class="back" href="#/linie">← Wszystkie linie</a>
  <header class="line-head" style="--lc:${U.safeColor(l.kolor)}">
    <div>${U.lineChip(l)} <span class="pill ${c}">${t}</span> ${trasa.length > 1 ? `<a class="btn xs" href="#/mapa/${esc(l.id)}">🗺 Pokaż na mapie</a>` : ''}</div>
    <h1>${esc(l.opis || l.nazwa)}</h1>
    <p class="muted">${esc(U.LINIA_TYPY[l.typ] || '')} · ${trasa.length} stacji${U.fmtDur(total) ? ` · ok. ${U.fmtDur(total)} przejazdu` : ''}${multiDim ? ` · przez ${dimList.map((d) => `${U.DIM_ICON[d]} ${U.WYMIARY[d]}`).join(', ')}` : ''}</p>
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
        // Wymiar przyjazdu (odcinek i) i odjazdu (odcinek i+1). Różne = pociąg przechodzi przez portal na tej stacji.
        const arr = sd.dims[i], dep = sd.dims[i + 1];
        const dW = (d) => `${U.DIM_ICON[d]} ${U.WYMIARY[d]}`;
        let dimTag = '';
        if (arr && dep && arr !== dep) dimTag = `<span class="dim-b portal" title="Pociąg przechodzi tu przez portal">🌀 przejście przez portal: ${dW(arr)} → ${dW(dep)}</span>`;
        else if (s.portal && (dep || arr)) dimTag = `<span class="dim-b portal" title="Stacja portalowa (${esc(U.dimsLabel(s))}) — linia korzysta z tej strony">🌀 peron: ${dW(dep || arr)}</span>`;
        else if (multiDim) dimTag = `<span class="dim-b">${dW(dep || arr || s.wymiar)}</span>`;
        const segCls = multiDim && dep ? ` seg-${dep}` : '';
        return `<li class="stop${hit ? ' hit' : ''}${closed ? ' closed' : ''}${x.nz ? ' nz' : ''}${i === 0 || i === trasa.length - 1 ? ' term' : ''}${segCls}">
          <span class="dot"></span>
          <div class="stop-body">
            <div><a href="#/stacja/${esc(s.id)}" class="stop-name">${esc(s.nazwa)}</a> <span class="code">${esc(s.kod)}</span>
            ${i > 0 && U.fmtDur(x.czas) ? `<span class="muted small">+${U.fmtDur(x.czas)}</span>` : ''}</div>
            <div class="stop-extra">${dimTag}${x.nz ? '<span class="nz-tag" title="Pociąg zatrzymuje się tylko na żądanie">✋ na żądanie</span>' : ''}${hit ? '<span class="warn-tag">⚠ utrudnienia</span>' : ''}${closed ? `<span class="warn-tag grey">${esc(U.STACJA_STATUS[s.status])}</span>` : ''}${others.map((o) => U.lineChip(o, `#/linia/${o.id}`)).join('')}</div>
          </div></li>`; }).join('')}</ol>
      ${multiDim ? '<p class="muted small schema-legend">Linia ciągła — Overworld, przerywana — Nether/End.</p>' : ''}` : '<p class="empty">Trasa nie jest jeszcze ustalona.</p>'}
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
      ${s.portal && s.wymiar2 ? `<div class="muted small mono">🌀 ${esc(U.WYMIARY[s.wymiar2] || '')}${U.coordsText(U.side2(s)) ? ' · ' + U.coordsText(U.side2(s)) : ''}</div>` : ''}
      <div class="chips">${ls.map((l) => U.lineChip(l)).join('')}</div></a>`; }).join('')}</div>` : '<p class="empty">Brak stacji.</p>'}`;
}

function viewStacja(id) {
  const s = byId('stacje', id);
  if (!s) return notFound('Nie ma takiej stacji.');
  const ls = state.linie.filter((l) => (l.trasa || []).some((t) => t.stacja === id)).sort(U.byName);
  const lids = new Set(ls.map((l) => l.id));
  const rel = withStatus().filter((k) => k._s !== 'zakonczony' &&
    ((k.stacje || []).includes(id) || (!(k.stacje || []).length && (k.linie || []).some((l) => lids.has(l))))).sort(sortCurrent);
  // Jedna lokalizacja (albo dwie dla stacji portalowej): koordynaty, komenda teleportu, przeliczenie Nether/Overworld.
  const locBlock = (loc, title) => {
    const coords = ['x', 'y', 'z'].filter((k) => U.hasCoord(loc[k]));
    const tp = U.tpCommand(loc);
    let conv = '';
    if (!s.portal && U.hasCoord(loc.x) && U.hasCoord(loc.z)) {
      if (loc.wymiar === 'nether') conv = `W Overworldzie ≈ X ${Math.round(loc.x * 8)}, Z ${Math.round(loc.z * 8)}`;
      if (loc.wymiar === 'overworld') conv = `W Netherze ≈ X ${Math.round(loc.x / 8)}, Z ${Math.round(loc.z / 8)}`;
    }
    return `<div class="loc">
      ${title ? `<h3 class="loc-t">${U.DIM_ICON[loc.wymiar] || ''} ${esc(U.WYMIARY[loc.wymiar] || '')}</h3>` : ''}
      ${coords.length ? `<div class="coords mono">${coords.map((k) => `<span>${k.toUpperCase()} <b>${esc(loc[k])}</b></span>`).join('')}</div>` : '<p class="muted">Koordynaty nie zostały podane.</p>'}
      ${tp ? `<button class="btn sm" data-copy="${esc(tp)}" title="${esc(tp)}">📋 Kopiuj komendę teleportu</button>` : ''}
      ${conv ? `<p class="muted small">${conv}</p>` : ''}
    </div>`;
  };
  return `
  <a class="back" href="#/stacje">← Wszystkie stacje</a>
  <header class="st-head">
    <h1>${esc(s.nazwa)} <span class="code big">${esc(s.kod)}</span></h1>
    <p><span class="pill ${s.status === 'czynna' ? 'ok' : 'warn'}">${esc(U.STACJA_STATUS[s.status] || '')}</span> ${s.portal ? '<span class="dim-b portal">🌀 stacja portalowa</span>' : ''} <span class="muted">${esc(U.dimsLabel(s))}</span></p>
  </header>
  <div class="two-col">
    <section class="card">
      <h2 class="sec-s">Położenie</h2>
      ${s.portal && s.wymiar2 ? `<div class="locs">${locBlock(s, true)}${locBlock(U.side2(s), true)}</div>` : locBlock(s, false)}
      ${s.opis ? `<div class="md">${U.md(s.opis)}</div>` : ''}
      <h2 class="sec-s">Linie</h2>
      ${ls.length ? `<div class="chips">${ls.map((l) => {
        const nz = (l.trasa || []).some((t) => t.stacja === id && t.nz);
        return `<span class="st-line">${U.lineChip(l, `#/linia/${l.id}`)}${nz ? '<span class="nz-tag">✋ na żądanie</span>' : ''}</span>`;
      }).join('')}</div>` : '<p class="muted">Żadna linia nie zatrzymuje się tu.</p>'}
      ${ls.length && s.status !== 'zamknieta' ? `<p><a class="btn sm" href="#/polaczenia/${esc(id)}~">🔎 Szukaj połączenia z tej stacji</a></p>` : ''}
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

// ---------- wyszukiwarka połączeń ----------
// Szukamy tras jako ciągu „odcinków” (jazda jedną linią od stacji A do B) z maks. 3 przesiadkami.
// Linie jeżdżą w obie strony. Czas = suma wpisanych czasów odcinków; brakujące liczymy szacunkowo tylko do sortowania.
// Czasy przesiadek wpisuje odwiedzający (w sekundach) i zapamiętujemy je w jego przeglądarce.
const XFER_KEYS = { xfer: 'iskra-xfer-s', xferP: 'iskra-xferp-s' };
const XFER_DEF = { xfer: 5, xferP: 15 };
const loadPref = (k) => { try { return localStorage.getItem(XFER_KEYS[k]); } catch (e) { return null; } };
const pf = { from: '', to: '', all: false, sort: 'czas', xfer: loadPref('xfer') ?? String(XFER_DEF.xfer), xferP: loadPref('xferP') ?? String(XFER_DEF.xferP) };
const EST_SEG = 2;       // min — szacunek dla odcinka bez wpisanego czasu (tylko do sortowania)
// Czas przesiadki w minutach: zwykła (zmiana peronu, domyślnie 5 s) albo przez portal (zmiana wymiaru, domyślnie 15 s).
const prefMin = (k) => { const v = parseFloat(String(pf[k]).replace(',', '.')); return (Number.isFinite(v) && v >= 0 ? v : XFER_DEF[k]) / 60; };
const xferMin = () => prefMin('xfer');
const xferPortalMin = () => prefMin('xferP');
// Przesiadka przez portal = przyjazd w innym wymiarze niż odjazd kolejnej linii.
const isPortalXfer = (a, b) => !!(a && b && a.dims.length && b.dims.length && a.dims[a.dims.length - 1] !== b.dims[0]);
const MAX_XFER = 3;

function legInfo(tr, i, j) {
  const [a, b] = i < j ? [i, j] : [j, i];
  let sum = 0, unknown = 0;
  for (let k = a + 1; k <= b; k++) {
    const c = Number(tr[k].czas);
    if (tr[k].czas != null && Number.isFinite(c) && c > 0) sum += c; else unknown++;
  }
  const idx = [];
  for (let k = i; k !== j + Math.sign(j - i); k += Math.sign(j - i)) idx.push(k);
  return { sum, unknown, idx };
}

function findConnections(from, to) {
  const st = (id) => byId('stacje', id);
  const lines = state.linie
    .filter((l) => pf.all || l.status === 'czynna')
    .map((l) => ({ l, tr: (l.trasa || []).filter((t) => st(t.stacja)) }));
  const found = [];
  const dfs = (at, legs, visited, used) => {
    if (found.length > 500 || legs.length > MAX_XFER) return;
    for (const { l, tr } of lines) {
      if (used.has(l.id)) continue;
      tr.forEach((t, i) => {
        if (t.stacja !== at) return;
        for (const dir of [1, -1]) {
          const passed = [];
          for (let j = i + dir; j >= 0 && j < tr.length; j += dir) {
            const sid = tr[j].stacja;
            if (visited.has(sid)) break;
            passed.push(sid);
            const leg = { l, tr, i, j, dir };
            if (sid === to) { if (st(sid).status !== 'zamknieta') found.push([...legs, leg]); break; }
            if (st(sid).status === 'zamknieta') continue;   // przez zamkniętą stację się przejeżdża, ale nie przesiada
            dfs(sid, [...legs, leg], new Set([...visited, ...passed]), new Set([...used, l.id]));
          }
        }
      });
    }
  };
  if (from && to && from !== to) dfs(from, [], new Set([from]), new Set());

  const now = new Date();
  const active = withStatus(now).filter((k) => k._s === 'aktywny');
  const best = new Map();
  for (const legs of found) {
    const L = legs.map((g) => {
      const info = legInfo(g.tr, g.i, g.j);
      // Wymiary, przez które jedzie ten odcinek (segment k = z k-1 do k).
      const sd = U.segDims(g.tr, (sid) => byId('stacje', sid));
      // Kolejne wymiary bez powtórzeń obok siebie, np. Overworld → Nether → Overworld.
      const dims = info.idx.slice(1).map((k, n) => sd.dims[Math.max(k, info.idx[n])]).filter((d, n, a) => d && d !== a[n - 1]);
      return { ...g, ...info, dims };
    });
    const sum = L.reduce((s, g) => s + g.sum, 0);
    const unknown = L.reduce((s, g) => s + g.unknown, 0);
    const xfers = L.length - 1;
    const portalXfers = L.slice(1).filter((g, n) => isPortalXfer(L[n], g)).length;
    const xferTime = (xfers - portalXfers) * xferMin() + portalXfers * xferPortalMin();
    const est = sum + unknown * EST_SEG + xferTime;
    const stops = L.reduce((s, g) => s + g.idx.length - 1, 0);
    L.forEach((g) => {
      const ids = new Set(g.idx.map((k) => g.tr[k].stacja));
      g.alerts = active.filter((k) => {
        const onLine = (k.linie || []).includes(g.l.id);
        const onSt = (k.stacje || []).some((s) => ids.has(s));
        return (onLine && (!(k.stacje || []).length || onSt)) || (!(k.linie || []).length && onSt);
      });
    });
    const c = { legs: L, sum, unknown, xfers, portalXfers, xferTime, est, stops };
    // Z tras jadących tymi samymi liniami w tej samej kolejności zostawiamy najlepszą.
    const key = L.map((g) => g.l.id).join('>');
    if (!best.has(key) || best.get(key).est > est) best.set(key, c);
  }
  const res = [...best.values()];
  const byTime = (a, b) => a.est - b.est || a.xfers - b.xfers;
  const byXfer = (a, b) => a.xfers - b.xfers || a.est - b.est;
  res.sort(pf.sort === 'przesiadki' ? byXfer : byTime);
  const fastest = [...res].sort(byTime)[0];
  return { list: res.slice(0, 6), fastest, total: res.length };
}

function timeLabel(c) {
  const t = c.sum + c.xferTime;
  if (!c.sum) return 'czas nieznany';
  return `${c.unknown ? 'min.' : 'ok.'} ${U.fmtDur(t)}`;
}

function connCard(c, isFastest) {
  const stationName = (id) => esc(byId('stacje', id)?.nazwa || '?');
  const suspended = c.legs.some((g) => g.alerts.some((k) => k.typ === 'zawieszenie'));
  const legsHtml = c.legs.map((g, n) => {
    const fromId = g.tr[g.i].stacja, toId = g.tr[g.j].stacja;
    const term = g.dir > 0 ? g.tr[g.tr.length - 1] : g.tr[0];
    const mid = g.idx.slice(1, -1);
    const legT = g.unknown ? (g.sum ? `min. ${U.fmtDur(g.sum)}` : '? min') : U.fmtDur(g.sum) || '—';
    const prev = c.legs[n - 1];
    const dimChange = n > 0 && isPortalXfer(prev, g);
    const xt = U.fmtDur(dimChange ? xferPortalMin() : xferMin());
    return `${n > 0 ? `<li class="xfer">🔁 Przesiadka: <b>${stationName(fromId)}</b>${dimChange ? ` <span class="dim-b portal">🌀 przez portal do: ${U.WYMIARY[g.dims[0]]}</span>` : ''} ${xt ? `<span class="small">· ${xt}</span>` : ''}</li>` : ''}
    <li class="leg" style="--lc:${U.safeColor(g.l.kolor)}">
      <div class="leg-top">${U.lineChip(g.l, `#/linia/${g.l.id}`)}<span class="muted small">kierunek ${stationName(term.stacja)}</span>${g.dims.length > 1 || g.dims.some((d) => d !== 'overworld') ? `<span class="dim-b">${g.dims.map((d) => `${U.DIM_ICON[d]} ${U.WYMIARY[d]}`).join(' → ')}</span>` : ''}<span class="leg-t">${legT}</span></div>
      <div class="leg-st"><a href="#/stacja/${esc(fromId)}">${stationName(fromId)}</a> <span class="arr">→</span> <a href="#/stacja/${esc(toId)}">${stationName(toId)}</a>${g.tr[g.j].nz ? ' <span class="nz-tag">✋ na żądanie</span>' : ''}</div>
      ${mid.length ? `<details class="leg-stops"><summary>${mid.length} ${U.plural(mid.length, 'stacja', 'stacje', 'stacji')} po drodze</summary><ul>${mid.map((k) => `<li>${stationName(g.tr[k].stacja)}${g.tr[k].nz ? ' <span class="nz-tag">✋ na żądanie</span>' : ''}${U.fmtDur(g.tr[k].czas) ? ` <span class="muted small">+${U.fmtDur(g.tr[k].czas)}</span>` : ''}</li>`).join('')}</ul></details>` : ''}
      ${g.alerts.map((k) => `<a class="leg-alert sev-${esc(k.waznosc)}" href="#/komunikat/${esc(k.id)}">${(U.TYPY[k.typ] || U.TYPY.informacja).icon} ${esc(k.tytul)}</a>`).join('')}
    </li>`;
  }).join('');
  return `<article class="card conn${suspended ? ' conn-bad' : ''}">
    <div class="conn-head">
      <span class="conn-time">${timeLabel(c)}</span>
      <span class="muted">${c.xfers ? `${c.xfers} ${U.plural(c.xfers, 'przesiadka', 'przesiadki', 'przesiadek')}` : 'bez przesiadek'} · ${c.stops} ${U.plural(c.stops, 'odcinek', 'odcinki', 'odcinków')}</span>
      ${isFastest ? '<span class="pill ok">Najszybsze</span>' : ''}
      ${suspended ? '<span class="pill bad">Zawieszone kursy na trasie</span>' : c.legs.some((g) => g.alerts.length) ? '<span class="pill warn">Utrudnienia na trasie</span>' : ''}
    </div>
    ${c.unknown && c.sum ? `<p class="muted small conn-note">Dla ${c.unknown} ${U.plural(c.unknown, 'odcinka', 'odcinków', 'odcinków')} nie wpisano czasu przejazdu.</p>` : ''}
    <ol class="legs">${legsHtml}</ol>
  </article>`;
}

function viewPolaczenia(param) {
  if (param !== null && param !== undefined) {
    const [a = '', b = ''] = param.split('~');
    pf.from = byId('stacje', a) ? a : '';
    pf.to = byId('stacje', b) ? b : '';
  }
  const stacje = [...state.stacje].sort(U.byName);
  const opts = (sel) => `<option value="">— wybierz stację —</option>` + stacje.map((s) => `<option value="${esc(s.id)}"${s.id === sel ? ' selected' : ''}${s.status === 'zamknieta' ? ' disabled' : ''}>${esc(s.nazwa)} (${esc(s.kod)})${s.status === 'zamknieta' ? ' — zamknięta' : ''}</option>`).join('');
  let out = '';
  if (pf.from && pf.to && pf.from === pf.to) out = '<p class="empty">Wybierz dwie różne stacje.</p>';
  else if (pf.from && pf.to) {
    const r = findConnections(pf.from, pf.to);
    out = r.list.length
      ? `<p class="muted small">Znaleziono ${r.total} ${U.plural(r.total, 'połączenie', 'połączenia', 'połączeń')}${r.total > r.list.length ? `, pokazuję ${r.list.length} najlepszych` : ''}. Czas trasy to suma czasów przejazdu wpisanych dla odcinków plus czas przesiadek: ${U.fmtDur(xferMin()) || '0 s'} na zmianę peronu, ${U.fmtDur(xferPortalMin()) || '0 s'} przez portal (bez czekania na pociąg).</p>
         <div class="stack">${r.list.map((c) => connCard(c, r.total > 1 && c === r.fastest && !c.unknown)).join('')}</div>`
      : `<p class="empty">Brak połączenia między tymi stacjami${pf.all ? '' : ' (pomijam linie zawieszone i w budowie — zaznacz opcję powyżej, żeby je uwzględnić)'}.</p>`;
  } else out = '<p class="empty">Wybierz stację początkową i docelową.</p>';

  return `<h1>Wyszukiwarka połączeń</h1>
  <section class="card conn-search">
    <label>Skąd<select id="pf-from" data-pf="from">${opts(pf.from)}</select></label>
    <button class="btn icon swap" data-swap title="Zamień stacje" aria-label="Zamień stacje">⇅</button>
    <label>Dokąd<select id="pf-to" data-pf="to">${opts(pf.to)}</select></label>
    <div class="conn-opts">
      <div class="seg seg-sm" role="group" aria-label="Sortowanie">
        <button class="seg-b${pf.sort === 'czas' ? ' on' : ''}" data-sort="czas">Najszybsze</button>
        <button class="seg-b${pf.sort === 'przesiadki' ? ' on' : ''}" data-sort="przesiadki">Najmniej przesiadek</button>
      </div>
      <label class="xfer-in small" title="Przesiadka na tej samej stacji, w tym samym wymiarze">🔁 Przesiadka <input type="number" id="pf-xfer" data-pf="xfer" min="0" step="1" value="${esc(pf.xfer)}" aria-label="Czas zwykłej przesiadki w sekundach"> s</label>
      <label class="xfer-in small" title="Przesiadka ze zmianą wymiaru, np. z Netheru do Overworldu">🌀 Przez portal <input type="number" id="pf-xferp" data-pf="xferP" min="0" step="1" value="${esc(pf.xferP)}" aria-label="Czas przesiadki przez portal w sekundach"> s</label>
      <label class="chk-line small"><input type="checkbox" id="pf-all" data-pf="all"${pf.all ? ' checked' : ''}> Uwzględnij linie zawieszone i w budowie</label>
    </div>
  </section>
  ${out}`;
}

function setConnHash() {
  history.replaceState(null, '', `#/polaczenia/${encodeURIComponent(pf.from)}~${encodeURIComponent(pf.to)}`);
}

// ---------- mapa sieci ----------
// Schemat liczy się sam z tras linii (js/map.js). Tu tylko widok: przybliżanie, przesuwanie, wyróżnienie linii.
const mp = { focus: '', view: null, key: '', full: false };

// Pełny ekran: mapa zakrywa całe okno (klasa .map-full przetrwa odświeżanie widoku co minutę),
// a tam, gdzie przeglądarka pozwala, dodatkowo chowamy paski przeglądarki (Fullscreen API).
function setFull(on) {
  if (mp.full === on) return;
  mp.full = on;
  document.body.classList.toggle('map-open', on);
  try {
    if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  } catch (e) {}
  render();
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && mp.full) setFull(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && mp.full) setFull(false); });
window.addEventListener('hashchange', () => { if (mp.full && route().p !== 'mapa') setFull(false); });

function currentMap() {
  const lay = mapLayout(state.stacje, state.linie);
  if (lay.key !== mp.key) { mp.key = lay.key; mp.view = null; }
  return lay;
}

function viewMapa(id) {
  mp.focus = id && byId('linie', id) ? id : '';
  const lay = currentMap();
  if (!lay.lines.length) return `<h1>Mapa sieci</h1><p class="empty">Mapa pojawi się, gdy dodasz linię z trasą (co najmniej dwie stacje).</p>`;
  const active = withStatus().filter((k) => k._s === 'aktywny');
  const hit = new Set(active.flatMap((k) => k.stacje || []));
  const linie = lay.lines.map((x) => byId('linie', x.id)).filter(Boolean);
  const any = (fn) => lay.lines.some(fn);
  const key = (svg, label) => `<span class="mk"><svg viewBox="0 0 34 16" width="34" height="16" aria-hidden="true">${svg}</svg>${label}</span>`;
  const keys = [
    key('<rect class="m-st ic" x="10" y="2" width="14" height="12" rx="6"/>', 'przesiadka'),
    any((l) => l.pieces.some((p) => p.alt)) && key('<path class="m-trk alt" d="M2 8H32" stroke="var(--muted)"/>', 'odcinek w Netherze/Endzie'),
    any((l) => l.status === 'budowa') && key('<path class="m-trk" d="M2 8H32" stroke="var(--muted)"/><path class="m-hollow" d="M2 8H32"/>', 'linia w budowie'),
    any((l) => l.status === 'zawieszona') && key('<g class="m-susp"><path class="m-trk" d="M2 8H32" stroke="var(--muted)"/></g>', 'linia zawieszona'),
    lay.stations.some((s) => s.portal) && key('<rect class="m-portal" x="9" y="1" width="16" height="14" rx="7"/><circle class="m-st dot" cx="17" cy="8" r="4" stroke="var(--muted)"/>', 'stacja portalowa'),
    hit.size && key('<circle class="m-st dot hit" cx="17" cy="8" r="4.5"/>', 'utrudnienia na stacji'),
  ].filter(Boolean);
  return `
  <div class="map-head">
    <h1>Mapa sieci</h1>
    <div class="map-dl"><button class="btn sm" data-mdl="png">⬇ PNG</button><button class="btn sm" data-mdl="svg">⬇ SVG</button></div>
  </div>
  <p class="muted small map-note">Schemat układa się sam z tras linii: północ jest u góry, odcinki biegną poziomo i pionowo. Kliknij stację, żeby zobaczyć szczegóły. Przybliżanie kółkiem myszy albo dwoma palcami.</p>
  <section class="map-box${mp.full ? ' map-full' : ''}" style="aspect-ratio:${Math.round(lay.bounds.w)} / ${Math.round(lay.bounds.h)}">
    ${mapSvg(lay, { focus: mp.focus, hit, view: mp.view })}
    <div class="map-zoom">
      <button class="btn icon" data-mz="full" title="${mp.full ? 'Zamknij pełny ekran (Esc)' : 'Pełny ekran'}" aria-label="${mp.full ? 'Zamknij pełny ekran' : 'Powiększ mapę na cały ekran'}" aria-pressed="${mp.full}">${mp.full ? '✕' : '⛶'}</button>
      <button class="btn icon" data-mz="in" title="Przybliż" aria-label="Przybliż">+</button>
      <button class="btn icon" data-mz="out" title="Oddal" aria-label="Oddal">−</button>
      <button class="btn icon" data-mz="fit" title="Cała sieć" aria-label="Pokaż całą sieć">⤢</button>
    </div>
  </section>
  <section class="card map-legend">
    <div class="ml-lines">${linie.map((l) => {
      const [c, t] = lineState(l, active);
      return `<button class="ml-line${mp.focus === l.id ? ' on' : ''}" data-mfocus="${esc(l.id)}" title="${mp.focus === l.id ? 'Pokaż wszystkie linie' : 'Wyróżnij tę linię'}">${U.lineChip(l)}<span class="dot-s ${c}"></span><span class="small">${esc(t)}</span></button>`;
    }).join('')}
    ${mp.focus ? `<a class="btn sm" href="#/linia/${esc(mp.focus)}">Szczegóły linii →</a>` : ''}</div>
    ${keys.length ? `<div class="ml-keys small muted">${keys.join('')}</div>` : ''}
  </section>`;
}

// Przybliżanie i przesuwanie zmienia tylko viewBox — bez przerysowania strony.
const mapEl = () => app.querySelector('.map-svg');
const viewOf = (svg) => mp.view || (({ x, y, width: w, height: h }) => ({ x, y, w, h }))(svg.viewBox.baseVal);
function setView(v) {
  const svg = mapEl();
  if (!svg) return;
  mp.view = v;
  svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
}
// Skala ograniczona: od ok. 12× przybliżenia do 2× oddalenia względem całej sieci.
function clampK(w0, k) {
  const b = currentMap().bounds, minW = Math.max(b.w / 12, 120), maxW = b.w * 2;
  return Math.min(Math.max(w0 * k, Math.min(minW, w0)), Math.max(maxW, w0)) / w0;
}
function zoomAt(f, cx, cy) {
  const svg = mapEl();
  if (!svg) return;
  const v = viewOf(svg), r = svg.getBoundingClientRect();
  const p = new DOMPoint(cx ?? r.left + r.width / 2, cy ?? r.top + r.height / 2).matrixTransform(svg.getScreenCTM().inverse());
  const k = clampK(v.w, f);
  setView({ x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k, w: v.w * k, h: v.h * k });
}
const ptrs = new Map();
let gest = null, dragged = false;
function startGesture(svg) {
  const pts = [...ptrs.values()];
  const mid = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  const d = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
  gest = { v: viewOf(svg), inv: svg.getScreenCTM().inverse(), mid, d };
}
app.addEventListener('pointerdown', (e) => {
  const svg = e.target.closest('.map-svg');
  if (!svg || (e.pointerType === 'mouse' && e.button !== 0)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
  if (ptrs.size === 1) dragged = false;
  startGesture(svg);
});
app.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId), svg = mapEl();
  if (!p || !svg || !gest) return;
  p.x = e.clientX; p.y = e.clientY;
  if (!dragged && Math.hypot(p.x - p.x0, p.y - p.y0) > 5) {
    dragged = true;
    try { svg.setPointerCapture(e.pointerId); } catch (err) {}
  }
  if (!dragged) return;
  const pts = [...ptrs.values()];
  const mid = { x: pts.reduce((s, q) => s + q.x, 0) / pts.length, y: pts.reduce((s, q) => s + q.y, 0) / pts.length };
  const k = gest.d && pts.length > 1 ? clampK(gest.v.w, gest.d / (Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1)) : 1;
  // Punkt mapy, który był pod palcami na początku gestu, ma zostać pod nimi teraz.
  const m0 = new DOMPoint(gest.mid.x, gest.mid.y).matrixTransform(gest.inv), m1 = new DOMPoint(mid.x, mid.y).matrixTransform(gest.inv);
  setView({ x: m0.x - (m1.x - gest.v.x) * k, y: m0.y - (m1.y - gest.v.y) * k, w: gest.v.w * k, h: gest.v.h * k });
});
const endPtr = (e) => {
  if (!ptrs.delete(e.pointerId)) return;
  const svg = mapEl();
  if (ptrs.size && svg) startGesture(svg); else gest = null;
};
app.addEventListener('pointerup', endPtr);
app.addEventListener('pointercancel', endPtr);
// Po przeciągnięciu mapy puszczenie przycisku nie otwiera stacji.
app.addEventListener('click', (e) => { if (dragged && e.target.closest('.map-svg')) { e.preventDefault(); e.stopPropagation(); dragged = false; } }, true);
app.addEventListener('wheel', (e) => {
  if (!e.target.closest('.map-svg')) return;
  e.preventDefault();
  zoomAt(Math.exp((e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * 0.0015), e.clientX, e.clientY);
}, { passive: false });

async function downloadMap(type) {
  const svg = mapEl();
  if (!svg) return;
  const lay = currentMap();
  const text = mapFileSvg(svg, lay);
  try {
    const blob = type === 'png' ? await svgToPng(text, lay.bounds.w, lay.bounds.h) : new Blob([text], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mapa-${SITE_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${type}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (err) { toast('Nie udało się zapisać mapy.', 'bad'); }
}

const notFound = (msg) => `<div class="card center"><h1>Nie znaleziono</h1><p>${msg}</p><a class="btn" href="#/">Strona główna</a></div>`;

// ---------- render ----------
function render() {
  if (state.error) { app.innerHTML = `<div class="alert bad">Nie udało się wczytać danych. ${esc(errMsg(state.error))}</div>`; return; }
  if (!['stacje', 'linie', 'komunikaty'].every((c) => state.ready[c])) { app.innerHTML = '<p class="loading">Ładowanie…</p>'; return; }
  const { p, id } = route();
  const views = { '': viewHome, polaczenia: () => viewPolaczenia(id), mapa: () => viewMapa(id), linie: viewLinie, linia: () => viewLinia(id), stacje: viewStacje, stacja: () => viewStacja(id), archiwum: viewArchiwum, komunikat: () => viewKomunikat(id) };
  renderInto(app, (views[p] || (() => notFound('Nie ma takiej strony.')))());
}

app.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.f !== undefined) { f[t.dataset.f] = t.value; render(); }
  else if (t.dataset.af !== undefined) { af[t.dataset.af] = t.value; render(); }
  else if (t.dataset.sq !== undefined) { sq = t.value; render(); }
  else if (t.dataset.pf !== undefined) {
    pf[t.dataset.pf] = t.type === 'checkbox' ? t.checked : t.value;
    if (XFER_KEYS[t.dataset.pf]) { try { localStorage.setItem(XFER_KEYS[t.dataset.pf], t.value); } catch (e) {} }
    setConnHash(); render();
  }
});
app.addEventListener('click', (e) => {
  const c = e.target.closest('[data-copy]');
  if (c) copyText(c.dataset.copy);
  if (e.target.closest('[data-swap]')) { [pf.from, pf.to] = [pf.to, pf.from]; setConnHash(); render(); }
  const so = e.target.closest('[data-sort]');
  if (so) { pf.sort = so.dataset.sort; render(); }
  if (e.target.closest('[data-clear]')) { Object.assign(f, { linia: '', typ: '', status: 'biezace', q: '' }); render(); }
  const mf = e.target.closest('[data-mfocus]');
  if (mf) {
    const id = mp.focus === mf.dataset.mfocus ? '' : mf.dataset.mfocus;
    history.replaceState(null, '', `#/mapa${id ? '/' + encodeURIComponent(id) : ''}`);
    render();
  }
  const mz = e.target.closest('[data-mz]');
  if (mz) { if (mz.dataset.mz === 'full') setFull(!mp.full); else if (mz.dataset.mz === 'fit') { mp.view = null; render(); } else zoomAt(mz.dataset.mz === 'in' ? 1 / 1.4 : 1.4); }
  const dl = e.target.closest('[data-mdl]');
  if (dl) downloadMap(dl.dataset.mdl);
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
  // Podpisy na mapie rozmieszczamy według szerokości tekstu — po wczytaniu fontu liczymy je od nowa.
  document.fonts?.ready.then(() => { resetMapCache(); if (route().p === 'mapa') render(); });
  // Zegar co 15 s, pełne odświeżenie co minutę (statusy zmieniają się z upływem czasu).
  setInterval(() => { const c = document.getElementById('clock'); if (c) c.textContent = U.fmtTime(new Date()); }, 15000);
  setInterval(render, 60000);
}
main().catch((e) => { app.innerHTML = `<div class="alert bad">${esc(errMsg(e))}</div>`; console.error(e); });
