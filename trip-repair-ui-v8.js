/* Serenity v8 — repair/coding panel for active, completed and exception runs.
   No official status updates are sent to RoutingBox.
*/
(()=>{
'use strict';
if(typeof db==='undefined'||typeof render!=='function'||!window.SerenityLifecycle)return;
const E=id=>document.getElementById(id);
const customer=E('customer'),flow=E('v7-customer-flow');
if(!customer||!flow)return;
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const valid=s=>!!(s&&Number.isFinite(new Date(s).getTime()));
const human=s=>{const d=new Date(s);return valid(s)?d.toLocaleString([],{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'Missing'};
const localInput=s=>{
 if(!valid(s))return '';
 const d=new Date(s),pad=x=>String(x).padStart(2,'0');
 return [d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-')+
 'T'+pad(d.getHours())+':'+pad(d.getMinutes());
};
const panel=document.createElement('section');
panel.className='v8-repair-panel';panel.id='v8-repair-panel';
flow.after(panel);
function selected(){
 const r=db.runs.find(x=>x.id===db.active);
 return r&&r.date===E('date')?.value?r:null;
}
function renderRepair(){
 const run=selected();
 if(!run){panel.classList.add('hidden');panel.innerHTML='';return}
 const done=run.status==='Completed',exception=run.status==='Exception';
 const missing=done&&!valid(run.events?.dropoff);
 const checks=db.codingVerification?.[run.id];
 const validCheck=!!(checks?.verifiedAt&&checks.date===run.date&&checks.status===run.status);
 const fields=['enroute','arrived','boarded','dropoff'];
 panel.classList.remove('hidden');
 panel.innerHTML=
 (missing?'<div class="v8-missing"><strong>Trip marked Completed, but actual drop-off time is missing.</strong>'+
 '<p>The previous Close/Complete action did not record a verified drop-off. This cannot be treated as a complete event history. Enter the real time; do not substitute the current time for an earlier event.</p>'+
 '<button type="button" class="primary" data-v8-open-repair="dropoff">Repair actual drop-off time</button></div>':'')+
 '<div class="v8-repair-top"><div><h3>Trip completion & coding review</h3>'+
 '<p>'+ (done?'Completed locally':exception?'Marked as exception':'Active trip')+
 ' · Actual drop-off '+human(run.events?.dropoff)+
 ' · '+(validCheck?'Official coding checked by you':'Official RoutingBox coding not yet verified in Serenity')+'</p></div>'+
 '<button type="button" id="v8-toggle-repair">Correct actual event times</button></div>'+
 '<div id="v8-repair-form" class="v8-repair-form hidden"><p>Correct a missing or inaccurate timestamp without inventing events. This change affects Serenity only; verify RoutingBox separately.</p>'+
 '<div class="v8-repair-fields"><label>Event to correct<select id="v8-repair-kind">'+fields.map(k=>
  '<option value="'+k+'"'+(missing&&k==='dropoff'?' selected':'')+'>'+({
 enroute:'En route departure',arrived:'Pickup arrival',boarded:'Passenger boarded',dropoff:'Actual drop-off'
 })[k]+'</option>').join('')+'</select></label>'+
 '<label>Actual local date and time<input type="datetime-local" id="v8-repair-at" required></label>'+
 '<button type="button" class="primary" id="v8-save-repair">Save actual time</button></div>'+
 '<p class="v8-note">If you select a previously recorded event, its original time is retained in the local correction audit. You cannot enter a future time.</p></div>'+
 '<div class="v8-repair-footer"><div><strong>Payment protection</strong>'+
 '<p>Serenity does not know whether RoutingBox accepted the status or whether the office will pay this run.</p></div>'+
 '<button type="button" id="v8-confirm-coding" '+(!done&&!exception?'disabled ':'')+'>'+
 (validCheck?'✓ Coding personally checked':'I verified coding in RoutingBox')+'</button>'+
 (exception?'<button type="button" id="v8-reopen-exception">Reopen exception locally</button>':'')+
 '</div><p id="v8-repair-result" role="status" aria-live="polite"></p>';
 E('v8-repair-kind').addEventListener('change',fillTime);
 fillTime();
}
function fillTime(){
 const run=selected();
 const kind=E('v8-repair-kind')?.value;
 if(!run||!kind||!E('v8-repair-at'))return;
 E('v8-repair-at').value=localInput(run.events?.[kind]);
}
function revealRepair(kind){
 const run=selected();if(!run)return;
 const form=E('v8-repair-form');
 if(!form)return;
 form.classList.remove('hidden');
 if(kind&&['enroute','arrived','boarded','dropoff'].includes(kind))E('v8-repair-kind').value=kind;
 fillTime();
 form.scrollIntoView({behavior:'smooth',block:'nearest'});
 E('v8-repair-at').focus();
}
function handleClick(event){
 const target=event.target.closest('button');
 if(!target)return;
 if(target.dataset.v8OpenRepair){
  event.preventDefault();event.stopImmediatePropagation();revealRepair(target.dataset.v8OpenRepair);return
 }
 if(!panel.contains(target))return;
 if(target.id==='v8-toggle-repair'){event.preventDefault();revealRepair();return}
 const run=selected();
 if(!run)return;
 if(target.id==='v8-save-repair'){
  event.preventDefault();
  const kind=E('v8-repair-kind').value,at=E('v8-repair-at').value;
  const result=window.SerenityLifecycle.correct(run,kind,at);
  if(result?.ok){
   if(!result.unchanged){
    const msg=kind==='dropoff'?'Actual drop-off saved. Run closed locally. Check the office system.':
      'Actual '+kind+' time saved. Review the official office status.';
    const n=E('v8-repair-result');if(n)n.textContent=msg;
   }
  }
 }else if(target.id==='v8-confirm-coding'){
  event.preventDefault();
  window.SerenityLifecycle.codeChecked(run,true);
 }else if(target.id==='v8-reopen-exception'){
  event.preventDefault();
  window.SerenityLifecycle.reopenException(run);
 }
}
document.addEventListener('click',handleClick,true);
const old=render;
render=function(){old();renderRepair();};
E('date')?.addEventListener('change',renderRepair);
window.addEventListener('serenity-trip-event',renderRepair);
window.SerenityRepairUI={render:renderRepair,open:revealRepair};
renderRepair();
})();