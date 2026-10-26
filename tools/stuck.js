(async()=>{ const out={}; const q=new URLSearchParams(location.search); const mis=+(q.get('m')||1), T=+(q.get('t')||600);
 try {
  
  document.getElementById('mCamp').click(); Campaign.start(mis); const G=window.__game; G.setSpeed(0);
  const snap=new Map(); const stuck=new Map(); let t0=performance.now();
  for(let s=1;s<=T*30;s++){ G.step();
    if(s%(30*20)===0){ for(const e of G.E){ if(e.dead||e.k>1)continue; const p=snap.get(e); const key=e;
        if(!p||Math.hypot(p.x-e.x,p.y-e.y)>2||e.st===4){snap.set(e,{x:e.x,y:e.y,t:s});}
        else if(s-p.t>=30*100){ stuck.set(e,{pl:e.path?e.path.length:null,pi:e.pi,bt:e.bt,tg:e.tgt&&e.tgt.ex?[e.tgt.ex|0,e.tgt.ey|0,e.tgt.occ.length,e.tgt.cap]:null,wt:e.wt,pt:e.pt,th:e.th,k:e.k,x:e.x|0,y:e.y|0,st:e.st,fz:e.fz,inc:e.inc,b:e.b,ev:!!G.S.evac,rush:!!G.S.rush,secs:(s-p.t)/30|0}); } } }
    if(performance.now()-t0>50000){out.cut=s/30;break;} }
  out.dbg=[]; const pick=[...stuck.keys()].filter(e=>!e.dead&&e.st!==6&&e.path).slice(0,4);
  for(const e of pick){  const nx=e.path[e.pi]; out.dbg.push({st:e.st,k:e.k,x:e.x,y:e.y,next:nx,path:e.path,pi:e.pi,tgt:e.tgt&&e.tgt.ex?[e.tgt.ex,e.tgt.ey]:null});
    const l=[]; for(let i=0;i<6;i++){ G.step(); l.push([e.x.toFixed(2),e.y.toFixed(2),e.st,e.pi,e.bt.toFixed(2),!!e.path,e.dead].join(' ')); } out.dbg.push(l); out.dbg.push(window.__dbgL.slice(0,3)); }
  const c=G.counts(); out.counts=c; out.simT=G.S&&0; out.stuckN=[...stuck.values()].filter(v=>G.E.some(()=>true)).length;
  out.stuck=[...stuck.entries()].filter(([e])=>!e.dead).filter(([e,v])=>v.st!==6).slice(0,14).map(([e,v])=>v);
  out.far6=[...stuck.entries()].filter(([e])=>!e.dead&&e.st===6).map(([e])=>Math.hypot(e.x-G.S.evac.x,e.y-G.S.evac.y)|0).sort((a,b)=>b-a).slice(0,10); out.civStuck=[...stuck.entries()].filter(([e])=>!e.dead&&e.k===0).length; out.zomStuck=[...stuck.entries()].filter(([e])=>!e.dead&&e.k===1).length;
 } catch(e){ out.err=e.stack; }
 document.getElementById('__res').textContent=JSON.stringify(out); })();
