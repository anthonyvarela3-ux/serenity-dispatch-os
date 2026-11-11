/* Driver confirmed end-of-service event, separate from unverified manifest dropoff. */
(()=>{
'use strict';
if(typeof db==='undefined'||typeof renderCustomer!=='function')return;
const old=renderCustomer;
renderCustomer=function(){
 old();
 const r=db.runs.find(item=>item.id===db.active);
 const root=document.getElementById('customer-content');
 if(!root||!r||r.status==='Completed'||r.status==='Exception')return;
 const actions=root.querySelector('.b3-actions .bar');
 if(actions){
  if(!actions.querySelector('#v5-dropoff')){
   const btn=document.createElement('button');
   btn.id='v5-dropoff';btn.type='button';btn.className='primary';
   btn.textContent='Drop off & finish';
   btn.title='Record the actual passenger drop-off time now and complete this assignment';
   const done=actions.querySelector('#complete');
   if(done){done.textContent='Close without drop-off time';done.title='Use only when you cannot verify the actual drop-off time';}
   if(done)actions.insertBefore(btn,done);else actions.append(btn);
  }
 }
 const person=db.people[norm(r.name)]||{};
 const restricted=person.preference==='No contact'||person.preference==='Do not contact';
 if(person.preference==='No call'||restricted){
  root.querySelectorAll('a[href^="tel:"]').forEach(a=>{
   a.removeAttribute('href');a.setAttribute('aria-disabled','true');
   a.style.pointerEvents='none';a.title='Passenger requested no phone calls';
  });
 }
 if(restricted){
  root.querySelectorAll('button[data-macro],#copy-message').forEach(b=>{
   b.disabled=true;b.title='Passenger has a do-not-contact preference';
  });
  const message=root.querySelector('#message');if(message)message.disabled=true;
  root.querySelectorAll('a[href*="voice.google.com"],a[href^="sms:"]').forEach(a=>{
   a.removeAttribute('href');a.setAttribute('aria-disabled','true');
   a.style.pointerEvents='none';a.title='Passenger requested no contact';
  });
  const warning=document.createElement('p');
  warning.className='alert';warning.textContent='DO NOT CONTACT: passenger preference blocks call and message controls. Check dispatch if an operational emergency requires clarification.';
  const box=root.querySelector('.b3-message')||root;
  box.prepend(warning);
 }
};
document.addEventListener('click',event=>{
 const button=event.target.closest?.('button');
 if(!button||(!button.dataset.macro&&button.id!=='copy-message'))return;
 const r=db.runs.find(item=>item.id===db.active);if(!r)return;
 const preference=db.people[norm(r.name)]?.preference;
 if(preference!=='No contact'&&preference!=='Do not contact')return;
 event.preventDefault();event.stopImmediatePropagation();
 alert('Do not contact this passenger. If there is an emergency, contact the dispatch office for instructions.');
},true);
document.addEventListener('click',event=>{
 const btn=event.target.closest?.('#v5-dropoff');if(!btn)return;
 event.preventDefault();event.stopImmediatePropagation();
 const r=db.runs.find(item=>item.id===db.active);if(!r)return;
 if(window.SerenityLifecycle?.markEvent){
  const result=window.SerenityLifecycle.markEvent(r,'dropoff');
  if(result?.ok===true)show('roster');
  return;
 }
 if(!confirm('Confirm this passenger was dropped off NOW? Serenity will record the actual time and complete this run.'))return;
 const now=new Date().toISOString();
 r.events=r.events||{};
 r.events.dropoff=now;r.events.closed=now;r.status='Completed';
 db.active=null;
 save();show('roster');
},true);
})();