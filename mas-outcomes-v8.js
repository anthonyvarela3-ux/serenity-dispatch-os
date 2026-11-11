/* Serenity MAS-aware cancellation exception actions.
   Driver-side notes only. NO claim creation, auto-attestation, tariff changes,
   billable no-show charge, or passenger messaging. */
(()=>{
'use strict';
if(typeof db==='undefined'||typeof render!=='function')return;
const E=id=>document.getElementById(id),cases={
 cancel:{status:'Canceled',title:'Cancel',desc:'Trip canceled before pickup. Record who confirmed it; no passenger transportation occurred.'},
 door:{status:'Canceled at Door',title:'Cancel at Door',desc:'Driver reached the pickup. Someone at the location declined or canceled the ride. Requires a recorded actual arrival.'},
 noShow:{status:'No-show',title:'No-show',desc:'Passenger did not board after the MAS waiting window. Requires an actual pickup arrival and at least 15 minutes after the later of scheduled pickup or arrival.'}
};
const hasTime=s=>!!s&&Number.isFinite(new Date(s).getTime());
const dayOf=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const localTime=s=>hasTime(s)?new Date(s).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'Not recorded';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ended=r=>['Completed','Exception','Canceled','Canceled at Door','No-show'].includes(r.status)||hasTime(r.events?.dropoff);
let selected=null;
const latestRun=()=>selected?db.runs.find(r=>r.id===selected.id&&r.date===E('date')?.value):null;
const scheduledMs=r=>{
 const mins=timeM(r.pu),base=new Date(r.date+'T00:00:00');
 if(!Number.isFinite(mins)||!Number.isFinite(base.getTime()))return null;
 base.setMinutes(mins);return base.getTime();
};
const waitDeadline=r=>{
 if(!hasTime(r.events?.arrived))return null;
 const arrived=new Date(r.events.arrived).getTime(),scheduled=scheduledMs(r);
 if(scheduled===null)return null;
 return Math.max(arrived,scheduled)+15*60000;
};
function validate(run,choice,now){
 if(!run)return 'Select the assignment from the Manifest first.';
 if(ended(run))return 'This assignment is already closed. Correct the prior outcome first if it was entered in error.';
 if(dayOf(now)!==run.date)return 'Record NOW only on today’s selected service date.';
 if(hasTime(run.events?.boarded)||hasTime(run.events?.enrouteDropoff)||hasTime(run.events?.dropoff))
  return 'This passenger was already recorded in the car. A pre-transport cancellation cannot be entered.';
 if(choice==='cancel'&&hasTime(run.events?.arrived))
  return 'The driver already recorded an arrival. Choose Cancel at Door or No-show, as appropriate.';
 if(choice==='door'&&!hasTime(run.events?.arrived))
  return 'First record an actual Arrived at Pickup event. Do not invent an arrival time for a Cancel at Door.';
 if(choice==='noShow'){
  if(!hasTime(run.events?.arrived))return 'First record Arrived at Pickup and wait at the location.';
  const deadline=waitDeadline(run);
  if(deadline===null)return 'The original scheduled pickup time is missing or invalid.';
  if(now.getTime()<deadline){
   const min=Math.ceil((deadline-now.getTime())/60000);
   return 'MAS No-show timing not met. Wait '+min+' more minute'+(min===1?'':'s')+
    '. The 15-minute window starts after the later of the scheduled pickup or your actual arrival.';
  }
 }
 return null;
}
function showEditor(run){
 const code=selected?.id===run?.id?selected?.choice:null;
 if(!code||!cases[code])return '';
 const item=cases[code],now=new Date(),error=validate(run,code,now);
 const needsArrival=(code==='door'||code==='noShow')&&!hasTime(run.events?.arrived);
 const deadline=code==='noShow'?waitDeadline(run):null;
 const wait=deadline===null?'No arrival recorded':
  now.getTime()<deadline?'Wait until '+localTime(new Date(deadline).toISOString()):
  'Wait condition met · '+Math.max(15,Math.floor((now.getTime()-Math.max(scheduledMs(run),new Date(run.events.arrived).getTime()))/60000))+'m since later of pickup/arrival';
 return '<div class="mas-form" id="mas-form">'+
  '<div class="mas-form-head"><div><strong>'+safe(item.title)+'</strong><p>'+safe(item.desc)+'</p></div>'+
  '<button type="button" id="mas-dismiss">Close</button></div>'+
  '<div class="mas-event-facts"><span>Scheduled pickup <b>'+safe(run.pu)+'</b></span>'+
  '<span>Actual curb arrival <b>'+safe(localTime(run.events?.arrived))+'</b></span>'+
  (code==='noShow'?'<span>MAS waiting check <b>'+safe(wait)+'</b></span>':'')+'</div>'+
  (error?'<p class="mas-blocker">'+safe(error)+(needsArrival?
   ' Enter your genuine arrival time below to complete this check.':'')+'</p>':'')+
  (code==='cancel'||code==='door'?
   '<div class="mas-outcome-choice"><button type="button" data-mas-choice="cancel">Canceled before arrival</button>'+
   '<button type="button" data-mas-choice="door">Canceled at door</button></div>':'')+
  (needsArrival?'<div class="mas-arrival-entry"><label>Actual time you reached pickup (today)'+
   '<input type="time" id="mas-arrival-time"></label>'+
   '<label class="mas-ack"><input type="checkbox" id="mas-arrival-confirm">'+
   'This is my actual arrival time, not an estimated time.</label></div>':'')+
  '<div class="mas-form-grid">'+
  '<label>'+(code==='noShow'?'What was observed?':'Who confirmed the cancellation?')+
  '<select id="mas-source"><option value="">Choose one</option>'+
  (code==='noShow'?'<option value="Driver at pickup: passenger did not appear">Driver at pickup · passenger absent</option>'+
   '<option value="Driver at pickup: passenger declined">Driver at pickup · passenger declined</option>':
  '<option value="Passenger directly">Passenger directly</option>'+
  '<option value="Passenger representative">Passenger representative</option>'+
  '<option value="Facility representative">Facility representative</option>'+
  '<option value="Dispatch">Dispatch</option>'+
  '<option value="Other firsthand confirmation">Other firsthand confirmation</option>')+
  '</select></label>'+
  '<label>Contact / verification effort'+
  '<select id="mas-contact"><option value="">Choose one</option>'+
  '<option value="Called passenger">Called passenger</option>'+
  '<option value="Texted passenger">Texted passenger</option>'+
  '<option value="Knocked or rang doorbell">Knocked or rang doorbell</option>'+
  '<option value="Confirmed with person at door">Confirmed with person at door</option>'+
  '<option value="Confirmed with office">Confirmed with office</option>'+
  '<option value="Waited on site; passenger absent">Waited on site; passenger absent</option>'+
  '<option value="No contact attempt (explain)">No contact attempt (explain)</option>'+
  '</select></label>'+
  '<label>Office / MAS communication status'+
  '<select id="mas-reported"><option value="Not yet reported">Not yet reported</option>'+
  '<option value="Office notified by driver">Office notified by driver</option>'+
  '<option value="MAS outcome separately attested by driver">MAS outcome separately attested by driver</option>'+
  '<option value="Office handling MAS reporting">Office handling MAS reporting</option></select></label></div>'+
  '<label>Operational note (optional; omit health details)<textarea id="mas-note" maxlength="360" rows="2" placeholder="Brief factual description of what happened"></textarea></label>'+
  '<label class="mas-ack"><input id="mas-ack" type="checkbox">'+
  'I confirm no passenger was transported on this assignment.</label>'+
  '<div class="mas-form-actions"><button type="button" id="mas-save"'+(error&&!needsArrival?' disabled':'')+
  '>Record '+safe(item.title)+' now</button>'+
  '<button type="button" id="mas-dismiss-secondary">Go back</button></div>'+
  '<p class="mas-notice">MAS: no passenger transport charge is calculated. Any separate contractual reimbursement requires verification. This local log does not substitute for the MAS official trip app, GPS evidence, office notification, or attestation.</p>'+
  '<p id="mas-feedback" aria-live="polite" class="mas-feedback"></p></div>';
}
function renderPanel(){
 const table=E('v7-manifest-table'),run=latestRun();
 const root=E('roster');if(!root||!table)return;
 // No cancellation controls or MAS outcome form on Customer.
 E('customer-content')?.querySelector('#mas-outcomes')?.remove();
 let panel=E('mas-outcomes');
 if(!run){panel?.remove();return;}
 if(!panel){
  panel=document.createElement('section');panel.id='mas-outcomes';
  panel.className='mas-outcomes panel v9-manifest-outcomes';
  table.after(panel);
 }
 const type=cases[selected?.choice],out=run.events?.cancelOutcome,
  runs=db.runs.filter(r=>r.date===run.date).sort((a,b)=>timeM(a.pu)-timeM(b.pu)),
  number=runs.findIndex(r=>r.id===run.id)+1;
 const stopped=['Canceled','Canceled at Door','No-show'].includes(run.status);
 panel.innerHTML='<div class="mas-title"><div><span class="mas-eyebrow">MANIFEST · EXCEPTION / DISPATCH CANCELLATION</span>'+
  '<h3>Run #'+number+' · '+safe(run.name)+'</h3><p class="mas-intro">'+
  safe(run.pu)+' office pickup · '+safe(run.puAddr||'No address provided')+
  '</p></div><button type="button" id="mas-dismiss">Close</button></div>'+
 (stopped?'<p class="mas-closed-detail"><b>'+safe(run.status)+'</b> · recorded '+
   safe(localTime(out?.at))+'. Reason: '+safe(out?.source||'Not documented')+
   '. Reporting: '+safe(out?.reported||'Unknown')+
   '. No transported-passenger fare counted.</p>'+
   '<div class="mas-actions"><button type="button" id="mas-correct">Correct recorded outcome</button></div>':
  '<div class="mas-actions"><button type="button" data-mas-choice="cancel">Cancel / At Door</button>'+
   '<button type="button" data-mas-choice="noShow">No-show</button></div>'+
   (type?showEditor(run):''))+
 '<p class="mas-policy">A dispatch cancellation or revised order is not the same as an actual passenger trip. '+
 'Serenity keeps original office details, local event evidence and transportation billing separate. '+
 'For MAS No-show, validate the full waiting window in the official MAS workflow.</p>';
}function record(run){
 if(!selected||selected.id!==run.id||!cases[selected.choice])return;
 const kind=selected.choice,now=new Date();
 // A No-show or Cancel at Door can be documented directly from Manifest
 // without forcing the driver to navigate to the Customer screen.
 let arrivalNew=null;
 if((kind==='door'||kind==='noShow')&&!hasTime(run.events?.arrived)){
  const raw=E('mas-arrival-time')?.value||'';
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)||!E('mas-arrival-confirm')?.checked){
   E('mas-feedback').textContent='Enter the real arrival time and confirm it is an actual event.';return;
  }
  const candidate=new Date(run.date+'T'+raw+':00');
  if(!Number.isFinite(candidate.getTime())||candidate.getTime()>now.getTime()){
   E('mas-feedback').textContent='Actual arrival time cannot be invalid or in the future.';return;
  }
  arrivalNew=candidate.toISOString();
 }
 const checkRun=arrivalNew?{...run,events:{...(run.events||{}),arrived:arrivalNew}}:run;
 const error=validate(checkRun,kind,now);
 if(error){E('mas-feedback').textContent=error;return}
 const source=E('mas-source')?.value||'',contact=E('mas-contact')?.value||'',
  reported=E('mas-reported')?.value||'Not yet reported',
  note=E('mas-note')?.value.trim().slice(0,360)||'',
  ack=E('mas-ack')?.checked;
 if(!source||!contact){E('mas-feedback').textContent='Choose who confirmed / what you observed and the contact or verification effort.';return}
 if(contact.startsWith('No contact')&&!note){E('mas-feedback').textContent='Explain why there was no contact attempt in the operational note.';return}
 if(!ack){E('mas-feedback').textContent='Check the no-passenger-transport confirmation before saving.';return}
 const label=cases[kind].title;
 if(!confirm('Record '+label+' for this run at '+now.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+
  '? This closes the assignment as NOT TRANSPORTED, without adding its tariff to earned revenue.'))return;
 const arrived=hasTime(checkRun.events?.arrived)?new Date(checkRun.events.arrived).getTime():null,
  scheduled=scheduledMs(run);
 run.events=run.events||{};
 if(arrivalNew){
  run.events.arrived=arrivalNew;
  run.events.arrivalSource='driver_confirmed_from_manifest';
 }
 run.events.cancelOutcome={
  type:kind,status:cases[kind].status,at:now.toISOString(),source,contact,reported,note,
  originalPickup:run.pu,arrivalAt:arrived===null?null:run.events.arrived,
  waitMinutes:kind==='noShow'&&arrived!==null&&scheduled!==null?
   Math.max(0,Math.floor((now.getTime()-Math.max(arrived,scheduled))/60000)):null,
  transported:false,masAttestation:'external_not_verified',
  passengerTripBillable:false,contractExceptionFee:null
 };
 run.events.closed=now.toISOString();
 run.status=cases[kind].status;
 selected=null;save();render();
}
function correct(run){
 if(!run||!['Canceled','Canceled at Door','No-show'].includes(run.status))return;
 if(!confirm('Reopen this assignment because the recorded '+run.status+' was a mistake? '+
 'An audit entry is kept in the local backup. No external MAS record is changed.'))return;
 run.events=run.events||{};
 const prior=run.events.cancelOutcome||null;
 run.events.outcomeCorrections=run.events.outcomeCorrections||[];
 run.events.outcomeCorrections.push({prior,changedAt:new Date().toISOString(),reason:'Driver corrected local outcome'});
 if(prior?.at===run.events.closed)delete run.events.closed;
 delete run.events.cancelOutcome;
 run.status=hasTime(run.events?.arrived)?'Arrived':
  hasTime(run.events?.enroute)?'En Route to Pickup':'Scheduled';
 selected=null;save();render();
}
document.addEventListener('click',event=>{
 const element=event.target.closest?.('button[data-mas-choice],#mas-save,#mas-dismiss,#mas-dismiss-secondary,#mas-correct');
 if(!element)return;
 const root=element.closest('#mas-outcomes');if(!root)return;
 event.preventDefault();event.stopImmediatePropagation();
 const run=latestRun();if(!run)return;
 if(element.dataset.masChoice){
  const kind=element.dataset.masChoice;
  if(!cases[kind])return;
  selected={id:run.id,choice:kind};renderPanel();return;
 }
 if(element.id==='mas-save'){record(run);return}
 if(element.id==='mas-correct'){correct(run);return}
 if(element.id==='mas-dismiss'||element.id==='mas-dismiss-secondary'){selected=null;renderPanel();}
},true);
function open(id,choice='cancel'){
 const run=db.runs.find(r=>r.id===id&&r.date===E('date')?.value);
 if(!run)return alert('Choose a manifest assignment on the selected service date.');
 const mode=choice==='noShow'?'noShow':
   hasTime(run.events?.arrived)?'door':'cancel';
 selected={id:run.id,choice:mode};
 window.SerenityThreePage?.navigate?.('manifest');
 renderPanel();
 E('mas-outcomes')?.scrollIntoView({block:'center',behavior:'smooth'});
}
const oldRender=render;
render=function(){oldRender();renderPanel();};
renderPanel();
window.SerenityMASOutcomes={waitDeadline,validate,open,close:()=>{selected=null;renderPanel();}};
})();