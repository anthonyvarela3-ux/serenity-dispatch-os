/* Serenity Beta 4: weather from US National Weather Service, separate from trip data. */
(()=>{
'use strict';
const roster=document.getElementById('roster');
if(!roster)return;
const style=document.createElement('style');
style.textContent='.wx-panel{display:flex;align-items:stretch;gap:12px;flex-wrap:wrap;padding:12px 15px}.wx-info{flex:1;min-width:220px}.wx-eyebrow{font-size:12px;font-weight:750;letter-spacing:.06em;color:var(--muted)}.wx-main{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;margin-top:4px}.wx-temp{font-size:30px;line-height:1.1;font-weight:800}.wx-label{font-size:15px;font-weight:650}.wx-facts{font-size:13px;color:var(--muted);line-height:1.5}.wx-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.wx-actions button{font-size:13px;min-height:44px}.wx-alert{font-size:13px;color:#fbbf24;font-weight:800}body.light .wx-alert{color:#92400e}.wx-panel .wx-status{font-size:11px;color:var(--muted);margin-top:5px}.wx-forecast{font-size:12px;margin:6px 0 0;color:var(--muted);line-height:1.4}';
document.head.appendChild(style);
const panel=document.createElement('section');
panel.className='panel wx-panel';
panel.id='wx-panel';
panel.innerHTML='<div class="wx-info"><div class="wx-eyebrow">SHIFT WEATHER · NWS</div><div class="wx-main"><span class="wx-temp" id="wx-temp">—</span><span class="wx-label" id="wx-label">Loading local weather…</span></div><div class="wx-facts" id="wx-facts">Bay Shore, NY default until you allow device location.</div><div class="wx-forecast" id="wx-forecast">Hourly weather forecast; not a traffic prediction.</div><div class="wx-alert" id="wx-alert"></div><div class="wx-status" id="wx-status">Source: US National Weather Service · timestamps shown after refresh.</div></div><div class="wx-actions"><button id="wx-refresh" type="button">Refresh weather</button><button id="wx-location" type="button">Weather for my location</button><a id="wx-source" href="https://forecast.weather.gov" target="_blank" rel="noopener noreferrer">NWS details</a></div>';
roster.insertBefore(panel,roster.firstChild);
const E=id=>document.getElementById(id);
const state={lat:40.73,lon:-73.24,label:'Bay Shore, NY (default)',busy:false,updated:0,requestId:0,lastLoc:0};
function forecastLocation(){
 E('wx-facts').textContent=state.label+' · Updating forecast…';
}
function fTemp(n,unit){return Number.isFinite(n)?Math.round(unit==='C'?n*9/5+32:n)+'°F':'—';}
async function retrieve(force=false){
 if(state.busy)return;
 if(!force&&Date.now()-state.updated<15*60000)return;
 state.busy=true;state.requestId++;
 const token=state.requestId,lat=state.lat.toFixed(2),lon=state.lon.toFixed(2);
 E('wx-refresh').disabled=true;E('wx-refresh').textContent='Updating…';forecastLocation();
 try{
  const timeout=AbortSignal.timeout?AbortSignal.timeout(17000):undefined;
  const options={headers:{Accept:'application/geo+json'},signal:timeout};
  const pointsRes=await fetch('https://api.weather.gov/points/'+lat+','+lon,options);
  if(!pointsRes.ok)throw Error('Forecast location unavailable ('+pointsRes.status+')');
  const points=await pointsRes.json();
  const hourly=points?.properties?.forecastHourly;
  if(!hourly || !/^https:\/\/api\.weather\.gov\//.test(hourly))throw Error('NWS hourly forecast endpoint unavailable');
  const forecastRes=await fetch(hourly,options);
  if(!forecastRes.ok)throw Error('NWS forecast unavailable ('+forecastRes.status+')');
  const result=await forecastRes.json();
  const periods=result?.properties?.periods||[];
  const now=Date.now();
  const index=periods.findIndex(x=>new Date(x.endTime).getTime()>now);
  const first=periods[index>=0?index:0];
  if(!first)throw Error('No hourly weather data returned');
  if(token!==state.requestId)return;
  const pop=first.probabilityOfPrecipitation?.value;
  E('wx-temp').textContent=fTemp(first.temperature,first.temperatureUnit);
  E('wx-label').textContent=first.shortForecast||'Hourly forecast';
  const rain=Number.isFinite(pop)?' · Rain chance '+Math.round(pop)+'%':'';
  E('wx-facts').textContent=state.label+' · Wind '+(first.windSpeed||'not reported')+rain;
  const next=periods.slice(index>=0?index:0,(index>=0?index:0)+5);
  E('wx-forecast').textContent='Next hours: '+next.map(p=>{
    const dt=new Date(p.startTime);
    return dt.toLocaleTimeString([], {hour:'numeric'})+' '+fTemp(p.temperature,p.temperatureUnit)+(Number.isFinite(p.probabilityOfPrecipitation?.value)?' / '+Math.round(p.probabilityOfPrecipitation.value)+'% precip':'');
  }).join(' · ');
  E('wx-status').textContent='NWS hourly forecast · refreshed '+new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})+' · Displayed temperatures are forecast, not observations.';
  E('wx-source').href='https://forecast.weather.gov/MapClick.php?lat='+lat+'&lon='+lon;
  state.updated=Date.now();
  // Alerts are optional: a request error should not hide a usable forecast.
  E('wx-alert').textContent='';
  const weatherPayload={asOf:Date.now(),label:state.label,hours:periods.slice(0,48).map(p=>({
   startTime:p.startTime,endTime:p.endTime,shortForecast:p.shortForecast||'',
   temperature:Number.isFinite(p.temperature)?p.temperature:null,
   temperatureUnit:p.temperatureUnit||'F',
   windSpeed:p.windSpeed||null,
   precipitation:p.probabilityOfPrecipitation?.value??null
  })),alerts:[]};
  window.SerenityWeather=weatherPayload;
  window.dispatchEvent(new Event('serenity-weather-updated'));
  try{
    const alerts=await fetch('https://api.weather.gov/alerts/active?point='+lat+','+lon,options);
    if(alerts.ok){
      const data=await alerts.json(),items=data?.features||[];
      if(token===state.requestId&&items.length){
        const titles=items.slice(0,2).map(x=>x?.properties?.event||'Weather alert');
        E('wx-alert').textContent='Weather alert: '+titles.join(' · ')+' · Tap NWS details to review';
        weatherPayload.alerts=titles;
        window.dispatchEvent(new Event('serenity-weather-updated'));
      }
    }
  }catch(_){}
 }catch(error){
  if(token===state.requestId){
    E('wx-label').textContent='Weather temporarily unavailable';
    E('wx-temp').textContent='—';
    E('wx-forecast').textContent='Use the NWS details link for weather information. Serenity trips are unaffected.';
    E('wx-status').textContent='Last refresh failed: '+String(error.message||error).slice(0,110);
    E('wx-source').href='https://forecast.weather.gov/MapClick.php?lat='+lat+'&lon='+lon;
  }
 }finally{
  state.busy=false;E('wx-refresh').disabled=false;E('wx-refresh').textContent='Refresh weather';
 }
}
function setLocation(lat,lon){
 if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
 state.lat=lat;state.lon=lon;state.label='Near your current location';state.updated=0;retrieve(true);
}
E('wx-refresh').addEventListener('click',()=>retrieve(true));
E('wx-location').addEventListener('click',()=>{
 if(!navigator.geolocation)return alert('Location is unavailable in this browser.');
 E('wx-location').disabled=true;
 navigator.geolocation.getCurrentPosition(p=>{
  E('wx-location').disabled=false;
  setLocation(p.coords.latitude,p.coords.longitude);
 },()=>{E('wx-location').disabled=false;E('wx-status').textContent='Location permission denied/unavailable. Bay Shore default remains available.';},{enableHighAccuracy:false,maximumAge:120000,timeout:14000});
});
window.addEventListener('serenity-location-refresh',e=>{
 const loc=e.detail||{};
 if(!Number.isFinite(loc.latitude)||!Number.isFinite(loc.longitude))return;
 // Avoid unnecessary weather requests on every 15s GPS fix. Refresh for a
 // significantly new region, otherwise follow the 15-minute weather cadence.
 const delta=Math.hypot((loc.latitude-state.lat)*111,(loc.longitude-state.lon)*85);
 if(Date.now()-state.lastLoc<900000 && delta<3)return;
 state.lastLoc=Date.now();
 if(delta>=3)setLocation(loc.latitude,loc.longitude);
 else retrieve(false);
});
const timer=setInterval(()=>{if(!document.hidden)retrieve(false);},15*60000);
window.addEventListener('pagehide',()=>clearInterval(timer));
retrieve(true);
})();