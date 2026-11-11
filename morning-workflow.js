/* Serenity Morning Operations: privacy-preserving local day-start timeline.
 * Browser GPS provides proximity only; road ETAs are manual Google Maps estimates.
 */
(()=>{
'use strict';
if(typeof db==='undefined'||typeof render!=='function'||typeof timeM!=='function')return;
const roster=document.getElementById('roster');if(!roster)return;
const css=document.createElement('style');
css.textContent='.ms-panel{border-color:var(--accent);padding:14px 16px}.ms-top{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.ms-top h2{font-size:21px;margin:0}.ms-top small,.ms-help,.ms-status{color:var(--muted);font-size:12px;line-height:1.5}.ms-pills{display:flex;gap:6px;flex-wrap:wrap}.ms-pill{font-size:12px;border-radius:7px;padding:6px 9px;background:var(--bg);border:1px solid var(--border);font-weight:700}.ms-plan{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-top:10px}.ms-step{background:var(--bg);padding:9px;border:1px solid var(--border);border-radius:9px;min-width:0}.ms-step b{display:block;font-size:19px;margin-top:4px;white-space:nowrap}.ms-step small{display:block;color:var(--muted);font-size:11px}.ms-workflow{overflow-x:auto;margin-top:12px}.ms-workflow table{width:100%;min-width:760px;border-collapse:collapse}.ms-workflow th,.ms-workflow td{padding:8px;font-size:13px;text-align:left}.ms-workflow th{font-size:12px;color:var(--muted)}.ms-workflow input[type=time]{min-height:39px;padding:6px;width:125px;max-width:none}.ms-workflow button{font-size:12px;padding:6px 9px;min-height:39px}.ms-actions{display:flex;gap:8px;flex-wrap:wrap}.ms-forms{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0}.ms-forms label{font-size:12px;margin:0;display:block}.ms-forms input{display:block;margin-top:5px;width:100%;min-height:43px}.ms-private{margin-top:10px;border-top:1px solid var(--border);padding-top:11px}.ms-private summary{cursor:pointer;font-weight:700}.ms-links{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:8px 0}.ms-links a{font-size:13px}.ms-location{font-size:12px;color:var(--muted)}.ms-location-buttons{display:flex;gap:7px;flex-wrap:wrap}.ms-location-buttons button{min-height:39px;font-size:12px}.ms-help strong{color:var(--text)}@media(max-width:1050px){.ms-plan{grid-template-columns:repeat(3,1fr)}.ms-forms{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.ms-plan{grid-template-columns:repeat(2,1fr)}.ms-forms{grid-template-columns:1fr}}';
document.head.appendChild(css);
const panel=document.createElement('section');
panel.className='panel ms-panel';panel.id='ms-panel';
panel.innerHTML='<div class="ms-top"><div><h2>Full-Day Milestones · Home to Personal Car</h2><small>Wake up → Garage → First pickup → Final drop-off → Return to base</small></div><div class="ms-pills"><span id="ms-first" class="ms-pill">First pickup: not loaded</span><span id="ms-prep" class="ms-pill">Garage prep: not recorded</span><span id="ms-base" class="ms-pill">Back at base: estimate unavailable</span></div></div>'+
'<p class="ms-help"><strong>Reverse-planned from first pickup, with a 10-minute early-arrival goal.</strong> Enter your actual Google Maps travel-minute estimates below. Each event can be marked now or corrected manually. Your shift endpoint is back at the garage where your personal car is parked, not your home. Times are stored in your local backup and are <strong>not</strong> automatically treated as paid hours.</p>'+
'<div class="ms-plan" id="ms-plan"></div>'+
'<div class="ms-workflow" id="ms-workflow"></div>'+
'<div class="ms-private"><details id="ms-settings"><summary>Home, garage &amp; morning planning settings</summary>'+
'<div class="ms-forms"><label>Wake to leave home (min)<input id="ms-wakelead" type="number" inputmode="numeric" min="0" max="240" step="1" placeholder="Manual"></label>'+
'<label>Home → garage (Maps min)<input id="ms-commute" type="number" inputmode="numeric" min="1" max="240" step="1" placeholder="From Google Maps"></label>'+
'<label>Preparation at garage (min)<input id="ms-prepare" type="number" inputmode="numeric" min="0" max="180" step="1" placeholder="Manual"></label>'+
'<label>Garage → first pickup (Maps min)<input id="ms-firstdrive" type="number" inputmode="numeric" min="1" max="240" step="1" placeholder="From Google Maps"></label>'+ '<label>Final drop-off → garage (Maps min)<input id="ms-returnbase" type="number" inputmode="numeric" min="1" max="240" step="1" placeholder="From Google Maps"></label>'+
'</div><div class="ms-forms" style="grid-template-columns:repeat(2,minmax(0,1fr))"><label>Private home address<input id="ms-home" type="text" autocomplete="off" placeholder="Only stored on this device"></label>'+
'<label>Private garage address<input id="ms-garage" type="text" autocomplete="off" placeholder="Only stored on this device"></label></div>'+
'<button type="button" id="ms-save-settings" class="primary">Save morning settings</button>'+
'<div class="ms-links"><a id="ms-home-map" target="_blank" rel="noopener noreferrer">Open home → garage in Google Maps</a><a id="ms-garage-map" target="_blank" rel="noopener noreferrer">Open garage → first pickup in Google Maps</a><a id="ms-base-map" target="_blank" rel="noopener noreferrer">Open last drop-off → base in Google Maps</a></div>'+
'<p class="ms-help">Google Maps opens navigation, but its traffic duration cannot be read automatically by this webpage. Copy the current driving minutes into the fields above when needed. Addresses and saved GPS pins appear in your local Export backup, not in the public GitHub code.</p>'+
'<div class="ms-location-buttons"><button type="button" data-ms-locate="check">Check GPS location</button><button type="button" data-ms-locate="home">Save GPS pin here as Home</button><button type="button" data-ms-locate="garage">Save GPS pin here as Garage</button></div><p id="ms-location-status" class="ms-location">GPS pins are optional. Home and garage recognition works only when you request a location check or when this page receives a location refresh. It does not run continuously in the background.</p>'+
'</details></div>';
const before=roster.querySelector('#sf-card')||roster.querySelector('#vehicle-card');
if(before)roster.insertBefore(panel,before);else roster.insertBefore(panel,roster.firstChild);
const E=id=>document.getElementById(id);
const dateLocal=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const mins=d=>d.getHours()*60+d.getMinutes();
const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function clock(value){
 if(!Number.isFinite(value))return '—';
 const t=((Math.round(value)%1440)+1440)%1440,h=Math.floor(t/60);
 return String(h%12||12)+':'+String(t%60).padStart(2,'0')+(h<12?' AM':' PM')+(value<0?' −1d':value>=1440?' +1d':'');
}
const old=(iso,date)=>{
 if(!iso)return null;const d=new Date(iso);
 return Number.isFinite(d.getTime())&&dateLocal(d)===date?mins(d):null;
};
const dayRecord=date=>db.morningDays&&db.morningDays[date]||{};
const prefs=()=>{
 const c=db.morningConfig||{};
 const val=(s,min,max)=>Number.isSafeInteger(s)&&s>=min&&s<=max?s:null;
 return {wakeLead:val(c.wakeLead,0,240),commute:c.commute===undefined?7:val(c.commute,1,240),prepare:val(c.prepare,0,180),firstDrive:val(c.firstDrive,1,240),returnBase:val(c.returnBase,1,240)};
};
const firstRun=date=>db.runs.filter(r=>r.date===date).sort((a,b)=>timeM(a.pu)-timeM(b.pu))[0]||null;
function backward(date){
 const first=firstRun(date),p=prefs();
 if(!first||!Number.isFinite(timeM(first.pu)))return {first,p,steps:[]};
 const goal=timeM(first.pu)-10;
 const departGarage=p.firstDrive===null?null:goal-p.firstDrive;
 const arriveGarage=departGarage!==null&&p.prepare!==null?departGarage-p.prepare:null;
 const departHome=arriveGarage!==null&&p.commute!==null?arriveGarage-p.commute:null;
 const wake=departHome!==null&&p.wakeLead!==null?departHome-p.wakeLead:null;
 return {first,p,goal,departGarage,arriveGarage,departHome,wake,steps:[
   ['Wake up',wake],['Leave home',departHome],['Arrive at garage',arriveGarage],['Leave garage',departGarage],['Arrive at first pickup',goal]
 ]};
}
const eventDefs=[['wake','Wake up'],['leaveHome','Leave home'],['arriveGarage','Arrive at garage'],['departGarage','Depart garage'],['firstArrival','Arrive at first pickup'],['arriveBase','Back at base — personal car']];
function renderMorning(){
 const date=E('date').value,first=firstRun(date),rec=dayRecord(date),plan=backward(date);
 const prep=old(rec.departGarage,date)!==null&&old(rec.arriveGarage,date)!==null?old(rec.departGarage,date)-old(rec.arriveGarage,date):null;
 E('ms-prep').textContent=prep===null?'Garage prep: not recorded':'Garage prep: '+(prep>=0?prep+' min':'check event order');
 E('ms-first').textContent=first?'First pickup '+first.pu+' · early target '+clock(plan.goal):'First pickup: no runs for selected date';
 const all=db.runs.filter(r=>r.date===date).sort((a,b)=>timeM(a.pu)-timeM(b.pu));
 const last=all[all.length-1],lastForecast=window.SerenityDayForecast?.getSnapshot?.(date);
 const lastData=lastForecast?.find(x=>x.r.id===last?.id);
 const lastActual=last?old(last.events?.dropoff||last.events?.closed,date):null;
 const endTrip=lastActual!==null?lastActual:lastData?.drop;
 const returnDrive=plan.p.returnBase;
 const plannedReturn=Number.isFinite(endTrip)&&Number.isSafeInteger(returnDrive)?endTrip+returnDrive:null;
 const recordedReturn=old(rec.arriveBase,date);
 const actualMark=recordedReturn!==null?'Actual '+clock(recordedReturn):null;
 E('ms-base').textContent=actualMark?'Back at base: '+actualMark:
  plannedReturn===null?'Back at base: add return drive time or trip estimates':'Back at base: projected '+clock(plannedReturn);

 const displaySteps=plan.steps.length?[...plan.steps,['Final drop-off',Number.isFinite(endTrip)?endTrip:null],['Back at base / personal car',recordedReturn!==null?recordedReturn:plannedReturn]]:[];
 E('ms-plan').innerHTML=displaySteps.length?displaySteps.map(([label,t])=>
  '<div class="ms-step"><small>PLANNED · '+safe(label)+'</small><b>'+clock(t)+'</b></div>').join(''):
  '<div class="ms-step"><small>No imported assignments for selected date</small><b>—</b></div>';
 let html='<table><thead><tr><th>Milestone</th><th>Actual time</th><th>Actions</th><th>Detail</th></tr></thead><tbody>';
 for(const [key,label] of eventDefs){
  const m=old(rec[key],date);
  const time=m===null?'':String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
  const blocked=key==='firstArrival'&&!first;
  let desc=key==='wake'?'Wake-up is your personal planning marker':key==='leaveHome'?'Start of home → garage commute':key==='arriveGarage'?'Preparation period starts':key==='departGarage'?'Preparation period ends; first-leg clock begins':key==='arriveBase'?'Return to work garage and personal car; your workday endpoint':'Also records Arrived on your existing first trip';
  html+='<tr><td><strong>'+label+'</strong></td><td><input type="time" data-ms-time="'+key+'" value="'+safe(time)+'" aria-label="'+label+' time" '+(blocked?'disabled':'')+'></td>'+
  '<td><div class="ms-actions"><button data-ms-now="'+key+'" type="button" '+(blocked?'disabled':'')+'>Mark now</button><button data-ms-save="'+key+'" type="button" '+(blocked?'disabled':'')+'>Save time</button></div></td>'+
  '<td><small>'+desc+'</small></td></tr>';
 }
 E('ms-workflow').innerHTML=html+'</tbody></table>';
 const d=E('ms-settings');
 if(!d.open){
  for(const [field,k] of [['ms-wakelead','wakeLead'],['ms-commute','commute'],['ms-prepare','prepare'],['ms-firstdrive','firstDrive'],['ms-returnbase','returnBase']]){
   E(field).value=plan.p[k]===null?'':String(plan.p[k]);
  }
  E('ms-home').value=typeof db.morningConfig?.home==='string'?db.morningConfig.home:'';
  E('ms-garage').value=typeof db.morningConfig?.garage==='string'?db.morningConfig.garage:'';
 }
 const cfg=db.morningConfig||{},map1=E('ms-home-map'),map2=E('ms-garage-map'),baseMap=E('ms-base-map');
 if(cfg.home&&cfg.garage){
  map1.href='https://www.google.com/maps/dir/?api=1&travelmode=driving&origin='+encodeURIComponent(cfg.home)+'&destination='+encodeURIComponent(cfg.garage);
  map1.style.display='inline';
 }else{map1.removeAttribute('href');map1.style.display='none';}
 if(cfg.garage&&first&&first.puAddr){
  map2.href='https://www.google.com/maps/dir/?api=1&travelmode=driving&origin='+encodeURIComponent(cfg.garage)+'&destination='+encodeURIComponent(first.puAddr);
  map2.style.display='inline';
 }else{map2.removeAttribute('href');map2.style.display='none';}
 if(cfg.garage&&last&&last.doAddr){
  baseMap.href='https://www.google.com/maps/dir/?api=1&travelmode=driving&origin='+encodeURIComponent(last.doAddr)+'&destination='+encodeURIComponent(cfg.garage);
  baseMap.style.display='inline';
 }else{baseMap.removeAttribute('href');baseMap.style.display='none';}
}
function readInt(id,min,max){
 const input=E(id).value.trim();
 if(input==='')return null;
 if(!/^[0-9]+$/.test(input))throw Error('Enter whole minutes, without decimals, in '+id+'.');
 const n=Number(input);
 if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('Check the allowed minute range in '+id+'.');
 return n;
}
E('ms-save-settings').addEventListener('click',()=>{
 try{
  const wakeLead=readInt('ms-wakelead',0,240),commute=readInt('ms-commute',1,240),
       prepare=readInt('ms-prepare',0,180),firstDrive=readInt('ms-firstdrive',1,240),returnBase=readInt('ms-returnbase',1,240);
  db.morningConfig={...(db.morningConfig||{}),wakeLead,commute,prepare,firstDrive,returnBase,
    home:E('ms-home').value.trim().slice(0,220),garage:E('ms-garage').value.trim().slice(0,220)};
  save();renderMorning();
 }catch(error){alert(error.message)}
});
function stamp(date,minutes){
 const base=new Date(date+'T00:00:00');
 if(!Number.isFinite(base.getTime()))throw Error('Invalid service date');
 base.setMinutes(minutes);return base.toISOString();
}
function updateEvent(key,iso,date){
 const rec={...(dayRecord(date))};
 if(!rec.events)rec.events={};
 const first=firstRun(date);
 if(key==='firstArrival'&&first){
  if((first.status==='Completed'||first.status==='Exception')&&!confirm('This trip is already closed. Update its recorded arrival time anyway?'))return;
  first.events=first.events||{};
  first.events.arrived=iso;
  if(!['Completed','Exception','Onboard'].includes(first.status))first.status='Arrived';
 }
 rec[key]=iso;
 if(!db.morningDays)db.morningDays={};
 db.morningDays[date]=rec;save();render();
}
panel.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 const key=button.dataset.msNow||button.dataset.msSave;
 if(!key)return;
 if(!eventDefs.some(x=>x[0]===key))return;
 event.preventDefault();event.stopImmediatePropagation();
 const date=E('date').value;
 try{
  let value;
  if(button.dataset.msNow){
   const now=new Date();
   if(dateLocal(now)!==date)throw Error('Mark now is available only on today’s service date. Enter a time to backfill another day.');
   value=now.toISOString();
  }else{
   const field=panel.querySelector('input[data-ms-time="'+key+'"]');
   if(!field||!/^([01]\d|2[0-3]):[0-5]\d$/.test(field.value))throw Error('Select a valid time first.');
   value=stamp(date,Number(field.value.slice(0,2))*60+Number(field.value.slice(3,5)));
  }
  updateEvent(key,value,date);
 }catch(error){alert(error.message);}
},true);
function metersBetween(a,b){
 const rad=Math.PI/180,latA=a.lat*rad,latB=b.lat*rad,dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad;
 const q=Math.sin(dlat/2)**2+Math.cos(latA)*Math.cos(latB)*Math.sin(dlon/2)**2;
 return 6371000*2*Math.atan2(Math.sqrt(q),Math.sqrt(1-q));
}
function locationHint(lat,lon,accuracy){
 const cfg=db.morningConfig||{},c={lat,lon},tags=[];
 for(const [k,label] of [['homeGPS','Home'],['garageGPS','Garage']]){
  const pin=cfg[k];
  if(pin&&Number.isFinite(pin.lat)&&Number.isFinite(pin.lon)&&metersBetween(c,pin)<=Math.max(125,accuracy*1.3))tags.push(label);
 }
 E('ms-location-status').textContent=tags.length?'GPS suggests you are near '+tags.join(' / ')+'. Confirm the correct event using Mark now; no event logged automatically.':'GPS fix available (accuracy ±'+Math.round(accuracy)+' m); no saved location match. No event logged.';
}
function locate(mode){
 if(!navigator.geolocation){E('ms-location-status').textContent='Location unavailable in this browser.';return;}
 E('ms-location-status').textContent='Requesting a location fix (browser permission required)…';
 navigator.geolocation.getCurrentPosition(pos=>{
  const {latitude,longitude,accuracy}=pos.coords;
  if(mode==='home'||mode==='garage'){
   const label=mode==='home'?'Home':'Garage';
   if(!confirm('Save current GPS point as '+label+' on this iPad? Its coordinates will be included in your local backup.'))return;
   db.morningConfig={...(db.morningConfig||{}),[mode==='home'?'homeGPS':'garageGPS']:{lat:latitude,lon:longitude}};
   save();
  }
  locationHint(latitude,longitude,accuracy);
 },err=>{
  E('ms-location-status').textContent=err.code===1?'Location permission denied. Use manual event buttons.':'Could not get a current location fix. Use manual event buttons.';
 },{enableHighAccuracy:true,maximumAge:0,timeout:18000});
}
panel.addEventListener('click',event=>{
 const button=event.target.closest('button[data-ms-locate]');
 if(!button)return;
 event.preventDefault();event.stopImmediatePropagation();
 locate(button.dataset.msLocate);
},true);
window.addEventListener('serenity-location-refresh',e=>{
 const d=e.detail||{};
 if(Number.isFinite(d.latitude)&&Number.isFinite(d.longitude))locationHint(d.latitude,d.longitude,100);
});
window.SerenityMorning={
 anchor(date,allRuns,now){
  const first=firstRun(date),c=prefs(),rec=dayRecord(date);
  if(!first||first.status==='Completed'||first.status==='Exception'||allRuns[0]?.id!==first.id)return null;
  const actualArrival=old(rec.firstArrival,date);
  if(actualArrival!==null)return {runId:first.id,arrival:actualArrival,source:'First pickup actual'};
  if(c.firstDrive===null)return null;
  const t=mins(now),current=dateLocal(now)===date?t:null;
  let projected=null,source='';
  const departGarage=old(rec.departGarage,date),arriveGarage=old(rec.arriveGarage,date),
        departHome=old(rec.leaveHome,date),wake=old(rec.wake,date);
  if(departGarage!==null){projected=departGarage+c.firstDrive;source='Garage departure + manual Maps time';}
  else if(arriveGarage!==null&&c.prepare!==null){projected=Math.max(current??0,arriveGarage+c.prepare)+c.firstDrive;source='Garage preparation + manual Maps time';}
  else if(departHome!==null&&c.commute!==null&&c.prepare!==null){projected=Math.max(current??0,departHome+c.commute+c.prepare)+c.firstDrive;source='Home departure + manual Maps time';}
  else if(wake!==null&&c.wakeLead!==null&&c.commute!==null&&c.prepare!==null){projected=Math.max(current??0,wake+c.wakeLead+c.commute+c.prepare)+c.firstDrive;source='Wake-up estimate + manual Maps time';}
  if(projected===null)return null;
  // A fixed travel estimate becomes stale when its projected arrival is already in the past.
  if(current!==null&&current>projected+5)return null;
  return {runId:first.id,arrival:projected,source};
 },
 update(){renderMorning()},
 plan:backward
};
const priorRender=render;
render=function(){priorRender();renderMorning();};
E('date').addEventListener('change',renderMorning);
renderMorning();
})();