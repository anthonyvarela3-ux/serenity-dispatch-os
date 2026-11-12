(()=>{
'use strict';
const $=id=>document.getElementById(id);
const KEY='serenity_preview_demo_v2';
const dateKey=()=>new Date().toISOString().slice(0,10);
const hhmm=d=>d?new Date(d).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'—';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DEMO=[
['Fictional Rider A','6315550101','Outbound','08:00 AM','100 Example St, Bay Shore, NY','200 Sample Ave, Islip, NY',8],
['Fictional Rider B','6315550102','Return','09:00 AM','200 Sample Ave, Islip, NY','100 Example St, Bay Shore, NY',8],
['Fictional Rider C','6315550103','Outbound','09:45 AM','101 Example St, Bay Shore, NY','201 Sample Ave, Islip, NY',8],
['Fictional Rider D','6315550104','Outbound','10:30 AM','102 Example St, Bay Shore, NY','202 Sample Ave, Islip, NY',8],
['Fictional Rider E','6315550105','Return','11:45 AM','202 Sample Ave, Islip, NY','102 Example St, Bay Shore, NY',8],
['Fictional Rider F','6315550106','Outbound','01:00 PM','103 Example St, Bay Shore, NY','203 Sample Ave, Islip, NY',8]
];
const toIso=(t,day=dateKey())=>{
 if(!t)return null; const m=String(t).trim().match(/^(\d{1,2}):(\d\d)\s*(AM|PM)$/i);
 if(!m)return null;let h=Number(m[1])%12+(m[3].toUpperCase()==='PM'?12:0);
 const d=new Date(day+'T00:00:00');d.setHours(h,Number(m[2]),0,0);return d.toISOString();
};
const validPhone=p=>/^\d{10,15}$/.test(String(p||'').replace(/\D/g,''));
const cleanPhone=p=>String(p||'').replace(/\D/g,'');
const safeLoad=()=>{try{const o=JSON.parse(localStorage.getItem(KEY)||'null');return o&&o.demoOnly===true?o:null}catch{return null}};
const fresh=()=>({demoOnly:true,runs:[],expanded:null,activeId:null,notes:{},facilities:{},history:[],shift:{start:null,end:null,breakStart:null,breakMs:0},settings:{rate:22.5,mult:1.5,weekly:40,font:'compact',density:'compact',theme:'dark'},position:null,lastGps:null});
let state=safeLoad()||fresh();let importPending=null,gpsTimer=null,ocrBusy=false;
const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){status('Local preview storage is full; changes may not persist.','error')}};
const status=(message,type='info')=>{const n=$('notice');n.textContent=message;n.style.borderColor=type==='error'?'#f87171':'#c38a22'};
const idFor=(x)=>[x.name.toLowerCase().trim(),x.scheduledPickup,x.pickup.toLowerCase().trim(),x.dropoff.toLowerCase().trim()].join('|');
function asRun(fields,i){
 const [name,phone,direction,time,pickup,dropoff,miles]=fields;
 if(!name||!time||!pickup||!dropoff)throw Error('Missing required name, time, pickup or drop-off on line '+(i+1));
 const scheduledPickup=toIso(time);
 if(!scheduledPickup)throw Error('Use pickup times like 09:30 AM on line '+(i+1));
 const dir=/^(return|incoming)$/i.test(direction)?'Return':/^(outbound|outgoing)$/i.test(direction)?'Outbound':null;
 if(!dir)throw Error('Direction must be Outbound or Return on line '+(i+1));
 const r={name,phone:cleanPhone(phone),direction:dir,scheduledPickup,pickup,dropoff,miles:Number(miles)||0,status:'Scheduled',gpsPickupEta:null,gpsDropoffEta:null,etaUpdatedAt:null,events:{},tripNotes:'',importedPhone:cleanPhone(phone),updatedAt:new Date().toISOString()};
 r.id=idFor(r);return r;
}
function parseLines(raw){
 const lines=raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(!lines.length)throw Error('No trips found. Please paste or extract manifest text.');
 let runs=[],bad=[];
 lines.forEach((line,i)=>{
  try{const p=line.split('|').map(x=>x.trim());if(p.length<6)throw Error('Expected at least 6 pipe-separated fields');
   const r=asRun(p,i);if(r.phone&&!validPhone(r.phone))throw Error('Invalid phone number');
   if(runs.some(x=>x.id===r.id))throw Error('Duplicate row in upload');
   runs.push(r);
  }catch(e){bad.push('Line '+(i+1)+': '+e.message)}
 });
 if(bad.length)throw Error(bad.join('; '));
 return runs;
}
function demo(){
 state=fresh();
 state.runs=DEMO.map((r,i)=>asRun(r,i));
 const delays=[-4,0,8,22,18,-3];
 state.runs.forEach((r,i)=>{const t=new Date(Date.parse(r.scheduledPickup)+delays[i]*60000);r.gpsPickupEta=t.toISOString();r.gpsDropoffEta=new Date(t.getTime()+26*60000).toISOString();r.etaUpdatedAt=new Date().toISOString();r.etaSource='DEMO ONLY';});
 state.activeId=state.runs[0].id;persist();renderAll();status('Fictional demonstration loaded. All arrival estimates are invented examples, NOT live routing.');}
