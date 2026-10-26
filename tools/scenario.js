(async()=>{ const out={};
 try {
  Object.assign(cfg,{pop:300,inf0:150,police:6,mil:8,zs:60});
  document.getElementById('mSand').click(); document.getElementById('bStart').click(); setSpeed(1);
  out.start=Music.current();
  const seq=[];
  for(let k=0;k<60;k++){ for(let i=0;i<30*3;i++) step(); musicDirector(); musicDirector(); musicDirector(); musicDirector(); musicDirector(); if(k%6===5) seq.push(Math.round(simT)+':'+Music.current()+':'+hotT.toFixed(1)+':z'+counts().zom); }
  out.seq=seq.join(' ');
 } catch(e){ out.err=e.stack; }
 document.getElementById('__res').textContent=JSON.stringify(out); })();
