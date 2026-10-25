'use strict';
/* Zombie Outbreak Simulator – Moosburg a. d. Isar
   Karte: OpenStreetMap-Daten (ODbL), Spielwelt in Metern, Navigationsraster 4 m. */

// ───────────────────────── Welt & Raster ─────────────────────────
const CELL = 4, WW = MAP_DATA.w, WH = MAP_DATA.h;
const GW = Math.ceil(WW / CELL), GH = Math.ceil(WH / CELL);
const T_OPEN = 0, T_ROAD = 1, T_BLD = 2, T_WATER = 3;
const type = new Uint8Array(GW * GH);
const comp = new Uint8Array(GW * GH);      // 1 = Hauptzusammenhangskomponente
const barId = new Uint16Array(GW * GH);    // Barrikaden-ID je Zelle
const DT = 1 / 30;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const cellIdx = (x, y) => clamp(y / CELL | 0, 0, GH - 1) * GW + clamp(x / CELL | 0, 0, GW - 1);

function strokePoly(c, p, close) {
  c.beginPath(); c.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
  if (close) c.closePath();
}
function rasterMask(sc, fn) {
  const cv = document.createElement('canvas'); cv.width = GW; cv.height = GH;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.scale(1 / CELL, 1 / CELL); c.lineCap = 'round'; c.lineJoin = 'round'; fn(c);
  return c.getImageData(0, 0, GW, GH).data;
}
function buildGrid() {
  const water = rasterMask(CELL, c => {
    c.fillStyle = c.strokeStyle = '#000';
    for (const w of MAP_DATA.water) { if (w.poly) { strokePoly(c, w.p, true); c.fill(); } else { c.lineWidth = w.w; strokePoly(c, w.p); c.stroke(); } }
  });
  const roads = rasterMask(CELL, c => {
    c.strokeStyle = '#000';
    for (const r of MAP_DATA.roads) { c.lineWidth = Math.max(r.w, 6); strokePoly(c, r.p); c.stroke(); }
  });
  const blds = rasterMask(CELL, c => {
    c.fillStyle = '#000';
    for (const b of MAP_DATA.blds) { strokePoly(c, b, true); c.fill(); }
  });
  for (let i = 0; i < GW * GH; i++) {
    const a = i * 4 + 3;
    let t = T_OPEN;
    if (water[a] > 70) t = T_WATER;
    if (roads[a] > 70) t = T_ROAD;
    if (blds[a] > 40) t = T_BLD;
    type[i] = t;
  }
  // größte begehbare Komponente
  const lab = new Int32Array(GW * GH), q = new Int32Array(GW * GH);
  let best = 0, bestN = 0, n = 0;
  for (let s = 0; s < GW * GH; s++) {
    if (lab[s] || type[s] > T_ROAD) continue;
    n++; let h = 0, tl = 0; q[tl++] = s; lab[s] = n;
    while (h < tl) {
      const i = q[h++], x = i % GW, y = i / GW | 0;
      const nb = [x > 0 ? i - 1 : -1, x < GW - 1 ? i + 1 : -1, y > 0 ? i - GW : -1, y < GH - 1 ? i + GW : -1];
      for (const j of nb) if (j >= 0 && !lab[j] && type[j] <= T_ROAD) { lab[j] = n; q[tl++] = j; }
    }
    if (tl > bestN) { bestN = tl; best = n; }
  }
  for (let i = 0; i < GW * GH; i++) comp[i] = lab[i] === best ? 1 : 0;
}

// Vorgerenderte Karte
const RS = 2;
let mapCv;
function renderMap() {
  mapCv = document.createElement('canvas'); mapCv.width = WW * RS; mapCv.height = WH * RS;
  const c = mapCv.getContext('2d');
  c.scale(RS, RS); c.lineCap = 'round'; c.lineJoin = 'round';
  c.fillStyle = '#26352a'; c.fillRect(0, 0, WW, WH);
  c.fillStyle = '#1d4a73'; c.strokeStyle = '#1d4a73';
  for (const w of MAP_DATA.water) { if (w.poly) { strokePoly(c, w.p, true); c.fill(); } else { c.lineWidth = w.w; strokePoly(c, w.p); c.stroke(); } }
  const rs = MAP_DATA.roads.slice().sort((a, b) => a.c - b.c);
  c.strokeStyle = '#101315';
  for (const r of rs) { c.lineWidth = r.w + 2.4; strokePoly(c, r.p); c.stroke(); }
  for (const r of rs) {
    c.strokeStyle = r.c >= 4 ? '#7a8087' : r.c >= 2 ? '#626970' : r.c === 1 ? '#4e5a48' : '#6b6a52';
    c.lineWidth = r.w; strokePoly(c, r.p); c.stroke();
  }
  c.fillStyle = '#8c8176'; c.strokeStyle = '#2e2924'; c.lineWidth = 0.6;
  for (const b of MAP_DATA.blds) { strokePoly(c, b, true); c.fill(); c.stroke(); }
}

// ───────────────────────── Pfadfindung (A*) ─────────────────────────
function cost(i, zm) {
  const t = type[i];
  if (t > T_ROAD) return 0;
  if (barId[i]) return zm ? 30 : 0;
  return t === T_ROAD ? 1 : 1.6;
}
const walkCost = (x, y, zm) => (x < 0 || y < 0 || x >= WW || y >= WH) ? 0 : cost((y / CELL | 0) * GW + (x / CELL | 0), zm);
const gS = new Uint32Array(GW * GH), gD = new Uint32Array(GW * GH), gG = new Float32Array(GW * GH), gP = new Int32Array(GW * GH);
let stampN = 0, hI = [], hF = [], hN = 0;
function hpush(i, f) { let k = hN++; while (k > 0) { const p = (k - 1) >> 1; if (hF[p] <= f) break; hI[k] = hI[p]; hF[k] = hF[p]; k = p; } hI[k] = i; hF[k] = f; }
function hpop() {
  const r = hI[0]; hN--;
  if (hN > 0) { const i = hI[hN], f = hF[hN]; let k = 0; for (;;) { let c = 2 * k + 1; if (c >= hN) break; if (c + 1 < hN && hF[c + 1] < hF[c]) c++; if (hF[c] >= f) break; hI[k] = hI[c]; hF[k] = hF[c]; k = c; } hI[k] = i; hF[k] = f; }
  return r;
}
function walkLine(x0, y0, x1, y1, zm) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 2);
  for (let i = 1; i < n; i++) { const t = i / n; if (!walkCost(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, zm)) return false; }
  return true;
}
function seeLine(x0, y0, x1, y1) {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 3);
  for (let i = 1; i < n; i++) { const t = i / n; if (type[cellIdx(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)] === T_BLD) return false; }
  return true;
}
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
function findPath(sx, sy, tx, ty, zm, maxExp = 6000) {
  const s = cellIdx(sx, sy), g = cellIdx(tx, ty);
  if (s === g) return [[tx, ty]];
  if (!cost(g, zm)) return null;
  stampN++; hN = 0;
  gS[s] = stampN; gG[s] = 0; gP[s] = -1; hpush(s, 0);
  const gx = g % GW, gy = g / GW | 0;
  let exp = 0, found = false;
  while (hN > 0) {
    const cur = hpop();
    if (gD[cur] === stampN) continue;
    gD[cur] = stampN;
    if (cur === g) { found = true; break; }
    if (++exp > maxExp) return null;
    const cx = cur % GW, cy = cur / GW | 0;
    for (const [dx, dy, m] of NB) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const ni = ny * GW + nx, c = cost(ni, zm);
      if (!c) continue;
      if (dx && dy && (!cost(cy * GW + nx, zm) || !cost(ny * GW + cx, zm))) continue;
      const ng = gG[cur] + c * m;
      if (gS[ni] !== stampN || ng < gG[ni]) {
        gS[ni] = stampN; gG[ni] = ng; gP[ni] = cur;
        const ex = Math.abs(nx - gx), ey = Math.abs(ny - gy);
        hpush(ni, ng + (ex + ey) + (1.414 - 2) * Math.min(ex, ey));
      }
    }
  }
  if (!found) return null;
  const raw = []; for (let i = g; i >= 0; i = gP[i]) raw.push([(i % GW + .5) * CELL, ((i / GW | 0) + .5) * CELL]);
  raw.reverse(); raw[raw.length - 1] = [tx, ty];
  const out = []; let ax = sx, ay = sy, k = 0;
  while (k < raw.length) {
    let j = raw.length - 1;
    while (j > k && !walkLine(ax, ay, raw[j][0], raw[j][1], zm)) j--;
    out.push(raw[j]); ax = raw[j][0]; ay = raw[j][1]; k = j + 1;
  }
  return out;
}

