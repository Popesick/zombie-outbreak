(async()=>{ const out={}; try {
  Object.assign(cfg,{pop:300,inf0:20,police:4,mil:4,zs:30}); newSim(); startRun(true); setSpeed(0);
  // plan 3 barricades on a road
  const road=MD.roads.find(r=>r.c>=3&&r.p.length>=8); const x=road.p[0],y=road.p[1];
  for(let i=0;i<3;i++) useTool('barricade', x+i*30, y, x+i*30+30, y+10);
  out.plans=S.plans.length; out.used=barUsed();
  // exceed limit
  for(let i=0;i<30;i++) useTool('barricade', 100+i*40, 100, 100+i*40+45, 100);
  out.usedAfter=barUsed(); out.limit=RULES.barLimit;
  const before=BAR.filter(Boolean).length;
  commitBuild();
  for(let i=0;i<30*29;i++) step(); out.bar29=BAR.filter(Boolean).length;
  for(let i=0;i<30*40;i++) step(); out.heli=fx.filter(f=>f.kind==='build').length;
  for(let i=0;i<30*60;i++) step(); out.barDone=BAR.filter(Boolean).length; out.plansLeft=S.plans.length; out.helis=fx.filter(f=>f.kind==='build').length;
  // demolish without unit near
  const b=BAR.find(Boolean); E.filter(friendly).forEach(u=>{u.x=5;u.y=5;}); useTool('demolish',b.x,b.y); out.afterDemFar=BAR.filter(Boolean).length;
  const u=E.find(friendly); u.x=b.x+10; u.y=b.y; useTool('demolish',b.x,b.y); out.afterDemNear=BAR.filter(Boolean).length;
} catch(e){ out.err=e.stack; }
document.getElementById('__res').textContent=JSON.stringify(out); })();
