/* Serenity trip lifecycle v8: single source of truth for recording and repairing
 * local trip event timestamps. NEVER writes to RoutingBox or confirms payment.
 * Designed to preserve the original office manifest and recover older closures
 * with no actual drop-off event.
 */
(()=>{
'use strict';
if(typeof db==='undefined'||typeof render!=='function')return;
const allowed=['enroute','arrived','boarded','dropoff'];
const order=Object.fromEntries(allowed.map((e,i)=>[e,i]));
const localDate=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const format=s=>{const d=new Date(s);return Number.isFinite(d.getTime())?d.toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'invalid time'};
const valid=s=>typeof s==='string'&&Number.isFinite(Date.parse(s));
const isClosed=r=>r.status==='Completed'||r.status==='Exception';
const key=typeof KEY==='string'?KEY:'serenity_beta1_v1';
function notify(message,ok=false){
 const node=document.getElementById('v8-event-feedback');
 if(node){
  node.textContent=message;
  node.setAttribute('role','status');
  node.dataset.state=ok?'saved':'error';
 }
 if(!ok&&typeof alert==='function')alert(message);
}
function clone(value){return JSON.parse(JSON.stringify(value));}
function commit(run,mutate,meta){
 const backup=clone(run);
 try{
  mutate();
  // A successful in-memory change is not a successful saved trip.
  const data=JSON.stringify(db);
  localStorage.setItem(key,data);
  const reread=JSON.parse(localStorage.getItem(key)||'null');
  const stored=reread?.runs?.find(r=>r.id===run.id&&r.date===run.date);
  const stamp=run.events?.[meta.kind];
  if(!stored || stored.status!==run.status ||
     (meta.kind!=='reopen'&&stored.events?.[meta.kind]!==stamp)||
     (meta.kind==='reopen'&&stored.status==='Exception'))
    throw Error('Storage verification failed');
 }catch(err){
  Object.keys(run).forEach(k=>delete run[k]);
  Object.assign(run,backup);
  notify('Trip change could not be saved. Original data restored. Check iPad storage and export a backup. '+(err?.message||''));return {ok:false,reason:'storage'};
 }
 try{render()}catch(err){
  // The event is already confirmed stored even if a screen fails to refresh.
  console.error('Trip saved but screen did not refresh:',err);
  notify('Trip saved locally, but a screen failed to refresh. Reopen Serenity and check the run.',true);
 }
 try{window.dispatchEvent(new CustomEvent('serenity-trip-event',{
  detail:{runId:run.id,kind:meta.kind,date:run.date,at:meta.at||null}
 }))}catch(err){console.warn('Trip event refresh notification failed',err)}
 return {ok:true,runId:run.id,kind:meta.kind};
}
function getRun(run){
 if(!run||!run.id)return null;
 return db.runs.find(r=>r.id===run.id&&r.date===run.date)||null;
}
function chronological(events,kind,stamp){
 const date=Date.parse(stamp),idx=order[kind];
 for(const [key,pos] of Object.entries(order)){
  if(key===kind||!valid(events[key]))continue;
  const other=Date.parse(events[key]);
  if(pos<idx&&other>date)return key+' is recorded after this time ('+format(events[key])+'). Correct that event first.';
  if(pos>idx&&other<date)return key+' is recorded before this time ('+format(events[key])+'). Correct that event first.';
 }
 return null;
}
function appendAudit(events,kind,at,source,previous){
 events.audit=Array.isArray(events.audit)?events.audit:[];
 events.audit.push({kind,at,source,previous:previous||null,recordedAt:new Date().toISOString()});
 if(events.audit.length>80)events.audit=events.audit.slice(-80);
}
function interpretDateTime(input){
 if(typeof input!=='string'||!/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(input))return null;
 const dt=new Date(input);
 return Number.isFinite(dt.getTime())?dt:null;
}
function canBackfill(run,stamp){
 const date=new Date(stamp),service=new Date(run.date+'T00:00:00');
 if(!Number.isFinite(date.getTime())||!Number.isFinite(service.getTime()))return 'Invalid timestamp or service date.';
 if(date.getTime()>Date.now()+60000)return 'Actual events cannot be recorded in the future.';
 const early=service.getTime()-12*3600000,late=service.getTime()+48*3600000;
 if(date.getTime()<early||date.getTime()>late)return 'Select a time on the service date or within the neighboring overnight period.';
 return null;
}
function markEvent(candidate,kind){
 const run=getRun(candidate);
 if(!run)return {ok:false,reason:'missing_run'};
 if(!allowed.includes(kind)){notify('Unknown trip action. No changes saved.');return {ok:false,reason:'invalid_action'}}
 if(isClosed(run)){
  if(run.status==='Completed'&&!valid(run.events?.dropoff)){
   notify('This run was closed without a verified drop-off time. Open its Customer page and use Repair actual time to enter the real drop-off; do not stamp the current time for an earlier event.');
  }else notify('Run already closed. Open the Customer page to review or correct recorded actual times.');
  return {ok:false,reason:'closed'};
 }
 const now=new Date();
 if(localDate(now)!==run.date){
  notify('This run is dated '+run.date+', not today ('+localDate(now)+'). Use the Customer page’s actual-time correction form to record an earlier or overnight event.');
  return {ok:false,reason:'date_mismatch'};
 }
 const events=run.events||{};
 if(valid(events[kind])){notify(kind+' was already recorded at '+format(events[kind])+'. Use the correction form if it is inaccurate.');return {ok:false,reason:'duplicate'}}
 const problem=chronological(events,kind,now.toISOString());
 if(problem){notify('Event order conflicts: '+problem);return {ok:false,reason:'chronology'}}
 if(kind==='enroute'&&(valid(events.arrived)||valid(events.boarded)))
  return {ok:false,reason:'prior_progress',message:notify('Pickup progress already recorded. Use correction form if En route was missed.')};
 let question='';
 if(kind==='dropoff'){
  question='Confirm this passenger was actually DROPPED OFF NOW?\\n\\nThis marks the local run Completed and records an actual drop-off time. It DOES NOT update RoutingBox or guarantee payment.';
  if(!valid(events.boarded))question+='\\n\\nBoarded was not recorded. That event will remain missing; verify its official coding.';
 }else if(kind==='boarded'&&!valid(events.arrived))
  question='Pickup arrival was not recorded. Confirm this passenger actually boarded NOW? Missing arrival will remain unrecorded.';
 if(question&&!confirm(question))return {ok:false,reason:'cancelled'};
 const result=commit(run,()=>{
  run.events=run.events&&typeof run.events==='object'&&!Array.isArray(run.events)?run.events:{};
  run.events[kind]=now.toISOString();
  appendAudit(run.events,kind,now.toISOString(),'driver_now',null);
  if(kind==='enroute')run.status='En route';
  else if(kind==='arrived')run.status='Arrived';
  else if(kind==='boarded')run.status='Onboard';
  else if(kind==='dropoff'){
   run.status='Completed';
   run.events.closed=now.toISOString();
   run.events.dropoffSource='driver_now';
   if(db.active===run.id)db.active=null;
  }
 },{kind,at:now.toISOString()});
 if(result.ok)notify(kind==='dropoff'?'Drop-off recorded and run closed locally. Verify RoutingBox coding.':kind+' recorded at '+format(now.toISOString()),true);
 return result;
}
function correct(candidate,kind,localStamp){
 const run=getRun(candidate);
 if(!run||!allowed.includes(kind)){notify('Select a valid run and event to correct.');return {ok:false,reason:'invalid'}}
 if(run.status==='Exception'&&kind==='dropoff'){
  notify('This run is marked Exception/No-show. Review and reopen the exception before recording a passenger drop-off.');
  return {ok:false,reason:'exception'};
 }
 const stamp=interpretDateTime(localStamp);
 if(!stamp){notify('Choose a valid date and time for the event.');return {ok:false,reason:'time'}}
 const iso=stamp.toISOString(),problem=canBackfill(run,iso);
 if(problem){notify(problem);return {ok:false,reason:'date'}}
 const events=run.events||{},chronology=chronological(events,kind,iso);
 if(chronology){notify('Event order conflicts: '+chronology);return {ok:false,reason:'chronology'}}
 const prior=valid(events[kind])?events[kind]:null;
 if(prior&&Date.parse(prior)===Date.parse(iso)){
  notify('This time is already recorded. No change needed.',true);return {ok:true,unchanged:true};
 }
 const purpose=prior?'CORRECT the previously recorded '+kind+' time':'ENTER the previously missing '+kind+' time';
 if(!confirm(purpose+' to '+format(iso)+'?\\n\\nThis stores a driver-entered actual time with an audit record. It does not update RoutingBox.'))return {ok:false,reason:'cancelled'};
 const result=commit(run,()=>{
  run.events=run.events&&typeof run.events==='object'&&!Array.isArray(run.events)?run.events:{};
  run.events[kind]=iso;
  appendAudit(run.events,kind,iso,'driver_manual_backfill',prior);
  if(kind==='dropoff'){
   run.status='Completed';
   if(!valid(run.events.closed))run.events.closed=iso;
   run.events.dropoffSource='driver_manual_backfill';
   if(db.active===run.id)db.active=null;
  }else if(!isClosed(run)){
   if(kind==='boarded')run.status='Onboard';
   else if(kind==='arrived'&&run.status!=='Onboard')run.status='Arrived';
   else if(kind==='enroute'&&run.status==='Scheduled')run.status='En route';
  }
 },{kind,at:iso});
 if(result.ok)notify('Actual '+kind+' time saved. Verify RoutingBox coding separately.',true);
 return result;
}
function reopenException(candidate){
 const run=getRun(candidate);
 if(!run||run.status!=='Exception')return {ok:false,reason:'not_exception'};
 if(!confirm('Reopen this locally recorded NO-SHOW / EXCEPTION as an active run? Verify your office instructions. This DOES NOT change RoutingBox coding.'))return {ok:false,reason:'cancelled'};
 const was=run.events?.closed;
 const result=commit(run,()=>{
  run.events=run.events||{};
  if(was){appendAudit(run.events,'reopen',new Date().toISOString(),'driver_reopened_exception',was);delete run.events.closed}
  run.status=valid(run.events.boarded)?'Onboard':valid(run.events.arrived)?'Arrived':valid(run.events.enroute)?'En route':'Scheduled';
 },{kind:'reopen',at:new Date().toISOString()});
 if(result.ok)notify('Exception reopened locally. Confirm official RoutingBox status separately.',true);
 return result;
}
function codeChecked(candidate,checked){
 const run=getRun(candidate);
 if(!run)return {ok:false};
 if(checked&&!isClosed(run)){notify('Finish or correctly classify the run before marking external coding checked.');return {ok:false}}
 if(checked&&!confirm('Confirm you personally checked this run’s official status in RoutingBox (or confirmed with your office). This does NOT verify that payment was received.'))return {ok:false,reason:'cancelled'};
 db.codingVerification=db.codingVerification||{};
 const old=db.codingVerification[run.id],stamp=new Date().toISOString();
 try{
  db.codingVerification[run.id]=checked?{runId:run.id,date:run.date,status:run.status,verifiedAt:stamp,source:'driver_explicitly_checked_routingbox'}:null;
  localStorage.setItem(key,JSON.stringify(db));
  const reread=JSON.parse(localStorage.getItem(key)||'null');
  if(checked&&!reread?.codingVerification?.[run.id]?.verifiedAt)throw Error('Verification could not be saved');
 }catch(e){
  db.codingVerification[run.id]=old;
  notify('Coding-check note could not be saved. '+e.message);return {ok:false,reason:'storage'};
 }
 try{render()}catch(e){console.error(e)}
 notify(checked?'Driver-confirmed RoutingBox coding review saved. Payment is not verified.':'Coding-check acknowledgement cleared.',true);
 return {ok:true};
}
window.SerenityLifecycle={markEvent,correct,reopenException,codeChecked,valid,chronological,canBackfill};
})();