// ───────────────────────── Gebäude ─────────────────────────
const B = [];
const bHash = new Map(), BHS = 32;
function buildBuildings() {
  for (const p of MAP_DATA.blds) {
    let cx = 0, cy = 0, a = 0; const n = p.length / 2;
    for (let i = 0; i < n; i++) { cx += p[i * 2]; cy += p[i * 2 + 1]; const j = (i + 1) % n; a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1]; }
    cx /= n; cy /= n; a = Math.abs(a) / 2;
    if (a < 30) continue;
    const gx = cx / CELL | 0, gy = cy / CELL | 0; let ex = -1, ey = -1;
    outer: for (let r = 0; r <= 8; r++) {
      let bd = 1e9;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = gx + dx, y = gy + dy; if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        const i = y * GW + x; if (!comp[i]) continue;
        const d = dx * dx + dy * dy; if (d < bd) { bd = d; ex = (x + .5) * CELL; ey = (y + .5) * CELL; }
      }
      if (ex >= 0) break outer;
    }
    if (ex < 0) continue;
    const b = { x: cx, y: cy, ex, ey, cap: clamp(Math.round(a / 30), 1, 10), occ: [], siege: 0, idx: B.length };
    B.push(b);
    const k = (cx / BHS | 0) + ',' + (cy / BHS | 0); if (!bHash.has(k)) bHash.set(k, []); bHash.get(k).push(b);
  }
}
function nearBuildings(x, y, r, pred) {
  let best = null, bd = r * r;
  const x0 = (x - r) / BHS | 0, x1 = (x + r) / BHS | 0, y0 = (y - r) / BHS | 0, y1 = (y + r) / BHS | 0;
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
    const l = bHash.get(gx + ',' + gy); if (!l) continue;
    for (const b of l) { const d = (b.ex - x) ** 2 + (b.ey - y) ** 2; if (d < bd && pred(b)) { bd = d; best = b; } }
  }
  return best;
}

// ───────────────────────── Zustand ─────────────────────────
const DEFAULTS = { pop: 800, inf0: 8, armed: 15, acc: 45, police: 8, mil: 0, patrol: 50, infT: 25, zs: 30 };
let cfg = { ...DEFAULTS };
let E = [], BAR = [null], noises = [], tracers = [], fx = [], markers = [];
let S = null;       // Sim-Statistik
let phase = 'setup', speed = 1, acc = 0;
let cooldown = { barricade: 0, strike: 0, supply: 0, garrison: 0 };
const CD_MAX = { barricade: 3, strike: 25, supply: 15, garrison: 20 };
let simT = 0, pathBudget = 0, finished = false;
const K_CIV = 0, K_ZOM = 1, K_POL = 2, K_SOL = 3, K_SEN = 4;
const ZHP = 3;

function newStats() { return { kills: 0, loss: 0, shots: 0, bites: 0, breaches: 0, zombified: 0, peakZ: 0, peakZt: 0, hist: [], used: { barricade: 0, strike: 0, supply: 0, garrison: 0 }, histT: 0 }; }
function mk(k, x, y) { return { k, x, y, hp: k === K_ZOM ? ZHP : 3, st: 0, path: null, pi: 0, th: rnd(0, .4), cd: 0, ammo: 0, acc: 0, armed: false, inc: -1, b: -1, brave: false, wt: rnd(0, 8), tgt: null, dead: false, inT: 0, hx: 0, hy: 0, ft: 0, hmx: x, hmy: y, pt: 0, bt: 0 }; }
const zSpeed = () => 1.4 + cfg.zs / 100 * 4.2;
const zVision = () => 45 + cfg.zs / 100 * 30;

function randWalk(cx, cy, r, roadOnly) {
  for (let n = 0; n < 60; n++) {
    const a = rnd(0, 6.283), d = r === 0 ? 0 : Math.sqrt(Math.random()) * r;
    const x = r === 0 && n === 0 ? cx : cx + Math.cos(a) * d, y = r === 0 && n === 0 ? cy : cy + Math.sin(a) * d;
    if (x < 3 || y < 3 || x > WW - 3 || y > WH - 3) continue;
    const i = cellIdx(x, y); if (!comp[i] || barId[i]) continue;
    if (roadOnly && type[i] !== T_ROAD) continue;
    return [x, y];
  }
  return null;
}
function anyWalk(roadOnly) {
  for (let n = 0; n < 500; n++) { const p = randWalk(rnd(0, WW), rnd(0, WH), 0, roadOnly); if (p) return p; }
  return [WW / 2, WH / 2];
}
function spawnCivilian(inside) {
  let e;
  if (inside && B.length) {
    const b = B[Math.random() * B.length | 0];
    if (b.occ.length < b.cap) { e = mk(K_CIV, b.ex, b.ey); e.st = 4; e.b = b.idx; e.inT = rnd(10, 90); b.occ.push(e); }
  }
  if (!e) { const p = anyWalk(Math.random() < .7); e = mk(K_CIV, p[0], p[1]); }
  e.brave = Math.random() < .5;
  if (Math.random() * 100 < cfg.armed) arm(e);
  E.push(e);
}
function arm(e) { e.armed = true; e.ammo = 14; e.acc = cfg.acc / 100; }
function spawnZombie(x, y) { const e = mk(K_ZOM, x, y); e.st = 0; e.wt = rnd(0, 5); E.push(e); return e; }

