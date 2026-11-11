/* Serenity Beta 7: three-page preview UI (Overview / Manifest / Customer).
 * Adds presentation and navigation only; original local data, backups, trip
 * timeline, routing assumptions, and office approvals remain the source of truth.
 */
(()=>{
'use strict';
if(typeof db==='undefined'||typeof render!=='function'||typeof show!=='function'||!window.SerenityDayForecast)return;
const E=id=>document.getElementById(id);
const main=document.querySelector('main'),roster=E('roster'),customer=E('customer');
const originalHeader=document.querySelector('body > header');
const originalNav=main?.querySelector(':scope > nav'),originalStats=main?.querySelector(':scope > .metrics');
if(!main||!roster||!customer||!originalHeader||!E('v6-board'))return;
const esc=s=>String(s??'').replace(/[&<>"']/g,t=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[t]));
const dateLocal=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const clock=m=>{
 if(!Number.isFinite(m))return '—';
 const total=Math.round(m),n=((total%1440)+1440)%1440,h=Math.floor(n/60);
 return String(h%12||12)+':'+String(n%60).padStart(2,'0')+(h<12?' AM':' PM')+
 (total>=1440?' +1 day':total<0?' −1 day':'');
};
const money=n=>Number.isFinite(n)?'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const simpleTime=iso=>{
 if(!iso)return '—';const d=new Date(iso);
 return Number.isFinite(d.getTime())?d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'—';
};
const validEvent=iso=>!!iso&&Number.isFinite(new Date(iso).getTime());
const sorted=date=>db.runs.filter(r=>r.date===date).sort((a,b)=>timeM(a.pu)-timeM(b.pu));
const isClosed=r=>['Completed','Exception','Canceled','Canceled at Door','No-show'].includes(r.status);
const forecasts=date=>{try{return window.SerenityDayForecast.getSnapshot(date)||[]}catch{return []}};
const durationM=(run)=>Number.isSafeInteger(db.forecastDriveMinutes?.[run.id])?db.forecastDriveMinutes[run.id]:
 Number.isSafeInteger(db.forecastV4?.trip)?db.forecastV4.trip:20;
const operationalTime=(r)=>window.SerenityOffice?.effective?.(r)||{status:'unknown',pickup:timeM(r.pu)};
const holidayInfo=date=>{
 const x=new Date(date+'T12:00:00');if(!Number.isFinite(x.getTime()))return null;
 const mm=x.getMonth()+1,dd=x.getDate(),dow=x.getDay();
 const nth=(day,week)=>dow===day&&Math.floor((dd-1)/7)+1===week;
 const last=day=>dow===day&&new Date(x.getFullYear(),x.getMonth(),dd+7).getMonth()!==x.getMonth();
 if(mm===11&&dd===11)return 'Veterans Day';
 if(mm===1&&dd===1)return 'New Year’s Day';
 if(mm===6&&dd===19)return 'Juneteenth';
 if(mm===7&&dd===4)return 'Independence Day';
 if(mm===12&&dd===25)return 'Christmas Day';
 if(mm===11&&nth(4,4))return 'Thanksgiving';
 if(mm===5&&last(1))return 'Memorial Day';
 if(mm===9&&nth(1,1))return 'Labor Day';
 if(mm===1&&nth(1,3))return 'Martin Luther King Jr. Day';
 if(mm===2&&nth(1,3))return 'Washington’s Birthday';
 if(mm===10&&nth(1,2))return 'Columbus Day / Indigenous Peoples’ Day';
 return null;
};

let page='overview',utility=null;
const shell=document.createElement('div');
shell.id='v7-shell';shell.className='v7-shell';
shell.innerHTML='<div class="v7-shell-top"><div class="v7-brand"><span class="v7-brand-icon">S</span>'+
 '<div><div class="v7-brand-eyebrow">SERENITY / DRIVER OPERATIONS</div><strong>Serenity Dispatch OS</strong></div></div>'+
 '<div class="v7-tabs" role="navigation" aria-label="Main pages">'+
 '<button id="v7-tab-overview" type="button" data-v7-page="overview">Overview</button>'+
 '<button id="v7-tab-manifest" type="button" data-v7-page="manifest">Manifest</button>'+
 '<button id="v7-tab-customer" type="button" data-v7-page="customer">Customer</button>'+
 '</div><div class="v7-date-slot" id="v7-date-slot"></div></div>'+
 '<div class="v7-ridebar"><span class="v7-live-pin"></span><div class="v7-ride-summary"><strong id="v7-ride-state">Checking current run</strong>'+
 '<span id="v7-ride-detail">Status comes from actual event taps</span></div>'+
 '<button id="v7-open-current" type="button">Open run</button></div>';
main.prepend(shell);
const field=E('date')?.closest('.field');if(field)E('v7-date-slot').append(field);
const overview=document.createElement('section');overview.id='v7-overview';overview.className='v7-page';
overview.innerHTML='<div class="v7-page-heading"><div class="v7-kicker">01 / YOUR BIG PICTURE</div>'+
 '<h1>Good day. Here’s where you stand.</h1>'+
 '<p>Weather, progress, earnings estimates and what needs your attention.</p></div>'+
 '<div id="v7-holiday" class="v7-holiday hidden"></div>'+
 '<div class="v7-overview-hero"><div><span class="v7-eyebrow">UP NEXT</span><strong id="v7-next-label">Waiting for today’s manifest</strong>'+
 '<span id="v7-next-detail">Add a service date and import assignments.</span></div>'+
 '<div class="v7-overview-hero-actions"><button type="button" data-v7-page="manifest">View full manifest</button>'+
 '<button type="button" data-v7-page="customer">Open customer</button></div></div>'+
 '<div class="v7-kpi-grid">'+
 '<div class="v7-kpi"><span>Runs today</span><strong id="v7-count">—</strong><small id="v7-count-small">—</small></div>'+
 '<div class="v7-kpi"><span>Completed</span><strong id="v7-complete">—</strong><small>Actual completed assignments</small></div>'+
 '<div class="v7-kpi"><span>Estimated driver pay so far</span><strong id="v7-pay">—</strong><small>Recorded shift hours × hourly rate</small></div>'+
 '<div class="v7-kpi"><span>Projected driver pay</span><strong id="v7-pay-forecast">—</strong><small>Only when end-of-shift estimate is available</small></div>'+
 '</div>'+
 '<div class="v7-secondary-stats"><span>Completed trip tariff <b id="v7-tariff">—</b></span>'+
 '<span>Scheduled trip tariff <b id="v7-tariff-total">—</b></span>'+
 '<span>Scheduled mileage <b id="v7-miles">—</b></span>'+
 '<span>Expected back at base <b id="v7-return">—</b></span></div>'+
 '<div class="v7-overview-grid"><section class="v7-widget"><div class="v7-widget-heading"><h2>Weather & conditions</h2>'+
 '<span>National Weather Service</span></div><div id="v7-weather-host"></div></section>'+
 '<section class="v7-widget"><div class="v7-widget-heading"><h2>Today’s priorities</h2>'+
 '<button type="button" data-v7-page="manifest">View schedule</button></div>'+
 '<div id="v7-priorities"></div></section></div>'+
 '<div class="v7-lower-tools"><details id="v7-dispatch-extra"><summary>Detailed Dispatch Watch and productive downtime</summary>'+
 '<div id="v7-dispatch-host"></div></details>'+
 '<details id="v7-admin"><summary>Shift controls, vehicle, backups and customer directory</summary>'+
 '<div id="v7-admin-host"></div></details></div>';
roster.before(overview);

const manifestHeading=document.createElement('div');manifestHeading.className='v7-page-heading v7-manifest-heading';
manifestHeading.innerHTML='<div class="v7-kicker">02 / THE ENTIRE DAY</div><div class="v7-heading-row"><div>'+
 '<h1>Manifest</h1><p>Original schedule, projected arrivals and the consequence for your next run.</p></div>'+
 '<button type="button" id="v7-import-open">Import / update dispatch</button></div>';
roster.prepend(manifestHeading);
const manifestNotice=document.createElement('div');manifestNotice.id='v7-manifest-notice';manifestNotice.className='v7-manifest-notice';
manifestHeading.after(manifestNotice);
const manifestBoard=document.createElement('section');manifestBoard.id='v7-manifest-table';manifestBoard.className='v7-manifest-card';
manifestBoard.innerHTML='<div class="v7-list-heading"><div><h2>All assignments</h2><p id="v7-manifest-subtitle">Service-date schedule</p></div>'+
 '<div class="v7-list-stats"><span id="v7-manifest-risk">Checking forecast</span></div></div>'+
 '<div class="v7-table-scroll"><table class="v7-table"><thead><tr>'+
 '<th>RUN / ROUTE</th><th>OFFICE PICKUP</th><th>ARRIVAL · ETA / ACTUAL</th>'+
 '<th>OFFICE DROP-OFF / SERENITY ETA</th><th>NEXT RUN IMPACT</th><th>OPEN</th>'+
 '</tr></thead><tbody id="v7-manifest-rows"></tbody></table></div>'+
 '<div class="v7-table-key">Office times are the original manifest. Forecasts are estimates, not live traffic ETAs. Actual events are recorded using the Customer page.</div>';
manifestNotice.after(manifestBoard);
const officeHost=document.createElement('div');officeHost.id='v7-office-host';manifestBoard.after(officeHost);
const manifestTools=document.createElement('div');manifestTools.className='v7-manifest-tools';officeHost.after(manifestTools);
const routeSetup=document.createElement('details');routeSetup.id='v7-route-setup';routeSetup.className='v7-expand';
routeSetup.innerHTML='<summary>Route verification and travel planning</summary>';
manifestTools.append(routeSetup);
const importDetails=document.createElement('details');importDetails.id='v7-import-details';importDetails.className='v7-expand';
importDetails.innerHTML='<summary>Manifest import and screenshot review</summary>';
manifestTools.append(importDetails);

const customerHeading=document.createElement('section');customerHeading.className='v7-customer-heading';
customerHeading.innerHTML='<div class="v7-kicker">03 / ACTIVE ASSIGNMENT</div>'+
 '<div class="v7-heading-row"><div><h1>Customer</h1><p>All of the actions for one run, in one place.</p></div>'+
 '<label>Choose run<select id="v7-customer-picker"><option value="">No runs</option></select></label></div>'+
 '<div id="v7-customer-progress" class="v7-progress">Select a run to view its activity.</div>';
customer.prepend(customerHeading);

// Rehome existing functional modules instead of rebuilding their underlying state.
const wx=E('wx-panel');if(wx)E('v7-weather-host').append(wx);
const vehicle=E('vehicle-card');
const topRow=E('v5-top-row');if(topRow)E('v7-dispatch-host').append(topRow);
const originalControls=E('v5-legacy');if(originalControls)E('v7-admin-host').append(originalControls);
if(vehicle)E('v7-admin-host').append(vehicle);
const toolbar=originalHeader.querySelector('.bar');if(toolbar)E('v7-admin-host').prepend(toolbar);
const directory=E('directory');if(directory)E('v7-admin-host').append(directory);
const firstRoute=E('v5-first-review');if(firstRoute)routeSetup.append(firstRoute);
const morning=E('ms-panel');if(morning)routeSetup.append(morning);
const advanced=E('v6-advanced');if(advanced)routeSetup.append(advanced);
const importSection=E('import');if(importSection)importDetails.append(importSection);
const officeUI=E('office-approval');if(officeUI)officeHost.append(officeUI);
const oldBoard=E('v6-board');if(oldBoard){oldBoard.classList.add('v7-hidden-legacy');oldBoard.setAttribute('aria-hidden','true')}
const hero=E('v5-hero');if(hero){hero.classList.add('v7-hidden-legacy');hero.setAttribute('aria-hidden','true')}
const support=E('v5-support');if(support)support.classList.add('v7-hidden-legacy');
if(originalNav)originalNav.classList.add('v7-hidden-legacy');
if(originalStats)originalStats.classList.add('v7-hidden-legacy');
const oldBanner=E('banner');if(oldBanner)oldBanner.classList.add('v7-hidden-legacy');
originalHeader.classList.add('v7-hidden-legacy');
const noticeDisclaimer=document.createElement('p');noticeDisclaimer.className='v7-safety';
noticeDisclaimer.textContent='Planning aid only · No live Google Maps traffic integration or automatic passenger/office messaging. Verify actual routing and work with controls while safely stopped.';
main.append(noticeDisclaimer);
const runIndex=(run,runs)=>runs.findIndex(r=>r.id===run.id)+1;
function chosenRun(date){
 const runs=sorted(date),active=runs.filter(r=>!isClosed(r)&&(
  validEvent(r.events?.enroute)||validEvent(r.events?.arrived)||validEvent(r.events?.boarded)));
 if(active.length){
  active.sort((a,b)=>{
   const x=r=>Math.max(...['enroute','arrived','boarded'].map(k=>validEvent(r.events?.[k])?new Date(r.events[k]).getTime():0));
   return x(b)-x(a);
  });
  return {run:active[0],active:true};
 }
 const next=runs.find(r=>!isClosed(r));
 return {run:next||null,active:false};
}
function eventStatus(r){
 if(isClosed(r))return r.status;
 if(validEvent(r.events?.boarded))return 'Passenger onboard';
 if(validEvent(r.events?.arrived))return 'Arrived · waiting for passenger';
 if(validEvent(r.events?.enroute))return 'En route to pickup';
 return 'Not started';
}
function statusLastEvent(r){
 const ev=r.events||{};
 for(const k of ['boarded','arrived','enroute'])if(validEvent(ev[k]))return simpleTime(ev[k]);
 return null;
}
function currentRideHeader(date){
 const runs=sorted(date),{run,active}=chosenRun(date),num=run?runIndex(run,runs):null;
 if(!run){
  E('v7-ride-state').textContent='No active run';
  E('v7-ride-detail').textContent=runs.length?'All assignments closed for this date':'Import today’s manifest to begin';
  E('v7-open-current').disabled=true;return;
 }
 E('v7-open-current').disabled=false;
 const op=operationalTime(run),shift=op.status==='approved'?' · office agreed '+op.agreed:'';
 if(active){
  E('v7-ride-state').textContent='Run #'+num+' · '+eventStatus(run);
  E('v7-ride-detail').textContent='Pickup '+run.pu+shift+(statusLastEvent(run)?' · Last event '+statusLastEvent(run):'');
 }else{
  E('v7-ride-state').textContent='No active ride · Next Run #'+num;
  E('v7-ride-detail').textContent='Scheduled '+run.pu+shift+' · not started';
 }
}
function overviewUpdate(date,runs,f){
 const complete=runs.filter(r=>r.status==='Completed');
 const allFinished=runs.filter(isClosed).length;
 E('v7-count').textContent=String(runs.length);
 E('v7-count-small').textContent=(runs.length-allFinished)+' not yet closed';
 E('v7-complete').textContent=String(complete.length);
 const completedTariffs=complete.map(r=>r.tariff).filter(Number.isFinite),tariffs=runs.map(r=>r.tariff).filter(Number.isFinite);
 E('v7-tariff').textContent=completedTariffs.length?money(completedTariffs.reduce((a,b)=>a+b,0)):'Not supplied';
 E('v7-tariff-total').textContent=tariffs.length?money(tariffs.reduce((a,b)=>a+b,0)):'Not supplied';
 const miles=runs.map(r=>r.miles).filter(Number.isFinite);
 E('v7-miles').textContent=miles.length?miles.reduce((a,b)=>a+b,0).toFixed(1)+' mi':'Not supplied';
 const rate=Number(db.shift?.rate),started=db.shift?.start?new Date(db.shift.start):null;
 const validStart=started&&Number.isFinite(started.getTime())&&dateLocal(started)===date&&Number.isFinite(rate)&&rate>=0;
 const now=new Date(),ended=db.shift?.end?new Date(db.shift.end):null;
 const finish=ended&&Number.isFinite(ended.getTime())?ended:now;
 const hours=validStart?Math.max(0,(finish.getTime()-started.getTime())/36e5):null;
 E('v7-pay').textContent=hours!==null?money(hours*rate):'—';
 const latest=f[f.length-1],baseMinutes=db.morningConfig?.returnBase;
 const baseArrival=Number.isFinite(latest?.drop)&&Number.isSafeInteger(baseMinutes)?latest.drop+baseMinutes:null;
 const actualBase=db.morningDays?.[date]?.arriveBase;
 const baseTime=validEvent(actualBase)?new Date(actualBase):null;
 E('v7-return').textContent=baseTime?simpleTime(actualBase):clock(baseArrival);
 let futureHours=null;
 if(validStart){
  const futureEnd=baseTime||((baseArrival!==null)?(()=>{
   const d=new Date(date+'T00:00:00');d.setMinutes(baseArrival);return d;
  })():null);
  if(futureEnd&&Number.isFinite(futureEnd.getTime())){
    const projectedEnd=ended&&Number.isFinite(ended.getTime())?ended:
      new Date(Math.max(futureEnd.getTime(),now.getTime()));
    futureHours=Math.max(0,(projectedEnd.getTime()-started.getTime())/36e5);
  }
 }
 E('v7-pay-forecast').textContent=futureHours!==null?money(futureHours*rate):'—';
 const selected=chosenRun(date),r=selected.run;
 E('v7-next-label').textContent=r?
  (selected.active?'Current ride · Run #':'Next scheduled · Run #')+runIndex(r,runs):
  runs.length?'Your assigned runs are complete':'Waiting for today’s manifest';
 E('v7-next-detail').textContent=r?
  (selected.active?eventStatus(r)+' · ':'Pickup '+r.pu+' · ')+(r.puAddr||'Address not provided'):
  runs.length?'Record your return to base when finished':'Import one or two manifest screenshots to begin';
 const holiday=holidayInfo(date),label=E('v7-holiday');
 label.classList.toggle('hidden',!holiday);
 if(holiday)label.textContent=holiday+' · Traffic, facility hours and road closures may differ. Check Google Maps; Serenity does not apply an automatic holiday speed discount.';
 const late=f.filter(p=>p.state==='late'),unknown=f.filter(p=>p.state==='missing'),risk=f.filter(p=>p.state==='risk');
 let summary='';
 if(!runs.length)summary='<div class="v7-priority-empty">Import today’s manifest to check schedule feasibility.</div>';
 else{
  const lines=[];
  if(unknown.length)lines.push({type:'warn',title:unknown.length+' run(s) have unverified ETAs',
    note:'Check the first pickup route and later road durations before trusting the forecast.'});
  for(const p of late.slice(0,2)){
    const n=runIndex(p.r,runs);
    lines.push({type:'risk',title:'Run #'+n+' · '+p.late+' minutes late'+(p.approvalState==='approved'?' vs office-agreed pickup':''),
      note:p.approvalState==='unknown'?'Office approval unknown · verify before treating this as a dispatch error.':
      p.approvalState==='approved'?'Even approved later pickups can delay following runs.':'Review the next assignment and its driving time.'});
  }
  if(!late.length&&!unknown.length&&risk.length)lines.push({type:'warn',title:risk.length+' early-arrival target miss(es)',
    note:'Projected arrival is not 10 minutes early. Check routing and pickup readiness.'});
  if(!lines.length)lines.push({type:'good',title:'No projected pickup lateness under current inputs',
    note:'Later transfer times may still be provisional; confirm real conditions before relying on this.'});
  summary=lines.map(x=>'<div class="v7-priority '+x.type+'"><span class="v7-priority-dot"></span>'+
   '<div><strong>'+esc(x.title)+'</strong><p>'+esc(x.note)+'</p></div></div>').join('');
 }
 E('v7-priorities').innerHTML=summary;
}
function consequences(p,next,index){
 if(!p||!Number.isFinite(p.drop))return {tone:'unknown',head:'Impact unknown',note:'Earlier time not verified'};
 if(!next){
  const rtime=Number.isSafeInteger(db.morningConfig?.returnBase)?p.drop+db.morningConfig.returnBase:null;
  return {tone:'neutral',head:rtime===null?'Return to base not estimated':'Back to base '+clock(rtime),
   note:rtime===null?'Check final road time':'After final assignment'};
 }
 if(next.state==='missing')return {tone:'unknown',head:'Next run unestimated',note:'Check route inputs'};
 if(next.late>0)return {tone:'risk',head:'Next Run #'+(index+2)+' · '+next.late+'m late',note:'Projected, not an office-approved change'};
 if(next.targetMiss>0)return {tone:'warn',head:'Next Run #'+(index+2)+' · tight',note:next.targetMiss+'m behind 10-min-early goal'};
 const reposition=Number.isSafeInteger(db.forecastV4?.reposition)?db.forecastV4.reposition:15;
 const slack=Number.isFinite(next.target)?Math.floor(next.target-p.drop-reposition):null;
 return {tone:'good',head:slack===null?'Next run on target':Math.max(0,slack)+'m estimated cushion',
  note:'Assumes '+reposition+'m between stops'};
}
function manifestUpdate(date,runs,f){
 const byId=new Map(f.map(p=>[p.r.id,p]));
 const unknown=f.filter(p=>p.state==='missing').length,late=f.filter(p=>p.state==='late').length;
 E('v7-manifest-subtitle').textContent=runs.length+' assignments · '+date+
  ' · schedule and actual events remain separate';
 E('v7-manifest-risk').textContent=unknown?unknown+' travel checks needed':
  late?late+' projected late':'No projected late runs';
 const plannedRuns=runs.map((r,i)=>{
  const p=byId.get(r.id),op=operationalTime(r),closed=isClosed(r);
  const actualArrival=validEvent(r.events?.arrived)?simpleTime(r.events.arrived):null;
  const actualDrop=validEvent(r.events?.dropoff)?simpleTime(r.events.dropoff):null;
  const enroute=validEvent(r.events?.enroute)?simpleTime(r.events.enroute):null;
  const boarded=validEvent(r.events?.boarded)?simpleTime(r.events.boarded):null;
  const effect=consequences(p,f[i+1],i);
  const status=closed?'Closed':!p||p.state==='missing'?'Unknown':p.state==='late'?'Late':
   p.state==='risk'?'Early goal missed':'On target';
  const tone=closed?'done':p?.state==='late'?'risk':p?.state==='risk'?'warn':p?.state==='missing'?'unknown':'good';
  return '<tr class="v7-table-run v7-tone-'+tone+'">'+
   '<td><div class="v7-strong-line"><span class="v7-run-number">#'+(i+1)+'</span><b>'+esc(r.name)+'</b></div>'+
   '<small>'+esc(r.puAddr||'Pickup location unavailable')+'</small></td>'+
   '<td><div class="v7-table-time">'+esc(r.pu)+'</div>'+
   (op.status==='approved'?'<small class="v7-office-ok">Office agreed '+esc(op.agreed)+'</small>':
    op.status==='awaiting'?'<small>Office response pending</small>':'')+
   '<small>10-minute early goal '+clock(p?.target)+'</small></td>'+
   '<td><div class="v7-table-time '+(tone==='risk'?'v7-text-risk':'')+'">'+
   (actualArrival||clock(p?.arrival))+'</div>'+
   '<small>'+(actualArrival?'Actual curb arrival':'Serenity estimate')+'</small>'+
   '<span class="v7-row-chip '+tone+'">'+esc(status)+(p?.state==='late'?' · +'+p.late+'m':'')+'</span>'+
   (enroute?'<small>En route actual '+enroute+'</small>':'')+
   (boarded?'<small>Boarded actual '+boarded+'</small>':'')+'</td>'+
   '<td><small>Office: '+esc(r.du||'—')+'</small><div class="v7-table-time">'+
    (actualDrop||clock(p?.dropArrival??p?.drop))+'</div>'+
   '<small>'+(actualDrop?'Actual drop-off':'Estimated drop-off')+'</small>'+
   '<small>Clear for next ~'+clock(p?.drop)+'</small></td>'+
   '<td><div class="v7-impact '+effect.tone+'"><strong>'+esc(effect.head)+'</strong>'+
   '<small>'+esc(effect.note)+'</small></div></td>'+
   '<td><button type="button" class="v7-open-run" data-v7-run="'+esc(r.id)+'">Customer</button>'+
   '<button type="button" class="v7-open-office" data-v7-office="'+esc(r.id)+'">Office</button></td></tr>';
 });
 E('v7-manifest-rows').innerHTML=plannedRuns.length?plannedRuns.join(''):
  '<tr><td class="v7-empty" colspan="6">No runs on this date. Import your manifest to begin.</td></tr>';
 const first=runs[0],cfg=db.morningConfig||{},leg=db.morningFirstLegs?.[date];
 const checked=first&&leg&&leg.runId===first.id&&leg.pickupAddr===first.puAddr&&leg.garage===cfg.garage;
 const text=E('v7-manifest-notice');
 if(first&&!checked){
  text.classList.remove('hidden');
  text.innerHTML='<div><strong>First route needs verification</strong><p>Set the garage-to-first-pickup driving time from Google Maps before relying on today’s ETAs.</p></div>'+
   '<button type="button" id="v7-verify-route">Verify route</button>';
 }else if(first&&unknown){
  text.classList.remove('hidden');
  text.innerHTML='<div><strong>Some forecasts are unavailable</strong><p>Review actual events and trip durations.</p></div>'+
  '<button type="button" id="v7-show-planning">Review travel inputs</button>';
 }else text.classList.add('hidden');
}
function customerUpdate(date,runs){
 const select=E('v7-customer-picker'),old=select.value;
 const options=runs.map((r,i)=>'<option value="'+esc(r.id)+'">'+(i+1)+' · '+esc(r.name)+
  ' · '+esc(r.pu)+'</option>');
 select.innerHTML='<option value="">Select a run</option>'+options.join('');
 const chosen=runs.find(r=>r.id===db.active);
 if(chosen)select.value=chosen.id;
 else select.value='';
 const progress=E('v7-customer-progress');
 if(!chosen){progress.textContent='No customer selected. Choose a run from the menu or open a run in the Manifest.';return}
 const e=chosen.events||{},steps=[
  ['En route',e.enroute],['Arrived',e.arrived],['Boarded',e.boarded],['Drop-off',e.dropoff]
 ];
 progress.innerHTML=steps.map(([name,t],i)=>'<div class="v7-progress-step '+(validEvent(t)?'done':'')+'">'+
 '<span class="v7-step-number">'+(validEvent(t)?'✓':String(i+1))+'</span>'+
 '<div><strong>'+name+'</strong><small>'+simpleTime(t)+'</small></div></div>').join('');
}
function update(){
 const date=E('date')?.value;if(!date)return;
 const runs=sorted(date),f=forecasts(date);
 currentRideHeader(date);
 overviewUpdate(date,runs,f);
 manifestUpdate(date,runs,f);
 customerUpdate(date,runs);
 applyPage();
}
function applyPage(){
 overview.classList.toggle('hidden',page!=='overview');
 roster.classList.toggle('hidden',page!=='manifest');
 customer.classList.toggle('hidden',page!=='customer');
 for(const name of ['overview','manifest','customer']){
  const btn=E('v7-tab-'+name),on=page===name;
  btn.classList.toggle('active',on);btn.setAttribute('aria-current',on?'page':'false');
 }
 if(importSection)importSection.classList.toggle('hidden',utility!=='import');
 if(directory)directory.classList.toggle('hidden',utility!=='directory');
}
const legacyShow=show;
function navigate(dest){
 if(!['overview','manifest','customer'].includes(dest))dest='overview';
 page=dest;
 utility=null;
 if(dest==='customer'){
  const date=E('date')?.value;
  if(!sorted(date).some(r=>r.id===db.active)){
   const pick=chosenRun(date).run;
   if(pick){db.active=pick.id;save();}
  }
 }
 legacyShow(dest==='customer'?'customer':'roster');
 applyPage();
}
function openUtility(type){
 page=type==='import'?'manifest':'overview';
 utility=type;
 legacyShow('roster');
 if(type==='import'){importDetails.open=true;importDetails.scrollIntoView({block:'start',behavior:'smooth'})}
 else{E('v7-admin').open=true;directory?.scrollIntoView({block:'start',behavior:'smooth'})}
 applyPage();
}
show=function(name){
 if(name==='roster')return navigate('manifest');
 if(name==='customer')return navigate('customer');
 if(name==='import')return openUtility('import');
 if(name==='directory')return openUtility('directory');
 return navigate('overview');
};
function showOffice(id){
 page='manifest';
 utility=null;
 legacyShow('roster');
 applyPage();
 if(window.SerenityOfficeUI?.open)window.SerenityOfficeUI.open(id);
}
shell.addEventListener('click',event=>{
 const btn=event.target.closest('button');
 if(!btn)return;
 const p=btn.dataset.v7Page;
 if(p){event.preventDefault();event.stopImmediatePropagation();navigate(p);return}
 if(btn.id==='v7-open-current'){
  const run=chosenRun(E('date').value).run;
  if(run){db.active=run.id;save();navigate('customer')}
 }
},true);
main.addEventListener('click',event=>{
 const p=event.target.closest('button[data-v7-page]');
 if(p){event.preventDefault();event.stopImmediatePropagation();navigate(p.dataset.v7Page);return}
 const runButton=event.target.closest('button[data-v7-run]');
 if(runButton){event.preventDefault();event.stopImmediatePropagation();
  db.active=runButton.dataset.v7Run;save();navigate('customer');return}
 const officeButton=event.target.closest('button[data-v7-office]');
 if(officeButton){event.preventDefault();event.stopImmediatePropagation();showOffice(officeButton.dataset.v7Office);return}
 if(event.target.closest('#v7-import-open')){event.preventDefault();event.stopImmediatePropagation();openUtility('import');return}
 if(event.target.closest('#v7-verify-route,#v7-show-planning')){
  event.preventDefault();event.stopImmediatePropagation();routeSetup.open=true;
  routeSetup.scrollIntoView({block:'center',behavior:'smooth'});return;
 }
},true);
E('v7-customer-picker').addEventListener('change',value=>{
 const id=value.target.value;if(!id)return;
 db.active=id;save();render();
});
const oldOfficeOpen=window.SerenityOfficeUI?.open;
if(oldOfficeOpen)window.SerenityOfficeUI.open=function(id){if(page!=='manifest'){page='manifest';legacyShow('roster');applyPage()}
 oldOfficeOpen(id);
};
const oldRender=render;
render=function(){oldRender();update();};
E('date')?.addEventListener('change',update);
window.addEventListener('serenity-weather-updated',update);
window.addEventListener('serenity-location-refresh',update);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)update()});
const ticker=setInterval(()=>{if(!document.hidden)update()},60000);
window.addEventListener('pagehide',()=>clearInterval(ticker));
navigate('overview');
window.SerenityThreePage={navigate,refresh:update,getPage:()=>page};
})();