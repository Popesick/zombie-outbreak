'use strict';
/* Kampagnenmodus: Missionen, Ziele, Punkte, Roster/Erfahrung, Shop. Nutzt die Globals aus game.js zur Laufzeit. */
const Campaign = (() => {
  const SAVE = 'zos_campaign';
  const UP = [   // Upgrades: id, Name, Beschreibung, Preise je Stufe
    { id: 'sil', n: 'Schalldämpfer', d: 'Soldaten können Schalldämpfer tragen: Lärm −50 %.', p: [300] },
    { id: 'squad', n: 'Squadgröße', d: 'Jeder Soldaten-Squad bekommt einen weiteren Soldaten (5 pro Squad).', p: [500] },
    { id: 'snipe', n: 'Sniper', d: 'Soldaten können Snipergewehre führen: Reichweite +200 %, Feuerrate −50 %, Lärm +20 %.', p: [400] },
    { id: 'barhp', n: 'Barrikaden verbessern', d: 'Barrikaden halten doppelt so lange (insgesamt 4× Classic).', p: [300] },
    { id: 'scan', n: 'Infektionsscanner', d: 'Soldaten erkennen infizierte Zivilisten und schalten sie aus. Tore sperren Infizierte aus.', p: [600] },
    { id: 'gate', n: 'Tore', d: 'Pro 12 Barrikadenelemente ein Tor: Menschen passieren, Zombies nicht.', p: [250] },
    { id: 'morebar', n: 'Mehr Barrikaden', d: '+12 Barrikadenelemente pro Stufe.', p: [150, 200, 250] },
    { id: 'turret', n: 'Automatikgeschütze', d: 'Zwei feste MG-Geschütze pro Mission, per Hubschrauber (30 s Verzögerung). Zerstörung erst durch 10 Zombies.', p: [600] },
    { id: 'ammo', n: 'Mehr Munition', d: 'Munitionsvorrat +100 %.', p: [350] },
    { id: 'moresupply', n: 'Mehr Versorgungspakete', d: '+5 Versorgungspakete pro Stufe.', p: [200, 300] },
    { id: 'flare', n: 'Signalbomben', d: '5 Signalbomben: 20 s lauter Lockton, danach Explosion (60 % Radius eines Luftschlags).', p: [250] },
    { id: 'mines', n: 'Minenteppiche', d: 'Ein Hubschrauber legt einen Minenteppich (Radius 25 m, 36 Minen). Jede Figur löst aus, Explosion nach 1 s. Je Stufe 3 Teppiche pro Mission.', p: [250, 300, 350] },
    { id: 'gunship', n: 'Gunship', d: 'Ein Hubschrauber schwebt 30 s über dem Ziel und beschießt es mit der Gatling (2 Einsätze pro Mission).', p: [700] }
  ];
  const BUY = [
    { id: 'pol', n: 'Polizei-Squad', d: '+2 Polizisten (Level 1).', p: 150 },
    { id: 'sol', n: 'Soldaten-Squad', d: '+4 Soldaten (Level 1).', p: 400 },
    { id: 'truck', n: 'MG-Truck', d: 'Ein weiterer Truck pro Mission (am Kartenrand anforderbar).', p: 350, max: 2 }
  ];

  // ── Missionen ──────────────────────────────────────────────────────────
  // Positionen für Mission 1 stammen aus dem Lageplan (Pixel des Kartenausschnitts → Weltkoordinaten)
  // Pixel des Lageplans (Screenshot) → Weltkoordinaten von Karte m1 (Referenz: Brücke und Teich, ca. 1 m pro Pixel)
  const m1px = (px, py) => ({ x: 214 + (px - 225), y: 520 + (py - 540) });
  // Isar-Mittellinie auf Karte m1: ein Zombie westlich davon hat die Brücke überquert
  const ISAR = [[0, 570], [200, 413], [400, 340], [520, 249], [700, 238], [1045, 296]];   // [y, x]
  const isarX = y => { for (let i = 1; i < ISAR.length; i++) if (y <= ISAR[i][0]) { const [y0, x0] = ISAR[i - 1], [y1, x1] = ISAR[i]; return x0 + (x1 - x0) * (y - y0) / (y1 - y0); } return ISAR[ISAR.length - 1][1]; };
  const MIS = [
    {
      id: 'm1', map: 'm1', name: 'Die Isarbrücke', sub: 'Moosburg Südost', pop: 750, armed: 6, acc: 35, zs: 50,
      start: () => ({ sol: [m1px(765, 490)], pol: [m1px(1040, 295), m1px(1450, 615)] }),
      evac: () => ({ ...m1px(150, 520), at: 120 }),
      spawns: () => [m1px(1790, 175), m1px(1790, 310), m1px(1790, 465)].flatMap(p => { const x = WW - 25; return [{ t: 0, n: 30, x, y: p.y, r: 30 }, { t: 120, n: 20, x, y: p.y, r: 30 }, { t: 240, n: 20, x, y: p.y, r: 30 }]; }),
      lure: () => ({ ...m1px(1310, 330), t: 0, dur: 60 }),
      hordeAt: 300, hordeFocus: .9,
      hold: (z) => z.x < isarX(z.y) - 20,
      tools: { supply: { at: 0, max: 5, cd: 20 }, strike: { at: 180, max: 3, cd: 8 }, garrison: { at: 300, max: 1, cd: 30 } },
      barricades: 24,
      primary: { civ: 300, pts: 600 }, secondary: { bridge: 150, clear: 150 },
      goal: ['Rette mindestens 300 Zivilisten (Evakuierung am „H“ auf der Westseite der Brücke).', 'Halte die Brücke (kein Zombie erreicht das Westufer) und töte alle Zombies.'],
      info: ['5 Versorgungspakete von Anfang an', '24 Barrikadenelemente (Bauphase, Lieferung per Hubschrauber)', 'Evakuierungssignal nach 2:00', 'Ab 3:00: drei Luftschläge', 'Ab 5:00: zweiter Soldaten-Squad per Hubschrauber', 'Nach 5:00 stürmt die Horde mit 90 % Zielstrebigkeit zum Evakuierungspunkt']
    },
    {
      id: 'm2', map: 'moosburg', name: 'Moosburg brennt', sub: 'Die ganze Stadt', pop: 3000, armed: 6, acc: 35, zs: 50,
      start: () => ({ sol: [{ x: 1260, y: 1540 }], pol: [{ x: 1180, y: 1480 }, { x: 1320, y: 1430 }] }),
      evac: () => ({ x: 1520, y: 1612, at: 60 }),
      evacCap: 60, evacEvery: 20,   // große Zahl Zivilisten: größere und häufigere Hubschrauber
      spawns: () => [{ t: 0, n: 400, x: 80, y: 80, r: 45 }, { t: 120, n: 200, x: 30, y: 950, r: 45 }, { t: 300, n: 200, x: 60, y: 1750, r: 45 }],
      lure: () => ({ x: 650, y: 1180, t: 0, dur: 60 }),
      hordeAt: 240, hordeFocus: .9,
      hold: null,
      tools: { supply: { at: 0, max: 5, cd: 20 }, strike: { at: 180, max: 4, cd: 8 }, garrison: { at: 240, max: 2, cd: 30 } },
      barricades: 36,
      primary: { civ: 2000, pts: 1500 }, secondary: { noLoss: true, pts: 600 },
      goal: ['Rette mindestens 2000 Zivilisten (Rettungszone auf der Ostseite der Isarbrücke).', 'Alle Einsatzkräfte müssen überleben.'],
      info: ['3000 Zivilisten – 400 Zombies aus Nordwesten', 'Nach 2:00: 200 Zombies aus Westen, nach 5:00: 200 aus Südwesten', '5 Versorgungspakete, 36 Barrikadenelemente', 'Evakuierungssignal nach 1:00 – größere Hubschrauber (60 Personen alle 20 s)', 'Ab 3:00: vier Luftschläge · ab 4:00: bis zu zwei weitere Soldaten-Squads', 'Ab 4:00 zieht die Horde zum Evakuierungspunkt']
    },
    {
      id: 'm3', map: 'm3', name: 'Letzte Linie', sub: 'Pfaffenhofen an der Ilm', pop: 1200, armed: 6, acc: 35, zs: 50,
      start: () => ({ sol: [{ x: 940, y: 1000 }], pol: [{ x: 860, y: 900 }, { x: 1020, y: 1090 }] }),
      evac: () => ({ x: 1110, y: 520, at: 90 }),
      spawns: () => [[1815, 670], [1030, 1860], [25, 950]].flatMap(([x, y]) => [{ t: 0, n: 50, x, y, r: 40 }, { t: 120, n: 40, x, y, r: 40 }, { t: 240, n: 40, x, y, r: 40 }, { t: 360, n: 40, x, y, r: 40 }]),
      lure: () => ({ x: 930, y: 1040, t: 0, dur: 60 }),
      hordeAt: 300, hordeFocus: .9,
      hold: null,
      tools: { supply: { at: 0, max: 5, cd: 20 }, strike: { at: 150, max: 5, cd: 8 }, garrison: { at: 200, max: 2, cd: 30 }, truck: { at: 0, max: 2, cd: 4 } },
      barricades: 48,
      primary: { civ: 450, pts: 1100 }, secondary: { units: .5, pts: 400 },
      goal: ['Rette mindestens 450 Zivilisten.', 'Lass mindestens die Hälfte deiner Einsatzkräfte überleben.'],
      info: ['5 Versorgungspakete', '48 Barrikadenelemente', 'Evakuierungssignal nach 1:30', 'Ab 2:30: fünf Luftschläge', 'Ab 3:20: zwei Soldaten-Squads per Hubschrauber', 'Trucks verfügbar, sofern gekauft']
    }
  ];

  // ── Spielstand ─────────────────────────────────────────────────────────
  const initialRoster = () => ({ squads: [{ k: 'sol', m: [0, 0, 0, 0] }, { k: 'pol', m: [0, 0] }, { k: 'pol', m: [0, 0] }] });
  const fresh = () => ({ v: 1, next: 0, points: 0, up: {}, trucks: 0, roster: initialRoster(), pre: null, best: {}, seen: {} });
  let C = (() => { try { const d = JSON.parse(localStorage.getItem(SAVE)); if (d && d.v === 1) return d; } catch (e) {} return null; })();
  const persist = () => { try { localStorage.setItem(SAVE, JSON.stringify(C)); } catch (e) {} };
  let cur = null, curIdx = 0;
  const lvOf = kills => 1 + Math.floor(kills / 50);
  const upLv = id => (C && C.up[id]) || 0;

  // ── Regeln einer Mission ───────────────────────────────────────────────
  function rulesFor(missionId, up) {
    const m = MIS.find(x => x.id === missionId) || MIS[0];
    const u = up || (C ? C.up : {});
    const lv = id => u[id] || 0;
    const tools = { barricade: {}, demolish: {}, ...m.tools };
    if (lv('moresupply')) tools.supply = { ...tools.supply, max: tools.supply.max + 5 * lv('moresupply') };
    if (C && C.trucks && !tools.truck) tools.truck = { at: 0, max: C.trucks, cd: 4 };
    else if (tools.truck && C) tools.truck = { ...tools.truck, max: Math.max(tools.truck.max || 0, 0) + C.trucks };
    if (lv('gate')) tools.gate = {};
    if (lv('turret')) tools.turret = { at: 0, max: 2, cd: 10 };
    if (lv('flare')) tools.flare = { at: 0, max: 5, cd: 4 };
    if (lv('mines')) tools.mines = { at: 0, max: 3 * lv('mines'), cd: 20 };
    if (lv('gunship')) tools.gunship = { at: 0, max: 2, cd: 45 };
    const R = {
      evacCap: m.evacCap, evacEvery: m.evacEvery, rushAfter: lastSpawnT(m), mode: 'campaign', missionId: m.id, up: { ...u }, tools, ammo: true, xp: true, zmix: true, baseAcc: .35,
      barLimit: m.barricades + 12 * lv('morebar'), barHpMul: 2 * (lv('barhp') ? 2 : 1),
      gateOk: !!lv('gate'), scan: !!lv('scan'), canSil: !!lv('sil'), canSnipe: !!lv('snipe'), squadPlus: lv('squad') ? 1 : 0, ammoMul: lv('ammo') ? 2 : 1,
      spawn: () => spawnMission(m), tick: () => tick(m), hud: c => hud(m, c), checkEnd: c => checkEnd(m, c), onEnd: msg => finish(m, msg)
    };
    return R;
  }

  function unitFrom(kind, x, y, sq, kills) {
    const k = kind === 'pol' ? K_POL : K_SOL, e = mk(k, x, y), lvl = lvOf(kills);
    e.armed = true; e.kills = kills; e.lvl = lvl; e.acc = .35 + .05 * (lvl - 1);
    e.ammoMax = (kind === 'pol' ? 40 : 150) * RULES.ammoMul; e.ammo = e.ammoMax; e.g = sq; e.sq = sq; e.hmx = x; e.hmy = y;
    E.push(e); return e;
  }
  function spawnMission(m) {
    const st = m.start(), cnt = { sol: 0, pol: 0 };
    for (const sq of C.roster.squads) {
      const list = st[sq.k], p0 = list[cnt[sq.k]++ % list.length], p = nearestWalkCell(p0.x, p0.y, 40) ? { x: nearestWalkCell(p0.x, p0.y, 40)[0], y: nearestWalkCell(p0.x, p0.y, 40)[1] } : p0, id = ++gidN, kills = sq.m.slice();
      if (sq.k === 'sol') while (kills.length < 4 + RULES.squadPlus) kills.push(0);
      for (const kl of kills) { const q = randWalk(p.x, p.y, 6) || [p.x, p.y]; unitFrom(sq.k, q[0], q[1], id, kl); }
    }
    S.fired = {}; S.evU = []; S.spawned = 0; S.breach = false;
    { const ev = m.evac(), p = randWalk(ev.x, ev.y, 25) || randWalk(ev.x, ev.y, 80) || [ev.x, ev.y]; S.pad = { x: p[0], y: p[1] }; S.evacPre = S.pad; }
    cfg.pop = m.pop;
  }
  function spawnWave(w, first) {
    for (let i = 0; i < w.n; i++) {
      const p = randWalk(w.x, w.y, w.r || 30) || randWalk(w.x, w.y, 90) || anyWalk(true);
      spawnZombie(p[0], p[1]); S.spawned++;
    }
    if (first) alertAt(w.x, w.y, 'Infizierte dringen ein');
  }
  function tick(m) {
    if (!S.fired) return;
    const fire = (id, t, fn) => { if (!S.fired[id] && simT >= t) { S.fired[id] = 1; fn(); } };
    m.spawns().forEach((w, i) => fire('sp' + i, w.t, () => spawnWave(w, w.t === 0)));
    const lu = m.lure(); fire('lure', lu.t, () => { S.lure = { x: lu.x, y: lu.y, until: simT + lu.dur }; zfDirty = true; });
    const ev = m.evac(); fire('evac', ev.at, () => { S.evac = { x: S.pad.x, y: S.pad.y }; S.evacR = 50; S.evacT = 8; S.evacPre = null; Music.play('hope'); computeEvacField(); toast('📡 Evakuierungssignal gegeben – Zivilisten laufen zum Landeplatz'); SFX.alarm(); });
    fire('horde', m.hordeAt, () => { S.horde = m.hordeFocus; zfDirty = true; toast('⚠ Die Horde zieht jetzt zielstrebig zum Evakuierungspunkt!'); SFX.alarm(); });
    for (const [tool, t] of Object.entries(RULES.tools)) if (t.at > 0) fire('u' + tool, t.at, () => toast(({ strike: '💥 Luftschläge freigegeben', garrison: '🪖 Verstärkung kann angefordert werden', truck: '🚛 Trucks freigegeben' })[tool] || 'Neues Werkzeug verfügbar'));
    // Brücke halten: kein Zombie darf das Westufer erreichen
    if (m.hold && !S.breach && (S.hstep = (S.hstep || 0) + 1) % 20 === 0) { for (const z of E) if (z.k === K_ZOM && !z.dead && m.hold(z)) { S.breach = true; alertAt(z.x, z.y, 'Brücke durchbrochen!'); break; } }
  }

  // ── Ziele & Punkte ─────────────────────────────────────────────────────
  function lastSpawnT(m) { return Math.max(...m.spawns().map(w => w.t)); }
  function rescued(c) { return S.ev.civ; }
  function evalObj(m, c) {
    const cleared = c.zom === 0 && c.inf === 0 && simT >= lastSpawnT(m) + 5;
    const R = rescued(c) + (cleared ? c.civ : 0);
    const o = { R, cleared, primary: R >= m.primary.civ, priFrac: Math.min(1, R / m.primary.civ) };
    if (m.secondary.bridge != null) { o.bridge = !S.breach; o.killFrac = S.spawned ? Math.min(1, S.kills / S.spawned) : 0; o.secondary = o.bridge && cleared; }
    else if (m.secondary.kills != null) { o.kills = S.kills; o.secondary = S.kills >= m.secondary.kills; }
    else if (m.secondary.noLoss) { o.ulost = S.ulost || 0; o.secondary = o.ulost === 0; }
    else if (m.secondary.units != null) { const start = S.unitsStart || 1; const alive = E.filter(u => friendly(u) && u.k !== K_TRK && u.k !== K_TUR).length + (S.evU ? S.evU.length : 0); o.unitFrac = alive / start; o.secondary = o.unitFrac >= m.secondary.units; }
    return o;
  }
  function checkEnd(m, c) {
    if (simT < 5) return;
    if (!S.unitsStart) S.unitsStart = E.filter(u => friendly(u) && u.k !== K_TRK && u.k !== K_TUR).length;
    if (c.civ + c.pol + c.mil + c.trk === 0) return endGame('Mission beendet – keine Überlebenden auf der Karte.');
    if (c.zom === 0 && c.inf === 0 && simT >= lastSpawnT(m) + 5) return endGame('Sieg – alle Zombies ausgeschaltet!');
  }
  function hud(m, c) {
    const box = document.getElementById('objs'); if (phase !== 'run' || !S || !S.fired) { box.style.display = 'none'; return; }
    box.style.display = '';
    const o = evalObj(m, c), pri = m.primary.civ;
    const evs = []; const up = (name, t) => { if (simT < t) evs.push(`${name} in ${fmtClock(t - simT)}`); };
    const ev = m.evac(); up('📡 Evakuierungssignal', ev.at); up('💥 Luftschläge', m.tools.strike.at); if (m.tools.garrison) up('🪖 Verstärkung', m.tools.garrison.at); up('⚠ Horde stürmt', m.hordeAt);
    let sec = '';
    if (m.secondary.bridge != null) sec = `<div class="${S.breach ? 'no' : o.secondary ? 'ok' : ''}">${S.breach ? '✗ Brücke durchbrochen' : o.secondary ? '✓ Brücke gehalten' : '○ Brücke hält bisher'}</div><div class="${o.cleared ? 'ok' : ''}">${o.cleared ? '✓' : '○'} Zombies übrig: <b>${c.zom}</b>${simT < lastSpawnT(m) + 5 ? ' <span class="ev">(weitere Wellen folgen)</span>' : ''}</div>`;
    else if (m.secondary.noLoss) sec = `<div class="${o.ulost ? 'no' : 'ok'}">${o.ulost ? '✗' : '✓'} Verlorene Einsatzkräfte: <b>${o.ulost}</b></div>`;
    else if (m.secondary.kills != null) sec = `<div class="${o.secondary ? 'ok' : ''}">Zombies eliminiert: <b>${S.kills}</b> / ${m.secondary.kills}</div>`;
    else sec = `<div>Einsatzkräfte: <b>${Math.round((S.unitsStart ? E.filter(u => friendly(u) && u.k !== K_TRK && u.k !== K_TUR).length + S.evU.length : 1) / (S.unitsStart || 1) * 100)} %</b> (Ziel ≥ ${m.secondary.units * 100} %)</div>`;
    const html = `<h3>${m.name}</h3><div class="ev">Zeit ${fmtClock(simT)}</div>
      <div class="o"><b>Primär:</b> Gerettet <b class="${o.primary ? 'ok' : ''}">${o.R}</b> / ${pri}<div class="bar"><i style="width:${o.priFrac * 100}%"></i></div></div>
      <div class="o"><b class="${o.secondary ? 'ok' : ''}">${o.secondary ? '✓ ' : ''}Sekundär:</b>${sec}</div>
      ${evs.length ? '<div class="ev">' + evs.join('<br>') + '</div>' : ''}`;
    if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
    document.getElementById('bEnd').style.display = simT > 30 ? '' : 'none';
  }

  function finish(m, msg) {
    const c = counts(), o = evalObj(m, c), cleared = o.cleared;
    // Überlebende (auf der Karte oder evakuiert) gehen ins Roster
    const surv = [...(S.evU || [])];
    for (const u of E) if (friendly(u) && (u.k === K_POL || u.k === K_SOL || u.k === K_SEN)) surv.push({ k: u.k === K_POL ? 'pol' : 'sol', kills: u.kills, sq: u.sq });
    const grp = new Map(); for (const s of surv) { if (!grp.has(s.sq)) grp.set(s.sq, { k: s.k, m: [] }); grp.get(s.sq).m.push(s.kills); }
    const ev = S.ev, people = ev.civ + ev.pol * 5 + ev.mil * 10 + (cleared ? c.civ + c.pol * 5 + c.mil * 10 : 0);
    const priPts = Math.round(m.primary.pts * o.priFrac);
    let secPts = 0, secTxt = '';
    if (m.secondary.bridge != null) { secPts = (o.bridge ? m.secondary.bridge : 0) + Math.round(m.secondary.clear * (cleared ? 1 : o.killFrac)); secTxt = `${o.bridge ? '✓' : '✗'} Brücke gehalten · ${cleared ? '✓' : '✗'} alle Zombies getötet`; }
    else if (m.secondary.noLoss) { secPts = o.secondary ? m.secondary.pts : Math.round(m.secondary.pts * Math.max(0, 1 - o.ulost / Math.max(1, S.unitsStart || 1)) * .5); secTxt = o.secondary ? '✓ Keine Einsatzkraft verloren' : `✗ ${o.ulost} Einsatzkräfte verloren`; }
    else if (m.secondary.kills != null) { secPts = Math.round(m.secondary.pts * Math.min(1, S.kills / m.secondary.kills)); secTxt = `${S.kills} / ${m.secondary.kills} Zombies eliminiert`; }
    else { secPts = o.secondary ? m.secondary.pts : Math.round(m.secondary.pts * Math.max(0, o.unitFrac - .2) / (m.secondary.units - .2) * .5); secTxt = `${Math.round(o.unitFrac * 100)} % der Einsatzkräfte überlebt (Ziel ${m.secondary.units * 100} %)`; }
    const total = people + priPts + secPts;
    const stars = 1 + (o.primary ? 1 : 0) + (o.secondary ? 1 : 0); const starN = o.primary ? stars : 0;
    const res = { total, people, priPts, secPts, R: o.R, primary: o.primary, secondary: o.secondary, stars: starN, squads: [...grp.values()] };
    const idx = MIS.indexOf(m);
    const old = C.best[m.id] || 0; if (total > old) C.best[m.id] = total;
    const keep = () => {
      C.points += total;
      let squads = res.squads.filter(s => s.m.length);
      if (!squads.some(s => s.k === 'sol')) squads.push({ k: 'sol', m: [0, 0, 0, 0] });   // Reserve, damit die Kampagne nie ohne Truppen dasteht
      if (!squads.some(s => s.k === 'pol')) squads.push({ k: 'pol', m: [0, 0] });
      C.roster = { squads }; if (o.primary || idx + 1 > C.next - 1) C.next = Math.max(C.next, idx + 1);
      persist();
    };
    const html = `<h2>${o.primary ? (o.secondary ? 'Mission erfüllt' : 'Primärziel erreicht') : 'Mission gescheitert'}</h2><p class="stars">${'★'.repeat(starN)}${'☆'.repeat(3 - starN)}</p><p>${msg}</p>
      <table>
      <tr><td>Primär: ${o.R} von ${m.primary.civ} Zivilisten gerettet (${Math.round(o.priFrac * 100)} %)</td><td>+${priPts}</td></tr>
      <tr><td>Sekundär: ${secTxt}</td><td>+${secPts}</td></tr>
      <tr><td>Gerettete/überlebende Personen (1 / 5 / 10 Punkte)</td><td>+${people}</td></tr>
      <tr><td><b>Summe</b></td><td><b>${total}</b></td></tr>
      <tr><td>Überlebende Einsatzkräfte übernommen</td><td>${res.squads.reduce((a, s) => a + s.m.length, 0)}</td></tr></table>
      <div class="btns"><button class="big" id="cNext">Weiter</button>${o.primary ? '' : '<button id="cRetry">Mission wiederholen</button>'}</div>`;
    modal(html, () => {
      document.getElementById('cNext').onclick = () => { keep(); closeModal(); Comic.play(o.primary ? m.id + '_win' : m.id + '_lose', () => hub()); };
      const r = document.getElementById('cRetry'); if (r) r.onclick = () => { closeModal(); start(idx, true); };
    });
  }

  // ── Start ──────────────────────────────────────────────────────────────
  function start(idx, retry) {
    const m = MIS[idx]; cur = m; curIdx = idx;
    if (!retry || !C.pre) C.pre = JSON.stringify({ roster: C.roster, points: C.points });
    else { const p = JSON.parse(C.pre); C.roster = p.roster; }
    persist();
    document.body.classList.remove('inhub'); $('menu').style.display = 'none'; $('setup').style.display = 'none';
    RULES = rulesFor(m.id, C.up);
    setupMap(m.map);
    Object.assign(cfg, { pop: m.pop, armed: m.armed, acc: m.acc, zs: m.zs, inf0: 0, police: 0, mil: 0, origin: 'edge', infT: 20 });
    markers = [];
    newSim(); startRun(true); fitCam(); setSpeed(1);
    toast('Mission: ' + m.name);
  }
  function briefing(idx) {
    const m = MIS[idx];
    modal(`<h2>Mission ${idx + 1}: ${m.name}</h2><p style="color:var(--mut)">${m.sub}</p>
      <h3 style="margin:10px 0 4px">Ziele</h3><p><b>Primär:</b> ${m.goal[0]}<br><b>Sekundär:</b> ${m.goal[1]}</p>
      <h3 style="margin:10px 0 4px">Rahmenbedingungen</h3><ul style="margin:0;padding-left:18px">${m.info.map(t => '<li>' + t + '</li>').join('')}</ul>
      <p class="hint" style="margin-top:10px">Einheiten: ${C.roster.squads.map(s => (s.k === 'sol' ? 'Soldaten' : 'Polizei') + '-Squad (' + s.m.length + ')').join(', ')} · Munition begrenzt · Erfahrung: alle 50 Abschüsse +1 Level (+5 % Treffsicherheit)</p>
      <div class="btns"><button class="big" id="cGo">▶ Mission starten</button><button id="cShop">🛒 Shop</button><button id="cBack">Zurück</button></div>`, () => {
      $('cGo').onclick = () => { closeModal(); start(idx); };
      $('cShop').onclick = () => shop(() => briefing(idx));
      $('cBack').onclick = () => hub();
    });
  }
  function hub() {
    document.body.classList.add('inhub');
    Music.play('menu');
    const rows = MIS.map((m, i) => {
      const ok = i <= C.next, b = C.best[m.id];
      return `<div class="card ${ok ? '' : 'dis'}"><div><b>${i + 1}. ${m.name}</b><small>${m.sub}${b ? ' · Bestwert ' + b : ''}</small></div><button data-i="${i}" ${ok ? '' : 'disabled'}>${b ? 'Erneut spielen' : 'Briefing'}</button></div>`;
    }).join('');
    const ro = C.roster.squads.map(s => { const lv = s.m.map(lvOf); return `<div class="card"><div><b>${s.k === 'sol' ? 'Soldaten' : 'Polizei'}-Squad</b><small>${s.m.length} Mitglieder · Level ${lv.join('/')} · Abschüsse ${s.m.reduce((a, b) => a + b, 0)}</small></div></div>`; }).join('');
    modal(`<h2>Kampagne</h2><p>Punkte: <b>${C.points}</b></p>${rows}<h3 style="margin:12px 0 4px">Einheiten</h3><div class="cgrid">${ro}</div>
      <div class="btns"><button id="cShop">🛒 Shop</button><button id="cNew">Neue Kampagne</button><button id="cMenu">Hauptmenü</button></div>`, () => {
      document.querySelectorAll('#mbox button[data-i]').forEach(b => b.onclick = () => { const i = +b.dataset.i; closeModal(); const go = () => briefing(i); if (!C.seen['intro' + i]) { C.seen['intro' + i] = 1; persist(); Comic.play(i === 0 ? 'prologue' : MIS[i].id + '_intro', go); } else go(); });
      $('cShop').onclick = () => shop(hub);
      $('cNew').onclick = () => { if (confirm('Die Kampagne wirklich neu beginnen? Fortschritt und Upgrades gehen verloren.')) { C = fresh(); persist(); hub(); } };
      $('cMenu').onclick = () => { closeModal(); document.body.classList.remove('inhub'); toMenu(); };
    });
  }
  function shop(back) {
    const up = UP.map(u => {
      const lv = upLv(u.id), max = u.p.length, price = u.p[lv];
      return `<div class="card"><div><b>${u.n}${max > 1 ? ' (Stufe ' + lv + '/' + max + ')' : ''}</b><small>${u.d}</small></div>${lv >= max ? '<span class="ok" style="color:var(--acc)">✓ gekauft</span>' : `<button data-up="${u.id}" ${C.points >= price ? '' : 'disabled'}>${price} P</button>`}</div>`;
    }).join('');
    const bu = BUY.map(u => {
      const have = u.id === 'truck' ? C.trucks : 0, ex = u.max && have >= u.max;
      return `<div class="card"><div><b>${u.n}${u.id === 'truck' ? ' (' + have + '/' + u.max + ')' : ''}</b><small>${u.d}</small></div>${ex ? '<span style="color:var(--acc)">✓ max.</span>' : `<button data-buy="${u.id}" ${C.points >= u.p ? '' : 'disabled'}>${u.p} P</button>`}</div>`;
    }).join('');
    modal(`<h2>Shop</h2><p>Verfügbare Punkte: <b>${C.points}</b></p><h3 style="margin:8px 0 2px">Neue Einheiten</h3>${bu}<h3 style="margin:10px 0 2px">Upgrades</h3>${up}<div class="btns"><button class="big" id="sBack">Zurück</button></div>`, () => {
      document.querySelectorAll('#mbox button[data-up]').forEach(b => b.onclick = () => { const u = UP.find(x => x.id === b.dataset.up), lv = upLv(u.id), p = u.p[lv]; if (C.points >= p) { C.points -= p; C.up[u.id] = lv + 1; persist(); shop(back); } });
      document.querySelectorAll('#mbox button[data-buy]').forEach(b => b.onclick = () => {
        const u = BUY.find(x => x.id === b.dataset.buy); if (C.points < u.p) return;
        C.points -= u.p;
        if (u.id === 'pol') C.roster.squads.push({ k: 'pol', m: [0, 0] }); else if (u.id === 'sol') C.roster.squads.push({ k: 'sol', m: [0, 0, 0, 0] }); else C.trucks++;
        persist(); shop(back);
      });
      $('sBack').onclick = () => back();
    });
  }
  function init() {
    const has = !!C;
    $('mCamp').textContent = has ? '🎖 Kampagne fortsetzen' : '🎖 Kampagne starten';
    $('mCamp').onclick = () => { if (!C) { C = fresh(); persist(); } $('menu').style.display = 'none'; hub(); };
    $('bEnd').onclick = () => modal(`<h2>Mission beenden?</h2><p>Die Mission wird jetzt gewertet. Überlebende Einsatzkräfte werden übernommen.</p><div class="btns"><button class="big" id="eYes">Mission beenden</button><button id="eNo">Weiterspielen</button></div>`, () => { $('eYes').onclick = () => { closeModal(); endGame('Rückzug – Mission vorzeitig beendet.'); }; $('eNo').onclick = closeModal; });
  }
  return { init, rulesFor, MIS, get state() { return C; }, hub, start, UP };
})();
