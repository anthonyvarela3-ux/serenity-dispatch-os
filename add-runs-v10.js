/* Serenity Beta 10 — add newly assigned runs without replacing a shift.
   Manual add is a guaranteed fallback when screenshot OCR cannot read a card.
   No real rider data shipped in source or sent to a server. */
(()=>{
'use strict';
if(typeof db==='undefined'||typeof save!=='function'||typeof render!=='function'||!window.SerenityThreePage)return;
const E=id=>document.getElementById(id);
const h=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[x]));
const norm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const fmt=raw=>{
 const m=String(raw||'').match(/^([01]\d|2[0-3]):([0-5]\d)$/);
 if(!m)return null;
 const hour=+m[1],minutes=+m[2];
 return String(hour%12||12)+':'+String(minutes).padStart(2,'0')+(hour<12?' AM':' PM');
};
const identical=(a,b)=>[a.date,a.name,a.pu,a.puAddr,a.du,a.doAddr].every(k=>norm(a[k])===norm(b[k]));
const possible=(a,b)=>a.date===b.date&&norm(a.name)===norm(b.name)&&
 norm(a.pu)===norm(b.pu)&&norm(a.du)===norm(b.du);
const terminal=r=>['Completed','Canceled','Canceled at Door','No-show','Exception'].includes(r.status);
const manifest=E('roster'),heading=manifest?.querySelector('.v7-manifest-heading');
if(!manifest||!heading)return;
const panel=document.createElement('section');panel.id='v10-add-runs';panel.className='v10-add-runs hidden';
heading.after(panel);
panel.innerHTML='<div class="v10-form-head"><div><span class="v7-kicker">UPDATED DISPATCH · APPEND ONLY</span>'+
 '<h2>Add newly assigned runs</h2><p>Nothing is replaced. Add one or more trips and review before saving them alongside your existing runs.</p></div>'+
 '<button type="button" id="v10-close-add">Close</button></div>'+
 '<div id="v10-add-rows"></div>'+
 '<div class="v10-add-actions"><button type="button" id="v10-add-row">+ Add another run</button>'+
 '<button type="button" id="v10-review-add" class="primary">Review & add to Manifest</button></div>'+
 '<p id="v10-add-feedback" role="status" aria-live="polite"></p>'+
 '<div class="v10-add-help">Tip: To import directly from a RoutingBox screenshot instead, use <button type="button" id="v10-ocr-from-add">Read screenshot with OCR</button> and review each extracted trip. An image by itself is only a reference until you confirm the import.</div>';
let counter=0,visible=false;
const rows=()=>[...panel.querySelectorAll('.v10-entry')];
const field=(name,label,type='text')=>'<label>'+label+'<input type="'+type+'" data-v10="'+name+'" '+
 (name==='name'?'autocapitalize="words" ':'')+'required></label>';