function classify(r){
 if(!r.etaSource)return{tone:'unknown',label:'No GPS ETA'};
 return SerenityManifestTiming.classifyPickup({direction:r.direction,scheduledPickup:r.scheduledPickup,gpsPickupEta:r.gpsPickupEta,etaUpdatedAt:r.etaUpdatedAt,now:new Date().toISOString(),staleAfterSeconds:r.etaSource==='DEMO ONLY'?Number.MAX_SAFE_INTEGER:45});
}
const personKey=r=>r.name.toLowerCase().trim();
const contact=r=>{const rec=state.notes[personKey(r)];return rec?.verifiedPhone||r.phone||''};
const docAddress=a=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(a);
const wazeAddress=a=>'https://www.waze.com/ul?q='+encodeURIComponent(a)+'&navigate=yes';
function rowDetails(r){
 const p=state.notes[personKey(r)]||{}, mismatch=Boolean(p.verifiedPhone&&r.importedPhone&&p.verifiedPhone!==r.importedPhone);
 const temps=['On my way','Running late','I have arrived','Custom message'];
 const buttons=temps.map((label,i)=>'<button data-action="sms" data-id="'+esc(r.id)+'" data-template="'+i+'">'+label+'</button>').join('');
 const pickupTime=r.gpsPickupEta?hhmm(r.gpsPickupEta):'Unavailable';
 const dropTime=r.gpsDropoffEta?hhmm(r.gpsDropoffEta):'Unavailable';
 return '<div class="manifest-detail"><div class="two"><div class="detailbox"><strong>Pickup</strong><p>'+esc(r.pickup)+'</p><small>Office '+hhmm(r.scheduledPickup)+' · ETA '+pickupTime+'</small><p><a target="_blank" rel="noopener" href="'+docAddress(r.pickup)+'">Google Maps</a><a target="_blank" rel="noopener" href="'+wazeAddress(r.pickup)+'">Waze</a></p></div><div class="detailbox"><strong>Drop-off</strong><p>'+esc(r.dropoff)+'</p><small>GPS/route ETA '+dropTime+'</small><p><a target="_blank" rel="noopener" href="'+docAddress(r.dropoff)+'">Google Maps</a><a target="_blank" rel="noopener" href="'+wazeAddress(r.dropoff)+'">Waze</a></p></div></div>'+
 '<div class="detailbox"><strong>Customer Intelligence</strong><small>Preferred phone '+esc(contact(r)||'Not available')+(mismatch?' · ⚠ Imported number differs':'')+'</small><p>'+esc(p.notes||'No saved customer notes')+'</p><p>'+esc(state.facilities[r.dropoff.toLowerCase()]||'')+'</p><div class="actions"><button data-action="editCustomer" data-id="'+esc(r.id)+'">Edit notes and verified phone</button><button data-action="editFacility" data-id="'+esc(r.id)+'">Edit facility instructions</button><a href="tel:'+esc(contact(r))+'">Call</a></div></div>'+
 '<div class="detailbox"><strong>Manual ETA preview (not live GPS routing)</strong><div class="inline-edit"><label>Pickup ETA<input type="datetime-local" id="pu-'+esc(state.runs.indexOf(r))+'" value="'+(r.gpsPickupEta?localDateInput(r.gpsPickupEta):'')+'"></label><label>Drop-off ETA<input type="datetime-local" id="do-'+esc(state.runs.indexOf(r))+'" value="'+(r.gpsDropoffEta?localDateInput(r.gpsDropoffEta):'')+'"></label></div><button data-action="saveEta" data-id="'+esc(r.id)+'">Save manually entered ETAs</button><small>ETA source: '+esc(r.etaSource||'Unavailable')+'; manual entries must not be presented as traffic-aware GPS.</small></div>'+
 '<div class="detail-actions">'+buttons+'</div><div class="status-current" role="status" aria-live="polite"><span>CURRENT TRIP STATUS</span><strong>● '+esc(r.status)+'</strong><small>'+(r.updatedAt?'Updated '+new Date(r.updatedAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'Not yet changed')+'</small></div><div class="detail-actions status-actions" role="group" aria-label="Choose trip status">'+['En Route','Arrived','Onboard','Canceled in Advance','Canceled at Door','No-Show','Unable to Complete'].map(x=>'<button class="status-choice '+(r.status===x?'selected':'')+'" aria-pressed="'+(r.status===x?'true':'false')+'" data-action="status" data-id="'+esc(r.id)+'" data-value="'+esc(x)+'" '+(x==='Canceled at Door'&&!r.events.arrival?'disabled title="Confirm arrival first"':'')+'>'+(r.status===x?'✓ ':'')+x+'</button>').join('')+'</div>'+
 '<div class="finish-control"><button class="finish-button" data-action="finish" data-id="'+esc(r.id)+'" '+(r.status==='Completed'?'disabled':'')+'>'+(r.status==='Completed'?'✓ RUN FINISHED':'✓ FINISH RUN · CLOSE OUT')+'</button><small>'+(r.status==='Completed'?'Closed '+(r.events.completed?new Date(r.events.completed).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}):'—'):'Confirm completion and record a close-out time')+'</small></div>'+
 '<div class="detailbox"><label>Trip-specific notes<textarea id="tripnotes-'+esc(state.runs.indexOf(r))+'" rows="2">'+esc(r.tripNotes||'')+'</textarea></label><button data-action="saveTripNotes" data-id="'+esc(r.id)+'">Save trip note</button><button data-action="correct" data-id="'+esc(r.id)+'">Correct original imported field</button></div></div>';
}
function localDateInput(s){const d=new Date(s);const p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':'+p(d.getMinutes())}
function tripPhase(r) {
 const labels={'Scheduled':'NOT STARTED','En Route':'EN ROUTE TO PICKUP','Arrived':'AT PICKUP','Onboard':'ONBOARD · TO DROP-OFF','Completed':'✓ RUN FINISHED','Canceled in Advance':'CANCELED','Canceled at Door':'CANCELED AT DOOR','No-Show':'NO-SHOW','Unable to Complete':'UNABLE TO COMPLETE'};
 const tone=['Completed'].includes(r.status)?'phase-done':['En Route','Arrived','Onboard'].includes(r.status)?'phase-active':['Scheduled'].includes(r.status)?'phase-pending':'phase-exception';
 return {label:labels[r.status]||r.status,tone};
}
function renderFinanceStrip(){
 const sh=state.shift,started=sh.start?Date.parse(sh.start):0,end=sh.end?Date.parse(sh.end):Date.now();
 const pause=Number(sh.breakMs||0)+(sh.breakStart?Math.max(0,Date.now()-Date.parse(sh.breakStart)):0);
 const hours=started?Math.max(0,(end-started-pause)/3600000):0;
 const done=state.runs.filter(r=>r.status==='Completed');
 $('finance-hours').textContent=started?hours.toFixed(2)+' h':'Not started';
 $('finance-earnings').textContent=started?'$'+(hours*Number(state.settings.rate||0)).toFixed(2):'—';
 $('finance-mileage').textContent=done.length+' / '+done.reduce((sum,r)=>sum+(Number(r.miles)||0),0).toFixed(1)+' mi';
 $('finance-rate').textContent='$'+Number(state.settings.rate||0).toFixed(2);
 $('manifestStartShift').disabled=!!started&&!sh.end;
 $('manifestEndShift').disabled=!started||!!sh.end;
}

