// Mapa sieci rysowana automatycznie z tras linii — bez ręcznego układania.
// 1) Położenie startowe: koordynaty stacji (Nether ×8). Stacje bez koordynatów dostają miejsce
//    z układu torów, a fragmenty sieci zupełnie bez koordynatów lądują obok reszty.
// 2) Stacje trafiają na siatkę i są przesuwane tak, żeby odcinki biegły poziomo lub pionowo,
//    linie miały mało zakrętów i krzyżowań, a kierunki świata się zgadzały (północ u góry).
// 3) Odcinków, których nie da się wyprostować, prowadzimy po siatce z zakrętami pod kątem 90°.
// 4) Kilka linii na wspólnym odcinku jedzie obok siebie; na końcu rozmieszczamy podpisy stacji.
import * as U from './util.js';

const ROW = 64;                         // odstęp wierszy siatki (px); kolumn — zależnie od długości nazw
const LW = 5, GAP = 6;                  // grubość linii i odstęp torów na wspólnym odcinku
const R_TURN = 14;                      // promień łuku na zakręcie
const FONT = 13, LINE_H = 15;           // podpisy stacji

// Wagi oceny układu na siatce.
const W = { bend: 10, len: 1, ori: 8, rot: 2, disp: 0.3, turn: 4, rev: 50, cross: 12, side: 6, port: 14 };
// Koszty prowadzenia odcinka z zakrętami (jednostka = pół oczka siatki).
const C = { bend: 6, overlap: 40, cross: 5, turnOn: 15, portSame: 60, portTurn: 3 };
const INF = 1e9;
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];   // kierunki: 0 wschód, 1 południe, 2 zachód, 3 północ

const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const r1 = (v) => Math.round(v * 10) / 10;

// ---------- graf sieci ----------
function geoOf(s) {
  const ok = (a, b) => U.hasCoord(a) && U.hasCoord(b);
  const w1 = s.wymiar || 'overworld', w2 = s.portal ? s.wymiar2 : null;
  if (w1 === 'overworld' && ok(s.x, s.z)) return { x: s.x, y: s.z };
  if (w2 === 'overworld' && ok(s.x2, s.z2)) return { x: s.x2, y: s.z2 };
  if (w1 === 'nether' && ok(s.x, s.z)) return { x: s.x * 8, y: s.z * 8 };
  if (w2 === 'nether' && ok(s.x2, s.z2)) return { x: s.x2 * 8, y: s.z2 * 8 };
  return null;   // End albo brak koordynatów
}

function buildGraph(stacje, linie) {
  const st = new Map(stacje.map((s) => [s.id, s]));
  const lines = [];
  for (const l of [...linie].sort(U.byName)) {
    const tr = (l.trasa || []).filter((t) => st.has(t.stacja)).filter((t, i, a) => !i || t.stacja !== a[i - 1].stacja);
    if (tr.length < 2) continue;
    lines.push({ l, tr, dims: U.segDims(tr, (id) => st.get(id)).dims });
  }
  const nodes = [], idx = new Map();
  for (const ln of lines) {
    ln.si = ln.tr.map((t) => {
      if (!idx.has(t.stacja)) { idx.set(t.stacja, nodes.length); nodes.push(st.get(t.stacja)); }
      return idx.get(t.stacja);
    });
    ln.stop = ln.si.map(() => true);
  }
  return link({ lines, nodes, n: nodes.length });
}

// Krawędzie, sąsiedztwo i obsługiwane stacje z sekwencji linii (si; stop = czy linia się tu zatrzymuje).
function link(G) {
  const { n, lines } = G;
  const adj = Array.from({ length: n }, () => new Set());
  const inc = Array.from({ length: n }, () => []);
  const served = Array.from({ length: n }, () => new Set());
  const edges = [], emap = new Map();
  lines.forEach((ln, li) => {
    ln.ei = [];
    ln.si.forEach((v, k) => {
      if (ln.stop[k]) served[v].add(li);
      if (!k) return;
      const u = ln.si[k - 1], a = Math.min(u, v), b = Math.max(u, v), key = a + ',' + b;
      let e = emap.get(key);
      if (!e) {
        e = { id: edges.length, a, b, lines: [] };
        emap.set(key, e); edges.push(e);
        adj[a].add(b); adj[b].add(a); inc[a].push(e.id); inc[b].push(e.id);
      }
      if (!e.lines.includes(li)) e.lines.push(li);
      ln.ei.push(e.id);
    });
  });
  return { ...G, adj, inc, served, edges };
}

// Ekspres omijający stacje: jeśli między jego kolejnymi przystankami u → w biegnie prawie prosta
// droga po torach innych linii (u → v1 → … → w), ekspres jedzie wzdłuż niej i mija v1… bez zatrzymania.
// Dzięki temu nie rysujemy osobnego „skrótu” obok, który musiałby omijać stację v1 dookoła.
function expressThrough(G, P) {
  const { lines, edges, adj } = G;
  const onEdge = new Map(edges.map((e) => [e.a + ',' + e.b, e.lines]));
  const linesOf = (x, y) => onEdge.get(Math.min(x, y) + ',' + Math.max(x, y)) || [];
  let changed = false;
  lines.forEach((ln, li) => {
    const own = new Set(ln.si), si = [ln.si[0]], stop = [ln.stop[0]], dims = [ln.dims[0]];
    for (let k = 1; k < ln.si.length; k++) {
      const u = ln.si[k - 1], w = ln.si[k], d = dist(P[u], P[w]), direct = linesOf(u, w);
      let best = null;
      if (d > 0) {
        // Droga najwyżej o 5% dłuższa, a każda mijana stacja blisko odcinka u–w (do 1/5 jego długości).
        const lim = d * 1.05 + 1e-6, ux = (P[w].x - P[u].x) / d, uy = (P[w].y - P[u].y) / d;
        const near = (x) => Math.abs((P[x].x - P[u].x) * uy - (P[x].y - P[u].y) * ux) <= d * 0.2;
        const dfs = (v, path, len) => {
          if (path.length > 7) return;
          for (const x of adj[v]) {
            if (x === w ? path.length < 2 : own.has(x) || path.includes(x) || !near(x)) continue;
            if (!linesOf(v, x).some((o) => !direct.includes(o))) continue;
            const nl = len + dist(P[v], P[x]);
            if (nl + dist(P[x], P[w]) > lim) continue;
            if (x === w) { if (!best || nl < best.len) best = { path: [...path, x], len: nl }; } else dfs(x, [...path, x], nl);
          }
        };
        dfs(u, [u], 0);
      }
      for (const v of best ? best.path.slice(1, -1) : []) { si.push(v); stop.push(false); dims.push(ln.dims[k]); }
      si.push(w); stop.push(ln.stop[k]); dims.push(ln.dims[k]);
      if (best) changed = true;
    }
    Object.assign(ln, { si, stop, dims });
  });
  return changed ? link(G) : G;
}

