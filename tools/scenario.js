(async()=>{ const out={};
 try {
  document.getElementById('mCamp').click(); closeModal(); Campaign.state.next=1;
  Campaign.start(1); setSpeed(0);
  const c0=counts(); out.start={civ:c0.civ,zom:c0.zom,units:E.filter(friendly).length,map:curMap,pad:S.pad,padType:type[cellIdx(S.pad.x,S.pad.y)],cap:RULES.evacCap};
  out.unitTypes=E.filter(friendly).map(u=>type[cellIdx(u.x,u.y)]).join('');
  const log=[]; for(let k=0;k<10;k++){ for(let i=0;i<30*60;i++) step(); const c=counts(); log.push(fmtClock(simT)+' z'+c.zom+' civ'+c.civ+' ev'+S.ev.civ+' ulost'+(S.ulost||0)+' spawned'+S.spawned); }
  out.log=log;
 } catch(e){ out.err=e.stack; }
 document.getElementById('__res').textContent=JSON.stringify(out); })();
