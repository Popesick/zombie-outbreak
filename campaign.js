'use strict';
/* Kampagnenmodus: Missionen, Ziele, Punkte, Roster/Erfahrung, Shop. Nutzt die Globals aus game.js zur Laufzeit. */
const Campaign = (() => {
  const SAVE = 'zos_campaign';
  const UP = [   // Upgrades: id, Name, Beschreibung, Preise je Stufe
    { id: 'sil', n: 'Schalldämpfer', d: 'Soldaten können Schalldämpfer tragen: Lärm −50 %.', p: [300] },
    { id: 'squad', n: 'Squadgröße', d: 'Jeder Soldaten-Squad bekommt einen weiteren Soldaten (5 pro Squad).', p: [500] },
    { id: 'snipe', n: 'Sniper', d: 'Soldaten können Snipergewehre führen: Reichweite +200 %, Feuerrate −50 %, Lärm +20 %, wirft Zombies einen Schritt zurück.', p: [400] },
    { id: 'mp', n: 'MPs für Polizei', d: 'Polizisten können MPs führen: etwas mehr Reichweite, schnellere Schussfolge, keine Mann-Stop-Wirkung.', p: [200] },
    { id: 'sg', n: 'Schrotflinten für Polizei', d: 'Polizisten können Schrotflinten führen: Reichweite wie Pistole, Treffsicherheit +10 %, wirft Zombies zwei Schritte zurück.', p: [300] },
    { id: 'siren', n: 'Weitere Sirenen', d: '+1 Sirene pro Stufe (insgesamt bis zu 4 pro Mission). Sirenen sind erst nach 15 Minuten verfügbar, danach alle 5 Minuten eine.', p: [200, 300, 500] },
    { id: 'third', n: 'Dritter Mann', d: 'Jeder Polizei-Squad bekommt einen dritten Polizisten (GSG-9-Einheiten bleiben unverändert).', p: [300] },
    { id: 'barhp', n: 'Barrikaden verbessern', d: 'Barrikaden halten doppelt so lange (insgesamt 4× Classic).', p: [300] },
    { id: 'scan', n: 'Infektionsscanner', d: 'Soldaten erkennen infizierte Zivilisten und schalten sie aus. Tore sperren Infizierte aus.', p: [600] },
    { id: 'gate', n: 'Tore', d: 'Pro 12 Barrikadenelemente ein Tor: Menschen passieren, Zombies nicht.', p: [250] },
    { id: 'morebar', n: 'Mehr Barrikaden', d: '+12 Barrikadenelemente pro Stufe.', p: [150, 200, 250] },
    { id: 'turret', n: 'Automatikgeschütze', d: 'Zwei feste MG-Geschütze pro Mission, per Hubschrauber (30 s Verzögerung). Zerstörung erst durch 10 Zombies.', p: [600] },
    { id: 'ammo', n: 'Mehr Munition', d: 'Munitionsvorrat +100 %.', p: [350] },
    { id: 'moresupply', n: 'Mehr Versorgungspakete', d: '+5 Versorgungspakete pro Stufe.', p: [200, 300] },
    { id: 'supqty', n: 'Versorgungsupgrade', d: 'Die Menge der Versorgungsgüter pro Paket verdoppelt sich (Munition und Waffen für Zivilisten).', p: [500] },
    { id: 'flare', n: 'Signalbomben', d: '5 Signalbomben: 20 s lauter Lockton, danach Explosion (60 % Radius eines Luftschlags).', p: [250] },
    { id: 'mines', n: 'Minenteppiche', d: 'Ein Hubschrauber legt einen Minenteppich (Radius 25 m, 36 Minen). Jede Figur löst aus, Explosion nach 1 s. Je Stufe 3 Teppiche pro Mission.', p: [250, 300, 350] },
    { id: 'gunship', n: 'Gunship', d: 'Ein Hubschrauber schwebt 30 s über dem Ziel und beschießt es mit der Gatling (2 Einsätze pro Mission).', p: [700] }
  ];
  const BUY = [
    { id: 'pol', n: 'Polizei-Squad', d: '+2 Polizisten (Level 1).', p: 150 },
    { id: 'sol', n: 'Soldaten-Squad', d: '+4 Soldaten (Level 1).', p: 400 },
    { id: 'gsg', n: 'GSG-9-Einheit', d: 'Elite-Squad: Sniper (150 Schuss) + zwei Begleiter mit Sturmgewehr (150 Schuss), alle mit Pistole (40 Schuss). 10 % schneller, +5 % Treffsicherheit. Wächst nicht mit „Dritter Mann“.', p: 300 },
    { id: 'garr', n: 'Garnison', d: 'Eine zusätzliche Garnison pro Mission, jederzeit per Hubschrauber absetzbar – schon ab Levelstart (zählt zusätzlich zu den Garnisonen der Mission).', p: 450, max: 3 },
    { id: 'truck', n: 'MG-Truck', d: 'Ein weiterer Truck pro Mission (am Kartenrand anforderbar).', p: 350, max: 2 }
  ];

  // ── Missionen ──────────────────────────────────────────────────────────
  // Positionen für Mission 1 stammen aus dem Lageplan (Pixel des Kartenausschnitts → Weltkoordinaten)
  // Pixel des Lageplans (Screenshot) → Weltkoordinaten von Karte m1 (Referenz: Brücke und Teich, ca. 1 m pro Pixel)
  const m1px = (px, py) => ({ x: 214 + (px - 225), y: 520 + (py - 540) });
  // Isar-Mittellinie auf Karte m1: ein Zombie westlich davon hat die Brücke überquert
  const ISAR = [[0, 570], [200, 413], [400, 340], [520, 249], [700, 238], [1045, 296]];   // [y, x]
  const isarX = y => { for (let i = 1; i < ISAR.length; i++) if (y <= ISAR[i][0]) { const [y0, x0] = ISAR[i - 1], [y1, x1] = ISAR[i]; return x0 + (x1 - x0) * (y - y0) / (y1 - y0); } return ISAR[ISAR.length - 1][1]; };
  // Pfaffenhofen: Verlauf der Ilm (rote Linie im Lageplan), [x, y]; Zombies liegen westlich, Zivilisten östlich
  const ILM = [[1302, 0], [1302, 64], [1299, 292], [1291, 512], [1285, 698], [1277, 833], [1264, 968], [1240, 1120], [1184, 1188], [1074, 1213], [990, 1255], [960, 1305], [931, 1475], [939, 1644], [990, 1762], [1057, 1864], [1070, 1890]];
  const ilmSeg = y => { for (let i = 1; i < ILM.length; i++) if (y <= ILM[i][1]) return i; return ILM.length - 1; };
  const ilmX = y => { const i = ilmSeg(y), [a, b] = ILM[i - 1], [c, d] = ILM[i]; return a + (c - a) * Math.min(1, Math.max(0, (y - b) / (d - b))); };
  const ilmTan = y => { const i = ilmSeg(y), [a, b] = ILM[i - 1], [c, d] = ILM[i], l = Math.hypot(c - a, d - b); return [(c - a) / l, (d - b) / l]; };
  // Übergänge über die Ilm; gate: mit Tor und zwei Geschützen (north = Zielpfad der Evakuierung), sonst massive Sperre
  const PF_SEALS = [{ x: 1294, y: 426 }, { x: 1290, y: 450 }, { x: 1290, y: 502 }, { x: 1274, y: 826 }, { x: 1026, y: 1234 }, { x: 1282, y: 702, gate: true, north: true }, { x: 1282, y: 722 }, { x: 1278, y: 750 }, { x: 1278, y: 790 }, { x: 1266, y: 942 }, { x: 1086, y: 1210, gate: true }, { x: 986, y: 1258 }, { x: 962, y: 1298 }, { x: 954, y: 1318 }, { x: 1050, y: 1858 }];
  const PF_MARCH = { id: 'pfN', route: 0, routes: [[]], gather: { x: 559, y: 318, r: 60 }, noWait: true, dur: 1800 };
  const PF_WAVES = [{ t: 0, n: 2000, x: 559, y: 318, r: 420 },
    { t: 0, n: 1000, x: 365, y: 563, r: 200, march: PF_MARCH }, { t: 0, n: 1000, x: 804, y: 841, r: 160, march: PF_MARCH }, { t: 0, n: 1000, x: 390, y: 1355, r: 220, march: PF_MARCH }];
  // Südwelle nach 10:00: 2000 Zombies in 20 Schüben à 100 alle 6 s, vom Süden bis in den Südwesten verteilt, Marsch direkt zum nördlichen Tor
  const PF_SOUTH_SPOTS = [[1000, 1850], [820, 1850], [640, 1840], [460, 1790], [300, 1710], [160, 1620]];
  const PF_SOUTH = k => { const [x, y] = PF_SOUTH_SPOTS[k % PF_SOUTH_SPOTS.length]; return { t: 0, n: 100, x, y, r: 90, msg: k === 0 ? '⚠ 2000 Zombies strömen aus dem Süden und Südwesten auf das nördliche Tor zu!' : null, march: { id: 'pfS', route: 0, routes: [[]], gather: { x: 1255, y: 702, r: 30 }, total: 2000, focus: .8, dur: 3600 } }; };
  const PF_NORTH2 = { t: 0, n: 2000, x: 600, y: 50, r: 320, fast: true, msg: '⚠ Der Norden ist geräumt – 2000 weitere Zombies strömen aus dem Norden!', march: { ...PF_MARCH, id: 'pfN2' } };
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
      id: 'm2', map: 'moosburg', name: 'Moosburg brennt', sub: 'Die ganze Stadt', pop: 3500, armed: 6, acc: 35, zs: 50,
      start: () => ({ sol: [{ x: 1260, y: 1540 }], pol: [{ x: 1180, y: 1480 }, { x: 1320, y: 1430 }] }),
      evac: () => ({ x: 1520, y: 1612, at: 60 }),
      evacCap: 60, evacEvery: 20,   // große Zahl Zivilisten: größere und häufigere Hubschrauber
      spawns: () => [{ t: 0, n: 400, x: 80, y: 80, r: 45 }, { t: 120, n: 200, x: 30, y: 950, r: 45 }, { t: 300, n: 200, x: 60, y: 1750, r: 45 },
        // 200 weitere aus dem Nordost-Wald: wandern langsam auf drei Routen zum Sammelpunkt „H“ (Waldrand), warten dort und stürmen dann mit den übrigen
        ...[0, 1, 2].map(k => ({ t: 0, n: k === 2 ? 66 : 67, x: [1490, 1625, 1770][k], y: 70, r: 40, march: { id: 'ne', route: k, routes: NE_ROUTES, gather: { x: 1700, y: 830, r: 45 } } }))],
      lure: () => ({ x: 90, y: 1400, t: 0, dur: 120 }),   // die erste Welle marschiert 2 Minuten lang geradlinig nach Süden
      hordeAt: 0, hordeFocus: .6, hordeQuiet: true,       // danach (und für alle späteren Wellen): 60 % Zug zum Evakuierungspunkt
      civNorth: { frac: .7, ymax: 650 },
      supplyBonus: { at: 600, n: 3, msg: 'Das Hauptquartier meldet, dass es noch weitere Versorgungspakete bereitstellen konnte. Haltet weiter die Stellung!' },
      hold: null,
      station: { poly: [[462, 1052], [486, 1063], [493, 1066], [485, 1090], [475, 1112], [460, 1107], [442, 1099], [447, 1090]], gate: { x: 458, y: 1106 }, units: ['pol', 'pol', 'gsg'], homes: [[472, 1092], [458, 1098], [482, 1080]], r: 30 },   // Polizeiinspektion Moosburg
      tools: { supply: { at: 0, max: 5, cd: 20 }, strike: { at: 180, max: 4, cd: 8 }, garrison: { at: 240, max: 2, cd: 30 } },
      barricades: 36,
      primary: { civ: 2000, pts: 1500 }, secondary: { noLoss: true, pts: 600 },
      goal: ['Rette mindestens 2000 Zivilisten (Rettungszone auf der Ostseite der Isarbrücke).', 'Alle Einsatzkräfte müssen überleben.'],
      info: ['3500 Zivilisten (die meisten im Norden) – 400 Zombies aus Nordwesten, die 2:00 lang nach Süden marschieren, dazu 200 aus dem Nordost-Wald, die sich langsam am Waldrand sammeln und dann zum Evakuierungspunkt stürmen', 'Nach 2:00: 200 Zombies aus Westen, nach 5:00: 200 aus Südwesten', '5 Versorgungspakete (nach 10:00 drei weitere), 36 Barrikadenelemente', 'Evakuierungssignal nach 1:00 – größere Hubschrauber (60 Personen alle 20 s)', 'Die Polizeiinspektion (Poststraße) ist eingezäunt (Barrikaden und Tor, zählen nicht zu deinen): darin zwei Polizei- und ein GSG-9-Squad mit Standardmunition – sie gehorchen dir, sobald eine deiner Einheiten in ihre Nähe kommt (Versorgungspaket füllt sie auf Upgrade-Niveau auf)', 'Ab 3:00: vier Luftschläge · ab 4:00: bis zu zwei weitere Soldaten-Squads', 'Zombies ziehen mit 60 % Wahrscheinlichkeit zum Evakuierungspunkt']
    },
    {
      id: 'ap', map: 'm4', kind: 'air', name: 'Befreiung des Flughafens', sub: 'Flughafen München – Zentralbereich', pop: 1000, armed: 0, acc: 35, zs: 50,
      start: () => ({ sol: [{ x: 2845, y: 1050 }], pol: [{ x: 2815, y: 1080 }, { x: 2875, y: 1080 }] }),
      evac: () => ({ x: 2290, y: 1755, at: 600 }), noHeli: true, evacMsg: '📡 Die Zivilisten sammeln sich im Abholbereich H',   // nach 10:00 laufen die Zivilisten zu H (keine Hubschrauber)
      civZone: { x0: 1610, y0: 900, x1: 2340, y1: 2225 }, civNoGate: true,
      ring: { x0: 1583, y0: 871, x1: 2362, y1: 2251, thick: 2, gates: [{ x: 2362, y: 1338 }, { x: 2362, y: 1755 }, { x: 2362, y: 1968 }] },
      turrets: [{ x: 1604, y: 1100 }, { x: 1604, y: 1450 }, { x: 1604, y: 1800 }, { x: 1604, y: 2130 }, { x: 1950, y: 892 }, { x: 1950, y: 2230 }, { x: 1604, y: 890 }, { x: 1604, y: 1300 }, { x: 1604, y: 1578 }, { x: 1604, y: 1702 }, { x: 1604, y: 2161 }],
      spawns: () => AIR_WAVES,
      lure: () => ({ x: 0, y: 0, t: 1e9, dur: 0 }),
      hordeAt: 1e9, hordeFocus: 0, hordeQuiet: true,
      hold: null,
      tools: { supply: { at: 0, max: 5, cd: 20 }, strike: { at: 150, max: 3, cd: 8 }, garrison: { at: 240, max: 2, cd: 30 } },
      barricades: 16,
      primary: { civ: 750, pts: 2000, hold: 1200 }, secondary: { clear: true, pts: 800 },
      reward: { strike: 4, gunship: 1 },
      goal: ['Von den 1000 Zivilisten im Flughafen müssen mindestens 750 20 Minuten überleben.', 'Töte alle Zombies.'],
      info: ['1000 unbewaffnete Zivilisten im Innenbereich (750 müssen überleben) – umgeben von einer Hochsicherheits-Barrikade (drei Tore im Osten, zählt nicht zu deinen Barrikaden)', 'Elf eingegrabene, autarke Geschütztürme am Mauerrand (nicht steuerbar, unbegrenzte Munition)', '200 Zombies stehen westlich der Barrikade, wenn ihr eintrefft', 'Nach 5:00: 800 Zombies aus drei Richtungen (NW, W, SW), nach 8:00 erneut; nach 10:00 sammeln sich die Zivilisten im Abholbereich H', 'Nach 11:00 stürmen 500 Zombies aus Nordwesten, nach 12:00 400 aus Westen, nach 13:00 500 aus Südwesten','5 Versorgungspakete, 16 eigene Barrikadenelemente', 'Belohnung: 4 weitere Luftschläge und 1 Gunship (ab der nächsten Mission)']
    },
    {
      id: 'm3', map: 'm3', kind: 'land', name: 'Die Brücke von Pfaffenhofen', sub: 'Pfaffenhofen an der Ilm', pop: 2500, armed: 6, acc: 35, zs: 50,
      start: () => ({ sol: [{ x: 1790, y: 670 }], pol: [{ x: 1775, y: 650 }, { x: 1775, y: 695 }] }),
      evac: () => ({ x: 640, y: 118, at: 1e9 }),   // Landeplatz „H“; das Signal gibt der Spieler selbst
      spawns: () => PF_WAVES,
      lure: () => ({ x: 0, y: 0, t: 1e9, dur: 0 }),
      hordeAt: 1e9, hordeFocus: 0, hordeQuiet: true,
      evacCap: 60, evacEvery: 20,
      civZone: { discs: [{ x: 1612, y: 414, r: 110 }, { x: 1549, y: 926, r: 130 }, { x: 1421, y: 1374, r: 130 }] },
      civLine: (x, y) => x >= ilmX(y),
      seals: PF_SEALS, guards: 8,
      hold: null,
      tools: { supply: { at: 0, max: 5, cd: 20 }, strike: { at: 150, max: 5, cd: 8 }, garrison: { at: 200, max: 2, cd: 30 }, truck: { at: 0, max: 2, cd: 4 } },
      barricades: 48,
      primary: { pts: 1500, land: 900 }, secondary: { rescue: 2000, pts: 1000 },
      goal: ['Sichere den Landeplatz „H“ im Nordwesten innerhalb von 15 Minuten und starte dann die Evakuierung.', 'Rette mindestens 2000 Zivilisten.'],
      info: ['5000 Zombies westlich der Ilm, die Masse (2000+) im Norden; 2500 Zivilisten östlich der Ilm', 'Die Brücken sind auf der Zivilistenseite mit Barrikaden, Toren und je zwei Automatikgeschützen (unbegrenzte Munition) gesichert – gehören nicht zu deinem Inventar', 'Bewaffnete Zivilisten halten die Tore und fliehen erst, wenn Zombies durchbrechen', 'Landeplatz gesichert = 10 s lang kein Zombie im Umkreis von 80 m', 'Danach: Schaltfläche „Evakuierung starten“ – alle Zivilisten strömen durch das nördlichste Tor zum Landeplatz', 'Wird der Norden binnen 5 Minuten geräumt (1500 Zombies getötet), folgen 2000 weitere Zombies aus dem Norden', 'Nach 10:00 folgen 2000 Zombies aus Süden und Südwesten (verteilt über zwei Minuten), die direkt zum nördlichen Tor laufen', '5 Versorgungspakete, 48 Barrikadenelemente, Luftschläge ab 2:30, Garnisonen ab 3:20']
    },
    {
      id: 'm5', map: 'm5', kind: 'trek', name: 'Der Weg nach Kelheim', sub: 'Abensberg – Weltenburg', pop: 0, armed: 0, acc: 35, zs: 50,
      start: () => ({ sol: [{ x: 858, y: 3586 }], pol: [{ x: 835, y: 3560 }, { x: 882, y: 3612 }] }),
      evac: () => ({ x: 2508, y: 770, at: 1e9 }),   // Evakuierungsstelle im Norden
      spawns: () => [],
      lure: () => ({ x: 0, y: 0, t: 1e9, dur: 0 }),
      hordeAt: 1e9, hordeFocus: 0, hordeQuiet: true,
      hold: null,
      // Linien L1–L3 (Weltkoordinaten, y): wer sie als Erster überschreitet, löst die nächste Welle aus; Späher-Zone im Wald; Ostzüge starten in zwei Reihen am Ostrand
      trek: { lines: [2706, 2033, 1285], east: [2200, 2882], zone: { x: 3432, y: 946, r: 240 }, msgs: ['⚠ Wir sind entdeckt worden! Zombies aus Süden und Osten nähern sich.', '⚠ Die nächste Welle rollt heran – aus Süden und Osten!', '⚠ Die größte Welle kommt – aus Süden und Osten! Haltet durch, bis die Evakuierungsstelle gesichert ist.'] },
      tools: { supply: { at: 0, max: 6, cd: 20 }, strike: { at: 0, max: 5, cd: 8 }, garrison: { at: 240, max: 2, cd: 30 }, truck: { at: 0, max: 2, cd: 4 } },
      barricades: 36,
      primary: { pts: 2500 }, secondary: { clear: true, pts: 1000 },
      goal: ['Erreiche die Evakuierungsstelle bei Weltenburg im Norden, sichere sie (200 m im Umkreis zombiefrei) und halte sie 5 Minuten lang.', 'Töte alle Zombies.'],
      info: ['Die Karte ist zu Beginn frei von Zombies – Start im Süden bei Abensberg, Ziel im Norden an der Donau', 'Je weiter ihr vorrückt, desto mehr Untote werden auf euch aufmerksam', 'Der Weg ist lang: Trucks, Versorgung und Luftschläge stehen von Anfang an bereit', 'Die Karte ist zur besseren Spielbarkeit auf 35 % gestaucht']
    }
  ];

  // Flughafen: Zombie-Spawngebiete im Westen (Z1 NW, Z2 W, Z3 SW) und ihre Anmarschwege zur Sperre (Wegpunkte; Ziel liegt hinter der Barrikade)
  const AIR_Z = { z1: { x: 195, y: 740, r: 190, rt: [[900, 860], [1400, 930], [1900, 1100]], n: 'Nordwesten' }, z2: { x: 250, y: 1700, r: 250, rt: [], n: 'Westen' }, z3: { x: 340, y: 2420, r: 260, rt: [[1500, 2330], [1880, 2150]], n: 'Südwesten' }     };
  const airWave = (t, k, n, fast) => ({ t, n, fast, x: AIR_Z[k].x, y: AIR_Z[k].y, r: AIR_Z[k].r, msg: '⚠ ' + n + ' Zombies stürmen aus ' + AIR_Z[k].n, march: { id: 'ap' + t + k, route: 0, routes: [AIR_Z[k].rt], gather: { x: 2040, y: 1650, r: 40 }, noWait: true, dur: 1800 } });
  // Finaler Sturm: vier Bahnen vom Westen zur Westmauer
  const fan = (n, f) => [...Array(n).keys()].map(f);   // Auffächern: viele Bahnen mit verteilten Endpunkten an der Mauer
  const AIR_LANES = fan(12, k => { const ye = 1090 + k * 75; return [[600, 1650 + (ye - 1650) * .3], [1000, 1650 + (ye - 1650) * .85], [1560, ye]]; });
  const AIR_LANES_E = fan(6, k => { const ye = 1520 + k * 90; return [[2650, 1750 + (ye - 1750) * .5], [2420, ye]]; });
  const AIR_WAVES = [{ t: 0, n: 200, x: 1340, y: 1600, r: 150 },
    ...[300, 480].flatMap(t => [airWave(t, 'z1', 300), airWave(t, 'z2', 200), airWave(t, 'z3', 300)]),
    airWave(660, 'z1', 500), airWave(720, 'z2', 400), airWave(780, 'z3', 500), ...AIR_LANES.map((rt, k) => ({ t: 900, n: 250, x: 200, y: 1640, r: 230, fast: true, msg: k === 0 ? '⚠ Finaler Sturm: 3000 Zombies aus dem Westen!' : null, march: { id: 'apFinal', route: k, routes: AIR_LANES, gather: { x: 2040, y: 1650, r: 40 }, noWait: true, dur: 1800 } })),
    ...AIR_LANES_E.map((rt, k) => ({ t: 900, n: k < 2 ? 84 : 83, x: 2900, y: 1750, r: 150, fast: true, msg: k === 0 ? '⚠ 500 Zombies aus dem Osten laufen auf den Abholbereich zu!' : null, march: { id: 'apEast', route: k, routes: AIR_LANES_E, gather: { x: 2290, y: 1755, r: 30 }, noWait: true, dur: 1800 } }))];

  // ── Spielstand ─────────────────────────────────────────────────────────
  const initialRoster = () => ({ squads: [{ k: 'sol', m: [0, 0, 0, 0] }, { k: 'pol', m: [0, 0] }, { k: 'pol', m: [0, 0] }] });
  const fresh = () => ({ v: 1, next: 0, points: 0, up: {}, trucks: 0, garr: 0, diff: 'easy', done: {}, snap: {}, roster: initialRoster(), pre: null, best: {}, seen: {}, got: {}, bonus: { strike: 0, gunship: 0 } });
  let C = (() => { try { const d = JSON.parse(localStorage.getItem(SAVE)); if (d && d.v === 1) { if (!Number.isFinite(d.points)) d.points = 0; d.diff = d.diff || 'easy'; d.done = d.done || {}; d.snap = d.snap || {}; d.garr = d.garr || 0; return d; } } catch (e) {} return null; })();
  const persist = () => { try { localStorage.setItem(SAVE, JSON.stringify(C)); } catch (e) {} };
  let cur = null, curIdx = 0, playRoster = null, curReplay = false;
  const lvOf = kills => 1 + Math.floor(kills / 50);
  const upLv = id => (C && C.up[id]) || 0;

  // ── Regeln einer Mission ───────────────────────────────────────────────
  function rulesFor(missionId, up) {
    const m = MIS.find(x => x.id === missionId) || MIS[0];
    const u = up || (C ? C.up : {});
    const replay = !!(C && C.diff === 'hard' && C.done && C.done[m.id] && C.snap && C.snap[m.id]);
    const lv = id => u[id] || 0;
    const tools = { barricade: {}, demolish: {}, ...m.tools };
    if (lv('moresupply')) tools.supply = { ...tools.supply, max: tools.supply.max + 5 * lv('moresupply') };
    const trucks = C ? (replay ? C.snap[m.id].trucks : C.trucks) : 0;
    if (trucks && !tools.truck) tools.truck = { at: 0, max: trucks, cd: 4 };
    else if (tools.truck && C) tools.truck = { ...tools.truck, max: Math.max(tools.truck.max || 0, 0) + trucks };
    const garr = C ? C.garr || 0 : 0;
    if (garr) tools.garrison = { at: 0, cd: 30, ...tools.garrison, max: ((tools.garrison && tools.garrison.max) || 0) + garr, at: (tools.garrison && tools.garrison.at) || 0 };
    tools.siren = { at: 900, max: 1 + lv('siren'), cd: 300 };
    if (lv('gate')) tools.gate = {};
    if (lv('turret')) tools.turret = { at: 0, max: 2, cd: 10 };
    if (lv('flare')) tools.flare = { at: 0, max: 5, cd: 4 };
    if (lv('mines')) tools.mines = { at: 0, max: 3 * lv('mines'), cd: 20 };
    if (lv('gunship')) tools.gunship = { at: 0, max: 2, cd: 45 };
    const bo = (C && C.bonus) || {};   // Belohnungen aus früheren Missionen
    if (bo.strike && tools.strike) tools.strike = { ...tools.strike, max: tools.strike.max + bo.strike };
    if (bo.gunship) tools.gunship = { at: 0, cd: 45, ...tools.gunship, max: ((tools.gunship && tools.gunship.max) || 0) + bo.gunship };
    const R = {
      evacCap: m.evacCap, evacEvery: m.evacEvery, civNorth: m.civNorth, civZone: m.civZone ? { ...m.civZone } : null, civNoGate: !!m.civNoGate, civLine: m.civLine || null, noHeli: !!m.noHeli, rushAfter: lastSpawnT(m), mode: 'campaign', missionId: m.id, up: { ...u }, tools, ammo: true, xp: true, zmix: true, baseAcc: .35,
      barLimit: m.barricades + 12 * lv('morebar'), barHpMul: 2 * (lv('barhp') ? 2 : 1),
      gateOk: !!lv('gate'), scan: !!lv('scan'), canSil: !!lv('sil'), canSnipe: !!lv('snipe'), canMp: !!lv('mp'), canSg: !!lv('sg'), squadPlus: lv('squad') ? 1 : 0, polPlus: lv('third') ? 1 : 0, supMul: lv('supqty') ? 2 : 1, garr, ammoMul: lv('ammo') ? 2 : 1,
      spawn: () => spawnMission(m), tick: () => tick(m), hud: c => hud(m, c), checkEnd: c => checkEnd(m, c), onEnd: msg => finish(m, msg)
    };
    return R;
  }

  function unitFrom(kind, x, y, sq, kills, idx) {
    const k = kind === 'pol' ? K_POL : K_SOL, e = mk(k, x, y), lvl = lvOf(kills);
    e.armed = true; e.kills = kills; e.lvl = lvl; e.acc = .35 + .05 * (lvl - 1);
    e.ammoMax = (kind === 'pol' ? 40 : 150) * RULES.ammoMul; e.ammo = e.ammoMax; e.g = sq; e.sq = sq; e.hmx = x; e.hmy = y;
    if (kind === 'gsg') { e.gsg = idx === 0 ? 1 : 2; e.snipe = idx === 0; e.acc += .05; e.pisMax = e.pis = 40 * RULES.ammoMul; }   // Elite: Sniper + zwei Begleiter, Pistole als Reserve
    E.push(e); return e;
  }
  const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
  // Polizeiwache: Zaun (vorgebaute Barrikaden mit Tor, kein Spielerinventar) um ein Polygon; Einsatzkräfte darin gehören dem Spieler, sobald eine seiner Einheiten nahe genug kommt
  function buildStation(m) {
    const st = m.station, P = st.poly, cells = [], seen = new Set();
    const add = (cx, cy) => { const c = cy * GW + cx; if (cx >= 0 && cy >= 0 && cx < GW && cy < GH && !seen.has(c)) { seen.add(c); cells.push(c); } };
    let px = null, py = null;
    for (let i = 0; i < P.length; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[(i + 1) % P.length], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let k = 0; k <= n; k++) {
        const cx = (x0 + (x1 - x0) * k / n) / CELL | 0, cy = (y0 + (y1 - y0) * k / n) / CELL | 0;
        if (px != null && cx !== px && cy !== py) add(px, cy);   // Diagonalschritte zu einer lückenlosen 4er-Kette ergänzen
        add(cx, cy); px = cx; py = cy;
      }
    }
    addPre(cells, c => Math.hypot((c % GW + .5) * CELL - st.gate.x, ((c / GW | 0) + .5) * CELL - st.gate.y) < 5);
    const pos = [];
    for (const k of st.units) {
      const id = ++gidN, n = k === 'gsg' ? 3 : 2 + RULES.polPlus, home = st.homes[pos.length % st.homes.length]; pos.push(1);
      for (let i = 0; i < n; i++) {
        let q = null; for (let t = 0; t < 40 && !q; t++) { const r = randWalk(home[0], home[1], 10); if (r && inPoly(r[0], r[1], P)) q = r; }
        q = q || [home[0], home[1]];
        const e = unitFrom(k, q[0], q[1], id, 0, i); e.lock = true; e.ord = true;
        const mul = RULES.ammoMul; if (mul > 1) { e.ammoMax /= mul; e.ammo = e.ammoMax; e.upMul = mul; if (e.gsg) e.pisMax = e.pis = 40; }   // Standardvorrat; Versorgungspaket füllt auf Upgrade-Niveau
      }
    }
    S.station = true;
  }
  // Vorgebaute Sperre (höchste Ausbaustufe, nicht Teil des Barrikadenlimits): rechteckiger Ring aus Segmenten mit Toren
  function buildRing(r) {
    const cx0 = r.x0 / CELL | 0, cx1 = r.x1 / CELL | 0, cy0 = r.y0 / CELL | 0, cy1 = r.y1 / CELL | 0, th = r.thick || 1, per = [];
    for (let x = cx0; x <= cx1; x++) per.push([...Array(th).keys()].map(k => (cy0 + k) * GW + x));
    for (let y = cy0 + th; y <= cy1 - th; y++) per.push([...Array(th).keys()].map(k => y * GW + cx1 - k));
    for (let x = cx1; x >= cx0; x--) per.push([...Array(th).keys()].map(k => (cy1 - k) * GW + x));
    for (let y = cy1 - th; y >= cy0 + th; y--) per.push([...Array(th).keys()].map(k => y * GW + cx0 + k));
    const gcell = c => r.gates.some(g => Math.hypot((c % GW + .5) * CELL - g.x, ((c / GW | 0) + .5) * CELL - g.y) < 9);
    for (const c of per.flat()) {   // jede Zelle ist ein eigener Baustein: Schaden trifft nur den getroffenen Block, nicht den ganzen Abschnitt
      const cells = [c].filter(c => type[c] <= T_ROAD && !barId[c]); if (!cells.length) continue;
      const id = BAR.length, gs = cells.filter(gcell);
      for (const c of cells) barId[c] = id; for (const c of gs) gate[c] = 1;
      const hp = (60 + cells.length * 35) * 4, mc = cells[cells.length >> 1];
      BAR.push({ cells, hp, max: hp, x: (mc % GW + .5) * CELL, y: ((mc / GW | 0) + .5) * CELL, gates: gs, pre: 1 });
    }
    evacDirty = true;
  }
  // Vorgebaute Einzelblöcke (nicht Teil des Spielerinventars); gateFn markiert Tor-Zellen
  function addPre(cells, gateFn) {
    for (const c of cells) {
      if (barId[c] || type[c] > T_ROAD) continue;
      const id = BAR.length, g = !!(gateFn && gateFn(c)), hp = (60 + 35) * 4;
      barId[c] = id; if (g) gate[c] = 1;
      BAR.push({ cells: [c], hp, max: hp, x: (c % GW + .5) * CELL, y: ((c / GW | 0) + .5) * CELL, gates: g ? [c] : [], pre: 1 });
    }
    evacDirty = true;
  }
  // Sperre quer zur Brücke (parallel zum Fluss), drei Zellen dick, von Ufer zu Ufer; Tor in der Mitte, auf der Zivilistenseite Geschütze und Wachen
  function buildSeals(m) {
    S.seals = [];
    for (const sl of m.seals) {
      const t = ilmTan(sl.y), nx = t[1], ny = -t[0], set = new Set();
      for (const side of [-1, 1]) for (let d = 0; d <= 45; d += 1) {
        const px = sl.x + t[0] * d * side, py = sl.y + t[1] * d * side;
        if (px < 1 || py < 1 || px >= WW || py >= WH || type[cellIdx(px, py)] > T_ROAD) break;
        for (const o of [-4, 0, 4]) { const x = px + nx * o, y = py + ny * o; if (x > 0 && y > 0 && x < WW && y < WH) set.add(cellIdx(x, y)); }
      }
      addPre([...set], sl.gate ? c => Math.abs(((c % GW + .5) * CELL - sl.x) * t[0] + (((c / GW | 0) + .5) * CELL - sl.y) * t[1]) <= 3.5 : null);
      const rec = { x: sl.x, y: sl.y, north: !!sl.north, cells: sl.gate ? [...set].filter(c => gate[c]) : [] }; S.seals.push(rec);
      if (!sl.gate) continue;
      for (const o of [-8, 8]) {   // zwei Automatikgeschütze hinter der Sperre
        const q = nearestWalkCell(sl.x + nx * 14 + t[0] * o, sl.y + ny * 14 + t[1] * o, 12) || [sl.x + nx * 14, sl.y + ny * 14], e = placeTurret(q[0], q[1]);
        e.ds = 2; e.dt = 0; e.auto = true; e.acc = .6; e.ammo = e.ammoMax = 1e9;
      }
      const civs = E.filter(e => e.k === K_CIV && e.st !== 4 && !e.guard); let n = 0;
      for (const e of civs) {   // bewaffnete Zivilisten aus dem Bestand (zählen zu den 2500) als Torwache
        if (n >= m.guards) break; if (Math.random() > .05) continue;
        const q = randWalk(sl.x + nx * 10, sl.y + ny * 10, 6); if (!q) continue;
        e.x = q[0]; e.y = q[1]; e.path = null; e.guard = true; e.gx = q[0]; e.gy = q[1]; e.brave = true; arm(e); e.ammo = 400; n++;
      }
      if (n < m.guards) for (const e of civs) { if (n >= m.guards || e.guard) continue; const q = randWalk(sl.x + nx * 10, sl.y + ny * 10, 6); if (!q) continue; e.x = q[0]; e.y = q[1]; e.path = null; e.guard = true; e.gx = q[0]; e.gy = q[1]; e.brave = true; arm(e); e.ammo = 400; n++; }
    }
  }
  function spawnMission(m) {
    const st = m.start(), cnt = { sol: 0, pol: 0, gsg: 0 };
    for (const sq of (playRoster || C.roster).squads) {
      const list = sq.k === 'sol' ? st.sol : st.pol, p0 = list[cnt[sq.k]++ % list.length], p = nearestWalkCell(p0.x, p0.y, 40) ? { x: nearestWalkCell(p0.x, p0.y, 40)[0], y: nearestWalkCell(p0.x, p0.y, 40)[1] } : p0, id = ++gidN, kills = sq.m.slice();
      if (sq.k === 'sol') while (kills.length < 4 + RULES.squadPlus) kills.push(0);
      if (sq.k === 'pol') while (kills.length < 2 + RULES.polPlus) kills.push(0);
      kills.forEach((kl, i) => { const q = randWalk(p.x, p.y, 6) || [p.x, p.y]; unitFrom(sq.k, q[0], q[1], id, kl, i); });
    }
    S.fired = {}; S.evU = []; S.spawned = 0; S.breach = false; S.civ0 = E.filter(e => e.k === K_CIV).length;
    if (m.ring) buildRing(m.ring);
    if (m.seals) buildSeals(m);
    if (m.station) buildStation(m);
    for (const t of m.turrets || []) { const q = nearestWalkCell(t.x, t.y, 30) || [t.x, t.y], e = placeTurret(q[0], q[1]); e.ds = 2; e.dt = 0; e.auto = true; e.acc = .6; e.ammo = e.ammoMax = 1e9; }
    { const ev = m.evac(), p = randWalk(ev.x, ev.y, 25) || randWalk(ev.x, ev.y, 80) || [ev.x, ev.y]; S.pad = { x: p[0], y: p[1] }; S.evacPre = S.pad; }
    if (m.kind === 'trek') { S.padT = { x: S.pad.x, y: S.pad.y }; zpDirty = true; trekPrewarm(m); }
    cfg.pop = m.pop;
  }
  const NE_ROUTES = [[[1430, 300], [1440, 600], [1500, 800]], [[1670, 200], [1680, 500], [1690, 740]], [[1830, 200], [1830, 500], [1790, 700]]];   // links am Waldrand, mittig, rechts am Isarufer
  function spawnWave(w, first) {
    let mkId = 0;
    if (w.march) {
      S.marches = S.marches || [];
      let m = S.marches.find(q => q.id === w.march.id);
      if (!m) S.marches.push(m = { id: w.march.id, routes: w.march.routes, gather: w.march.gather, spd: w.march.spd, pre: w.march.pre, until: simT + (w.march.dur || 900), total: w.march.total || 0, focus: w.march.focus, arr: 0, n: 0, t1: null, go: false });
      m.n += w.n; mkId = S.marches.indexOf(m) + 1;
    }
    for (let i = 0; i < w.n; i++) {
      const p = randWalk(w.x, w.y, w.r || 30) || randWalk(w.x, w.y, 90) || anyWalk(true);
      const z = spawnZombie(p[0], p[1], mkId); S.spawned++;
      if (w.march) z.mr = w.march.route;
      if (w.fast) z.zsp = rnd(6, 8);
      if (w.seek != null) z.sk = Math.random() < w.seek;
      if (w.pad) z.pd = 1;
    }
    if (first) alertAt(w.x, w.y, 'Infizierte dringen ein');
    if (w.msg) { toast(w.msg, 4000); SFX.alarm(); }
  }
  function tick(m) {
    if (!S.fired) return;
    const fire = (id, t, fn) => { if (!S.fired[id] && simT >= t) { S.fired[id] = 1; fn(); } };
    m.spawns().forEach((w, i) => fire('sp' + i, w.t, () => spawnWave(w, w.t === 0)));
    if (S.marches && S.marches.some(q => !q.go) && (S.mstep = (S.mstep || 0) + 1) % 30 === 0) {
      for (const [i, mk] of S.marches.entries()) {
        if (mk.go || mk.t1 == null) continue;
        let alive = 0; for (const z of E) if (z.k === K_ZOM && !z.dead && z.mk === i + 1) alive++;
        if (mk.total && mk.n < mk.total) continue;   // erst wenn die ganze Welle gestartet ist
        if (mk.arr >= .8 * alive || simT >= mk.t1 + 180) mk.go = true;
      }
    }   // Sammelpunkt erreicht: Welle losgeschickt
    const lu = m.lure(); fire('lure', lu.t, () => { S.lure = { x: lu.x, y: lu.y, until: simT + lu.dur }; zfDirty = true; });
    const ev = m.evac(); fire('evac', ev.at, () => { S.evac = { x: S.pad.x, y: S.pad.y }; S.evacR = 50; S.evacT = 8; S.evacPre = null; Music.play('hope'); computeEvacField(); toast(m.evacMsg || '📡 Evakuierungssignal gegeben – Zivilisten laufen zum Landeplatz'); SFX.alarm(); });
    fire('horde', m.hordeAt, () => { S.horde = m.hordeFocus; zfDirty = true; if (!m.hordeQuiet) { toast('⚠ Die Horde zieht jetzt zielstrebig zum Evakuierungspunkt!'); SFX.alarm(); } });
    if (m.supplyBonus && simT >= m.supplyBonus.at && !RULES.supBonusOn) {   // zusätzliche Versorgungspakete (nach dem Laden stillschweigend wieder aktiv)
      RULES.supBonusOn = true; RULES.tools.supply = { ...RULES.tools.supply, max: (RULES.tools.supply.max || 0) + m.supplyBonus.n };
      if (!S.fired.supBonus) { S.fired.supBonus = 1; banner(m.supplyBonus.msg, 14000); SFX.ui(); }
    }
    for (const [tool, t] of Object.entries(RULES.tools)) if (t.at > 0) fire('u' + tool, t.at, () => toast(({ strike: '💥 Luftschläge freigegeben', garrison: '🪖 Verstärkung kann angefordert werden', truck: '🚛 Trucks freigegeben' })[tool] || 'Neues Werkzeug verfügbar'));
    if (m.primary.hold && (S.astep = (S.astep || 0) + 1) % 30 === 0) {
      const o = evalAir(m, counts());
      if (o.lost && !S.fired.lossNote) { S.fired.lossNote = 1; banner('Zivilisten wurden verloren – das Primärziel ist verfehlt. Haltet die Stellung für das Sekundärziel!', 12000); }
      if (!S.fired.holdDone && simT >= m.primary.hold) { S.fired.holdDone = 1; if (!o.lost) { banner('✓ Die Zivilisten haben 20 Minuten überlebt – Primärziel erreicht! Jetzt alle Zombies ausschalten.', 14000); SFX.ui(); } }
    }
    if (m.id === 'ap' && simT >= 910 && !RULES.apHQ) {   // gescriptete Überraschung: Verstärkung vom Hauptquartier und Evakuierung per Hubschrauber
      RULES.apHQ = true; const T = RULES.tools, add = (k, n, d) => { T[k] = { at: 0, cd: 20, ...d, ...T[k], max: ((T[k] && T[k].max) || 0) + n, at: 0 }; };
      add('gunship', 3); T.gunship.cd = 0; add('strike', 5); add('supply', 5); add('flare', 5, { cd: 4 });
      cooldown.gunship = 0; RULES.noHeli = false; RULES.evacCap = 40; RULES.evacEvery = 30;
      if (!S.fired.apHQ) { S.fired.apHQ = 1; S.evacT = 5; banner('📻 Ein Funkspruch vom Leutnant: „Uns wurden für diesen Kampf zusätzliche Ressourcen gewährt, um den Kampf fortzuführen. Helikopter, um die Zivilisten aufzunehmen, sind unterwegs. Haltet durch, solange ihr könnt, und rettet so viele Zivilisten, wie ihr könnt.“', 22000); SFX.alarm(); }
    }
    if (m.kind === 'land') tickLand(m);
    if (m.kind === 'trek') tickTrek(m);
    if (m.station && (S.sstep = (S.sstep || 0) + 1) % 30 === 0) {   // Wache übernehmen, sobald eine eigene Einheit nah genug ist
      const lk = E.filter(e => e.lock && !e.dead);
      if (lk.length && UL.some(u => !u.lock && (u.k === K_POL || u.k === K_SOL || u.k === K_SEN) && lk.some(l => (l.x - u.x) ** 2 + (l.y - u.y) ** 2 < m.station.r ** 2))) { for (const l of lk) l.lock = false; toast('👮 Die Einsatzkräfte der Polizeiwache stehen unter deinem Kommando'); SFX.ui(); }
    }
    // Brücke halten: kein Zombie darf das Westufer erreichen
    if (m.hold && !S.breach && (S.hstep = (S.hstep || 0) + 1) % 20 === 0) { for (const z of E) if (z.k === K_ZOM && !z.dead && m.hold(z)) { S.breach = true; alertAt(z.x, z.y, 'Brücke durchbrochen!'); break; } }
  }


  // ── Mission 5 „Der Weg nach Kelheim“: Linien lösen Wellen aus, Evakuierungsstelle muss gesichert und gehalten werden ──
  const TK_R = 200, TK_HOLD = 300;
  const TK_WAVES = [{ sn: 1000, dt: 15, e: 1000 }, { sn: 2000, dt: 10, e: 2000 }, { sn: 2000, dt: 10, e: 2000, z: 1000 }];
  const TK_SPOTS = [...Array(10).keys()].map(k => 600 + k * 400);
  function danubeBank(y) {   // Ufer der Donau auf Höhe y (Sammelpunkt der Ostzüge)
    let b = null, bd = 1e9;
    for (const w of MD.water) if (w.w === 40) for (let i = 0; i < w.p.length; i += 2) { const d = Math.abs(w.p[i + 1] - y); if (d < bd) { bd = d; b = [w.p[i], w.p[i + 1]]; } }
    return b ? { x: b[0] + 30, y: b[1] } : { x: 600, y };
  }
  const trekBanks = [];
  function trekBank(k, r, row) { return trekBanks[r] || (trekBanks[r] = danubeBank(row)); }
  function trekPrewarm(m) {   // Wegfelder für die Ostzüge im Hintergrund vorberechnen (sonst ruckelt es beim Auslösen)
    trekBanks.length = 0;
    m.trek.east.forEach((row, r) => { const bk = trekBank(0, r, row), q = nearestWalkCell(bk.x, bk.y, 80) || [bk.x, bk.y]; queueField('mf', bk.x + ',' + bk.y, q[0], q[1]); });
  }
  function tickTrek(m) {
    const T = m.trek, tr = S.trek || (S.trek = { lines: 0, t: [], hold: 0, primary: false, own: false, fin: false });
    const stp = S.tkstep = (S.tkstep || 0) + 1, isT = e => !e.dead && friendly(e) && (e.k === K_SOL || e.k === K_POL || e.k === K_TRK);
    if (stp % 15 === 0 && tr.lines < 3) {
      let any = false; for (const e of E) if (isT(e) && e.y <= T.lines[tr.lines]) { any = true; break; }
      if (any) { tr.t[tr.lines] = simT; banner(T.msgs[tr.lines], 9000); SFX.alarm(); tr.lines++; }
    }
    for (let k = 0; k < tr.lines; k++) {
      const W = TK_WAVES[k], t0 = tr.t[k];
      for (let j = 0; j < W.sn / 100; j++) { const id = 'ts' + k + '_' + j; if (!S.fired[id] && simT >= t0 + j * W.dt) { S.fired[id] = 1; spawnWave({ t: 0, n: 100, x: TK_SPOTS[j % 10], y: WH - 70, r: 60, seek: .95 }, false); } }
      T.east.forEach((row, r) => {
        const id = 'te' + k + '_' + r; if (S.fired[id] || simT < t0 + 5) return; S.fired[id] = 1;
        const bk = trekBank(k, r, row);
        spawnWave({ t: 0, n: W.e / 2, x: WW - 40, y: row, r: 160, seek: .95, march: { id: 'trkE' + k + '_' + r, route: 0, routes: [[]], gather: { x: bk.x, y: bk.y, r: 70 }, noWait: true, spd: 2, pre: true, dur: 2400 } }, false);
      });
      if (W.z) {
        const z = T.zone;
        if (!S.fired.tzMsg && simT >= t0 + 20) { S.fired.tzMsg = 1; banner('📡 Späher melden versteckte Untote zwischen den Bäumen. Sie kommen auf uns zu!', 12000); SFX.alarm(); }
        for (let j = 0; j < W.z / 100; j++) { const id = 'tz' + j; if (!S.fired[id] && simT >= t0 + 20 + j * 3) { S.fired[id] = 1; const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * (z.r - 90); spawnWave({ t: 0, n: 100, x: z.x + Math.cos(a) * d, y: z.y + Math.sin(a) * d, r: 90, pad: true }, false); } }
      }
    }
    if (tr.lines === 3 && S.fired.ts2_19 && S.fired.te2_1 && S.fired.tz9) tr.fin = true;
    if (tr.lines && (stp % 300 === 0 || (!S.seek && stp % 15 === 0))) {   // Ziel der Suchzüge: Schwerpunkt der Einsatzkräfte
      let n = 0, sx = 0, sy = 0; for (const e of E) if (isT(e)) { n++; sx += e.x; sy += e.y; }
      if (n) { sx /= n; sy /= n; if (!S.seek || Math.hypot(S.seek.x - sx, S.seek.y - sy) > 50) { S.seek = { x: sx, y: sy }; zsDirty = true; } }
    }
    if (stp % 30 === 0 && !tr.primary) {
      tr.own = E.some(e => isT(e) && Math.hypot(e.x - S.pad.x, e.y - S.pad.y) < TK_R);
      tr.near = countZAround(S.pad.x, S.pad.y, TK_R);
      if (tr.own && !tr.near) tr.hold++; else tr.hold = 0;
      if (tr.hold >= TK_HOLD) { tr.primary = true; banner('✓ Evakuierungsstelle gesichert – Primärziel erreicht! Jetzt alle Zombies ausschalten.', 14000); SFX.ui(); }
    }
  }
  function evalTrek(m, c) {
    const tr = S.trek || { lines: 0, hold: 0, primary: false }, cleared = !!tr.fin && c.zom === 0 && c.inf === 0;
    return { R: 0, cleared, primary: tr.primary, priFrac: tr.primary ? 1 : Math.min(.6, tr.lines * .1 + tr.hold / TK_HOLD * .3), secondary: cleared, killFrac: S.spawned ? Math.min(1, S.kills / S.spawned) : 0, hold: tr.hold, lines: tr.lines };
  }
  function hudTrek(m, c, o, box) {
    const tr = S.trek || {}, left = Math.max(0, TK_HOLD - (tr.hold || 0));
    const st = o.primary ? '<div class="ok">✓ Evakuierungsstelle gesichert</div>' : `<div class="${tr.own ? '' : 'ev'}">${tr.own ? '○ Zombies im Umkreis: <b>' + (tr.near || 0) + '</b>' : '○ Einsatzkräfte noch nicht vor Ort'} · gehalten ${fmtClock(tr.hold || 0)} / ${fmtClock(TK_HOLD)}</div><div class="bar"><i style="width:${(tr.hold || 0) / TK_HOLD * 100}%"></i></div>`;
    const html = `<h3>${m.name}</h3><div class="ev">Zeit ${fmtClock(simT)}</div>
      <div class="o"><b class="${o.primary ? 'ok' : ''}">${o.primary ? '✓ ' : ''}Primär:</b> Evakuierungsstelle sichern (${TK_R} m zombiefrei, ${fmtClock(TK_HOLD)} halten)${st}</div>
      <div class="o"><b class="${o.secondary ? 'ok' : ''}">${o.secondary ? '✓ ' : ''}Sekundär:</b><div class="${o.cleared ? 'ok' : ''}">${o.cleared ? '✓' : '○'} Zombies übrig: <b>${c.zom}</b>${tr.fin ? '' : ' <span class="ev">(weitere Wellen möglich)</span>'}</div></div>`;
    if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
    document.getElementById('bEnd').style.display = simT > 30 ? '' : 'none';
  }

  // ── Pfaffenhofen: Landeplatz sichern, dann Evakuierung per Schaltfläche ──
  const PAD_R = 80;
  function tickLand(m) {
    if (S.civFree && RULES.civNoGate) RULES.civNoGate = false;
    for (let k = 0; k < 20; k++) { const id = 'south' + k; if (!S.fired[id] && simT >= 600 + k * 6) { S.fired[id] = 1; spawnWave(PF_SOUTH(k), false); } }
    if (S.fired.evacGo) {   // nach Evakuierungsbeginn: Strom aus dem Nordwesten ab 5:00 (40 x 50, alle 10 s) und 500 aus dem Osten nach 8:00
      if (S.evacGoT == null) S.evacGoT = simT;
      const toPad = id => ({ id, route: 0, routes: [[]], gather: { x: S.pad.x, y: S.pad.y, r: 50 }, noWait: true, toEvac: true, dur: 1800 });
      if (!S.fired.nwMsg && simT >= S.evacGoT + 300) { S.fired.nwMsg = 1; banner('📻 Achtung: Sie haben unsere nördliche Absperrung durchbrochen und bewegen sich auf die Extraktionszone zu. Ihr müsst die Stellung unter allen Umständen halten.', 16000); SFX.alarm(); }
      for (let k = 0; k < 40; k++) { const id = 'nw' + k; if (!S.fired[id] && simT >= S.evacGoT + 300 + k * 10) { S.fired[id] = 1; spawnWave({ t: 0, n: 50, x: 45, y: 45, r: 30, msg: null, march: toPad('pfNW') }, false); } }
      if (!S.fired.east500 && simT >= S.evacGoT + 480) { S.fired.east500 = 1; spawnWave({ t: 0, n: 500, x: WW - 30, y: 950, r: 380, msg: '⚠ 500 Zombies stürmen aus dem Osten heran!', march: toPad('pfE') }, false); SFX.alarm(); }
    }
    if ((S.lstep = (S.lstep || 0) + 1) % 30) return;
    if (!S.padSafe) {
      if (countZAround(S.pad.x, S.pad.y, PAD_R) === 0) { if ((S.padT = (S.padT || 0) + 1) >= 10) { S.padSafe = true; banner('✓ Landeplatz gesichert – die Evakuierung kann gestartet werden!', 14000); SFX.ui(); } } else S.padT = 0;
    }
    if (!S.fired.north2 && simT <= 300 && S.kills >= 1500) { S.fired.north2 = 1; spawnWave(PF_NORTH2, false); SFX.alarm(); }
  }
  function startEvac(m) {
    if (!S || phase !== 'run' || !S.padSafe || S.fired.evacGo) return;
    S.fired.evacGo = 1; S.civFree = true; RULES.civNoGate = false;
    for (const sl of S.seals || []) if (!sl.north) for (const c of sl.cells) { gate[c] = 0; const b = BAR[barId[c]]; if (b) b.gates = []; }   // südliche Tore werden verschlossen: alle laufen durchs nördlichste Tor
    for (const e of E) if (e.guard) e.guard = false;
    S.evac = { x: S.pad.x, y: S.pad.y }; S.evacR = 1e6; S.evacT = 8; S.evacPre = null; evacDirty = true; Music.play('hope'); computeEvacField();
    banner('📡 Evakuierung gestartet – alle Zivilisten strömen durch das nördliche Tor zum Landeplatz!', 12000); SFX.alarm();
  }
  function evalLand(m, c) {
    const cleared = c.zom === 0 && c.inf === 0 && simT >= 5, R = S.ev.civ + (cleared ? c.civ : 0);
    return { R, alive: airCiv(), cleared, padSafe: !!S.padSafe || cleared, primary: !!S.padSafe || cleared, priFrac: S.padSafe || cleared ? 1 : Math.min(.5, S.kills / 5000), secondary: R >= m.secondary.rescue, rescueFrac: Math.min(1, R / m.secondary.rescue), killFrac: S.spawned ? Math.min(1, S.kills / S.spawned) : 0 };
  }

  // ── Ziele & Punkte ─────────────────────────────────────────────────────
  function lastSpawnT(m) { if (m.kind === 'trek') return 1e9; return Math.max(...m.spawns().map(w => w.t)); }
  function rescued(c) { return S.ev.civ; }
  function airCiv() { let n = 0; for (const e of E) if (!e.dead && e.k === K_CIV && e.inc < 0) n++; return n; }
  function evalAir(m, c) {   // Flughafen: alle Zivilisten müssen m.primary.hold Sekunden überleben
    const cleared = c.zom === 0 && c.inf === 0 && simT >= lastSpawnT(m) + 5, civ = airCiv() + S.ev.civ, c0 = S.civ0 || m.pop, lost = civ < m.primary.civ ? Math.max(1, c0 - civ) : 0;   // „lost“: Mindestzahl unterschritten
    const prog = cleared || (civ - S.ev.civ === 0 && S.ev.civ > 0) ? 1 : Math.min(1, simT / m.primary.hold);   // alles evakuiert: nichts mehr zu halten
    return { R: civ, cleared, lost, prog, primary: lost === 0 && prog >= 1, priFrac: Math.min(1, civ / m.primary.civ) * prog, secondary: cleared, killFrac: S.spawned ? Math.min(1, S.kills / S.spawned) : 0 };
  }
  function evalObj(m, c) {
    if (m.primary.hold) return evalAir(m, c);
    if (m.kind === 'trek') return evalTrek(m, c);
    if (m.kind === 'land') return evalLand(m, c);
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
    if (m.primary.hold && airCiv() === 0) return endGame(S.ev.civ > 0 ? 'Evakuierung abgeschlossen.' : 'Alle Zivilisten im Flughafen sind gefallen.');
    if (m.kind === 'trek') { if (evalTrek(m, c).cleared && S.trek.primary) return endGame('Sieg – Evakuierungsstelle gesichert und alle Zombies ausgeschaltet!'); return; }
    if (m.kind === 'land') {
      if (!S.padSafe && simT >= m.primary.land) return endGame('Der Landeplatz wurde nicht rechtzeitig gesichert.');
      if (airCiv() === 0) return endGame(S.fired.evacGo ? 'Evakuierung abgeschlossen.' : 'Alle Zivilisten sind gefallen.');
    }
    if (c.zom === 0 && c.inf === 0 && simT >= lastSpawnT(m) + 5) return endGame('Sieg – alle Zombies ausgeschaltet!');
  }
  function hud(m, c) {
    const box = document.getElementById('objs'); document.getElementById('bEvacGo').style.display = 'none'; if (phase !== 'run' || !S || !S.fired) { box.style.display = 'none'; return; }
    box.style.display = '';
    const o = evalObj(m, c), pri = m.primary.civ;
    if (m.primary.hold) return hudAir(m, c, o, box);
    if (m.kind === 'trek') return hudTrek(m, c, o, box);
    if (m.kind === 'land') return hudLand(m, c, o, box);
    const evs = []; const up = (name, t) => { if (simT < t && t < 1e8) evs.push(`${name} in ${fmtClock(t - simT)}`); };
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

  function hudLand(m, c, o, box) {
    const near = S.padSafe ? 0 : countZAround(S.pad.x, S.pad.y, PAD_R), left = Math.max(0, m.primary.land - simT);
    const pri = o.padSafe ? '<div class="ok">✓ Landeplatz gesichert</div>' : `<div class="${left < 120 ? 'no' : ''}">○ Zombies am Landeplatz: <b>${near}</b> · noch ${fmtClock(left)}</div>`;
    const html = `<h3>${m.name}</h3><div class="ev">Zeit ${fmtClock(simT)}</div>
      <div class="o"><b class="${o.primary ? 'ok' : ''}">${o.primary ? '✓ ' : ''}Primär:</b> Landeplatz sichern${pri}</div>
      <div class="o"><b class="${o.secondary ? 'ok' : ''}">${o.secondary ? '✓ ' : ''}Sekundär:</b> Gerettet <b class="${o.secondary ? 'ok' : ''}">${o.R}</b> / ${m.secondary.rescue}<div class="bar"><i style="width:${o.rescueFrac * 100}%"></i></div><div class="ev">Zivilisten übrig: ${o.alive} · Zombies: ${c.zom}</div></div>`;
    if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
    document.getElementById('bEnd').style.display = simT > 30 ? '' : 'none';
    const b = document.getElementById('bEvacGo'); b.style.display = ''; b.disabled = !o.padSafe || !!S.fired.evacGo;
    b.textContent = S.fired.evacGo ? '📡 Evakuierung läuft' : '📡 Evakuierung starten'; b.title = o.padSafe ? '' : 'Erst den Landeplatz sichern';
  }
  function hudAir(m, c, o, box) {
    const nxt = AIR_WAVES.filter(w => w.t > simT && w.t < 900).map(w => w.t)[0];
    const html = `<h3>${m.name}</h3><div class="ev">Zeit ${fmtClock(simT)}</div>
      <div class="o"><b>Primär:</b> Zivilisten am Leben <b class="${o.lost ? 'no' : 'ok'}">${o.R}</b> / ${S.civ0 || m.pop} (mind. ${m.primary.civ})${o.lost ? ' ✗' : ''}<div class="bar"><i style="width:${o.prog * 100}%"></i></div>${o.primary ? '✓ 20 Minuten überlebt' : o.lost ? 'Verluste – Primärziel verfehlt' : 'Noch ' + fmtClock(Math.max(0, m.primary.hold - simT))}</div>
      <div class="o"><b class="${o.secondary ? 'ok' : ''}">${o.secondary ? '✓ ' : ''}Sekundär:</b><div class="${o.cleared ? 'ok' : ''}">${o.cleared ? '✓' : '○'} Zombies übrig: <b>${c.zom}</b></div></div>
      ${nxt != null ? `<div class="ev">⚠ Nächste Welle in ${fmtClock(nxt - simT)}</div>` : ''}`;
    if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
    document.getElementById('bEnd').style.display = simT > 30 ? '' : 'none';
  }
  function finish(m, msg) {
    const c = counts(), o = evalObj(m, c), cleared = o.cleared;
    // Überlebende (auf der Karte oder evakuiert) gehen ins Roster
    const surv = [...(S.evU || [])];
    for (const u of E) if (friendly(u) && (u.k === K_POL || u.k === K_SOL || u.k === K_SEN)) surv.push({ k: u.gsg ? 'gsg' : u.k === K_POL ? 'pol' : 'sol', kills: u.kills, sq: u.sq });
    const grp = new Map(); for (const s of surv) { if (!grp.has(s.sq)) grp.set(s.sq, { k: s.k, m: [] }); grp.get(s.sq).m.push(s.kills); }
    const ev = S.ev, people = ev.civ + ev.pol * 5 + ev.mil * 10 + (cleared ? c.civ + c.pol * 5 + c.mil * 10 : 0);
    const priPts = Math.round(m.primary.pts * o.priFrac);
    let secPts = 0, secTxt = '';
    if (m.secondary.rescue != null) { secPts = Math.round(m.secondary.pts * (o.secondary ? 1 : o.rescueFrac * .5)); secTxt = `${o.R} / ${m.secondary.rescue} Zivilisten gerettet`; } else
    if (m.secondary.clear === true) { secPts = o.secondary ? m.secondary.pts : Math.round(m.secondary.pts * o.killFrac * .5); secTxt = o.secondary ? '✓ Alle Zombies getötet' : `✗ ${Math.round(o.killFrac * 100)} % der Zombies getötet`; } else
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
      if (curReplay) { persist(); return; }   // Hard: Wiederholung bringt weder Punkte noch Einheiten
      if (C.diff === 'hard' && o.primary) { C.done[m.id] = 1; const pre = JSON.parse(C.pre || 'null'); if (pre) C.snap[m.id] = { roster: pre.roster, trucks: pre.trucks || 0 }; }
      C.points += total; C.trucks = Math.max(0, (C.trucks || 0) - (S.trkLost || 0));   // zerstörte Trucks werden nicht ersetzt
      let squads = res.squads.filter(s => s.m.length);
      if (!squads.some(s => s.k === 'sol')) squads.push({ k: 'sol', m: [0, 0, 0, 0] });   // Reserve, damit die Kampagne nie ohne Truppen dasteht
      if (!squads.some(s => s.k === 'pol' || s.k === 'gsg')) squads.push({ k: 'pol', m: [0, 0] });
      if (o.primary && m.reward && !(C.got || (C.got = {}))[m.id]) { C.got[m.id] = 1; C.bonus = C.bonus || { strike: 0, gunship: 0 }; for (const k in m.reward) C.bonus[k] = (C.bonus[k] || 0) + m.reward[k]; }
      C.roster = { squads }; if (o.primary || idx + 1 > C.next - 1) C.next = Math.max(C.next, idx + 1);
      persist();
    };
    const html = `<h2>${o.primary ? (o.secondary ? 'Mission erfüllt' : 'Primärziel erreicht') : 'Mission gescheitert'}</h2><p class="stars">${'★'.repeat(starN)}${'☆'.repeat(3 - starN)}</p><p>${msg}</p>
      <table>
      <tr><td>Primär: ${m.kind === 'trek' ? (o.primary ? '✓ Evakuierungsstelle gesichert' : '✗ Evakuierungsstelle nicht gesichert') : m.kind === 'land' ? (o.primary ? '✓ Landeplatz gesichert' : '✗ Landeplatz nicht gesichert') : m.primary.hold ? o.R + ' von ' + (S.civ0 || m.pop) + ' Zivilisten am Leben' + (o.primary ? ' (20 Minuten überlebt)' : '') : o.R + ' von ' + m.primary.civ + ' Zivilisten gerettet'} (${Math.round(o.priFrac * 100)} %)</td><td>+${priPts}</td></tr>
      <tr><td>Sekundär: ${secTxt}</td><td>+${secPts}</td></tr>
      <tr><td>Gerettete/überlebende Personen (1 / 5 / 10 Punkte)</td><td>+${people}</td></tr>
      <tr><td><b>Summe</b></td><td><b>${total}</b></td></tr>
      <tr><td>Überlebende Einsatzkräfte übernommen</td><td>${curReplay ? 0 : res.squads.reduce((a, s) => a + s.m.length, 0)}</td></tr></table>${curReplay ? '<p class="hint">Hard: Wiederholung einer abgeschlossenen Mission – keine Punkte, keine neuen Einheiten.</p>' : ''}${o.primary && m.reward && !(C.got && C.got[m.id]) ? '<p class="stars" style="font-size:15px">🎁 Belohnung: +' + m.reward.strike + ' Luftschläge und +' + m.reward.gunship + ' Gunship (ab der nächsten Mission)</p>' : ''}
      <div class="btns"><button class="big" id="cNext">Weiter</button>${o.primary ? '' : '<button id="cRetry">Mission wiederholen</button>'}</div>`;
    modal(html, () => {
      document.getElementById('cNext').onclick = () => { keep(); closeModal(); Comic.play(o.primary ? m.id + '_win' : m.id + '_lose', () => hub()); };
      const r = document.getElementById('cRetry'); if (r) r.onclick = () => { closeModal(); start(idx, true); };
    });
  }

  // ── Start ──────────────────────────────────────────────────────────────
  const isReplay = m => !!(C && C.diff === 'hard' && C.done[m.id] && C.snap[m.id]);
  const SQN = { sol: 'Soldaten', pol: 'Polizei', gsg: 'GSG-9' };
  function start(idx, retry) {
    const m = MIS[idx]; cur = m; curIdx = idx;
    curReplay = isReplay(m); playRoster = null;
    if (curReplay) playRoster = JSON.parse(JSON.stringify(C.snap[m.id].roster));   // Hard: nur die Einheiten des ersten Anlaufs
    else if (!retry || !C.pre) C.pre = JSON.stringify({ roster: C.roster, points: C.points, trucks: C.trucks });
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
      <p class="hint" style="margin-top:10px">${isReplay(m) ? '<b>Hard – Wiederholung:</b> keine Punkte, nur die Einheiten des ersten Anlaufs. ' : ''}Einheiten: ${(isReplay(m) ? C.snap[m.id].roster : C.roster).squads.map(s => SQN[s.k] + '-Squad (' + s.m.length + ')').join(', ')} · Munition begrenzt · Erfahrung: alle 50 Abschüsse +1 Level (+5 % Treffsicherheit)</p>
      <div class="btns"><button class="big" id="cGo">▶ Mission starten</button>${isReplay(m) ? '' : '<button id="cShop">🛒 Shop</button>'}<button id="cBack">Zurück</button></div>`, () => {
      $('cGo').onclick = () => { closeModal(); start(idx); };
      if ($('cShop')) $('cShop').onclick = () => shop(() => briefing(idx));
      $('cBack').onclick = () => hub();
    });
  }
  function hub() {
    document.body.classList.add('inhub');
    Music.play('menu');
    const rows = MIS.map((m, i) => {
      const ok = i <= C.next, b = C.best[m.id];
      return `<div class="card ${ok ? '' : 'dis'}"><div><b>${i + 1}. ${m.name}</b><small>${m.sub}${b ? ' · Bestwert ' + b : ''}</small></div><button data-i="${i}" ${ok ? '' : 'disabled'}>${b ? (isReplay(m) ? 'Erneut (ohne Punkte)' : 'Erneut spielen') : 'Briefing'}</button></div>`;
    }).join('');
    const ro = C.roster.squads.map(s => { const lv = s.m.map(lvOf); return `<div class="card"><div><b>${SQN[s.k]}-Squad</b><small>${s.m.length} Mitglieder · Level ${lv.join('/')} · Abschüsse ${s.m.reduce((a, b) => a + b, 0)}</small></div></div>`; }).join('');
    modal(`<h2>Kampagne</h2><p>Punkte: <b>${C.points}</b> · Schwierigkeit: <b>${C.diff === 'hard' ? 'Hard' : 'Easy'}</b></p>${rows}<h3 style="margin:12px 0 4px">Einheiten</h3><div class="cgrid">${ro}</div>
      <div class="btns"><button id="cShop">🛒 Shop</button><button id="cNew">Neue Kampagne</button><button id="cMenu">Hauptmenü</button></div>`, () => {
      document.querySelectorAll('#mbox button[data-i]').forEach(b => b.onclick = () => { const i = +b.dataset.i; closeModal(); const go = () => briefing(i); if (!C.seen['intro' + i]) { C.seen['intro' + i] = 1; persist(); Comic.play(i === 0 ? 'prologue' : MIS[i].id + '_intro', go); } else go(); });
      $('cShop').onclick = () => shop(hub);
      $('cNew').onclick = () => { if (confirm('Die Kampagne wirklich neu beginnen? Fortschritt und Upgrades gehen verloren.')) pickDiff(hub); };
      $('cMenu').onclick = () => { closeModal(); document.body.classList.remove('inhub'); toMenu(); };
    });
  }
  function shop(back) {
    const up = UP.map(u => {
      const lv = upLv(u.id), max = u.p.length, price = u.p[lv];
      return `<div class="card"><div><b>${u.n}${max > 1 ? ' (Stufe ' + lv + '/' + max + ')' : ''}</b><small>${u.d}</small></div>${lv >= max ? '<span class="ok" style="color:var(--acc)">✓ gekauft</span>' : `<button data-up="${u.id}" ${C.points >= price ? '' : 'disabled'}>${price} P</button>`}</div>`;
    }).join('');
    const bu = BUY.map(u => {
      const have = u.id === 'truck' ? C.trucks : u.id === 'garr' ? C.garr : 0, ex = u.max && have >= u.max;
      return `<div class="card"><div><b>${u.n}${u.max ? ' (' + have + '/' + u.max + ')' : ''}</b><small>${u.d}</small></div>${ex ? '<span style="color:var(--acc)">✓ max.</span>' : `<button data-buy="${u.id}" ${C.points >= u.p ? '' : 'disabled'}>${u.p} P</button>`}</div>`;
    }).join('');
    modal(`<h2>Shop</h2><p>Verfügbare Punkte: <b>${C.points}</b></p><h3 style="margin:8px 0 2px">Neue Einheiten</h3>${bu}<h3 style="margin:10px 0 2px">Upgrades</h3>${up}<div class="btns"><button class="big" id="sBack">Zurück</button></div>`, () => {
      document.querySelectorAll('#mbox button[data-up]').forEach(b => b.onclick = () => { const u = UP.find(x => x.id === b.dataset.up), lv = upLv(u.id), p = u.p[lv]; if (C.points >= p) { C.points -= p; C.up[u.id] = lv + 1; persist(); shop(back); } });
      document.querySelectorAll('#mbox button[data-buy]').forEach(b => b.onclick = () => {
        const u = BUY.find(x => x.id === b.dataset.buy); if (C.points < u.p) return;
        C.points -= u.p;
        if (u.id === 'pol') C.roster.squads.push({ k: 'pol', m: [0, 0] }); else if (u.id === 'gsg') C.roster.squads.push({ k: 'gsg', m: [0, 0, 0] }); else if (u.id === 'garr') C.garr++; else if (u.id === 'sol') C.roster.squads.push({ k: 'sol', m: [0, 0, 0, 0] }); else C.trucks++;
        persist(); shop(back);
      });
      $('sBack').onclick = () => back();
    });
  }
  function init() {
    const has = !!C;
    $('mCamp').textContent = has ? '🎖 Kampagne fortsetzen' : '🎖 Kampagne starten';
    $('mCamp').onclick = () => { $('menu').style.display = 'none'; if (!C) pickDiff(hub); else hub(); };
    $('bEvacGo').onclick = () => { const m = MIS.find(x => x.id === (RULES && RULES.missionId)); if (m && m.kind === 'land') startEvac(m); };
    $('bEnd').onclick = () => modal(`<h2>Mission beenden?</h2><p>Die Mission wird jetzt gewertet. Überlebende Einsatzkräfte werden übernommen.</p><div class="btns"><button class="big" id="eYes">Mission beenden</button><button id="eNo">Weiterspielen</button></div>`, () => { $('eYes').onclick = () => { closeModal(); endGame('Rückzug – Mission vorzeitig beendet.'); }; $('eNo').onclick = closeModal; });
  }
  function newGame() {
    const prog = C && (C.next > 0 || C.points > 0 || Object.keys(C.best || {}).length);
    if (prog && !confirm('Ein neues Spiel beginnen? Der Kampagnenfortschritt (Missionen, Punkte, Upgrades, Einheiten) geht verloren.')) return;
    pickDiff(() => { $('menu').style.display = 'none'; $('mCamp').textContent = '🎖 Kampagne fortsetzen'; hub(); });
  }
  function pickDiff(go) {
    modal(`<h2>Schwierigkeit</h2><div class="card"><div><b>Easy</b><small>Einheiten, Punkte und Upgrades bleiben bei Wiederholungen erhalten.</small></div><button id="dEasy">Easy</button></div>
      <div class="card"><div><b>Hard</b><small>Bei der Wiederholung einer abgeschlossenen Mission startest du nur mit den Einheiten des ersten Anlaufs – ohne zusätzliche Punkte.</small></div><button id="dHard">Hard</button></div>
      <div class="btns"><button id="dBack">Abbrechen</button></div>`, () => {
      const pick = d => { closeModal(); C = fresh(); C.diff = d; persist(); go(); };
      $('dEasy').onclick = () => pick('easy'); $('dHard').onclick = () => pick('hard'); $('dBack').onclick = () => { closeModal(); if (!C) toMenu(); else $('menu').style.display = ''; };
    });
  }
  return { newGame, init, rulesFor, MIS, get state() { return C; }, hub, start, UP };
})();