// ---------- 1) położenie startowe ----------
function hops(n, adj) {
  const D = [];
  for (let s = 0; s < n; s++) {
    const d = new Int32Array(n).fill(-1), q = [s];
    d[s] = 0;
    for (let h = 0; h < q.length; h++) for (const v of adj[q[h]]) if (d[v] < 0) { d[v] = d[q[h]] + 1; q.push(v); }
    D.push(d);
  }
  return D;
}

// Stress majorization: odległości na mapie ≈ liczba odcinków × L. Stacje z koordynatami (fixed) stoją w miejscu.
function stress(ids, P, D, L, fixed, iters) {
  for (let it = 0; it < iters; it++) {
    for (const i of ids) {
      if (fixed && fixed[i]) continue;
      let sx = 0, sy = 0, sw = 0;
      for (const j of ids) {
        const h = D[i][j];
        if (j === i || h <= 0) continue;
        const d = h * L, w = 1 / (d * d), dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, cur = Math.hypot(dx, dy) || 1e-6;
        sx += w * (P[j].x + (d * dx) / cur);
        sy += w * (P[j].y + (d * dy) / cur);
        sw += w;
      }
      if (sw) P[i] = { x: sx / sw, y: sy / sw };
    }
  }
}

// Klasyczne MDS (dwa główne wektory własne) — deterministyczny układ startowy dla sieci bez koordynatów.
function mds(ids, D, L) {
  const m = ids.length;
  if (m === 1) return [{ x: 0, y: 0 }];
  const B = ids.map((i) => Float64Array.from(ids, (j) => (D[i][j] * L) ** 2));
  const rm = B.map((row) => row.reduce((s, v) => s + v, 0) / m);
  const tm = rm.reduce((s, v) => s + v, 0) / m;
  for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) B[a][b] = -0.5 * (B[a][b] - rm[a] - rm[b] + tm);
  const vecs = [];
  for (let k = 0; k < 2; k++) {
    let v = Float64Array.from({ length: m }, (_, i) => Math.cos((i + 1) * (k + 1.3)));
    let lam = 0;
    for (let it = 0; it < 300; it++) {
      const w = new Float64Array(m);
      for (let a = 0; a < m; a++) { let s = 0; for (let b = 0; b < m; b++) s += B[a][b] * v[b]; w[a] = s; }
      for (const [u, lu] of vecs) { let p = 0; for (let a = 0; a < m; a++) p += u[a] * v[a]; for (let a = 0; a < m; a++) w[a] -= lu * p * u[a]; }
      const nrm = Math.hypot(...w);
      if (nrm < 1e-12) break;
      lam = nrm; v = w.map((x) => x / nrm);
    }
    vecs.push([v, lam]);
  }
  return ids.map((_, i) => ({ x: vecs[0][0][i] * Math.sqrt(vecs[0][1]), y: vecs[1][0][i] * Math.sqrt(vecs[1][1]) }));
}

function bboxOf(pts) {
  if (!pts.length) return null;
  return pts.reduce((b, p) => ({ x0: Math.min(b.x0, p.x), y0: Math.min(b.y0, p.y), x1: Math.max(b.x1, p.x), y1: Math.max(b.y1, p.y) }),
    { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
}

function startPositions(G) {
  const { n, adj, edges } = G;
  const P = G.nodes.map(geoOf);
  const fixed = P.map(Boolean);
  const D = hops(n, adj);
  const L = median(edges.filter((e) => fixed[e.a] && fixed[e.b]).map((e) => dist(P[e.a], P[e.b])).filter((d) => d > 0)) || 100;
  const comps = [], seen = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    const c = [];
    for (let j = 0; j < n; j++) if (D[i][j] >= 0) { seen[j] = 1; c.push(j); }
    comps.push(c);
  }
  const free = [];
  for (const c of comps) {
    const kn = c.filter((i) => fixed[i]), un = c.filter((i) => !fixed[i]);
    if (!kn.length) { free.push(c); continue; }
    if (!un.length) continue;
    // Najpierw średnia z sąsiadów (stacje między dwiema znanymi układają się równo po drodze),
    // potem stress — odgałęzienia bez koordynatów rozchodzą się na zewnątrz zamiast skupiać w jednym punkcie.
    const cx = kn.reduce((s, i) => s + P[i].x, 0) / kn.length, cy = kn.reduce((s, i) => s + P[i].y, 0) / kn.length;
    for (const i of un) P[i] = { x: cx, y: cy };
    for (let it = 0; it < 300; it++) for (const i of un) {
      let sx = 0, sy = 0;
      for (const j of adj[i]) { sx += P[j].x; sy += P[j].y; }
      P[i] = { x: sx / adj[i].size, y: sy / adj[i].size };
    }
    un.forEach((i, k) => { const a = (k + 1) * 2.39996; P[i] = { x: P[i].x + Math.cos(a) * L * 0.15, y: P[i].y + Math.sin(a) * L * 0.15 }; });
    stress(c, P, D, L, fixed, 150);
  }
  let box = bboxOf(P.filter(Boolean));
  for (const c of free) {
    mds(c, D, L).forEach((p, k) => { P[c[k]] = p; });
    stress(c, P, D, L, null, 200);
    const b = bboxOf(c.map((i) => P[i]));
    const dx = box ? box.x1 + 2 * L - b.x0 : -b.x0, dy = box ? box.y0 - b.y0 : -b.y0;
    for (const i of c) P[i] = { x: P[i].x + dx, y: P[i].y + dy };
    box = bboxOf([...(box ? [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y1 }] : []), { x: b.x0 + dx, y: b.y0 + dy }, { x: b.x1 + dx, y: b.y1 + dy }]);
  }
  return P;
}

