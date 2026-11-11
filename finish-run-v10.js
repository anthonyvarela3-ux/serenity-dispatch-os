/* Serenity Beta 10 — accurate, one-step physical drop-off and closeout.
   The terminal action must not depend on missing earlier stage taps. Actual
   event time is driver-entered, while the record-entry time is audited.
   No RoutingBox or MAS action is performed. */
(()=>{
'use strict';
if(typeof db==='undefined'||typeof save!=='function'||typeof render!=='function')return;
const E=id=>document.getElementById(id);
const h=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[x]));
const actual=s=>!!s&&Number.isFinite(new Date(s).getTime());
const localDay=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const inTime=d=>String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
const outTime=iso=>actual(iso)?new Date(iso).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'—';
const runFor=id=>db.runs.find(r=>r.id===id&&r.date===E('date')?.value);
let selected=null,mode='finish';
function modal(){
 const root=E('customer-content');
 if(!root)return null;
 let p=root.querySelector('#v10-finish-form');
 if(!p){
  p=document.createElement('section');
  p.id='v10-finish-form';p.className='v10-finish-form';
  const stages=root.querySelector('.v8-trip-controls');
  if(stages)stages.after(p);else root.append(p);
 }
 return p;
}
function open(id,correct=false){
 const run=runFor(id);
 if(!run)return alert('Open the correct run on the selected service date first.');
 if(!correct&&['Canceled','Canceled at Door','No-show','Exception'].includes(run.status))
  return alert('This run was closed without passenger transport; it cannot be completed as a drop-off.');
 if(!correct&&run.status==='Completed'&&actual(run.events?.dropoff))return open(id,true);
 selected=id;mode=correct?'correct':'finish';
 const p=modal(),oldTime=actual(run.events?.dropoff)?new Date(run.events.dropoff):new Date();
 const candidate=localDay(oldTime)===run.date?inTime(oldTime):'';
 p.innerHTML='<div class="v10-finish-heading"><div><span class="v7-kicker">DRIVER-VERIFIED PHYSICAL DROPOFF</span>'+
 '<h3>'+(correct?'Correct actual drop-off time':'Finish & Close Run')+'</h3>'+
 '<p>Run '+h(run.name)+' · original pickup '+h(run.pu)+'</p></div>'+
 '<button type="button" id="v10-finish-dismiss">Close</button></div>'+
 '<div class="v10-finish-grid"><label>Actual date <strong>'+h(run.date)+'</strong><small>Service date from manifest</small></label>'+
 '<label>What time did the passenger actually exit the car?'+
 '<input type="time" id="v10-actual-drop" required value="'+h(candidate)+'"></label></div>'+
 '<p class="v10-finish-hint">You may enter the real earlier time when recording the event during a break. Missing Arrived/Boarded/En Route stages will stay blank rather than receiving invented times.</p>'+
 '<div id="v10-timeline-warning" class="v10-timeline-warning hidden"></div>'+
 '<label class="v10-confirm"><input type="checkbox" id="v10-passenger-exited">'+
 'I confirm the passenger was physically dropped off, and the time above is the real drop-off time.</label>'+
 '<div class="v10-finish-actions"><button type="button" class="primary" id="v10-finish-save">'+
 (correct?'Save corrected actual drop-off':'Save Drop-off & Complete Run')+'</button>'+
 '<button type="button" id="v10-finish-cancel">Not yet / go back</button></div>'+
 '<p id="v10-finish-feedback" role="status" aria-live="polite"></p>'+
 '<small>This is a local record only; no driver dispatch status, MAS claim, or passenger message is sent.</small>';
 p.classList.remove('hidden');
 p.scrollIntoView({block:'center',behavior:'smooth'});
 updateWarn();
}
function parsedTime(){
 const run=runFor(selected),raw=E('v10-actual-drop')?.value||'';
 if(!run||!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw))return null;
 const dt=new Date(run.date+'T'+raw+':00');
 if(!Number.isFinite(dt.getTime())||dt.getTime()>Date.now()+59000)return null;
 return dt;
}
function updateWarn(){
 const warning=E('v10-timeline-warning');if(!warning||!selected)return;
 const run=runFor(selected),d=parsedTime();
 if(!run||!d){warning.classList.add('hidden');return}
 const conflicting=['enroute','arrived','boarded','enrouteDropoff'].filter(k=>
  actual(run.events?.[k])&&new Date(run.events[k]).getTime()>d.getTime());
 warning.classList.toggle('hidden',!conflicting.length);
 warning.textContent=conflicting.length?
  'Chronology check: the drop-off time you entered is earlier than these recorded stages: '+
  conflicting.join(', ')+'. Those stage timestamps will NOT be changed. '+
  'If you tapped them retrospectively, their times may need correction.':'';
}
function close(){
 selected=null;
 E('v10-finish-form')?.remove();
}
function commit(){
 const feedback=E('v10-finish-feedback'),run=runFor(selected),dt=parsedTime();
 if(!run){if(feedback)feedback.textContent='No selected run. Return to Manifest and open the correct customer.';return}
 if(!dt){feedback.textContent='Enter a valid actual drop-off time on the selected service date, not in the future.';return}
 if(!E('v10-passenger-exited')?.checked){
  feedback.textContent='Please confirm the passenger was physically dropped off and the time is accurate.';return;
 }
 if(['Canceled','Canceled at Door','No-show','Exception'].includes(run.status)){
  feedback.textContent='A canceled or no-show assignment cannot be closed as transported.';return;
 }
 const prior=run.events?.dropoff,now=new Date(),correcting=mode==='correct';
 if(actual(prior)&&!correcting){feedback.textContent='Drop-off was already recorded. Use Correct time instead.';return}
 const issue=E('v10-timeline-warning');
 if(issue&&!issue.classList.contains('hidden')&&!confirm(
    'This time is earlier than some previously recorded trip stages. '+
    'Complete using your verified drop-off time and leave the other event timestamps unchanged?'))return;
 const label=dt.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
 if(!confirm((correcting?'Correct':'Finish')+' this assignment with actual passenger drop-off at '+label+
   ' on '+run.date+'? The run will be marked Completed.'))return;
 run.events=run.events||{};
 if(actual(prior)){
  run.events.dropoffCorrections=run.events.dropoffCorrections||[];
  run.events.dropoffCorrections.push({prior,correctedAt:now.toISOString(),newTime:dt.toISOString()});
 }
 run.events.dropoff=dt.toISOString();
 // Administrative completion is when Serenity was updated, NOT physical drop-off.
 run.events.closed=now.toISOString();
 run.events.dropoffEntry={enteredAt:now.toISOString(),actualAt:dt.toISOString(),
  method:'driver_confirmed_actual_time',recordedLater:Math.abs(now.getTime()-dt.getTime())>120000};
 run.status='Completed';
 db.active=run.id;
 try{save();close();render();}
 catch(error){
  if(feedback)feedback.textContent='Could not finish saving: '+String(error?.message||error);
  alert('Serenity could not verify persistence. Export a backup and do not assume this run is saved.');
  return;
 }
 const done=db.runs.find(r=>r.id===run.id);
 if(done?.status!=='Completed'||!actual(done.events?.dropoff)){
  alert('Completion could not be verified in local data. Please check the Manifest.');return;
 }
 const manifest=window.SerenityThreePage;
 if(manifest?.refresh)manifest.refresh();
}
document.addEventListener('click',event=>{
 const btn=event.target.closest?.('#v10-finish-save,#v10-finish-cancel,#v10-finish-dismiss,#v10-correct-drop');
 if(!btn)return;
 event.preventDefault();event.stopImmediatePropagation();
 if(btn.id==='v10-finish-save'){commit();return}
 if(btn.id==='v10-correct-drop'){
  const run=db.runs.find(r=>r.id===db.active);
  if(run)open(run.id,true);
  return;
 }
 close();
},true);
document.addEventListener('input',event=>{
 if(event.target.id==='v10-actual-drop')updateWarn();
});
const oldRender=render;
render=function(){
 oldRender();
 const banner=E('customer-content')?.querySelector('.v9-completion-banner');
 if(banner){
  if(!banner.querySelector('#v10-correct-drop')){
   const b=document.createElement('button');
   b.id='v10-correct-drop';b.type='button';b.textContent='Correct actual time';
   banner.append(b);
  }
 }
};
window.SerenityFinish={open,close,commit};
})();