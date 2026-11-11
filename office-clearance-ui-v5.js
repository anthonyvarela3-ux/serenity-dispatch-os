/* Serenity driver-side office verification panel: local-only, explicit confirmation. */
(()=>{
'use strict';
if(!window.SerenityOffice||typeof db==='undefined'||typeof render!=='function')return;
const row=document.getElementById('v5-top-row'),roster=document.getElementById('roster');
if(!row||!roster)return;
const view=document.createElement('section');
view.id='office-approval';view.className='panel office-approval hidden';
view.innerHTML='<div class="v5-sectionhead"><h2>Office Clearance · Verify the Pickup</h2><button type="button" id="office-close">Close</button></div>'+
'<div class="office-note" id="office-run-desc">Select a run to check dispatch approval.</div>'+
'<p class="office-guidance">A projected late pickup might already be agreed with the passenger, but it is <strong>not approved unless you personally confirm it with the office</strong>. This note stays on your device and never changes RoutingBox.</p>'+
'<div class="office-form">'+
'<label>Office response<select id="office-status"><option value="unknown">Not verified / clear note</option><option value="awaiting">Asked office · waiting for response</option><option value="approved">Office confirmed a later pickup</option><option value="not_approved">Office confirmed NO later pickup approval</option></select></label>'+
'<label id="office-time-label">Office-agreed pickup time<input type="time" id="office-time"></label>'+
'<label id="office-source-label">How office confirmed<select id="office-source"><option value="">Select verification method</option><option value="Office phone call">Office phone call</option><option value="Office text message">Office text message</option><option value="In person with dispatch">In person with dispatch</option><option value="Other direct office confirmation">Other direct office confirmation</option></select></label>'+
'</div>'+
'<label class="office-verified" id="office-confirm-wrap"><input type="checkbox" id="office-confirm"> I personally received the office’s confirmation of this specific revised pickup time.</label>'+
'<label>Optional explanation (no medical details)<textarea id="office-note" rows="2" maxlength="320" placeholder="e.g., office spoke with passenger, revised pickup agreed"></textarea></label>'+
'<div class="office-actions"><button type="button" id="office-save" class="primary">Save office status</button><button type="button" id="office-copy">Copy approval question for dispatch</button></div>'+
'<p id="office-feedback" aria-live="polite" class="v5-mini">Nothing is sent automatically.</p>';
row.after(view);
let selected=null;
const E=id=>document.getElementById(id);
function hhmmToStandard(raw){
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(raw))return null;
 const h=Number(raw.slice(0,2)),m=Number(raw.slice(3,5));
 return String(h%12||12)+':'+String(m).padStart(2,'0')+(h<12?' AM':' PM');
}
function toInput(s){
 const m=String(s||'').match(/^(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)$/i);
 if(!m)return '';
 const h=Number(m[1])%12+(m[3].toUpperCase()==='PM'?12:0);
 return String(h).padStart(2,'0')+':'+m[2];
}
function selectedRun(){
 return selected?db.runs.find(r=>r.id===selected.id&&r.date===selected.date):null;
}
function toggle(){
 const approved=E('office-status').value==='approved';
 E('office-time-label').classList.toggle('hidden',!approved);
 E('office-source-label').classList.toggle('hidden',!approved);
 E('office-confirm-wrap').classList.toggle('hidden',!approved);
}
function open(id){
 const date=E('date')?.value;
 const run=db.runs.find(r=>r.id===id&&r.date===date);
 if(!run)return alert('Choose a run on the selected service date.');
 selected={id:run.id,date:run.date};
 const runs=db.runs.filter(r=>r.date===date).sort((a,b)=>timeM(a.pu)-timeM(b.pu));
 const n=runs.findIndex(r=>r.id===id)+1;
 const current=window.SerenityOffice.get(run);
 E('office-run-desc').textContent='Run #'+n+' · '+run.name+
   ' · Original office pickup: '+run.pu+' · '+(run.puAddr||'Address not provided');
 E('office-status').value=current.state;
 E('office-time').value=toInput(current.agreedPickup);
 E('office-source').value=current.source||'';
 E('office-confirm').checked=false; // Each new approval must be consciously acknowledged.
 E('office-note').value=current.note||'';
 E('office-feedback').textContent=current.state==='approved'?
  'Previously confirmed '+current.agreedPickup+' · verified '+new Date(current.verifiedAt||current.updatedAt).toLocaleString()+'. Changing it requires renewed confirmation.':
  'No message has been sent. Office status is stored only on this device.';
 toggle();
 view.classList.remove('hidden');
 view.scrollIntoView({block:'center',behavior:'smooth'});
}
function close(){view.classList.add('hidden');selected=null}
E('office-status').addEventListener('change',toggle);
E('office-close').addEventListener('click',close);
E('office-save').addEventListener('click',()=>{
 const run=selectedRun();
 if(!run){E('office-feedback').textContent='Select a current run first.';return}
 const state=E('office-status').value,agreedPickup=hhmmToStandard(E('office-time').value);
 try{
  window.SerenityOffice.update(run,{
   state,agreedPickup,source:E('office-source').value,
   driverConfirmed:E('office-confirm').checked,note:E('office-note').value
  });
  save();render();
  const status=window.SerenityOffice.get(run);
  E('office-feedback').textContent=status.state==='approved'?
    'Saved office-confirmed '+status.agreedPickup+'. Original pickup remains '+run.pu+
    '. Full-day forecast recalculated.':
    'Saved '+(status.state==='awaiting'?'Awaiting office response':status.state==='not_approved'?
    'Office did not approve a later pickup':'Unverified office status')+
    '. The office schedule has not been changed.';
  if(state==='approved')E('office-confirm').checked=false;
 }catch(error){E('office-feedback').textContent=String(error.message||error);}
});
E('office-copy').addEventListener('click',async()=>{
 const run=selectedRun();if(!run)return;
 const runs=db.runs.filter(r=>r.date===run.date).sort((a,b)=>timeM(a.pu)-timeM(b.pu));
 const n=runs.findIndex(r=>r.id===run.id)+1;
 const draft='Dispatch, I am reviewing Run #'+n+' ('+run.name+') scheduled for '+run.pu+
 '. Has a later pickup already been agreed with this passenger? If so, please confirm the approved time and whether the remaining assignments need adjustment. — Anthony, Serenity Transportation';
 try{
  await navigator.clipboard.writeText(draft);
  E('office-feedback').textContent='Verification request copied. Nothing was sent. Review before sending it to dispatch.';
 }catch{
  E('office-feedback').textContent='Could not copy automatically. Ask dispatch directly whether a revised pickup was approved; nothing was sent.';
 }
});
document.addEventListener('click',event=>{
 const trigger=event.target.closest?.('button[data-office-run]');
 if(!trigger)return;
 event.preventDefault();event.stopImmediatePropagation();
 open(trigger.dataset.officeRun);
},true);
window.SerenityOfficeUI={open,close};
})();
