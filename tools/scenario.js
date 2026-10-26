(async()=>{ const out={};
 try {
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  out.dur=await Promise.all([1,2,3,4,5].map(n=>new Promise(r=>{ const a=new Audio('audio/voice/prologue_'+n+'.mp3'); a.onloadedmetadata=()=>r(n+':'+a.duration.toFixed(1)); a.onerror=()=>r(n+':ERR'); setTimeout(()=>r(n+':timeout'),6000); })));
  document.getElementById('menu').remove();
  Comic.play('prologue', ()=>{}); await wait(1500);
  out.panel=document.querySelector('#comic .cn').textContent; out.cap=document.querySelector('#comic .ccap').textContent.length;
 } catch(e){ out.err=e.stack; }
 document.getElementById('__res').textContent=JSON.stringify(out); })();
