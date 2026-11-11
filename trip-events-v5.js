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
 if(person.preference==='No call'||person.preference==='No contact'||person.preference==='Do not contact'){
  root.querySelectorAll('a[href^="tel:"]').forEach(a=>{
   a.removeAttribute('href');a.setAttribute('aria-disabled','true');
   a.style.pointerEvents='none';a.title='Passenger requested no phone calls';
  });
 }
};
document.addEventListener('click',event=>{
 const btn=event.target.closest?.('#v5-dropoff');if(!btn)return;
 event.preventDefault();event.stopImmediatePropagation();
 const r=db.runs.find(item=>item.id===db.active);if(!r)return;
 if(!confirm('Confirm this passenger was dropped off NOW? Serenity will record the actual time and complete this run.'))return;
 const now=new Date().toISOString();
 r.events=r.events||{};
 r.events.dropoff=now;r.events.closed=now;r.status='Completed';
 db.active=null;
 save();show('roster');
},true);
})();