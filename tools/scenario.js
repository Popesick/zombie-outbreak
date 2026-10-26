(async()=>{ const out={};
 try {
  const files=['intro','anxious_waiting_0','anxious_waiting_1','anxious_waiting_2','anxious_waiting_3'];
  out.dur=await Promise.all(files.map(f=>new Promise(r=>{ const a=new Audio('audio/music/'+f+'.mp3'); a.preload='metadata'; a.onloadedmetadata=()=>r(f+':'+Math.round(a.duration)); a.onerror=()=>r(f+':ERR'); setTimeout(()=>r(f+':timeout'),8000); })));
  document.getElementById('mSand').click(); document.getElementById('bStart').click(); setSpeed(0);
  out.btn=document.getElementById('bMus').textContent; document.getElementById('bMus').click(); out.btn2=document.getElementById('bMus').textContent; document.getElementById('bMus').click(); document.getElementById('bMus').click();
  out.lvl=Music.level();
 } catch(e){ out.err=e.stack; }
 document.getElementById('__res').textContent=JSON.stringify(out); })();
