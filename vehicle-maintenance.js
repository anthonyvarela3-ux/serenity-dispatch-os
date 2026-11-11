/* Vehicle upkeep on the driver-side Daily Master; saved locally in Serenity backup. */
(() => {
  'use strict';
  const roster=document.getElementById('roster');
  if(!roster || typeof db==='undefined' || typeof render!=='function')return;
  const style=document.createElement('style');
  style.textContent='.vehicle-card{border-color:var(--accent);padding:12px 16px;display:flex;flex-direction:column;gap:9px}.vehicle-head{display:flex;align-items:center;gap:12px;justify-content:space-between;flex-wrap:wrap}.vehicle-display{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0}.vehicle-eyebrow{font-size:12px;letter-spacing:.065em;font-weight:750;color:var(--muted)}#oil-status{font-size:clamp(19px,2.2vw,25px);letter-spacing:-.03em;line-height:1.2}#oil-status.warn{color:#fbbf24}body.light #oil-status.warn{color:#92400e}#oil-status.ok{color:#34d399}body.light #oil-status.ok{color:#047857}#oil-detail{font-size:13px;color:var(--muted);line-height:1.45}.vehicle-card details{border-top:1px solid var(--border);padding-top:7px}.vehicle-card summary{cursor:pointer;min-height:35px;display:list-item;font-weight:700}.vehicle-fields{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:end;padding:6px 0 12px}.vehicle-fields label{font-size:13px;margin:0}.vehicle-fields input{width:100%;display:block;margin-top:5px;min-height:44px}.vehicle-caption{font-size:12px;color:var(--muted);line-height:1.4;max-width:95ch}@media(max-width:950px){.vehicle-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:510px){.vehicle-fields{grid-template-columns:1fr}}';
  document.head.appendChild(style);
  const card=document.createElement('div');
  card.className='panel vehicle-card';
  card.id='vehicle-card';
  card.innerHTML='<div class="vehicle-head"><div class="vehicle-display"><span class="vehicle-eyebrow">VEHICLE UPKEEP · OIL CHANGE</span><strong id="oil-status" aria-live="polite">Oil change reminder not configured</strong><span id="oil-detail">Set your last service mileage and interval to see the next due reading.</span></div></div>'+
    '<details id="vehicle-settings"><summary>Update oil change mileage</summary><div class="vehicle-fields">'+
    '<label for="vehicle-label">Vehicle label (optional)<input id="vehicle-label" maxlength="60" placeholder="My car"></label>'+
    '<label for="oil-last">Last oil change at (mi)<input id="oil-last" inputmode="numeric" type="number" min="0" max="9999999" step="1" placeholder="Enter actual mileage"></label>'+
    '<label for="oil-interval">Service interval (mi)<input id="oil-interval" inputmode="numeric" type="number" min="1" max="50000" step="1" placeholder="From service sticker"></label>'+
    '<label for="oil-current">Current odometer (optional)<input id="oil-current" inputmode="numeric" type="number" min="0" max="9999999" step="1" placeholder="Latest reading"></label></div>'+
    '<button type="button" id="save-oil" class="primary">Save oil change reminder</button>'+
    '<p class="vehicle-caption">Manual vehicle tracking. Saved on this device and included in Export backup. Check your service records for the right interval; Serenity cannot read your car mileage automatically.</p></details>';
  roster.insertBefore(card,roster.firstChild);
  const el=id=>document.getElementById(id);
  const fmt=n=>n.toLocaleString('en-US');
  const validMiles=n=>Number.isSafeInteger(n)&&n>=0&&n<=9999999;
  function populate(){
    const v=db.vehicle||{};
    el('vehicle-label').value=typeof v.label==='string'?v.label:'';
    el('oil-last').value=validMiles(v.lastOilMiles)?String(v.lastOilMiles):'';
    el('oil-interval').value=Number.isSafeInteger(v.interval)&&v.interval>0?String(v.interval):'';
    el('oil-current').value=validMiles(v.currentMiles)?String(v.currentMiles):'';
  }
  function renderVehicle(){
    const v=db.vehicle||{},h=el('oil-status'),d=el('oil-detail');
    h.classList.remove('warn','ok');
    if(!validMiles(v.lastOilMiles)||!Number.isSafeInteger(v.interval)||v.interval<1||v.interval>50000){
      h.textContent='Oil change reminder not configured';
      d.textContent='Enter last service mileage and your confirmed service interval.';
    }else{
      const due=v.lastOilMiles+v.interval,label=typeof v.label==='string'&&v.label.trim()?v.label.trim()+' · ':'';
      if(due>9999999){h.textContent='Check oil service mileage';d.textContent='Calculated next due reading is out of range.';}
      else{
        h.textContent='Next oil change · '+fmt(due)+' mi';
        if(validMiles(v.currentMiles)){
          const remain=due-v.currentMiles;
          if(remain<=0){d.textContent=label+(remain===0?'Due at current mileage':fmt(Math.abs(remain))+' miles overdue')+' · Odometer '+fmt(v.currentMiles)+' mi';h.classList.add('warn');}
          else{d.textContent=label+fmt(remain)+' mi remaining · Odometer '+fmt(v.currentMiles)+' mi';h.classList.add(remain<=500?'warn':'ok');}
        }else{d.textContent=label+'Last service '+fmt(v.lastOilMiles)+' mi · Interval '+fmt(v.interval)+' mi · Enter current mileage to see miles remaining.';}
      }
    }
    if(!el('vehicle-settings').open)populate();
  }
  el('vehicle-settings').addEventListener('toggle',e=>{if(e.target.open)populate();});
  function read(field,max,required){
    const raw=el(field).value.trim();
    if(!raw){if(required)throw Error('Last service mileage and interval are required.');return null;}
    if(!/^[0-9]+$/.test(raw))throw Error('Enter whole numbers without commas.');
    const val=Number(raw);
    if(!Number.isSafeInteger(val)||val>max)throw Error('Invalid mileage in '+field+'.');
    return val;
  }
  el('save-oil').addEventListener('click',()=>{
    try{
      const lastOilMiles=read('oil-last',9999999,true),interval=read('oil-interval',50000,true),currentMiles=read('oil-current',9999999,false);
      if(interval<1||lastOilMiles+interval>9999999)throw Error('Check the service interval and next due mileage.');
      if(currentMiles!==null&&currentMiles<lastOilMiles)throw Error('Current odometer cannot be less than last oil change mileage.');
      db.vehicle={label:el('vehicle-label').value.trim(),lastOilMiles,interval,currentMiles,updatedAt:new Date().toISOString()};
      save();el('vehicle-settings').open=false;renderVehicle();
    }catch(e){alert(e.message);}
  });
  const originalRender=render;
  render=function(){originalRender();renderVehicle();};
  renderVehicle();
})();