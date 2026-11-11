/* Serenity beta4: operational full-day forecast based on driver estimates, never RoutingBox drop-off times. */
(()=>{
'use strict';
if(typeof db==='undefined'||typeof render!=='function')return;
const roster=document.getElementById('roster');
if(!roster)return;
const style=document.createElement('style');
style.textContent='.sf-card{border-color:var(--accent);padding:15px 16px}.sf-card h2{font-size:21px;margin:0}.sf-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.sf-heading small{color:var(--muted)}.sf-controls{display:flex;gap:9px 14px;align-items:end;flex-wrap:wrap;margin:12px 0}.sf-controls label{font-size:12px;margin:0;display:block}.sf-controls input{margin-top:5px;width:138px;min-height:44px}.sf-controls button{min-height:44px}.sf-note{color:var(--muted);font-size:12px;line-height:1.5;margin:6px 0}.sf-data{overflow-x:auto}.sf-data table{min-width:930px;width:100%;border-collapse:collapse}.sf-data th{font-size:11px;color:var(--muted)}.sf-data td,.sf-data th{padding:8px 6px;font-size:12px}.sf-data td:first-child{width:33px}.sf-data td button{font-size:12px;min-height:38px;padding:6px}.sf-data input{width:66px;min-width:0;font-size:12px;padding:6px;min-height:38px}.sf-pill{border:1px solid var(--border);border-radius:7px;padding:5px 7px;font-weight:700;display:inline-block;white-space:nowrap}.sf-late{color:#fb7185}.sf-risk{color:#fbbf24}.sf-on{color:#34d399}.sf-done{color:var(--muted)}body.light .sf-late{color:#b91c1c}body.light .sf-risk{color:#92400e}body.light .sf-on{color:#047857}.sf-actions{display:flex;align-items:center;gap:7px}.sf-gps{font-size:12px;color:var(--muted)}.sf-summary{font-size:12px;color:var(--muted);font-weight:700}.sf-label{display:inline-block;font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:6px}.sf-footer{font-size:12px;color:var(--muted);margin:8px 0 0;line-height:1.5}@media(max-width:800px){.sf-card{padding:11px}.sf-card h2{font-size:19px}}';
document.head.appendChild(style);
const card=document.createElement('section');
card.className='panel sf-card';
card.id='sf-card';
card.innerHTML=
 '<div class="sf-heading"><div><h2>Full-Day Arrival Outlook</h2><small>Scheduled pickup · projected arrival · Serenity-calculated drop-off</small></div><span class="sf-summary" id="sf-summary">Waiting for your estimates</span></div>'+
 '<p class="sf-note"><strong>Target: 10 minutes early.</strong> Drop-offs are based on driver-entered trip minutes, <strong>not</strong> manifest drop-off times. Road ETAs require a routing service; GPS coordinates alone cannot calculate traffic.</p>'+
 '<div class="sf-controls">'+
 '<label>Travel between stops (min)<input id="sf-reposition" type="number" min="1" max="180" step="1" inputmode="numeric" placeholder="Set estimate"></label>'+
 '<label>Default trip driving (min)<input id="sf-trip" type="number" min="1" max="240" step="1" inputmode="numeric" placeholder="Set estimate"></label>'+
 '<label>Boarding / unloading buffer (min)<input id="sf-buffer" type="number" min="0" max="60" step="1" inputmode="numeric" placeholder="Set estimate"></label>'+
 '<button type="button" id="sf-save" class="primary">Save estimates</button>'+
 '<button type="button" id="sf-refresh" class="primary">Refresh GPS &amp; Forecast</button>'+
 '<span id="sf-gps" class="sf-gps">GPS off</span></div>'+
 '<div class="sf-controls"><a id="sf-map" target="_blank" rel="noopener noreferrer">Check next pickup in Google Maps</a><label>Google Maps drive minutes to next pickup<input id="sf-map-min" type="number" min="1" max="240" step="1" inputmode="numeric" placeholder="From Maps"></label><button type="button" id="sf-map-apply">Use Maps driving time</button><span class="sf-gps" id="sf-map-note">Manual entry · expires after 10 minutes.</span></div>'+
 '<div class="sf-data" id="sf-data"><p class="sf-note">Configure estimates to calculate the day.</p></div>'+
 '<p class="sf-footer" id="sf-source">The forecast is a driver-planning estimate, not a live traffic prediction. The 10-minute target is not the scheduled pickup deadline.</p>';
const vehicle=roster.querySelector('#vehicle-card');
if(vehicle)vehicle.after(card);else roster.insertBefore(card,roster.firstChild);
const E=id=>document.getElementById(id);
const dateLocal=x=>[x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-');
const minutes=x=>x.getHours()*60+x.getMinutes()+x.getSeconds()/60;
const atEvent=(iso,date)=>{
 if(!iso)return null;
 const d=new Date(iso);
 return Number.isFinite(d.getTime())&&dateLocal(d)===date?minutes(d):null;
};
function clock(n){
 if(!Number.isFinite(n))return '—';
 const r=((Math.round(n)%1440)+1440)%1440,h=Math.floor(r/60);
 return String(h%12||12)+':'+String(r%60).padStart(2,'0')+(h<12?' AM':' PM')+(n>=1440?' +1 day':'');
}
const escText=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const gps={last:null,requesting:false,error:null};
let mapsETA=null;
function currentRuns(date){
 return db.runs.filter(r=>r.date===date).sort((a,b)=>timeM(a.pu)-timeM(b.pu));
}
function intOrNull(x,min,max){
 return Number.isSafeInteger(x)&&x>=min&&x<=max?x:null;
}
function config(){
 const c=db.forecastV4||{};
 return {reposition:intOrNull(c.reposition,1,180),trip:intOrNull(c.trip,1,240),buffer:intOrNull(c.buffer,0,60)};
}
function compute(runs,date,now,c,maps){
 const current=dateLocal(now)===date?minutes(now):null;
 let readyAt=null,blocked=false,firstOpen=true;
 const overrides=db.forecastDriveMinutes||{};
 return runs.map(r=>{
  const pickup=timeM(r.pu),target=pickup-10;
  const status=String(r.status||'');
  const closed=status==='Completed'||status==='Exception';
  const arrived=atEvent(r.events&&r.events.arrived,date);
  const boarded=atEvent(r.events&&r.events.boarded,date);
  const actualEnd=atEvent(r.events&&(r.events.dropoff||r.events.closed),date);
  if(!Number.isFinite(pickup)){
   readyAt=null;blocked=true;
   return {r,state:'missing',reason:'Invalid pickup time'};
  }
  if(closed){
   if(actualEnd!==null){readyAt=actualEnd;blocked=false;}
   else {readyAt=null;blocked=true;}
   return {r,state:'done',pickup,target,drop:actualEnd,reason:actualEnd===null?'No actual end time':''};
  }
  const duration=intOrNull(overrides[r.id],1,240)??c.trip;
  const manual=firstOpen && current!==null && maps && maps.date===date && maps.runId===r.id &&
    now.getTime()>=maps.at && now.getTime()-maps.at<10*60000 && arrived===null;
  if(firstOpen)firstOpen=false;
  let arrival=null,source='Driver estimate';
  if(arrived!==null){arrival=arrived;source='Recorded arrival';}
  else if(manual){arrival=Math.max(target,current+maps.travel);source='Google Maps — entered manually';}
  else if(blocked){arrival=null;source='Earlier duration unknown';}
  else if(c.reposition!==null){
    // Live day starts at current time; later legs start at the prior projected drop-off.
    // When an assignment is overdue, never project an arrival earlier than now.
    const depart=readyAt===null?(current===null?target-c.reposition:current):Math.max(readyAt,current===null?-Infinity:current);
    arrival=Math.max(target,depart+c.reposition);
  }
  const targetMiss=arrival===null?null:Math.max(0,Math.ceil(arrival-target));
  const late=arrival===null?null:Math.max(0,Math.ceil(arrival-pickup));
  const depart=boarded!==null?boarded:arrival!==null?Math.max(arrival,pickup)+(c.buffer??0):null;
  const drop=depart!==null && duration!==null?depart+duration+(c.buffer??0):null;
  if(drop===null){blocked=true;readyAt=null;}
  else{readyAt=drop;blocked=false;}
  return {r,state:arrival===null?'missing':late>0?'late':targetMiss>0?'risk':'on',pickup,target,arrival,late,targetMiss,drop,source,drive:duration,boarded:boarded!==null};
 });
}
function draw(){
 const day=E('date').value,now=new Date(),runs=currentRuns(day),c=config();
 const out=E('sf-data'),summary=E('sf-summary'),hint=E('sf-map-note'),link=E('sf-map');
 const f=E('sf-gps');
 const elapsed=gps.last?Date.now()-gps.last.timestamp:Infinity;
 f.textContent=gps.error?'GPS: '+gps.error:gps.last?(elapsed<120000?'GPS fix '+Math.round(elapsed/1000)+'s ago · ±'+Math.round(gps.last.coords.accuracy)+'m':'GPS position stale · refresh'):'GPS off · tap refresh';
 E('sf-refresh').disabled=gps.requesting;
 E('sf-refresh').textContent=gps.requesting?'Requesting GPS…':'Refresh GPS & Forecast';
 for(const [id,value] of [['sf-reposition',c.reposition],['sf-trip',c.trip],['sf-buffer',c.buffer]]){
  if(document.activeElement!==E(id))E(id).value=value===null?'':String(value);
 }
 const next=runs.find(r=>r.status!=='Completed'&&r.status!=='Exception');
 if(next&&next.puAddr){
  link.href='https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='+encodeURIComponent(next.puAddr);
  link.style.display='inline';
 }else{link.removeAttribute('href');link.style.display='none';}
 const mapsOK=!!(mapsETA&&next&&mapsETA.runId===next.id&&mapsETA.date===day&&dateLocal(now)===day&&
      now.getTime()>=mapsETA.at&&now.getTime()-mapsETA.at<600000&&
      atEvent(next.events&&next.events.arrived,day)===null);
 hint.textContent=mapsOK?'Manual Google Maps time: '+mapsETA.travel+' min · '+Math.floor((now.getTime()-mapsETA.at)/60000)+' min old':
    mapsETA?'Maps estimate expired or trip changed · recheck Google Maps':'Manually enter the current Google Maps drive time · no traffic API connected';
 if(!runs.length){summary.textContent='No trips on selected date';out.innerHTML='<p class="sf-note">Import today’s manifest to forecast assignments.</p>';return;}
 if(c.reposition===null||c.trip===null||c.buffer===null){
  summary.textContent='Enter your driving estimates';
  out.innerHTML='<p class="sf-note">Set your typical travel-between-stops minutes, trip driving minutes and boarding/unloading buffer above. Each trip can then have its own estimate.</p>';return;
 }
 const forecast=compute(runs,day,now,c,mapsOK?mapsETA:null);
 let late=0,risk=0,unknown=0;
 let html='<table><thead><tr><th>#</th><th>Passenger</th><th>Scheduled<br>pickup</th><th>10-min<br>early goal</th><th>Projected<br>arrival</th><th>Outlook</th><th>Serenity<br>drop-off ETA</th><th>Trip drive<br>minutes</th><th>Travel source</th></tr></thead><tbody>';
 for(let i=0;i<forecast.length;i++){
  const p=forecast[i],r=p.r,isClosed=p.state==='done';
  if(p.state==='late')late++;if(p.state==='risk')risk++;if(p.state==='missing')unknown++;
  const status=isClosed?'Closed':p.state==='late'?'Late by '+p.late+'m':p.state==='risk'?'Early goal missed '+p.targetMiss+'m':p.state==='on'?'On early target':'Estimate unavailable';
  const css=p.state==='late'?'sf-late':p.state==='risk'?'sf-risk':p.state==='on'?'sf-on':'sf-done';
  const custom=intOrNull((db.forecastDriveMinutes||{})[r.id],1,240);
  const input=isClosed?'—':'<div class="sf-actions"><input aria-label="Trip drive minutes for '+escText(r.name)+'" inputmode="numeric" type="number" min="1" max="240" step="1" data-drive="'+escText(r.id)+'" value="'+(custom??'')+'" placeholder="'+c.trip+'"><button type="button" data-save-drive="'+escText(r.id)+'">Save</button></div>';
  html+='<tr><td>'+(i+1)+'</td><td><button data-open="'+escText(r.id)+'">'+escText(r.name)+'</button></td>'+
     '<td>'+escText(r.pu)+'</td><td>'+clock(p.target)+'</td><td>'+clock(p.arrival)+'</td>'+
     '<td><span class="sf-pill '+css+'">'+escText(status)+'</span></td>'+
     '<td>'+clock(p.drop)+(p.drop!==null&&p.drop!==undefined&&!isClosed?'<span class="sf-label">Our estimate</span>':'')+'</td>'+
     '<td>'+input+'</td><td>'+escText(isClosed?'Actual event':p.source||'Unknown')+'</td></tr>';
 }
 out.innerHTML=html+'</tbody></table>';
 summary.textContent=late+' projected late · '+risk+' early-goal misses · '+unknown+' unestimated';
 E('sf-source').textContent='Updated '+now.toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})+
  ' · First active leg: '+(mapsOK?'manually entered Maps drive time':'driver travel estimate')+
  ' · Future legs: your travel assumptions · Drop-offs: your trip minutes and buffers. No scheduled drop-off values used.';
 // Replace manifest's misleading drop-off time display without affecting stored original data.
 const rows=E('rows'),head=rows&&rows.closest('table')?.querySelectorAll('thead th');
 if(head&&head[3])head[3].textContent='Destination / Our ETA';
 if(rows){
  const projected=new Map(forecast.map(f=>[String(f.r.id),f]));
  rows.querySelectorAll('tr[data-id]').forEach(row=>{
    const p=projected.get(row.dataset.id),cell=row.cells[3];
    if(p&&cell){
      // Preserve the destination address from the manifest, but never display its unreliable drop-off time.
      const address=String(p.r.doAddr||'');
      cell.replaceChildren(document.createTextNode('Serenity: '+clock(p.drop)),document.createElement('br'));
      const small=document.createElement('small');small.textContent=address;cell.appendChild(small);
    }
  });
 }
}
function read(id,min,max){
 const v=E(id).value.trim();
 if(!/^[0-9]+$/.test(v))return null;
 return intOrNull(Number(v),min,max);
}
E('sf-save').addEventListener('click',()=>{
 const reposition=read('sf-reposition',1,180),trip=read('sf-trip',1,240),buffer=read('sf-buffer',0,60);
 if(reposition===null||trip===null||buffer===null)return alert('Set whole-number times: between stops 1–180, trip driving 1–240, boarding buffer 0–60 minutes.');
 db.forecastV4={reposition,trip,buffer,updatedAt:new Date().toISOString()};
 save();draw();
});
card.addEventListener('click',event=>{
 const btn=event.target.closest('button[data-save-drive]');
 if(!btn)return;
 const id=btn.dataset.saveDrive,field=[...card.querySelectorAll('input[data-drive]')].find(x=>x.dataset.drive===id);
 if(!field)return;
 const val=field.value.trim();
 if(!/^[0-9]+$/.test(val)||!intOrNull(Number(val),1,240))return alert('Enter a trip driving estimate of 1–240 minutes.');
 if(!db.forecastDriveMinutes)db.forecastDriveMinutes={};
 db.forecastDriveMinutes[id]=Number(val);save();draw();
});
E('sf-map-apply').addEventListener('click',()=>{
 const today=dateLocal(new Date()),day=E('date').value,now=new Date();
 if(today!==day)return alert('A current Google Maps driving time can only be applied to today.');
 const r=currentRuns(day).find(x=>x.status!=='Completed'&&x.status!=='Exception');
 if(!r)return alert('No future pickup found.');
 if(atEvent(r.events&&r.events.arrived,day)!==null)return alert('Current passenger already arrived. Complete that trip first.');
 const travel=read('sf-map-min',1,240);
 if(travel===null)return alert('Enter the drive minutes shown in Google Maps (1–240).');
 mapsETA={date:day,runId:r.id,travel,at:now.getTime()};draw();
});
E('sf-refresh').addEventListener('click',()=>{
 draw();
 if(gps.requesting)return;
 if(!navigator.geolocation){gps.error='Location unavailable in browser';draw();return;}
 gps.requesting=true;gps.error=null;draw();
 navigator.geolocation.getCurrentPosition(p=>{
   gps.requesting=false;gps.last=p;gps.error=null;draw();
   // Update local weather panel without retaining GPS trails or passenger information.
   window.dispatchEvent(new CustomEvent('serenity-location-refresh',{detail:{latitude:p.coords.latitude,longitude:p.coords.longitude}}));
 },e=>{
   gps.requesting=false;gps.error=e.code===1?'permission denied':e.code===2?'unavailable':'timed out';draw();
 },{enableHighAccuracy:true,maximumAge:0,timeout:20000});
});
const original=render;
render=function(){original();draw();};
E('date').addEventListener('change',draw);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)draw();});
const timer=setInterval(()=>{if(!document.hidden)draw();},60000);
window.addEventListener('pagehide',()=>clearInterval(timer));
draw();
})();