/* Serenity Beta 8 — approved three-page interface and 5-stage driver timeline.
 * Original manifest, verified office approvals and trip timestamps remain
 * entirely in local db; never writes RoutingBox or sends messages.
 */
(()=>{
'use strict';
if(typeof db==='undefined'||typeof render!=='function'||!window.SerenityThreePage)return;
const E=id=>document.getElementById(id),page=E('v7-overview'),
  manifest=E('v7-manifest-table'),customer=E('customer');
if(!page||!manifest||!customer)return;
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dayOf=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const minutes=d=>d.getHours()*60+d.getMinutes();
const clock=m=>{if(!Number.isFinite(m))return '—';const n=((Math.round(m)%1440)+1440)%1440,h=Math.floor(n/60);
 return String(h%12||12)+':'+String(n%60).padStart(2,'0')+(h<12?' AM':' PM')+(m>=1440?' +1d':'')};
const actual=iso=>!!iso&&Number.isFinite(new Date(iso).getTime());
const time=iso=>actual(iso)?new Date(iso).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'—';
const cash=x=>Number.isFinite(x)?'$'+x.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const sorted=date=>db.runs.filter(r=>r.date===date).sort((a,b)=>timeM(a.pu)-timeM(b.pu));
const forecast=date=>{try{return window.SerenityDayForecast?.getSnapshot(date)||[]}catch{return []}};
const closed=r=>r.status==='Completed'||r.status==='Exception'||actual(r.events?.dropoff);
const allEvents=[['enroute','En Route to Pickup'],['arrived','Arrived at Pickup'],
 ['boarded','Customer In Car'],['enrouteDropoff','En Route to Drop-off'],
 ['dropoff','Customer Out of Car']];
const isDay=day=>dayOf(new Date())===day;
const splitWeather=(hours,date)=>{
 const valid=Array.isArray(hours)?hours.filter(h=>h?.startTime&&Number.isFinite(new Date(h.startTime).getTime())):[];
 const same=valid.filter(h=>dayOf(new Date(h.startTime))===date);
 const now=new Date();
 const periods=[['morning','Morning',5,12],['afternoon','Afternoon',12,18],['evening','Evening',18,24]];
 const parts=periods.map(([key,label,lo,hi])=>{
   const matching=same.filter(h=>{const t=new Date(h.startTime).getHours();return t>=lo&&t<hi;});
   const temp=matching.map(h=>h.temperature).filter(Number.isFinite);
   const desc=matching.find(h=>h.shortForecast)?.shortForecast||'';
   return {key,label,temps:temp.length?(Math.min(...temp)===Math.max(...temp)?
     String(temp[0])+'°':Math.min(...temp)+'–'+Math.max(...temp)+'°'):'—',
     desc:matching.length?desc:(date===dayOf(now)&&now.getHours()>=hi?'Period passed · no future forecast':'Awaiting NWS forecast'),
     rain:matching.map(h=>h.precipitation).filter(Number.isFinite)};
 });
 const current=valid.find(h=>{
  const start=new Date(h.startTime).getTime(),end=new Date(h.endTime||new Date(start+3600000)).getTime();
  return start<=now.getTime()&&end>now.getTime()
 });
 return {current,parts};
};
function initAppearance(){
 const toggle=E('theme'),dateSlot=E('v7-date-slot');
 if(!toggle||!dateSlot)return;
 toggle.classList.add('v8-theme-toggle');
 toggle.textContent='☀ Day / Night';
 toggle.title='Switch between system, daylight and night appearance';
 dateSlot.append(toggle);
}
function initWeather(){
 const weatherHost=E('v7-weather-host'),widget=weatherHost?.closest('.v7-widget');
 if(!weatherHost||!widget)return;
 const wx=E('wx-panel'),details=document.createElement('details');
 details.id='v8-weather-tools';details.className='v8-weather-tools';
 details.innerHTML='<summary>Refresh weather / NWS details</summary>';
 if(wx)details.append(wx);
 const weather=document.createElement('section');weather.id='v8-weather';
 weather.innerHTML='<div class="v8-weather-lead"><div class="v8-weather-icon">☁</div>'+
 '<div><strong>Weather Forecast</strong><small id="v8-weather-location">National Weather Service · location loading</small></div></div>'+
 '<div class="v8-weather-periods">'+
 '<div class="v8-weather-period"><span>Current</span><strong id="v8-current-temp">—</strong><small id="v8-current-desc">Awaiting forecast</small></div>'+
 '<div class="v8-weather-period"><span>Morning</span><strong id="v8-morning-temp">—</strong><small id="v8-morning-desc">Awaiting forecast</small></div>'+
 '<div class="v8-weather-period"><span>Afternoon</span><strong id="v8-afternoon-temp">—</strong><small id="v8-afternoon-desc">Awaiting forecast</small></div>'+
 '<div class="v8-weather-period"><span>Evening</span><strong id="v8-evening-temp">—</strong><small id="v8-evening-desc">Awaiting forecast</small></div>'+
 '</div>';
 const h=page.querySelector('.v7-kpi-grid');if(h)h.before(weather,details);
 // Existing weather engine and its Refresh button remain intact in the disclosure;
 // repurpose the original half-width widget for schedule at a glance.
 widget.querySelector('.v7-widget-heading h2').textContent="Today’s Schedule";
 const caption=widget.querySelector('.v7-widget-heading span');if(caption)caption.textContent='Actual events + forecast';
 weatherHost.innerHTML='<div class="v8-schedule" id="v8-schedule"></div>';
}
function initFinances(){
 const grid=page.querySelector('.v7-kpi-grid');if(!grid)return;
 const pay=E('v7-pay')?.parentElement,estimate=E('v7-pay-forecast')?.parentElement;
 if(pay){pay.querySelector('span').textContent='Actual earned from closed runs';
  pay.querySelector('small').textContent='Completed runs × their listed tariffs · not payment confirmation';
  pay.classList.add('v8-earned');
 }
 if(estimate){estimate.querySelector('span').textContent='Original estimated payout';
  estimate.querySelector('small').textContent='Starting scheduled trip tariffs · lock baseline below';
  estimate.classList.add('v8-original');
 }
 // Match approved mockup: original estimate before completed earnings.
 if(pay&&estimate)pay.before(estimate);
 const miles=document.createElement('div');miles.className='v7-kpi';
 miles.innerHTML='<span>Scheduled vehicle miles</span><strong id="v8-miles">—</strong>'+
 '<small>Only distances provided in the manifest</small>';
 const hours=document.createElement('div');hours.className='v7-kpi';
 hours.innerHTML='<span>Recorded driver shift</span><strong id="v8-hours">—</strong>'+
 '<small>Elapsed time since Clock In, if recorded</small>';
 grid.append(miles,hours);
 const footer=document.createElement('div');footer.className='v8-payout-lock';footer.id='v8-payout-lock';
 footer.innerHTML='<div><strong id="v8-baseline-state">Beginning-of-day estimate not locked</strong>'+
 '<p id="v8-baseline-description">Lock the original manifest total once all initial runs and tariff values are entered. Future edits will not change it.</p></div>'+
 '<button type="button" id="v8-lock-baseline">Lock original estimate</button>';
 grid.after(footer);
 const extras=page.querySelector('.v7-secondary-stats');
 if(extras)extras.classList.add('v8-compact-extras');
}
function initManifest(){
 const heading=manifest.querySelector('thead tr');if(!heading)return;
 heading.innerHTML='<th scope="col">RUN / PASSENGER</th><th scope="col">STATUS / ACTUALS</th>'+
 '<th scope="col">OFFICE PICKUP</th><th scope="col">ARRIVAL · ETA / ACTUAL</th>'+
 '<th scope="col">DROP-OFF · EST. / ACTUAL</th><th scope="col">NEXT RUN IMPACT</th>'+
 '<th scope="col">OPEN</th>';
}
function initCustomer(){
 const header=customer.querySelector('.v7-customer-heading');
 if(header){
  const summary=document.createElement('div');summary.id='v8-customer-summary';summary.className='v8-customer-summary';
  header.insertAdjacentElement('afterend',summary);
 }
 const p=E('v7-customer-progress');
 if(p)p.classList.add('v8-five-progress');
}
function updateWeather(date){
 const source=window.SerenityWeather,info=splitWeather(source?.hours,date);
 E('v8-weather-location').textContent=source?.label?
  source.label+' · NWS hourly forecast · no traffic adjustment':
  'NWS forecast loading · local weather unavailable until fetched';
 const curr=info.current;
 E('v8-current-temp').textContent=Number.isFinite(curr?.temperature)?curr.temperature+'°':'—';
 E('v8-current-desc').textContent=curr?.shortForecast||'Current period unavailable';
 for(const part of info.parts){
  E('v8-'+part.key+'-temp').textContent=part.temps;
  E('v8-'+part.key+'-desc').textContent=part.desc;
 }
}
function updateMoney(date,runs){
 const completed=runs.filter(r=>r.status==='Completed'&&Number.isFinite(r.tariff));
 const allTariffs=runs.filter(r=>Number.isFinite(r.tariff));
 const total=allTariffs.length?allTariffs.reduce((sum,r)=>sum+r.tariff,0):null;
 const earned=completed.length?completed.reduce((sum,r)=>sum+r.tariff,0):
  (allTariffs.length?0:null);
 db.payoutBaselines=db.payoutBaselines||{};
 const baseline=db.payoutBaselines[date];
 E('v7-pay').textContent=cash(earned);
 E('v7-pay-forecast').textContent=cash(baseline?.amount??total);
 E('v7-pay-forecast').parentElement.querySelector('small').textContent=baseline?
  'Locked from the initial manifest at '+new Date(baseline.savedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):
  'Current manifest estimate · not yet locked';
 const m=runs.map(r=>r.miles).filter(Number.isFinite);
 E('v8-miles').textContent=m.length?m.reduce((a,b)=>a+b,0).toFixed(1)+' mi':'—';
 const rate=Number(db.shift?.rate),start=db.shift?.start?new Date(db.shift.start):null;
 const startValid=start&&Number.isFinite(start.getTime())&&dayOf(start)===date;
 const end=db.shift?.end?new Date(db.shift.end):new Date();
 E('v8-hours').textContent=startValid&&Number.isFinite(end.getTime())?
  Math.max(0,(end-start)/3600000).toFixed(1)+' hr':'—';
 const b=E('v8-baseline-state'),d=E('v8-baseline-description'),button=E('v8-lock-baseline');
 if(baseline){
  b.textContent='Original estimate locked: '+cash(baseline.amount);
  d.textContent='Saved '+new Date(baseline.savedAt).toLocaleString()+
    ' · '+baseline.runCount+' initial runs. Additions and later tariff edits will not change the original figure.';
  button.textContent='Original baseline saved';button.disabled=true;
 }else{
  b.textContent='Original estimated payout: '+cash(total);
  d.textContent=allTariffs.length?
   'This is the sum of current manifest tariffs. Lock it after importing the full original dispatch.' :
   'No trip tariffs supplied. No payout estimate can be calculated.';
  button.textContent='Lock original estimate';
  button.disabled=!allTariffs.length;
 }
}
function statusFor(r){
 const ev=r.events||{};
 if(r.status==='Completed')return ['Completed','done'];
 if(r.status==='Exception')return ['Exception','warn'];
 if(actual(ev.dropoff))return ['Completed','done'];
 if(actual(ev.enrouteDropoff))return ['En route to drop-off','ongoing'];
 if(actual(ev.boarded))return ['Customer in car','ongoing'];
 if(actual(ev.arrived))return ['At pickup','ongoing'];
 if(actual(ev.enroute))return ['En route to pickup','ongoing'];
 return ['Pending','pending'];
}
function currentRun(date){
 const runs=sorted(date);
 const active=runs.filter(r=>!closed(r)&&['enroute','arrived','boarded','enrouteDropoff'].some(k=>actual(r.events?.[k])));
 if(active.length){
  const stamp=r=>Math.max(0,...['enroute','arrived','boarded','enrouteDropoff']
    .map(k=>actual(r.events?.[k])?new Date(r.events[k]).getTime():0));
  active.sort((a,b)=>stamp(b)-stamp(a));
  return {run:active[0],active:true};
 }
 return {run:runs.find(r=>!closed(r))||null,active:false};
}
function updateHeader(date,runs){
 const state=currentRun(date);
 const row=state.run;
 if(!row)return;
 const n=runs.findIndex(r=>r.id===row.id)+1,[label]=statusFor(row);
 const office=window.SerenityOffice?.effective?.(row);
 const latest=['enrouteDropoff','boarded','arrived','enroute'].find(k=>actual(row.events?.[k]));
 E('v7-ride-state').textContent=state.active?'Run #'+n+' · '+label:'No active ride · Next Run #'+n;
 E('v7-ride-detail').textContent='Office pickup '+row.pu+
  (office?.status==='approved'?' · agreed '+office.agreed:'')+
  (state.active&&latest?' · '+time(row.events[latest]):' · not started');
}
function nextImpact(p,next,index){
 if(!p||!Number.isFinite(p.drop))return ['unverified','Next-run timing unverified'];
 if(!next){
  const r=db.morningConfig?.returnBase;
  return Number.isSafeInteger(r)?['good','Return to base ~'+clock(p.drop+r)]:
   ['unverified','Return-to-base route not verified'];
 }
 if(next.state==='missing')return ['unverified','Next-run ETA unknown'];
 if(next.state==='done')return ['good','Next run already closed'];
 if(next.late>0)return ['risk','Next Run #'+(index+2)+' · '+next.late+'m late'];
 if(next.targetMiss>0)return ['warn','Next Run #'+(index+2)+' · tight early margin'];
 return ['good','Next Run #'+(index+2)+' · early target met'];
}
function updateManifest(date,runs,f){
 const byId=new Map(f.map(x=>[x.r.id,x])),cells=[];
 for(let i=0;i<runs.length;i++){
  const r=runs[i],p=byId.get(r.id),e=r.events||{},[s,tone]=statusFor(r);
  const verifiedDrop=actual(e.dropoff),actualArrived=actual(e.arrived);
  const office=window.SerenityOffice?.effective?.(r);
  const closedWithoutDrop=r.status==='Completed'&&!verifiedDrop;
  const actualLines=[
   ['Pickup departure',e.enroute],['At pickup',e.arrived],
   ['In car',e.boarded],['To drop-off',e.enrouteDropoff],['Out of car',e.dropoff]
  ].filter(([name,v])=>actual(v)).map(([name,v])=>'<div>'+safe(name)+' '+safe(time(v))+'</div>');
  const [impactTone,impactText]=nextImpact(p,f[i+1],i);
  const risk=p?.state==='late'?' · '+p.late+'m after '+(p.approvalState==='approved'?'agreed':'office')+' time':
    p?.state==='risk'?' · early target missed':'';
  cells.push('<tr class="v8-run v8-'+tone+'">'+
    '<td><div class="v8-person"><b>#'+(i+1)+'</b><strong>'+safe(r.name)+'</strong></div>'+
    '<small>'+safe(r.puAddr||'Pickup address not supplied')+'</small></td>'+
    '<td><span class="v8-status '+tone+'">'+safe(s)+'</span>'+
    '<div class="v8-event-list">'+(actualLines.length?actualLines.join(''):'No actual event recorded')+'</div>'+
    (closedWithoutDrop?'<small class="v8-warning">Closed without verified drop-off time</small>':'')+'</td>'+
    '<td><span class="v8-major-time">'+safe(r.pu)+'</span>'+
    '<small>10-minute-early goal '+clock(p?.target)+'</small>'+
    (office?.status==='approved'?'<small class="v8-agreed">Office agreed '+safe(office.agreed)+'</small>':'')+'</td>'+
    '<td><span class="v8-major-time '+(p?.state==='late'?'v8-late-text':'')+'">'+
    (actualArrived?time(e.arrived):closed(r)?'—':clock(p?.arrival))+'</span>'+
    '<small>'+(actualArrived?'Actual arrival':closed(r)?'Actual arrival not recorded':'Serenity estimate')+'</small>'+
    (closed(r)?'':'<small class="v8-risk-line">'+safe(risk||'Planning estimate')+'</small>')+'</td>'+
    '<td><small>Office drop-off '+safe(r.du||'—')+'</small>'+
    '<span class="v8-major-time">'+(verifiedDrop?time(e.dropoff):closed(r)?'—':clock(p?.dropArrival??p?.drop))+'</span>'+
    '<small>'+(verifiedDrop?'Verified actual drop-off':closed(r)?'Drop-off time not recorded':'Est. destination arrival')+'</small>'+
    (!closed(r)?'<small>Clear for next '+clock(p?.drop)+'</small>':'')+'</td>'+
    '<td><div class="v8-impact '+impactTone+'"><strong>'+safe(impactText)+'</strong>'+
    '<small>'+(impactTone==='unverified'?'Insufficient trusted times':
     'Subject to verified travel and office arrangements')+'</small></div></td>'+
    '<td><button type="button" class="v8-customer-open" data-v7-run="'+safe(r.id)+'">Customer</button></td></tr>');
 }
 E('v7-manifest-rows').innerHTML=cells.length?cells.join(''):
  '<tr><td colspan="7" class="v7-empty">No runs found for this date. Import today’s manifest to begin.</td></tr>';
 const header=manifest.querySelector('thead tr');
 if(header)header.innerHTML='<th>RUN / PASSENGER</th><th>STATUS / ACTUAL TIMES</th>'+
 '<th>OFFICE PICKUP</th><th>ARRIVAL ETA / ACTUAL</th><th>DROP-OFF ETA / ACTUAL</th>'+
 '<th>NEXT RUN IMPACT</th><th>OPEN</th>';
 const cnt=runs.filter(r=>r.status==='Completed').length,unestimated=f.filter(x=>x.state==='missing').length;
 E('v7-manifest-subtitle').textContent=runs.length+' scheduled runs · '+cnt+
  ' completed · all times shown against original office schedule';
 E('v7-manifest-risk').textContent=unestimated?unestimated+' ETAs unverified':
   f.filter(x=>x.state==='late').length+' projected late';
 // Once the first assignment is finished, don't keep demanding a garage-to-
 // first-passenger check for a drive that already happened.
 const notice=E('v7-manifest-notice');
 if(notice&&runs.length&&closed(runs[0])){
  if(unestimated){
   notice.classList.remove('hidden');
   notice.innerHTML='<div><strong>Later-run ETAs need verified events</strong>'+
    '<p>An earlier assignment was closed without a recorded physical drop-off, or a later driving time is unknown. '+
    'Record actual en-route/arrival events or check Google Maps before relying on downstream forecasts.</p></div>';
  }else notice.classList.add('hidden');
 }
}
function updateProgress(r){
 const p=E('v7-customer-progress');if(!p)return;
 if(!r){p.textContent='Choose a run on this page or open it from Manifest.';return;}
 p.innerHTML=allEvents.map(([kind,label],i)=>{
  const marked=actual(r.events?.[kind]);
  return '<div class="v7-progress-step '+(marked?'done':'')+'"><span class="v7-step-number">'+
   (marked?'✓':i+1)+'</span><div><strong>'+safe(label)+'</strong><small>'+
   (marked?time(r.events[kind]):'Not yet recorded')+'</small></div></div>';
 }).join('');
}
function paintControls(r){
 const root=E('customer-content'),panel=root?.querySelector('.b3-actions'),bar=panel?.querySelector('.bar');
 if(!root||!panel||!bar)return;
 const head=panel.querySelector('h3');if(head)head.textContent='Trip Controls · Five Actual Events';
 const note=panel.querySelector('small');if(note)note.textContent=
  'Tap each stage as it happens. The timestamp is saved locally; nothing is sent to dispatch or the passenger.';
 panel.classList.add('v8-trip-controls');
 // Keep the five primary actions together in a full-width timeline below
 // customer route/contact details, matching the approved iPad layout.
 if(panel.parentElement!==root)root.append(panel);
 bar.classList.add('v8-stage-grid');
 if(!r){bar.innerHTML='';return;}
 const disabled=closed(r);
 bar.innerHTML=allEvents.map(([kind,label],i)=>{
  const completed=actual(r.events?.[kind]);
  const previous=i===0||actual(r.events?.[allEvents[i-1][0]]);
  const current=!completed&&previous&&!disabled;
  return '<button type="button" data-v8-stage="'+kind+'" data-v8-run="'+safe(r.id)+'" '+
   (completed||disabled?'disabled':'')+' class="v8-stage '+(completed?'completed':current?'current':'future')+'">'+
   '<span class="v8-stage-symbol">'+(completed?'✓':String(i+1))+'</span>'+
   '<strong>'+safe(label)+'</strong><small>'+(completed?time(r.events[kind]):disabled?'Closed':'Record now')+
   '</small></button>';
 }).join('');
 // Keep the historical no-show / exception function without cluttering
 // the five primary timeline actions.
 let more=panel.querySelector('.v8-more');
 if(!more){
  more=document.createElement('details');more.className='v8-more';
  more.innerHTML='<summary>Other trip actions</summary>'+
   '<div class="v8-extra-actions"><button type="button" id="v8-office-check">Check office-approved pickup</button>'+
   '<button type="button" id="v8-exception">No-show / exception</button></div>';
  panel.append(more);
 }
 more.querySelector('#v8-exception').disabled=disabled;
}
function updateCustomer(date,runs){
 const r=runs.find(r=>r.id===db.active);
 updateProgress(r);
 const header=E('v8-customer-summary');
 if(header){
  const p=r?forecast(date).find(x=>x.r.id===r.id):null;
  header.innerHTML=r?'<div class="v8-customer-overline">RUN #'+(runs.findIndex(x=>x.id===r.id)+1)+
   ' · '+safe(statusFor(r)[0])+'</div>'+
   '<div class="v8-customer-main"><strong>'+safe(r.name)+'</strong>'+
   '<span>Office pickup '+safe(r.pu)+' · '+safe(r.puAddr||'Address unavailable')+'</span></div>'+
   '<div class="v8-customer-stats"><span>Next curb ETA <b>'+clock(p?.arrival)+'</b></span>'+
   '<span>Destination ETA <b>'+clock(p?.dropArrival)+'</b></span></div>':
   '<div class="v8-customer-overline">Select a run in Manifest or the Customer picker</div>';
 }
 paintControls(r);
}
function updateSchedule(date,runs,f){
 const target=E('v8-schedule');if(!target)return;
 const current=currentRun(date),r=current.run;
 const n=r?runs.findIndex(x=>x.id===r.id)+1:null;
 const next=r?runs.slice(n).find(x=>!closed(x)):null;
 const nNum=next?runs.findIndex(x=>x.id===next.id)+1:null;
 const last=f[f.length-1],returnBase=db.morningConfig?.returnBase;
 const end=Number.isFinite(last?.drop)&&Number.isSafeInteger(returnBase)?
   clock(last.drop+returnBase):'—';
 target.innerHTML='<div class="v8-sched-line"><span>'+(current.active?'CURRENT RUN':'NEXT RUN')+
  '</span><strong>'+(r?'#'+n+' '+safe(r.name):'No pending runs')+'</strong>'+
  '<small>'+(r?safe(statusFor(r)[0]):'')+'</small></div>'+
  '<div class="v8-sched-line"><span>UPCOMING</span><strong>'+(next?'#'+nNum+' '+safe(next.name):'—')+
  '</strong><small>'+(next?'Office pickup '+safe(next.pu):'No later assignment')+'</small></div>'+
  '<div class="v8-sched-line"><span>RETURN TO BASE</span><strong>'+end+
  '</strong><small>'+(end==='—'?'Verify final trip / base travel':'Estimated, not live Maps ETA')+'</small></div>';
}
function refresh(){
 const date=E('date')?.value;if(!date)return;
 const runs=sorted(date),f=forecast(date);
 updateMoney(date,runs);updateWeather(date);updateHeader(date,runs);
 updateManifest(date,runs,f);updateCustomer(date,runs);updateSchedule(date,runs,f);
}
function recordStage(run,kind){
 if(!run||closed(run))return alert('This run is already completed or closed.');
 const date=E('date').value,now=new Date();
 if(!isDay(date)||run.date!==date)return alert('Record NOW requires today’s selected service date.');
 run.events=run.events||{};
 if(actual(run.events[kind]))return alert('That step already has a recorded actual time.');
 const n=allEvents.findIndex(x=>x[0]===kind);
 if(n<0)return;
 const previous=n>0?allEvents[n-1][0]:null;
 if(previous&&!actual(run.events[previous])){
  if(!confirm('The previous step ('+allEvents[n-1][1]+') is not recorded. Record ONLY the actual '+
   allEvents[n][1]+' time now, leaving the missing step blank?'))return;
 }
 if(kind==='dropoff'){
  if(!confirm('Confirm the customer is OUT OF THE CAR now? This will save the actual drop-off time and close the run.'))return;
  const iso=now.toISOString();
  run.events.dropoff=iso;run.events.closed=iso;run.status='Completed';
  if(db.active!==run.id)db.active=run.id;
 }else{
  run.events[kind]=now.toISOString();
  if(kind==='arrived')run.status='Arrived';
  if(kind==='boarded')run.status='Onboard';
  if(kind==='enroute')run.status='En Route to Pickup';
  if(kind==='enrouteDropoff')run.status='En Route to Drop-off';
 }
 save();render();
}
function setupEvents(){
 page.addEventListener('click',event=>{
  const btn=event.target.closest('#v8-lock-baseline');if(!btn)return;
  event.preventDefault();event.stopImmediatePropagation();
  const date=E('date').value,rs=sorted(date),prices=rs.map(r=>r.tariff).filter(Number.isFinite);
  if(!prices.length)return alert('No trip tariff values supplied; cannot lock an estimate.');
  const amount=prices.reduce((a,b)=>a+b,0);
  if(!confirm('Lock the current '+rs.length+'-run manifest estimate of '+cash(amount)+
   ' as the ORIGINAL start-of-day payout? It will not change when later runs are added.'))return;
  db.payoutBaselines=db.payoutBaselines||{};
  if(db.payoutBaselines[date])return alert('Original estimate is already locked.');
  db.payoutBaselines[date]={amount,savedAt:new Date().toISOString(),runCount:rs.length};
  save();render();
 },true);
 customer.addEventListener('click',event=>{
  const button=event.target.closest('button[data-v8-stage]');
  if(button){
    event.preventDefault();event.stopImmediatePropagation();
    const r=db.runs.find(x=>x.id===button.dataset.v8Run&&x.date===E('date').value);
    recordStage(r,button.dataset.v8Stage);return;
  }
  if(event.target.closest('#v8-office-check')){
    event.preventDefault();event.stopImmediatePropagation();
    const r=db.runs.find(x=>x.id===db.active);
    if(r&&window.SerenityOfficeUI?.open)window.SerenityOfficeUI.open(r.id);
    return;
  }
  if(event.target.closest('#v8-exception')){
    event.preventDefault();event.stopImmediatePropagation();
    const r=db.runs.find(x=>x.id===db.active);
    if(!r||closed(r))return;
    if(!confirm('Confirm this assignment is a no-show / exception? No actual drop-off will be invented.'))return;
    r.events=r.events||{};r.events.closed=new Date().toISOString();r.status='Exception';
    save();render();
  }
 },true);
}
initAppearance();initWeather();initFinances();initManifest();initCustomer();setupEvents();
const originalCustomer=renderCustomer;
renderCustomer=function(){originalCustomer();
 const date=E('date')?.value;
 if(date)updateCustomer(date,sorted(date));
};
const previousRender=render;
render=function(){previousRender();refresh()};
E('date')?.addEventListener('change',refresh);
window.addEventListener('serenity-weather-updated',refresh);
window.addEventListener('serenity-location-refresh',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
const timer=setInterval(()=>{if(!document.hidden)refresh()},60000);
window.addEventListener('pagehide',()=>clearInterval(timer));
refresh();
window.SerenityApprovedV8={refresh};
})();