// ---------- 2) siatka ----------
function snap(G, P) {
  const { n, edges, inc } = G;
  const L = median(edges.map((e) => dist(P[e.a], P[e.b])).filter((d) => d > 1e-9)) || 1;
  const s = 2 / L;   // typowy odcinek = 2 oczka, żeby było gdzie przesuwać
  const gx = new Array(n), gy = new Array(n), occ = new Map();
  const order = [...Array(n).keys()].sort((p, q) => inc[q].length - inc[p].length || p - q);
  for (const i of order) {
    const tx = P[i].x * s, ty = P[i].y * s, rx = Math.round(tx), ry = Math.round(ty);
    for (let r = 0; ; r++) {
      let best = null, bd = Infinity;
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || occ.has((rx + dx) + ',' + (ry + dy))) continue;
        const d = (rx + dx - tx) ** 2 + (ry + dy - ty) ** 2;
        if (d < bd) { bd = d; best = [rx + dx, ry + dy]; }
      }
      if (best) { [gx[i], gy[i]] = best; occ.set(best[0] + ',' + best[1], i); break; }
    }
  }
  return { gx, gy, occ };
}

// Lokalna optymalizacja: przesuwamy po jednej stacji, dopóki ocena układu spada.
function optimize(G, P, gx, gy, occ) {
  const { n, edges, inc, adj, lines } = G;
  const m = edges.length;
  const ea = edges.map((e) => e.a), eb = edges.map((e) => e.b), ew = edges.map((e) => Math.min(3, e.lines.length));
  const gdx = new Float64Array(m), gdy = new Float64Array(m);
  edges.forEach((e, k) => {
    const dx = P[e.b].x - P[e.a].x, dy = P[e.b].y - P[e.a].y, d = Math.hypot(dx, dy) || 1;
    gdx[k] = dx / d; gdy[k] = dy / d;
  });
  const x0 = [...gx], y0 = [...gy];

  // Przejazd linii przez stację (u → v → w): najlepiej prosto, zakręt kosztuje, zawracanie — dużo.
  const tmap = new Map();
  for (const ln of lines) for (let k = 1; k + 1 < ln.si.length; k++) {
    const u = ln.si[k - 1], v = ln.si[k], w = ln.si[k + 1];
    if (u === w) continue;
    const key = v + ':' + Math.min(u, w) + ':' + Math.max(u, w);
    const t = tmap.get(key);
    if (t) t.c++; else tmap.set(key, { u, v, w, c: 1 });
  }
  const tinv = Array.from({ length: n }, () => []);
  for (const t of tmap.values()) { tinv[t.u].push(t); tinv[t.v].push(t); tinv[t.w].push(t); }

  // Strona odcinka: sąsiednia stacja, która w świecie leży wyraźnie po lewej stronie odcinka u–v,
  // nie powinna na mapie przeskoczyć na prawą (np. linia omijająca węzeł od zachodu zostaje na zachodzie).
  const sinv = Array.from({ length: n }, () => []);
  edges.forEach((e) => {
    const u = e.a, v = e.b, ax = P[v].x - P[u].x, ay = P[v].y - P[u].y, la = Math.hypot(ax, ay);
    if (!la) return;
    for (const w of new Set([...adj[u], ...adj[v]])) {
      if (w === u || w === v) continue;
      const bx = P[w].x - P[u].x, by = P[w].y - P[u].y, lb = Math.hypot(bx, by);
      const s = lb ? (ax * by - ay * bx) / (la * lb) : 0;
      if (Math.abs(s) < 0.3) continue;
      const t = { u, v, w, s: Math.sign(s) };
      sinv[u].push(t); sinv[v].push(t); sinv[w].push(t);
    }
  });
  const sideCost = ({ u, v, w, s }) => (Math.sign((gx[v] - gx[u]) * (gy[w] - gy[u]) - (gy[v] - gy[u]) * (gx[w] - gx[u])) === -s ? W.side : 0);

  const straight = (k) => gx[ea[k]] === gx[eb[k]] || gy[ea[k]] === gy[eb[k]];
  const onSeg = (w, k) => {
    const a = ea[k], b = eb[k];
    if (gx[a] === gx[b]) return gx[w] === gx[a] && gy[w] > Math.min(gy[a], gy[b]) && gy[w] < Math.max(gy[a], gy[b]);
    if (gy[a] === gy[b]) return gy[w] === gy[a] && gx[w] > Math.min(gx[a], gx[b]) && gx[w] < Math.max(gx[a], gx[b]);
    return false;
  };
  const orient = (ax, ay, bx, by, cx, cy) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
  const crosses = (k, f) => {
    const ax = gx[ea[k]], ay = gy[ea[k]], bx = gx[eb[k]], by = gy[eb[k]];
    const cx = gx[ea[f]], cy = gy[ea[f]], dx = gx[eb[f]], dy = gy[eb[f]];
    if (Math.max(ax, bx) < Math.min(cx, dx) || Math.max(cx, dx) < Math.min(ax, bx) ||
        Math.max(ay, by) < Math.min(cy, dy) || Math.max(cy, dy) < Math.min(ay, by)) return false;
    return orient(ax, ay, bx, by, cx, cy) * orient(ax, ay, bx, by, dx, dy) < 0 &&
           orient(cx, cy, dx, dy, ax, ay) * orient(cx, cy, dx, dy, bx, by) < 0;
  };
  // Odcinek z zakrętem ma dwa warianty „L”. Jeśli w obu wyjście ze stacji jest już zajęte prostym odcinkiem
  // albo na drodze stoi inna stacja, przy rysowaniu wyjdzie objazd — to kosztuje dodatkowo.
  const portBusy = (a, d, skip) => {
    for (const k of inc[a]) {
      if (k === skip || !straight(k)) continue;
      const o = ea[k] === a ? eb[k] : ea[k];
      if ((gx[o] > gx[a] ? 0 : gy[o] > gy[a] ? 1 : gx[o] < gx[a] ? 2 : 3) === d) return true;
    }
    return false;
  };
  const onAxis = (w, x0, y0, x1, y1) => (x0 === x1
    ? gx[w] === x0 && gy[w] >= Math.min(y0, y1) && gy[w] <= Math.max(y0, y1)
    : gy[w] === y0 && gx[w] >= Math.min(x0, x1) && gx[w] <= Math.max(x0, x1));
  const lFree = (k, hFirst) => {
    const a = ea[k], b = eb[k], cx = hFirst ? gx[b] : gx[a], cy = hFirst ? gy[a] : gy[b];
    const da = hFirst ? (gx[b] > gx[a] ? 0 : 2) : (gy[b] > gy[a] ? 1 : 3);
    const db = hFirst ? (gy[a] > gy[b] ? 1 : 3) : (gx[a] > gx[b] ? 0 : 2);
    if (portBusy(a, da, k) || portBusy(b, db, k)) return false;
    for (let w = 0; w < n; w++) if (w !== a && w !== b && (onAxis(w, gx[a], gy[a], cx, cy) || onAxis(w, cx, cy, gx[b], gy[b]))) return false;
    return true;
  };
  const portPen = (k) => (straight(k) || lFree(k, true) || lFree(k, false) ? 0 : W.port * ew[k]);
  const edgeCost = (k) => {
    const a = ea[k], b = eb[k], dx = gx[b] - gx[a], dy = gy[b] - gy[a], ux = gdx[k], uy = gdy[k];
    let c = W.len * (Math.abs(dx) + Math.abs(dy));
    if (dx && dy) c += W.bend * ew[k] + portPen(k);
    if ((ux > 0.3 && dx < 0) || (ux < -0.3 && dx > 0)) c += W.ori * Math.abs(ux);
    if ((uy > 0.3 && dy < 0) || (uy < -0.3 && dy > 0)) c += W.ori * Math.abs(uy);
    if (!dx && Math.abs(ux) > 0.9) c += W.rot;
    if (!dy && Math.abs(uy) > 0.9) c += W.rot;
    if (!dx || !dy) for (let w = 0; w < n; w++) if (w !== a && w !== b && onSeg(w, k)) { c += INF; break; }
    return c;
  };
  const sgn = Math.sign;
  const turnCost = (t) => {
    const { u, v, w } = t;
    const s1 = gx[u] === gx[v] || gy[u] === gy[v], s2 = gx[v] === gx[w] || gy[v] === gy[w];
    if (!s1 || !s2) return W.turn * 0.5 * t.c;
    const dot = sgn(gx[v] - gx[u]) * sgn(gx[w] - gx[v]) + sgn(gy[v] - gy[u]) * sgn(gy[w] - gy[v]);
    return (dot > 0 ? 0 : dot === 0 ? W.turn : W.rev) * t.c;
  };
  const localCost = (i) => {
    let c = W.disp * (Math.abs(gx[i] - x0[i]) + Math.abs(gy[i] - y0[i]));
    for (const k of inc[i]) {
      c += edgeCost(k);
      for (let f = 0; f < m; f++) {
        if (ea[f] === ea[k] || ea[f] === eb[k] || eb[f] === ea[k] || eb[f] === eb[k]) continue;
        if (crosses(k, f)) c += W.cross * (straight(k) && straight(f) ? 1 : 0.6);
      }
    }
    for (let f = 0; f < m; f++) if (ea[f] !== i && eb[f] !== i && onSeg(i, f)) { c += INF; break; }
    for (const j of adj[i]) for (const k of inc[j]) if (ea[k] !== i && eb[k] !== i) c += portPen(k);
    for (const t of tinv[i]) c += turnCost(t);
    for (const t of sinv[i]) c += sideCost(t);
    return c;
  };

  const R = n > 200 ? 1 : 2, rounds = n > 200 ? 15 : 40;
  const order = [...Array(n).keys()].sort((p, q) => inc[q].length - inc[p].length || p - q);
  for (let round = 0; round < rounds; round++) {
    let moved = 0;
    for (const i of order) {
      const ox = gx[i], oy = gy[i];
      let best = localCost(i), bx = ox, by = oy;
      const cand = [];
      for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) if (dx || dy) cand.push([ox + dx, oy + dy]);
      for (const j of adj[i]) {
        cand.push([gx[j], oy], [ox, gy[j]]);   // wyrównanie do sąsiada
        for (let d = 0; d < 4; d++) for (let r = 1; r <= R; r++) cand.push([gx[j] + DX[d] * r, gy[j] + DY[d] * r]);   // inne wyjście ze stacji sąsiada
      }
      occ.delete(ox + ',' + oy);
      for (const [x, y] of cand) {
        if (occ.has(x + ',' + y)) continue;
        gx[i] = x; gy[i] = y;
        const c = localCost(i);
        if (c < best - 1e-6) { best = c; bx = x; by = y; }
      }
      gx[i] = bx; gy[i] = by; occ.set(bx + ',' + by, i);
      if (bx !== ox || by !== oy) moved++;
    }
    if (!moved) break;
  }
}

