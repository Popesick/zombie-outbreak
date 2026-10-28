'use strict';
/* Synthetische Soundeffekte (Web Audio, keine Audiodateien). Lautstärke und Panning folgen der Kamera. */
const SFX = (() => {
  let ac = null, master = null, nbuf = null, active = 0, paused = false, level = 1, heli = null;
  const lastT = {};
  try { const v = localStorage.getItem('zos_sound'); if (v !== null && !isNaN(+v)) level = +v; } catch (e) {}
  const cl = (v, a, b) => v < a ? a : v > b ? b : v;
  function init() {
    if (ac) return true;
    try {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return false;
      ac = new C(); master = ac.createGain(); master.gain.value = level;
      const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
      nbuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = nbuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; return false; }
    return true;
  }
  function resume() { if (init() && ac.state === 'suspended') ac.resume(); }
  const ok = (key, gap) => { const t = performance.now(); if (t - (lastT[key] || 0) < gap) return false; lastT[key] = t; return true; };
  const live = () => ac && level > 0 && !paused && ac.state === 'running';
  function sp(x, y, far = 1) {
    if (!live()) return null;
    const dx = x - cam.x, dy = y - cam.y, d = Math.hypot(dx, dy), ref = Math.max(120, VW / cam.z * .6) * far;
    const g = Math.pow(cl(ref / (ref + d * 1.5), 0, 1), 1.2); if (g < .03) return null;
    return [g, cl(dx / (VW / cam.z / 2 + 1), -1, 1) * .8];
  }
  function out(pan) { if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; p.connect(master); return p; } return master; }
  function voice(dur) { if (active >= 28) return false; active++; setTimeout(() => active--, dur * 1000 + 80); return true; }
  function noise(dur) { const s = ac.createBufferSource(); s.buffer = nbuf; s.start(ac.currentTime, Math.random() * .5, dur); return s; }
  function filt(type, f, q = 1) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  function env(amp, dur, o) { const g = ac.createGain(), t = ac.currentTime; g.gain.setValueAtTime(amp, t); g.gain.exponentialRampToValueAtTime(.001, t + dur); g.connect(o); return g; }
  function tone(type, f0, f1, dur, amp, o) {
    const t = ac.currentTime, os = ac.createOscillator(); os.type = type; os.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) os.frequency.exponentialRampToValueAtTime(f1, t + dur);
    os.connect(env(amp, dur, o)); os.start(t); os.stop(t + dur + .02); return os;
  }
  return {
    resume,
    setPaused(p) { paused = p; if (heli) heli.out.gain.value = p ? 0 : heli.out.gain.value; },
    level: () => level,
    setLevel(v) { level = v; try { localStorage.setItem('zos_sound', level); } catch (e) {} if (master) master.gain.value = level; resume(); },
    cycle() { level = level > .5 ? .5 : level > 0 ? 0 : 1; try { localStorage.setItem('zos_sound', level); } catch (e) {} if (master) master.gain.value = level; resume(); return level; },
    shot(x, y, kind) {
      const s = sp(x, y); if (!s || !ok('shot' + kind, kind === 'mg' ? 70 : 35) || !voice(.3)) return;
      const o = out(s[1]), rifle = kind === 'rifle', amp = s[0] * (rifle ? .5 : .35);
      const n = noise(.3), bp = filt('bandpass', kind === 'pistol' ? 1700 : rifle ? 1000 : kind === 'mg' ? 1400 : 2000, .7);
      n.connect(bp); bp.connect(env(amp, kind === 'mg' ? .07 : rifle ? .22 : .14, o));
      if (kind !== 'mg') tone('sine', 150, 40, .13, amp * .8, o);
    },
    boom(x, y) {
      const s = sp(x, y, 3); if (!s || !voice(1.8)) return;
      const o = out(s[1]), t = ac.currentTime, n = noise(1.8), lp = filt('lowpass', 1000);
      lp.frequency.setValueAtTime(1000, t); lp.frequency.exponentialRampToValueAtTime(60, t + 1.6);
      n.connect(lp); lp.connect(env(Math.max(.35, s[0]), 1.7, o)); tone('sine', 75, 28, 1.2, Math.max(.35, s[0]) * .9, o);
    },
    whistle(x, y) { const s = sp(x, y, 3); if (!s || !voice(1.3)) return; tone('sine', 1700, 450, 1.2, s[0] * .1, out(s[1])); },
    jet(x, y) {
      const s = sp(x, y, 4); if (!s || !voice(3)) return;
      const o = out(s[1]), t = ac.currentTime, n = noise(3), bp = filt('bandpass', 300, 1.2);
      bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 1.2); bp.frequency.exponentialRampToValueAtTime(300, t + 3);
      n.connect(bp); const g = ac.createGain(); g.gain.setValueAtTime(.001, t); g.gain.linearRampToValueAtTime(s[0] * .3, t + 1.2); g.gain.linearRampToValueAtTime(.001, t + 3); bp.connect(g); g.connect(o);
    },
    chime(x, y) { const s = sp(x, y, 3); if (!s || !voice(.8)) return; const o = out(s[1]), a = Math.max(.12, s[0] * .2); tone('sine', 880, 880, .3, a, o); setTimeout(() => { if (ac) tone('sine', 1320, 1320, .45, a, o); }, 160); },
    alarm() { if (!live() || !ok('alarm', 1500)) return; for (let i = 0; i < 4; i++) setTimeout(() => { if (ac) tone('square', i % 2 ? 880 : 660, i % 2 ? 880 : 660, .16, .06, master); }, i * 190); },
    bite(x, y) { const s = sp(x, y); if (!s || !ok('bite', 120) || !voice(.2)) return; const o = out(s[1]); const n = noise(.15), lp = filt('lowpass', 600); n.connect(lp); lp.connect(env(s[0] * .22, .13, o)); },
    scream(x, y) { const s = sp(x, y); if (!s || !ok('scream', 450) || !voice(.5)) return; const o = out(s[1]), t = ac.currentTime, os = ac.createOscillator(), bp = filt('bandpass', 1300, 3); os.type = 'sawtooth'; os.frequency.setValueAtTime(600, t); os.frequency.linearRampToValueAtTime(1050, t + .12); os.frequency.linearRampToValueAtTime(450, t + .4); os.connect(bp); bp.connect(env(s[0] * .1, .4, o)); os.start(t); os.stop(t + .45); },
    groan(x, y) { const s = sp(x, y); if (!s || !ok('groan', 250) || !voice(.8)) return; const o = out(s[1]), t = ac.currentTime, os = ac.createOscillator(), lp = filt('lowpass', 420, 2), lfo = ac.createOscillator(), lg = ac.createGain(); os.type = 'sawtooth'; os.frequency.setValueAtTime(90 + Math.random() * 30, t); os.frequency.exponentialRampToValueAtTime(55, t + .7); lfo.frequency.value = 5 + Math.random() * 3; lg.gain.value = 7; lfo.connect(lg); lg.connect(os.frequency); os.connect(lp); lp.connect(env(s[0] * .1, .75, o)); os.start(t); lfo.start(t); os.stop(t + .8); lfo.stop(t + .8); },
    siren(x, y, up) { if (SFX.sirenOff) return; const s = sp(x, y); if (!s || !voice(.3)) return; const o = out(s[1]); tone('sawtooth', up ? 520 : 940, up ? 940 : 520, .5, Math.max(.04, s[0] * .3), o); },
    thud(x, y) { const s = sp(x, y); if (!s || !voice(.3)) return; const o = out(s[1]); tone('sine', 130, 45, .2, Math.max(.2, s[0] * .5), o); const n = noise(.15), lp = filt('lowpass', 500); n.connect(lp); lp.connect(env(s[0] * .3, .12, o)); },
    engine(x, y) { const s = sp(x, y, 2); if (!s || !voice(1)) return; const o = out(s[1]), t = ac.currentTime, os = ac.createOscillator(), lp = filt('lowpass', 220); os.type = 'sawtooth'; os.frequency.setValueAtTime(50, t); os.frequency.linearRampToValueAtTime(75, t + .9); os.connect(lp); lp.connect(env(Math.max(.1, s[0] * .25), 1, o)); os.start(t); os.stop(t + 1); },
    ui() { if (!live() || !ok('ui', 60)) return; tone('sine', 520, 700, .07, .09, master); },
    end(good) { if (!live()) return; const f = good ? [523, 659, 784, 1046] : [220, 185, 147, 110]; f.forEach((x, i) => setTimeout(() => { if (ac) tone('triangle', x, x, .5, .15, master); }, i * 260)); },
    // Dauerton der Hubschrauber (Rotor): pos = Liste {x, y} der Hubschrauber
    ambient(pos) {
      if (!ac) return;
      if (!heli && pos.length && live()) {
        const src = ac.createBufferSource(); src.buffer = nbuf; src.loop = true;
        const lp = filt('lowpass', 320), am = ac.createGain(), lfo = ac.createOscillator(), lg = ac.createGain(), og = ac.createGain(), pn = ac.createStereoPanner ? ac.createStereoPanner() : null;
        am.gain.value = .55; lfo.frequency.value = 13; lg.gain.value = .45; lfo.connect(lg); lg.connect(am.gain);
        src.connect(lp); lp.connect(am); am.connect(og); og.gain.value = 0; if (pn) { og.connect(pn); pn.connect(master); } else og.connect(master);
        src.start(); lfo.start(); heli = { out: og, pan: pn };
      }
      if (!heli) return;
      let best = 0, pan = 0;
      if (live()) for (const p of pos) { const s = sp(p.x, p.y, 2); if (s && s[0] > best) { best = s[0]; pan = s[1]; } }
      heli.out.gain.setTargetAtTime(best * .3, ac.currentTime, .15); if (heli.pan) heli.pan.pan.value = pan;
    }
  };
})();