function newSim() {
  E = []; BAR = [null]; barId.fill(0); noises = []; tracers = []; fx = []; simT = 0; finished = false;
  for (const b of B) { b.occ = []; b.siege = 0; }
  S = newStats(); cooldown = { barricade: 0, strike: 0, supply: 0, garrison: 0 };
  const inside = Math.round(cfg.pop * .5);
  for (let i = 0; i < cfg.pop; i++) spawnCivilian(i < inside);
  const mp = markers.length ? markers : [anyWalk(true), anyWalk(true), anyWalk(true)].map(p => ({ x: p[0], y: p[1] }));
  for (let i = 0; i < cfg.inf0; i++) {
    const m = mp[i % mp.length]; const p = randWalk(m.x, m.y, 14) || randWalk(m.x, m.y, 40) || anyWalk(true);
    spawnZombie(p[0], p[1]);
  }
  const home = [];
  for (let i = 0; i < cfg.police; i++) { const p = anyWalk(true); const e = mk(K_POL, p[0], p[1]); e.hmx = p[0]; e.hmy = p[1]; e.acc = .55; e.armed = true; E.push(e); }
  for (let i = 0; i < cfg.mil; i++) { const p = anyWalk(true); const e = mk(K_SOL, p[0], p[1]); e.hmx = p[0]; e.hmy = p[1]; e.acc = .8; e.armed = true; E.push(e); }
  record();
}

// ───────────────────────── Räumliche Hashes ─────────────────────────
const HS = 16, HW = Math.ceil(WW / HS), HH = Math.ceil(WH / HS);
const hzHead = new Int32Array(HW * HH), hhHead = new Int32Array(HW * HH);
let hzNxt = new Int32Array(4096), hhNxt = new Int32Array(4096);
function rebuildHash() {
  hzHead.fill(-1); hhHead.fill(-1);
  if (hzNxt.length < E.length) { hzNxt = new Int32Array(E.length * 2); hhNxt = new Int32Array(E.length * 2); }
  for (let i = 0; i < E.length; i++) {
    const e = E[i]; if (e.st === 4 && e.k !== K_ZOM) continue;
    const c = (e.y / HS | 0) * HW + (e.x / HS | 0);
    if (e.k === K_ZOM) { hzNxt[i] = hzHead[c]; hzHead[c] = i; } else { hhNxt[i] = hhHead[c]; hhHead[c] = i; }
  }
}
function nearest(head, nxt, x, y, r, needSee) {
  let best = null, bd = r * r;
  const x0 = Math.max(0, (x - r) / HS | 0), x1 = Math.min(HW - 1, (x + r) / HS | 0), y0 = Math.max(0, (y - r) / HS | 0), y1 = Math.min(HH - 1, (y + r) / HS | 0);
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++)
    for (let i = head[gy * HW + gx]; i >= 0; i = nxt[i]) {
      const e = E[i]; if (e.dead) continue;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd && (!needSee || seeLine(x, y, e.x, e.y))) { bd = d; best = e; }
    }
  return best;
}
const nearestZ = (x, y, r) => nearest(hzHead, hzNxt, x, y, r, true);
const nearestH = (x, y, r) => nearest(hhHead, hhNxt, x, y, r, true);
function countZNear(x, y, r) {
  let n = 0; const x0 = Math.max(0, (x - r) / HS | 0), x1 = Math.min(HW - 1, (x + r) / HS | 0), y0 = Math.max(0, (y - r) / HS | 0), y1 = Math.min(HH - 1, (y + r) / HS | 0);
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) for (let i = hzHead[gy * HW + gx]; i >= 0; i = hzNxt[i]) n++;
  return n;
}

// ───────────────────────── Bewegung ─────────────────────────
function passable(x, y, zm) {
  if (x < 1 || y < 1 || x > WW - 1 || y > WH - 1) return false;
  const i = cellIdx(x, y), t = type[i];
  if (t > T_ROAD) return false;
  if (barId[i]) { if (zm) bash(barId[i]); return false; }
  return true;
}
function bash(id) { const b = BAR[id]; if (b) b.hp -= 7 * DT; }
function moveDir(e, dx, dy, sp, zm) {
  const nx = e.x + dx * sp * DT, ny = e.y + dy * sp * DT;
  if (passable(nx, ny, zm)) { e.x = nx; e.y = ny; return true; }
  if (passable(nx, e.y, zm)) { e.x = nx; return true; }
  if (passable(e.x, ny, zm)) { e.y = ny; return true; }
  return false;
}
function moveTo(e, tx, ty, sp, zm) {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d < .01) return 0;
  return moveDir(e, dx / d, dy / d, Math.min(sp, d / DT), zm);
}
function follow(e, sp, zm) {
  if (!e.path) return false;
  const [px, py] = e.path[e.pi];
  if (!moveTo(e, px, py, sp, zm)) { e.bt += DT; if (e.bt > 1.2) { e.path = null; e.bt = 0; return false; } } else e.bt = 0;
  if (Math.hypot(px - e.x, py - e.y) < 1.8) { e.pi++; if (e.pi >= e.path.length) { e.path = null; return false; } }
  return true;
}
function setPath(e, tx, ty, zm) {
  if (pathBudget <= 0) return false;
  pathBudget--;
  const p = findPath(e.x, e.y, tx, ty, zm);
  if (p) { e.path = p; e.pi = 0; e.bt = 0; return true; }
  return false;
}

// ───────────────────────── Kampf ─────────────────────────
function noise(x, y, r) {
  if (noises.length > 40) noises.shift();
  noises.push({ x, y, r, t: 6 });
}
function shoot(e, z, rng, dmg) {
  S.shots++;
  tracers.push({ x1: e.x, y1: e.y, x2: z.x, y2: z.y, t: .12 });
  noise(e.x, e.y, 170);
  const d = Math.hypot(z.x - e.x, z.y - e.y);
  if (Math.random() < e.acc * (1 - .45 * d / rng)) {
    z.hp -= dmg;
    if (z.hp <= 0 && !z.dead) { z.dead = true; S.kills++; }
  }
}
function infect(e) {
  if (e.inc >= 0 || e.k === K_ZOM) return;
  e.inc = cfg.infT * rnd(.7, 1.3); S.bites++;
}
function toZombie(e) {
  e.k = K_ZOM; e.hp = ZHP; e.inc = -1; e.st = 0; e.path = null; e.armed = false; e.tgt = null; e.wt = 0; S.zombified++;
  if (e.b >= 0) { const b = B[e.b]; b.occ = b.occ.filter(o => o !== e); e.b = -1; e.x = b.ex; e.y = b.ey; breach(b, .6); }
}
function breach(b, p) {
  S.breaches++;
  for (const o of b.occ) { o.st = 0; o.b = -1; o.x = b.ex; o.y = b.ey; o.wt = 0; if (Math.random() < p) infect(o); }
  b.occ = []; b.siege = 0;
}
function kill(e) { if (!e.dead) { e.dead = true; if (e.k === K_ZOM) S.kills++; else S.loss++; } }

