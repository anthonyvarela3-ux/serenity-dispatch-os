/* Serenity Beta 6 - all-runs driver route board.
 * Local-only event logging. Original office dispatch is retained.
 * Forecast travel assumptions are not traffic API results.
 */
(()=>{
'use strict';
if(typeof db==='undefined'||typeof render!=='function'||!window.SerenityDayForecast)return;
const roster=document.getElementById('roster');
if(!roster)return;
const E=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[x]));
const dateLocal=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const eventTime=iso=>{if(!iso)return '—';const d=new Date(iso);return Number.isNaN(d.getTime())?'—':d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});};
const clock=t=>{if(!Number.isFinite(t))return '—';const n=((Math.round(t)%1440)+1440)%1440,h=Math.floor(n/60);return (h%12||12)+':'+String(n%60).padStart(2,'0')+(h<12?'a':'p')+(t>=1440?' +1':'');};
const sorted=date=>db.runs.filter(r=>r.date===date).sort((a,b)=>timeM(a.pu)-timeM(b.pu));
const forecast=date=>{try{return window.SerenityDayForecast.getSnapshot(date)||[]}catch{return []}};
const isClosed=r=>['Completed','Exception','Canceled','Canceled at Door','No-show'].includes(r.status);
const isActual=iso=>!!(iso&&!Number.isNaN(new Date(iso).getTime()));
const maps=s=>'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination='+encodeURIComponent(s||'');
const board=document.createElement('section');board.id='v6-board';board.className='panel v6-board';
board.innerHTML=
 '<div class="v6-header"><div><div class="v6-overline">LIVE SHIFT / ALL ASSIGNMENTS</div><h2>Daily Route Monitor</h2><p>Office schedule · Serenity forecast · actual events · next-run consequences</p></div>'+
 '<div class="v6-quick"><span id="v6-total" class="v6-top-stat">— runs</span><span id="v6-alerts" class="v6-top-stat">—</span><button id="v6-open-setup" type="button">Travel settings</button></div></div>'+
 '<div class="v6-legend"><span><i class="v6-dot v6-green"></i>On early target</span><span><i class="v6-dot v6-amber"></i>Review / assumptions</span><span><i class="v6-dot v6-red"></i>Late / conflict</span><span>Forecast ≠ GPS traffic ETA</span></div>'+
 '<div class="v6-scroll" id="v6-scroll"><table class="v6-table"><thead><tr>'+
 '<th scope="col"># / PASSENGER</th><th scope="col">PICKUP · SCHEDULE / ETA</th>'+
 '<th scope="col">DROP-OFF · OFFICE / ETA</th><th scope="col">ROUTE / TRAVEL</th>'+
 '<th scope="col">IMPACT ON NEXT RUN</th><th scope="col">REAL-TIME EVENTS</th>'+
 '</tr></thead><tbody id="v6-rows"></tbody></table></div>'+
 '<div class="v6-foot">Times under <b>Office</b> are original manifest entries; <b>ETA</b> is Serenity’s estimate; <b>Actual</b> is a button-recorded event. Travel between later stops is provisional until checked against Maps. Tap a row for its driver card.</div>'+
 '<div class="v6-focus hidden" id="v6-focus" aria-live="polite"></div>';
