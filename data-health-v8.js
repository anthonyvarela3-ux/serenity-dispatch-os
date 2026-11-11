/* Serenity v8: conservative data-shape repair for older local backups.
   Never replaces official schedule fields, rider identities, or route times. */
(()=>{
'use strict';
if(typeof db==='undefined'||typeof render!=='function')return;
function normalize(){
 if(!db||!Array.isArray(db.runs))return;
 let changed=false;
 if(!db.people||typeof db.people!=='object'||Array.isArray(db.people)){db.people={};changed=true;}
 if(!db.shift||typeof db.shift!=='object'||Array.isArray(db.shift)){
  db.shift={start:null,end:null,rate:22.5};changed=true;
 }
 for(const r of db.runs){
  if(!r||typeof r!=='object')continue;
  if(!r.events||typeof r.events!=='object'||Array.isArray(r.events)){
   r.events={};
   changed=true;
  }
  if(!r.status||typeof r.status!=='string'){
   r.status='Scheduled';
   r.events.audit=Array.isArray(r.events.audit)?r.events.audit:[];
   r.events.audit.push({kind:'migration',reason:'missing_status_defaulted_to_scheduled',
     recordedAt:new Date().toISOString()});
   changed=true;
  }
 }
 if(changed){
  try{
   const key=typeof KEY==='string'?KEY:'serenity_beta1_v1';
   localStorage.setItem(key,JSON.stringify(db));
  }catch(e){
   console.warn('Serenity legacy record normalization could not persist',e);
  }
 }
}
normalize();
const oldRender=render;
render=function(){normalize();oldRender();};
window.SerenityDataHealth={normalize};
})();