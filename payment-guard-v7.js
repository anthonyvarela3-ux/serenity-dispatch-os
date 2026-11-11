/* Serenity v7 PAYMENT PROTECTION — local foreground status watchdog.
   Persistent "Arrived but not boarded" alerts after 30m. Optional GPS departure
   alert requires driver permission, a pickup-origin fix and two distant fixes.
   Never changes official RoutingBox status or invents a passenger event. */
(()=>{
'use strict';
if(typeof db==='undefined'||typeof render!=='function'||!window.SerenityEvents||!window.SerenityPages)return;
const E=id=>document.getElementById(id);
const localDate=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const options={limitMs:30*60000,snoozeMs:10*60000,maxAccuracy:80,leaveMeters:400};
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const isOpen=r=>r&&!['Completed','Exception'].includes(r.status);
const validEvent=x=>!!(x&&Number.isFinite(new Date(x).getTime()));
const meters=(a,b)=>{
 const rad=Math.PI/180,lat1=a.lat*rad,lat2=b.lat*rad,dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad;
 const q=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(q),Math.sqrt(Math.max(0,1-q)));
};
const settings=()=>db.paymentProtection||{};
const savedPins=()=>db.guardPins||(db.guardPins={});
const departed=()=>db.guardDeparted||(db.guardDeparted={});
const snoozes=()=>db.guardSnooze||(db.guardSnooze={});
let watchId=null,lastFix=null,lastHeadline='',alarmContext=null,lastRiskHash='',lastSound=0;
const progress=new Map();
function assess(r,at=Date.now()){
 // Old open trips can be reviewed historically without triggering
 // today's foreground emergency alarm.
 if(!r||r.date!==localDate(new Date(at)))return null;
 if(!isOpen(r)||!validEvent(r.events?.arrived)||validEvent(r.events?.boarded))return null;
 const age=at-new Date(r.events.arrived).getTime();
 if(age<0)return null;
 const left=departed()[r.id];
 const exceeded=age>=options.limitMs;
 if(!left&&!exceeded)return null;
 const snoozedUntil=Number(snoozes()[r.id]?.until)||0;
 return {runId:r.id,ageMinutes:Math.floor(age/60000),
  cause:left?'possible_departure':'over_30_minutes',
  distance:typeof left?.distanceMeters==='number'?Math.round(left.distanceMeters):null,
  snoozed:snoozedUntil>at,until:snoozedUntil,
  enteredAt:r.events.arrived};
}
function risks(at=Date.now()){
 const day=E('date')?.value;
 return db.runs.filter(r=>r.date===day).map(r=>assess(r,at)).filter(Boolean)
 .sort((a,b)=>(a.snoozed===b.snoozed?0:a.snoozed?1:-1)||
 (a.cause==='possible_departure'?-1:1)-(b.cause==='possible_departure'?-1:1)||
 b.ageMinutes-a.ageMinutes);
}
function capturePickupFix(r,fix){
 if(!settings().gps||!isOpen(r)||!validEvent(r.events?.arrived)||validEvent(r.events?.boarded))return;
 if(savedPins()[r.id]||!fix||fix.accuracy>options.maxAccuracy||Date.now()-fix.at>30000)return;
 const delta=Date.now()-new Date(r.events.arrived).getTime();
 // A late GPS fix might be far from the pickup; never create a fake
 // origin location after the driver has already been away.
 if(delta<0||delta>90*1000)return;
 savedPins()[r.id]={lat:fix.lat,lon:fix.lon,at:fix.at,accuracy:fix.accuracy,
  runDate:r.date,arrivalAt:r.events.arrived};
 save();
}
function onPosition(position){
 const x=position.coords,now=Date.now();
 if(!x||!Number.isFinite(x.latitude)||!Number.isFinite(x.longitude)||!Number.isFinite(x.accuracy))return;
 if(x.accuracy>options.maxAccuracy)return;
 lastFix={lat:x.latitude,lon:x.longitude,accuracy:x.accuracy,at:now};
 const day=E('date')?.value;
 for(const r of db.runs.filter(r=>r.date===day&&isOpen(r)&&validEvent(r.events?.arrived)&&!validEvent(r.events?.boarded))){
  capturePickupFix(r,lastFix);
  const pin=savedPins()[r.id];
  if(!pin||pin.arrivalAt!==r.events.arrived||pin.runDate!==day||departed()[r.id])continue;
  // Require observations separated in time to avoid noisy single GPS jumps.
  const dist=meters(pin,lastFix);
  if(dist<=options.leaveMeters){
   progress.delete(r.id);continue;
  }
  const prev=progress.get(r.id);
  if(!prev){progress.set(r.id,{count:1,at:now,distance:dist});continue}
  if(now-prev.at<5000)continue;
  const count=prev.count+1;
  if(count>=2){
   departed()[r.id]={at:new Date().toISOString(),distanceMeters:dist,
    reason:'two_confirmed_distant_gps_fixes'};
   progress.delete(r.id);save();tick();
  }else progress.set(r.id,{count,at:now,distance:dist});
 }
 updateSettings();
}
function onGeoError(err){
 E('v7-guard-gps-state').textContent='Location unavailable: '+(err?.message||'permission or device error')+
 '. The 30-minute in-app status check still works when this page is active.';
 // Do not repeatedly request permission after a denial.
 if(err?.code===1){
  stopGps();db.paymentProtection={...settings(),gps:false};save();
 }
 updateSettings();
}
function startGps(){
 if(watchId!==null||!navigator.geolocation)return;
 try{
  watchId=navigator.geolocation.watchPosition(onPosition,onGeoError,
   {enableHighAccuracy:true,maximumAge:10000,timeout:20000});
 }catch(e){onGeoError(e)}
}
function stopGps(){
 if(watchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(watchId);
 watchId=null;progress.clear();updateSettings();
}
function beep(){
 if(!settings().sound||document.hidden||Date.now()-lastSound<3*60000)return;
 lastSound=Date.now();
 try{
  const C=window.AudioContext||window.webkitAudioContext;
  if(!C)return;
  alarmContext=alarmContext||new C();
  const play=()=>{
   const start=alarmContext.currentTime;
   [0,.22].forEach(delay=>{
    const osc=alarmContext.createOscillator(),gain=alarmContext.createGain();
    osc.type='sine';osc.frequency.setValueAtTime(640,start+delay);
    gain.gain.setValueAtTime(.0001,start+delay);
    gain.gain.exponentialRampToValueAtTime(.16,start+delay+.025);
    gain.gain.exponentialRampToValueAtTime(.0001,start+delay+.15);
    osc.connect(gain);gain.connect(alarmContext.destination);
    osc.start(start+delay);osc.stop(start+delay+.17);
   });
  };
  if(alarmContext.state==='suspended')alarmContext.resume().then(play).catch(()=>{});
  else play();
 }catch{}
 if(navigator.vibrate)try{navigator.vibrate([180,80,180])}catch{}
}
const settingsCard=document.createElement('section');settingsCard.id='v7-guard-settings';settingsCard.className='v7-guard-settings';
settingsCard.innerHTML='<div class="v7-tile-head"><h3>Payment Protection</h3><span class="v7-eyebrow">FORGOTTEN STATUS WATCHDOG</span></div>'+
 '<p>If a run stays <b>Arrived</b> without <b>Boarded</b> for 30 minutes, Serenity flags it. An optional permissioned movement check can warn sooner if your vehicle drives away.</p>'+
 '<div class="v7-guard-buttons"><button id="v7-toggle-gps" type="button">Enable movement alerts</button>'+
 '<button id="v7-toggle-sound" type="button">Enable optional sound</button></div>'+
 '<p id="v7-guard-gps-state" class="v7-explain">Status monitoring works while this page is active, even without GPS.</p>'+
 '<p class="v7-explain">IMPORTANT: Closing/locking this iPad or switching apps can suspend location, alarms and timers. No background alert is guaranteed. Serenity cannot verify official RoutingBox coding or payment.</p>';
const essentials=E('v7-essentials');
if(essentials)essentials.after(settingsCard);
const host=E('v7-alert-host');
const title=document.title;
function updateSettings(){
 const gps=!!settings().gps,sound=!!settings().sound;
 E('v7-toggle-gps').textContent=gps?'Turn off movement alerts':'Enable movement alerts';
 E('v7-toggle-sound').textContent=sound?'Turn off sound':'Enable optional sound';
 if(gps)E('v7-guard-gps-state').textContent=watchId!==null?
  'GPS movement check ON while Serenity is open. Two reliable fixes farther than 400m from the recorded pickup can raise a warning.':
  'GPS enabled but not currently receiving location. The 30-minute timer remains in effect.';
 else E('v7-guard-gps-state').textContent='GPS movement check off. The 30-minute in-app Arrived-status alert still works while Serenity is open.';
}
function showRisk(risk){
 const r=db.runs.find(x=>x.id===risk.runId);
 if(!r)return;
 const day=E('date').value;
 const index=db.runs.filter(x=>x.date===day).sort((a,b)=>timeM(a.pu)-timeM(b.pu)).findIndex(x=>x.id===r.id)+1;
 const isMove=risk.cause==='possible_departure';
 const headline=isMove?'POSSIBLE DRIVE-AWAY WITH STATUS STILL ARRIVED':
  'PAYMENT AT RISK — ARRIVED STATUS NOT UPDATED';
 const message=isMove?
  'Location suggests your vehicle moved ~'+(risk.distance??'?')+'m from the recorded pickup. Boarding is not recorded. Verify immediately; GPS can be inaccurate.':
  'Arrived '+risk.ageMinutes+' minutes ago, but no boarding event is recorded. If the rider is still waiting, record that. If they boarded or the trip ended, check the real events and the official app.';
 host.innerHTML='<div class="v7-urgent" role="alert"><div class="v7-urgent-icon">!</div>'+
 '<div class="v7-urgent-copy"><strong>'+headline+'</strong>'+
 '<p>Run #'+index+' · '+esc(r.name)+' · '+esc(message)+'</p>'+
 '<small>Correct local events and verify coding in RoutingBox. Recording here alone does not secure payment.</small></div>'+
 '<div class="v7-urgent-actions"><button type="button" class="primary" data-v7-guard="open" data-id="'+esc(r.id)+'">Open run</button>'+
 '<button type="button" data-v7-guard="board" data-id="'+esc(r.id)+'">Boarded now</button>'+
 '<button type="button" data-v7-guard="wait" data-id="'+esc(r.id)+'">Still waiting · 10m</button>'+
 '<button type="button" data-v7-guard="exception" data-id="'+esc(r.id)+'">Review exception</button></div></div>';
 if(lastHeadline!==risk.runId+':'+risk.cause){
  beep();lastHeadline=risk.runId+':'+risk.cause;
 }
 document.title='⚠ Status check · '+title;
}
function tick(){
 if(!host)return;
 const all=risks(),active=all.filter(r=>!r.snoozed);
 if(!active.length){
  if(all.length){
   host.innerHTML='<div class="v7-snoozed"><b>'+all.length+' pickup status check(s) acknowledged as still waiting.</b> Reminders will resume in 10 minutes unless the trip advances.</div>';
  }else host.innerHTML='';
  document.title=title;lastHeadline='';return;
 }
 const risk=active[0],hash=risk.runId+':'+risk.cause+':'+risk.ageMinutes;
 if(hash!==lastRiskHash){
  showRisk(risk);lastRiskHash=hash;
 }
}
function clearOrSnooze(kind,id){
 const run=db.runs.find(r=>r.id===id);
 if(!run)return;
 if(kind==='open'||kind==='exception'){
  db.active=id;save();window.SerenityPages.navigate('customer');
  if(kind==='exception')E('exception')?.scrollIntoView({block:'center'});
  return;
 }
 if(kind==='board'){
  // Never infer an earlier time from movement. Use the same actual-time
  // driver action as the Customer page (with appropriate confirmations).
  window.SerenityEvents.markEvent(run,'boarded');
  tick();return;
 }
 if(kind==='wait'){
  snoozes()[id]={until:Date.now()+options.snoozeMs,
   reason:'driver_acknowledged_still_waiting',at:new Date().toISOString()};
  save();tick();return;
 }
}
host.addEventListener('click',event=>{
 const button=event.target.closest('button[data-v7-guard]');
 if(button){event.preventDefault();clearOrSnooze(button.dataset.v7Guard,button.dataset.id)}
});
E('v7-toggle-gps').addEventListener('click',()=>{
 const enable=!settings().gps;
 db.paymentProtection={...settings(),gps:enable};save();
 if(enable)startGps();else stopGps();
 updateSettings();
});
E('v7-toggle-sound').addEventListener('click',()=>{
 db.paymentProtection={...settings(),sound:!settings().sound};save();
 updateSettings();
 if(settings().sound){lastSound=0;beep();}
});
window.addEventListener('serenity-trip-event',event=>{
 if(event?.detail?.kind==='arrived'&&lastFix){
  const r=db.runs.find(x=>x.id===event.detail.runId);
  capturePickupFix(r,lastFix);
 }
 tick();
});
const oldRender=render;
render=function(){oldRender();tick();};
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden){if(settings().gps&&watchId===null)startGps();tick();}
});
window.addEventListener('focus',tick);
const timer=setInterval(()=>{if(!document.hidden)tick();},15000);
window.addEventListener('pagehide',()=>{clearInterval(timer);stopGps();});
window.SerenityPaymentGuard={assess,risks,meters,tick};
updateSettings();
if(settings().gps)startGps();
tick();
})();