// Usuwamy puste kolumny i wiersze — kolejność stacji zostaje, proste odcinki dalej są proste.
function compact(arr) {
  const u = [...new Set(arr)].sort((a, b) => a - b), m = new Map(u.map((v, i) => [v, i]));
  return arr.map((v) => m.get(v));
}

// ---------- 3) prowadzenie odcinków (siatka co pół oczka) ----------
class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(k, v) {
    const K = this.k, V = this.v;
    let i = K.length;
    K.push(k); V.push(v);
    while (i > 0) { const p = (i - 1) >> 1; if (K[p] <= k) break; K[i] = K[p]; V[i] = V[p]; i = p; }
    K[i] = k; V[i] = v;
  }
  pop() {
    const K = this.k, V = this.v, top = V[0];
    this.top = K[0];
    const lk = K.pop(), lv = V.pop(), n = K.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && K[c + 1] < K[c]) c++;
        if (K[c] >= lk) break;
        K[i] = K[c]; V[i] = V[c]; i = c;
      }
      K[i] = lk; V[i] = lv;
    }
    return top;
  }
}

const dirOf = (dx, dy) => (dx > 0 ? 0 : dy > 0 ? 1 : dx < 0 ? 2 : 3);
const segKey = (x, y, d) => (d === 0 ? `h${x},${y}` : d === 2 ? `h${x - 1},${y}` : d === 1 ? `v${x},${y}` : `v${x},${y - 1}`);

