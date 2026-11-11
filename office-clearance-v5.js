/* Serenity driver-side office clearance: original manifest is immutable.
   This module never contacts dispatch or passengers and never changes RoutingBox.
   A later agreed pickup must be entered and confirmed by the driver.
*/
(()=>{
'use strict';
if(typeof db==='undefined'||typeof timeM!=='function')return;
const validStates=['unknown','awaiting','approved','not_approved'];
const isTime=s=>typeof s==='string'&&/^(1[0-2]|0?[1-9]):[0-5]\d\s?(AM|PM)$/i.test(s)&&Number.isFinite(timeM(s));
const canonicalTime=s=>{
 if(!isTime(s))return null;
 const n=timeM(s),h=Math.floor(n/60);
 return String(h%12||12)+':'+String(n%60).padStart(2,'0')+(h<12?' AM':' PM');
};
function get(run){
 if(!run||!run.id)return {state:'unknown'};
 const data=db.officeClearances?.[run.id];
 // Fail safe: any changed service date, scheduled pickup or pickup address
 // voids approval on this version of the manifest.
 if(!data||data.runId!==run.id||data.serviceDate!==run.date||
 data.originalPickup!==run.pu||data.pickupAddr!==run.puAddr||
 !validStates.includes(data.state))return {state:'unknown'};
 if(data.state==='approved'&&!canonicalTime(data.agreedPickup))return {state:'unknown'};
 return data;
}
function effective(run){
 const data=get(run);
 const planned=Number.isFinite(timeM(run?.pu))?timeM(run.pu):null;
 const agreed=data.state==='approved'?timeM(data.agreedPickup):null;
 return {status:data.state,original:planned,pickup:agreed===null?planned:agreed,
  agreed:data.state==='approved'?data.agreedPickup:null,verifiedAt:data.verifiedAt||null};
}
function update(run,input){
 if(!run||!run.id)throw Error('Select a passenger run first.');
 const state=String(input?.state||'unknown');
 if(!validStates.includes(state))throw Error('Choose a valid dispatch status.');
 db.officeClearances=db.officeClearances||{};
 if(state==='unknown'){delete db.officeClearances[run.id];return}
 const agreedPickup=state==='approved'?canonicalTime(input.agreedPickup):null;
 if(state==='approved'&&!agreedPickup)throw Error('Enter the office-confirmed revised pickup time.');
 if(state==='approved'&&!input.driverConfirmed)throw Error('Confirm you received actual approval from dispatch.');
 const source=String(input.source||'').trim();
 if(state==='approved'&&!source)throw Error('Select how dispatch confirmed the later pickup.');
 db.officeClearances[run.id]={
  runId:run.id,serviceDate:run.date,originalPickup:run.pu,
  pickupAddr:run.puAddr,state,agreedPickup,
  source:source.slice(0,65),note:String(input.note||'').trim().slice(0,320),
  verifiedAt:state==='approved'?new Date().toISOString():null,
  updatedAt:new Date().toISOString(),driverConfirmed:state==='approved'
 };
}
window.SerenityOffice={get,effective,update,canonicalTime};
})();
