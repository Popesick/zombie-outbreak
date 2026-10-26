(async()=>{ const out={}; const q=new URLSearchParams(location.search); const mode=q.get('m')||'camp';
 try {
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  if (mode==='camp') { document.getElementById('mCamp').click(); closeModal(); const C=Campaign.state; for (const u of Campaign.UP) C.up[u.id]=u.p.length; C.trucks=1; Campaign.start(0); }
  else { document.getElementById('mSand').click(); document.getElementById('bStart').click(); }
  setSpeed(0); for(let i=0;i<30*200;i++) step(); cfg.pop=5000; mapMode='vec'; await wait(500);
  document.querySelector('.cat[data-cat="'+(q.get('c')||'air')+'"] .catbtn').click(); await wait(300);
  out.visible=[...document.querySelectorAll('#tools .tmenu.open button')].filter(b=>b.style.display!=='none').map(b=>b.textContent.trim()).join(' | ');
  out.cats=[...document.querySelectorAll('#tools .cat')].map(c=>c.dataset.cat+':'+c.style.display+':'+c.querySelector('.catbtn').classList.contains('rdy')).join(' ');
  document.querySelector('.tmenu.open button[data-tool="'+(q.get('t')||'strike')+'"]').click(); out.sel=toolSel; out.openAfter=document.querySelectorAll('.tmenu.open').length;
  if (q.get('shot')) { document.querySelector('.cat[data-cat="'+(q.get('c')||'air')+'"] .catbtn').click(); }
 } catch(e){ out.err=e.stack; }
 document.getElementById('__res').textContent=JSON.stringify(out); })();