function routeAll(G, X, Y) {
  const { n, edges, lines } = G;
  const nodeAt = new Map();
  for (let i = 0; i < n; i++) nodeAt.set(X[i] + ',' + Y[i], i);
  const segUse = new Set(), cellH = new Set(), cellV = new Set();
  const port = edges.map(() => new Map());    // krawędź → (stacja → kierunek wyjścia ze stacji)
  // Dla krawędzi e i jej końca v: krawędzie tych samych linii, którymi linia jedzie dalej z v.
  const nb = edges.map(() => new Map());
  const addNb = (e, v, f) => { const l = nb[e].get(v); if (l) l.push(f); else nb[e].set(v, [f]); };
  for (const ln of lines) for (let k = 0; k + 1 < ln.ei.length; k++) {
    const e = ln.ei[k], f = ln.ei[k + 1], v = ln.si[k + 1];
    if (e !== f) { addNb(e, v, f); addNb(f, v, e); }
  }
  const portCost = (e, v, d) => {
    let c = 0;
    for (const f of nb[e].get(v) || []) {
      const df = port[f].get(v);
      if (df === undefined) continue;
      if (df === d) c += C.portSame; else if (df !== (d + 2) % 4) c += C.portTurn;
    }
    return c;
  };
  const commit = (e, cells) => {
    for (let k = 1; k < cells.length; k++) {
      const [x, y] = cells[k - 1], [nx, ny] = cells[k], d = dirOf(nx - x, ny - y), set = d % 2 ? cellV : cellH;
      segUse.add(segKey(x, y, d));
      set.add(x + ',' + y); set.add(nx + ',' + ny);
    }
    const L = cells.length, E = edges[e];
    port[e].set(E.a, dirOf(cells[1][0] - cells[0][0], cells[1][1] - cells[0][1]));
    port[e].set(E.b, dirOf(cells[L - 2][0] - cells[L - 1][0], cells[L - 2][1] - cells[L - 1][1]));
  };
  const walk = (pts) => {
    const cells = [pts[0]];
    for (let k = 1; k < pts.length; k++) {
      let [x, y] = cells[cells.length - 1];
      const [tx, ty] = pts[k];
      while (x !== tx || y !== ty) { x += Math.sign(tx - x); if (x === tx) y += Math.sign(ty - y); cells.push([x, y]); }
    }
    return cells;
  };
  const straightCells = (E) => {
    const { a, b } = E;
    if (X[a] !== X[b] && Y[a] !== Y[b]) return null;
    const cells = walk([[X[a], Y[a]], [X[b], Y[b]]]);
    for (let k = 1; k < cells.length - 1; k++) if (nodeAt.has(cells[k][0] + ',' + cells[k][1])) return null;
    return cells;
  };

  const minX = Math.min(...X) - 2, maxX = Math.max(...X) + 2, minY = Math.min(...Y) - 2, maxY = Math.max(...Y) + 2;
  const Wd = maxX - minX + 1, N = Wd * (maxY - minY + 1) * 5;
  const g = new Float64Array(N), par = new Int32Array(N), seen = new Int32Array(N);
  let stamp = 0;
  // Szukamy najpierw w prostokącie wokół końców odcinka (szybko), a gdy się nie da — na całej siatce.
  const astar = (E, margin) => {
    const { a, b } = E, sx = X[a], sy = Y[a], tx = X[b], ty = Y[b];
    const x0 = Math.max(minX, Math.min(sx, tx) - margin), x1 = Math.min(maxX, Math.max(sx, tx) + margin);
    const y0 = Math.max(minY, Math.min(sy, ty) - margin), y1 = Math.min(maxY, Math.max(sy, ty) + margin);
    const h = (x, y) => Math.abs(tx - x) + Math.abs(ty - y);
    stamp++;
    const id0 = ((sy - minY) * Wd + (sx - minX)) * 5 + 4;
    g[id0] = 0; par[id0] = -1; seen[id0] = stamp;
    const hp = new Heap();
    hp.push(h(sx, sy), id0);
    let goal = -1;
    while (hp.size) {
      const id = hp.pop(), d = id % 5, cell = (id - d) / 5, x = (cell % Wd) + minX, y = Math.floor(cell / Wd) + minY, gc = g[id];
      if (hp.top > gc + h(x, y) + 1e-9) continue;
      if (x === tx && y === ty) { goal = id; break; }
      for (let nd = 0; nd < 4; nd++) {
        if (d < 4 && nd === (d + 2) % 4) continue;
        const nx = x + DX[nd], ny = y + DY[nd];
        if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
        const at = nx === tx && ny === ty;
        if (!at && nodeAt.has(nx + ',' + ny)) continue;
        let c = 1;
        if (d === 4) c += portCost(E.id, a, nd);
        else if (nd !== d) { c += C.bend; if (cellH.has(x + ',' + y) || cellV.has(x + ',' + y)) c += C.turnOn; }
        if (segUse.has(segKey(x, y, nd))) c += C.overlap;
        if (at) c += portCost(E.id, b, (nd + 2) % 4);
        else if ((nd % 2 ? cellH : cellV).has(nx + ',' + ny)) c += C.cross;
        const nid = ((ny - minY) * Wd + (nx - minX)) * 5 + nd, ng = gc + c;
        if (seen[nid] !== stamp || ng < g[nid]) { seen[nid] = stamp; g[nid] = ng; par[nid] = id; hp.push(ng + h(nx, ny), nid); }
      }
    }
    if (goal < 0) return null;
    const cells = [];
    for (let id = goal; id >= 0; id = par[id]) { const cell = (id - (id % 5)) / 5; cells.push([(cell % Wd) + minX, Math.floor(cell / Wd) + minY]); }
    return cells.reverse();
  };

  const routes = new Array(edges.length), rest = [];
  for (const E of edges) { const c = straightCells(E); if (c) { routes[E.id] = c; commit(E.id, c); } else rest.push(E); }
  const manh = (E) => Math.abs(X[E.a] - X[E.b]) + Math.abs(Y[E.a] - Y[E.b]);
  rest.sort((p, q) => q.lines.length - p.lines.length || manh(p) - manh(q) || p.id - q.id);
  for (const E of rest) {
    const c = astar(E, 8) || astar(E, Infinity) || walk([[X[E.a], Y[E.a]], [X[E.b], Y[E.a]], [X[E.b], Y[E.b]]]);
    routes[E.id] = c; commit(E.id, c);
  }
  return { routes, port };
}

