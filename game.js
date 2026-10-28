'use strict';
/* Outbreak – The Collapse (Zombie Defense Simulator)
   Karte: OpenStreetMap-Daten (ODbL), Spielwelt in Metern, Navigationsraster 4 m. */

// ───────────────────────── Welt & Raster ─────────────────────────
const CELL = 4;
let MD = null, WW = 0, WH = 0, GW = 0, GH = 0;   // aktuelle Karte (siehe setupMap)
const T_OPEN = 0, T_ROAD = 1, T_BLD = 2, T_WATER = 3;
let type, comp, barId, gate;   // comp: 1 = Hauptzusammenhangskomponente, barId: Barrikaden-ID je Zelle
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
    for (const w of MD.water) { if (w.poly) { strokePoly(c, w.p, true); c.fill(); } else { c.lineWidth = w.w; strokePoly(c, w.p); c.stroke(); } }
  });
  const roads = rasterMask(CELL, c => {
    c.strokeStyle = '#000';
    for (const r of MD.roads) { c.lineWidth = Math.max(r.w, 6); strokePoly(c, r.p); c.stroke(); }
  });
  const blds = rasterMask(CELL, c => {
    c.fillStyle = '#000';
    for (const b of MD.blds) { strokePoly(c, b, true); c.fill(); }
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
let mapCv, ovCv;
let LAT0 = 48.4790, LON0 = 11.9280, KX = 111320 * Math.cos(48.47 * Math.PI / 180), KY = 110574;
const TILE_SRC = {
  sat: { url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, max: 18, attr: 'Bilder © Esri, Maxar, Earthstar Geographics · Daten © OpenStreetMap-Mitwirkende' },
  osm: { url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, max: 19, attr: '© OpenStreetMap-Mitwirkende' }
};
let mapMode = 'sat';
const tiles = new Map();
const w2ll = (x, y) => [LAT0 - y / KY, LON0 + x / KX];
const ll2w = (lat, lon) => [(lon - LON0) * KX, (LAT0 - lat) * KY];
const lon2t = (lon, z) => (lon + 180) / 360 * 2 ** z;
const lat2t = (lat, z) => (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z;
const t2lon = (x, z) => x / 2 ** z * 360 - 180;
const t2lat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / 2 ** z; return 180 / Math.PI * Math.atan(.5 * (Math.exp(n) - Math.exp(-n))); };
function getTile(src, z, x, y) {
  const k = src + z + '/' + x + '/' + y; let t = tiles.get(k);
  if (!t) {
    t = { img: new Image(), ok: false }; t.img.onload = () => { t.ok = true; }; t.img.onerror = () => { t.err = true; };
    t.img.src = TILE_SRC[src].url(z, x, y); tiles.set(k, t);
    if (tiles.size > 3000) { const f = tiles.keys().next().value; tiles.delete(f); }
  }
  return t;
}
function drawTiles(vx0, vy0, vx1, vy1) {
  const src = TILE_SRC[mapMode]; if (!src) return;
  const z = clamp(Math.ceil(Math.log2(103800 * cam.z)), 15, src.max);
  const [la0, lo0] = w2ll(Math.max(0, vx0), Math.max(0, vy0)), [la1, lo1] = w2ll(Math.min(WW, vx1), Math.min(WH, vy1));
  const tx0 = Math.floor(lon2t(lo0, z)), tx1 = Math.floor(lon2t(lo1, z)), ty0 = Math.floor(lat2t(la0, z)), ty1 = Math.floor(lat2t(la1, z));
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const t = getTile(mapMode, z, tx, ty);
    const [xa, ya] = ll2w(t2lat(ty, z), t2lon(tx, z)), [xb, yb] = ll2w(t2lat(ty + 1, z), t2lon(tx + 1, z));
    if (t.ok) { ctx.drawImage(t.img, xa, ya, xb - xa + .5, yb - ya + .5); continue; }
    // Platzhalter: Ausschnitt einer bereits geladenen gröberen Kachel
    for (let k = 1; k <= z - 12; k++) {
      const pz = z - k, px = tx >> k, py = ty >> k, pt = tiles.get(mapMode + pz + '/' + px + '/' + py);
      if (pt && pt.ok) { const sz = 256 >> k, sx = (tx - (px << k)) * sz, sy = (ty - (py << k)) * sz; ctx.drawImage(pt.img, sx, sy, sz, sz, xa, ya, xb - xa + .5, yb - ya + .5); break; }
    }
  }
}
function preloadTiles() {
  const src = TILE_SRC[mapMode]; if (!src) return;
  for (let z = 13; z <= Math.min(17, src.max); z++) {
    const [la0, lo0] = w2ll(0, 0), [la1, lo1] = w2ll(WW, WH);
    for (let ty = Math.floor(lat2t(la0, z)); ty <= Math.floor(lat2t(la1, z)); ty++) for (let tx = Math.floor(lon2t(lo0, z)); tx <= Math.floor(lon2t(lo1, z)); tx++) getTile(mapMode, z, tx, ty);
  }
}
function renderMap() {
  mapCv = document.createElement('canvas'); mapCv.width = WW * RS; mapCv.height = WH * RS;
  const c = mapCv.getContext('2d');
  c.scale(RS, RS); c.lineCap = 'round'; c.lineJoin = 'round';
  c.fillStyle = '#26352a'; c.fillRect(0, 0, WW, WH);
  c.fillStyle = '#1d4a73'; c.strokeStyle = '#1d4a73';
  for (const w of MD.water) { if (w.poly) { strokePoly(c, w.p, true); c.fill(); } else { c.lineWidth = w.w; strokePoly(c, w.p); c.stroke(); } }
  const rs = MD.roads.slice().sort((a, b) => a.c - b.c);
  c.strokeStyle = '#101315';
  for (const r of rs) { c.lineWidth = r.w + 2.4; strokePoly(c, r.p); c.stroke(); }
  for (const r of rs) {
    c.strokeStyle = r.c >= 4 ? '#7a8087' : r.c >= 2 ? '#626970' : r.c === 1 ? '#4e5a48' : '#6b6a52';
    c.lineWidth = r.w; strokePoly(c, r.p); c.stroke();
  }
  c.fillStyle = '#8c8176'; c.strokeStyle = '#2e2924'; c.lineWidth = 0.6;
  for (const b of MD.blds) { strokePoly(c, b, true); c.fill(); c.stroke(); }
  // Transparente Überlagerung für Satelliten-/OSM-Hintergrund
  ovCv = document.createElement('canvas'); ovCv.width = WW * RS; ovCv.height = WH * RS;
  const o = ovCv.getContext('2d'); o.scale(RS, RS); o.lineCap = 'round'; o.lineJoin = 'round';
  o.strokeStyle = 'rgba(255,255,255,.22)';
  for (const r of rs) { o.lineWidth = Math.max(.8, r.w * .35); strokePoly(o, r.p); o.stroke(); }
  o.strokeStyle = 'rgba(255,170,90,.55)'; o.fillStyle = 'rgba(255,140,60,.12)'; o.lineWidth = .5;
  for (const b of MD.blds) { strokePoly(o, b, true); o.fill(); o.stroke(); }
}

// ───────────────────────── Pfadfindung (A*) ─────────────────────────
function cost(i, zm) {
  const t = type[i];
  if (t > T_ROAD) return 0;
  if (barId[i]) return zm ? 30 : (gate[i] ? 1.2 : 0);
  return t === T_ROAD ? 1 : 1.6;
}
const walkCost = (x, y, zm) => (x < 0 || y < 0 || x >= WW || y >= WH) ? 0 : cost((y / CELL | 0) * GW + (x / CELL | 0), zm);
let gS, gD, gG, gP;
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
function findPath(sx, sy, tx, ty, zm, maxExp = 6000, smooth = true) {
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
  if (!smooth) return raw;   // Zellmitte zu Zellmitte: garantiert begehbar (kein Abkürzen über Kanten)
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
  for (const p of MD.blds) {
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
const DEFAULTS = { pop: 1000, inf0: 20, armed: 6, acc: 35, police: 8, mil: 0, patrol: 50, infT: 20, zs: 50, origin: 'edge' };
let cfg = { ...DEFAULTS };
let UL = []; const LEAD = new Map();
let E = [], BAR = [null], noises = [], tracers = [], fx = [], markers = [];
let S = null;       // Sim-Statistik
let phase = 'setup', speed = 1, acc = 0;
let cooldown = { barricade: 0, strike: 0, supply: 0, garrison: 0, evac: 0, truck: 0 };
const selected = new Set();
let simT = 0, pathBudget = 0, finished = false;
const K_CIV = 0, K_ZOM = 1, K_POL = 2, K_SOL = 3, K_SEN = 4, K_TRK = 5, K_TUR = 6;
const ZHP = 4;

// Regeln: Classic/Sandbox oder Kampagne (campaign.js setzt RULES je Mission)
function classicRules() {
  return { mode: 'classic', barLimit: 50, barHpMul: 2, ammo: false, xp: false, zmix: false, baseAcc: null,
    tools: { infect: {}, barricade: {}, demolish: {}, garrison: { pct: 25, max: 4, cd: 30 }, supply: { pct: 35, max: 5, cd: 20 }, strike: { pct: 50, max: 10, cd: 0 }, evac: { pct: 50 }, truck: { pct: 70, max: 2, cd: 2 }, siren: { at: 900, max: 1, cd: 300 } } };
}
let RULES = classicRules();
const fmtClock = t => { t = Math.round(t); return String(t / 60 | 0).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
function toolGate(tool) {
  const t = RULES.tools[tool]; if (!t) return { hidden: true };
  let locked = false, label = '', why = '';
  if (t.at != null) { if (simT < t.at) { locked = true; label = 'ab ' + fmtClock(t.at); why = 'Verfügbar ab ' + fmtClock(t.at) + ' Spielzeit'; } }
  else if (t.pct != null) { const pc = lostPct(); if (pc < t.pct) { locked = true; label = 'ab ' + t.pct + ' % (' + pc.toFixed(0) + ')'; why = `Erst verfügbar, wenn ${t.pct} % der Bevölkerung tot oder verwandelt sind (aktuell ${pc.toFixed(0)} %)`; } }
  const used = S && S.used[tool] || 0, left = t.max != null ? t.max - used : 99;
  return { hidden: false, locked, label, why, left, max: t.max, cd: t.cd || 0 };
}
function newStats() { return { plans: [], planId: 0, kills: 0, loss: 0, shots: 0, bites: 0, breaches: 0, zombified: 0, peakZ: 0, peakZt: 0, hist: [], sirens: [], used: { barricade: 0, strike: 0, supply: 0, garrison: 0, evac: 0, truck: 0 }, ev: { civ: 0, pol: 0, mil: 0, trk: 0 }, evac: null, evacT: 10, evacUnits: false, histT: 0 }; }
let uidN = 0;
function mk(k, x, y) { return { id: ++uidN, k, x, y, hp: k === K_ZOM ? ZHP : 3, st: 0, path: null, pi: 0, th: rnd(0, .4), cd: 0, ammo: 0, acc: 0, armed: false, inc: -1, b: -1, brave: false, wt: rnd(0, 8), tgt: null, dead: false, inT: 0, hx: 0, hy: 0, ft: 0, hmx: x, hmy: y, pt: 0, bt: 0, ord: false, g: 0, sq: 0, kills: 0, lvl: 1, snipe: false, sil: false, ds: 0, dt: 0, pend: null, patrol: null, gsp: 0, lx: x, ly: y, ae: 0 }; }
const zSpeed = () => 1.5 + cfg.zs / 100 * 6.8;
const zVision = () => 60 + cfg.zs / 100 * 60;

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
// Nächste begehbare Zelle der Hauptkomponente (Ringsuche) – z. B. wenn ein Startpunkt in einem Gebäude liegt
function nearestWalkCell(x, y, maxR = 40) {
  const gx = x / CELL | 0, gy = y / CELL | 0;
  for (let r = 0; r <= maxR; r++) {
    let best = -1, bd = 1e9;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const cx = gx + dx, cy = gy + dy; if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) continue;
      const i = cy * GW + cx; if (!comp[i] || barId[i]) continue;
      const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) return [(best % GW + .5) * CELL, ((best / GW | 0) + .5) * CELL];
  }
  return null;
}
function anyWalk(roadOnly) {
  for (let n = 0; n < 500; n++) { const p = randWalk(rnd(0, WW), rnd(0, WH), 0, roadOnly); if (p) return p; }
  return [WW / 2, WH / 2];
}
function spawnCivilian(inside, ymax) {
  let e;
  if (inside && B.length) {
    let b = B[Math.random() * B.length | 0];
    if (ymax) for (let t = 0; t < 40 && b.ey > ymax; t++) b = B[Math.random() * B.length | 0];
    if (b.occ.length < b.cap) { e = mk(K_CIV, b.ex, b.ey); e.st = 4; e.b = b.idx; e.inT = rnd(10, 90); b.occ.push(e); }
  }
  if (!e) { const p = (ymax && randWalk(rnd(0, WW), rnd(0, ymax), 40)) || anyWalk(Math.random() < .7); e = mk(K_CIV, p[0], p[1]); }
  e.brave = Math.random() < .5;
  if (Math.random() * 100 < cfg.armed) arm(e);
  E.push(e);
}
function spawnCivilianZone(inside) {   // Kampagne: alle Zivilisten innerhalb eines Rechtecks (z. B. hinter der Sperre)
  const z = RULES.civZone; let e;
  if (z.discs) {   // mehrere Kreisgebiete (gleichmäßig verteilt)
    const d = z.discs[z.dn = ((z.dn || 0) + 1) % z.discs.length];
    if (inside) {
      const bs = d.bs || (d.bs = B.filter(b => Math.hypot(b.ex - d.x, b.ey - d.y) < d.r)), b = bs.length ? bs[Math.random() * bs.length | 0] : null;
      if (b && b.occ.length < b.cap) { e = mk(K_CIV, b.ex, b.ey); e.st = 4; e.b = b.idx; e.inT = rnd(10, 90); b.occ.push(e); }
    }
    if (!e) { const p = randWalk(d.x, d.y, d.r) || randWalk(d.x, d.y, d.r * 2) || [d.x, d.y]; e = mk(K_CIV, p[0], p[1]); }
    e.brave = Math.random() < .5; if (Math.random() * 100 < cfg.armed) arm(e);
    E.push(e); return;
  }
  if (inside) {
    const bs = z.bs || (z.bs = B.filter(b => b.ex > z.x0 && b.ex < z.x1 && b.ey > z.y0 && b.ey < z.y1));
    const b = bs.length ? bs[Math.random() * bs.length | 0] : null;
    if (b && b.occ.length < b.cap) { e = mk(K_CIV, b.ex, b.ey); e.st = 4; e.b = b.idx; e.inT = rnd(10, 90); b.occ.push(e); }
  }
  if (!e) { let p = null; for (let t = 0; t < 20 && !p; t++) p = randWalk(rnd(z.x0, z.x1), rnd(z.y0, z.y1), 25); p = p || [(z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2]; e = mk(K_CIV, p[0], p[1]); }
  e.brave = Math.random() < .5;
  E.push(e);
}
function arm(e) { e.armed = true; e.ammo = 14; e.acc = cfg.acc / 100; }
function spawnZombie(x, y, mkId) { const e = mk(K_ZOM, x, y); if (mkId) e.mk = mkId; e.st = 0; e.wt = rnd(0, 5); if (RULES.zmix) e.zsp = Math.random() < .5 ? rnd(1.5, 3) : rnd(5, 8); E.push(e); return e; }

function outbreakPoints() {
  const pts = [];
  if (cfg.origin === 'center') {
    const n = clamp(Math.ceil(cfg.inf0 / 40), 1, 4);
    for (let i = 0; i < n; i++) pts.push({ x: WW / 2 + rnd(-120, 120), y: WH / 2 + rnd(-120, 120) });
  } else {
    const n = clamp(Math.ceil(cfg.inf0 / 15), 2, 12);
    for (let i = 0; i < n; i++) {
      const side = Math.random() * 4 | 0, m = 20;
      pts.push(side === 0 ? { x: rnd(m, WW - m), y: m } : side === 1 ? { x: rnd(m, WW - m), y: WH - m } : side === 2 ? { x: m, y: rnd(m, WH - m) } : { x: WW - m, y: rnd(m, WH - m) });
    }
  }
  return pts;
}
// Polizei tritt in Zweier-, Militär in Vierer-Squads auf; ein Rest bildet einen kleineren Squad
function spawnSquads(kind, total, size, acc) {
  for (let left = total; left > 0; left -= size) {
    const n = Math.min(size, left), id = ++gidN, c = anyWalk(true);
    for (let j = 0; j < n; j++) {
      const p = randWalk(c[0], c[1], 5) || c; const e = mk(kind, p[0], p[1]);
      e.hmx = c[0]; e.hmy = c[1]; e.acc = acc; e.armed = true; e.g = id; e.sq = id; E.push(e);
    }
  }
}
function newSim() {
  E = []; BAR = [null]; barId.fill(0); gate.fill(0); noises = []; tracers = []; fx = []; simT = 0; finished = false; MF.clear();
  for (const b of B) { b.occ = []; b.siege = 0; }
  S = newStats(); cooldown = {}; evacDirty = false; zfDirty = true; ZF = { evac: null, lure: null };
  const inside = Math.round(cfg.pop * .5);
  const cn = RULES.civNorth; for (let i = 0; i < cfg.pop; i++) { if (RULES.civZone) spawnCivilianZone(i < inside); else spawnCivilian(i < inside, cn && Math.random() < cn.frac ? cn.ymax : 0); }
  document.getElementById('alerts').innerHTML = '';
  if (RULES.spawn) RULES.spawn();
  else {
    const mp = markers.length ? markers : outbreakPoints();
    const rad = 14 + Math.sqrt(cfg.inf0 / mp.length) * 4;
    mp.slice(0, 3).forEach((m, i) => alertAt(m.x, m.y, 'Zombies aufgetaucht' + (mp.length > 1 ? ' (Herd ' + (i + 1) + ')' : '')));
    for (let i = 0; i < cfg.inf0; i++) {
      const m = mp[i % mp.length]; const p = randWalk(m.x, m.y, rad) || randWalk(m.x, m.y, rad * 3) || anyWalk(true);
      spawnZombie(p[0], p[1]);
    }
    spawnSquads(K_POL, cfg.police, 2, .45);
    spawnSquads(K_SOL, cfg.mil, 4, .7);
  }
  record();
}

// ───────────────────────── Räumliche Hashes ─────────────────────────
const HS = 16;
let HW = 0, HH = 0, hzHead, hhHead;
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
function nearest(head, nxt, x, y, r, needSee, pred) {
  let best = null, bd = r * r, scanned = 0;
  const x0 = Math.max(0, (x - r) / HS | 0), x1 = Math.min(HW - 1, (x + r) / HS | 0), y0 = Math.max(0, (y - r) / HS | 0), y1 = Math.min(HH - 1, (y + r) / HS | 0);
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++)
    for (let i = head[gy * HW + gx]; i >= 0; i = nxt[i]) {
      if (++scanned > 150) return best;
      const e = E[i]; if (e.dead || (pred && !pred(e))) continue;
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
function healthyNear(e) {
  const x0 = Math.max(0, (e.x - 4) / HS | 0), x1 = Math.min(HW - 1, (e.x + 4) / HS | 0), y0 = Math.max(0, (e.y - 4) / HS | 0), y1 = Math.min(HH - 1, (e.y + 4) / HS | 0);
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) for (let i = hhHead[gy * HW + gx]; i >= 0; i = hhNxt[i]) { const u = E[i]; if (u !== e && !u.dead && u.inc < 0 && (u.x - e.x) ** 2 + (u.y - e.y) ** 2 < 16) return true; }
  return false;
}
function canGate(e) { if (!e || e.k === K_ZOM || (RULES.civNoGate && e.k === K_CIV)) return false; if (RULES.scan && e.inc >= 0 && !healthyNear(e)) return false; return true; }
function killBar(i) { const b = BAR[i]; if (!b) return; for (const c of b.cells) { barId[c] = 0; gate[c] = 0; } BAR[i] = null; evacDirty = true; }
function passable(x, y, zm, e) {
  if (x < 1 || y < 1 || x > WW - 1 || y > WH - 1) return false;
  const i = cellIdx(x, y), t = type[i];
  if (t > T_ROAD) return false;
  if (e && e.k === K_CIV && RULES.civLine && !S.civFree && !RULES.civLine(x, y)) return false;
  if (barId[i]) { if (gate[i] && !zm && canGate(e)) return true; if (zm) bash(barId[i]); return false; }
  return true;
}
function bash(id) { const b = BAR[id]; if (b) b.hp -= 7 * DT; }
function moveDir(e, dx, dy, sp, zm) {
  const nx = e.x + dx * sp * DT, ny = e.y + dy * sp * DT;
  if (passable(nx, ny, zm, e)) { e.x = nx; e.y = ny; return true; }
  // Teilbewegung zählt nur, wenn sie spürbar voranbringt (sonst bleibt man an einer Kante „scheinbar“ in Bewegung hängen)
  const m = Math.abs(dx) + Math.abs(dy);
  if (Math.abs(dx) > .35 * m && passable(nx, e.y, zm, e)) { e.x = nx; return true; }
  if (Math.abs(dy) > .35 * m && passable(e.x, ny, zm, e)) { e.y = ny; return true; }
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
function noise(x, y, r, fl) {
  if (noises.length > 40) noises.shift();
  noises.push({ x, y, r, t: 6, fl });
}
// Mann-Stop-Wirkung: Sturmgewehr bremst kurz aus; MG, Sniper und Schrotflinte werfen zurück (Schrot 2 Schritte); Pistole, MP und Dämpfer wirkungslos
function stopPower(e, z, d) {
  let kb = 0, stun = 0;
  if (e.k === K_TRK || e.k === K_TUR || (e.snipe && e.k !== K_POL)) kb = 1;
  else if (e.k === K_POL) kb = e.sg ? 2 : 0;
  else if (e.k === K_SOL || e.k === K_SEN) stun = e.sil ? 0 : .5;
  if (kb) {
    const ux = (z.x - e.x) / (d || 1), uy = (z.y - e.y) / (d || 1);
    for (let s = 0; s < kb; s++) {   // Schritt für Schritt, nur über begehbaren Grund
      const nx = z.x + ux * 1.2, ny = z.y + uy * 1.2;
      if (nx < 0 || ny < 0 || nx >= WW || ny >= WH || !cost(cellIdx(nx, ny), false)) break;
      z.x = nx; z.y = ny; z.path = null;
    }
    stun = .35;
  }
  if (stun > (z.stun || 0)) z.stun = stun;
}
function shoot(e, z, rng, dmg) {
  S.shots++;
  if (RULES.ammo && e.k !== K_CIV) e.ammo--;
  SFX.shot(e.x, e.y, e.k === K_TRK || e.k === K_TUR ? 'mg' : e.k === K_CIV ? 'civ' : e.k === K_POL ? 'pistol' : 'rifle');
  tracers.push({ x1: e.x, y1: e.y, x2: z.x, y2: z.y, t: .12 });
  if (!((e.k === K_TRK || e.k === K_TUR) && simT - (e.nt || 0) < .8)) { e.nt = simT; noise(e.x, e.y, (e.k === K_CIV ? 130 : e.k === K_POL ? 170 : e.k === K_TRK || e.k === K_TUR ? 260 : 230) * (e.sil ? .5 : 1) * (e.snipe ? 1.2 : 1)); }
  const d = Math.hypot(z.x - e.x, z.y - e.y);
  if (Math.random() < ((e.ae || e.acc) + (e.sg ? .1 : 0)) * (1 - .45 * d / rng)) {
    z.hp -= dmg;
    if (z.hp > 0 && z.k === K_ZOM) stopPower(e, z, d);
    if (z.hp <= 0 && !z.dead) { z.dead = true; S.kills++; if (RULES.xp && (e.k === K_POL || e.k === K_SOL || e.k === K_SEN)) { e.kills++; const nl = 1 + Math.floor(e.kills / 50); if (nl > e.lvl) { e.lvl = nl; e.acc = RULES.baseAcc + .05 * (nl - 1); toast('⭐ Einheit steigt auf Level ' + nl + ' (Treffsicherheit ' + Math.round(e.acc * 100) + ' %)'); } } }
  }
}
function infect(e) {
  if (e.inc >= 0 || e.k === K_ZOM || e.k === K_TRK || e.k === K_TUR) return;
  e.inc = cfg.infT * rnd(.7, 1.3); S.bites++; SFX.bite(e.x, e.y); if (e.k === K_CIV) SFX.scream(e.x, e.y);
}
function alertAt(x, y, text) {
  const box = document.getElementById('alerts'); if (!box) return;
  while (box.children.length >= 3) box.firstChild.remove();
  const d = document.createElement('div'); d.className = 'alert';
  d.innerHTML = '<span>⚠ ' + text + '</span><button>Hinspringen</button>';
  d.querySelector('button').onclick = () => { cam.x = x; cam.y = y; cam.z = Math.max(cam.z, 1.3); clampCam(); d.remove(); };
  box.appendChild(d); setTimeout(() => d.remove(), 14000); SFX.alarm();
}
function banner(text, ms = 12000) {   // Meldung bleibt stehen (Toasts werden von anderen Meldungen überschrieben)
  const box = document.getElementById('alerts'); if (!box) return;
  const d = document.createElement('div'); d.className = 'alert'; d.innerHTML = '<span>📦 ' + text + '</span>';
  box.appendChild(d); setTimeout(() => d.remove(), ms);
}
function toZombie(e) {
  if (e.k === K_POL || e.k === K_SOL || e.k === K_SEN) S.ulost = (S.ulost || 0) + 1;
  e.k = K_ZOM; e.hp = ZHP; e.inc = -1; e.st = 0; e.path = null; e.armed = false; e.tgt = null; e.wt = 0; S.zombified++;
  if (simT - (S.lastAlert || -99) > 10 && !nearest(hzHead, hzNxt, e.x, e.y, 150, false)) { S.lastAlert = simT; alertAt(e.x, e.y, 'Neuer Zombie-Ausbruch gemeldet'); }
  if (e.b >= 0) { const b = B[e.b]; b.occ = b.occ.filter(o => o !== e); e.b = -1; e.x = b.ex; e.y = b.ey; breach(b, .6); }
}
function breach(b, p) {
  S.breaches++;
  for (const o of b.occ) { o.st = 0; o.b = -1; o.x = b.ex; o.y = b.ey; o.wt = 0; if (Math.random() < p) infect(o); }
  b.occ = []; b.siege = 0;
}
function kill(e) { if (!e.dead) { e.dead = true; if (e.k === K_ZOM) S.kills++; else { S.loss++; if (e.k === K_POL || e.k === K_SOL || e.k === K_SEN) S.ulost = (S.ulost || 0) + 1; else if (e.k === K_TRK) { S.ulost = (S.ulost || 0) + 1; S.trkLost = (S.trkLost || 0) + 1; } } } }

// ───────────────────────── KI ─────────────────────────
function thinkCivilian(e) {
  const z = nearestZ(e.x, e.y, 38);
  if (z && e.guard && !S.civFree && e.ammo > 0) {   // Torwache: hält die Stellung und schießt; flieht erst, wenn der Zombie durchgebrochen ist (< 6 m)
    const d = Math.hypot(z.x - e.x, z.y - e.y);
    if (d >= 6) { if (d < 32) { e.st = 5; e.tgt = z; e.path = null; } else { e.st = 0; e.wt = 1; } return; }
  }
  if (z) {
    const d = Math.hypot(z.x - e.x, z.y - e.y);
    if (e.armed && e.brave && e.ammo > 0 && d < 32 && d > 6) { e.st = 5; e.tgt = z; e.path = null; return; }
    e.st = 2; e.ft = 2.5; e.path = null;
    // Fluchtrichtung wählen
    let bs = -1e9, ax = e.x - z.x, ay = e.y - z.y; const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
    // Bewaffnete Einheiten ziehen Flüchtende an (nicht, wenn der Zombie in deren Richtung steht)
    let ux = 0, uy = 0, ubd = 220 * 220;
    for (const u of UL) { const q = (u.x - e.x) ** 2 + (u.y - e.y) ** 2; if (q < ubd && q > 100) { ubd = q; ux = u.x - e.x; uy = u.y - e.y; } }
    if (ux || uy) { const ul = Math.hypot(ux, uy); ux /= ul; uy /= ul; const zx = (z.x - e.x) / (al || 1), zy = (z.y - e.y) / (al || 1); if (ux * zx + uy * zy > .75) ux = uy = 0; }
    for (let a = 0; a < 12; a++) {
      const an = a * Math.PI / 6, dx = Math.cos(an), dy = Math.sin(an);
      if (!walkCost(e.x + dx * 6, e.y + dy * 6) || !walkCost(e.x + dx * 14, e.y + dy * 14)) continue;
      const sc = dx * ax + dy * ay + (dx * ux + dy * uy) * 1.1 + rnd(0, .25);
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
  if (S.evac && (e.st === 0 || e.st === 1) && evacCalls(e)) { e.st = 6; e.path = null; }
}
function stepCivilian(e) {
  if (e.inc >= 0) { e.inc -= DT; if (e.inc <= 0) { toZombie(e); return; } }
  e.th -= DT; if (e.th <= 0) { e.th = rnd(.25, .45); thinkCivilian(e); }
  switch (e.st) {
    case 0:
      e.wt -= DT;
      if (e.guard && !S.civFree) { if (e.wt <= 0) { e.wt = 3; if (Math.hypot(e.gx - e.x, e.gy - e.y) > 5 && setPath(e, e.gx, e.gy, false)) e.st = 1; } break; }
      if (e.wt <= 0) {
        e.wt = rnd(3, 14);
        if (Math.random() < .12) { const b = nearBuildings(e.x, e.y, 120, b => b.occ.length < b.cap); if (b && setPath(e, b.ex, b.ey, false)) { e.st = 3; e.tgt = b; return; } }
        const p = randWalk(e.x, e.y, 70); if (p && setPath(e, p[0], p[1], false)) e.st = 1;
      }
      break;
    case 1: if (!follow(e, 2.2, false)) { e.st = 0; } break;
    case 2:
      e.ft -= DT;
      if (!moveDir(e, e.hx, e.hy, 4.2, false)) { const a = Math.atan2(e.hy, e.hx) + rnd(-1.2, 1.2); e.hx = Math.cos(a); e.hy = Math.sin(a); }
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
    case 6: evacMove(e, 3.6); break;
    case 4:
      if (S.evac && !e.evk && evacCalls(e)) { e.evk = 1; e.inT = Math.min(e.inT, rnd(1, 45)); }
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
function countZAround(x, y, r) {
  let n = 0; const x0 = Math.max(0, (x - r) / HS | 0), x1 = Math.min(HW - 1, (x + r) / HS | 0), y0 = Math.max(0, (y - r) / HS | 0), y1 = Math.min(HH - 1, (y + r) / HS | 0);
  for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) for (let i = hzHead[gy * HW + gx]; i >= 0; i = hzNxt[i]) { const z = E[i]; if (!z.dead && (z.x - x) ** 2 + (z.y - y) ** 2 <= r * r) n++; }
  return n;
}
function giveMove(u, p, patrol, master) {
  u.evac = false;
  if (u.ds > 0) {   // erst Stellung räumen, Befehl wird danach ausgeführt
    if (u.ds === 1) u.dt = 60 - u.dt; else if (u.ds === 2) u.dt = 0;
    u.ds = 3; u.pend = { x: p[0], y: p[1], patrol }; return;
  }
  let path;
  if (master) {   // Gruppenbefehl: ein gemeinsamer Weg für nahe beieinander stehende Einheiten (A* über große Strecken kostet ~50 ms pro Aufruf)
    let m = master.find(q => (q.x - u.x) ** 2 + (q.y - u.y) ** 2 < 900);
    if (!m) master.push(m = { x: u.x, y: u.y, p: findPath(u.x, u.y, master.tx, master.ty, false, 400000) });
    if (m.p) { path = m.p.slice(); path[path.length - 1] = [p[0], p[1]]; }
    else path = findPath(u.x, u.y, p[0], p[1], false, 400000);
  } else path = findPath(u.x, u.y, p[0], p[1], false, 400000);
  u.ord = true; u.patrol = patrol || null; u.hmx = p[0]; u.hmy = p[1]; u.bt = 0; u.wt = 1; u.sk = 0; u.nu = 0;
  if (path) { u.path = path; u.pi = 0; }
}
const isFoe = z => z && !z.dead && (z.k === K_ZOM || z.inc >= 0);
function stepUnit(e) {
  if ((e.rz = (e.rz || 0) - DT) <= 0) {   // steckt die Einheit in einem Gebäude/Hindernis (z. B. nach Bauplatzierung)? → auf begehbaren Grund setzen
    e.rz = 1; if (e.k !== K_TRK && e.k !== K_TUR && (type[cellIdx(e.x, e.y)] > T_ROAD || !comp[cellIdx(e.x, e.y)])) { const q = nearestWalkCell(e.x, e.y, 30); if (q) { e.x = q[0]; e.y = q[1]; e.path = null; } }
  }
  if (e.inc >= 0) { e.inc -= DT; if (e.inc <= 0) { toZombie(e); return; } }
  if (e.inc >= 0 && e.ds !== 1 && e.ds !== 2 && e.k !== K_TRK && e.k !== K_TUR) {   // Infizierte entfernen sich von ihrem Squad (außer eingegraben)
    if ((e.fl = (e.fl || 0) - DT) <= 0) {
      e.fl = 1; let ax = 0, ay = 0, n = 0;
      for (const u of UL) if (u !== e && u.inc < 0 && (u.x - e.x) ** 2 + (u.y - e.y) ** 2 < 900) { ax += e.x - u.x; ay += e.y - u.y; n++; }
      if (n) { const l = Math.hypot(ax, ay) || 1; e.fhx = ax / l; e.fhy = ay / l; } else if (e.fhx == null) { const a = rnd(0, 6.283); e.fhx = Math.cos(a); e.fhy = Math.sin(a); }
    }
    if (!moveDir(e, e.fhx, e.fhy, 3.6, false)) { const a = Math.atan2(e.fhy, e.fhx) + rnd(-1.5, 1.5); e.fhx = Math.cos(a); e.fhy = Math.sin(a); }
    e.path = null; return;
  }
  const trk = e.k === K_TRK || e.k === K_TUR, sn = !!e.snipe && !trk && e.k !== K_POL, rng = (trk ? 70 : e.k === K_SOL || e.k === K_SEN ? 65 : e.mp ? 46 : 38) * (sn ? 3 : 1), rate = (trk ? .12 : e.k === K_POL ? (e.mp ? .6 : 1.1) : .7) * (sn ? 2 : 1), dmg = trk ? 1 : e.k === K_POL ? 1.5 : 2.5, mobile = e.k !== K_SEN && e.k !== K_TUR;
  // Eingraben / Stellung räumen
  if (e.ds === 1) { e.dt += DT; if (e.dt >= 60) { e.ds = 2; e.dt = 0; } }
  else if (e.ds === 3) {
    e.dt += DT;
    if (e.dt >= 60) { e.ds = 0; e.dt = 0; const pd = e.pend; e.pend = null; if (pd) { if (pd.release) { e.ord = false; e.path = null; e.patrol = null; } else if (pd.evacu) e.evac = true; else giveMove(e, [pd.x, pd.y], pd.patrol); } }
  }
  const fixed = e.ds > 0;
  const mv = Math.hypot(e.x - e.lx, e.y - e.ly) > .02; e.lx = e.x; e.ly = e.y;
  const ba = trk ? Math.max(.15, e.acc - .15) : e.acc;
  if (trk) { if (mv) e.ang = Math.atan2(e.y - e.ly0, e.x - e.lx0); e.lx0 = e.x; e.ly0 = e.y; if ((e.nz = (e.nz || 0) - DT) <= 0 && (e.nz = .3) && countZAround(e.x, e.y, 5) >= (e.k === K_TUR ? 10 : 5)) { e.dead = true; if (e.k === K_TRK) { S.ulost = (S.ulost || 0) + 1; S.trkLost = (S.trkLost || 0) + 1; } toast(e.k === K_TUR ? '🔫 Geschütz zerstört – von Zombies überrannt' : '🚛 Truck zerstört – von Zombies umlagert'); return; } }
  e.ae = e.ds === 2 ? Math.min(1, ba + .15) : mv ? Math.max(trk ? .15 : .1, ba - .2) : ba;
  e.cd -= DT; e.th -= DT;
  if (e.th <= 0) { e.th = rnd(.2, .35); e.tgt = nearestZ(e.x, e.y, rng + 15); if (!e.tgt && RULES.scan && (e.k === K_SOL || e.k === K_SEN)) e.tgt = nearest(hhHead, hhNxt, e.x, e.y, rng, true, u => u.k === K_CIV && u.inc >= 0); }
  const z = e.tgt;
  if (e.ord) {   // direkt gesteuert: auf Sicht schießen (auch in Bewegung), nicht selbstständig vorrücken
    if (isFoe(z)) {
      const d = Math.hypot(z.x - e.x, z.y - e.y);
      if (d <= rng && e.cd <= 0 && (!RULES.ammo || e.ammo > 0) && seeLine(e.x, e.y, z.x, z.y)) { e.cd = rate; shoot(e, z, rng, dmg); }
    }
    if (!fixed && e.k !== K_TUR && e.k !== K_TRK && !e.evac && !e.patrol && e.hmx != null && (e.nu || 0) <= 8 && Math.hypot(e.hmx - e.x, e.hmy - e.y) > 6) {   // hängt trotz Marschbefehl fest → anschubsen
      if (mv) { e.sk = 0; if ((e.mvT = (e.mvT || 0) + DT) > 8) e.nu = 0; }
      else if ((e.mvT = 0, e.sk = (e.sk || 0) + DT) > 1.5) {
        e.sk = 0;
        if ((e.nu = (e.nu || 0) + 1) > 8) e.nu = 9;   // aufgeben (Ziel wohl unerreichbar)
        else {   // erst auf die Zellmitte, danach mit wachsendem Radius versetzen; Weg ohne Kantenabkürzung neu berechnen
          const ci = cellIdx(e.x, e.y), q = e.nu === 1 && comp[ci] ? [(ci % GW + .5) * CELL, ((ci / GW | 0) + .5) * CELL] : randWalk(e.x, e.y, 2 + e.nu * 2) || nearestWalkCell(e.x, e.y, 12);
          if (q) { e.x = q[0]; e.y = q[1]; }
          const p = findPath(e.x, e.y, e.hmx, e.hmy, false, 200000, false); e.path = p || null; e.pi = 0; e.bt = 0;
        }
      }
    }
    if (!fixed && e.k !== K_TUR) {
      if (e.evac) evacMove(e, unitSpeed(e));
      else if (e.path) follow(e, e.gsp || unitSpeed(e), false);
      else if (e.patrol) {
        e.wt -= DT;
        if (e.wt <= 0) { const q = randWalk(e.patrol.x, e.patrol.y, e.patrol.r, true); if (q) setPath(e, q[0], q[1], false); e.wt = rnd(2, 6) * (1.6 - cfg.patrol / 100 * 1.4) * 2; }
      }
    }
    return;
  }
  if (isFoe(z)) {
    const d = Math.hypot(z.x - e.x, z.y - e.y);
    if (d < 7) { if (mobile || d < 3) moveDir(e, (e.x - z.x) / (d || 1), (e.y - z.y) / (d || 1), 4.4, false); }
    else if (d > rng * .75 && mobile) { moveTo(e, z.x, z.y, e.k === K_SOL ? 4.4 : 4, false); }
    if (d <= rng && e.cd <= 0 && (!RULES.ammo || e.ammo > 0) && seeLine(e.x, e.y, z.x, z.y)) { e.cd = rate; shoot(e, z, rng, dmg); }
    e.path = null; e.wt = 1;
    return;
  }
  if (!mobile) return;
  const ld = e.sq ? LEAD.get(e.sq) : null;
  if (ld && ld !== e) {   // Squad: dem Anführer folgen
    e.wt -= DT;
    if (Math.hypot(ld.x - e.x, ld.y - e.y) > 8 && (!e.path || e.wt <= 0)) { const q = randWalk(ld.x, ld.y, 5); if (q) setPath(e, q[0], q[1], false); e.wt = 1.5; }
    if (e.path) follow(e, unitSpeed(e) * 1.1, false);
    return;
  }
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
  // Hören: gehende Zivilisten leise (30 m), fliehende lauter (55 m); Schüsse und Bomben deutlich lauter (siehe noise)
  const hr = nearest(hhHead, hhNxt, e.x, e.y, 55, false);
  if (hr) { const d = Math.hypot(hr.x - e.x, hr.y - e.y); if (d < (hr.k === K_CIV && hr.st !== 2 ? 30 : 55)) { e.tgt = hr; e.st = 1; e.lost = 0; return; } }
  if (e.st === 1 && e.tgt && !e.tgt.dead && e.tgt.st !== 4 && e.tgt.k !== K_ZOM && Math.hypot(e.tgt.x - e.x, e.tgt.y - e.y) < vis * 1.6 && (e.lost = (e.lost || 0) + .3) < 6) return;
  if (e.st === 1) { e.st = 0; e.tgt = null; e.wt = 0; }
  const sr = nearestSiren(e);   // Sirene: alle Zombies der Karte laufen zum Lärm
  if (sr) { e.st = 7; e.fz = 'siren'; e.fzRef = sr; e.fzT = 2; e.path = null; return; }
  // Lockruf (Kampagne): wirkt auf alle, die kein Ziel sehen oder hören
  if (e.mk) {   // Marschbefehl (Kampagne): Wegpunkte abgehen, am Sammelpunkt warten, dann Zug zum Evakuierungspunkt
    const mk = S.marches && S.marches[e.mk - 1];
    if (!mk || simT >= mk.until || mk.go) {
      e.mk = 0;
      if (mk && mk.go && S.evac && ZF.evac) { e.st = 7; e.fz = 'evac'; e.fzT = rnd(20, 40); e.path = null; return; }
    } else { e.st = 7; e.fz = 'march'; e.fzT = 2; return; }
  }
  if (S.lure && simT < S.lure.until && ZF.lure) { e.st = 7; e.fz = 'lure'; e.fzT = 2; return; }
  // Geräusche
  let bn = null, bd = -1e9;
  for (const n of noises) { const d = Math.hypot(n.x - e.x, n.y - e.y); if (d < n.r && d > 8 && n.r - d > bd) { bd = n.r - d; bn = n; } }
  if (bn && bn.fl && bn.fl.D) { e.st = 7; e.fz = 'flare'; e.fzRef = bn.fl; e.fzT = 2; e.path = null; return; }
  if (bn && e.st !== 2 || (bn && e.pt <= 0)) { if (setPath(e, bn.x + rnd(-6, 6), bn.y + rnd(-6, 6), true)) { e.st = 2; e.pt = 3; } return; }
  if (e.st === 2 && !e.path) e.st = 0;
}
function stepZombie(e) {
  e.th -= DT; e.pt -= DT;
  if (e.stun > 0) { e.stun -= DT; return; }
  if (e.th <= 0) { e.th = rnd(.25, .4); thinkZombie(e); }
  let sp = e.zsp || zSpeed();
  if (S.rush && ZF.evac && e.st !== 1 && !sirenOn()) { if (e.st !== 7 || e.fz !== 'evac') { e.st = 7; e.fz = 'evac'; e.path = null; } e.fzT = 30; sp *= 1.4; }
  // Belagerung
  if (e.st === 0 && e.th < .02) { const b = nearBuildings(e.x, e.y, 9, b => b.occ.length > 0); if (b) b.siege += .3 * 1; }
  if (e.st === 1) {
    const t = e.tgt; if (!t || t.dead) { e.st = 0; return; }
    const d = Math.hypot(t.x - e.x, t.y - e.y);
    e.cd -= DT;
    if (d < 1.7) {
      if (e.cd <= 0) { e.cd = .8; if (Math.random() < (t.k === K_CIV ? 1 : .6)) infect(t); }
      return;
    }
    if (d < 25 && walkLine(e.x, e.y, t.x, t.y, true)) { e.path = null; moveTo(e, t.x, t.y, sp, true); return; }
    e.pt -= 0;
    if (!e.path || e.pt <= 0) { if (setPath(e, t.x, t.y, true)) e.pt = 1.4; else if (!e.path) { e.pt = .5; moveTo(e, t.x, t.y, sp * .7, true); return; } }
    if (e.path) follow(e, sp, true);
    return;
  }
  if (e.st === 2) { if (!follow(e, sp * .9, true)) e.st = 0; return; }
  if (e.st === 7) {   // Feldbewegung: Lockruf oder Horde zum Evakuierungsort
    if (e.fz === 'siren') {
      const s = e.fzRef; e.fzT -= DT;
      if (!s || s.dead || e.fzT <= 0) { e.st = 0; e.wt = 0; return; }
      if (Math.hypot(s.x - e.x, s.y - e.y) < 3) return;   // steht um die Sirene herum
      fieldDescend(e, sirenField(s), s.x, s.y, sp, true); return;
    }
    if (e.fz === 'flare') {
      const f = e.fzRef; e.fzT -= DT;
      if (!f || f.t <= 0 || e.fzT <= 0 || Math.hypot(f.x - e.x, f.y - e.y) < 10) { e.st = 0; e.wt = 0; return; }
      fieldDescend(e, f.D, f.x, f.y, sp, true); return;
    }
    if (e.fz === 'march') {
      const mk = e.mk && S.marches && S.marches[e.mk - 1]; e.fzT -= DT;
      if (!mk || e.fzT <= 0) { e.st = 0; e.wt = 0; return; }
      if (e.mw) return;   // wartet am Sammelpunkt
      const rt = mk.routes[e.mr || 0] || [], fin = (e.mi || 0) >= rt.length, wp = fin ? [mk.gather.x, mk.gather.y] : rt[e.mi || 0];
      const key = wp[0] + ',' + wp[1];
      let f = MF.get(key);
      if (!f) { const q = nearestWalkCell(wp[0], wp[1], 80) || wp; MF.set(key, f = { x: q[0], y: q[1], D: computeField(q[0], q[1], true) }); }   // Wegpunkt auf begehbaren Grund legen (Felder gemeinsam genutzt)
      if (Math.hypot(e.x - f.x, e.y - f.y) < (fin ? mk.gather.r : 30)) { if (fin && mk.noWait) { e.mk = 0; e.st = 0; e.wt = 0; } else if (fin) { e.mw = 1; mk.arr++; if (mk.t1 == null) mk.t1 = simT; } else e.mi = (e.mi || 0) + 1; return; }
      fieldDescend(e, f.D, f.x, f.y, sp * 1.6, true); return;
    }
    e.fzT -= DT; const lure = e.fz === 'lure', tg = lure ? S.lure : S.evac;
    if (!tg || e.fzT <= 0 || (lure && simT >= S.lure.until)) { e.st = 0; e.wt = 0; return; }
    fieldDescend(e, lure ? ZF.lure : ZF.evac, tg.x, tg.y, sp, true); return;
  }
  // Umherirren
  if (e.path) { follow(e, sp * .45, true); return; }
  e.wt -= DT;
  if (e.wt <= 0) {
    e.wt = rnd(2, 9);
    if (S.horde && S.evac && ZF.evac && Math.random() < S.horde) { e.st = 7; e.fz = 'evac'; e.fzT = rnd(6, 12); return; }
    let tx = null;
    if (Math.random() < (S.evac ? .25 : .6)) { const b = nearBuildings(e.x, e.y, 220, b => b.occ.length > 0); if (b) { tx = [b.ex, b.ey]; } }
    if (!tx && S.evac) {
      // Zufällige Richtung (8 Sektoren); die Richtung zum Evakuierungsort ist um 50 % wahrscheinlicher
      const base = Math.atan2(S.evac.y - e.y, S.evac.x - e.x), r = Math.random() * 8.5, idx = r < 1.5 ? 0 : Math.min(7, 1 + Math.floor(r - 1.5)), an = base + idx * Math.PI / 4, d = rnd(30, 70);
      tx = randWalk(e.x + Math.cos(an) * d, e.y + Math.sin(an) * d, 12);
    }
    if (!tx) tx = randWalk(e.x, e.y, 50);
    if (tx) setPath(e, tx[0], tx[1], true);
  }
}

// ───────────────────────── Simulationsschritt ─────────────────────────
function step() {
  simT += DT; pathBudget = 14 + E.length / 120 | 0;
  if (E.some(e => e.dead)) E = E.filter(e => !e.dead);
  for (const b of B) if (b.occ.length) b.occ = b.occ.filter(o => !o.dead);
  rebuildHash();
  UL = E.filter(friendly); LEAD.clear(); for (const u of UL) if (u.sq && u.k !== K_TRK && !LEAD.has(u.sq)) LEAD.set(u.sq, u);
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
      if (b.occ.length && b.siege > 4 + b.occ.length * .25) breach(b, .7);
    }
  }
  // Barrikaden
  for (let i = 1; i < BAR.length; i++) { const b = BAR[i]; if (b && b.hp <= 0) killBar(i); }
  stepMines(); stepSirens(); dispatchBuild(); updateZF(); if (RULES.tick) RULES.tick();
  if (S.evac && (stepN = (stepN || 0) + 1) % 30 === 0) { let z = 0; for (const e of E) if (e.k === K_ZOM && !e.dead) z++; S.rush = z > 0 && z < 100 && (S.peakZ || 0) >= 100 && simT >= (RULES.rushAfter || 0); if (S.rush && !S.rushNote) { S.rushNote = 1; toast('🏃 Die letzten Zombies sprinten zum Evakuierungspunkt'); } }
  // Evakuierung
  if (S.evac) {
    S.evacT -= DT; if (S.evacR != null && S.evacR < 4000) S.evacR += 25 * DT;
    if (S.evacT <= 0 && RULES.noHeli) S.evacT = 99; else if (S.evacT <= 0) { S.evacT = RULES.evacEvery || 30; const [sx, sy] = edgeEntry(S.evac.x, S.evac.y); fx.push({ type: 'heli', kind: 'evac', x: sx, y: sy, tx: S.evac.x, ty: S.evac.y, ex: sx, ey: sy, ph: 0, t: 0, a: 0 }); }
    if (evacDirty && simT - evLast > 3) computeEvacField();
  }
  // Effekte
  for (let i = noises.length - 1; i >= 0; i--) { noises[i].t -= DT; if (noises[i].t <= 0) noises.splice(i, 1); }
  for (let i = tracers.length - 1; i >= 0; i--) { tracers[i].t -= DT; if (tracers[i].t <= 0) tracers.splice(i, 1); }
  updateFx();
  for (const k in cooldown) if (cooldown[k] > 0) cooldown[k] -= DT;
  S.histT -= DT;
  if (S.histT <= 0) { S.histT = 2; record(); }
}
function edgeEntry(x, y) {
  const d = [y, WH - y, x, WW - x], m = d.indexOf(Math.min(...d));
  return m === 0 ? [x, -160] : m === 1 ? [x, WH + 160] : m === 2 ? [-160, y] : [WW + 160, y];
}
function updateFx() {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    if (f.type === 'heli') {
      if (f.ph === 0) {
        const dx = f.tx - f.x, dy = f.ty - f.y, d = Math.hypot(dx, dy), sp = 48 * DT; f.a = Math.atan2(dy, dx);
        if (d <= sp) { f.x = f.tx; f.y = f.ty; f.ph = 1; f.t = f.kind === 'garrison' ? 3.5 : f.kind === 'evac' ? 5 : f.kind === 'build' ? 3 : f.kind === 'gunship' ? 30 : f.kind === 'mines' ? 2.5 : 2.2; } else { f.x += dx / d * sp; f.y += dy / d * sp; }
      } else if (f.ph === 1) {
        f.t -= DT; if (f.kind === 'gunship') gunFire(f);
        if (f.t <= 0 && f.kind === 'build') {
          deliverPlan(f.route[f.ri]); f.ri++;
          const nq = S.plans.find(q => f.ri < f.route.length && q.id === f.route[f.ri]);
          if (nq) { f.tx = nq.x; f.ty = nq.y; f.ph = 0; } else if (f.ri < f.route.length) { f.ri = f.route.length; f.ph = 2; } else f.ph = 2;
        } else if (f.t <= 0) {
          f.ph = 2;
          if (f.kind === 'garrison') landGarrison(f.tx, f.ty); else if (f.kind === 'evac') doEvac(f.tx, f.ty); else if (f.kind === 'turret') placeTurret(f.tx, f.ty); else if (f.kind === 'mines') scatterMines(f.tx, f.ty); else if (f.kind === 'gunship') { /* nur Abflug */ } else drop(f.tx, f.ty);
          if (f.kind !== 'evac' && f.kind !== 'gunship' && f.kind !== 'mines') fx.push({ type: 'ring', x: f.tx, y: f.ty, r: f.kind === 'garrison' ? 12 : 35, t: 1, T: 1, c: f.kind === 'garrison' ? '120,220,110' : '90,170,255' });
        }
      } else {
        const dx = f.ex - f.x, dy = f.ey - f.y, d = Math.hypot(dx, dy), sp = 60 * DT; f.a = Math.atan2(dy, dx);
        if (d <= sp) fx.splice(i, 1); else { f.x += dx / d * sp; f.y += dy / d * sp; }
      }
    } else if (f.type === 'jet') {
      f.x += f.vx * DT; f.y += f.vy * DT;
      if (!f.dropped && Math.hypot(f.tx - f.x, f.ty - f.y) <= f.lead) { f.dropped = true; SFX.jet(f.x, f.y); SFX.whistle(f.tx, f.ty); fx.push({ type: 'bomb', x0: f.x, y0: f.y, tx: f.tx, ty: f.ty, t: 1.2, T: 1.2 }); }
      if (f.dropped && Math.hypot(f.tx - f.x, f.ty - f.y) > 1500) fx.splice(i, 1);
    } else if (f.type === 'timer') {
      f.t -= DT; if (f.t <= 0) { const [sx, sy] = edgeEntry(f.spawn.tx, f.spawn.ty); fx.splice(i, 1); fx.push({ ...f.spawn, x: sx, y: sy, ex: sx, ey: sy, ph: 0, t: 0, a: 0 }); }
    } else if (f.type === 'flare') {
      f.t -= DT;
      if (f.t <= 20 && f.t > 0 && (f.nt = (f.nt || 0) - DT) <= 0) { f.nt = .5; if (!f.D) Object.defineProperty(f, 'D', { value: computeField(f.x, f.y, true), enumerable: false, writable: true });   // ein gemeinsames Wegfeld statt A* pro Zombie
        noise(f.x, f.y, 700, f); if ((f.sb = (f.sb || 0) + 1) % 2) SFX.alarm(); }
      if (f.t <= 0) { explode(f.x, f.y, 18); f.type = 'boom'; f.t = .7; f.r = 18; }
    } else if (f.type === 'bomb') {
      f.t -= DT; if (f.t <= 0) { explode(f.tx, f.ty, 30); f.type = 'boom'; f.t = .7; f.x = f.tx; f.y = f.ty; f.r = 30; }
    } else { f.t -= DT; if (f.t <= 0) fx.splice(i, 1); }
  }
}
let stepN = 0;
const MF = new Map();   // gemeinsame Wegfelder der Marschbefehle (Schlüssel: Wegpunkt)
let evD = null, evacDirty = false, evLast = -99;
// Allgemeines Distanzfeld (Dijkstra) für Horde/Lockruf; zm = Barrikaden durchlässig (hohe Kosten)
function computeField(x, y, zm, D) {
  if (!D) D = new Float64Array(GW * GH);
  D.fill(1e9);
  const s0 = cellIdx(x, y); hN = 0; D[s0] = 0; hpush(s0, 0);
  while (hN > 0) {
    const f = hF[0], cur = hpop();
    if (f > D[cur]) continue;
    const cx = cur % GW, cy = cur / GW | 0;
    for (const [dx, dy, m] of NB) {
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const ni = ny * GW + nx, c = cost(ni, zm); if (!c) continue;
      if (dx && dy && (!cost(cy * GW + nx, zm) || !cost(ny * GW + cx, zm))) continue;
      const nd = f + c * m; if (nd < D[ni]) { D[ni] = nd; hpush(ni, nd); }
    }
  }
  return D;
}
function fieldDescend(e, D, tx, ty, sp, zm) {
  let ci = cellIdx(e.x, e.y);
  if (!D || D[ci] >= 1e8) { moveTo(e, tx, ty, sp, zm); return; }
  let px = 0, py = 0;
  for (let k = 0; k < 2; k++) {
    const cx = ci % GW, cy = ci / GW | 0; let bi = ci, bd = D[ci];
    for (const [dx, dy] of NB) {
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const ni = ny * GW + nx; if (D[ni] < bd && (!dx || !dy || (cost(cy * GW + nx, zm) && cost(ny * GW + cx, zm)))) { bd = D[ni]; bi = ni; }
    }
    ci = bi; px = (ci % GW + .5) * CELL; py = ((ci / GW | 0) + .5) * CELL;
  }
  moveTo(e, px, py, sp, zm);
}
let ZF = { evac: null, lure: null }, zfDirty = true;
function updateZF() {   // Felder für Zombies bei Bedarf neu berechnen
  if (!S || !zfDirty) return; zfDirty = false;
  if (S.evac) ZF.evac = computeField(S.evac.x, S.evac.y, true, ZF.evac); else ZF.evac = null;
  if (S.lure) ZF.lure = computeField(S.lure.x, S.lure.y, true, ZF.lure); else ZF.lure = null;
}
function computeEvacField() {
  zfDirty = true;
  if (!S || !S.evac) return;
  evacDirty = false; evLast = simT;
  if (!evD) evD = new Float64Array(GW * GH);
  evD.fill(1e9);
  const s0 = cellIdx(S.evac.x, S.evac.y); hN = 0; evD[s0] = 0; hpush(s0, 0);
  while (hN > 0) {
    const f = hF[0], cur = hpop();
    if (f > evD[cur]) continue;
    const cx = cur % GW, cy = cur / GW | 0;
    for (const [dx, dy, m] of NB) {
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const ni = ny * GW + nx, c = cost(ni, false); if (!c) continue;
      if (dx && dy && (!cost(cy * GW + nx, false) || !cost(ny * GW + cx, false))) continue;
      const nd = f + c * m; if (nd < evD[ni]) { evD[ni] = nd; hpush(ni, nd); }
    }
  }
}
// Hängengebliebene (z. B. in abgeschnittenen Ecken) werden zur nächsten erreichbaren Zelle versetzt
function unstick(e) {
  const gx = e.x / CELL | 0, gy = e.y / CELL | 0;
  for (let r = 1; r <= 25; r++) {
    let best = -1, bd = 1e9;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = gx + dx, y = gy + dy; if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
      const i = y * GW + x; if (!cost(i, false) || evD[i] >= 1e8) continue;
      if (evD[i] < bd) { bd = evD[i]; best = i; }
    }
    if (best >= 0) { e.x = (best % GW + .5) * CELL; e.y = ((best / GW | 0) + .5) * CELL; e.stk = 0; return true; }
  }
  return false;
}
function evacMove(e, sp) {
  if (!S.evac || !evD) return;
  const px = S.evac.x, py = S.evac.y;
  if (Math.hypot(e.x - px, e.y - py) < 20) { e.stk = 0; return; }
  if (Math.hypot(e.x - (e.sx || 0), e.y - (e.sy || 0)) < .03) {
    e.stk = (e.stk || 0) + DT;
    if (e.stk > 5 && !unstick(e) && e.stk > 25) { const q = randWalk(px, py, 25); if (q) { e.x = q[0]; e.y = q[1]; } e.stk = 0; }
  } else e.stk = 0;
  e.sx = e.x; e.sy = e.y;
  let ci = cellIdx(e.x, e.y);
  if (evD[ci] >= 1e8) { moveTo(e, px, py, sp, false); return; }
  let tx = 0, ty = 0;
  for (let k = 0; k < 2; k++) {
    const cx = ci % GW, cy = ci / GW | 0; let bi = ci, bd = evD[ci];
    for (const [dx, dy] of NB) {
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const ni = ny * GW + nx; if (evD[ni] < bd && (!dx || !dy || (cost(cy * GW + nx, false) && cost(ny * GW + cx, false)))) { bd = evD[ni]; bi = ni; }
    }
    ci = bi; tx = (ci % GW + .5) * CELL; ty = ((ci / GW | 0) + .5) * CELL;
  }
  moveTo(e, tx, ty, sp, false);
}
// Der Aufruf zum Evakuierungsort breitet sich wellenförmig aus (50 m, +25 m pro Sekunde)
function evacCalls(e) { return S.evacR == null || Math.hypot(e.x - S.evac.x, e.y - S.evac.y) <= S.evacR; }
function setEvac(x, y) {
  const p = randWalk(x, y, 20) || randWalk(x, y, 60); if (!p) return toast('Hier ist kein Evakuierungsort möglich');
  const first = !S.evac; S.evac = { x: p[0], y: p[1] }; S.evacR = 50; if (first) S.evacT = 10;
  if (first) Music.play('hope'); computeEvacField(); toast(first ? 'Evakuierungsort festgelegt – erster Hubschrauber in ca. 10 s' : 'Evakuierungsort verlegt');
}
function evKind(e) { return e.k === K_CIV ? 'civ' : e.k === K_POL ? 'pol' : e.k === K_TRK ? 'trk' : 'mil'; }
function doEvac(x, y) {
  const cand = [];
  for (const e of E) {
    if (e.dead || e.k === K_ZOM || e.k === K_TUR || e.inc >= 0 || (e.k === K_CIV && e.st === 4)) continue;
    const d = Math.hypot(e.x - x, e.y - y); if (d > 38) continue;
    if (e.k === K_CIV) cand.push([0, d, e]); else if (S.evacUnits) cand.push([1, d, e]);
  }
  cand.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cap = RULES.evacCap || 20;
  if (cand.length < cap) for (const e of E) if (!e.dead && e.k === K_CIV && e.inc < 0 && e.st !== 4 && (e.stk || 0) > 10 && !cand.some(c => c[2] === e)) cand.push([0, 1e5, e]);   // Hubschrauber sammelt Festsitzende ein
  const take = cand.slice(0, cap);
  for (const [, , e] of take) { e.dead = true; S.ev[evKind(e)]++; if (S.evU && (e.k === K_POL || e.k === K_SOL || e.k === K_SEN)) S.evU.push({ k: e.k === K_POL ? 'pol' : 'sol', kills: e.kills, sq: e.sq }); }
  fx.push({ type: 'ring', x, y, r: 30, t: 1, T: 1, c: '255,255,255' });
  if (take.length) { toast('🚁 ' + take.length + ' evakuiert'); SFX.chime(x, y); }
}
function startUnitEvac() {
  if (!S.evac) return toast('Erst den Evakuierungsort festlegen (Werkzeug „Evakuierung“)');
  S.evacUnits = true;
  for (const u of E) if (friendly(u) && u.k !== K_TUR) {
    u.ord = true; u.path = null; u.patrol = null;
    if (u.ds > 0) { if (u.ds === 1) u.dt = 60 - u.dt; else if (u.ds === 2) u.dt = 0; u.ds = 3; u.pend = { evacu: true }; } else u.evac = true;
  }
  toast('Einheiten rücken zum Evakuierungsort vor');
}
function score(withAlive) {
  const ev = S.ev || { civ: 0, pol: 0, mil: 0, trk: 0 }; let civ = ev.civ, pol = ev.pol, mil = ev.mil;
  if (withAlive) { const c = counts(); civ += c.civ; pol += c.pol; mil += c.mil; }
  return { civ, pol, mil, pts: civ + pol * 5 + mil * 10 };
}
// ── Bauphase: Pläne werden gesammelt, nach „Bau abschließen“ liefern Hubschrauber nach 30 s ──
function barUsed() { let n = 0; for (const q of S.plans) n += q.cells.length; for (const b of BAR) if (b && !b.pre) n += b.cells.length; return n; }   // vorgebaute Sperren zählen nicht mit
function barHp(cells) { return (60 + cells * 35) * RULES.barHpMul; }
function commitBuild() {
  let n = 0; for (const q of S.plans) if (q.st === 'plan') { q.st = 'ord'; q.at = simT + 30; n++; }
  if (!n) return toast('Keine Baupläne vorhanden');
  toast('Bau beauftragt – Hubschrauber in 30 s'); SFX.ui();
}
function pushOut(cells) {
  const set = new Set(cells);
  for (const e of E) {
    if (e.dead || (e.st === 4 && e.k === K_CIV)) continue;
    const ci = cellIdx(e.x, e.y); if (!set.has(ci)) continue;
    const gx = ci % GW, gy = ci / GW | 0;
    outer: for (let r = 1; r <= 10; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = gx + dx, y = gy + dy; if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
      const i = y * GW + x; if (set.has(i) || barId[i] || type[i] > T_ROAD) continue;
      e.x = (x + .3 + Math.random() * .4) * CELL; e.y = (y + .3 + Math.random() * .4) * CELL; e.path = null; break outer;
    }
  }
}
function deliverPlan(id) {
  const i = S.plans.findIndex(q => q.id === id); if (i < 0) return;
  const q = S.plans[i]; S.plans.splice(i, 1);
  if (q.siren) { placeSiren(q.x, q.y); return; }
  const cells = q.cells.filter(c => !barId[c] && type[c] <= T_ROAD); if (!cells.length) return;
  pushOut(cells);
  const bid = BAR.length; for (const c of cells) barId[c] = bid;
  const hp = barHp(cells.length);
  const gs = (q.gates || []).filter(c => cells.includes(c)); for (const c of gs) gate[c] = 1;
  BAR.push({ cells, hp, max: hp, x: q.x, y: q.y, gates: gs }); evacDirty = true;
  SFX.thud(q.x, q.y); fx.push({ type: 'ring', x: q.x, y: q.y, r: 14, t: .8, T: .8, c: '230,170,70' });
}
function dispatchBuild() {
  const due = S.plans.filter(q => q.st === 'ord' && simT >= q.at); if (!due.length) return;
  const todo = due.slice();
  while (todo.length) {
    const route = [todo.shift()]; 
    while (route.length < 4 && todo.length) { const l = route[route.length - 1]; todo.sort((a, b) => Math.hypot(a.x - l.x, a.y - l.y) - Math.hypot(b.x - l.x, b.y - l.y)); route.push(todo.shift()); }
    route.forEach(q => q.st = 'dlv');
    const [sx, sy] = edgeEntry(route[0].x, route[0].y);
    fx.push({ type: 'heli', kind: 'build', x: sx, y: sy, tx: route[0].x, ty: route[0].y, ex: sx, ey: sy, ph: 0, t: 0, a: 0, route: route.map(q => q.id), ri: 0 });
  }
}
// ── Sirene: wird wie eine Barrikade per Bauhubschrauber abgesetzt; lockt dauerhaft alle Zombies an, bis Zombies sie zerlegen ──
const sirenOn = () => !!(S && S.sirens && S.sirens.some(s => !s.dead));
function sirenField(s) {
  if (!s.D) Object.defineProperty(s, 'D', { value: computeField(s.x, s.y, true), enumerable: false, writable: true });
  return s.D;
}
function nearestSiren(e) {
  const A = S.sirens; if (!A || !A.length) return null;
  let b = null, bd = 1e18;
  for (const s of A) if (!s.dead) { const d = (s.x - e.x) ** 2 + (s.y - e.y) ** 2; if (d < bd) { bd = d; b = s; } }
  return b;
}
function placeSiren(x, y) {
  const s = { x, y, hp: 60, max: 60, t: 0 }; S.sirens.push(s); sirenField(s);
  SFX.thud(x, y); fx.push({ type: 'ring', x, y, r: 20, t: 1, T: 1, c: '255,80,60' });
  toast('📢 Sirene aktiv – alle Zombies strömen zum Lärm');
}
function stepSirens() {
  const A = S.sirens; if (!A || !A.length) return;
  for (const s of A) {
    if (s.dead) continue;
    if ((s.t -= DT) <= 0) { s.t = .5; s.up = !s.up; SFX.siren(s.x, s.y, s.up); s.dmgT = (s.dmgT || 0) + 1; s.hp -= countZAround(s.x, s.y, 7) * .6 * .5; if (s.hp <= 0) { s.dead = true; SFX.boom(s.x, s.y); fx.push({ type: 'boom', x: s.x, y: s.y, r: 5, t: .7 }); toast('📢 Sirene zerstört – sie verstummt'); } }
  }
  if (A.length > 8) S.sirens = A.filter(s => !s.dead);
}
// ── Minen: Teppich per Hubschrauber, Auslösung durch jede Figur (3 m), Explosion nach 0,3 s (schnelle Zombies sind sonst schon vorbei), keine Kettenreaktion ──
function scatterMines(cx, cy) {
  if (!S.mines) S.mines = [];
  for (let i = 0; i < 36; i++) { const p = randWalk(cx, cy, 25); if (p) S.mines.push({ x: p[0], y: p[1], t: null }); }
  SFX.thud(cx, cy); fx.push({ type: 'ring', x: cx, y: cy, r: 25, t: 1, T: 1, c: '230,170,70' });
}
function mineBlast(x, y) {
  const R = 7; SFX.boom(x, y); noise(x, y, 300); fx.push({ type: 'boom', x, y, r: R, t: .7 });
  for (const e of E) if (!e.dead && !(e.st === 4 && e.k === K_CIV) && Math.hypot(e.x - x, e.y - y) < R) kill(e);
}
function stepMines() {
  const M = S.mines; if (!M || !M.length) return;
  for (let i = M.length - 1; i >= 0; i--) {
    const m = M[i];
    if (m.t == null) { if (nearest(hzHead, hzNxt, m.x, m.y, 3, false) || nearest(hhHead, hhNxt, m.x, m.y, 3, false)) m.t = .3; }
    else { m.t -= DT; if (m.t <= 0) { M.splice(i, 1); mineBlast(m.x, m.y); } }
  }
}
function gunFire(f) {   // Gunship: Gatling beharkt alle Zombies im Zielgebiet
  if ((f.gt = (f.gt || 0) - DT) <= 0) { f.gt = .2; f.cands = E.filter(z => z.k === K_ZOM && !z.dead && Math.hypot(z.x - f.tx, z.y - f.ty) < 45); }
  const c = f.cands; if (!c || !c.length) return;
  const z = c[Math.random() * c.length | 0]; if (!z || z.dead) return;
  tracers.push({ x1: f.x, y1: f.y, x2: z.x, y2: z.y, t: .08 });
  if (Math.random() < .6) { z.hp -= 1.5; if (z.hp <= 0) { z.dead = true; S.kills++; } }
  if ((f.nz = (f.nz || 0) - DT) <= 0) { f.nz = 1; noise(f.tx, f.ty, 350); }
  SFX.shot(f.tx, f.ty, 'mg');
}
function placeTurret(x, y) {
  const e = mk(K_TUR, x, y); e.acc = RULES.baseAcc != null ? RULES.baseAcc : .7; e.armed = true; e.ord = true; e.hmx = x; e.hmy = y;
  if (RULES.ammo) { e.ammoMax = 2000 * RULES.ammoMul; e.ammo = e.ammoMax; }
  E.push(e); SFX.thud(x, y); return e;
}
function landGarrison(x, y) {
  const id = ++gidN, n = 4 + (RULES.squadPlus || 0);
  for (let i = 0; i < n; i++) { const p = randWalk(x, y, 9) || randWalk(x, y, 30); if (!p) continue; const e = mk(K_SEN, p[0], p[1]); e.acc = RULES.baseAcc != null ? RULES.baseAcc : .7; e.armed = true; e.g = id; e.sq = id; if (RULES.ammo) { e.ammoMax = 150 * RULES.ammoMul; e.ammo = e.ammoMax; } E.push(e); }
}
function lostPct(c) { c = c || counts(); return clamp((cfg.pop - (c.civ - c.inf)) / cfg.pop * 100, 0, 100); }
function counts() {
  const c = { civ: 0, inf: 0, zom: 0, pol: 0, mil: 0, trk: 0 };
  for (const e of E) {
    if (e.dead) continue;
    if (e.k === K_ZOM) c.zom++;
    else if (e.k === K_CIV) { c.civ++; if (e.inc >= 0) c.inf++; }
    else if (e.k === K_TUR) { }
    else if (e.k === K_TRK) c.trk++;
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
  if (RULES.checkEnd && phase === 'run' && !finished) RULES.checkEnd(c);
  else if (phase === 'run' && !finished && simT > 5) {
    if (c.civ + c.pol + c.mil + c.trk === 0) endGame('Es gibt keine Überlebenden mehr auf der Karte.');
    else if (c.zom === 0 && c.inf === 0) endGame('Der Ausbruch wurde eingedämmt!');
  }
}
function explode(x, y, r) {
  SFX.boom(x, y);
  for (const e of E) if (!e.dead && e.st !== 4 && Math.hypot(e.x - x, e.y - y) < r) kill(e);
  for (const b of B) if (Math.hypot(b.x - x, b.y - y) < r * .8) { for (const o of b.occ) kill(o); b.occ = []; }
  for (let i = 1; i < BAR.length; i++) { const b = BAR[i]; if (b && Math.hypot(b.x - x, b.y - y) < r) b.hp = 0; }
  noise(x, y, 450);
}
function drop(x, y) {
  if (RULES.ammo) {   // Kampagne: erst Einsatzkräfte auffüllen, der Rest bewaffnet Zivilisten
    let budget = 800;
    for (const u of E) if (friendly(u) && u.ammoMax && Math.hypot(u.x - x, u.y - y) < 40) { const need = u.ammoMax - u.ammo; if (need > 0) { const g = Math.min(need, budget); u.ammo += g; budget -= g; } }
    for (const e of E) { if (budget < 14) break; if (!e.dead && e.k === K_CIV && e.st !== 4 && Math.hypot(e.x - x, e.y - y) < 40) { if (!e.armed) { arm(e); e.brave = Math.random() < .7; budget -= 14; } else { e.ammo += 14; budget -= 14; } } }
    return;
  }
  for (const e of E) if (!e.dead && e.k === K_CIV && e.st !== 4 && Math.hypot(e.x - x, e.y - y) < 35) { if (!e.armed && Math.random() < .8) { arm(e); e.brave = Math.random() < .7; } else if (e.armed) e.ammo += 14; }
}

// ───────────────────────── Interventionen ─────────────────────────
function useTool(tool, x, y, x2, y2) {
  if (phase !== 'run' && tool !== 'infect') return;
  if (tool === 'demolish') { /* kein Limit */ }
  if (tool !== 'infect') {
    const gate = toolGate(tool); if (gate.hidden) return;
    if (gate.locked) return toast(gate.why);
    if (gate.left <= 0) return toast('Keine weiteren Einsätze verfügbar (max. ' + gate.max + ')');
  }
  if (tool !== 'infect' && cooldown[tool] > 0) return toast('Noch ' + Math.ceil(cooldown[tool]) + ' s Abklingzeit');
  if (tool === 'infect') {
    if (phase === 'setup') { markers.push({ x, y }); return; }
    const p = randWalk(x, y, 8) || [x, y]; spawnZombie(p[0], p[1]); return;
  }
  if (tool === 'siren') {
    const p = randWalk(x, y, 6); if (!p) return toast('Hier kann keine Sirene stehen');
    if (!E.some(u => friendly(u) && Math.hypot(u.x - p[0], u.y - p[1]) < 50)) return toast('Sirenen lassen sich nur in der Nähe eigener Einheiten (50 m) bauen');
    S.plans.push({ id: ++S.planId, cells: [], siren: true, st: 'plan', x: p[0], y: p[1] });
    S.used.siren = (S.used.siren || 0) + 1; cooldown.siren = RULES.tools.siren.cd || 0; SFX.ui(); toast('Sirene eingeplant – „Bau abschließen“ ruft den Hubschrauber'); return;
  }
  if (tool === 'barricade') {
    const dx = x2 - x, dy = y2 - y, len = Math.hypot(dx, dy);
    if (len < 6) { x2 = x + 12; y2 = y; } else if (len > 50) { x2 = x + dx / len * 50; y2 = y + dy / len * 50; }
    const taken = new Set(); for (const q of S.plans) for (const c of q.cells) taken.add(c);
    const cells = [], seen = new Set(), n = Math.ceil(Math.hypot(x2 - x, y2 - y) / 1.5);
    for (let i = 0; i <= n; i++) { const t = i / n, c = cellIdx(x + (x2 - x) * t, y + (y2 - y) * t); if (type[c] <= T_ROAD && !barId[c] && !taken.has(c) && !seen.has(c)) { seen.add(c); cells.push(c); } }
    if (!cells.length) return toast('Hier ist kein Platz für eine Barrikade');
    const free = RULES.barLimit - barUsed();
    if (free <= 0) return toast('Barrikaden-Limit erreicht (' + RULES.barLimit + ' Elemente)');
    if (cells.length > free) cells.length = free;
    S.plans.push({ id: ++S.planId, cells, st: 'plan', x: (x + x2) / 2, y: (y + y2) / 2 });
    SFX.ui(); return;
  } else if (tool === 'demolish') {
    // Baupläne (noch nicht geliefert) lassen sich jederzeit verwerfen
    let pi = -1, pd = 14 * 14;
    S.plans.forEach((q, i) => { if (q.st === 'dlv') return; if (q.siren) { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < pd) { pd = d; pi = i; } } for (const c of q.cells) { const d = ((c % GW + .5) * CELL - x) ** 2 + (((c / GW | 0) + .5) * CELL - y) ** 2; if (d < pd) { pd = d; pi = i; } } });
    if (pi >= 0) { if (S.plans[pi].siren) { S.used.siren--; cooldown.siren = 0; } S.plans.splice(pi, 1); toast('Bauplan verworfen'); return; }
    const sr = S.sirens.find(q => !q.dead && Math.hypot(q.x - x, q.y - y) < 10);
    if (sr) {
      if (!E.some(u => friendly(u) && Math.hypot(u.x - sr.x, u.y - sr.y) < 50)) return toast('Zum Einreißen muss eine Einheit (Soldat, Polizei, Truck) in der Nähe sein');
      sr.dead = true; S.used.siren--; SFX.thud(sr.x, sr.y); toast('Sirene abgebaut – sie kann neu gesetzt werden'); return;
    }
    let best = 0, bd = 12 * 12;
    for (let i = 1; i < BAR.length; i++) { const b = BAR[i]; if (!b) continue; for (const c of b.cells) { const d = ((c % GW + .5) * CELL - x) ** 2 + (((c / GW | 0) + .5) * CELL - y) ** 2; if (d < bd) { bd = d; best = i; } } }
    if (!best) return toast('Hier ist keine Barrikade');
    const bb = BAR[best];
    if (!E.some(u => friendly(u) && Math.hypot(u.x - bb.x, u.y - bb.y) < 50 + bb.cells.length * 2)) return toast('Zum Einreißen muss eine Einheit (Soldat, Polizei, Truck) in der Nähe sein');
    SFX.thud(x, y); killBar(best); toast('Barrikade eingerissen'); return;
  } else if (tool === 'gate') {
    let best = null, bd = 10 * 10; const d2 = c => ((c % GW + .5) * CELL - x) ** 2 + (((c / GW | 0) + .5) * CELL - y) ** 2;
    for (const q of S.plans) for (const c of q.cells) { const d = d2(c); if (d < bd) { bd = d; best = { o: q, c, plan: true }; } }
    for (const b of BAR) if (b) for (const c of b.cells) { const d = d2(c); if (d < bd) { bd = d; best = { o: b, c, plan: false }; } }
    if (!best) return toast('Hier ist keine Barrikade für ein Tor');
    const arr = best.o.gates || (best.o.gates = []), has = arr.includes(best.c);
    if (has) { arr.splice(arr.indexOf(best.c), 1); if (!best.plan) gate[best.c] = 0; toast('Tor entfernt'); }
    else {
      const used = S.plans.reduce((a, q) => a + (q.gates ? q.gates.length : 0), 0) + BAR.reduce((a, b) => a + (b && !b.pre && b.gates ? b.gates.length : 0), 0), quota = Math.floor(barUsed() / 12);
      if (used >= quota) return toast('Pro 12 Barrikadenelemente ein Tor (' + used + '/' + quota + ' belegt)');
      arr.push(best.c); if (!best.plan) gate[best.c] = 1; toast('Tor eingeplant');
    }
    evacDirty = true; SFX.ui(); return;
  } else if (tool === 'mines') {
    if (!randWalk(x, y, 25)) return toast('Hier lässt sich kein Minenteppich auslegen');
    const [sx, sy] = edgeEntry(x, y); fx.push({ type: 'heli', kind: 'mines', x: sx, y: sy, tx: x, ty: y, ex: sx, ey: sy, ph: 0, t: 0, a: 0 });
  } else if (tool === 'turret') {
    const p = randWalk(x, y, 6); if (!p) return toast('Hier kann kein Geschütz stehen');
    fx.push({ type: 'timer', t: 30, spawn: { type: 'heli', kind: 'turret', tx: p[0], ty: p[1] } });
  } else if (tool === 'flare') { fx.push({ type: 'flare', x, y, t: 21.2 });
  } else if (tool === 'gunship') {
    const [sx, sy] = edgeEntry(x, y); fx.push({ type: 'heli', kind: 'gunship', x: sx, y: sy, tx: x, ty: y, ex: sx, ey: sy, ph: 0, t: 0, a: 0 });
  } else if (tool === 'evac') { setEvac(x, y); return;
  } else if (tool === 'truck') {
    if (Math.min(x, y, WW - x, WH - y) > 70) return toast('Trucks können nur am Kartenrand angefordert werden');
    const p = randWalk(x, y, 45, true) || randWalk(x, y, 70); if (!p) return toast('Hier kann kein Truck einfahren');
    SFX.engine(p[0], p[1]); const e = mk(K_TRK, p[0], p[1]); e.acc = RULES.baseAcc != null ? RULES.baseAcc : .7; e.armed = true; e.ord = true; e.hmx = p[0]; e.hmy = p[1]; e.hp = 8; if (RULES.ammo) { e.ammoMax = 2000 * RULES.ammoMul; e.ammo = e.ammoMax; } E.push(e);
  } else if (tool === 'strike') {
    const an = Math.random() * 6.283, dx = Math.cos(an), dy = Math.sin(an);
    fx.push({ type: 'jet', x: x - dx * 1400, y: y - dy * 1400, vx: dx * 230, vy: dy * 230, a: an, tx: x, ty: y, lead: 276, dropped: false });
  } else if (tool === 'supply' || tool === 'garrison') {
    if (tool === 'garrison' && !randWalk(x, y, 10) && !randWalk(x, y, 30)) return toast('Kein Landeplatz für den Hubschrauber');
    const [sx, sy] = edgeEntry(x, y);
    fx.push({ type: 'heli', kind: tool, x: sx, y: sy, tx: x, ty: y, ex: sx, ey: sy, ph: 0, t: 0, a: 0 });
  }
  cooldown[tool] = (RULES.tools[tool] && RULES.tools[tool].cd) || 0; S.used[tool] = (S.used[tool] || 0) + 1; SFX.ui();
}

// ───────────────────────── Speichern / Laden ─────────────────────────
const SAVE_KEY = n => 'zos_moosburg_slot' + n;
function serialize() {
  return {
    v: 2, ts: Date.now(), simT, cfg, markers, S, cooldown, fx: fx.map(f => ({ ...f })), map: curMap, mode: RULES.mode, mission: RULES.missionId || null, up: RULES.up || null,
    E: E.filter(e => !e.dead).map(e => [e.k, +e.x.toFixed(1), +e.y.toFixed(1), e.hp, +e.inc.toFixed(1), e.ammo, e.acc, e.armed ? 1 : 0, e.b, e.brave ? 1 : 0, +e.inT.toFixed(1), e.hmx, e.hmy, e.ds, +e.dt.toFixed(1), e.g, e.ord ? 1 : 0, e.sq, e.kills, e.lvl, e.ammoMax || 0, e.snipe ? 1 : 0, e.sil ? 1 : 0, e.zsp || 0, e.lx0 ? 1 : 0, e.mp ? 1 : 0, e.sg ? 1 : 0, e.ams || null]),
    bar: BAR.filter(Boolean).map(b => ({ cells: b.cells, hp: b.hp, max: b.max, x: b.x, y: b.y, gates: b.gates || [], pre: b.pre ? 1 : 0 })),
    siege: B.filter(b => b.siege > 0).map(b => [b.idx, b.siege])
  };
}
function deserialize(d) {
  cfg = { ...DEFAULTS, ...d.cfg }; markers = d.markers || []; S = d.S; S.used = { barricade: 0, strike: 0, supply: 0, garrison: 0, evac: 0, truck: 0, ...S.used }; S.ev = S.ev || { civ: 0, pol: 0, mil: 0, trk: 0 }; S.plans = S.plans || []; S.sirens = S.sirens || []; S.planId = S.planId || 0; if (S.evacT == null) S.evacT = 10; evacDirty = !!S.evac; simT = d.simT; cooldown = d.cooldown; finished = false;
  noises = []; tracers = []; fx = d.fx || []; selected.clear(); barId.fill(0); gate.fill(0); BAR = [null];
  for (const b of B) { b.occ = []; b.siege = 0; }
  E = d.E.map(a => { const e = mk(a[0], a[1], a[2]); e.hp = a[3]; e.inc = a[4]; e.ammo = a[5]; e.acc = a[6]; e.armed = !!a[7]; e.b = a[8]; e.brave = !!a[9]; e.inT = a[10]; e.hmx = a[11]; e.hmy = a[12]; e.ds = a[13] || 0; e.dt = a[14] || 0; e.g = a[15] || 0; e.ord = !!a[16]; e.sq = a[17] || 0; e.kills = a[18] || 0; e.lvl = a[19] || 1; e.ammoMax = a[20] || 0; e.snipe = !!a[21]; e.sil = !!a[22]; if (a[23]) e.zsp = a[23]; e.mp = !!a[25]; e.sg = !!a[26]; if (a[27]) e.ams = a[27]; if (e.g > gidN) gidN = e.g; if (e.sq > gidN) gidN = e.sq; if (e.b >= 0 && B[e.b]) { e.st = 4; B[e.b].occ.push(e); } else e.b = -1; return e; });
  for (const b of d.bar) { const id = BAR.length; for (const c of b.cells) barId[c] = id; for (const c of b.gates || []) gate[c] = 1; BAR.push(b); }
  for (const [i, s] of d.siege) B[i].siege = s;
}
function slotInfo(n) { try { const d = JSON.parse(localStorage.getItem(SAVE_KEY(n))); return d; } catch (e) { return null; } }
function saveSlot(n) {
  try { localStorage.setItem(SAVE_KEY(n), JSON.stringify(serialize())); return true; }
  catch (e) { toast('Speichern fehlgeschlagen (Speicher voll?)'); return false; }
}
function prepareLoad(d) {
  const m = d.map || 'moosburg';
  if (m !== curMap) setupMap(m);
  RULES = d.mode === 'campaign' && typeof Campaign !== 'undefined' ? Campaign.rulesFor(d.mission, d.up) : classicRules();
  $('menu').style.display = 'none'; document.body.classList.remove('inhub');
}
function loadSlot(n) {
  const d = slotInfo(n); if (!d) return toast('Kein Spielstand vorhanden');
  prepareLoad(d);
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
  if (mapMode === 'vec') ctx.drawImage(mapCv, 0, 0, WW, WH);
  else { ctx.fillStyle = '#26352a'; ctx.fillRect(0, 0, WW, WH); drawTiles(cam.x - VW / 2 / cam.z, cam.y - VH / 2 / cam.z, cam.x + VW / 2 / cam.z, cam.y + VH / 2 / cam.z); ctx.drawImage(ovCv, 0, 0, WW, WH); }
  // Barrikaden
  for (let i = 1; i < BAR.length; i++) {
    const b = BAR[i]; if (!b) continue;
    ctx.fillStyle = b.hp / b.max > .5 ? '#a8742f' : '#7a4a22';
    for (const c of b.cells) ctx.fillRect((c % GW) * CELL, (c / GW | 0) * CELL, CELL, CELL);
    if (b.gates && b.gates.length) { ctx.fillStyle = '#7fe08a'; for (const c of b.gates) ctx.fillRect((c % GW) * CELL + 1, (c / GW | 0) * CELL + 1, CELL - 2, CELL - 2); }
  }
  // Baupläne
  if (S && S.plans) for (const q of S.plans) {
    ctx.fillStyle = q.st === 'plan' ? 'rgba(217,154,74,.35)' : 'rgba(217,154,74,.6)'; ctx.strokeStyle = '#d99a4a'; ctx.lineWidth = 1 / cam.z; ctx.setLineDash(q.st === 'plan' ? [3, 2] : []);
    for (const c of q.cells) { const cx = (c % GW) * CELL, cy = (c / GW | 0) * CELL; ctx.fillRect(cx, cy, CELL, CELL); ctx.strokeRect(cx, cy, CELL, CELL); }
    if (q.gates) { ctx.fillStyle = 'rgba(127,224,138,.8)'; for (const c of q.gates) ctx.fillRect((c % GW) * CELL + 1, (c / GW | 0) * CELL + 1, CELL - 2, CELL - 2); }
    if (q.siren) { ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, 6.283); ctx.fill(); ctx.stroke(); }
    ctx.setLineDash([]);
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
    if (e.k === K_TRK) continue;
    (e.k === K_ZOM ? groups.zom : e.inc >= 0 ? groups.inf : e.k === K_CIV ? (e.armed ? groups.armed : groups.civ) : e.k === K_POL ? groups.pol : groups.sol).push(e);
  }
  for (const g in groups) {
    ctx.fillStyle = COL[g]; ctx.beginPath();
    for (const e of groups[g]) { ctx.moveTo(e.x + r, e.y); ctx.arc(e.x, e.y, r, 0, 6.283); }
    ctx.fill();
    if (cam.z > 1.4 || mapMode !== 'vec') { ctx.strokeStyle = '#000b'; ctx.lineWidth = .35; ctx.stroke(); }
  }
  // Minen
  if (S && S.mines) for (const m of S.mines) { const on = m.t != null && Math.floor(performance.now() / 120) % 2; ctx.fillStyle = on ? '#ff3b2f' : '#222'; ctx.strokeStyle = '#d9b36a'; ctx.lineWidth = .5 / cam.z; ctx.beginPath(); ctx.arc(m.x, m.y, Math.max(.9, 1.5 / cam.z), 0, 6.283); ctx.fill(); ctx.stroke(); }
  // Sirenen
  if (S && S.sirens) for (const si of S.sirens) {
    if (si.dead) { ctx.fillStyle = '#3a3a3a'; ctx.beginPath(); ctx.arc(si.x, si.y, Math.max(1.5, 3 / cam.z), 0, 6.283); ctx.fill(); continue; }
    const ph = (performance.now() / 700) % 1, R = Math.max(2.5, 4.5 / cam.z);
    for (let k = 0; k < 3; k++) { const q = (ph + k / 3) % 1; ctx.strokeStyle = `rgba(255,90,70,${.5 * (1 - q)})`; ctx.lineWidth = 1.5 / cam.z; ctx.beginPath(); ctx.arc(si.x, si.y, R + q * 40, 0, 6.283); ctx.stroke(); }
    ctx.fillStyle = '#555'; ctx.strokeStyle = '#000b'; ctx.lineWidth = .7 / cam.z; ctx.beginPath(); ctx.arc(si.x, si.y, R, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.fillStyle = Math.floor(performance.now() / 250) % 2 ? '#ff4030' : '#fff'; ctx.beginPath(); ctx.arc(si.x, si.y, R * .55, 0, 6.283); ctx.fill();
    if (si.hp < si.max) { ctx.fillStyle = '#000a'; ctx.fillRect(si.x - R, si.y - R * 1.7, R * 2, R * .3); ctx.fillStyle = '#e44'; ctx.fillRect(si.x - R, si.y - R * 1.7, R * 2 * Math.max(0, si.hp / si.max), R * .3); }
  }
  // Geschütze
  for (const e of E) if (e.k === K_TUR && !e.dead) {
    const L = Math.max(7, 11 / cam.z), an = e.tgt && !e.tgt.dead ? Math.atan2(e.tgt.y - e.y, e.tgt.x - e.x) : (e.ang || 0); e.ang = an;
    ctx.save(); ctx.translate(e.x, e.y); ctx.fillStyle = '#4d5340'; ctx.strokeStyle = '#000b'; ctx.lineWidth = .7 / cam.z; ctx.beginPath(); ctx.arc(0, 0, L * .42, 0, 6.283); ctx.fill(); ctx.stroke();
    ctx.rotate(an); ctx.strokeStyle = '#151515'; ctx.lineWidth = Math.max(1, 2.2 / cam.z); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L * .8, 0); ctx.stroke(); ctx.restore();
  }
  // Trucks
  for (const e of E) if (e.k === K_TRK && !e.dead) {
    const L = Math.max(8, 13 / cam.z); ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.ang || 0);
    ctx.fillStyle = '#6b7a3a'; ctx.strokeStyle = '#000b'; ctx.lineWidth = .6 / cam.z; ctx.fillRect(-L / 2, -L * .22, L, L * .44); ctx.strokeRect(-L / 2, -L * .22, L, L * .44);
    ctx.fillStyle = '#9aab55'; ctx.fillRect(L * .2, -L * .2, L * .28, L * .4);
    ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(.5, 1.4 / cam.z); ctx.beginPath(); ctx.moveTo(-L * .1, 0); ctx.lineTo(L * .55, 0); ctx.stroke(); ctx.restore();
  }
  if (S && !S.evac && S.evacPre) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2 / cam.z; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.arc(S.evacPre.x, S.evacPre.y, 30, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = `bold ${Math.max(14, 26 / cam.z)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', S.evacPre.x, S.evacPre.y); }
  // Evakuierungsort
  if (S && S.evac) { const k = .5 + .5 * Math.sin(performance.now() / 300); ctx.strokeStyle = `rgba(255,255,255,${.5 + .4 * k})`; ctx.lineWidth = 2 / cam.z; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.arc(S.evac.x, S.evac.y, 30, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = `bold ${Math.max(14, 26 / cam.z)}px system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', S.evac.x, S.evac.y); }
  // Schüsse
  ctx.lineWidth = 1.2 / cam.z + .15; ctx.strokeStyle = '#ffe9a0';
  ctx.beginPath(); for (const t of tracers) { ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); } ctx.stroke();
  // Auswahl
  if (selected.size) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 / cam.z; ctx.beginPath(); for (const u of selected) if (!u.dead) { ctx.moveTo(u.x + r * 2.2, u.y); ctx.arc(u.x, u.y, r * 2.2, 0, 6.283); } ctx.stroke(); }
  for (const u of E) if (u.ds > 0 && !u.dead && friendly(u)) { ctx.strokeStyle = u.ds === 2 ? '#c8924a' : '#c8924a88'; ctx.lineWidth = 1.6 / cam.z; ctx.setLineDash(u.ds === 2 ? [] : [3 / cam.z, 3 / cam.z]); ctx.beginPath(); ctx.arc(u.x, u.y, r * 3, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); }
  // Effekte
  const now = performance.now(), pul = .5 + .5 * Math.sin(now / 90), sz = Math.max(9, 18 / cam.z);
  for (const f of fx) {
    if (f.type === 'heli' || f.type === 'jet') {
      const col = f.type === 'jet' ? '255,70,50' : f.kind === 'supply' ? '80,170,255' : f.kind === 'evac' ? '255,255,255' : f.kind === 'build' ? '230,170,70' : f.kind === 'gunship' ? '255,90,60' : f.kind === 'mines' ? '230,140,60' : '120,220,110', rr = f.type === 'jet' ? 30 : f.kind === 'supply' ? 35 : f.kind === 'evac' ? 30 : f.kind === 'build' ? 8 : f.kind === 'gunship' ? 45 : f.kind === 'turret' ? 6 : f.kind === 'mines' ? 25 : 9;
      if (f.type === 'heli' && f.ph < 2 || f.type === 'jet' && !f.dropped) { ctx.strokeStyle = `rgba(${col},${.4 + .5 * pul})`; ctx.lineWidth = 2 / cam.z; ctx.beginPath(); ctx.arc(f.tx, f.ty, rr, 0, 6.283); ctx.stroke(); }
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a);
      if (f.type === 'heli') {
        ctx.fillStyle = f.kind === 'supply' ? '#35557a' : f.kind === 'evac' ? '#8a3333' : f.kind === 'build' ? '#7a5a2a' : f.kind === 'gunship' ? '#2b1c1c' : f.kind === 'turret' ? '#4a4f55' : f.kind === 'mines' ? '#5a4a2a' : '#3f4d33'; ctx.strokeStyle = '#000a'; ctx.lineWidth = .5 / cam.z;
        ctx.beginPath(); ctx.ellipse(0, 0, sz * .42, sz * .16, 0, 0, 6.283); ctx.fill(); ctx.stroke();
        ctx.fillRect(-sz * .85, -sz * .03, sz * .5, sz * .06);
        ctx.rotate(now / 40); ctx.strokeStyle = 'rgba(235,235,235,.85)'; ctx.lineWidth = Math.max(.5, 1.5 / cam.z);
        ctx.beginPath(); ctx.moveTo(-sz * .6, 0); ctx.lineTo(sz * .6, 0); ctx.moveTo(0, -sz * .6); ctx.lineTo(0, sz * .6); ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = Math.max(1, 2 / cam.z); ctx.beginPath(); ctx.moveTo(-sz * .5, 0); ctx.lineTo(-sz * 6, 0); ctx.stroke();
        ctx.fillStyle = '#d3dae0'; ctx.strokeStyle = '#000a'; ctx.lineWidth = .5 / cam.z;
        ctx.beginPath(); ctx.moveTo(sz * .7, 0); ctx.lineTo(-sz * .45, sz * .42); ctx.lineTo(-sz * .25, 0); ctx.lineTo(-sz * .45, -sz * .42); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    } else if (f.type === 'timer') {
      ctx.strokeStyle = `rgba(120,220,110,${.3 + .4 * pul})`; ctx.lineWidth = 2 / cam.z; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.arc(f.spawn.tx, f.spawn.ty, 7, 0, 6.283); ctx.stroke(); ctx.setLineDash([]);
    } else if (f.type === 'flare') {
      const act = f.t <= 20; ctx.fillStyle = act ? `rgba(255,${120 + 100 * pul | 0},40,.95)` : '#552'; ctx.beginPath(); ctx.arc(f.x, f.y, Math.max(1.5, 3 / cam.z), 0, 6.283); ctx.fill();
      if (act) { ctx.strokeStyle = `rgba(255,150,50,${.25 + .35 * pul})`; ctx.lineWidth = 1.5 / cam.z; ctx.beginPath(); ctx.arc(f.x, f.y, 18, 0, 6.283); ctx.stroke(); }
    } else if (f.type === 'bomb') {
      const k = 1 - f.t / f.T; ctx.strokeStyle = `rgba(255,70,50,${.4 + .5 * pul})`; ctx.lineWidth = 2 / cam.z; ctx.beginPath(); ctx.arc(f.tx, f.ty, 30, 0, 6.283); ctx.stroke();
      ctx.fillStyle = '#220'; ctx.beginPath(); ctx.arc(f.x0 + (f.tx - f.x0) * k, f.y0 + (f.ty - f.y0) * k, Math.max(1.5, 3 / cam.z), 0, 6.283); ctx.fill();
    } else if (f.type === 'boom') { const k = 1 - f.t / .7; ctx.fillStyle = `rgba(255,${200 - 120 * k | 0},60,${.8 * (1 - k)})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (.6 + .6 * k), 0, 6.283); ctx.fill(); }
    else if (f.type === 'ring') { const k = f.t / f.T; ctx.strokeStyle = `rgba(${f.c},${k})`; ctx.lineWidth = 2 / cam.z; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.4 - .4 * k), 0, 6.283); ctx.stroke(); }
  }
  // Vorschau
  if (hover && phase !== 'x') {
    if (toolSel === 'barricade' && drag && drag.tool) { ctx.strokeStyle = '#d99a4a'; ctx.lineWidth = CELL; ctx.globalAlpha = .6; ctx.beginPath(); ctx.moveTo(drag.wx, drag.wy); ctx.lineTo(hover[0], hover[1]); ctx.stroke(); ctx.globalAlpha = 1; }
    else if (toolSel === 'strike' || toolSel === 'supply' || toolSel === 'garrison') { ctx.strokeStyle = '#fff6'; ctx.lineWidth = 1.5 / cam.z; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(hover[0], hover[1], toolSel === 'strike' ? 30 : toolSel === 'supply' ? 35 : 9, 0, 6.283); ctx.stroke(); ctx.setLineDash([]); }
  }
  ctx.restore();
  const bx = drag && drag.box; if (bx) { ctx.strokeStyle = '#fff'; ctx.fillStyle = '#ffffff22'; ctx.lineWidth = 1; ctx.fillRect(bx[0], bx[1], bx[2] - bx[0], bx[3] - bx[1]); ctx.strokeRect(bx[0], bx[1], bx[2] - bx[0], bx[3] - bx[1]); }
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
  drag = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y, pan, tool: !pan, wx, wy, moved: false, button: e.button };
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
    if (drag.moved && drag.tool && toolSel === 'units') drag.box = [drag.sx, drag.sy, e.clientX, e.clientY];
    if (drag.pan) { cam.x = drag.cx - (e.clientX - drag.sx) / cam.z; cam.y = drag.cy - (e.clientY - drag.sy) / cam.z; clampCam(); }
  }
});
function endPtr(e) {
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
  cv.style.cursor = 'grab';
  if (drag && drag.tool) {
    const [wx, wy] = s2w(e.clientX, e.clientY);
    if (toolSel === 'barricade') useTool('barricade', drag.wx, drag.wy, drag.moved ? wx : drag.wx, drag.moved ? wy : drag.wy);
    else if (toolSel === 'units') unitsPointer(drag, wx, wy, e.shiftKey);
    else if (!drag.moved) useTool(toolSel, wx, wy);
  } else if (drag && drag.pan && !drag.moved && drag.button === 2 && selected.size) { const [wx, wy] = s2w(e.clientX, e.clientY); commandMove(wx, wy); }
  drag = null;
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', e => { drag = null; ptrs.delete(e.pointerId); pinch = null; });
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const [wx, wy] = s2w(e.clientX, e.clientY);
  cam.z = clamp(cam.z * Math.exp(-e.deltaY * .0015), minZ, 6);
  cam.x = wx - (e.clientX - VW / 2) / cam.z; cam.y = wy - (e.clientY - VH / 2) / cam.z; clampCam();
}, { passive: false });
const friendly = e => !e.dead && (e.k === K_POL || e.k === K_SOL || e.k === K_SEN || e.k === K_TRK || e.k === K_TUR);
const unitSpeed = u => u.k === K_POL ? 4.4 : u.k === K_TRK ? 8 : 4.8;
let patrolArmed = false, gidN = 0;
function addSel(u) { if (u.auto) return; selected.add(u); if (u.g) for (const m of E) if (m.g === u.g && friendly(m)) selected.add(m); }
function delSel(u) { selected.delete(u); if (u.g) for (const m of [...selected]) if (m.g === u.g) selected.delete(m); }
function unitsPointer(d, wx, wy, add) {
  if (d.moved) {
    const x0 = Math.min(d.wx, wx), x1 = Math.max(d.wx, wx), y0 = Math.min(d.wy, wy), y1 = Math.max(d.wy, wy);
    if (!add) selected.clear();
    for (const e of E) if (friendly(e) && e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1) addSel(e);
    return;
  }
  let best = null, bd = (16 / cam.z + 2) ** 2;
  for (const e of E) if (friendly(e)) { const q = (e.x - wx) ** 2 + (e.y - wy) ** 2; if (q < bd) { bd = q; best = e; } }
  if (best) { if (add) { selected.has(best) ? delSel(best) : addSel(best); } else { selected.clear(); addSel(best); } }
  else if (selected.size) commandMove(wx, wy);
}
function commandMove(x, y) {
  const us = [...selected].filter(u => friendly(u) && u.k !== K_TUR); if (!us.length) return;
  if (!walkCost(x, y)) { const p = randWalk(x, y, 12); if (!p) return toast('Dorthin kann niemand laufen'); x = p[0]; y = p[1]; }
  const patrol = patrolArmed; patrolArmed = false; $('sPat').classList.remove('on');
  const gs = {};
  for (const u of us) if (u.g) { const o = gs[u.g] || (gs[u.g] = { n: 0, cx: 0, cy: 0, sp: 9 }); o.n++; o.cx += u.x; o.cy += u.y; o.sp = Math.min(o.sp, u.k === K_POL ? 4.4 : 4.8); }
  for (const k in gs) { gs[k].cx /= gs[k].n; gs[k].cy /= gs[k].n; }
  const rad = 3 + Math.sqrt(us.length) * 3, master = []; master.tx = x; master.ty = y;
  for (const u of us) {
    const o = u.g && gs[u.g]; let p;
    if (o && o.n > 1) {   // feste Formationsplätze rund ums Ziel (nicht die aktuelle Streuung übernehmen, sonst finden auseinandergelaufene Squads nie zusammen)
      const k = o.i = (o.i || 0) + 1, a = k / o.n * 6.283, r = o.n > 1 ? 2.5 + (k % 2) * 1.5 : 0;
      p = randWalk(x + Math.cos(a) * r, y + Math.sin(a) * r, 2.5) || randWalk(x, y, rad) || [x, y]; u.gsp = o.sp;
    }
    else { p = randWalk(x, y, rad) || [x, y]; u.gsp = 0; }
    giveMove(u, p, patrol ? { x, y, r: 70 } : null, master);
  }
  fx.push({ type: 'ring', x, y, r: 8, t: .8, T: .8, c: patrol ? '90,170,255' : '255,255,255' });
}
function clampCam() { cam.x = clamp(cam.x, 0, WW); cam.y = clamp(cam.y, 0, WH); }

// ───────────────────────── UI ─────────────────────────
const $ = id => document.getElementById(id);
function toast(t, ms = 2200) { const el = $('toast'); el.textContent = t; el.style.display = 'block'; clearTimeout(toast.h); toast.h = setTimeout(() => el.style.display = 'none', ms); }
const SL = { pop: ['vPop', v => v], inf0: ['vInf0', v => v], armed: ['vArmed', v => v + ' %'], acc: ['vAcc', v => v + ' %'], police: ['vPolice', v => v], mil: ['vMil', v => v], patrol: ['vPatrol', v => v < 25 ? 'selten' : v < 70 ? 'mittel' : 'häufig'], infT: ['vInfT', v => v + ' s'], zs: ['vZs', v => v < 33 ? 'klassisch' : v < 70 ? 'gemischt' : 'modern'] };
function syncSliders() { $('origin').value = cfg.origin; for (const k in SL) { $(k).value = cfg[k]; $(SL[k][0]).textContent = SL[k][1](+cfg[k]); } }
for (const k in SL) $(k).addEventListener('input', () => { cfg[k] = +$(k).value; $(SL[k][0]).textContent = SL[k][1](cfg[k]); });
$('origin').addEventListener('change', () => { cfg.origin = $('origin').value; });
const MAP_LABEL = { sat: '🛰 Satellit', osm: '🗺 OSM-Karte', vec: '▦ Vektor' };
function applyMapMode() { preloadTiles(); $('bMap').textContent = MAP_LABEL[mapMode]; $('attr').textContent = mapMode === 'vec' ? 'Kartendaten © OpenStreetMap-Mitwirkende' : TILE_SRC[mapMode].attr; }
const SND = { 1: '🔊', .5: '🔉', 0: '🔇' };
try { SFX.sirenOff = localStorage.getItem('zos_sirenoff') === '1'; } catch (e) {}
const sirLabel = () => { $('bSir').textContent = SFX.sirenOff ? '📢✕' : '📢'; $('bSir').title = SFX.sirenOff ? 'Sirenenton ist aus (klicken zum Einschalten)' : 'Sirenenton ist an (klicken zum Ausschalten)'; };
sirLabel(); $('bSir').onclick = () => { SFX.sirenOff = !SFX.sirenOff; try { localStorage.setItem('zos_sirenoff', SFX.sirenOff ? '1' : '0'); } catch (e) {} sirLabel(); };
$('bSnd').textContent = SND[SFX.level()];
$('bSnd').onclick = () => { $('bSnd').textContent = SND[SFX.cycle()]; SFX.ui(); };
addEventListener('pointerdown', SFX.resume); addEventListener('keydown', SFX.resume);
addEventListener('pointerdown', () => Music.resume()); addEventListener('keydown', () => Music.resume());
const MUS = { 1: '🎵', .5: '🎵 ½', 0: '🎵 ✕' };
$('bMus').textContent = MUS[Music.level()];
$('bMus').onclick = () => { $('bMus').textContent = MUS[Music.cycle()]; SFX.ui(); };
$('bMap').onclick = () => { mapMode = mapMode === 'sat' ? 'osm' : mapMode === 'osm' ? 'vec' : 'sat'; try { localStorage.setItem('zos_mapmode', mapMode); } catch (e) {} applyMapMode(); };
try { const m = localStorage.getItem('zos_mapmode'); if (MAP_LABEL[m]) mapMode = m; } catch (e) {}
const selU = () => [...selected].filter(u => friendly(u) && !u.auto);
$('bEvacU').onclick = () => startUnitEvac();
$('bCommit').onclick = () => commitBuild();
$('bDrop').onclick = () => { if (S.plans.some(q => q.st === 'plan' && q.siren)) cooldown.siren = 0; S.used.siren -= S.plans.filter(q => q.st === 'plan' && q.siren).length; S.plans = S.plans.filter(q => q.st !== 'plan'); toast('Baupläne verworfen'); };
// Feuermodus: ein Menü für alle Waffenvarianten; angeboten wird nur, was zu den gewählten Einheitentypen passt
const FM = {
  sol: [['', '🔫 Sturmgewehr', 'Standard: bremst Zombies kurz aus'], ['sil', '🔇 Dämpfer', 'Lärm −50 %, keine Mann-Stop-Wirkung', 'canSil'], ['snipe', '🎯 Sniper', 'Reichweite ×3, Feuerrate −50 %, Lärm +20 %, wirft Zombies zurück', 'canSnipe']],
  pol: [['', '🔫 Pistole', 'Standard: keine Mann-Stop-Wirkung'], ['mp', '🔫 MP', 'Mehr Reichweite, schnellere Schussfolge, keine Mann-Stop-Wirkung', 'canMp'], ['sg', '💥 Schrotflinte', 'Reichweite wie Pistole, Treffer +10 %, wirft Zombies 2 Schritte zurück', 'canSg']]
};
const fmOf = u => u.sil ? 'sil' : u.snipe ? 'snipe' : u.mp ? 'mp' : u.sg ? 'sg' : '';
const fmKind = u => u.k === K_POL ? 'pol' : u.k === K_SOL || u.k === K_SEN ? 'sol' : null;
function fmAvail() {   // [{kind, modes}] für die gewählten Einheitentypen
  const kinds = new Set(selU().map(fmKind).filter(Boolean)), out = [];
  for (const k of ['sol', 'pol']) if (kinds.has(k)) { const m = FM[k].filter(x => !x[3] || RULES[x[3]]); if (m.length > 1) out.push({ kind: k, modes: m }); }
  return out;
}
function setFireMode(kind, mode) {
  for (const u of selU()) if (fmKind(u) === kind) {
    if (kind === 'pol' && u.ammoMax) {   // jede Waffe hat ihr eigenes Magazin: Pistole 40, MP 150, Schrotflinte 40 (× Munitions-Upgrade)
      const old = fmOf(u), cap = m => (m === 'mp' ? 150 : 40) * (RULES.ammoMul || 1);
      u.ams = u.ams || {}; u.ams[old] = u.ammo; u.ammoMax = cap(mode); u.ammo = u.ams[mode] != null ? Math.min(u.ams[mode], u.ammoMax) : u.ammoMax;
    }
    u.sil = mode === 'sil'; u.snipe = mode === 'snipe'; u.mp = mode === 'mp'; u.sg = mode === 'sg'; }
  const m = FM[kind].find(x => x[0] === mode); toast(m[1] + ': ' + m[2]); $('fmenu').style.display = 'none';
}
let fmKey = '';
function refreshFire() {
  const av = fmAvail(), b = $('sFire'); b.style.display = av.length ? '' : 'none';
  if (!av.length) { $('fmenu').style.display = 'none'; fmKey = ''; return; }
  const us = selU(), key = av.map(a => a.kind + a.modes.map(m => m[0]).join('.') + us.filter(u => fmKind(u) === a.kind).map(fmOf).join('')).join('|');
  if (key === fmKey) return; fmKey = key;
  $('fmenu').innerHTML = av.map(a => (av.length > 1 ? `<div class="fh">${a.kind === 'sol' ? 'Soldaten' : 'Polizei'}</div>` : '') + a.modes.map(m => `<button data-k="${a.kind}" data-m="${m[0]}" title="${m[2]}" class="${us.filter(u => fmKind(u) === a.kind).every(u => fmOf(u) === m[0]) ? 'on' : ''}">${m[1]}</button>`).join('')).join('');
  $('fmenu').querySelectorAll('button').forEach(x => x.onclick = () => setFireMode(x.dataset.k, x.dataset.m));
}
$('sFire').onclick = () => { const m = $('fmenu'); m.style.display = m.style.display === 'flex' ? 'none' : 'flex'; };
$('sHold').onclick = () => { for (const u of selU()) { if (u.ds === 3) u.pend = null; u.ord = true; u.path = null; u.patrol = null; u.hmx = u.x; u.hmy = u.y; } toast('Stellung wird gehalten'); };
$('sDig').onclick = () => { for (const u of selU()) if (u.ds === 0) { u.ord = true; u.path = null; u.patrol = null; u.ds = 1; u.dt = 0; } toast('Einheiten graben sich ein (1 Min.)'); };
$('sFree').onclick = () => { for (const u of selU()) if (u.ds === 1 || u.ds === 2) { u.dt = u.ds === 1 ? 60 - u.dt : 0; u.ds = 3; u.pend = null; } toast('Stellung wird geräumt (1 Min.)'); };
$('sPat').onclick = () => { patrolArmed = !patrolArmed; $('sPat').classList.toggle('on', patrolArmed); if (patrolArmed) toast('Ziel antippen: Einheiten patrouillieren dort'); };
$('sRel').onclick = () => { for (const u of selected) { if (u.ds > 0) { if (u.ds !== 3) { u.dt = u.ds === 1 ? 60 - u.dt : 0; u.ds = 3; } u.pend = { release: true }; } else { u.ord = false; u.path = null; u.patrol = null; } } toast('Einheiten wieder selbstständig (eingegrabene räumen zuerst)'); };
$('sClr').onclick = () => selected.clear();
const uEnt = new Map(), uCnt = {};
const UNAME = { [K_POL]: 'Polizist', [K_SOL]: 'Soldat', [K_SEN]: 'Wache', [K_TRK]: 'Truck', [K_TUR]: 'Geschütz' }, UCOL = { [K_POL]: COL.pol, [K_SOL]: COL.sol, [K_SEN]: COL.sol, [K_TRK]: '#9fb23a', [K_TUR]: '#7d8a6a' };
const SQNAME = { [K_POL]: 'Polizei-Squad', [K_SOL]: 'Armee-Squad', [K_SEN]: 'Garnison' };
function centerOn(u) { cam.x = u.x; cam.y = u.y; cam.z = Math.max(cam.z, 1.6); clampCam(); }
function unitState(u) {
  const x = (RULES.ammo && u.ammoMax ? ' · 🔫' + Math.max(0, u.ammo | 0) : '') + (u.sil ? ' 🔇' : '') + (u.snipe ? ' 🎯' : '') + (u.mp ? ' MP' : '') + (u.sg ? ' 💥' : '');
  return unitState0(u) + x;
}
function unitState0(u) {
  return u.evac ? 'Evakuierung' : u.inc >= 0 ? '☣ infiziert' : u.ds === 1 ? 'gräbt ' + Math.round(u.dt / .6) + '%' : u.ds === 2 ? 'eingegraben' : u.ds === 3 ? 'räumt ' + Math.round(u.dt / .6) + '%' : u.tgt && !u.tgt.dead && u.tgt.k === K_ZOM ? 'Kampf' : u.patrol ? (u.path ? 'Marsch' : 'Patrouille') : u.ord ? (u.path ? 'Marsch' : 'Position') : u.k === K_SEN ? 'Wache' : u.path ? 'Patrouille' : 'bereit';
}
function setTxt(el, t) { if (el.textContent !== t) el.textContent = t; }
function updateUnitList() {
  const box = $('units'); if (phase !== 'run') { box.style.display = 'none'; return; }
  box.style.display = 'flex';
  const us = E.filter(friendly);
  us.sort((a, b) => a.k - b.k || a.id - b.id);
  const groups = new Map();
  for (const u of us) { const key = u.sq && u.k !== K_TRK ? 's' + u.sq : 'u' + u.id; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(u); }
  for (const [key, ent] of uEnt) if (!groups.has(key)) { ent.el.remove(); uEnt.delete(key); }
  if (!uEnt.size) for (const k in uCnt) delete uCnt[k];
  for (const [key, ms] of groups) {
    let ent = uEnt.get(key);
    const squad = key[0] === 's';
    if (!ent) {
      const k = ms[0].k; uCnt[squad ? 'q' + k : k] = (uCnt[squad ? 'q' + k : k] || 0) + 1;
      const el = document.createElement('div'), head = document.createElement('div'), body = document.createElement('div');
      head.className = 'urow'; body.className = 'ubody';
      head.innerHTML = `${squad ? '<b class="plus">+</b>' : ''}<i style="background:${UCOL[k]}"></i><u></u><em></em><span></span>`;
      const name = (squad ? SQNAME[k] : UNAME[k]) + ' ' + uCnt[squad ? 'q' + k : k];
      head.children[squad ? 2 : 1].textContent = name;
      el.append(head, body); $('uList').appendChild(el);
      ent = { el, head, body, rows: new Map(), size: ms.length, open: false, squad };
      if (squad) {
        head.querySelector('.plus').onclick = ev => { ev.stopPropagation(); ent.open = !ent.open; el.classList.toggle('open', ent.open); ev.target.textContent = ent.open ? '−' : '+'; };
      }
      head.onclick = ev => { if (!ev.shiftKey) selected.clear(); const m = ent.cur[0]; ent.cur.some(x => selected.has(x)) && ev.shiftKey ? delSel(m) : addSel(m); };
      head.ondblclick = () => { selected.clear(); addSel(ent.cur[0]); const c = ent.cur; centerOn({ x: c.reduce((a, u) => a + u.x, 0) / c.length, y: c.reduce((a, u) => a + u.y, 0) / c.length }); };
      uEnt.set(key, ent);
    }
    ent.cur = ms; ent.size = Math.max(ent.size, ms.length);
    // Kopfzeile
    const anySel = ms.some(u => selected.has(u)), anyInf = ms.some(u => u.inc >= 0);
    ent.head.classList.toggle('sel', anySel); ent.head.classList.toggle('inf', anyInf);
    if (squad) {
      const fight = ms.filter(u => u.tgt && !u.tgt.dead && u.tgt.k === K_ZOM).length;
      setTxt(ent.head.children[3], ms[0].g && ms[0].g !== ms[0].sq ? 'G' + ms[0].g : '');
      setTxt(ent.head.children[4], ms.length + '/' + ent.size + ' · ' + (fight ? 'Kampf' : unitState(ms[0])));
    } else {
      setTxt(ent.head.children[2], ms[0].g && ms[0].g !== ms[0].sq ? 'G' + ms[0].g : '');
      setTxt(ent.head.children[3], unitState(ms[0]));
    }
    if (!squad) continue;
    // Mitglieder
    const set = new Set(ms);
    for (const [u, row] of ent.rows) if (!set.has(u)) { row.remove(); ent.rows.delete(u); }
    ms.forEach((u, i) => {
      let row = ent.rows.get(u);
      if (!row) {
        row = document.createElement('div'); row.className = 'urow mem';
        row.innerHTML = `<i style="background:${UCOL[u.k]}"></i><u>${UNAME[u.k]} ${i + 1}</u><span></span>`; row.dataset.n = UNAME[u.k] + ' ' + (i + 1);
        row.onclick = ev => { if (!ev.shiftKey) selected.clear(); addSel(u); };
        row.ondblclick = () => { selected.clear(); addSel(u); centerOn(u); };
        ent.rows.set(u, row); ent.body.appendChild(row);
      }
      row.classList.toggle('sel', selected.has(u)); row.classList.toggle('inf', u.inc >= 0);
      if (ent.open) { setTxt(row.lastChild, unitState(u) + ' · ' + Math.round((u.ae || u.acc) * 100) + '%'); if (RULES.xp) setTxt(row.children[1], row.dataset.n + ' · L' + u.lvl); }
    });
  }
  $('uCnt').textContent = us.length;
}
$('uHead').onclick = () => { const b = $('units'); b.classList.toggle('col'); $('uTog').textContent = b.classList.contains('col') ? '▸' : '▾'; };
if (innerWidth < 700) { $('units').classList.add('col'); $('uTog').textContent = '▸'; }
function setSpeed(s) { speed = s; for (const n of [0, 1, 2, 4]) $('sp' + n).classList.toggle('on', n === s); }
for (const n of [0, 1, 2, 4]) $('sp' + n).onclick = () => setSpeed(n);
document.querySelectorAll('#tools .cat').forEach(c => { const m = c.querySelector('.tmenu'); c._menu = m; m._cat = c; document.body.appendChild(m); });   // Menüs außerhalb von #tools (backdrop-filter würde position:fixed verschieben)
const closeMenus = () => document.querySelectorAll('.tmenu.open').forEach(m => { m.classList.remove('open'); m._cat.classList.remove('open'); });
function selectTool(t) {
  toolSel = t; document.querySelectorAll('button[data-tool]').forEach(x => x.classList.toggle('on', x.dataset.tool === t));
  document.querySelectorAll('.cat').forEach(c => c.classList.toggle('on', !!c._menu.querySelector('button[data-tool="' + t + '"]')));
  cv.style.cursor = t === 'pan' ? 'grab' : 'crosshair'; closeMenus();
}
document.querySelectorAll('button[data-tool]').forEach(b => b.onclick = () => selectTool(b.dataset.tool));
document.querySelectorAll('#tools .catbtn').forEach(b => b.onclick = ev => {
  ev.stopPropagation(); const cat = b.parentElement, m = cat._menu, open = !m.classList.contains('open'); closeMenus();
  if (open) { m.classList.add('open'); cat.classList.add('open'); const r = b.getBoundingClientRect(); m.style.left = Math.max(8, Math.min(innerWidth - m.offsetWidth - 8, r.left)) + 'px'; m.style.bottom = (innerHeight - r.top + 6) + 'px'; }
});
addEventListener('pointerdown', e => { if (!e.target.closest('.cat') && !e.target.closest('.tmenu')) closeMenus(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal').style.display.includes('flex')) selectTool('pan'); });
function startRun(loaded) {
  Music.play('game');
  phase = 'run'; $('setup').style.display = 'none'; finished = false;
  if (!loaded) newSim();
  setSpeed(1); acc = 0;
}
$('bStart').onclick = () => { newSim(); startRun(true); autosave(); };
$('bResume').onclick = () => loadSlot(0);
$('bMenu').onclick = () => modal(`<h2>Zurück zum Hauptmenü</h2><p>Aktuelle Simulation verlassen? (Nicht gespeicherter Fortschritt geht verloren.)</p><div class="btns"><button class="big" id="mYes">Ja, zum Hauptmenü</button><button id="mNo">Abbrechen</button></div>`, () => {
  $('mYes').onclick = () => { closeModal(); toMenu(); };
  $('mNo').onclick = closeModal;
});
function toMenu() {
  phase = 'setup'; E = []; BAR = [null]; barId.fill(0); gate.fill(0); fx = []; noises = []; tracers = []; for (const b of B) { b.occ = []; b.siege = 0; } markers = []; finished = false; selected.clear();
  if (RULES.mode === 'campaign') cfg = { ...DEFAULTS };   // Kampagnenwerte (Polizei 0 usw.) nicht in den Classic-Modus mitnehmen
  S = null; RULES = classicRules(); if (curMap !== 'moosburg') setupMap('moosburg');
  $('setup').style.display = 'none'; $('objs').style.display = 'none'; $('buildbar').style.display = 'none'; $('menu').style.display = 'flex'; setSpeed(0); refreshResume(); fitCam(); Music.play('menu');
}
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
  finished = true; setSpeed(0); autosave(); SFX.end(msg.includes('eingedämmt') || msg.includes('Sieg'));
  if (RULES.onEnd) return RULES.onEnd(msg);
  if (!(msg.includes('eingedämmt') || msg.includes('Sieg'))) Music.play('defeat');
  showStats(msg);
}
function showStats(title) {
  if (!S) return;
  const c = counts(), st = S, sc = score(finished && c.civ + c.pol + c.mil > 0);
  modal(`<h2>${title || 'Analyse'}</h2>
  <canvas id="chart" width="600" height="220" style="width:100%;height:auto;background:#10161200"></canvas>
  <div class="leg"><span><i style="background:#f1f5f2"></i>Zivilisten</span><span><i style="background:#f0a030"></i>Infizierte</span><span><i style="background:#58c24a"></i>Zombies</span><span><i style="background:#4a8bff"></i>Einsatzkräfte</span></div>
  <table style="margin-top:10px">
  <tr><td>Simulationsdauer</td><td>${fmtT(simT)}</td></tr>
  <tr><td>Gerettet: Zivilisten / Polizisten / Armeeeinheiten</td><td>${sc.civ} / ${sc.pol} / ${sc.mil}</td></tr>
  <tr><td><b>Punkte</b> (1 je Zivilist, 5 je Polizist, 10 je Armeeeinheit)</td><td><b>${sc.pts}</b></td></tr>
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
function refreshResume() { $('bResume').style.display = slotInfo(0) ? '' : 'none'; $('mResume').style.display = slotInfo(0) ? '' : 'none'; }
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
// Musik-Regie: bei Gefechtslage (viele Zombies in der Nähe der Einheiten bzw. viele Schüsse) Kampfmusik, danach nach ca. 40 s ruhiger Lage zurück
let hotT = 0, lastShots = 0, combatSince = 0;
function musicDirector() {
  if (phase !== 'run' || speed === 0 || !S || finished) return;
  let near = 0; for (const u of E) if (friendly(u) && u.k !== K_TUR) near += countZAround(u.x, u.y, 70);
  const shots = S.shots - lastShots; lastShots = S.shots;
  const threat = near + shots * .5;
  hotT = threat >= 8 ? Math.min(20, hotT + .2) : Math.max(0, hotT - .1);
  const cur = Music.current();
  if (cur !== 'combat' && hotT >= 3) { Music.play('combat'); combatSince = performance.now(); }
  else if (!cur) Music.play('game');
  else if (cur === 'combat' && hotT <= .5 && performance.now() - combatSince > 40000) Music.play('game');
}
function ambience() {
  musicDirector();
  if (phase !== 'run') { SFX.ambient([]); return; }
  SFX.ambient(fx.filter(f => f.type === 'heli').map(f => ({ x: f.x, y: f.y })));
  if (speed === 0) return;
  for (let k = 0; k < 3; k++) { const z = E[Math.random() * E.length | 0]; if (z && z.k === K_ZOM && !z.dead) SFX.groan(z.x, z.y); }
}
function updateHud() {
  const c = counts(), g = (id, v) => { const el = $(id); if (el.textContent != v) el.textContent = v; };
  if (RULES.hud) RULES.hud(c);
  g('hTrk', c.trk); g('hEvac', S ? (S.ev.civ + S.ev.pol + S.ev.mil + S.ev.trk) : 0); { const show = phase === 'run' && S && c.civ === 0 && c.pol + c.mil + c.trk > 0 && !S.evacUnits; $('bEvacU').style.display = show ? '' : 'none'; if (show && !S.civNote) { S.civNote = 1; toast('Keine Zivilisten mehr – Einheiten können jetzt evakuiert werden'); } }
  g('hCiv', c.civ); g('hInf', c.inf); g('hZom', c.zom); g('hPol', c.pol); g('hMil', c.mil);
  g('hKill', S ? S.kills : 0); g('hLoss', S ? S.loss : 0); g('clock', fmtT(simT));
  for (const u of selected) if (!friendly(u)) selected.delete(u);
  $('selbar').style.display = selected.size ? 'flex' : 'none'; refreshFire(); { const us = selU(); $('sDig').style.display = us.some(u => u.ds === 0) ? '' : 'none'; $('sFree').style.display = us.some(u => u.ds === 1 || u.ds === 2) ? '' : 'none'; } $('sRel').style.display = RULES.mode === 'campaign' ? 'none' : ''; $('selTxt').textContent = selected.size + ' Einheit(en) ausgewählt – Ziel antippen (rechte Maustaste)';
  const pct = phase === 'run' ? lostPct(c) : 0;
  if (S && phase === 'run') {
    const bb = $('buildbar'), pl = S.plans.filter(q => q.st === 'plan').length, od = S.plans.filter(q => q.st !== 'plan');
    bb.style.display = (toolSel === 'barricade' || toolSel === 'siren' || S.plans.length) ? 'flex' : 'none';
    const nxt = od.filter(q => q.st === 'ord').reduce((m, q) => Math.min(m, q.at - simT), 1e9);
    $('buildTxt').textContent = 'Bauphase: ' + barUsed() + '/' + RULES.barLimit + ' Elemente · ' + pl + ' geplant' + (od.length ? ' · Lieferung ' + (nxt < 1e8 ? 'in ' + Math.max(0, Math.ceil(nxt)) + ' s' : 'läuft') : '');
    $('bCommit').disabled = !pl; $('bDrop').disabled = !pl;
  } else $('buildbar').style.display = 'none';
  document.querySelectorAll('button[data-tool]').forEach(b => {
    const k = b.dataset.tool, el = b.querySelector('.cd'), sp = b.querySelector('span');
    if (k !== 'pan' && k !== 'units') {
      const gate = S && phase === 'run' ? toolGate(k) : { hidden: !RULES.tools[k] };
      b.style.display = gate.hidden ? 'none' : '';
      if (!gate.hidden && S) {
        const ex = gate.max != null && gate.left <= 0; b.classList.toggle('locked', !!gate.locked || ex);
        let t = sp.dataset.n || sp.textContent;
        if (k === 'barricade') t = 'Bauen ' + barUsed() + '/' + RULES.barLimit;
        else if (ex) t = sp.dataset.n + ' 0/' + gate.max; else if (gate.locked) t = b.closest('.tmenu') ? sp.dataset.n + ' · ' + gate.label : gate.label; else if (gate.max != null) t = sp.dataset.n + ' ' + gate.left + '/' + gate.max;
        if (sp.textContent !== t) sp.textContent = t;
      }
    }
    const cdMax = (RULES.tools[k] && RULES.tools[k].cd) || 0;
    if (el) el.style.width = (cooldown[k] > 0 && cdMax ? cooldown[k] / cdMax * 100 : 0) + '%';
  });
  document.querySelectorAll('#tools .cat').forEach(cat => {
    const items = [...cat._menu.querySelectorAll('button[data-tool]')].filter(b => b.style.display !== 'none');
    cat.style.display = items.length ? '' : 'none';
    const ready = cat.dataset.cat !== 'build' && S && phase === 'run' && items.some(b => !b.classList.contains('locked') && !(cooldown[b.dataset.tool] > 0));
    cat.querySelector('.catbtn').classList.toggle('rdy', !!ready);
  });
}

// ───────────────────────── Hauptschleife ─────────────────────────
let last = performance.now();
function frame(ts) {
  const rdt = Math.min(.1, (ts - last) / 1000); last = ts;
  if (phase === 'run' && speed > 0) {
    acc += rdt * speed; let n = 0;
    const tb = performance.now();
    try { while (acc >= DT && n < 12 && performance.now() - tb < 45) { step(); acc -= DT; n++; } }   // Zeitbudget: langsame Rechner bleiben bedienbar
    catch (err) { console.error(err); setSpeed(0); toast('Interner Fehler – Simulation pausiert. Speichern ist weiter möglich.'); }
    if (acc >= DT) acc = Math.min(acc, DT * 2);
  }
  try { draw(); } catch (err) { console.error(err); }
  SFX.setPaused(!(phase === 'run' && speed > 0));
  if (ts - hudT > 200) { hudT = ts; try { updateHud(); ambience(); if (ts - (frame.ut || 0) > 500) { frame.ut = ts; updateUnitList(); } } catch (err) { console.error(err); } }
  requestAnimationFrame(frame);
}
// Karten: 'moosburg' (Altdatei map-data.js) und weitere aus maps/*.js
function setupMap(id) {
  MD = id === 'moosburg' ? MAP_DATA : window.MAPS_DATA[id];
  WW = MD.w; WH = MD.h; GW = Math.ceil(WW / CELL); GH = Math.ceil(WH / CELL);
  if (id === 'moosburg') { LAT0 = 48.4790; LON0 = 11.9280; KX = 111320 * Math.cos(48.47 * Math.PI / 180); KY = 110574; }
  else { LAT0 = MD.north; LON0 = MD.west; KX = MD.kx; KY = MD.ky; }
  type = new Uint8Array(GW * GH); comp = new Uint8Array(GW * GH); barId = new Uint16Array(GW * GH); gate = new Uint8Array(GW * GH);
  gS = new Uint32Array(GW * GH); gD = new Uint32Array(GW * GH); gG = new Float32Array(GW * GH); gP = new Int32Array(GW * GH);
  HW = Math.ceil(WW / HS); HH = Math.ceil(WH / HS); hzHead = new Int32Array(HW * HH); hhHead = new Int32Array(HW * HH);
  stampN = 0; evD = null; evacDirty = false; BAR = [null]; E = []; fx = []; noises = []; tracers = []; selected.clear();
  B.length = 0; bHash.clear();
  buildGrid(); buildBuildings(); renderMap();
  curMap = id; fitCam();
}
let curMap = 'moosburg';
function init() {
  const t0 = performance.now();
  setupMap('moosburg');
  applyMapMode(); syncSliders(); refreshResume(); resize(); fitCam(); setSpeed(0);
  addEventListener('resize', resize);
  const COMIC_NAMES = { prologue: 'Prolog', m1_win: 'Mission 1 – Sieg (Outro)', m1_lose: 'Mission 1 – Niederlage', m2_win: 'Mission 2 – Sieg', m2_lose: 'Mission 2 – Niederlage', m3_intro: 'Mission 4 – Intro', m3_win: 'Mission 4 – Sieg', m3_lose: 'Mission 4 – Niederlage' };
  const comicList = () => modal('<h2>Intros &amp; Comics</h2><div class="btns" style="flex-direction:column">' + Object.keys(Comic.SEQ).map(k => `<button data-c="${k}">▶ ${COMIC_NAMES[k] || k}</button>`).join('') + '<button id="cBack">Zurück</button></div>', () => {
    $('cBack').onclick = closeModal;
    document.querySelectorAll('#mbox button[data-c]').forEach(b => b.onclick = () => { closeModal(); Comic.play(b.dataset.c, () => { Music.play('menu'); comicList(); }); });
  });
  $('mComics').onclick = comicList;
  $('mSand').onclick = () => { syncSliders(); $('menu').style.display = 'none'; $('setup').style.display = ''; };
  $('mResume').onclick = () => loadSlot(0);
  if (typeof Campaign !== 'undefined') Campaign.init();
  $('menu').style.display = 'flex'; $('setup').style.display = 'none'; Music.play('menu');
  console.log('Init', Math.round(performance.now() - t0), 'ms; Gebäude:', B.length, 'Raster', GW, GH);
  requestAnimationFrame(frame);
}
init();
window.__game = { stopPower, toMenu, get E() { return E; }, get S() { return S; }, cfg, cam, counts, step, setSpeed, startRun, newSim, useTool, B, commandMove, selected, get fx() { return fx; }, findPath, cost, cellIdx, get BAR() { return BAR; }, get type() { return type; }, get gate() { return gate; }, get barId() { return barId; } };
