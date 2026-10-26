(async()=>{ const out={}; const q=new URLSearchParams(location.search); const w=+(q.get('w')||2000), pn=+(q.get('p')||5);
 try {
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  document.getElementById('menu').remove(); setSpeed(0);
  Comic.play('prologue', ()=>{}); await wait(400);
  document.querySelector('#comic .cv').click();   // Sprache aus: kein Autoweiter
  for(let g=0;g<30 && document.querySelector('#comic .cn').textContent!==(pn+1)+' / 6'; g++){ document.querySelector('#comic .cx').click(); await wait(60); }
  await wait(w); out.panel=document.querySelector('#comic .cn').textContent;
 } catch(e){ out.err=e.stack; }
 document.getElementById('__res').textContent=JSON.stringify(out); })();