// ───────────────────────── KI ─────────────────────────
function thinkCivilian(e) {
  const z = nearestZ(e.x, e.y, 38);
  if (z) {
    const d = Math.hypot(z.x - e.x, z.y - e.y);
    if (e.armed && e.brave && e.ammo > 0 && d < 32 && d > 6) { e.st = 5; e.tgt = z; e.path = null; return; }
    e.st = 2; e.ft = 2.5; e.path = null;
    // Fluchtrichtung wählen
    let bs = -1e9, ax = e.x - z.x, ay = e.y - z.y; const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
    for (let a = 0; a < 12; a++) {
      const an = a * Math.PI / 6, dx = Math.cos(an), dy = Math.sin(an);
      if (!walkCost(e.x + dx * 6, e.y + dy * 6) || !walkCost(e.x + dx * 14, e.y + dy * 14)) continue;
      const sc = dx * ax + dy * ay + rnd(0, .25);
      if (sc > bs) { bs = sc; e.hx = dx; e.hy = dy; }
    }
    if (bs < -1e8) { e.hx = ax; e.hy = ay; }
    // Schutz suchen, wenn ein Gebäude näher ist als der Zombie
    const b = nearBuildings(e.x, e.y, 60, b => b.occ.length < b.cap && Math.hypot(b.ex - z.x, b.ey - z.y) > Math.hypot(b.ex - e.x, b.ey - e.y) + 6);
    if (b && Math.random() < .7 && setPath(e, b.ex, b.ey, false)) { e.st = 3; e.tgt = b; }
    return;
  }
  if (e.st === 5) { e.st = 0; e.wt = rnd(1, 4); }
  if (e.st === 2 && e.ft <= 0) { e.st = 0; e.wt = rnd(2, 6); }
}
function stepCivilian(e) {
  if (e.inc >= 0) { e.inc -= DT; if (e.inc <= 0) { toZombie(e); return; } }
  e.th -= DT; if (e.th <= 0) { e.th = rnd(.25, .45); thinkCivilian(e); }
  switch (e.st) {
    case 0:
      e.wt -= DT;
      if (e.wt <= 0) {
        e.wt = rnd(3, 14);
        if (Math.random() < .12) { const b = nearBuildings(e.x, e.y, 120, b => b.occ.length < b.cap); if (b && setPath(e, b.ex, b.ey, false)) { e.st = 3; e.tgt = b; return; } }
        const p = randWalk(e.x, e.y, 70); if (p && setPath(e, p[0], p[1], false)) e.st = 1;
      }
      break;
    case 1: if (!follow(e, 2.2, false)) { e.st = 0; } break;
    case 2:
      e.ft -= DT;
      if (!moveDir(e, e.hx, e.hy, 4.6, false)) { const a = Math.atan2(e.hy, e.hx) + rnd(-1.2, 1.2); e.hx = Math.cos(a); e.hy = Math.sin(a); }
      break;
    case 3: {
      const b = e.tgt;
      if (!e.path) { if (Math.hypot(b.ex - e.x, b.ey - e.y) > 3) { e.st = 0; break; } }
      else follow(e, 4.4, false);
      if (Math.hypot(b.ex - e.x, b.ey - e.y) < 3) {
        if (b.occ.length < b.cap) { b.occ.push(e); e.st = 4; e.b = b.idx; e.inT = rnd(20, 100); e.path = null; }
        else e.st = 0;
      }
      break;
    }
    case 4:
      e.inT -= DT;
      if (e.inT <= 0) { const b = B[e.b]; if (b.siege < 1) { b.occ = b.occ.filter(o => o !== e); e.b = -1; e.x = b.ex; e.y = b.ey; e.st = 0; e.wt = rnd(0, 3); } else e.inT = 5; }
      break;
    case 5: {
      const z = e.tgt;
      if (!z || z.dead || z.k !== K_ZOM || e.ammo <= 0) { e.st = 0; break; }
      const d = Math.hypot(z.x - e.x, z.y - e.y);
      if (d < 6) { e.st = 2; e.ft = 2; e.hx = (e.x - z.x) / (d || 1); e.hy = (e.y - z.y) / (d || 1); break; }
      e.cd -= DT;
      if (e.cd <= 0 && d < 36 && seeLine(e.x, e.y, z.x, z.y)) { e.cd = 1.1; e.ammo--; shoot(e, z, 36, 1); }
      break;
    }
  }
}
function stepUnit(e) {
  if (e.inc >= 0) { e.inc -= DT; if (e.inc <= 0) { toZombie(e); return; } }
  const rng = e.k === K_SOL || e.k === K_SEN ? 70 : 42, rate = e.k === K_POL ? .9 : .5, dmg = e.k === K_POL ? 1.5 : 3, mobile = e.k !== K_SEN;
  e.cd -= DT; e.th -= DT;
  if (e.th <= 0) {
    e.th = rnd(.2, .35);
    e.tgt = nearestZ(e.x, e.y, rng + 15);
  }
  const z = e.tgt;
  if (z && !z.dead && z.k === K_ZOM) {
    const d = Math.hypot(z.x - e.x, z.y - e.y);
    if (d < 7) { if (mobile || d < 3) moveDir(e, (e.x - z.x) / (d || 1), (e.y - z.y) / (d || 1), 4.4, false); }
    else if (d > rng * .75 && mobile) { moveTo(e, z.x, z.y, e.k === K_SOL ? 4.4 : 4, false); }
    if (d <= rng && e.cd <= 0 && seeLine(e.x, e.y, z.x, z.y)) { e.cd = rate; shoot(e, z, rng, dmg); }
    e.path = null; e.wt = 1;
    return;
  }
  if (!mobile) return;
  if (e.path) { if (!follow(e, 4, false)) e.wt = rnd(2, 6) * (1.6 - cfg.patrol / 100 * 1.4) * 4; return; }
  e.wt -= DT;
  if (e.wt <= 0) {
    const p = randWalk(e.hmx, e.hmy, 240, true);
    if (p) setPath(e, p[0], p[1], false);
    e.wt = 1;
  }
}
function thinkZombie(e) {
  const vis = zVision();
  const h = nearestH(e.x, e.y, vis);
  if (h) { e.tgt = h; e.st = 1; e.lost = 0; return; }
  if (e.st === 1 && e.tgt && !e.tgt.dead && e.tgt.st !== 4 && e.tgt.k !== K_ZOM && Math.hypot(e.tgt.x - e.x, e.tgt.y - e.y) < vis * 1.6 && (e.lost = (e.lost || 0) + .3) < 6) return;
  if (e.st === 1) { e.st = 0; e.tgt = null; e.wt = 0; }
  // Geräusche
  let bn = null, bd = 1e9;
  for (const n of noises) { const d = Math.hypot(n.x - e.x, n.y - e.y); if (d < n.r && d < bd && d > 8) { bd = d; bn = n; } }
  if (bn && e.st !== 2 || (bn && e.pt <= 0)) { if (setPath(e, bn.x + rnd(-6, 6), bn.y + rnd(-6, 6), true)) { e.st = 2; e.pt = 3; } return; }
  if (e.st === 2 && !e.path) e.st = 0;
}
function stepZombie(e) {
  e.th -= DT; e.pt -= DT;
  if (e.th <= 0) { e.th = rnd(.25, .4); thinkZombie(e); }
  const sp = zSpeed();
  // Belagerung
  if (e.st === 0 && e.th < .02) { const b = nearBuildings(e.x, e.y, 9, b => b.occ.length > 0); if (b) b.siege += .3 * 1; }
  if (e.st === 1) {
    const t = e.tgt; if (!t || t.dead) { e.st = 0; return; }
    const d = Math.hypot(t.x - e.x, t.y - e.y);
    e.cd -= DT;
    if (d < 1.7) {
      if (e.cd <= 0) { e.cd = 1; if (Math.random() < (t.k === K_CIV ? .85 : .55)) infect(t); }
      return;
    }
    if (d < 25 && walkLine(e.x, e.y, t.x, t.y, true)) { e.path = null; moveTo(e, t.x, t.y, sp, true); return; }
    e.pt -= 0;
    if (!e.path || e.pt <= 0) { if (setPath(e, t.x, t.y, true)) e.pt = 1.4; else if (!e.path) { e.pt = .5; moveTo(e, t.x, t.y, sp * .7, true); return; } }
    if (e.path) follow(e, sp, true);
    return;
  }
  if (e.st === 2) { if (!follow(e, sp * .9, true)) e.st = 0; return; }
  // Umherirren
  if (e.path) { follow(e, sp * .45, true); return; }
  e.wt -= DT;
  if (e.wt <= 0) {
    e.wt = rnd(2, 9);
    let tx = null;
    if (Math.random() < .6) { const b = nearBuildings(e.x, e.y, 150, b => b.occ.length > 0); if (b) { tx = [b.ex, b.ey]; } }
    if (!tx) tx = randWalk(e.x, e.y, 50);
    if (tx) setPath(e, tx[0], tx[1], true);
  }
}

