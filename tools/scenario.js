(async()=>{ const out={};
 try {
  document.getElementById('mSand').click(); out.setupVisible=document.getElementById('setup').style.display;
  document.getElementById('pop').value=500; document.getElementById('pop').dispatchEvent(new Event('input'));
  document.getElementById('bStart').click(); setSpeed(0);
  for(let i=0;i<30*90;i++) step();
  out.c=counts(); out.mode=RULES.mode; out.curMap=curMap;
  cfg.pop=2000; useTool('evac',900,1100); useTool('strike',1000,1000); useTool('supply',900,900); useTool('garrison',800,800);
  for(let i=0;i<30*60;i++) step();
  updateHud(); out.tools=[...document.querySelectorAll('#tools button')].filter(b=>b.style.display!=='none').map(b=>b.dataset.tool).join(',');
  out.objs=document.getElementById('objs').style.display;
  saveSlot(2); loadSlot(2); out.after=counts();
  toMenu(); out.menu=document.getElementById('menu').style.display;
 } catch(e){ out.err=e.stack; }
 document.getElementById('__res').textContent=JSON.stringify(out); })();