function corners(cells) {
  const out = [cells[0]];
  for (let k = 1; k < cells.length - 1; k++) {
    const [ax, ay] = cells[k - 1], [bx, by] = cells[k], [cx, cy] = cells[k + 1];
    if (bx - ax !== cx - bx || by - ay !== cy - by) out.push(cells[k]);
  }
  out.push(cells[cells.length - 1]);
  return out;
}

// ---------- 4) geometria: tory obok siebie, znaczniki stacji, podpisy ----------
const unit = (p, q) => { const d = dist(p, q) || 1; return { x: (q.x - p.x) / d, y: (q.y - p.y) / d }; };
// Przesunięcie łamanej o `o` w prawo (względem kierunku jazdy); na zakręcie 90° punkt wypada na przecięciu.
function offsetLine(pts, o) {
  if (!o) return pts.map((p) => ({ ...p }));
  return pts.map((p, j) => {
    let nx = 0, ny = 0;
    if (j > 0) { const d = unit(pts[j - 1], p); nx += -d.y; ny += d.x; }
    if (j < pts.length - 1) { const d = unit(p, pts[j + 1]); nx += -d.y; ny += d.x; }
    if (j > 0 && j < pts.length - 1 && Math.abs(nx) + Math.abs(ny) > 1.5) { nx /= 2; ny /= 2; }   // odcinki współliniowe
    return { x: p.x + o * nx, y: p.y + o * ny };
  });
}

function wrapName(t, measure, maxW) {
  if (measure(t) <= maxW || !t.includes(' ')) return [t];
  let best = null;
  for (let i = t.indexOf(' '); i >= 0; i = t.indexOf(' ', i + 1)) {
    const parts = [t.slice(0, i), t.slice(i + 1)], w = Math.max(...parts.map(measure));
    if (!best || w < best.w) best = { w, parts };
  }
  return best.parts;
}

