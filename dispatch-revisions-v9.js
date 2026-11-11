/* Serenity Beta 9 — driver-logged dispatch schedule revisions.
   Original RoutingBox manifest stays unchanged. Revisions are trusted ONLY
   when the driver confirms what dispatch actually communicated.
   Local-only; no RoutingBox, MAS or passenger notification is sent.
*/
(()=>{
'use strict';
if(typeof db==='undefined'||typeof timeM!=='function')return;
const E=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const closed=r=>['Completed','Canceled','Canceled at Door','No-show','Exception'].includes(r.status);
const canonicalTime=raw=>{
 const m=String(raw||'').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
 if(!m)return null;
 const h=+m[1],min=+m[2];
 return String(h%12||12)+':'+String(min).padStart(2,'0')+(h>=12?' PM':' AM');
};
const inputTime=text=>{
 const m=String(text||'').match(/^(1[0-2]|0?[1-9]):([0-5]\d)\s*(AM|PM)$/i);
 if(!m)return '';
 const h=(+m[1]%12)+(m[3].toUpperCase()==='PM'?12:0);
 return String(h).padStart(2,'0')+':'+m[2];
};
function get(run){
 const x=db.dispatchRevisions?.[run?.id];
 if(!run||!x||x.id!==run.id||x.date!==run.date||x.originalPickup!==run.pu||
 x.pickupAddr!==run.puAddr||x.confirmed!==true)return null;
 if(x.revisedPickup&&!Number.isFinite(timeM(x.revisedPickup)))return null;
 return x;
}
function pickup(run){
 const changed=get(run);
 if(changed?.revisedPickup)return timeM(changed.revisedPickup);
 const approved=window.SerenityOffice?.effective?.(run);
 return Number.isFinite(approved?.pickup)?approved.pickup:timeM(run.pu);
}
function sortRuns(runs){
 const list=[...runs].sort((a,b)=>pickup(a)-pickup(b)||timeM(a.pu)-timeM(b.pu));
 const positioned=list.map(r=>({r,entry:get(r)}))
  .filter(x=>Number.isSafeInteger(x.entry?.position)&&x.entry.position>0)
  .sort((a,b)=>String(a.entry.confirmedAt).localeCompare(String(b.entry.confirmedAt)));
 for(const {r,entry} of positioned){
  const i=list.findIndex(x=>x.id===r.id);if(i<0)continue;
  list.splice(i,1);list.splice(Math.min(list.length,entry.position-1),0,r);
 }
 return list;
}
function saveRevision(run,opts){
 if(!run)throw Error('Select an assignment.');
 if(closed(run))throw Error('This assignment is closed. A revised pickup must not reopen it.');
 if(!opts?.driverConfirmed)throw Error('Confirm that dispatch actually communicated the change.');
 const from=String(opts.source||'').trim();
 if(!from)throw Error('Choose the source of the instruction.');
 const revisedPickup=opts.revisedPickup?canonicalTime(opts.revisedPickup):null;
 if(opts.revisedPickup&&!revisedPickup)throw Error('Invalid revised pickup time.');
 const position=opts.position===''||opts.position===undefined||opts.position===null?null:Number(opts.position);
 if(position!==null&&(!Number.isSafeInteger(position)||position<1||position>25))
   throw Error('Enter a valid new order number (1–25).');
 if(!revisedPickup&&position===null)throw Error('Enter a new pickup time, a new position, or both.');
 db.dispatchRevisions=db.dispatchRevisions||{};
 db.dispatchRevisions[run.id]={
  id:run.id,date:run.date,originalPickup:run.pu,pickupAddr:run.puAddr,
  revisedPickup,position,source:from.slice(0,80),
  note:String(opts.note||'').trim().slice(0,260),
  confirmed:true,confirmedAt:new Date().toISOString()
 };
}
let activeId=null;
const manifest=E('roster'),table=E('v7-manifest-table');
if(manifest&&table){
 const button=document.createElement('button');button.type='button';
 button.id='v9-dispatch-open';button.textContent='Log Dispatch Change';
 const importButton=E('v7-import-open');if(importButton)importButton.before(button);
 const panel=document.createElement('section');panel.id='v9-dispatch-panel';
 panel.className='panel v9-dispatch-panel hidden';table.after(panel);
 function draw(){
  const date=E('date')?.value;
  const runs=sortRuns(db.runs.filter(r=>r.date===date));
  if(!activeId){panel.classList.add('hidden');panel.innerHTML='';return}
  const run=runs.find(x=>x.id===activeId);
  if(!run){activeId=null;draw();return}
  const index=runs.findIndex(x=>x.id===run.id)+1,old=get(run);
  panel.classList.remove('hidden');
  panel.innerHTML='<div class="v9-dispatch-top"><div><span class="v7-kicker">VERIFIED DISPATCH INSTRUCTION</span>'+
   '<h3>Update Run #'+index+' · '+esc(run.name)+'</h3>'+
   '<p>Original pickup: '+esc(run.pu)+' · '+esc(run.puAddr||'Unknown address')+
   '. The original manifest stays unchanged.</p></div>'+
   '<button type="button" id="v9-dispatch-close">Close</button></div>'+
   '<div class="v9-dispatch-grid"><label>New pickup time (optional)'+
   '<input id="v9-pickup" type="time" value="'+(old?.revisedPickup?inputTime(old.revisedPickup):'')+'"></label>'+
   '<label>New run position (optional)'+
   '<input id="v9-position" type="number" min="1" max="'+runs.length+'" step="1" placeholder="1 to '+runs.length+'" value="'+
   (old?.position||'')+'"></label>'+
   '<label>How dispatch told you'+
   '<select id="v9-source"><option value="">Select source</option>'+
   ['Dispatch phone call','Dispatch text','Updated RoutingBox manifest','In person with dispatcher'].map(z=>
    '<option value="'+esc(z)+'"'+(old?.source===z?' selected':'')+'>'+esc(z)+'</option>').join('')+
   '</select></label></div>'+
   '<label>Notes about revised order / agreed passenger time (optional)'+
   '<textarea id="v9-notes" rows="2" maxlength="260">'+esc(old?.note||'')+'</textarea></label>'+
   '<label class="v9-dispatch-ack"><input type="checkbox" id="v9-confirm">'+
   'I personally confirmed this updated instruction with dispatch.</label>'+
   '<div class="v9-dispatch-actions"><button type="button" id="v9-dispatch-save">Save & Reforecast</button>'+
   (old?'<button type="button" id="v9-dispatch-clear">Clear driver revision</button>':'')+'</div>'+
   '<p id="v9-dispatch-feedback" aria-live="polite">This is a driver-side record only. It does not edit RoutingBox, confirm passenger notification, or contact the office.</p>';
 }
 function open(id){
  const date=E('date')?.value;
  const runs=sortRuns(db.runs.filter(r=>r.date===date));
  activeId=id||runs.find(r=>!closed(r))?.id||null;
  if(!activeId){alert('No open run available to revise.');return}
  window.SerenityThreePage?.navigate?.('manifest');
  draw();panel.scrollIntoView({block:'center',behavior:'smooth'});
 }
 button.addEventListener('click',()=>open());
 panel.addEventListener('click',event=>{
  const target=event.target.closest('button');if(!target)return;
  if(target.id==='v9-dispatch-close'){activeId=null;draw();return;}
  const run=db.runs.find(r=>r.id===activeId&&r.date===E('date')?.value);
  if(!run)return;
  if(target.id==='v9-dispatch-clear'){
   if(!confirm('Clear this driver-entered revision? Original dispatch assignment remains intact.'))return;
   delete db.dispatchRevisions?.[run.id];activeId=null;save();render();draw();return;
  }
  if(target.id==='v9-dispatch-save'){
   try{
    saveRevision(run,{revisedPickup:E('v9-pickup').value,position:E('v9-position').value,
      source:E('v9-source').value,note:E('v9-notes').value,driverConfirmed:E('v9-confirm').checked});
    activeId=null;save();render();draw();
   }catch(error){E('v9-dispatch-feedback').textContent=error.message||'Could not save the revision.'}
  }
 });
 E('date')?.addEventListener('change',()=>{activeId=null;draw()});
 window.SerenityDispatchUpdates={get,pickup,sortRuns,open,saveRevision};
}else window.SerenityDispatchUpdates={get,pickup,sortRuns,saveRevision};
})();