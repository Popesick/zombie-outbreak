(async()=>{ const out={};
 try {
  document.getElementById('mCamp').click(); closeModal(); Campaign.start(0); setSpeed(0);
  const st=Campaign.MIS[0].start();
  out.rawTypes=[...st.sol,...st.pol].map(p=>type[cellIdx(p.x,p.y)]);   // 2 = Gebäude
  out.unitTypes=E.filter(friendly).map(u=>type[cellIdx(u.x,u.y)]+'/'+comp[cellIdx(u.x,u.y)]).join(' ');
  E.filter(e=>e.k===K_ZOM).forEach(z=>z.dead=true);
  const pol=E.filter(e=>e.k===K_POL); const p0=pol.map(u=>[u.x,u.y]);
  pol.forEach(u=>selected.add(u)); commandMove(pol[0].x+120, pol[0].y+60);
  for(let i=0;i<30*20;i++) step();
  out.moved=pol.map((u,i)=>Math.round(Math.hypot(u.x-p0[i][0],u.y-p0[i][1])));
  out.ord=pol.map(u=>u.ord+':'+(!!u.path)).join(' ');
 } catch(e){ out.err=e.stack; }
 document.getElementById('__res').textContent=JSON.stringify(out); })();