// ───────────────────────── Simulationsschritt ─────────────────────────
function step() {
  simT += DT; pathBudget = 14;
  if (E.some(e => e.dead)) E = E.filter(e => !e.dead);
  for (const b of B) if (b.occ.length) b.occ = b.occ.filter(o => !o.dead);
  rebuildHash();
  for (let i = 0; i < E.length; i++) {
    const e = E[i]; if (e.dead) continue;
    if (e.k === K_ZOM) stepZombie(e);
    else if (e.k === K_CIV) stepCivilian(e);
    else stepUnit(e);
  }
  // Gebäude
  for (const b of B) {
    if (b.siege > 0) {
      b.siege -= DT * .25; if (b.siege < 0) b.siege = 0;
      if (b.occ.length && b.siege > 7 + b.occ.length * .4) breach(b, .7);
    }
  }
  // Barrikaden
  for (let i = 1; i < BAR.length; i++) { const b = BAR[i]; if (b && b.hp <= 0) { for (const c of b.cells) barId[c] = 0; BAR[i] = null; } }
  // Effekte
  for (let i = noises.length - 1; i >= 0; i--) { noises[i].t -= DT; if (noises[i].t <= 0) noises.splice(i, 1); }
  for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].t -= DT; if (tracers[i].t <= 0) tracers.splice(i, 1); }
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t -= DT;
    if (f.t <= 0 && !f.done) {
      f.done = true;
      if (f.type === 'strike') explode(f.x, f.y, 30);
      else if (f.type === 'supply') drop(f.x, f.y);
      f.t = .7; f.after = true;
    }
    if (f.t <= 0 && f.after) fx.splice(i, 1);
  }
  for (const k in cooldown) if (cooldown[k] > 0) cooldown[k] -= DT;
  S.histT -= DT;
  if (S.histT <= 0) { S.histT = 2; record(); }
}
function counts() {
  const c = { civ: 0, inf: 0, zom: 0, pol: 0, mil: 0 };
  for (const e of E) {
    if (e.dead) continue;
    if (e.k === K_ZOM) c.zom++;
    else if (e.k === K_CIV) { c.civ++; if (e.inc >= 0) c.inf++; }
    else if (e.k === K_POL) { c.pol++; if (e.inc >= 0) c.inf++; }
    else { c.mil++; if (e.inc >= 0) c.inf++; }
  }
  return c;
}
function record() {
  const c = counts();
  S.hist.push([Math.round(simT), c.civ, c.inf, c.zom, S.kills, c.pol + c.mil]);
  if (c.zom > S.peakZ) { S.peakZ = c.zom; S.peakZt = simT; }
  if (S.hist.length > 4000) S.hist = S.hist.filter((_, i) => i % 2 === 0);
  if (phase === 'run' && !finished && simT > 5) {
    if (c.civ + c.pol + c.mil === 0) endGame('Die Menschheit von Moosburg ist gefallen.');
    else if (c.zom === 0 && c.inf === 0) endGame('Der Ausbruch wurde eingedämmt!');
  }
}
function explode(x, y, r) {
  for (const e of E) if (!e.dead && e.st !== 4 && Math.hypot(e.x - x, e.y - y) < r) kill(e);
  for (const b of B) if (Math.hypot(b.x - x, b.y - y) < r * .8) { for (const o of b.occ) kill(o); b.occ = []; }
  for (let i = 1; i < BAR.length; i++) { const b = BAR[i]; if (b && Math.hypot(b.x - x, b.y - y) < r) b.hp = 0; }
  noise(x, y, 450);
}
function drop(x, y) {
  for (const e of E) if (!e.dead && e.k === K_CIV && e.st !== 4 && Math.hypot(e.x - x, e.y - y) < 35) { if (!e.armed && Math.random() < .8) { arm(e); e.brave = Math.random() < .7; } else if (e.armed) e.ammo += 14; }
}

// ───────────────────────── Interventionen ─────────────────────────
function useTool(tool, x, y, x2, y2) {
  if (phase !== 'run' && tool !== 'infect') return;
  if (tool !== 'infect' && cooldown[tool] > 0) return toast('Noch ' + Math.ceil(cooldown[tool]) + ' s Abklingzeit');
  if (tool === 'infect') {
    if (phase === 'setup') { markers.push({ x, y }); return; }
    const p = randWalk(x, y, 8) || [x, y]; spawnZombie(p[0], p[1]); return;
  }
  if (tool === 'barricade') {
    const dx = x2 - x, dy = y2 - y, len = Math.hypot(dx, dy);
    if (len < 6) { x2 = x + 12; y2 = y; } else if (len > 50) { x2 = x + dx / len * 50; y2 = y + dy / len * 50; }
    const cells = new Set(), n = Math.ceil(Math.hypot(x2 - x, y2 - y) / 1.5);
    for (let i = 0; i <= n; i++) { const t = i / n, c = cellIdx(x + (x2 - x) * t, y + (y2 - y) * t); if (type[c] <= T_ROAD) cells.add(c); }
    if (!cells.size) return toast('Hier ist kein Platz für eine Barrikade');
    const id = BAR.length; for (const c of cells) barId[c] = id;
    BAR.push({ cells: [...cells], hp: 60 + cells.size * 35, max: 60 + cells.size * 35, x: (x + x2) / 2, y: (y + y2) / 2 });
  } else if (tool === 'strike') fx.push({ type: 'strike', x, y, t: 2.4, r: 30 });
  else if (tool === 'supply') fx.push({ type: 'supply', x, y, t: 1.6, r: 35 });
  else if (tool === 'garrison') {
    for (let i = 0; i < 6; i++) { const p = randWalk(x, y, 9) || randWalk(x, y, 30); if (!p) continue; const e = mk(K_SEN, p[0], p[1]); e.acc = .8; e.armed = true; E.push(e); }
  }
  cooldown[tool] = CD_MAX[tool]; S.used[tool]++;
}