function overlap(a, b) {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

function geometry(G, X, Y, routes, port, measure) {
  const { n, edges, lines, nodes, served, inc } = G;
  const names = nodes.map((s) => String(s.nazwa || s.kod || '?'));
  const widths = names.map(measure);
  const COL = Math.round(Math.min(140, Math.max(84, median(widths) * 0.85 + 28)));
  const px = (x) => (x / 2) * COL, py = (y) => (y / 2) * ROW;
  const cen = nodes.map((_, i) => ({ x: px(X[i]), y: py(Y[i]) }));

  const base = edges.map((E) => {
    let pts = corners(routes[E.id]).map(([x, y]) => ({ x: px(x), y: py(y) }));
    let start = E.a;
    const p0 = pts[0], p1 = pts[pts.length - 1];
    // Kierunek odniesienia: z zachodu na wschód / z północy na południe.
    if (p0.x > p1.x || (p0.x === p1.x && p0.y > p1.y)) { pts = pts.reverse(); start = E.b; }
    return { pts, start };
  });

  // Kolejność torów na wspólnym odcinku. Dla pary linii idziemy wzdłuż nich (w przód, potem w tył),
  // aż się rozejdą: ta, która tam skręca bardziej w prawo, jedzie po prawej. Wynik jest ten sam
  // na każdym odcinku wspólnego przebiegu, więc linie nie zamieniają się miejscami po drodze.
  const occ = lines.map((ln) => {
    const m = new Map();
    ln.ei.forEach((e, k) => { if (!m.has(e)) m.set(e, { k, dir: ln.si[k] === base[e].start ? 1 : -1 }); });
    return m;
  });
  const turnVal = (din, d) => (d === din ? 0 : d === (din + 1) % 4 ? 1 : d === (din + 3) % 4 ? -1 : 0);
  const cmpSide = (e, l1, l2, sgn) => {
    const E = edges[e], o1 = occ[l1].get(e), o2 = occ[l2].get(e), s1 = o1.dir * sgn, s2 = o2.dir * sgn;
    let v = sgn > 0 ? (base[e].start === E.a ? E.b : E.a) : base[e].start;
    let din = (port[e].get(v) + 2) % 4, k1 = o1.k + s1, k2 = o2.k + s2;
    for (let step = 0; step < 64; step++) {
      const e1 = lines[l1].ei[k1], e2 = lines[l2].ei[k2];
      if (e1 === undefined || e2 === undefined) return 0;
      if (e1 !== e2) return Math.sign(turnVal(din, port[e1].get(v)) - turnVal(din, port[e2].get(v))) * sgn;
      const w = edges[e1].a === v ? edges[e1].b : edges[e1].a;
      din = (port[e1].get(w) + 2) % 4; v = w; k1 += s1; k2 += s2;
    }
    return 0;
  };

  const track = edges.map((E) => {
    const { pts, start } = base[E.id];
    const ls = [...E.lines].sort((p, q) => cmpSide(E.id, p, q, 1) || cmpSide(E.id, p, q, -1) || p - q);
    const k = ls.length, maxOff = ((k - 1) / 2) * GAP;
    const R = pts.map((p, j) => {
      if (!j || j === pts.length - 1) return 0;
      const room = (len, toStation) => (toStation ? len - maxOff - 10 : len / 2);
      return Math.max(0, Math.min(Math.max(R_TURN, maxOff + 4), room(dist(pts[j - 1], p), j === 1), room(dist(p, pts[j + 1]), j === pts.length - 2)));
    });
    const per = new Map();
    ls.forEach((li, i) => {
      const o = (i - (k - 1) / 2) * GAP;
      const rr = pts.map((p, j) => {
        if (!R[j]) return 0;
        const d1 = unit(pts[j - 1], p), d2 = unit(p, pts[j + 1]);
        return Math.max(0, R[j] - o * (d1.x * d2.y - d1.y * d2.x > 0 ? 1 : -1));   // łuki współśrodkowe
      });
      per.set(li, { pts: offsetLine(pts, o), rr });
    });
    return { start, pts, per, hw: maxOff + LW / 2 };
  });

  const f = (p) => `${r1(p.x)} ${r1(p.y)}`;
  const outPts = [];
  const lineOut = lines.map((ln, li) => {
    const pieces = [];
    let cur = null;
    ln.ei.forEach((e, k) => {
      const T = track[e], tr = T.per.get(li), fwd = ln.si[k] === T.start;
      const pts = fwd ? tr.pts : [...tr.pts].reverse(), rr = fwd ? tr.rr : [...tr.rr].reverse();
      const alt = (ln.dims[k + 1] || 'overworld') !== 'overworld';
      if (!cur || cur.alt !== alt) { cur = { alt, d: `M${f(pts[0])}` }; pieces.push(cur); } else cur.d += `L${f(pts[0])}`;
      for (let j = 1; j < pts.length - 1; j++) {
        const p = pts[j], a = pts[j - 1], b = pts[j + 1], d1 = unit(a, p), d2 = unit(p, b);
        const r = Math.min(rr[j], dist(a, p) * (j > 1 ? 0.5 : 0.9), dist(p, b) * (j < pts.length - 2 ? 0.5 : 0.9));
        if (r > 0.5) {
          cur.d += `L${f({ x: p.x - d1.x * r, y: p.y - d1.y * r })}A${r1(r)} ${r1(r)} 0 0 ${d1.x * d2.y - d1.y * d2.x > 0 ? 1 : 0} ${f({ x: p.x + d2.x * r, y: p.y + d2.y * r })}`;
        } else cur.d += `L${f(p)}`;
      }
      cur.d += `L${f(pts[pts.length - 1])}`;
      outPts.push(...pts);
    });
    return { id: ln.l.id, name: ln.l.nazwa, color: U.safeColor(ln.l.kolor), status: ln.l.status || 'czynna', pieces: pieces.map(({ d, alt }) => ({ d, alt })) };
  });

  // Znacznik: kropka w kolorze linii albo (przesiadka) biała „pigułka” obejmująca wszystkie tory.
  // Ekspres mijający stację bez zatrzymania nie wchodzi w znacznik — obejmujemy tylko tory linii, które tu stają.
  const markers = nodes.map((s, i) => {
    const pts = [];
    for (const e of inc[i]) for (const [li, tr] of track[e].per) if (served[i].has(li)) pts.push(track[e].start === i ? tr.pts[0] : tr.pts[tr.pts.length - 1]);
    if (!pts.length) pts.push(cen[i]);
    if (served[i].size === 1) {
      const r = 4.5, color = lineOut[[...served[i]][0]].color, e = r + 1.5;
      const c = { x: pts.reduce((q, p) => q + p.x, 0) / pts.length, y: pts.reduce((q, p) => q + p.y, 0) / pts.length };
      return { kind: 'dot', cx: c.x, cy: c.y, r, color, box: { x0: c.x - e, y0: c.y - e, x1: c.x + e, y1: c.y + e } };
    }
    const b = bboxOf(pts), pad = 6.5;
    const m = { kind: 'ic', x: b.x0 - pad, y: b.y0 - pad, w: b.x1 - b.x0 + 2 * pad, h: b.y1 - b.y0 + 2 * pad };
    m.box = { x0: m.x - 1.5, y0: m.y - 1.5, x1: m.x + m.w + 1.5, y1: m.y + m.h + 1.5 };
    return m;
  });

  // Podpisy: zachłannie, zaczynając od węzłów przesiadkowych; unikamy torów, znaczników i innych podpisów.
  const segRects = [];
  for (const T of track) for (let j = 1; j < T.pts.length; j++) {
    const a = T.pts[j - 1], b = T.pts[j], e = T.hw + 1;
    segRects.push({ x0: Math.min(a.x, b.x) - e, y0: Math.min(a.y, b.y) - e, x1: Math.max(a.x, b.x) + e, y1: Math.max(a.y, b.y) + e });
  }
  const placed = [], labels = new Array(n);
  const order = [...Array(n).keys()].sort((p, q) => served[q].size - served[p].size || p - q);
  for (const i of order) {
    const parts = wrapName(names[i], measure, COL * 1.3);
    const w = Math.max(...parts.map(measure)), h = parts.length * LINE_H;
    const M = markers[i].box, cx = (M.x0 + M.x1) / 2, cy = (M.y0 + M.y1) / 2;
    const dirs = new Set(inc[i].map((e) => port[e].get(i)));
    const horiz = dirs.has(0) || dirs.has(2), vert = dirs.has(1) || dirs.has(3);
    const C8 = {
      E: [M.x1 + 5, cy - h / 2, 'start'], W: [M.x0 - 5 - w, cy - h / 2, 'end'],
      S: [cx - w / 2, M.y1 + 3, 'middle'], N: [cx - w / 2, M.y0 - 3 - h, 'middle'],
      SE: [M.x1 + 2, M.y1 + 1, 'start'], NE: [M.x1 + 2, M.y0 - 1 - h, 'start'],
      SW: [M.x0 - 2 - w, M.y1 + 1, 'end'], NW: [M.x0 - 2 - w, M.y0 - 1 - h, 'end'],
    };
    const pref = horiz && !vert ? ['S', 'N', 'SE', 'NE', 'SW', 'NW', 'E', 'W']
      : vert && !horiz ? ['E', 'W', 'NE', 'SE', 'NW', 'SW', 'S', 'N']
        : ['NE', 'SE', 'NW', 'SW', 'E', 'W', 'S', 'N'];
    let best = null;
    pref.forEach((key, rank) => {
      const [x, y, anchor] = C8[key], r = { x0: x, y0: y, x1: x + w, y1: y + h };
      let c = rank * 3;
      for (const q of placed) c += 3 * overlap(r, q);
      for (let j = 0; j < n; j++) if (j !== i) c += 3 * overlap(r, markers[j].box);
      for (const q of segRects) c += overlap(r, q);
      if (!best || c < best.c) best = { c, r, anchor };
    });
    placed.push(best.r);
    const { r, anchor } = best;
    const tx = anchor === 'start' ? r.x0 : anchor === 'end' ? r.x1 : (r.x0 + r.x1) / 2;
    labels[i] = { x: r1(tx), anchor, parts, ys: parts.map((_, j) => r1(r.y0 + j * LINE_H + FONT * 0.85)), box: r };
  }

  const bb = bboxOf([...outPts, ...cen,
    ...markers.flatMap((m) => [{ x: m.box.x0, y: m.box.y0 }, { x: m.box.x1, y: m.box.y1 }]),
    ...labels.flatMap((l) => [{ x: l.box.x0, y: l.box.y0 }, { x: l.box.x1, y: l.box.y1 }])]);
  const pad = 24;
  const stations = nodes.map((s, i) => ({
    id: s.id, name: names[i], kod: s.kod || '', status: s.status || 'czynna', portal: !!(s.portal && s.wymiar2),
    marker: markers[i], label: labels[i], lineIds: [...served[i]].map((li) => lineOut[li].id),
  }));
  return {
    bounds: { x: r1(bb.x0 - pad), y: r1(bb.y0 - pad), w: r1(bb.x1 - bb.x0 + 2 * pad), h: r1(bb.y1 - bb.y0 + 2 * pad) },
    lines: lineOut, stations,
  };
}

// ---------- API ----------
let measureFn = null;
function measure() {
  if (measureFn) return measureFn;
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `600 ${FONT}px Barlow, system-ui, sans-serif`;
    if (ctx.measureText('M').width > 0) return (measureFn = (t) => ctx.measureText(t).width);
  } catch (e) { /* poza przeglądarką */ }
  return (t) => String(t).length * FONT * 0.56;
}