function renderManifest(){
 const runs=state.runs;
 $('metric-progress').textContent=runs.filter(x=>x.status==='Completed').length+' / '+runs.length;
 const next=runs.find(x=>!['Completed','Canceled at Door','Canceled in Advance','No-Show','Unable to Complete'].includes(x.status));
 const delta=next?classify(next):null;
 $('metric-delay').textContent=delta?delta.label:'—';
 $('metric-delay').style.color=delta&&delta.tone==='yellow'?'#fde047':delta&&delta.tone==='red'?'#fb7185':delta&&delta.tone==='purple'?'#d8b4fe':'';
 $('metric-gps').textContent=state.position?'Location received':'Off';
 $('metric-fresh').textContent=state.lastGps?new Date(state.lastGps).toLocaleTimeString():'No live route';
 renderFinanceStrip();
 $('manifest-list').innerHTML=runs.length?runs.map((r,i)=>{
  const c=classify(r),active=r.id===state.activeId,expanded=r.id===state.expanded,completed=r.status==='Completed';
  return '<div class="manifest-row '+(active?'active ':'')+(completed?'completed':'')+'"><button class="manifest-main" data-action="expand" data-id="'+esc(r.id)+'" aria-expanded="'+expanded+'"><div><div class="name">'+(completed?'✓ ':'')+(i+1)+'. '+esc(r.name)+'</div><div class="direction">'+esc(r.direction)+' · <span class="row-status">'+esc(r.status)+'</span></div></div><div class="times"><div class="timeBlock"><em>SCHEDULED PU</em><span class="timeval">'+hhmm(r.scheduledPickup)+'</span></div><div class="timeBlock"><em>ETA PU</em><span class="timeval">'+(r.gpsPickupEta?hhmm(r.gpsPickupEta):'—')+'</span></div></div><div class="timeBlock"><em>ETA DROP</em><span class="timeval">'+(r.gpsDropoffEta?hhmm(r.gpsDropoffEta):'—')+'</span></div><div class="manifest-progress-cell"><span class="delta '+c.tone+'">'+esc(c.label)+'</span><span class="trip-phase '+tripPhase(r).tone+'">'+esc(tripPhase(r).label)+'</span></div></button>'+(expanded?rowDetails(r):'')+'</div>';
 }).join(''):'<div class="empty">No manifest loaded. Select “Load fictional demo” or import reviewed fictional trip data.</div>';
}
function editCustomer(r){
 const k=personKey(r),p=state.notes[k]||{};
 const number=prompt('Verified phone (digits only; blank keeps current). For fictional demos only:',p.verifiedPhone||'');
 if(number===null)return;
 const notes=prompt('Persistent customer notes (fictional only):',p.notes||'');
 if(notes===null)return;
 const phone=cleanPhone(number);
 if(phone&&!validPhone(phone)){alert('Invalid phone number');return}
 state.notes[k]={verifiedPhone:phone,notes,updatedAt:new Date().toISOString()};
 persist();renderAll();
}
function correct(r){
 const field=prompt('Which field? Type pickup, dropoff, time, direction, phone, or name:','pickup');
 if(!field)return;
 const fields={pickup:'pickup',dropoff:'dropoff',time:'scheduledPickup',direction:'direction',phone:'phone',name:'name'};
 const key=fields[field.trim().toLowerCase()];if(!key){alert('Unrecognized field');return}
 const before=r[key]||'',after=prompt('Replacement (office-confirmed time correction or OCR fix only):',key==='scheduledPickup'?hhmm(before):before);
 if(after===null||!after.trim()||after.trim()===before)return;
 const value=key==='scheduledPickup'?toIso(after):after.trim();
 if(!value){alert('Invalid time format, use HH:MM AM/PM');return}
 if(!confirm('Preserve original '+before+' and record correction to '+after+'?'))return;
 r.edits??=[];r.edits.push({field:key,from:before,to:value,at:new Date().toISOString()});
 r[key]=value;r.updatedAt=new Date().toISOString();persist();renderAll();
}
function finishRun(r) {
 if(r.status==='Completed')return;
 if(['Canceled in Advance','Canceled at Door','No-Show','Unable to Complete'].includes(r.status)){alert('Trip has an exception outcome and cannot also be completed.');return;}
 if(!confirm('Finish run for '+r.name+'? This records completion and closes the run.'))return;
 changeStatus(r,'Completed');
}
function changeStatus(r,v){
 if(r.status==='Completed'&&v!=='Completed'&&!confirm('This run is already finished. Reopen it and change its status?'))return;
 if(v==='Completed'&&r.status==='Completed')return;
 if(v==='Canceled at Door'&&!r.events.arrival){alert('Confirm Arrived before Canceled at Door.');return}
 if(['Canceled in Advance','Canceled at Door','No-Show','Unable to Complete'].includes(v)&&!confirm('Record '+v+' for this trip? Original assignment remains preserved.'))return;
 if(v==='Arrived')r.events.arrival=new Date().toISOString();
 if(v==='Onboard')r.events.boarded=new Date().toISOString();
 if(v==='Completed')r.events.completed=new Date().toISOString();
 if(v==='Canceled at Door')r.events.canceledAtDoor=new Date().toISOString();
 r.status=v;r.updatedAt=new Date().toISOString();
 if(v==='En Route'||v==='Arrived')state.activeId=r.id;
 else if(['Completed','Canceled in Advance','Canceled at Door','No-Show','Unable to Complete'].includes(v))state.activeId=state.runs.find(x=>x.id!==r.id&&!['Completed','Canceled in Advance','Canceled at Door','No-Show','Unable to Complete'].includes(x.status))?.id||null;
 persist();renderAll();
}
function sms(r,i){
 const phone=contact(r);if(!validPhone(phone)){alert('No valid verified/imported contact number.');return}
 const eta=r.gpsPickupEta?hhmm(r.gpsPickupEta):'an updated time';
 const messages=[
 'Hello, your driver is on the way. Estimated pickup arrival: '+eta+'.',
 'Hello, your ride is running late. Current estimated pickup arrival: '+eta+'.',
 'Hello, your driver has arrived at the pickup location.',
 'Hello, this is your transportation driver.'
 ];
 const msg=prompt('Review or edit the message before opening your SMS app:',messages[i]||messages[3]);if(!msg)return;
 window.location.href='sms:'+phone+'?body='+encodeURIComponent(msg);
}
function renderIntel(){
 const q=$('intelSearch').value.trim().toLowerCase();
 const keys=[...new Set([...state.runs.map(personKey),...Object.keys(state.notes)])].filter(x=>x.includes(q)||(state.notes[x]?.notes||'').toLowerCase().includes(q));
 $('intelList').innerHTML=keys.length?keys.map(k=>'<div class="intel-card"><b>'+esc(k)+'</b><p>'+esc(state.notes[k]?.notes||'No saved notes')+'</p><small>Verified: '+esc(state.notes[k]?.verifiedPhone||'None')+'</small></div>').join(''):'<div class="empty">No matching fictional customer records.</div>';
}
function renderShift(){
 const s=state.shift,now=Date.now(),end=s.end?Date.parse(s.end):now,start=s.start?Date.parse(s.start):null;
 const breakMs=s.breakMs+(s.breakStart?Math.max(0,now-Date.parse(s.breakStart)):0);
 const hours=start?Math.max(0,(end-start-breakMs)/3600000):0;
 const rate=Number(state.settings.rate)||0,mult=Number(state.settings.mult)||1;
 const regular=hours*rate,completed=state.runs.filter(x=>x.status==='Completed').length;
 $('shiftSummary').innerHTML='<div class="toolbar"><div class="metric"><small>Shift hours (excluding breaks)</small><b>'+hours.toFixed(2)+' h</b></div><div class="metric"><small>Estimated gross*</small><b>$'+regular.toFixed(2)+'</b></div><div class="metric"><small>Completed trips</small><b>'+completed+'</b></div><div class="metric"><small>Manifest miles*</small><b>'+state.runs.reduce((a,x)=>a+(x.status==='Completed'?Number(x.miles)||0:0),0).toFixed(1)+'</b></div></div><p class="muted">*Straight-time demo estimate only. Weekly overtime cannot be correctly computed without weekly payroll records; multiplier '+mult+' and threshold '+state.settings.weekly+'h are saved but not automatically applied. Manifest miles are not GPS-tracked distance.</p><p class="muted">Started: '+(s.start?new Date(s.start).toLocaleString():'Not started')+' · Ended: '+(s.end?new Date(s.end).toLocaleString():'In progress / not started')+' · Break: '+(breakMs/60000).toFixed(0)+' min</p>';
 $('historyList').innerHTML=state.history.length?state.history.map(x=>'<div class="preview-item"><b>'+esc(x.date)+'</b> · '+x.completed+' completed · '+x.hours.toFixed(2)+' h · $'+x.earnings.toFixed(2)+' estimated</div>').join(''):'<div class="empty">No fictional daily snapshots saved.</div>';
}
function renderAll(){renderManifest();renderIntel();renderShift();applyPrefs();}
function applyPrefs(){
 const o=state.settings;
 document.body.classList.toggle('light',o.theme==='light');
 document.body.classList.remove('compact-text','medium-text','large-text','comfortable-rows');
 document.body.classList.add(o.font+'-text');if(o.density==='comfortable')document.body.classList.add('comfortable-rows');
 for(const [id,key] of [['rateInput','rate'],['overtimeFactor','mult'],['overtimeHours','weekly'],['fontInput','font'],['densityInput','density'],['themeInput','theme']])$(id).value=o[key];
}
function shiftAction(action){
 const s=state.shift,n=new Date().toISOString();
 if(action==='start'){if(s.start&&!s.end){alert('Shift already active');return}state.shift={start:n,end:null,breakStart:null,breakMs:0}}
 if(action==='end'){if(!s.start||s.end)return alert('Start a shift first');if(s.breakStart){s.breakMs+=Date.now()-Date.parse(s.breakStart);s.breakStart=null}s.end=n}
 if(action==='break'){if(!s.start||s.end)return alert('Start a shift first');if(s.breakStart){s.breakMs+=Date.now()-Date.parse(s.breakStart);s.breakStart=null}else s.breakStart=n}
 persist();renderShift();renderFinanceStrip();
}
function saveDay(){
 const s=state.shift;if(!s.start||!s.end)return alert('End a fictional shift first.');
 const hours=Math.max(0,(Date.parse(s.end)-Date.parse(s.start)-s.breakMs)/3600000);
 const snap={date:new Date(s.start).toISOString().slice(0,10),hours,earnings:hours*Number(state.settings.rate),completed:state.runs.filter(x=>x.status==='Completed').length,outcomes:state.runs.map(r=>({name:r.name,status:r.status}))};
 state.history.push(snap);persist();renderShift();status('Saved fictional daily history. Not cloud synced.');
}
function csv(){
 if(!state.runs.length)return alert('No data');
 const rows=[['Name','Direction','Scheduled Pickup','ETA Pickup','ETA Dropoff','Status','Variance'],...state.runs.map(r=>[r.name,r.direction,r.scheduledPickup,r.gpsPickupEta||'',r.gpsDropoffEta||'',r.status,classify(r).label])];
 const content=rows.map(row=>row.map(x=>'"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([content],{type:'text/csv'}));a.download='serenity-FICTIONAL-preview.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
async function ocr(){
 if(ocrBusy)return;
 const files=[...$('imageInput').files];if(!files.length||files.length>2)return alert('Select one or two screenshots.');
 if(!confirm('OCR uses a third-party library. Use fictional screenshots ONLY. Continue?'))return;
 ocrBusy=true;$('ocrStatus').textContent='Loading OCR engine...';
 try{
 if(!window.Tesseract){await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('OCR library unavailable'));document.head.appendChild(s)})}
 const worker=await Tesseract.createWorker('eng');const texts=[];
 for(let i=0;i<files.length;i++){ $('ocrStatus').textContent='Reading image '+(i+1)+' of '+files.length+'...';const r=await worker.recognize(files[i]);texts.push(r.data.text)}
 await worker.terminate();$('rawInput').value=texts.join('\n');$('ocrStatus').textContent='OCR text loaded for manual review. It has NOT been imported. Convert lines into the required pipe-delimited layout before preview.';
 }catch(e){$('ocrStatus').textContent='OCR failed: '+e.message+'. No manifest was changed.'}finally{ocrBusy=false}
}
function preview(){
 try{
 const extracted=parseLines($('rawInput').value);const existing=new Map(state.runs.map(r=>[r.id,r]));
 const logicalKey=r=>[r.name.toLowerCase().trim(),r.pickup.toLowerCase().trim(),r.dropoff.toLowerCase().trim()].join('|');
 const byLogical=new Map(state.runs.map(r=>[logicalKey(r),r]));
 let added=0,unchanged=0,changed=0;
 const previewRows=extracted.map(r=>{const e=existing.get(r.id)||byLogical.get(logicalKey(r));if(!e){added++;return{run:r,type:'NEW',existingId:null}};const diff=e.phone!==r.phone||e.direction!==r.direction||e.miles!==r.miles||e.scheduledPickup!==r.scheduledPickup;if(diff)changed++;else unchanged++;return{run:r,type:diff?'CHANGED':'MATCH',existingId:e.id}});
 importPending=previewRows;
 $('importPreview').innerHTML='<h3>Verification preview · '+added+' new, '+changed+' modified, '+unchanged+' matched</h3>'+previewRows.map(x=>'<div class="preview-item"><b>'+esc(x.type)+'</b> · '+esc(x.run.name)+' · '+hhmm(x.run.scheduledPickup)+' · '+esc(x.run.direction)+'<br><small>'+esc(x.run.pickup)+' → '+esc(x.run.dropoff)+'</small></div>').join('')+'<p class="muted">Existing assignments not present in the new screenshot are preserved and flagged for later review. Completed trip outcomes are never replaced.</p>';
 $('applyImport').disabled=false;status('Review import preview carefully before applying changes.');
 }catch(e){importPending=null;$('applyImport').disabled=true;$('importPreview').textContent=e.message;status('Import validation failed. No manifest was changed.','error')}
}
function applyImport(){
 if(!importPending)return;
 if(!confirm('Apply these reviewed changes to FICTIONAL preview data? Existing completed trip history will be preserved.'))return;
 const old=new Map(state.runs.map(r=>[r.id,r]));
 importPending.forEach(({run,existingId})=>{
  const e=old.get(existingId||run.id);
  if(e){
   if(e.status==='Completed')return;
   e.edits??=[];
   for(const key of ['phone','direction','miles','scheduledPickup'])if(e[key]!==run[key]){
    e.edits.push({field:key,from:e[key],to:run[key],at:new Date().toISOString(),reason:key==='scheduledPickup'?'reviewed office schedule change or OCR correction':'reviewed screenshot merge'});
    e[key]=run[key];
   }
   e.importedPhone=run.phone;
   // Preserve stable internal ID, trip status, actual events and original sequence.
  }else state.runs.push(run);
 });
 importPending=null;$('applyImport').disabled=true;persist();renderAll();status('Reviewed fictional manifest merged without removing completed records.');
}
function initEvents(){
 document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.id==='tab-'+b.dataset.tab))}));
 $('manifest-list').addEventListener('click',e=>{
 const btn=e.target.closest('button[data-action]');if(!btn)return;
 const r=state.runs.find(x=>x.id===btn.dataset.id);if(!r)return;
 const v=btn.dataset.action;
 if(v==='expand'){state.expanded=state.expanded===r.id?null:r.id;state.activeId=r.id}
 else if(v==='status')changeStatus(r,btn.dataset.value);
 else if(v==='finish')finishRun(r);
 else if(v==='editCustomer')editCustomer(r);
 else if(v==='editFacility'){const k=r.dropoff.toLowerCase();const p=prompt('Facility notes (fictional demo only)',state.facilities[k]||'');if(p!==null){state.facilities[k]=p;persist()}}
 else if(v==='sms')sms(r,Number(btn.dataset.template));
 else if(v==='saveTripNotes'){r.tripNotes=$('tripnotes-'+state.runs.indexOf(r)).value;persist()}
 else if(v==='correct')correct(r);
 else if(v==='saveEta'){let idx=state.runs.indexOf(r),a=$('pu-'+idx).value,b=$('do-'+idx).value;if(a&&!b||b&&!a)return alert('Enter both ETA fields or clear both');r.gpsPickupEta=a?new Date(a).toISOString():null;r.gpsDropoffEta=b?new Date(b).toISOString():null;r.etaSource=a?'MANUAL ESTIMATE':null;r.etaUpdatedAt=new Date().toISOString();persist();}
 renderAll();
 });
 $('loadDemo').onclick=()=>{if(confirm('Replace the current fictional preview with the sample manifest?'))demo()};
 $('previewImport').onclick=preview;$('applyImport').onclick=applyImport;$('runOcr').onclick=ocr;$('useText').onclick=()=>{$('rawInput').focus();status('Paste pipe-delimited fictional trips and select Validate and preview.')};
 $('intelSearch').oninput=renderIntel;
 $('startShift').onclick=()=>shiftAction('start');$('endShift').onclick=()=>shiftAction('end');
 $('manifestStartShift').onclick=()=>shiftAction('start');$('manifestEndShift').onclick=()=>shiftAction('end');$('breakShift').onclick=()=>shiftAction('break');$('saveDay').onclick=saveDay;
 $('exportCsv').onclick=csv;$('printDay').onclick=()=>window.print();
 for(const [id,key] of [['rateInput','rate'],['overtimeFactor','mult'],['overtimeHours','weekly'],['fontInput','font'],['densityInput','density'],['themeInput','theme']])$(id).onchange=e=>{state.settings[key]=['rate','mult','weekly'].includes(key)?Number(e.target.value):e.target.value;persist();renderAll()};
 $('startGPS').onclick=()=>startGPS();$('stopGPS').onclick=stopGPS;$('refreshNow').onclick=positionOnce;
 $('weatherRefresh').onclick=weather;
 $('resetDemo').onclick=()=>{if(confirm('Erase the fictional preview data on THIS device?')){localStorage.removeItem(KEY);state=fresh();renderAll();status('Fictional preview reset.')}}; 
}
function positionOnce(){
 if(!navigator.geolocation){$('gpsStatus').textContent='Geolocation unavailable in this browser';return}
 navigator.geolocation.getCurrentPosition(p=>{
  state.position={lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy};state.lastGps=new Date().toISOString();
  $('gpsStatus').textContent='Location received at '+new Date().toLocaleTimeString()+'; accuracy approximately '+Math.round(p.coords.accuracy)+'m. Traffic route ETAs are not connected.';
  persist();renderManifest();
 },e=>{$('gpsStatus').textContent='GPS unavailable: '+e.message},{enableHighAccuracy:true,timeout:12000,maximumAge:5000});
}
function startGPS(){if(gpsTimer)clearInterval(gpsTimer);positionOnce();gpsTimer=setInterval(()=>{if(!document.hidden)positionOnce()},15000);status('Requested GPS position polling every 15 seconds while foregrounded. No traffic-aware routing service connected.')}
function stopGPS(){if(gpsTimer)clearInterval(gpsTimer);gpsTimer=null;$('gpsStatus').textContent='GPS polling stopped.'}
async function weather(){
 let p=state.position;
 if(!p){$('weather').innerHTML='<div class="empty">Enable GPS position in Settings first; a forecast location is needed.</div>';return}
 $('weather').innerHTML='<div class="empty">Loading 3-period forecast...</div>';
 try{
 const url='https://api.open-meteo.com/v1/forecast?latitude='+encodeURIComponent(p.lat)+'&longitude='+encodeURIComponent(p.lon)+'&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=2';
 const response=await fetch(url);if(!response.ok)throw Error('Forecast provider unavailable');
 const d=await response.json();const now=new Date(),dates=d.hourly.time;
 const periods=[['Morning',9],['Afternoon',15],['Evening',20]];
 const date=dates.find(x=>new Date(x).getTime()>=now.getTime())?.slice(0,10)||dates[0].slice(0,10);
 $('weather').innerHTML=periods.map(([name,hour])=>{
  const index=dates.findIndex(t=>t.startsWith(date+'T'+String(hour).padStart(2,'0')));
  if(index<0)return'<div class="weather-tile">'+name+'<p>Unavailable</p></div>';
  const temp=Math.round(d.hourly.temperature_2m[index]),prob=d.hourly.precipitation_probability[index],code=d.hourly.weather_code[index],wind=Math.round(d.hourly.wind_speed_10m[index]);
  const warning=code>=95?'⛈ Thunderstorms':code>=71&&code<=86?'❄ Snow / ice':code>=51&&code<=67?'🌧 Wet roads':code>=45&&code<=48?'🌫 Fog':wind>=30?'💨 Strong wind':'';
  return'<div class="weather-tile"><strong>'+name+'</strong><b>'+temp+'°F</b><small>Rain chance '+prob+'% · Wind '+wind+' mph</small><p>'+esc(warning||'No major alert indicated')+'</p></div>';
 }).join('');
 }catch(e){$('weather').innerHTML='<div class="empty">Forecast unavailable: '+esc(e.message)+'</div>'}
}
setInterval(()=>{$('clock').textContent=new Date().toLocaleTimeString('en-US');if(!state.expanded && Date.now()%15000<1000)renderManifest();if(state.shift.start&&!state.shift.end){renderShift();renderFinanceStrip()}},1000);
initEvents();renderAll();$('clock').textContent=new Date().toLocaleTimeString('en-US');
})();