// ───────────────────────── Speichern / Laden ─────────────────────────
const SAVE_KEY = n => 'zos_moosburg_slot' + n;
function serialize() {
  return {
    v: 1, ts: Date.now(), simT, cfg, markers, S, cooldown,
    E: E.filter(e => !e.dead).map(e => [e.k, +e.x.toFixed(1), +e.y.toFixed(1), e.hp, +e.inc.toFixed(1), e.ammo, e.acc, e.armed ? 1 : 0, e.b, e.brave ? 1 : 0, +e.inT.toFixed(1), e.hmx, e.hmy]),
    bar: BAR.filter(Boolean).map(b => ({ cells: b.cells, hp: b.hp, max: b.max, x: b.x, y: b.y })),
    siege: B.filter(b => b.siege > 0).map(b => [b.idx, b.siege])
  };
}
function deserialize(d) {
  cfg = { ...DEFAULTS, ...d.cfg }; markers = d.markers || []; S = d.S; simT = d.simT; cooldown = d.cooldown; finished = false;
  noises = []; tracers = []; fx = []; barId.fill(0); BAR = [null];
  for (const b of B) { b.occ = []; b.siege = 0; }
  E = d.E.map(a => { const e = mk(a[0], a[1], a[2]); e.hp = a[3]; e.inc = a[4]; e.ammo = a[5]; e.acc = a[6]; e.armed = !!a[7]; e.b = a[8]; e.brave = !!a[9]; e.inT = a[10]; e.hmx = a[11]; e.hmy = a[12]; if (e.b >= 0 && B[e.b]) { e.st = 4; B[e.b].occ.push(e); } else e.b = -1; return e; });
  for (const b of d.bar) { const id = BAR.length; for (const c of b.cells) barId[c] = id; BAR.push(b); }
  for (const [i, s] of d.siege) B[i].siege = s;
}
function slotInfo(n) { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY(n))); return d; } catch (e) { return null; } }
function saveSlot(n) {
  try { localStorage.setItem(SAVE_KEY(n), JSON.stringify(serialize())); return true; }
  catch (e) { toast('Speichern fehlgeschlagen (Speicher voll?)'); return false; }
}
function loadSlot(n) {
  const d = slotInfo(n); if (!d) return toast('Kein Spielstand vorhanden');
  deserialize(d); startRun(true); toast('Spielstand geladen');
}

// ───────────────────────── Kamera & Zeichnen ─────────────────────────
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let VW = 0, VH = 0, dpr = 1;
const cam = { x: WW / 2, y: WH / 2, z: .5 };
let minZ = .2;
function resize() {
  dpr = window.devicePixelRatio || 1; VW = innerWidth; VH = innerHeight;
  cv.width = VW * dpr; cv.height = VH * dpr;
  minZ = Math.min(VW / WW, VH / WH) * .9;
  cam.z = Math.max(cam.z, minZ);
}
const w2s = (x, y) => [(x - cam.x) * cam.z + VW / 2, (y - cam.y) * cam.z + VH / 2];
const s2w = (x, y) => [(x - VW / 2) / cam.z + cam.x, (y - VH / 2) / cam.z + cam.y];
function fitCam() { resize(); cam.x = WW / 2; cam.y = WH / 2; cam.z = minZ / .9; }