export function computeMapLayout(stacje, linie, opts = {}) {
  let G = buildGraph(stacje, linie);
  if (!G.n) return { bounds: { x: 0, y: 0, w: 1, h: 1 }, lines: [], stations: [] };
  const P = startPositions(G);
  for (let it = 0; it < 3; it++) { const H = expressThrough(G, P); if (H === G) break; G = H; }
  const { gx, gy, occ } = snap(G, P);
  optimize(G, P, gx, gy, occ);
  const X = compact(gx).map((v) => v * 2), Y = compact(gy).map((v) => v * 2);
  const { routes, port } = routeAll(G, X, Y);
  return geometry(G, X, Y, routes, port, opts.measure || measure());
}

let cache = null;
const keyOf = (stacje, linie) => JSON.stringify([
  stacje.map((s) => [s.id, s.nazwa, s.kod, s.status, s.wymiar, s.x, s.z, s.portal, s.wymiar2, s.x2, s.z2]),
  linie.map((l) => [l.id, l.nazwa, l.kolor, l.status, (l.trasa || []).map((t) => [t.stacja, t.wymiar])]),
]);
// Układ liczy się tylko po zmianie stacji lub linii (komunikaty go nie ruszają).
export function mapLayout(stacje, linie) {
  const key = keyOf(stacje, linie);
  if (!cache || cache.key !== key) cache = { key, lay: { ...computeMapLayout(stacje, linie), key } };
  return cache.lay;
}
// Po wczytaniu fontu szerokości podpisów są inne — liczymy podpisy jeszcze raz.
export function resetMapCache() { cache = null; measureFn = null; }

const esc = U.esc;
export function mapSvg(lay, { focus = '', hit = new Set(), view = null } = {}) {
  const b = view || lay.bounds;
  const lines = [...lay.lines].sort((p, q) => (p.id === focus) - (q.id === focus));
  const linesSvg = lines.map((ln) => {
    const cls = ['m-line'];
    if (ln.status === 'zawieszona') cls.push('m-susp');
    if (focus && focus !== ln.id) cls.push('dim');
    return `<g class="${cls.join(' ')}" data-line="${esc(ln.id)}">${ln.pieces.map((p) =>
      `<path class="m-trk${p.alt ? ' alt' : ''}" d="${p.d}" stroke="${ln.color}"/>${ln.status === 'budowa' ? `<path class="m-hollow" d="${p.d}"/>` : ''}`).join('')}</g>`;
  }).join('');
  const stSvg = lay.stations.map((s) => {
    const m = s.marker, cls = `m-st ${m.kind}${hit.has(s.id) ? ' hit' : ''}${s.status !== 'czynna' ? ' closed' : ''}`;
    const mk = m.kind === 'dot'
      ? `<circle class="${cls}" cx="${r1(m.cx)}" cy="${r1(m.cy)}" r="${m.r}" stroke="${m.color}"/>`
      : `<rect class="${cls}" x="${r1(m.x)}" y="${r1(m.y)}" width="${r1(m.w)}" height="${r1(m.h)}" rx="${r1(Math.min(m.w, m.h) / 2)}"/>`;
    const B = m.box, pr = (B.x1 - B.x0) / 2 + 3, pq = (B.y1 - B.y0) / 2 + 3;
    const portal = s.portal ? `<rect class="m-portal" x="${r1(B.x0 - 3)}" y="${r1(B.y0 - 3)}" width="${r1(2 * pr)}" height="${r1(2 * pq)}" rx="${r1(Math.min(pr, pq))}"/>` : '';
    const L = s.label;
    const lbl = `<text class="m-lbl${s.status !== 'czynna' ? ' closed' : ''}" text-anchor="${L.anchor}">${L.parts.map((t, j) => `<tspan x="${L.x}" y="${L.ys[j]}">${esc(t)}</tspan>`).join('')}</text>`;
    const dim = focus && !s.lineIds.includes(focus) ? ' dim' : '';
    const title = `${s.name}${s.kod ? ` (${s.kod})` : ''}${s.status !== 'czynna' ? ` — ${U.STACJA_STATUS[s.status] || s.status}` : ''}`;
    return `<a class="m-st-a${dim}" href="#/stacja/${esc(s.id)}"><title>${esc(title)}</title>${portal}${mk}${lbl}</a>`;
  }).join('');
  return `<svg class="map-svg" xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" role="img" aria-label="Mapa sieci"><g class="m-lines">${linesSvg}</g><g class="m-sts">${stSvg}</g></svg>`;
}

// Plik do pobrania: kopia narysowanej mapy z wpisanymi na sztywno stylami (cała sieć, bieżący motyw).
const STYLE_PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'paint-order', 'font-family', 'font-size', 'font-weight'];
export function mapFileSvg(svgEl, lay) {
  const clone = svgEl.cloneNode(true);
  const src = svgEl.querySelectorAll('*'), dst = clone.querySelectorAll('*');
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    dst[i].setAttribute('style', STYLE_PROPS.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';'));
  });
  const b = lay.bounds, bg = getComputedStyle(svgEl.parentElement).backgroundColor || '#ffffff';
  clone.setAttribute('viewBox', `${b.x} ${b.y} ${b.w} ${b.h}`);
  clone.setAttribute('width', Math.round(b.w));
  clone.setAttribute('height', Math.round(b.h));
  clone.querySelectorAll('title').forEach((t) => t.remove());
  clone.insertAdjacentHTML('afterbegin', `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${bg}"/>`);
  return new XMLSerializer().serializeToString(clone);
}

export function svgToPng(svgText, w, h, scale = 2) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG'))), 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG')); };
    img.src = url;
  });
}
