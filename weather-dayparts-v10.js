/* Serenity driver weather dayparts: morning / afternoon / evening for the
 * selected service date, from NWS hourly data. No traffic inference or
 * imaginary extension beyond the available forecast window.
 */
(()=>{
 'use strict';
 const host=document.getElementById('v7-weather-wrap');
 const serviceDate=document.getElementById('date');
 if(!host||!serviceDate)return;
 const target=document.createElement('section');
 target.className='v10-dayparts';
 target.id='v10-dayparts';
 target.setAttribute('aria-label','Morning afternoon and evening forecast');
 const content=document.getElementById('v7-weather-target');
 content.after(target);
 const localDate=(d)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 const fromHourly=(date,hours)=>{
  const windows=[
   {name:'Morning',label:'6 AM – noon',start:6,end:12},
   {name:'Afternoon',label:'Noon – 6 PM',start:12,end:18},
   {name:'Evening',label:'6 PM – midnight',start:18,end:24}
  ];
  return windows.map(w=>{
   const selected=(Array.isArray(hours)?hours:[]).filter(h=>{
    const dt=new Date(h.startTime);
    return Number.isFinite(dt.getTime())&&localDate(dt)===date &&
      dt.getHours()>=w.start&&dt.getHours()<w.end;
   });
   const temps=selected.filter(h=>Number.isFinite(h.temperature)).map(h=>
     h.temperatureUnit==='C'?h.temperature*9/5+32:h.temperature);
   const pops=selected.filter(h=>Number.isFinite(h.precipitation)).map(h=>h.precipitation);
   const conditions=new Map();
   for(const h of selected){
    const x=String(h.shortForecast||'').trim();
    if(x)conditions.set(x,(conditions.get(x)||0)+1);
   }
   const most=Array.from(conditions).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
   const wind=selected.map(h=>h.windSpeed).find(x=>x&&String(x).trim())||null;
   return {...w,samples:selected.length,
     min:temps.length?Math.round(Math.min(...temps)):null,
     max:temps.length?Math.round(Math.max(...temps)):null,
     condition:most,
     rain:pops.length?Math.round(Math.max(...pops)):null,
     wind
   };
  });
 };
 function refresh(){
  const date=serviceDate.value;
  const data=window.SerenityWeather;
  const parts=fromHourly(date,data?.hours);
  const ready=Number.isFinite(data?.asOf);
  const age=ready?Date.now()-data.asOf:null;
  const stale=ready&&(age<0||age>3*3600000);
  const label=document.createElement('div');
  label.className='v10-daypart-title';
  const dateLabel=/^\d{4}-\d{2}-\d{2}$/.test(date)?
    new Date(date+'T12:00:00').toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'}):'selected date';
  label.textContent='YOUR SHIFT FORECAST · '+dateLabel+
   (stale?' · last NWS update over 3 hours ago':'');
  const grid=document.createElement('div');
  grid.className='v10-daypart-grid';
  for(const p of parts){
   const card=document.createElement('div');
   card.className='v10-daypart'+(p.samples?'':' v10-daypart-missing');
   const h=document.createElement('strong');h.textContent=p.name;
   const time=document.createElement('small');time.textContent=p.label;
   const temp=document.createElement('b');
   temp.textContent=p.min===null?'—':p.min===p.max?p.min+'°F':p.min+'–'+p.max+'°F';
   const description=document.createElement('span');
   description.textContent=p.samples?
     (p.condition||'Weather details unavailable')+
       (p.rain!==null?' · Rain up to '+p.rain+'%':''):
     'No NWS hourly forecast for this period';
   const extra=document.createElement('small');
   extra.textContent=p.samples?
     (p.wind?'Wind '+p.wind+' · ':'')+p.samples+' forecast hour'+(p.samples===1?'':'s'):
     'Not estimated';
   card.append(h,time,temp,description,extra);grid.append(card);
  }
  target.replaceChildren(label,grid);
 }
 serviceDate.addEventListener('change',refresh);
 window.addEventListener('serenity-weather-updated',refresh);
 window.addEventListener('focus',refresh);
 window.SerenityWeatherDayparts={summarize:fromHourly,refresh};
 refresh();
})();