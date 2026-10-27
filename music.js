'use strict';
/* Hintergrundmusik: Menü/Story ('menu'), Ingame ('game'); 'combat', 'hope' (Evakuierung/Sieg) und 'defeat' (Niederlage, einmalig).
   Überblendung per Lautstärkerampe; Start erst nach der ersten Nutzeraktion (Autoplay-Regeln der Browser). */
const Music = (() => {
  const SETS = {
    menu: { files: ['audio/music/intro.mp3'], loop: true },
    game: { files: [0, 1, 2, 3].map(i => 'audio/music/anxious_waiting_' + i + '.mp3'), shuffle: true },
    combat: { files: [0, 1, 2, 3].map(i => 'audio/music/relentless_drive_' + i + '.mp3'), shuffle: true },
    hope: { files: ['audio/music/relieved_drive.mp3'], once: true },
    defeat: { files: ['audio/music/signal_fades.mp3'], once: true }
  };
  const BASE = .5, FADE = 2.5;
  let level = 1; try { const v = localStorage.getItem('zos_music'); if (v !== null && !isNaN(+v)) level = +v; } catch (e) {}
  let set = null, cur = null, last = -1, blocked = false;
  const fades = new Set();
  let duckF = 1;
  const vol = () => level * BASE * duckF;
  function tick() {
    for (const f of fades) {
      f.t += .05; const k = Math.min(1, f.t / FADE);
      f.a.volume = Math.max(0, Math.min(1, (f.from + (f.to - f.from) * k) * (f.rel ? vol() : 1)));
      if (k >= 1) { fades.delete(f); if (f.to === 0) { f.a.pause(); f.a.src = ''; } }
    }
    if (cur && !cur.loop && !(SETS[set] && SETS[set].once) && cur.duration && cur.duration - cur.currentTime < FADE + .2 && !cur._next) { cur._next = true; next(true); }
  }
  setInterval(tick, 50);
  function ramp(a, from, to) { for (const f of fades) if (f.a === a) fades.delete(f); fades.add({ a, from, to, t: 0, rel: true }); }
  function pick(s) {
    const n = s.files.length; if (!n) return null;
    let i = s.shuffle ? Math.floor(Math.random() * n) : (last + 1) % n;
    if (s.shuffle && n > 1 && i === last) i = (i + 1) % n;
    last = i; return s.files[i];
  }
  function next(cross) {
    const s = SETS[set]; if (!s) return; const file = pick(s); if (!file) return;
    const old = cur, a = new Audio(file); a.loop = !!s.loop; a.volume = 0; cur = a;
    a.addEventListener('ended', () => { if (cur === a && !s.once && !s.loop) next(false); else if (cur === a && s.once) { set = null; cur = null; } });
    const p = a.play();
    if (p && p.catch) p.catch(() => { blocked = true; });
    ramp(a, 0, 1);
    if (old) ramp(old, 1, 0);
  }
  return {
    play(name) {
      if (name === set || !SETS[name] || !SETS[name].files.length) return;
      set = name; last = -1; next(true);
    },
    resume() { if (blocked && cur) { blocked = false; cur.play().catch(() => { blocked = true; }); } else if (!cur && set) next(false); },
    duck(on) { duckF = on ? .35 : 1; if (cur) cur.volume = vol(); },
    level: () => level,
    current: () => set,
    cycle() { level = level === 1 ? .5 : level === .5 ? 0 : 1; try { localStorage.setItem('zos_music', level); } catch (e) {} for (const f of fades) fades.delete(f); if (cur) cur.volume = vol(); return level; }
  };
})();