let toolSel = 'pan', drag = null, hover = null;
const COL = { civ: '#f1f5f2', armed: '#ffe066', inf: '#f0a030', zom: '#58c24a', pol: '#4a8bff', sol: '#c8b04a' };
function draw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b0f0c'; ctx.fillRect(0, 0, VW, VH);
  ctx.imageSmoothingEnabled = true;
  ctx.save();
  ctx.translate(VW / 2 - cam.x * cam.z, VH / 2 - cam.y * cam.z); ctx.scale(cam.z, cam.z);
  ctx.drawImage(mapCv, 0, 0, WW, WH);
  // Barrikaden
  for (let i = 1; i < BAR.length; i++) {
    const b = BAR[i]; if (!b) continue;
    ctx.fillStyle = b.hp / b.max > .5 ? '#a8742f' : '#7a4a22';
    for (const c of b.cells) ctx.fillRect((c % GW) * CELL, (c / GW | 0) * CELL, CELL, CELL);
  }
  // Geräusche
  ctx.lineWidth = 1 / cam.z;
  for (const n of noises) { const k = 1 - n.t / 6; ctx.strokeStyle = `rgba(255,255,255,${.18 * (1 - k)})`; ctx.beginPath(); ctx.arc(n.x, n.y, n.r * Math.min(1, k * 4), 0, 6.283); ctx.stroke(); }
  // Marker (Setup)
  if (phase === 'setup') for (const m of markers) { const p = 6 + Math.sin(performance.now() / 250) * 2; ctx.strokeStyle = '#58c24a'; ctx.lineWidth = 2 / cam.z; ctx.beginPath(); ctx.arc(m.x, m.y, p * 2, 0, 6.283); ctx.stroke(); ctx.fillStyle = '#58c24a'; ctx.beginPath(); ctx.arc(m.x, m.y, 3, 0, 6.283); ctx.fill(); }
  // Entitäten
  const r = Math.max(1.3, 1.5 * cam.z) / cam.z;
  const groups = { civ: [], armed: [], inf: [], zom: [], pol: [], sol: [] };
  const x0 = cam.x - VW / 2 / cam.z - 5, x1 = cam.x + VW / 2 / cam.z + 5, y0 = cam.y - VH / 2 / cam.z - 5, y1 = cam.y + VH / 2 / cam.z + 5;
  for (const e of E) {
    if (e.dead || e.st === 4 && e.k !== K_ZOM || e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1) continue;
    (e.k === K_ZOM ? groups.zom : e.inc >= 0 ? groups.inf : e.k === K_CIV ? (e.armed ? groups.armed : groups.civ) : e.k === K_POL ? groups.pol : groups.sol).push(e);
  }
  for (const g in groups) {
    ctx.fillStyle = COL[g]; ctx.beginPath();
    for (const e of groups[g]) { ctx.moveTo(e.x + r, e.y); ctx.arc(e.x, e.y, r, 0, 6.283); }
    ctx.fill();
    if (cam.z > 1.4) { ctx.strokeStyle = '#000a'; ctx.lineWidth = .3; ctx.stroke(); }
  }
  // Schüsse
  ctx.lineWidth = 1.2 / cam.z + .15; ctx.strokeStyle = '#ffe9a0';
  ctx.beginPath(); for (const t of tracers) { ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); } ctx.stroke();
  // Effekte
  for (const f of fx) {
    if (!f.done) {
      const p = .5 + .5 * Math.sin(performance.now() / 90);
      ctx.strokeStyle = f.type === 'strike' ? `rgba(255,70,50,${.4 + .5 * p})` : `rgba(80,170,255,${.4 + .5 * p})`; ctx.lineWidth = 2 / cam.z;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 6.283); ctx.stroke();
    } else if (f.type === 'strike') { const k = 1 - f.t / .7; ctx.fillStyle = `rgba(255,${200 - 120 * k | 0},60,${.8 * (1 - k)})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (.6 + .6 * k), 0, 6.283); ctx.fill(); }
  }
  // Vorschau
  if (hover && phase !== 'x') {
    if (toolSel === 'barricade' && drag && drag.tool) { ctx.strokeStyle = '#d99a4a'; ctx.lineWidth = CELL; ctx.globalAlpha = .6; ctx.beginPath(); ctx.moveTo(drag.wx, drag.wy); ctx.lineTo(hover[0], hover[1]); ctx.stroke(); ctx.globalAlpha = 1; }
    else if (toolSel === 'strike' || toolSel === 'supply' || toolSel === 'garrison') { ctx.strokeStyle = '#fff6'; ctx.lineWidth = 1.5 / cam.z; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(hover[0], hover[1], toolSel === 'strike' ? 30 : toolSel === 'supply' ? 35 : 9, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); }
  }
  ctx.restore();
}

// ───────────────────────── Eingabe ─────────────────────────
const ptrs = new Map();
let pinch = null;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z }; drag = null; return; }
  const [wx, wy] = s2w(e.clientX, e.clientY);
  const pan = toolSel === 'pan' || e.button === 2 || e.button === 1;
  drag = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, pan, tool: !pan, wx, wy, moved: false };
  if (pan) cv.style.cursor = 'grabbing';
});
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (p) { p.x = e.clientX; p.y = e.clientY; }
  hover = s2w(e.clientX, e.clientY);
  if (ptrs.size === 2 && pinch) {
    const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    cam.z = clamp(pinch.z * d / pinch.d, minZ, 6); return;
  }
  if (drag) {
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) drag.moved = true;
    if (drag.pan) { cam.x = drag.cx - (e.clientX - drag.sx) / cam.z; cam.y = drag.cy - (e.clientY - drag.sy) / cam.z; clampCam(); }
  }
});
function endPtr(e) {
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
  cv.style.cursor = 'grab';
  if (drag && drag.tool) {
    const [wx, wy] = s2w(e.clientX, e.clientY);
    if (toolSel === 'barricade') useTool('barricade', drag.wx, drag.wy, drag.moved ? wx : drag.wx, drag.moved ? wy : drag.wy);
    else if (!drag.moved) useTool(toolSel, wx, wy);
  }
  drag = null;
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', e => { drag = null; ptrs.delete(e.pointerId); pinch = null; });
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const [wx, wy] = s2w(e.clientX, e.clientY);
  cam.z = clamp(cam.z * Math.exp(-e.deltaY * .0015), minZ, 6);
  cam.x = wx - (e.clientX - VW / 2) / cam.z; cam.y = wy - (e.clientY - VH / 2) / cam.z; clampCam();
}, { passive: false });
function clampCam() { cam.x = clamp(cam.x, 0, WW); cam.y = clamp(cam.y, 0, WH); }

// ───────────────────────── UI ─────────────────────────
const $ = id => document.getElementById(id);
function toast(t) { const el = $('toast'); el.textContent = t; el.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(() => el.style.display = 'none', 2200); }
const SL = { pop: ['vPop', v => v], inf0: ['vInf0', v => v], armed: ['vArmed', v => v + ' %'], acc: ['vAcc', v => v + ' %'], police: ['vPolice', v => v], mil: ['vMil', v => v], patrol: ['vPatrol', v => v < 25 ? 'selten' : v < 70 ? 'mittel' : 'häufig'], infT: ['vInfT', v => v + ' s'], zs: ['vZs', v => v < 33 ? 'klassisch' : v < 70 ? 'gemischt' : 'modern'] };
function syncSliders() { for (const k in SL) { $(k).value = cfg[k]; $(SL[k][0]).textContent = SL[k][1](+cfg[k]); } }
for (const k in SL) $(k).addEventListener('input', () => { cfg[k] = +$(k).value; $(SL[k][0]).textContent = SL[k][1](cfg[k]); });
function setSpeed(s) { speed = s; for (const n of [0, 1, 2, 4]) $('sp' + n).classList.toggle('on', n === s); }
for (const n of [0, 1, 2, 4]) $('sp' + n).onclick = () => setSpeed(n);
document.querySelectorAll('#tools button').forEach(b => b.onclick = () => { toolSel = b.dataset.tool; document.querySelectorAll('#tools button').forEach(x => x.classList.toggle('on', x === b)); cv.style.cursor = toolSel === 'pan' ? 'grab' : 'crosshair'; });
function startRun(loaded) {
  phase = 'run'; $('setup').style.display = 'none'; finished = false;
  if (!loaded) newSim();
  setSpeed(1); acc = 0;
}
$('bStart').onclick = () => { newSim(); startRun(true); autosave(); };
$('bResume').onclick = () => loadSlot(0);
$('bMenu').onclick = () => modal(`<h2>Neue Simulation</h2><p>Aktuelle Simulation verwerfen und zur Konfiguration zurückkehren? (Nicht gespeicherter Fortschritt geht verloren.)</p><div class="btns"><button class="big" id="mYes">Ja, neu konfigurieren</button><button id="mNo">Abbrechen</button></div>`, () => {
  $('mYes').onclick = () => { closeModal(); phase = 'setup'; E = []; BAR = [null]; barId.fill(0); fx = []; noises = []; tracers = []; for (const b of B) { b.occ = []; b.siege = 0; } markers = []; finished = false; $('setup').style.display = ''; setSpeed(0); refreshResume(); };
  $('mNo').onclick = closeModal;
});
function modal(html, init) { $('mbox').innerHTML = html; $('modal').style.display = 'flex'; if (init) init(); }
function closeModal() { $('modal').style.display = 'none'; }
$('modal').addEventListener('pointerdown', e => { if (e.target === $('modal')) closeModal(); });
const fmtT = t => { t = Math.round(t); return String(t / 60 | 0).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
function slotsHtml(mode) {
  let h = `<h2>${mode === 'save' ? 'Speichern' : 'Laden'}</h2>`;
  for (const n of [1, 2, 3, 0]) {
    const d = slotInfo(n), name = n === 0 ? 'Autosave' : 'Slot ' + n;
    const info = d ? `${new Date(d.ts).toLocaleString('de-DE')} · Zeit ${fmtT(d.simT)} · ${d.E.filter(a => a[0] === 1).length} Zombies` : 'leer';
    h += `<div class="slot"><div><b>${name}</b><small>${info}</small></div><div>` +
      (mode === 'save' ? (n === 0 ? '' : `<button data-act="save" data-n="${n}">Speichern</button>`) : `<button data-act="load" data-n="${n}" ${d ? '' : 'disabled'}>Laden</button>`) +
      (d && n ? ` <button data-act="del" data-n="${n}">🗑</button>` : '') + `</div></div>`;
  }
  return h + `<div class="btns"><button id="mNo">Schließen</button></div>`;
}
function slotModal(mode) {
  modal(slotsHtml(mode), () => {
    $('mNo').onclick = closeModal;
    $('mbox').querySelectorAll('button[data-act]').forEach(b => b.onclick = () => {
      const n = +b.dataset.n;
      if (b.dataset.act === 'save') { if (saveSlot(n)) { toast('Gespeichert in Slot ' + n); slotModal(mode); } }
      else if (b.dataset.act === 'load') { closeModal(); loadSlot(n); }
      else { localStorage.removeItem(SAVE_KEY(n)); slotModal(mode); }
    });
  });
}
$('bSave').onclick = () => { if (phase !== 'run') return toast('Erst die Simulation starten'); slotModal('save'); };
$('bLoad').onclick = () => slotModal('load');
function endGame(msg) {
  finished = true; setSpeed(0); autosave();
  showStats(msg);
}
function showStats(title) {
  if (!S) return;
  const c = counts(), st = S;
  modal(`<h2>${title || 'Analyse'}</h2>
  <canvas id="chart" width="600" height="220" style="width:100%;height:auto;background:#10161200"></canvas>
  <div class="leg"><span><i style="background:#f1f5f2"></i>Zivilisten</span><span><i style="background:#f0a030"></i>Infizierte</span><span><i style="background:#58c24a"></i>Zombies</span><span><i style="background:#4a8bff"></i>Einsatzkräfte</span></div>
  <table style="margin-top:10px">
  <tr><td>Simulationsdauer</td><td>${fmtT(simT)}</td></tr>
  <tr><td>Überlebende Zivilisten</td><td>${c.civ} von ${cfg.pop}</td></tr>
  <tr><td>Zombies aktuell / Spitzenwert</td><td>${c.zom} / ${st.peakZ} (bei ${fmtT(st.peakZt)})</td></tr>
  <tr><td>Verwandlungen insgesamt</td><td>${st.zombified}</td></tr>
  <tr><td>Zombies eliminiert</td><td>${st.kills}</td></tr>
  <tr><td>Verluste durch Eingriffe (Luftschläge)</td><td>${st.loss}</td></tr>
  <tr><td>Infizierende Bisse</td><td>${st.bites}</td></tr>
  <tr><td>Abgegebene Schüsse</td><td>${st.shots}</td></tr>
  <tr><td>Aufgebrochene Gebäude</td><td>${st.breaches}</td></tr>
  <tr><td>Eingriffe (Barrikaden / Luftschläge / Versorgung / Garnisonen)</td><td>${st.used.barricade} / ${st.used.strike} / ${st.used.supply} / ${st.used.garrison}</td></tr></table>
  <div class="btns"><button id="mNo" class="big">Weiter</button></div>`, () => {
    $('mNo').onclick = closeModal; drawChart($('chart'), st.hist);
  });
}
function drawChart(cv, h) {
  const c = cv.getContext('2d'), W = cv.width, H = cv.height, pl = 36, pb = 22, pt = 8;
  c.clearRect(0, 0, W, H);
  if (h.length < 2) return;
  const tmax = h[h.length - 1][0] || 1; let vmax = 1; for (const r of h) vmax = Math.max(vmax, r[1], r[2], r[3]);
  c.strokeStyle = '#2c3a31'; c.fillStyle = '#8da294'; c.font = '11px system-ui'; c.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const y = pt + (H - pt - pb) * i / 4; c.beginPath(); c.moveTo(pl, y); c.lineTo(W - 6, y); c.stroke(); c.fillText(Math.round(vmax * (1 - i / 4)), 2, y + 4); }
  for (let i = 0; i <= 4; i++) { const x = pl + (W - pl - 6) * i / 4; c.fillText(fmtT(tmax * i / 4), x - 12, H - 6); }
  const line = (idx, col) => { c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); h.forEach((r, i) => { const x = pl + (W - pl - 6) * r[0] / tmax, y = pt + (H - pt - pb) * (1 - r[idx] / vmax); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke(); };
  line(1, '#f1f5f2'); line(2, '#f0a030'); line(3, '#58c24a'); line(5, '#4a8bff');
}
$('bStats').onclick = () => showStats('Analyse');
function refreshResume() { $('bResume').style.display = slotInfo(0) ? '' : 'none'; }
function autosave() { if (phase === 'run' && S && !loading) saveSlot(0); }
let loading = false;
setInterval(() => { if (speed > 0 || finished) autosave(); }, 20000);
document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(); });
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.key === ' ') { e.preventDefault(); setSpeed(speed ? 0 : 1); }
  else if (e.key === '1') setSpeed(1); else if (e.key === '2') setSpeed(2); else if (e.key === '3' || e.key === '4') setSpeed(4);
});
let hudT = 0;
function updateHud() {
  const c = counts(), g = (id, v) => { const el = $(id); if (el.textContent != v) el.textContent = v; };
  g('hCiv', c.civ); g('hInf', c.inf); g('hZom', c.zom); g('hPol', c.pol); g('hMil', c.mil);
  g('hKill', S ? S.kills : 0); g('hLoss', S ? S.loss : 0); g('clock', fmtT(simT));
  document.querySelectorAll('#tools button').forEach(b => { const k = b.dataset.tool, el = b.querySelector('.cd'); if (el) el.style.width = (cooldown[k] > 0 ? cooldown[k] / CD_MAX[k] * 100 : 0) + '%'; });
}

// ───────────────────────── Hauptschleife ─────────────────────────
let last = performance.now();
function frame(ts) {
  const rdt = Math.min(.1, (ts - last) / 1000); last = ts;
  if (phase === 'run' && speed > 0) {
    acc += rdt * speed; let n = 0;
    while (acc >= DT && n < 12) { step(); acc -= DT; n++; }
    if (n >= 12) acc = 0;
  }
  draw();
  if (ts - hudT > 200) { hudT = ts; updateHud(); }
  requestAnimationFrame(frame);
}
function init() {
  const t0 = performance.now();
  buildGrid(); buildBuildings(); renderMap();
  syncSliders(); refreshResume(); resize(); fitCam(); setSpeed(0);
  addEventListener('resize', resize);
  console.log('Init', Math.round(performance.now() - t0), 'ms; Gebäude:', B.length, 'Raster', GW, GH);
  requestAnimationFrame(frame);
}
init();
window.__game = { get E() { return E; }, get S() { return S; }, cfg, cam, counts, step, setSpeed, startRun, newSim, useTool, B };
