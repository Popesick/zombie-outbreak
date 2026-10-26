'use strict';
/* Comic-Zwischensequenzen: Panels aus Bilddateien (img/comic/<sequenz>_<n>.webp) oder prozedural gezeichnete Szenen (Fallback),
   Textbox, Sprechblasen (normal/Funk) und Vertonung. Vertonung: audio/voice/<sequenz>_<n>.mp3 (z. B. audio/voice/prologue_1.mp3);
   Panels mit radio:true bekommen einen Funk-Klangfilter. Fehlt die Datei, bleibt das Panel stumm (Computerstimme nur, wenn TTS_FALLBACK = true). */
const Comic = (() => {
  const W = 960, H = 540, INK = '#0b0b0d';
  const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const circ = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, 6.283); };
  const ink = (c, w = 3) => { c.lineWidth = w; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke(); };

  // ── Bausteine ─────────────────────────────────────────────────────────
  function sky(c, a, b) { const g = c.createLinearGradient(0, 0, 0, H * .8); g.addColorStop(0, a); g.addColorStop(1, b); c.fillStyle = g; c.fillRect(-40, -40, W + 80, H + 80); }
  function stars(c, t) { const r = rng(7); c.fillStyle = '#fff'; for (let i = 0; i < 70; i++) { c.globalAlpha = .45 + .45 * Math.sin(t * 2 + i); c.fillRect(r() * W, r() * H * .5, 2, 2); } c.globalAlpha = 1; }
  function moon(c, x, y, rad) { c.fillStyle = '#f2edcb'; circ(c, x, y, rad); c.fill(); ink(c); c.fillStyle = '#d9d3ac'; for (const [dx, dy, r] of [[-.3, -.2, .22], [.25, .1, .16], [-.05, .35, .12]]) { circ(c, x + dx * rad, y + dy * rad, r * rad); c.fill(); } }
  function ground(c, y, col) { c.fillStyle = col; c.fillRect(-40, y, W + 80, H - y + 40); c.beginPath(); c.moveTo(-40, y); c.lineTo(W + 40, y); ink(c, 4); }
  function houses(c, y, seed, col, n, lit) {
    const r = rng(seed); let x = -20;
    for (let i = 0; i < n; i++) {
      const w = 60 + r() * 70, h = 50 + r() * 70; c.fillStyle = col; c.beginPath(); c.rect(x, y - h, w, h); c.moveTo(x - 6, y - h); c.lineTo(x + w / 2, y - h - 36 - r() * 20); c.lineTo(x + w + 6, y - h); c.closePath(); c.fill(); ink(c, 2.5);
      if (lit) { c.fillStyle = '#ffd36b'; for (let j = 0; j < 4; j++) if (r() < .55) c.fillRect(x + 10 + (j % 2) * (w / 2 - 6), y - h + 14 + (j >> 1) * 26, 11, 14); }
      x += w + 4 + r() * 10;
    }
  }
  function tower(c, x, y, h, col) {   // Kirchturm mit Spitzhelm (an das Kastulusmünster angelehnt)
    c.fillStyle = col; c.beginPath(); c.rect(x - 22, y - h, 44, h); c.moveTo(x - 26, y - h); c.lineTo(x, y - h - 110); c.lineTo(x + 26, y - h); c.closePath(); c.fill(); ink(c, 3);
    c.fillStyle = '#f2edcb'; circ(c, x, y - h + 40, 12); c.fill(); ink(c, 2); c.fillStyle = '#ffd36b'; c.fillRect(x - 6, y - h + 80, 12, 26);
  }
  function river(c, y, h, t) { const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#1b3d63'); g.addColorStop(1, '#0d2238'); c.fillStyle = g; c.fillRect(-40, y, W + 80, h); c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 2; for (let i = 0; i < 14; i++) { const xx = (i * 83 + t * 18) % (W + 80) - 40; c.beginPath(); c.moveTo(xx, y + 16 + (i % 4) * 14); c.lineTo(xx + 36, y + 16 + (i % 4) * 14); c.stroke(); } }
  function bridge(c, y, col) { c.fillStyle = col; c.fillRect(-40, y - 26, W + 80, 26); c.beginPath(); c.rect(-40, y - 26, W + 80, 26); ink(c, 3); for (let x = 20; x < W; x += 90) { c.fillRect(x, y, 16, 70); c.strokeRect(x, y, 16, 70); } c.fillStyle = INK; c.fillRect(-40, y - 46, W + 80, 5); for (let x = 0; x < W; x += 60) c.fillRect(x, y - 46, 4, 20); }
  function person(c, x, y, s, kind, t, gun = true) {
    const bob = Math.sin(t * 3 + x) * 1.5 * s, col = kind === 'pol' ? '#2f4f8f' : '#566b3a';
    c.save(); c.translate(x, y + bob); c.scale(s, s);
    c.fillStyle = col; c.beginPath(); c.roundRect(-14, -58, 28, 46, 8); c.fill(); ink(c, 3);   // Rumpf
    c.fillStyle = '#2b2b2f'; c.fillRect(-12, -14, 10, 26); c.fillRect(2, -14, 10, 26); c.strokeStyle = INK; c.lineWidth = 2.5; c.strokeRect(-12, -14, 10, 26); c.strokeRect(2, -14, 10, 26);
    c.fillStyle = '#e0b48c'; circ(c, 0, -70, 11); c.fill(); ink(c, 3);   // Kopf
    c.fillStyle = kind === 'pol' ? '#1d2f57' : '#3f4f29'; c.beginPath(); c.arc(0, -73, 12, Math.PI, 0); c.closePath(); c.fill(); ink(c, 3);   // Helm/Mütze
    if (gun) { c.strokeStyle = INK; c.lineWidth = 6; c.beginPath(); c.moveTo(-4, -40); c.lineTo(34, -48); c.stroke(); c.strokeStyle = '#444'; c.lineWidth = 3; c.stroke(); }
    c.restore();
  }
  function zombie(c, x, y, s, t, col = '#5d7a4f') {
    const sw = Math.sin(t * 3 + x * .1) * 3 * s; c.save(); c.translate(x + sw, y); c.scale(s, s);
    c.fillStyle = '#4a4a3a'; c.beginPath(); c.roundRect(-13, -54, 26, 44, 7); c.save(); c.translate(0, 0); c.rotate(.12); c.fill(); c.restore(); ink(c, 3);
    c.fillStyle = col; circ(c, 6, -66, 11); c.fill(); ink(c, 3);   // Kopf nach vorn
    c.fillStyle = '#e6ff7a'; circ(c, 10, -68, 2.4); c.fill(); circ(c, 3, -68, 2.4); c.fill();
    c.strokeStyle = col; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(6, -46); c.lineTo(32, -44 + Math.sin(t * 4 + x) * 4); c.moveTo(0, -42); c.lineTo(26, -36); c.stroke(); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#2b2b2f'; c.fillRect(-11, -10, 9, 24); c.fillRect(3, -10, 9, 22); c.restore();
  }
  function heli(c, x, y, s, t, col = '#2c3138') {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, 60, 24, 0, 0, 6.283); c.fill(); ink(c, 3.5);
    c.beginPath(); c.moveTo(48, -6); c.lineTo(130, -14); c.lineTo(130, -2); c.lineTo(48, 8); c.closePath(); c.fill(); ink(c, 3); c.fillRect(124, -30, 8, 28); c.strokeRect(124, -30, 8, 28);
    c.fillStyle = '#7fb4d8'; c.beginPath(); c.ellipse(-26, -4, 24, 14, 0, 0, 6.283); c.fill(); ink(c, 2.5);
    c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.moveTo(-50, 34); c.lineTo(50, 34); c.moveTo(-30, 24); c.lineTo(-34, 34); c.moveTo(30, 24); c.lineTo(34, 34); c.stroke();
    const a = t * 30; c.lineWidth = 5; c.strokeStyle = 'rgba(230,230,230,.85)'; c.beginPath(); c.moveTo(-110 * Math.cos(a), -28); c.lineTo(110 * Math.cos(a), -28); c.stroke(); c.lineWidth = 2; c.strokeStyle = INK; c.beginPath(); c.moveTo(0, -28); c.lineTo(0, -20); c.stroke();
    c.restore();
  }
  function beam(c, x, y, toX, toY, w) { const g = c.createLinearGradient(x, y, toX, toY); g.addColorStop(0, 'rgba(255,240,170,.55)'); g.addColorStop(1, 'rgba(255,240,170,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(x, y); c.lineTo(toX - w, toY); c.lineTo(toX + w, toY); c.closePath(); c.fill(); }
  function blast(c, x, y, r, t) {
    const p = Math.min(1, t / 1.2), R = r * (.4 + .6 * p); c.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283, rr = R * (i % 2 ? .62 : 1); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fillStyle = '#ffb83a'; c.fill(); ink(c, 4);
    c.beginPath(); for (let i = 0; i < 18; i++) { const a = i / 18 * 6.283 + .2, rr = R * .55 * (i % 2 ? .6 : 1); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); c.fillStyle = '#fff3a8'; c.fill(); ink(c, 2.5);
  }
  function bubble(c, x, y, w, text, tx, ty, o = {}) {
    const fs = o.fs || 21, lh = fs * 1.25; c.font = `bold ${fs}px "Comic Sans MS","Chalkboard SE",cursive,sans-serif`;
    const words = text.split(' '), lines = []; let ln = '';
    for (const wd of words) { if (c.measureText(ln + wd).width > w - 28) { lines.push(ln.trim()); ln = ''; } ln += wd + ' '; } lines.push(ln.trim());
    const h = lines.length * lh + 22, fill = o.radio ? '#e6f0f7' : '#fff';
    c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, o.radio ? 6 : 18); c.fill(); ink(c, 3.5);
    c.beginPath(); c.moveTo(x + w * .3, y + h - 2);
    if (o.radio) { const mx = (x + w * .3 + tx) / 2, my = (y + h + ty) / 2; c.lineTo(mx + 14, my - 10); c.lineTo(mx - 10, my + 6); c.lineTo(tx, ty); c.lineTo(mx + 6, my + 14); }
    else c.lineTo(tx, ty);
    c.lineTo(x + w * .42, y + h - 2); c.fillStyle = fill; c.fill(); ink(c, 3.5);
    c.fillStyle = fill; c.fillRect(x + w * .3 + 3, y + h - 6, w * .12 - 4, 8);
    if (o.who) { c.font = `bold ${Math.round(fs * .62)}px sans-serif`; const tw = c.measureText(o.who).width + 16; c.fillStyle = '#f5d85a'; c.fillRect(x + 12, y - 15, tw, 20); c.strokeStyle = INK; c.lineWidth = 2.5; c.strokeRect(x + 12, y - 15, tw, 20); c.fillStyle = INK; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(o.who, x + 20, y - 4); }
    c.font = `bold ${fs}px "Comic Sans MS","Chalkboard SE",cursive,sans-serif`; c.fillStyle = INK; c.textBaseline = 'top'; c.textAlign = 'left'; lines.forEach((l, i) => c.fillText(l, x + 14, y + 11 + i * lh));
  }
  function fire(c, x, y, s, t) { for (let i = 0; i < 5; i++) { const k = Math.sin(t * 7 + i * 1.7) * .15 + 1; c.fillStyle = i % 2 ? '#ff9b2f' : '#ffd24a'; c.beginPath(); c.moveTo(x + (i - 2) * 14 * s - 12 * s, y); c.quadraticCurveTo(x + (i - 2) * 14 * s, y - 70 * s * k - i % 3 * 12 * s, x + (i - 2) * 14 * s + 12 * s, y); c.closePath(); c.fill(); ink(c, 2); } }
  function halftone(c) {
    c.save(); c.fillStyle = 'rgba(0,0,0,.2)'; for (let y = 0; y < H; y += 12) for (let x = (y / 12 % 2) * 6; x < W; x += 12) { const d = Math.hypot(x - W / 2, y - H / 2) / Math.hypot(W / 2, H / 2); if (d > .62) { c.beginPath(); c.arc(x, y, (d - .6) * 5, 0, 6.283); c.fill(); } } c.restore();
  }

  // ── Szenen ────────────────────────────────────────────────────────────
  const SCENES = {
    nightTown(c, t) { sky(c, '#0a1230', '#2b3b69'); stars(c, t); moon(c, 760, 110, 48); houses(c, 440, 3, '#1b2238', 9, true); tower(c, 330, 440, 210, '#222a44'); houses(c, 520, 5, '#0f1425', 8, true); ground(c, 470, '#0c1018'); },
    radio(c, t) {
      c.fillStyle = '#1a2230'; c.fillRect(-40, -40, W + 80, H + 80); c.fillStyle = '#0e141d'; c.fillRect(0, 330, W, 210);
      for (let i = 0; i < 3; i++) { const x = 90 + i * 270; c.fillStyle = '#0b2a1c'; c.beginPath(); c.roundRect(x, 70, 230, 160, 10); c.fill(); ink(c, 4); c.strokeStyle = '#46ff9b'; c.lineWidth = 2; c.beginPath(); for (let k = 0; k < 200; k += 4) { const yy = 150 + Math.sin(k * .15 + t * 5 + i) * 30 * Math.sin(k * .02 + t); k ? c.lineTo(x + 15 + k, yy) : c.moveTo(x + 15 + k, yy); } c.stroke(); }
      person(c, 480, 470, 3.1, 'pol', t, false); c.fillStyle = '#222'; c.fillRect(440, 270, 80, 9); c.strokeStyle = INK; c.lineWidth = 3; c.strokeRect(440, 270, 80, 9);
    },
    squad(c, t) { sky(c, '#f08a4a', '#ffd9a0'); circ(c, 700, 330, 90); c.fillStyle = '#fff1c4'; c.fill(); ink(c, 4); houses(c, 400, 11, '#6d3d3a', 6, false); ground(c, 400, '#3a3d2f'); c.fillStyle = '#2a2c24'; c.fillRect(-40, 400, W + 80, 140); c.fillStyle = '#c9c9b8'; for (let x = 0; x < W; x += 110) c.fillRect(x, 470, 60, 8); for (const [x, k] of [[250, 'sol'], [340, 'sol'], [430, 'sol'], [520, 'sol'], [190, 'pol'], [600, 'pol']]) person(c, x, 490 + (x % 3) * 6, 2.6, k, t); },
    bridgeNight(c, t) { sky(c, '#0a1230', '#243462'); stars(c, t); moon(c, 180, 100, 40); houses(c, 300, 21, '#171d31', 7, true); river(c, 330, 210, t); bridge(c, 380, '#3a3f4a'); for (const x of [400, 460, 520]) person(c, x, 372, 1.7, 'sol', t); person(c, 620, 372, 1.7, 'pol', t); c.fillStyle = 'rgba(255,230,150,.25)'; c.fillRect(0, 0, W, 4); },
    horde(c, t) { sky(c, '#3a1620', '#b5553a'); houses(c, 330, 31, '#2a1318', 7, false); ground(c, 330, '#1e1a1c'); c.fillStyle = '#2c2a2e'; c.fillRect(-40, 330, W + 80, 220); const r = rng(5); for (let i = 0; i < 46; i++) { const y = 360 + r() * 160; zombie(c, 60 + r() * 840 - (t * 14 % 40), y, .9 + (y - 360) / 160 * 1.5, t + i, '#' + (r() < .5 ? '5d7a4f' : '6f8a5a')); } },
    heliLZ(c, t) { sky(c, '#223a5e', '#7fa6c8'); houses(c, 410, 41, '#2d3447', 8, false); ground(c, 410, '#2f4a2c'); beam(c, 270 + Math.sin(t) * 30, 190, 300, 500, 90); heli(c, 270 + Math.sin(t) * 30, 170, 1.7, t); heli(c, 700, 120 + Math.sin(t * 1.3) * 8, 1, t + 1); for (let i = 0; i < 20; i++) { const r = rng(i + 50)(); circ(c, 140 + (i * 41) % 320 + r * 10, 470 + (i % 3) * 14, 7); c.fillStyle = ['#e8e8e8', '#9ec0ff', '#ffd0a0'][i % 3]; c.fill(); ink(c, 2); } },
    dawn(c, t) { sky(c, '#3b4f78', '#ffb36b'); circ(c, 480, 380, 110); c.fillStyle = '#ffe3a1'; c.fill(); ink(c, 4); houses(c, 420, 61, '#3a3340', 10, false); tower(c, 650, 420, 190, '#4a4150'); ground(c, 420, '#252a1f'); c.fillStyle = '#1c1f17'; c.fillRect(-40, 420, W + 80, 130); heli(c, 220 + t * 12 % 900, 130, .9, t); },
    burning(c, t) { sky(c, '#2a0c10', '#ff7a2f'); houses(c, 400, 71, '#1a0d10', 9, false); tower(c, 700, 400, 200, '#26141a'); fire(c, 250, 400, 2, t); fire(c, 520, 400, 1.6, t + 1); fire(c, 830, 400, 1.8, t + 2); ground(c, 400, '#150b0d'); for (let i = 0; i < 18; i++) { const r = rng(i + 3); c.fillStyle = 'rgba(255,200,100,.7)'; c.fillRect(r() * W, (r() * 300 - (t * 60) % 300 + 300) % 300, 3, 3); } c.fillStyle = 'rgba(20,10,10,.55)'; c.fillRect(0, 0, W, 90); },
    road(c, t) { sky(c, '#5a86b8', '#cfe3f0'); c.fillStyle = '#4f7a3a'; c.fillRect(-40, 300, W + 80, 240); c.fillStyle = '#4b4b4f'; c.beginPath(); c.moveTo(380, 300); c.lineTo(580, 300); c.lineTo(960, 540); c.lineTo(0, 540); c.closePath(); c.fill(); ink(c, 4); c.fillStyle = '#eee'; for (let i = 0; i < 6; i++) { const y = 320 + i * i * 6 + i * 14, w = 4 + i * 4; c.fillRect(480 - w / 2, y, w, 8 + i * 4); } for (const [x, y, s] of [[420, 420, 1.2], [520, 440, 1.4], [610, 470, 1.8]]) person(c, x, y, s, 'sol', t); heli(c, 760 - (t * 8 % 60), 120, .8, t); },
    blast(c, t) { SCENES.dawn(c, t); blast(c, 480, 300, 190, t); }
  };

  // ── Geschichten ───────────────────────────────────────────────────────
  const SEQ = {
    prologue: [
      { s: 'burning', img: 'img/comic/prologue_1.webp', cap: 'Wir waren nicht vorbereitet, als es passierte. Alles ging viel zu schnell und bevor wir reagieren konnten, waren die Menschen in der Unterzahl. Zuerst fielen die Großstädte. Schwärme Untoter quollen aus ihnen hervor und ergossen sich über das Land. Niemand wusste, woher die Seuche kam...' },
      { s: 'burning', img: 'img/comic/prologue_2.webp', cap: '...und niemand hatte die Zeit, die Ursache herauszufinden. Die Armee war überfordert, die Befehlsketten unterbrochen. Seit dem Fall von Berlin war der Kontakt zur Regierung abgebrochen. Rettungsteams kehrten nie mehr zurück.' },
      { s: 'squad', img: 'img/comic/prologue_3.webp', cap: 'Verzweifelt wurde lokale Verteidigung organisiert, um das zu schützen, was noch da war. Polizei und Armee kämpften Seite an Seite einen ungleichen Kampf...' },
      { s: 'horde', img: 'img/comic/prologue_4.webp', cap: '...gegen einen Feind, der keinen Schlaf benötigte, keine Erschöpfung und keine Angst kannte. Und während unsere Zahlen schrumpften, wuchs die Armee der Untoten von Tag zu Tag weiter an.' },
      { s: 'radio', img: 'img/comic/prologue_5.webp', cap: '', radio: true, bub: ['Unsere Linien im Osten wurden durchbrochen, die Zeds kommen direkt auf Sie zu. Evakuieren Sie sofort die Zivilisten und retten Sie so viele Sie können.', 36, 44, 440, 555, 222, { fs: 20, who: 'LEUTNANT (ÜBER FUNK)' }] },
      { s: 'bridgeNight', img: 'img/comic/prologue_6.webp', cap: '', radio: true, bub: ['Führen Sie sie über die Isarbrücke und halten Sie die Brücke unter allen Umständen. Wenn die Brücke fällt, fällt auch Moosburg. Sie und Ihre Einheiten sind die letzte Verteidigungslinie! Ihr Bestes wird diesmal nicht ausreichen!', 330, 34, 600, 325, 300, { fs: 20, radio: true, who: 'LEUTNANT (AUS DEM FUNKGERÄT)' }] }
    ],
    m1_win: [
      { s: 'heliLZ', cap: 'Die Brücke hielt. Rotor um Rotor trugen die Hubschrauber die Menschen aus der Gefahrenzone.' },
      { s: 'dawn', cap: 'Doch bei Sonnenaufgang kamen Meldungen aus der Innenstadt: Die Seuche war längst auch im Westen angekommen.' },
      { s: 'radio', cap: 'Neuer Einsatzbefehl.', bub: ['Alle überlebenden Kräfte nach Moosburg-Zentrum! Die Altstadt muss evakuiert werden!', 130, 60, 420, 300, 260] }
    ],
    m1_lose: [
      { s: 'burning', cap: 'Die Brücke fiel. Hinter dem Fluss breitete sich die Seuche aus.' },
      { s: 'squad', cap: 'Wer überlebte, sammelte sich neu. Moosburg war noch nicht verloren.', bub: ['Neu formieren. Wir gehen zurück in die Stadt.', 380, 90, 260, 360, 300] }
    ],
    m2_intro: [
      { s: 'burning', cap: 'Das Gewerbegebiet war nur der Anfang. Jetzt brennt Moosburg.' },
      { s: 'horde', cap: 'Von allen Seiten drängten sie in die Straßen.' },
      { s: 'radio', cap: 'Die Leitstelle gibt den Landeplatz bekannt.', bub: ['Hubschrauber sind unterwegs. Haltet die Straßen frei, rettet, wen ihr retten könnt!', 130, 60, 420, 300, 260] }
    ],
    m2_win: [
      { s: 'heliLZ', cap: 'Hunderte erreichten den Landeplatz. Die Hubschrauber flogen, bis der Treibstoff knapp wurde.' },
      { s: 'road', cap: 'Die Kolonne der Überlebenden zog nach Norden – Richtung Pfaffenhofen.' }
    ],
    m2_lose: [
      { s: 'burning', cap: 'Moosburg war nicht mehr zu halten. Die Überlebenden zogen sich nach Norden zurück.' },
      { s: 'road', cap: 'Pfaffenhofen sollte die letzte Linie werden.' }
    ],
    m3_intro: [
      { s: 'road', cap: 'Pfaffenhofen an der Ilm. Die Kolonne erreicht die Stadt im Morgengrauen.' },
      { s: 'dawn', cap: 'Hier gibt es einen Hubschrauberlandeplatz – und diesmal bleibt keine Zeit zum Zögern.' },
      { s: 'squad', cap: 'Die Einsatzkräfte stellen sich ein letztes Mal der Horde.', bub: ['Das ist unsere letzte Linie. Niemand kommt hier durch!', 380, 90, 260, 360, 300] }
    ],
    m3_win: [
      { s: 'blast', cap: 'Die Linie hielt. Der letzte Zug der Horde zerschellte an den Barrikaden.' },
      { s: 'heliLZ', cap: 'Die Überlebenden flogen in die Sicherheit. Die Geschichte endet hier – vorerst.' }
    ],
    m3_lose: [
      { s: 'burning', cap: 'Pfaffenhofen fiel. Wer konnte, floh weiter nach Süden.' },
      { s: 'horde', cap: 'Die Seuche ließ sich nicht aufhalten. Noch nicht.' }
    ]
  };

  // ── Wiedergabe ────────────────────────────────────────────────────────
  const TTS_FALLBACK = false, IMG_H = 640;
  let voiceOn = true; try { voiceOn = localStorage.getItem('zos_voice') !== '0'; } catch (e) {}
  let ov = null, raf = 0, vac = null;
  const imgs = {};
  const loadImg = src => { if (!imgs[src]) { const im = new Image(); imgs[src] = { im, ok: false }; im.onload = () => { imgs[src].ok = true; }; im.src = src; } return imgs[src]; };
  function radioChain(a) {   // Funk-Klang: Bandpass 400–3200 Hz, leichte Übersteuerung
    try {
      vac = vac || new (window.AudioContext || window.webkitAudioContext)();
      const src = vac.createMediaElementSource(a), hp = vac.createBiquadFilter(), lp = vac.createBiquadFilter(), ws = vac.createWaveShaper(), g = vac.createGain();
      hp.type = 'highpass'; hp.frequency.value = 400; lp.type = 'lowpass'; lp.frequency.value = 3200;
      const k = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 128 - 1; k[i] = Math.tanh(x * 2.2); } ws.curve = k; g.gain.value = 1.1;
      src.connect(hp); hp.connect(lp); lp.connect(ws); ws.connect(g); g.connect(vac.destination);
    } catch (e) {}
  }
  function speak(id, i, text, radio) {
    stopSpeak(); if (!voiceOn) return;
    const a = new Audio('audio/voice/' + id + '_' + (i + 1) + '.mp3'); let fell = false;
    const tts = () => { if (fell || !TTS_FALLBACK || !window.speechSynthesis) return; fell = true; const u = new SpeechSynthesisUtterance(text); u.lang = 'de-DE'; speechSynthesis.speak(u); };
    a.onerror = tts; if (radio) radioChain(a);
    if (typeof Music !== 'undefined') Music.duck(true);
    a.onended = () => { if (typeof Music !== 'undefined') Music.duck(false); };
    a.play().catch(tts); ov && (ov._audio = a);
  }
  function stopSpeak() { try { speechSynthesis.cancel(); } catch (e) {} if (ov && ov._audio) { try { ov._audio.pause(); } catch (e) {} ov._audio = null; } if (typeof Music !== 'undefined') Music.duck(false); }
  function play(id, done) {
    const seq = SEQ[id]; if (!seq) return done && done();
    if (typeof SFX !== 'undefined') SFX.resume();
    if (typeof Music !== 'undefined') Music.play('menu');
    for (const p of seq) if (p.img) loadImg(p.img);
    ov = document.createElement('div'); ov.id = 'comic';
    ov.innerHTML = `<div class="cwrap"><canvas width="${W}" height="${H}"></canvas><div class="ccap"></div>
      <div class="cbar"><button class="cv">${voiceOn ? '🗣 Sprache an' : '🗣 Sprache aus'}</button><span class="cn"></span><button class="cs">Überspringen</button><button class="cx big">Weiter ▶</button></div></div>`;
    document.body.appendChild(ov);
    const cv = ov.querySelector('canvas'), c = cv.getContext('2d'), cap = ov.querySelector('.ccap'), nn = ov.querySelector('.cn');
    let i = 0, t0 = performance.now(), typed = 0, full = '';
    const isImg = p => p.img && imgs[p.img] && imgs[p.img].ok;
    const show = () => { const p = seq[i]; full = p.cap; typed = 0; t0 = performance.now(); nn.textContent = (i + 1) + ' / ' + seq.length; speak(id, i, p.cap + (p.bub ? ' ' + p.bub[0] : ''), p.radio); };
    const finish = () => { cancelAnimationFrame(raf); stopSpeak(); ov.remove(); ov = null; done && done(); };
    const next = () => { if (typed < full.length) { typed = full.length; return; } if (++i >= seq.length) return finish(); show(); };
    const loop = () => {
      const t = (performance.now() - t0) / 1000, p = seq[i], img = isImg(p), ch = img ? IMG_H : H;
      if (cv.height !== ch) cv.height = ch;
      c.save(); c.clearRect(0, 0, W, ch); const z = 1 + .05 * Math.min(1, t / 10); c.translate(W / 2, ch / 2); c.scale(z, z); c.translate(-W / 2, -ch / 2);
      if (img) c.drawImage(imgs[p.img].im, 0, 0, W, ch); else SCENES[p.s](c, t);
      c.restore();
      if (p.bub && t > .6) { const [txt, x, y, w, tx, ty, o] = p.bub; bubble(c, x, y, w, txt, tx, ty, o || {}); }
      if (!img) halftone(c);
      c.lineWidth = 12; c.strokeStyle = INK; c.strokeRect(0, 0, W, ch);
      typed = Math.min(full.length, typed + .8); const tx = full.slice(0, typed | 0); if (cap.textContent !== tx) cap.textContent = tx;
      raf = requestAnimationFrame(loop);
    };
    ov.querySelector('.cx').onclick = next; ov.querySelector('.cs').onclick = finish;
    ov.querySelector('.cv').onclick = e => { voiceOn = !voiceOn; try { localStorage.setItem('zos_voice', voiceOn ? '1' : '0'); } catch (x) {} e.target.textContent = voiceOn ? '🗣 Sprache an' : '🗣 Sprache aus'; if (voiceOn) speak(id, i, seq[i].cap, seq[i].radio); else stopSpeak(); };
    ov.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); next(); } else if (e.key === 'Escape') finish(); });
    ov.tabIndex = 0; ov.focus(); show(); loop();
  }
  return { play, SEQ, SCENES, drawScene: (name, c, t) => SCENES[name](c, t) };
})();