function addRow(data){
 const item=document.createElement('div');item.className='v10-entry';
 const idx=++counter;
 item.innerHTML='<div class="v10-row-heading"><strong>New assignment '+idx+'</strong>'+
 '<button type="button" data-v10-remove>Remove row</button></div>'+
 '<div class="v10-fields">'+field('name','Passenger')+
 field('pu','Pickup time','time')+field('puAddr','Pickup address')+
 field('du','Drop-off time','time')+field('doAddr','Drop-off address')+'</div>';
 E('v10-add-rows').append(item);
 if(data)for(const [key,value] of Object.entries(data)){
  const input=item.querySelector('[data-v10="'+key+'"]');
  if(input)input.value=value;
 }
 return item;
}
function open(){
 window.SerenityThreePage.navigate('manifest');
 if(!visible){visible=true;panel.classList.remove('hidden');if(!rows().length)addRow();}
 panel.scrollIntoView({block:'start',behavior:'smooth'});
}
function close(){visible=false;panel.classList.add('hidden');}
function entries(){
 const date=E('date')?.value;
 return rows().map((entry,i)=>{
  const data={};
  for(const input of entry.querySelectorAll('[data-v10]'))data[input.dataset.v10]=input.value.trim();
  return {index:i+1,date,name:data.name||'',pu:fmt(data.pu),puAddr:data.puAddr||'',
   du:fmt(data.du),doAddr:data.doAddr||'',sourcePhone:'',miles:null,tariff:null,
   status:'Scheduled',events:{},ready:false,notes:''};
 });
}
function check(){
 const list=entries(),existing=db.runs,valid=[],errors=[],duplicate=[];
 const seen=[];
 for(const r of list){
  if(!r.name||!r.pu||!r.puAddr||!r.du||!r.doAddr){
   errors.push('Run '+r.index+': enter the name, both times and both addresses.');continue;
  }
  if(!Number.isFinite(timeM(r.pu))||!Number.isFinite(timeM(r.du))){
   errors.push('Run '+r.index+': check pickup and drop-off times.');continue;
  }
  if(timeM(r.du)<timeM(r.pu)){
   errors.push('Run '+r.index+': scheduled drop-off is before pickup. Verify the times.');continue;
  }
  if(existing.some(x=>identical(r,x))||seen.some(x=>identical(r,x))){
   duplicate.push('Run '+r.index+': identical assignment already exists; will skip.');continue;
  }
  if(existing.some(x=>possible(r,x))||seen.some(x=>possible(r,x))){
   errors.push('Run '+r.index+': the same passenger and times already exist with different addresses. Review dispatch before adding a conflicting record.');continue;
  }
  valid.push(r);seen.push(r);
 }
 return {valid,errors,duplicate};
}
function submit(){
 const result=check(),note=E('v10-add-feedback');
 note.innerHTML=result.errors.map(h).join(' • ')+(result.duplicate.length?
  '<p>'+result.duplicate.map(h).join(' · ')+'</p>':'');
 if(result.errors.length){note.classList.add('v10-error');return}
 note.classList.remove('v10-error');
 if(!result.valid.length){note.textContent='No new trips to add. All rows may already be present.';return}
 const lines=result.valid.map(r=>r.name+' · '+r.pu+' → '+r.du).join('\n');
 const day=E('date').value,base=db.runs.filter(r=>r.date===day).length;
 if(!confirm('ADD '+result.valid.length+' new assignment(s) for '+day+
  '?\nExisting '+base+' runs, event timestamps, notes and status will NOT be replaced.\n\n'+lines))return;
 let added=0;
 for(const r of result.valid){
  if(db.runs.some(x=>identical(r,x)))continue;
  const entry={...r};delete entry.index;
  entry.id=typeof id==='function'?id():'new-'+Date.now()+'-'+Math.random().toString(36).slice(2);
  db.runs.push(entry);added++;
 }
 if(!added){note.textContent='These runs were already imported.';return}
 save();render();close();E('v10-add-rows').innerHTML='';
 alert('Added '+added+' new run(s). All '+base+' previously saved assignments and events are preserved.');
 window.SerenityThreePage.navigate('manifest');
}
const actions=heading.querySelector('.v7-heading-row');
if(actions){
 const quick=document.createElement('div');quick.className='v10-import-buttons';
 quick.innerHTML='<button type="button" id="v10-open-add">+ Add Runs</button>'+
 '<button type="button" id="v10-open-ocr">Import Screenshot</button>';
 actions.append(quick);
}
manifest.addEventListener('click',event=>{
 const target=event.target.closest('button');if(!target)return;
 if(target.id==='v10-open-add'){event.preventDefault();event.stopImmediatePropagation();open();}
 if(target.id==='v10-close-add'){event.preventDefault();close();}
 if(target.id==='v10-add-row'){event.preventDefault();addRow();}
 if(target.hasAttribute('data-v10-remove')){
  event.preventDefault();target.closest('.v10-entry')?.remove();
  if(!rows().length)addRow();
 }
 if(target.id==='v10-review-add'){event.preventDefault();event.stopImmediatePropagation();submit();}
 if(target.id==='v10-open-ocr'||target.id==='v10-ocr-from-add'){
  event.preventDefault();event.stopImmediatePropagation();show('import');
  const importDate=E('import-date');if(importDate)importDate.value=E('date').value;
  E('v7-import-details').open=true;
  E('manifest-image')?.scrollIntoView({block:'center',behavior:'smooth'});
 }
},true);
E('date')?.addEventListener('change',()=>{if(visible)close()});
window.SerenityAddRuns={open,entries,check,identical,possible};
})();