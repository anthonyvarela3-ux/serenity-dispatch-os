/* Serenity v7: three intentional workspaces; preserve legacy services as data engines.
   Overview = decision summary; Manifest = operational truth table;
   Customer = the active passenger workflow. No external data is sent. */
(()=>{
'use strict';
if(typeof db==='undefined'||typeof render!=='function'||!window.SerenityDayForecast)return;
const E=id=>document.getElementById(id);
const root=document.documentElement, main=document.querySelector('main'),header=document.querySelector('header');
const roster=E('roster'),customer=E('customer');
if(!main||!header||!roster||!customer)return;
root.classList.add('v7-app');
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const clock=n=>{if(!Number.isFinite(n))return '—';const k=((Math.round(n)%1440)+1440)%1440,h=Math.floor(k/60);return (h%12||12)+':'+String(k%60).padStart(2,'0')+(h>=12?' PM':' AM')+(n>=1440?' +1d':'');};
const eventClock=s=>{if(!s)return null;const dt=new Date(s);return Number.isFinite(dt.getTime())?dt.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):null};
const money=n=>Number.isFinite(n)?'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
const runsFor=day=>db.runs.filter(r=>r.date===day).sort((a,b)=>timeM(a.pu)-timeM(b.pu));
const snap=day=>{try{return window.SerenityDayForecast?.getSnapshot?.(day)||[]}catch{return []}};
const titleCase=s=>s==='light'?'Lighter than usual':s==='heavy'?'Heavier than usual':s==='normal'?'Normal for this time':'Not yet recorded';
const nav=document.createElement('nav');nav.id='v7-navigation';nav.setAttribute('aria-label','Serenity main pages');
nav.innerHTML='<div class="v7-brand"><div class="v7-emblem">S</div><div><b>SERENITY</b><small>DRIVER OPERATIONS</small></div></div>'+
'<div class="v7-nav-items"><button type="button" data-v7-page="overview">01 · Overview</button>'+
'<button type="button" data-v7-page="manifest">02 · Manifest</button>'+
'<button type="button" data-v7-page="customer">03 · Customer</button></div>'+
'<div class="v7-date" id="v7-date-slot"></div>';
header.after(nav);
const dateField=E('date')?.closest('.field');
if(dateField)E('v7-date-slot').append(dateField);
const alertHost=document.createElement('div');alertHost.id='v7-alert-host';
nav.after(alertHost);
const overview=document.createElement('section');overview.id='v7-overview';overview.className='v7-page';
overview.innerHTML=
 '<div class="v7-page-heading"><div><div class="v7-eyebrow">TODAY AT A GLANCE</div><h2>Overview</h2><p>One clear picture of your shift, without the entire manifest in your way.</p></div>'+
 '<div class="v7-page-actions"><button data-v7-action="import" type="button" class="primary">Import manifest</button>'+
 '<button data-v7-action="backup" type="button">Export backup</button></div></div>'+
 '<div class="v7-context-line" id="v7-context-line"></div>'+
 '<div class="v7-kpis" role="group" aria-label="Shift numbers">'+
 '<div class="v7-kpi"><small>Assigned runs</small><strong id="v7-assigned">—</strong><span id="v7-remain">— remaining</span></div>'+
 '<div class="v7-kpi"><small>Completed runs</small><strong id="v7-complete">—</strong><span id="v7-progress">—</span></div>'+
 '<div class="v7-kpi"><small>Completed trip tariffs</small><strong id="v7-earned">—</strong><span>Not verified as paid</span></div>'+
 '<div class="v7-kpi"><small>Potential total tariffs</small><strong id="v7-potential">—</strong><span id="v7-priced">Based on supplied fares</span></div>'+
 '<div class="v7-kpi"><small>Scheduled mileage</small><strong id="v7-mileage">—</strong><span id="v7-mileage-note">Manifest totals</span></div>'+
 '<div class="v7-kpi"><small>Driver labor estimate</small><strong id="v7-labor">—</strong><span id="v7-labor-info">Recorded shift hours × hourly rate</span></div></div>'+
 '<div class="v7-overview-grid"><section class="v7-surface" id="v7-next"><div class="v7-tile-head"><h3>Next assignment</h3><span class="v7-eyebrow" id="v7-next-tag">SHIFT STATUS</span></div><div id="v7-next-content"></div></section>'+
 '<section class="v7-surface" id="v7-timeline"><div class="v7-tile-head"><h3>Morning & return</h3><span class="v7-eyebrow">DRIVING PLAN</span></div>'+
 '<div class="v7-timeline-stats"><div><small>Leave garage</small><strong id="v7-leave">—</strong></div><div><small>First pickup</small><strong id="v7-first">—</strong></div><div><small>Back at base</small><strong id="v7-return">—</strong></div></div>'+
 '<p class="v7-explain" id="v7-timeline-note">Verify the first-leg drive before relying on these times.</p></section></div>'+
 '<div class="v7-overview-grid v7-overview-below"><section class="v7-surface" id="v7-weather-wrap"><div class="v7-tile-head"><h3>Weather & holiday context</h3><span class="v7-eyebrow">NWS / SERVICE CALENDAR</span></div>'+
 '<div id="v7-weather-target"></div><div class="v7-holiday"><strong id="v7-holiday-title">Checking calendar</strong><p id="v7-holiday-copy"></p>'+
 '<label>Observed traffic today <select id="v7-traffic"><option value="unknown">Not recorded</option><option value="light">Lighter than usual</option><option value="normal">Normal</option><option value="heavy">Heavier than usual</option></select></label>'+
 '<p id="v7-traffic-source" class="v7-explain"></p></div></section>'+
 '<section class="v7-surface" id="v7-priority-wrap"><div class="v7-tile-head"><h3>Priority checks</h3><span class="v7-eyebrow">PAYMENT & DISPATCH</span></div>'+
 '<div id="v7-priority-content">Preparing checks…</div><button type="button" data-v7-page="manifest">Review complete manifest</button></section></div>'+
 '<div class="v7-essentials" id="v7-essentials"></div>'+
 '<details class="v7-drawer" id="v7-ops-settings"><summary>Morning plan, return-to-base & travel setup</summary><div id="v7-ops-target"></div></details>'+
 '<details class="v7-drawer"><summary>Dispatch Watch and downtime options</summary><div id="v7-dispatch-target"></div></details>'+
 '<details class="v7-drawer"><summary>Vehicle, shift controls, official roster & tools</summary><div class="v7-misc"><div id="v7-vehicle-target"></div><div id="v7-shift-target"></div><div id="v7-original-target"></div>'+
 '<div class="v7-tool-buttons"><button data-v7-action="import" type="button">Import / review screenshot</button><button data-v7-action="directory" type="button">Passenger knowledge base</button>'+
 '<button data-v7-action="backup" type="button">Export backup</button></div></div></details>'+
 '<p class="v7-caution">Serenity stores passenger data locally in this browser. Backups are not encrypted. Its timestamps do not update RoutingBox or confirm billing, and it does not have a live traffic-routing API.</p>';
main.insertBefore(overview,roster);
const originalHero=E('v5-hero');
const firstCheck=E('v5-first-review');
if(firstCheck)E('v7-essentials').append(firstCheck);
const ms=E('ms-panel');if(ms)E('v7-ops-target').append(ms);
const topRow=E('v5-top-row');if(topRow)E('v7-dispatch-target').append(topRow);
const weather=E('wx-panel');if(weather)E('v7-weather-target').append(weather);
const vehicle=E('vehicle-card');if(vehicle)E('v7-vehicle-target').append(vehicle);
const shift=E('shift-start')?.closest('.bar');if(shift)E('v7-shift-target').append(shift);
const originalDetails=E('v5-legacy');if(originalDetails)E('v7-original-target').append(originalDetails);
const office=E('office-approval');if(office)customer.append(office);
const manifest=document.createElement('section');manifest.id='v7-manifest';manifest.className='v7-manifest-view';
manifest.innerHTML=
 '<div class="v7-page-heading"><div><div class="v7-eyebrow">EVERY RUN / ONE TIMELINE</div><h2>Manifest</h2>'+
 '<p>Original office times, projected arrivals, actual event stamps, and the next-run impact.</p></div>'+
 '<div class="v7-page-actions"><button type="button" data-v7-action="import">Import / update</button>'+
 '<button type="button" data-v7-action="review">Check first route</button></div></div>'+
 '<div class="v7-m-summary" id="v7-m-summary">Checking run feasibility…</div>'+
 '<div class="v7-table-scroll"><table class="v7-table"><thead><tr>'+
 '<th># / Passenger</th><th>Office pickup</th><th>Serenity pickup</th><th>Office drop-off</th>'+
 '<th>Serenity destination / clear</th><th>Actual events</th><th>Impact on next</th><th>Open</th>'+
 '</tr></thead><tbody id="v7-manifest-rows"></tbody></table></div>'+
 '<div class="v7-table-foot">Scheduled = original manifest · ETA = modeled prediction · Actual = driver-recorded time. Later-road durations are often provisional. A confirmed late pickup changes the operational target, not the original office record.</div>'+
 '<div id="v7-advanced-target"></div>';
roster.prepend(manifest);
const advanced=E('v6-advanced');if(advanced)E('v7-advanced-target').append(advanced);
// Customer existing content continues to use the original messaging, notes,
// route links, verification, event and exception handlers.
const customerTop=document.createElement('div');customerTop.id='v7-customer-top';
customer.prepend(customerTop);
const workflow=document.createElement('div');workflow.id='v7-customer-flow';customerTop.after(workflow);
const utility=document.createElement('div');utility.id='v7-utility';utility.className='hidden';
utility.setAttribute('role','dialog');utility.setAttribute('aria-modal','true');
utility.setAttribute('aria-label','Serenity tools');
utility.innerHTML='<div class="v7-utility-shell"><div class="v7-utility-head"><strong id="v7-utility-title">Serenity Tools</strong>'+
 '<button id="v7-close-utility" type="button">Close tools</button></div><div id="v7-utility-inner"></div></div>';
document.body.append(utility);
for(const name of ['import','directory']){const node=E(name);if(node){node.classList.add('hidden');E('v7-utility-inner').append(node);}}
let current='overview';
function closeUtility(){utility.classList.add('hidden');E('import')?.classList.add('hidden');E('directory')?.classList.add('hidden');}
function showUtility(type){
 if(type!=='import'&&type!=='directory')return;
 E('v7-utility-title').textContent=type==='import'?'Import and confirm manifest':'Passenger knowledge base';
 E('import')?.classList.toggle('hidden',type!=='import');E('directory')?.classList.toggle('hidden',type!=='directory');
 utility.classList.remove('hidden');
 E('v7-close-utility').focus();
}
function navigate(page){
 if(page==='roster')page='manifest';
 if(page!=='overview'&&page!=='manifest'&&page!=='customer')page='overview';
 closeUtility();
 current=page;
 overview.classList.toggle('hidden',page!=='overview');
 roster.classList.toggle('hidden',page!=='manifest');
 customer.classList.toggle('hidden',page!=='customer');
 E('v7-navigation').querySelectorAll('[data-v7-page]').forEach(btn=>{
  const active=btn.dataset.v7Page===page;
  btn.classList.toggle('active',active);
  btn.setAttribute('aria-current',active?'page':'false');
 });
 if(page==='customer'&&!db.active){
  const next=runsFor(E('date').value).find(r=>r.status!=='Completed'&&r.status!=='Exception');
  if(next){db.active=next.id;save();}
 }
 render();
 if(page==='customer')E('customer-content')?.scrollIntoView({block:'start'});
 else window.scrollTo?.({top:0,behavior:'instant'});
}
const originalShow=show;
show=function(page){
 if(page==='import'||page==='directory'){showUtility(page);return}
 navigate(page==='roster'?'manifest':page);
};
const currentDate=()=>E('date')?.value;
const metric=(id,s)=>{const el=E(id);if(el)el.textContent=s};
function overviewRefresh(date,runs,forecast){
 const closed=runs.filter(r=>r.status==='Completed');
 const priced=runs.filter(r=>Number.isFinite(r.tariff));
 const completedPriced=closed.filter(r=>Number.isFinite(r.tariff));
 const sum=a=>a.reduce((v,r)=>v+r.tariff,0);
 const mileage=runs.filter(r=>Number.isFinite(r.miles));
 metric('v7-assigned',String(runs.length));
 metric('v7-remain',(runs.length-closed.length)+' not completed');
 metric('v7-complete',String(closed.length));
 metric('v7-progress',runs.length?Math.round(closed.length/runs.length*100)+'% of assignments':'Import your dispatch');
 metric('v7-earned',completedPriced.length?money(sum(completedPriced)):closed.length?'—':money(0));
 metric('v7-potential',priced.length?money(sum(priced)):'—');
 metric('v7-priced',priced.length+' of '+runs.length+' tariffs supplied · not verified paid');
 metric('v7-mileage',mileage.length?mileage.reduce((v,r)=>v+r.miles,0).toFixed(1)+' mi':'—');
 metric('v7-mileage-note',mileage.length+'/'+runs.length+' mileage entries');
 const hrs=db.shift?.start?Math.max(0,(new Date(db.shift.end||Date.now())-new Date(db.shift.start))/3600000):null;
 metric('v7-labor',hrs!==null?money(hrs*(Number.isFinite(db.shift.rate)?db.shift.rate:22.5)):'—');
 metric('v7-labor-info',hrs===null?'Shift not started in Serenity':hrs.toFixed(1)+'h recorded · separate from trip tariffs');
 const first=runs[0],last=forecast[forecast.length-1],record=db.morningDays?.[date]||{};
 const morning=window.SerenityMorning?.plan?.(date);
 const returnMinute=Number.isSafeInteger(db.morningConfig?.returnBase)?db.morningConfig.returnBase:null;
 const baseActual=eventClock(record.arriveBase);
 metric('v7-leave',clock(morning?.departGarage));
 metric('v7-first',first?(window.SerenityOffice?.effective?.(first)?.agreed||first.pu):'—');
 metric('v7-return',baseActual|| (Number.isFinite(last?.drop)&&returnMinute!==null?clock(last.drop+returnMinute):'—'));
 metric('v7-timeline-note',first?'Verify Maps road times: the first leg requires a route-specific entry, and back-to-base needs its own duration.':'Import runs to calculate your shift.');
 const next=runs.find(r=>r.status!=='Completed'&&r.status!=='Exception');
 const pred=forecast.find(f=>f.r?.id===next?.id);
 if(next){
  const idx=runs.findIndex(r=>r.id===next.id)+1,late=pred?.state==='late';
  E('v7-next-tag').textContent='RUN #'+idx+' / '+next.status.toUpperCase();
  E('v7-next-content').innerHTML=
   '<div class="v7-next-person">'+esc(next.name)+'</div>'+
   '<div class="v7-next-time"><div><small>Office pickup</small><strong>'+esc(next.pu)+'</strong></div>'+
   '<div><small>Serenity ETA</small><strong class="'+(late?'v7-bad':'')+'">'+clock(pred?.arrival)+'</strong></div></div>'+
   '<p class="v7-next-address">'+esc(next.puAddr||'Pickup address missing')+'</p>'+
   '<p class="v7-inline-note">'+(pred?.state==='missing'?'Driving estimate unverified':
      pred?.late>0?'Projected '+pred.late+' minutes after the operating pickup time':
      'Prediction is based on supplied/manual road times')+'</p>'+
   '<button type="button" class="primary" data-v7-open="'+esc(next.id)+'">Open customer & trip controls</button>';
 }else{
  E('v7-next-tag').textContent='NO ACTIVE ASSIGNMENT';
  E('v7-next-content').innerHTML='<div class="v7-next-person">'+(runs.length?'All assignments closed':'Import your manifest')+'</div>'+
    '<p class="v7-inline-note">Open Manifest to inspect today’s completed or upcoming runs.</p>'+
    '<button type="button" data-v7-page="manifest">View manifest</button>';
 }
 const holiday=window.SerenityHolidays?.get?.(date);
 metric('v7-holiday-title',holiday?holiday.name:'Regular service-calendar day');
 metric('v7-holiday-copy',holiday?
  'Federal holiday. Congestion, medical facility hours and road closures may differ. Check current Google Maps routes; no automatic holiday travel-time discount is applied.':
  'No federal holiday detected for this service date. Local events and unusual traffic may still matter.');
 const observed=db.dayObservations?.[date]?.traffic||'unknown';
 E('v7-traffic').value=['unknown','light','normal','heavy'].includes(observed)?observed:'unknown';
 metric('v7-traffic-source','Driver observation: '+titleCase(observed)+'. Informational only; it does not override road-duration estimates.');
 metric('v7-context-line',(holiday?'HOLIDAY · '+holiday.name+'   |   ':'')+
   runs.length+' assigned · '+closed.length+' completed · '+titleCase(observed)+' traffic reported'+
   ' · Route ETAs are not live traffic');
 const unknown=forecast.filter(p=>p.state==='missing').length;
 const late=forecast.filter(p=>p.state==='late'&&p.r?.status!=='Completed').length;
 const over30=runs.filter(r=>r.events?.arrived&&!r.events?.boarded&&!['Completed','Exception'].includes(r.status)&&
  Date.now()-new Date(r.events.arrived).getTime()>=30*60000).length;
 const text=[];
 if(over30)text.push('<div class="v7-priority v7-priority-danger"><b>'+over30+' trip status check(s) overdue</b><p>Arrived over 30 minutes ago, without a boarding event. Verify the correct RoutingBox coding.</p></div>');
 if(unknown)text.push('<div class="v7-priority v7-priority-warn"><b>'+unknown+' ETA(s) unverified</b><p>Check the garage-to-first-pickup duration and later leg assumptions.</p></div>');
 if(late)text.push('<div class="v7-priority v7-priority-warn"><b>'+late+' projected late pickup(s)</b><p>Check office-approved revisions before contacting customers.</p></div>');
 if(!text.length)text.push('<div class="v7-priority v7-priority-good"><b>No immediate forecast exceptions identified</b><p>Traffic estimates remain provisional; review the manifest before relying on any free time.</p></div>');
 E('v7-priority-content').innerHTML=text.join('');
}
function impact(p,next,idx){
 if(!p||p.state==='missing'||!Number.isFinite(p.drop))return '<span class="v7-unknown">Unknown · verify travel</span>';
 if(!next){
  const back=Number.isSafeInteger(db.morningConfig?.returnBase)?db.morningConfig.returnBase:null;
  return back===null?'Return-to-base leg unverified':'Back at base ~'+clock(p.drop+back);
 }
 if(next.state==='missing')return 'Next ETA unverified';
 if(next.late>0)return '<strong class="v7-bad">Run #'+(idx+2)+' +'+next.late+'m late</strong>';
 if(next.targetMiss>0)return '<span class="v7-amber">Run #'+(idx+2)+' early goal missed</span>';
 const reposition=Number.isSafeInteger(db.forecastV4?.reposition)?db.forecastV4.reposition:15;
 const slack=Math.floor(next.target-p.drop-reposition);
 return slack>=0?slack+'m estimated slack':'Tight connection · check Maps';
}
function manifestRefresh(date,runs,results){
 const byId=new Map(results.map(x=>[x.r.id,x]));
 const late=results.filter(x=>x.state==='late').length,unknown=results.filter(x=>x.state==='missing').length;
 metric('v7-m-summary',runs.length+' runs · '+late+' projected late · '+unknown+' ETA checks needed · '+runs.filter(r=>r.status==='Completed').length+' completed'+
  (window.SerenityHolidays?.get?.(date)?' · HOLIDAY — verify traffic & facility hours':''));
 E('v7-manifest-rows').innerHTML=runs.length?runs.map((r,i)=>{
  const p=byId.get(r.id),n=results[i+1],approved=window.SerenityOffice?.effective?.(r);
  const done=r.status==='Completed',exception=r.status==='Exception';
  const arr=eventClock(r.events?.arrived),enr=eventClock(r.events?.enroute),
        board=eventClock(r.events?.boarded),drop=eventClock(r.events?.dropoff);
  const state=done?'Complete':exception?'Exception':board?'Onboard':arr?'At pickup':enr?'En route':r.status||'Scheduled';
  const tone=done?'done':exception||p?.state==='late'?'late':p?.state==='risk'?'risk':p?.state==='missing'?'missing':'on';
  const eta=arr||clock(p?.arrival);
  const predictedDrop=drop||clock(p?.dropArrival);
  const clear=clock(p?.drop);
  const rowEsc=esc(r.id),officeTime=esc(r.pu);
  return '<tr class="v7-row v7-'+tone+'" data-v7-row="'+rowEsc+'" tabindex="0">'+
  '<td><div class="v7-row-index">#'+(i+1)+'</div><strong>'+esc(r.name)+'</strong><small>'+esc(state)+'</small></td>'+
  '<td><b>'+officeTime+'</b>'+ (approved?.status==='approved'?'<small class="v7-agreed">Office agreed '+esc(approved.agreed)+'</small>':
   approved?.status==='awaiting'?'<small>Office reply pending</small>':'')+'</td>'+
  '<td><b class="'+(p?.state==='late'?'v7-bad':'')+'">'+eta+'</b>'+
  '<small>'+(arr?'Actual arrival':p?.state==='missing'?'Not estimated':p?.late>0?'+'+p.late+'m after target':p?.targetMiss>0?'Early goal missed':'Forecast · 10m early goal')+'</small></td>'+
  '<td><b>'+esc(r.du||'—')+'</b><small>Original office field</small></td>'+
  '<td><b>'+predictedDrop+'</b><small>'+(drop?'Actual drop-off':'Forecast destination')+'</small><small>Vehicle clear ~'+clear+'</small></td>'+
  '<td class="v7-events">'+(enr?'<span>En route '+enr+'</span>':'')+(arr?'<span>Arrived '+arr+'</span>':'')+
   (board?'<span>Boarded '+board+'</span>':'')+(drop?'<span>Drop '+drop+'</span>':'')+
   (!enr&&!arr&&!board&&!drop?'<small>No actuals yet</small>':'')+'</td>'+
  '<td>'+impact(p,n,i)+'</td>'+
  '<td><button type="button" data-v7-open="'+rowEsc+'">Open run</button></td></tr>';
 }).join(''):'<tr><td colspan="8" class="v7-empty">Import today’s manifest to begin.</td></tr>';
}
function customerRefresh(date,runs,results){
 const run=db.runs.find(r=>r.id===db.active);
 if(!run||run.date!==date){
  E('v7-customer-top').innerHTML='<div class="v7-page-heading"><div><div class="v7-eyebrow">ACTIVE ASSIGNMENT</div><h2>Customer</h2><p>Choose a run on the Manifest page to open passenger controls.</p></div><button data-v7-page="manifest">Open Manifest</button></div>';
  E('v7-customer-flow').innerHTML='';return;
 }
 const p=results.find(x=>x.r.id===run.id),idx=runs.findIndex(x=>x.id===run.id)+1;
 const completed=['Completed','Exception'].includes(run.status);
 E('v7-customer-top').innerHTML='<div class="v7-page-heading"><div><div class="v7-eyebrow">RUN #'+idx+' / DRIVER ACTIONS</div><h2>Customer</h2>'+
 '<p>'+esc(run.name)+' · Office pickup '+esc(run.pu)+' · Serenity arrival '+clock(p?.arrival)+'</p></div>'+
 '<button data-v7-page="manifest" type="button">Back to Manifest</button></div>';
 const states=[
  ['enroute','En route',run.events?.enroute],['arrived','Arrived',run.events?.arrived],
  ['boarded','Boarded',run.events?.boarded],['dropoff','Drop off',run.events?.dropoff]
 ];
 E('v7-customer-flow').innerHTML='<div class="v7-flow-steps">'+states.map(([kind,title,when],i)=>
   '<button type="button" class="v7-flow-step'+(when?' done':'')+'" data-v7-event="'+kind+'" data-v7-id="'+esc(run.id)+'"'+(when||completed?' disabled':'')+'>'+
   '<span class="v7-flow-number">'+(when?'✓':i+1)+'</span><span>'+title+'</span>'+
   '<small>'+ (when?eventClock(when):'Mark now')+'</small></button>').join('')+'</div>'+
   '<div class="v7-flow-helper"><span>These buttons log your actual events locally; confirm the official trip coding separately in RoutingBox.</span>'+
   '<button data-v7-office="'+esc(run.id)+'" type="button">Office approval</button>'+
   '<button data-v7-action="exception" type="button"'+(completed?' disabled':'')+'>No-show / exception</button></div>';
}
function refresh(){
 const day=currentDate();if(!day)return;
 const runs=runsFor(day),forecast=snap(day);
 overviewRefresh(day,runs,forecast);
 manifestRefresh(day,runs,forecast);
 customerRefresh(day,runs,forecast);
}
const oldRender=render;
render=function(){oldRender();refresh();};
const existingCustomerRender=renderCustomer;
renderCustomer=function(){existingCustomerRender();};
E('v7-navigation').addEventListener('click',event=>{
 const button=event.target.closest('[data-v7-page]');
 if(button)navigate(button.dataset.v7Page);
});
document.addEventListener('click',event=>{
 const button=event.target.closest?.('button');
 if(button?.dataset.v7Page){event.preventDefault();navigate(button.dataset.v7Page);return}
 if(button?.dataset.v7Open){
  event.preventDefault();db.active=button.dataset.v7Open;save();navigate('customer');return;
 }
 if(button?.dataset.v7Action){
  event.preventDefault();
  const type=button.dataset.v7Action;
  if(type==='import'||type==='directory')showUtility(type);
  else if(type==='backup')E('export')?.click();
  else if(type==='review'){navigate('overview');E('v5-first-review')?.scrollIntoView({block:'center'});}
  else if(type==='exception')E('exception')?.click();
  return;
 }
 if(button?.dataset.v7Office){event.preventDefault();window.SerenityOfficeUI?.open?.(button.dataset.v7Office);return}
 if(button?.dataset.v7Event){
  event.preventDefault();event.stopImmediatePropagation();
  const run=db.runs.find(r=>r.id===button.dataset.v7Id);
  window.SerenityEvents?.markEvent?.(run,button.dataset.v7Event);
 }
},true);
E('v7-manifest-rows').addEventListener('click',event=>{
 const row=event.target.closest('tr[data-v7-row]');
 if(row&&!event.target.closest('button')){db.active=row.dataset.v7Row;save();navigate('customer')}
});
E('v7-manifest-rows').addEventListener('keydown',event=>{
 if((event.key==='Enter'||event.key===' ')&&event.target.matches('tr[data-v7-row]')){
  event.preventDefault();db.active=event.target.dataset.v7Row;save();navigate('customer');
 }
});
E('v7-traffic').addEventListener('change',event=>{
 const traffic=event.target.value;
 if(!['unknown','light','normal','heavy'].includes(traffic))return;
 db.dayObservations=db.dayObservations||{};
 db.dayObservations[currentDate()]={traffic,updatedAt:new Date().toISOString()};
 save();render();
});
E('v7-close-utility').addEventListener('click',closeUtility);
utility.addEventListener('click',event=>{if(event.target===utility)closeUtility();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!utility.classList.contains('hidden'))closeUtility();});
E('date')?.addEventListener('change',refresh);
window.addEventListener('serenity-weather-updated',refresh);
window.addEventListener('serenity-location-refresh',refresh);
window.addEventListener('serenity-trip-event',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
const pulse=setInterval(()=>{if(!document.hidden)refresh();},60000);
window.addEventListener('pagehide',()=>clearInterval(pulse));
window.SerenityPages={navigate,refresh,showUtility,current:()=>current};
navigate('overview');
})();