const first=E('v5-first-review');
if(first)first.after(board);
else roster.prepend(board);
// Keep the original editable forecast engine, but prevent a duplicated giant
// list of future runs from overpowering the new quick-scan manifest.
const detailsCard=E('sf-card');
if(detailsCard&&!detailsCard.parentElement?.classList.contains('v6-advanced')){
 const details=document.createElement('details');details.className='v6-advanced';details.id='v6-advanced';
 const summary=document.createElement('summary');summary.textContent='Advanced · adjust road minutes, trip buffers and detailed forecast';
 detailsCard.replaceWith(details);details.append(summary,detailsCard);
}
let selected=null;
const color=(p,r)=>{
 if(isClosed(r))return 'closed';
 if(p?.state==='missing'||!p)return 'unknown';
 if(p.state==='late')return 'late';
 if(p.state==='risk')return 'caution';
 return 'good';
};
const status=(p,r)=>{
 if(isClosed(r))return r.status==='Completed'?'Trip complete':r.status;
 if(isActual(r.events?.boarded))return 'Passenger onboard';
 if(isActual(r.events?.arrived))return 'Waiting at pickup';
 if(isActual(r.events?.enroute))return 'En route now';
 return 'Scheduled';
};
const risk=(p)=>{
 if(!p||p.state==='missing')return 'ETA unverified';
 if(p.state==='late')return p.approvalState==='approved'?'+'+p.late+'m vs agreed pickup':
   '+'+p.late+'m late · check office';
 if(p.state==='risk')return p.targetMiss+'m behind early target';
 if(p.state==='done')return 'Completed';
 return '10-min early target met';
};
function consequence(p,next,position,runs){
 if(!p||p.state==='missing'||!Number.isFinite(p.drop))
  return {head:'Awaiting trip estimate',sub:'Next-run impact cannot be verified',tone:'unknown'};
 if(!next){
  const returnM=db.morningConfig?.returnBase;
  const total=Number.isSafeInteger(returnM)?p.drop+returnM:null;
  return {head:total===null?'Return drive needed':'Back at base ~'+clock(total),
   sub:total===null?'Use last destination → garage in Maps':'After final drop-off · driver-estimated',tone:'unknown'};
 }
 if(next.state==='missing')return {head:'Next run unestimated',sub:'Check its travel assumptions',tone:'unknown'};
 const nextNum=position+2;
 const reposition=Number.isSafeInteger(db.forecastV4?.reposition)?db.forecastV4.reposition:15;
 const slack=Number.isFinite(next.target)?Math.floor(next.target-p.drop-reposition):null;
 if(next.late>0)return {head:'Run #'+nextNum+' · '+next.late+'m late',
   sub:'Projected later-arrival risk · transfer '+reposition+'m assumed',tone:'late'};
 if(next.targetMiss>0)return {head:'Run #'+nextNum+' · early margin missed',
   sub:'Forecast misses early target by '+next.targetMiss+'m',tone:'caution'};
 if(slack!==null&&slack>=0)return {head:slack+'m estimated slack',
   sub:'After assumed '+reposition+'m transfer · next Run #'+nextNum,tone:'good'};
 return {head:'Tight transfer',sub:'Confirm Google Maps driving time to next pickup',tone:'caution'};
}
function actions(r){
 if(isClosed(r))return '<span class="v6-action-done">Closed '+eventTime(r.events?.dropoff||r.events?.closed)+'</span>';
 const events=r.events||{};
 const enroute=isActual(events.enroute),arrived=isActual(events.arrived),
       boarded=isActual(events.boarded);
 const button=(act,label,disabled,extra='')=>'<button type="button" data-v6-act="'+act+'" data-v6-id="'+esc(r.id)+'"'+
    (disabled?' disabled':'')+' class="'+extra+'">'+label+'</button>';
 return '<div class="v6-action-grid">'+
  button('enroute',enroute?'↗ '+eventTime(events.enroute):'↗ En route',enroute||arrived||boarded,'v6-go')+
  button('arrived',arrived?'✓ Arrived':'Arrived',arrived||boarded)+
  button('boarded',boarded?'✓ Boarded':'Boarded',boarded)+
  button('dropoff','Drop off',false)+
 '</div>';
}
function rowHtml(r,p,next,i){
 const tone=color(p,r),office=window.SerenityOffice?.effective?.(r);
 const agreed=office?.status==='approved'?office.agreed:null;
 const destArr=p?.dropArrival;
 const predicted=p?.drop;
 const actualDrop=isClosed(r)&&isActual(r.events?.dropoff)?eventTime(r.events.dropoff):null;
 const gotEvents=r.events||{};
 const hasManual=Number.isSafeInteger(db.forecastDriveMinutes?.[r.id]);
 const drive=p?.drive;
 const approval=office?.status==='approved'?
   '<span class="v6-small v6-approved">Office agreed '+esc(agreed)+'</span>':
   office?.status==='awaiting'?'<span class="v6-small v6-warn">Office reply pending</span>':
   office?.status==='not_approved'?'<span class="v6-small v6-warn">Late not approved</span>':'';
 const impact=consequence(p,next,i);
 const complete=isClosed(r),events=[
  ['Depart',gotEvents.enroute],['Arrived',gotEvents.arrived],['Boarded',gotEvents.boarded],['Drop',gotEvents.dropoff]
 ].filter(([name,iso])=>isActual(iso)).map(([name,iso])=>name+' '+eventTime(iso)).join(' · ');
 const miles=Number.isFinite(r.miles)?r.miles.toFixed(1)+' mi':'Miles —';
 const src=hasManual?'Driver-entered trip drive':p?.source||'Travel not verified';
 return '<tr class="v6-run v6-'+tone+(selected===r.id?' v6-selected':'')+'" data-v6-row="'+esc(r.id)+'" tabindex="0" aria-label="Run '+(i+1)+' '+esc(r.name)+'; tap for driver details">'+
 '<td><div class="v6-run-meta"><span class="v6-number">#'+(i+1)+'</span><span class="v6-state">'+esc(status(p,r))+'</span></div>'+
 '<strong class="v6-name">'+esc(r.name)+'</strong><span class="v6-small">'+(r.ready?'Customer ready':'')+'</span>'+
 '<button type="button" class="v6-link" data-v6-act="focus" data-v6-id="'+esc(r.id)+'">Open driver card</button></td>'+
 '<td><span class="v6-small">OFFICE PU</span><div class="v6-time">'+esc(r.pu)+'</div>'+approval+
 '<span class="v6-small">SERENITY ARRIVAL'+(isActual(gotEvents.arrived)?' · ACTUAL':' · ETA')+'</span><div class="v6-time v6-highlight">'+
 (isActual(gotEvents.arrived)?eventTime(gotEvents.arrived):clock(p?.arrival))+'</div>'+
 '<span class="v6-mini-risk v6-'+tone+'">'+esc(risk(p))+'</span><span class="v6-small">Early target '+clock(p?.target)+'</span></td>'+
 '<td><span class="v6-small">OFFICE DO</span><div class="v6-time v6-strike">'+esc(r.du)+'</div>'+
 '<span class="v6-small">'+(actualDrop?'ACTUAL DROPOFF':'EST. DESTINATION ARRIVAL')+'</span>'+
 '<div class="v6-time v6-highlight">'+(actualDrop||clock(destArr))+'</div>'+
 '<span class="v6-small">Clear for next run ~'+(complete?'recorded '+clock(predicted):clock(predicted))+'</span></td>'+
 '<td><span class="v6-route-label">'+esc(r.puAddr||'Pickup address unavailable')+'</span>'+
 '<span class="v6-route-arrow">↓</span><span class="v6-route-label">'+esc(r.doAddr||'Destination unavailable')+'</span>'+
 '<div class="v6-drive">'+esc(miles)+' · '+(Number.isFinite(drive)?drive+'m':'Drive —')+'</div>'+
 '<span class="v6-small">'+esc(src)+'</span></td>'+
 '<td><div class="v6-impact v6-'+impact.tone+'"><strong>'+esc(impact.head)+'</strong>'+
 '<span>'+esc(impact.sub)+'</span></div>'+
 (events?'<span class="v6-small v6-event-summary">'+esc(events)+'</span>':'<span class="v6-small">No driver events recorded</span>')+'</td>'+
 '<td>'+actions(r)+'</td></tr>';
}
function focusHtml(run,p){
 if(!run)return '';
 const index=sorted(run.date).findIndex(r=>r.id===run.id)+1;
 const currentOffice=window.SerenityOffice?.effective?.(run);
 const original=run.pu,agreed=currentOffice?.status==='approved'?currentOffice.agreed:null;
 const format=event=>isActual(event)?eventTime(event):'Not recorded';
 return '<div class="v6-focus-head"><div><span class="v6-overline">DRIVER CARD · RUN #'+index+'</span><h3>'+esc(run.name)+'</h3>'+
 '<span class="v6-small">Office PU '+esc(original)+(agreed?' · approved '+esc(agreed):' · no approved later time recorded')+'</span></div>'+
 '<button type="button" data-v6-act="close-focus">Close card</button></div>'+
 '<div class="v6-focus-cols"><div><b>Pickup</b><p>'+esc(run.puAddr||'Unknown address')+'</p>'+
 '<a class="v6-nav" target="_blank" rel="noopener noreferrer" href="'+maps(run.puAddr)+'">Navigate to pickup</a></div>'+
 '<div><b>Drop-off</b><p>'+esc(run.doAddr||'Unknown address')+'</p>'+
 '<a class="v6-nav" target="_blank" rel="noopener noreferrer" href="'+maps(run.doAddr)+'">Navigate to destination</a></div>'+
 '<div><b>Recorded actuals</b><p>En route '+format(run.events?.enroute)+' · Arrived '+format(run.events?.arrived)+
 '<br>Boarded '+format(run.events?.boarded)+' · Drop '+format(run.events?.dropoff)+'</p>'+
 '<div class="v6-correction"><label>Correct en-route time <input type="time" id="v6-correct-time" value="'+(isActual(run.events?.enroute)?new Date(run.events.enroute).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}):'')+'"></label>'+
 '<button type="button" data-v6-act="correct-enroute" data-v6-id="'+esc(run.id)+'">Save correction</button></div></div></div>'+
 '<div class="v6-focus-actions"><button type="button" data-v6-act="open-customer" data-v6-id="'+esc(run.id)+'">Open full Customer Window</button>'+
 '<button type="button" data-v6-act="office" data-v6-id="'+esc(run.id)+'">Check office approval</button>'+
 '<button type="button" data-v6-act="enroute" data-v6-id="'+esc(run.id)+'"'+(isActual(run.events?.enroute)||isClosed(run)?' disabled':'')+'>Mark en route now</button></div>'+
 '<p class="v6-small">Actual timestamps stay in your local backup. This action does not send any message or update RoutingBox.</p>';
}
function refreshBoard(){
 const day=E('date')?.value;if(!day)return;
 const runs=sorted(day),results=forecast(day);
 const byId=new Map(results.map(x=>[x.r.id,x]));
 const late=results.filter(x=>x.state==='late').length,unknown=results.filter(x=>x.state==='missing').length;
 E('v6-total').textContent=runs.length+' runs · '+runs.filter(isClosed).length+' finished';
 E('v6-alerts').textContent=unknown?unknown+' ETA checks needed':late?late+' projected late':'No projected late runs';
 E('v6-alerts').className='v6-top-stat '+(unknown?'v6-amber-text':late?'v6-red-text':'v6-green-text');
 const scroll=E('v6-scroll'),horizontal=scroll.scrollLeft;
 E('v6-rows').innerHTML=runs.length?runs.map((r,i)=>rowHtml(r,byId.get(r.id),results[i+1],i)).join(''):
  '<tr><td colspan="6" class="v6-empty">No manifest for this date. Import your runs to see the full-day route monitor.</td></tr>';
 scroll.scrollLeft=horizontal;
 const focus=E('v6-focus');
 const run=selected?runs.find(r=>r.id===selected):null;
 if(run){focus.classList.remove('hidden');focus.innerHTML=focusHtml(run,byId.get(run.id))}
 else{focus.classList.add('hidden');focus.innerHTML=''}
}
function serviceDateNow(){
 const d=new Date(),day=E('date')?.value;
 if(dateLocal(d)!==day){alert('Actual-event buttons only record NOW for today’s service date. Select today before tapping.');return null}
 return d;
}
function markEvent(run,kind){
 if(!run||isClosed(run))return alert('This assignment is already closed.');
 const now=serviceDateNow();if(!now)return;
 run.events=run.events||{};
 if(isActual(run.events[kind]))return alert('Already recorded at '+eventTime(run.events[kind])+'. No duplicate timestamp was created.');
 const other=sorted(run.date).filter(r=>r.id!==run.id&&!isClosed(r)&&isActual(r.events?.enroute)&&!isActual(r.events?.arrived));
 if(kind==='enroute'){
  if(isActual(run.events.arrived)||isActual(run.events.boarded))
   return alert('This run already has an arrival or boarding event. Correct the timeline in the driver card if needed.');
  if(other.length&&!confirm('Another run already shows En route without arrival. Start this run anyway?'))return;
  run.events.enroute=now.toISOString();
 }else if(kind==='arrived'){
  if(isActual(run.events.boarded))return alert('Passenger is already recorded as boarded. Check the timeline before changing arrivals.');
  run.events.arrived=now.toISOString();run.status='Arrived';
 }else if(kind==='boarded'){
  if(!isActual(run.events.arrived)&&!confirm('No arrival time is recorded. Record the passenger boarding now without inventing an arrival time?'))return;
  run.events.boarded=now.toISOString();run.status='Onboard';
 }else if(kind==='dropoff'){
  if(!confirm('Confirm the passenger was dropped off NOW? This closes the run and records the actual drop-off time.'))return;
  run.events.dropoff=now.toISOString();run.events.closed=now.toISOString();run.status='Completed';
  if(db.active===run.id)db.active=null;
 }
 save();render();
}
function correctEnroute(run){
 if(!run||!isActual(run.events?.enroute))return alert('Record an En route departure first.');
 const raw=E('v6-correct-time')?.value;
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw||''))return alert('Enter a valid 24-hour time to correct the departure.');
 const dt=new Date(run.date+'T'+raw+':00');
 if(!Number.isFinite(dt.getTime()))return alert('Invalid timestamp.');
 const d=new Date();
 if(dt.getTime()>d.getTime()+60000)return alert('Actual departure cannot be in the future.');
 if(isActual(run.events.arrived)&&dt.getTime()>new Date(run.events.arrived).getTime())return alert('En route cannot be later than the recorded pickup arrival.');
 if(!confirm('Replace the recorded En route time with '+eventTime(dt.toISOString())+'? This only changes your local Serenity event.'))return;
 run.events.enrouteCorrections=run.events.enrouteCorrections||[];
 run.events.enrouteCorrections.push({prior:run.events.enroute,revisedAt:new Date().toISOString()});
 run.events.enroute=dt.toISOString();save();render();
}
function handle(action,id){
 if(action==='close-focus'){selected=null;refreshBoard();return}
 const run=sorted(E('date').value).find(r=>r.id===id);
 if(!run)return;
 if(action==='focus'){selected=selected===id?null:id;refreshBoard();if(selected)E('v6-focus').scrollIntoView({block:'nearest'});return}
 if(action==='open-customer'){db.active=id;save();show('customer');return}
 if(action==='office'){if(window.SerenityOfficeUI?.open)window.SerenityOfficeUI.open(id);return}
 if(action==='correct-enroute'){correctEnroute(run);return}
 if(['enroute','arrived','boarded','dropoff'].includes(action))markEvent(run,action);
}
board.addEventListener('click',event=>{
 const button=event.target.closest('button[data-v6-act]');
 if(button){event.preventDefault();event.stopImmediatePropagation();handle(button.dataset.v6Act,button.dataset.v6Id);return}
 const row=event.target.closest('tr[data-v6-row]');if(row){event.preventDefault();event.stopImmediatePropagation();handle('focus',row.dataset.v6Row)}
},true);
board.addEventListener('keydown',event=>{
 if((event.key==='Enter'||event.key===' ')&&event.target.matches('tr[data-v6-row]')){
  event.preventDefault();handle('focus',event.target.dataset.v6Row);
 }
});
E('v6-open-setup').addEventListener('click',()=>{
 const panel=E('v6-advanced');if(panel){panel.open=true;panel.scrollIntoView({behavior:'smooth',block:'center'});}
});
const oldCustomer=renderCustomer;
renderCustomer=function(){
 oldCustomer();
 const run=db.runs.find(r=>r.id===db.active);
 const root=E('customer-content');
 if(!run||!root||isClosed(run))return;
 const actions=root.querySelector('.b3-actions .bar');
 if(!actions)return;
 if(!actions.querySelector('#v6-customer-enroute')){
  const eBtn=document.createElement('button');eBtn.type='button';eBtn.id='v6-customer-enroute';
  eBtn.setAttribute('data-v6-act','enroute');eBtn.setAttribute('data-v6-id',run.id);
  eBtn.textContent=isActual(run.events?.enroute)?'↗ En route '+eventTime(run.events.enroute):'↗ En route to pickup';
  eBtn.disabled=isActual(run.events?.enroute)||isActual(run.events?.arrived)||isActual(run.events?.boarded);
  actions.prepend(eBtn);
  const bBtn=document.createElement('button');bBtn.type='button';bBtn.id='v6-customer-boarded';
  bBtn.setAttribute('data-v6-act','boarded');bBtn.setAttribute('data-v6-id',run.id);
  bBtn.textContent=isActual(run.events?.boarded)?'✓ Boarded '+eventTime(run.events.boarded):'Passenger boarded';
  bBtn.disabled=isActual(run.events?.boarded);
  actions.insertBefore(bBtn,actions.querySelector('#v5-dropoff'));
 }
};
document.addEventListener('click',event=>{
 const target=event.target.closest?.('#v6-customer-enroute, #v6-customer-boarded');
 if(!target)return;
 event.preventDefault();event.stopImmediatePropagation();handle(target.dataset.v6Act,target.dataset.v6Id);
},true);
const prior=render;
render=function(){prior();refreshBoard();};
E('date').addEventListener('change',refreshBoard);
window.addEventListener('serenity-weather-updated',refreshBoard);
window.addEventListener('serenity-location-refresh',refreshBoard);
const timer=setInterval(()=>{if(!document.hidden)refreshBoard();},60000);
window.addEventListener('pagehide',()=>clearInterval(timer));
refreshBoard();
})();