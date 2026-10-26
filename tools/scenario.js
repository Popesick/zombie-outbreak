(async()=>{ const out={};
 try {
  document.getElementById('mCamp').click(); closeModal();
  Campaign.state.up.mines=2; Campaign.start(0); setSpeed(0);
  out.max=RULES.tools.mines.max;
  E.filter(e=>e.k===K_ZOM).forEach(z=>z.dead=true); E=E.filter(e=>!e.dead);
  useTool('mines', 600, 450); out.fx=fx.length;
  for(let i=0;i<30*60;i++) { step(); }
  out.mines=S.mines.length;
  // zombie auf eine Mine setzen
  const m0=S.mines[0]; const z=spawnZombie(m0.x,m0.y); z.st=0; z.wt=99;
  const near=E.filter(e=>!e.dead&&Math.hypot(e.x-m0.x,e.y-m0.y)<7).length;
  // zweite Mine im Radius: soll nicht explodieren
  const inRad=S.mines.filter(m=>Math.hypot(m.x-m0.x,m.y-m0.y)<7).length;
  for(let i=0;i<20;i++) step(); out.trig=S.mines.some(m=>m.t!=null);
  for(let i=0;i<40;i++) step();
  out.afterBlast={zDead:z.dead, minesLeft:S.mines.length, inRadBefore:inRad, killsNear:near, kills:S.kills};
  // zweite Explosion nicht durch Kette: wie viele Minen im Radius sind noch da?
  out.stillInRad=S.mines.filter(m=>Math.hypot(m.x-m0.x,m.y-m0.y)<7).length;
 } catch(e){ out.err=e.stack; }
 document.getElementById('__res').textContent=JSON.stringify(out); })();
