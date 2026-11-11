/* Serenity Beta 5: Driver Command Center.
 * Browser-only UI; doesn't write RoutingBox or transmit messages.
 * Forecast is driver-input/provisional until a traffic routing provider is connected.
 */
(()=>{
'use strict';
if(typeof db==='undefined'||typeof render!=='function'||typeof show!=='function')return;
const roster=document.getElementById('roster');
if(!roster||!document.getElementById('sf-card'))return;
const E=id=>document.getElementById(id);
const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clock=m=>{
 if(!Number.isFinite(m))return '—';
 const val=((Math.round(m)%1440)+1440)%1440,h=Math.floor(val/60);
 return String(h%12||12)+':'+String(val%60).padStart(2,'0')+(h<12?' AM':' PM')+(m>=1440?' +1d':m<0?' −1d':'');
};
const intOr=(x,other)=>Number.isSafeInteger(x)?x:other;
const legacy=[...roster.children].find(node=>node.classList.contains('panel')&&!node.id);
const hero=document.createElement('section');hero.className='v5-hero';hero.id='v5-hero';
hero.innerHTML='<div class="v5-top"><div><div class="v5-overline">SERENITY / DRIVER COMMAND</div><div class="v5-title" id="v5-title">Your day, under control.</div><div class="v5-subtitle" id="v5-subtitle">Import your dispatch to build the full shift automatically.</div></div>'+
'<div class="v5-top-actions" id="v5-top-actions"><button type="button" id="v5-import">Import manifest</button></div></div>'+
'<div class="v5-data-fresh"><span class="v5-dot"></span><span id="v5-data-status">GPS position is not a Google Maps road ETA. Driving times may be provisional.</span></div>'+
'<div class="v5-microstats" aria-label="Shift operational metrics"><span>Completed <b id="v5-stat-completed">—</b></span><span>Scheduled miles <b id="v5-stat-miles">—</b></span><span>Completed tariff <b id="v5-stat-gross">—</b></span><span>Driver labor <b id="v5-stat-labor">—</b></span></div>'+ '<div class="v5-kpis">'+
'<div class="v5-kpi"><small>Wake-up target</small><strong id="v5-wake">—</strong><em>30 minutes to get ready</em></div>'+
'<div class="v5-kpi"><small>Leave the garage</small><strong id="v5-garage">—</strong><em id="v5-garage-desc">7-minute standard preparation</em></div>'+
'<div class="v5-kpi"><small>First pickup target</small><strong id="v5-first">—</strong><em>10 minutes before scheduled</em></div>'+
'<div class="v5-kpi"><small>Back at your personal car</small><strong id="v5-return">—</strong><em id="v5-return-desc">Return to base after last run</em></div></div>';
const originalHeading=legacy?.querySelector('.field');
if(originalHeading&&E('date'))hero.querySelector('#v5-top-actions').prepend(originalHeading);
const topRow=document.createElement('div');topRow.className='v5-sectionrow';topRow.id='v5-top-row';
const alerts=document.createElement('section');alerts.className='panel v5-insights';alerts.id='v5-alerts';
alerts.innerHTML='<div class="v5-sectionhead"><h2>Dispatch Watch</h2><span class="v5-pill" id="v5-watch-badge">Evaluating runs</span></div><div id="v5-alert-list"></div><div id="v5-review" class="v5-draft hidden"><strong id="v5-review-title">Dispatch review</strong><p id="v5-review-hint">Review the underlying assumptions and contact the office if needed.</p><textarea id="v5-review-text" aria-label="Prepared dispatch issue message"></textarea><div class="bar"><button type="button" id="v5-check-office" class="primary">Check office approval</button><button type="button" id="v5-copy-review">Copy dispatch note</button><button type="button" id="v5-office-informed">Mark office informed</button><button type="button" id="v5-review-close">Close</button></div><p id="v5-review-feedback"></p></div>';
const side=document.createElement('section');side.className='panel v5-sidework';side.id='v5-sidework';
side.innerHTML='<div class="v5-sectionhead"><h2>Productive Downtime</h2><span class="v5-pill">Side work</span></div><div class="v5-gap" id="v5-gap">—</div><strong id="v5-gap-title">Checking usable gaps</strong><p id="v5-gap-desc">Stops, travel, and a safety margin come first.</p>';
topRow.append(alerts,side);
const support=document.createElement('div');support.className='v5-support';support.id='v5-support';
const wx=E('wx-panel'),vehicle=E('vehicle-card');
if(wx)support.append(wx);
if(vehicle)support.append(vehicle);
const legacyDetails=document.createElement('details');legacyDetails.className='v5-legacy';legacyDetails.id='v5-legacy';
const summ=document.createElement('summary');summ.textContent='Office dispatch details · original roster, addresses, contact numbers and shift controls';legacyDetails.append(summ);
if(legacy)legacyDetails.append(legacy);
const ms=E('ms-panel'),sf=E('sf-card');
if(ms){
 const timeline=E('ms-workflow'),privatePanel=ms.querySelector('.ms-private');
 if(timeline&&privatePanel){
  const more=document.createElement('details');more.className='v5-more';
  const summary=document.createElement('summary');summary.textContent='Record actual milestones or adjust travel assumptions';
  more.append(summary,timeline,privatePanel);
  ms.appendChild(more);
 }
}
const firstReview=document.createElement('section');firstReview.id='v5-first-review';firstReview.className='panel v5-first-review';
firstReview.innerHTML='<div class="v5-sectionhead"><h2>Verify First Route · Garage → Pickup #1</h2><span class="v5-pill warn" id="v5-first-badge">Travel time not verified</span></div>'+
'<p id="v5-first-destination" class="v5-first-destination">Waiting for your dispatch manifest</p>'+
'<p class="v5-mini">The original 20-minute estimate was a generic placeholder. Do not use it for this route. Set your garage address once, open the actual pickup address in Google Maps, then enter the driving minutes shown there. The corrected minutes will rebuild your wake-up and entire day.</p>'+
'<div class="v5-first-controls"><label>Garage starting address<input id="v5-first-origin" type="text" autocomplete="off" placeholder="Enter your garage address (stored only in this browser)"></label>'+
'<button type="button" id="v5-save-origin">Save garage</button>'+
'<a id="v5-open-route" target="_blank" rel="noopener noreferrer" aria-disabled="true">Check route in Google Maps</a>'+
'<label>Maps travel minutes<input id="v5-first-minutes" type="number" inputmode="numeric" min="1" max="240" step="1" placeholder="Enter Maps time"></label>'+
'<button type="button" class="primary" id="v5-apply-first">Apply to entire day</button></div>'+
'<p id="v5-first-feedback" class="v5-mini">First-leg ETA unverified. No departure or wake-up time will be presented as ready until you verify this route.</p>';
roster.prepend(hero);
hero.after(firstReview);
firstReview.after(topRow);
topRow.after(ms||sf);
if(ms)ms.after(sf);
sf.after(support);
support.after(legacyDetails);
let selection=null;
const sourceLabel=()=>{
 const date=E('date')?.value;
 const first=db.runs.filter(r=>r.date===date).sort((a,b)=>timeM(a.pu)-timeM(b.pu))[0];
 const m=db.morningConfig||{},leg=db.morningFirstLegs?.[date];
 const verified=first&&leg&&leg.runId===first.id&&leg.pickupAddr===first.puAddr&&leg.garage===m.garage;
 return verified?'First pickup: route-specific manual Maps time · downstream forecasts use assumptions; no live traffic API.':
 'First pickup route UNVERIFIED · automatic morning and day projections blocked until checked in Maps.';
};
function snapshot(date){
 try{return window.SerenityDayForecast?.getSnapshot?.(date)||null}catch{return null}
}
function reviewFor(idx,date,forecasts){
 const p=forecasts.find(x=>x.r?.id===idx);if(!p)return null;
 const runs=db.runs.filter(r=>r.date===date).sort((a,b)=>timeM(a.pu)-timeM(b.pu));
 const order=runs.findIndex(r=>r.id===idx)+1;
 const status=p.late>0?'projected '+p.late+' minutes AFTER the '+
 (p.approvalState==='approved'?'office-confirmed revised pickup':'original scheduled pickup'):
 p.targetMiss>0?'projected '+p.targetMiss+' minutes behind our 10-minute-early target':
 'on the agreed or scheduled early-arrival target';
 const office=p.approvalState==='approved'?'Office-confirmed pickup: '+p.agreedPickup+'. ':
 'Office approval of any later pickup has NOT been verified. ';
 const ask=p.approvalState==='approved'?'Please review downstream assignments and advise if further adjustment is needed.':
 'Has the office already agreed to a later pickup with the rider? Please confirm the authorized time before I notify the passenger or request a change.';
 const message='Serenity driver schedule check — Run #'+order+' ('+p.r.name+'). Original pickup: '+p.r.pu+
 '. '+office+'Projected curb arrival: '+clock(p.arrival)+'; '+status+
 '. Forecast source: '+(p.source||'driver assumptions')+'. '+ask+
 ' — Anthony, Serenity Transportation';
 return {p,order,status,message};
}
function openReview(idx){
 const date=E('date').value,forecast=snapshot(date)||[],details=reviewFor(idx,date,forecast);
 if(!details)return;
 selection={id:idx,date};
 E('v5-review-title').textContent='Review Run #'+details.order+' · '+details.p.r.name;
 E('v5-review-hint').textContent='Original '+details.p.r.pu+
 (details.p.agreedPickup?' · OFFICE AGREED '+details.p.agreedPickup:' · office approval unverified')+
 ' · predicted '+clock(details.p.arrival)+' · '+details.status+
 '. Nothing has been sent; check office permission and routing before contacting the passenger.';
 E('v5-review-text').value=details.message;
 E('v5-review-feedback').textContent='';
 E('v5-review').classList.remove('hidden');
 E('v5-review').scrollIntoView({block:'nearest',behavior:'smooth'});
}
function dayMilestones(date,forecast){
 const morning=window.SerenityMorning?.plan?.(date);
 const config=db.morningConfig||{};
 const last=forecast&&forecast[forecast.length-1];
 const record=db.morningDays?.[date]||{};
 const recorded=record.arriveBase?new Date(record.arriveBase):null;
 const recordedM=recorded&&Number.isFinite(recorded.getTime())&&
 [recorded.getFullYear(),String(recorded.getMonth()+1).padStart(2,'0'),String(recorded.getDate()).padStart(2,'0')].join('-')===date?
 recorded.getHours()*60+recorded.getMinutes():null;
 const returnMinutes=Number.isSafeInteger(config.returnBase)?config.returnBase:null;
 const final=Number.isFinite(last?.drop)&&Number.isSafeInteger(returnMinutes)?last.drop+returnMinutes:null;
 E('v5-wake').textContent=clock(morning?.wake);
 E('v5-garage').textContent=clock(morning?.departGarage);
 E('v5-first').textContent=clock(morning?.goal);
 E('v5-return').textContent=recordedM!==null?clock(recordedM):clock(final);
 E('v5-garage-desc').textContent=morning?.weather?.extra?
 'Weather allowance: '+morning.garagePrep+' min total':
 '7-minute standard preparation';
 E('v5-return-desc').textContent=recordedM!==null?'Actual return recorded':final===null?
 'Add final-trip/return driving estimate':'Projected after final run · review route';
}
function renderAlerts(date,forecast){
 const list=E('v5-alert-list'),badge=E('v5-watch-badge');
 if(!forecast||!forecast.length){
  badge.textContent='Awaiting manifest';badge.className='v5-pill';
  list.innerHTML='<p class="v5-mini">Import today’s dispatch to check the entire schedule, including hours-ahead risk.</p>';return;
 }
 const unknown=forecast.filter(p=>p.state==='missing');
 if(unknown.length){
  badge.textContent='Travel check needed';badge.className='v5-pill warn';
  list.innerHTML='<div class="v5-alertrow caution"><div class="v5-alertcontent"><strong>Schedule cannot be validated yet: '+unknown.length+' run(s) have missing projections.</strong><small>Verify the first garage-to-pickup travel time above, then check later trip durations. Serenity is withholding guessed lateness predictions.</small></div><button type="button" id="v5-review-first" class="primary">Review first route</button></div>';
  return;
 }
 const scored=forecast.filter(p=>p.state==='late'||p.state==='risk')
 .sort((a,b)=>(b.late||0)-(a.late||0)||(b.targetMiss||0)-(a.targetMiss||0));
 const actualLate=scored.filter(x=>x.state==='late').length;
 badge.textContent=actualLate?actualLate+' projected late':scored.length?scored.length+' early-target risks':'No predicted lateness';
 badge.className='v5-pill '+(actualLate?'bad':scored.length?'warn':'ok');
 if(!scored.length){
  const cleared=forecast.filter(p=>p.approvalState==='approved').length;
  list.innerHTML='<div class="v5-alertrow"><div class="v5-alertcontent"><strong>No projected pickup delays against the currently agreed times.</strong><small>'+
  (cleared?cleared+' office-confirmed later pickup(s) are recorded. ':'')+
  'Recheck estimates when a passenger boards late, traffic changes, or dispatch revises a run.</small></div></div>';return;
 }
 const runs=forecast.map(p=>p.r);
 list.innerHTML=scored.slice(0,3).map(p=>{
  const n=runs.findIndex(r=>r.id===p.r.id)+1,
  notice=p.state==='late'?
    (p.approvalState==='approved'?'Projected '+p.late+'m AFTER office-agreed '+p.agreedPickup:
     'Projected '+p.late+'m late · check office approval'):
    (p.approvalState==='approved'?'Agreed '+p.agreedPickup+' · ':'')+'Early-arrival target missed '+p.targetMiss+'m';
  const informed=db.dispatchReviews?.[p.r.id];
  return '<div class="v5-alertrow '+(p.state==='late'?'critical':'caution')+'"><div class="v5-alertcontent"><strong>Run #'+n+' · '+safe(p.r.name)+' · '+safe(notice)+'</strong><small>Scheduled '+safe(p.r.pu)+' → forecast '+clock(p.arrival)+' · '+safe(p.source||'driver assumption')+
    (p.approvalState==='awaiting'?' · Awaiting office reply':
     p.approvalState==='approved'?' · Office-approved time recorded':
     p.approvalState==='not_approved'?' · Office did NOT approve a later pickup':
     p.state==='late'?' · Approval unknown':'')+
    (informed?.state==='informed'?' · Office informed (driver marked)':'')+
   '</small></div><button type="button" class="primary" data-v5-review="'+safe(p.r.id)+'">Review options</button></div>';
 }).join('')+(scored.length>3?'<p class="v5-mini" style="margin-top:8px">+'+(scored.length-3)+' more affected runs appear in the full-day outlook below.</p>':'');
}
function renderSidework(forecast){
 const gap=E('v5-gap'),title=E('v5-gap-title'),desc=E('v5-gap-desc');
 if(!forecast||forecast.length<2){
  gap.textContent='—';title.textContent='No usable gap calculated yet';desc.textContent='Import more than one run and verify estimated driving times.';return;
 }
 const config=db.forecastV4||{},transfer=intOr(config.reposition,15);
 const gaps=[];
 for(let i=1;i<forecast.length;i++){
  const prev=forecast[i-1],next=forecast[i];
  if(!Number.isFinite(prev.drop)||!Number.isFinite(next.target)||next.state==='done')continue;
  const usable=Math.floor(next.target-prev.drop-transfer-5);
  if(usable>=10)gaps.push({usable,after:i,prev,next});
 }
 if(!gaps.length){
  gap.textContent='0 min';title.textContent='No confirmed side-work opportunity';desc.textContent='The full-day forecast leaves little slack after repositioning and a 5-minute safety margin. Check again as actual trips finish.';return;
 }
 const item=gaps[0];
 gap.textContent=item.usable+' min';
 title.textContent='Possible gap after Run #'+item.after;
 desc.textContent='Planning estimate after '+transfer+' minutes repositioning and 5 minutes safety margin. '+
 (item.usable>=25?'Possible tasks: vehicle tidy-up, paperwork or a brief inspection.':
  'Possible task: quick interior tidy-up or paperwork.')+
 ' Do not use until location and next pickup are confirmed.';
}
function refreshFirstLeg(date,first){
 const box=E('v5-first-review');
 box.style.display=first?'block':'none';
 if(!first)return;
 const origin=String(db.morningConfig?.garage||'').trim();
 const leg=db.morningFirstLegs?.[date];
 const verified=!!(leg&&leg.runId===first.id&&leg.pickupAddr===first.puAddr&&leg.garage===origin&&
  Number.isSafeInteger(leg.minutes)&&leg.minutes>=1&&leg.minutes<=240);
 E('v5-first-badge').textContent=verified?'Verified for this first run · '+leg.minutes+' min':'Verify route before departure';
 E('v5-first-badge').className='v5-pill '+(verified?'ok':'warn');
 E('v5-first-destination').textContent='First pickup: '+first.pu+' · '+String(first.puAddr||'Address unavailable');
 if(document.activeElement!==E('v5-first-origin'))E('v5-first-origin').value=origin;
 if(document.activeElement!==E('v5-first-minutes'))E('v5-first-minutes').value=verified?String(leg.minutes):'';
 const link=E('v5-open-route');
 if(origin&&first.puAddr){
  link.href='https://www.google.com/maps/dir/?api=1&travelmode=driving&origin='+encodeURIComponent(origin)+'&destination='+encodeURIComponent(first.puAddr);
  link.removeAttribute('aria-disabled');link.style.pointerEvents='auto';link.style.opacity='1';
 }else{
  link.removeAttribute('href');link.setAttribute('aria-disabled','true');link.style.pointerEvents='none';link.style.opacity='.5';
 }
 E('v5-first-feedback').textContent=verified?'Saved for this service date and first destination. Different first pickup requires a new Maps check. Traffic may change; recheck before departure.':
 origin?'Open Google Maps to this exact pickup, check its travel time, and apply the driving minutes.':'Enter and save your garage address once to get an accurate route link.';
}
function refresh(){
 const date=E('date')?.value;if(!date)return;
 const runs=db.runs.filter(r=>r.date===date);
 const forecast=snapshot(date),first=runs.slice().sort((a,b)=>timeM(a.pu)-timeM(b.pu))[0];
 E('v5-title').textContent=first?'Your day, one clear picture.':'Ready for your dispatch.';
 E('v5-subtitle').textContent=first?runs.length+' assigned runs · first pickup '+first.pu+
 ' · 10-minute-early arrival target':'Import the manifest once. We’ll reverse-plan the morning and forecast the rest of your shift.';
 E('v5-data-status').textContent=sourceLabel()+' · Refreshed '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 refreshFirstLeg(date,first);
 for(const [oldId,newId] of [['metric-complete','v5-stat-completed'],['metric-miles','v5-stat-miles'],['metric-gross','v5-stat-gross'],['metric-labor','v5-stat-labor']]){
  const source=E(oldId),target=E(newId);
  if(source&&target)target.textContent=source.textContent;
 }
 dayMilestones(date,forecast);
 renderAlerts(date,forecast);
 renderSidework(forecast);
}
E('v5-import').addEventListener('click',()=>show('import'));
E('v5-save-origin').addEventListener('click',()=>{
 const value=E('v5-first-origin').value.trim();
 if(value.length<8)return alert('Enter your full garage street address first.');
 db.morningConfig={...(db.morningConfig||{}),garage:value.slice(0,220)};
 save();render();
});
E('v5-apply-first').addEventListener('click',()=>{
 const date=E('date').value;
 const first=db.runs.filter(r=>r.date===date).sort((a,b)=>timeM(a.pu)-timeM(b.pu))[0];
 const garage=String(db.morningConfig?.garage||'').trim();
 if(!first||!first.puAddr)return alert('Import a first run with a valid pickup address before checking its route.');
 if(!garage)return alert('Save your garage address before entering the travel time.');
 const raw=E('v5-first-minutes').value.trim();
 const val=Number(raw);
 if(!/^[0-9]+$/.test(raw)||!Number.isSafeInteger(val)||val<1||val>240)
  return alert('Enter the whole-number garage-to-first-pickup driving minutes displayed in Google Maps (1–240).');
 db.morningFirstLegs=db.morningFirstLegs||{};
 db.morningFirstLegs[date]={runId:first.id,pickupAddr:first.puAddr,garage,minutes:val,
  checkedAt:new Date().toISOString(),source:'driver_verified_google_maps'};
 db.morningConfig=db.morningConfig||{};
 delete db.morningConfig.firstDrive;
 save();render();
});
alerts.addEventListener('click',event=>{
 if(event.target?.id==='v5-review-first'){
  E('v5-first-review').scrollIntoView({block:'center',behavior:'smooth'});
  E('v5-first-minutes').focus();return;
 }
},true);
alerts.addEventListener('click',event=>{
 const action=event.target.closest('button[data-v5-review]');
 if(!action)return;
 event.preventDefault();event.stopImmediatePropagation();openReview(action.dataset.v5Review);
},true);
E('v5-review-close').addEventListener('click',()=>{E('v5-review').classList.add('hidden');selection=null;});
E('v5-check-office').addEventListener('click',()=>{
 if(selection&&window.SerenityOfficeUI?.open)window.SerenityOfficeUI.open(selection.id);
});
E('v5-copy-review').addEventListener('click',async()=>{
 const text=E('v5-review-text').value;
 try{await navigator.clipboard.writeText(text);E('v5-review-feedback').textContent='Copied. Review before sending to the office. Nothing was sent by Serenity.';}
 catch{E('v5-review-text').focus();E('v5-review-text').select();E('v5-review-feedback').textContent='Select/copy the message manually. Nothing was sent.';}
});
E('v5-office-informed').addEventListener('click',()=>{
 if(!selection)return;
 if(!confirm('Did you actually contact the dispatch office about this run? This does not send a message.'))return;
 if(!db.dispatchReviews)db.dispatchReviews={};
 db.dispatchReviews[selection.id]={state:'informed',at:new Date().toISOString(),serviceDate:selection.date};
 save();E('v5-review-feedback').textContent='Marked office informed. This records your confirmation only.';refresh();
});
const old=render;
render=function(){old();refresh();};
E('date').addEventListener('change',refresh);
window.addEventListener('serenity-weather-updated',refresh);
window.addEventListener('serenity-location-refresh',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
const pulse=setInterval(()=>{if(!document.hidden)refresh();},60000);
window.addEventListener('pagehide',()=>clearInterval(pulse));
refresh();
})();