/* Serenity whole-day scheduling forecast. Manual travel assumptions, not routed GPS ETAs. */
(() => {
  'use strict';
  const roster=document.getElementById('roster');
  if(!roster || typeof db==='undefined' || typeof render!=='function')return;
  const css=document.createElement('style');
  css.textContent='.daylook{border-color:var(--accent);padding:14px 16px}.daylook-top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.daylook h2{margin:0;font-size:21px}.daylook-sub{font-size:13px;color:var(--muted);line-height:1.5;margin:6px 0 10px}.daylook-control{display:flex;gap:9px;align-items:end;flex-wrap:wrap}.daylook-control label{font-size:13px;margin:0}.daylook-control input{display:block;margin-top:4px;max-width:170px}.daylook-data{overflow-x:auto}.daylook table{width:100%;border-collapse:collapse;min-width:750px}.daylook td,.daylook th{padding:9px 7px;vertical-align:middle;font-size:13px}.daylook th{font-size:12px;color:var(--muted)}.daylook th:nth-child(2),.daylook td:nth-child(2){min-width:128px}.daylook td button{padding:7px 8px;min-height:35px;text-align:left;font-size:13px}.daylook .future{text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px}.daylook-status{font-weight:800;border-radius:6px;padding:5px 8px;display:inline-block;background:var(--bg);border:1px solid var(--border)}.daylook-status.late{color:#fb7185}.daylook-status.risk{color:#fbbf24}.daylook-status.good{color:#34d399}.daylook-status.done{color:var(--muted)}body.light .daylook-status.late{color:#b91c1c}body.light .daylook-status.risk{color:#92400e}body.light .daylook-status.good{color:#047857}.daylook-summary{display:flex;gap:6px;flex-wrap:wrap}.daylook-chip{font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:8px}.daylook-warning{font-weight:750;color:var(--muted)}.daylook-gps{font-size:12px;color:var(--muted)}@media(max-width:720px){.daylook{padding:10px}.daylook h2{font-size:18px}}';
  document.head.appendChild(css);
  const panel=document.createElement('section');
  panel.id='daylook';
  panel.className='panel daylook';
  panel.innerHTML='<div class="daylook-top"><h2>Day Outlook · Full Shift Forecast</h2><div class="daylook-summary" id="daylook-summary"></div></div>'+
   '<p class="daylook-sub"><strong>Target: arrive 10 minutes before every pickup when feasible.</strong> This preview uses your manually entered repositioning estimate and the manifest scheduled trip durations. <strong>It is NOT GPS road routing or live traffic ETA.</strong> Forecasts recalculate after trip status changes and while this page is open.</p>'+
   '<div class="daylook-control">'+
   '<label>Assumed reposition time between stops (min)<input type="number" inputmode="numeric" min="1" max="180" step="1" id="daylook-transfer" placeholder="Enter minutes" aria-label="Assumed drive and buffer between trips"></label>'+
   '<button type="button" id="daylook-save" class="primary">Update forecast</button>'+
   '<button type="button" id="daylook-gps-button">Enable GPS status</button>'+
   '<span class="daylook-gps" id="daylook-gps">GPS off · no road routing connected</span></div>'+
   '<div class="daylook-data" id="daylook-data"><p class="muted">Enter a repositioning estimate to see the day forecast.</p></div>'+
   '<p class="daylook-warning" id="daylook-foot">Forecast is an operational planning estimate, not a guarantee of arrival time. Do not rely on estimated traffic or travel minutes until an authorized routing provider is connected.</p>';
  const insertAfter=roster.querySelector('#vehicle-card');
  if(insertAfter)insertAfter.after(panel);
  else roster.insertBefore(panel,roster.firstChild);
  const el=id=>document.getElementById(id);
  const fmtMinutes=m=>{
    if(!Number.isFinite(m))return '—';
    const r=((Math.round(m)%1440)+1440)%1440;
    const h=Math.floor(r/60),p=r%60;
    return String(h%12||12)+':'+String(p).padStart(2,'0')+(h>=12?' PM':' AM')+(m>=1440?' +1d':'');
  };
  const localDate=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const eventMinutes=(iso,date)=>{
    if(!iso)return null;
    const d=new Date(iso);
    return Number.isFinite(d.getTime())&&localDate(d)===date?d.getHours()*60+d.getMinutes():null;
  };
  const position={watch:null,lastFix:null,error:null};
  function showGPS(){
    const out=el('daylook-gps'),btn=el('daylook-gps-button');
    const fresh=position.lastFix&&Date.now()-position.lastFix.timestamp<120000;
    if(position.watch!==null){
      btn.textContent='Stop GPS status';
      if(fresh)out.textContent='Location active · accuracy ±'+Math.round(position.lastFix.coords.accuracy)+' m · Not used for road ETA';
      else out.textContent=position.error?'GPS: '+position.error:'GPS awaiting fresh position · no road routing connected';
    }else{
      btn.textContent='Enable GPS status';
      out.textContent=position.error?'GPS off · '+position.error:'GPS off · no road routing connected';
    }
  }
  function forecastRows(runs,date,transfer,now){
    let previousEnd=null;
    const sameDay=localDate(now)===date;
    const todayMinute=sameDay?now.getHours()*60+now.getMinutes():null;
    return runs.map((r,i)=>{
      const pu=timeM(r.pu),du=timeM(r.du),duration=(Number.isFinite(du)&&Number.isFinite(pu))?du-pu:NaN;
      if(!Number.isFinite(pu)||!Number.isFinite(duration)||duration<0||duration>1440){
        previousEnd=null;
        return {r,valid:false,reason:'Invalid trip duration'};
      }
      const target=pu-10;
      if(r.status==='Completed' || r.status==='Exception'){
        const actualEnd=eventMinutes(r.events&&(r.events.dropoff||r.events.closed),date);
        previousEnd=actualEnd===null?du:actualEnd;
        return {r,valid:true,completed:true,target,pu,drop:previousEnd};
      }
      if(previousEnd===null){
        // For the first unfinished run, the estimate begins at current local time
        // on today's service date. Future service days assume a planned departure.
        previousEnd=(todayMinute!==null?todayMinute:target-transfer);
      }
      const arrivedAt=eventMinutes(r.events&&r.events.arrived,date);
      const feasible=previousEnd+transfer;
      const arrival=arrivedAt!==null?arrivedAt:Math.max(feasible,target);
      const expectedPickup=Math.max(pu,arrival,todayMinute!==null?Math.min(todayMinute,Math.max(arrival,pu)):pu);
      const drop=expectedPickup+duration;
      previousEnd=drop;
      const late=Math.max(0,Math.round(arrival-pu));
      const shortfall=Math.max(0,Math.round(arrival-target));
      const status=late>0?'late':shortfall>0?'risk':'good';
      return {r,valid:true,completed:false,pu,target,arrival,drop,late,shortfall,status};
    });
  }
  function draw(){
    const transfer=db.forecast&&db.forecast.transferMin;
    if(document.activeElement!==el('daylook-transfer'))el('daylook-transfer').value=Number.isSafeInteger(transfer)?String(transfer):'';
    const date=el('date').value;
    const runs=db.runs.filter(r=>r.date===date).sort((a,b)=>timeM(a.pu)-timeM(b.pu));
    const summary=el('daylook-summary'),content=el('daylook-data');
    showGPS();
    if(!runs.length){summary.textContent='';content.innerHTML='<p class="muted">No runs on the selected service date.</p>';return;}
    if(!Number.isSafeInteger(transfer)||transfer<1||transfer>180){
      summary.textContent='Travel assumption needed';
      content.innerHTML='<p class="muted">Enter a realistic repositioning estimate in minutes. Until a routing provider is connected, Serenity will not invent road travel times.</p>';
      return;
    }
    const projected=forecastRows(runs,date,transfer,new Date());
    let lateCount=0,atRisk=0;
    let html='<table><thead><tr><th>#</th><th>Passenger</th><th>Scheduled pickup</th><th>10-min early target</th><th>Projected curb arrival</th><th>Outlook</th><th>Projected drop-off</th></tr></thead><tbody>';
    for(let i=0;i<projected.length;i++){
      const f=projected[i];
      const safe=String(f.r.name||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const id=String(f.r.id||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      let status='Unknown',style='',arrival='—',drop='—';
      if(!f.valid){status=f.reason;style='risk'}
      else if(f.completed){status='Closed';style='done';drop=fmtMinutes(f.drop)}
      else{
        arrival=fmtMinutes(f.arrival);drop=fmtMinutes(f.drop);
        if(f.status==='late'){status=f.late+' min after scheduled';style='late';lateCount++}
        else if(f.status==='risk'){status=f.shortfall+' min behind early target';style='risk';atRisk++}
        else{status='Early target possible';style='good'}
      }
      html+='<tr><td>'+(i+1)+'</td><td><button type="button" data-open="'+id+'">'+safe+'</button></td><td>'+String(f.r.pu||'')+'</td><td>'+(f.valid?fmtMinutes(f.target):'—')+'</td><td>'+arrival+'</td><td><span class="daylook-status '+style+'">'+status+'</span></td><td>'+drop+'</td></tr>';
    }
    content.innerHTML=html+'</tbody></table>';
    summary.innerHTML='<span class="daylook-chip">'+lateCount+' projected late</span><span class="daylook-chip">'+atRisk+' early-target misses</span><span class="daylook-chip">'+transfer+' min assumed reposition</span>';
  }
  el('daylook-save').addEventListener('click',()=>{
    const input=el('daylook-transfer').value.trim();
    if(!/^[0-9]+$/.test(input)||Number(input)<1||Number(input)>180)return alert('Enter a whole-number reposition estimate between 1 and 180 minutes.');
    db.forecast={...(db.forecast||{}),transferMin:Number(input),leadMin:10,updatedAt:new Date().toISOString(),source:'driver_assumption'};
    save();draw();
  });
  el('daylook-gps-button').addEventListener('click',()=>{
    if(position.watch!==null){
      navigator.geolocation.clearWatch(position.watch);
      position.watch=null;position.lastFix=null;position.error=null;showGPS();return;
    }
    if(!navigator.geolocation){position.error='Location not available in this browser.';showGPS();return;}
    position.error=null;
    position.watch=navigator.geolocation.watchPosition(p=>{
      position.lastFix=p;position.error=null;showGPS();draw();
    },e=>{position.error=e.code===1?'Permission denied':e.code===2?'Location unavailable':'Location update timed out';if(e.code===1){navigator.geolocation.clearWatch(position.watch);position.watch=null;}showGPS();},{enableHighAccuracy:true,timeout:20000,maximumAge:10000});
    showGPS();
  });
  const priorRender=render;
  render=function(){priorRender();draw();};
  el('date').addEventListener('change',draw);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)draw();});
  const interval=setInterval(()=>{if(!document.hidden)draw();},30000);
  window.addEventListener('pagehide',()=>{if(position.watch!==null){navigator.geolocation.clearWatch(position.watch);position.watch=null;}clearInterval(interval);});
  draw();
})();