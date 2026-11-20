(() => {
  const quotes = new Map(), FLAG = STORE + '_routing_enabled';
  let unlocked=false, enabled=false, configured=false, verified=false, busy=false, scheduled=false;
  let lastPlan=0,lastActive=0,lastSignature='',message='Checking Google routing connection…',usage=null;
  let gps=null,gpsWatch=null,errors=0;
  const status = () => {
    $('routingStatus').textContent=message;
    $('routingConnect').textContent=enabled?'Pause Google Routing':unlocked?'Start Google Routing':'Connect Google Routing';
    $('routingRefresh').hidden=!unlocked;
    $('routingRefresh').disabled=busy;
    $('routingLocation').hidden=!unlocked;
    $('routingLocation').textContent=gpsWatch==null?'Use iPad Location':'Stop Location';
    $('routingUsage').textContent=(usage?usage.used+' / '+usage.limit+' Google route requests today. ':'')+
      'Active traffic refresh: 5 min. Full remaining schedule: 30 min, with checks after status changes. Time calculations continue between refreshes.';
  };
  const date = () => state.serviceDate||localServiceDate();
  function departureISO(minutes) {
    const [y,m,d]=date().split('-').map(Number), desired=Date.UTC(y,m-1,d)+Math.round(minutes)*60000;
    let utc=desired;
    const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    for(let i=0;i<2;i++){
      const parts=Object.fromEntries(formatter.formatToParts(new Date(utc)).map(p=>[p.type,p.value]));
      utc+=desired-Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second);
    }
    return new Date(Math.max(Date.now()+3000,utc)).toISOString();
  }
  function locationNow() {
    return gps&&Date.now()-gps.at<90000&&gps.accuracy<=250?{latitude:gps.latitude,longitude:gps.longitude}:null;
  }
  function originFor(t,origin) {
    const current=locationNow();
    if(t.status===1&&current)return {from:current,remaining:true};
    if(origin){
      const pickup=origin.endsWith(':pickup'),id=pickup?origin.slice(0,-7):origin;
      const previous=state.trips.find(p=>p.id===id);
      return {from:previous?.[pickup?'pickupArea':'dropArea'],remaining:false};
    }
    return {from:state.settings.garageAddress,remaining:false};
  }
  function rideFrom(t) {
    const current=locationNow();
    return t.status>=3&&t.status<5&&current?{from:current,remaining:true}:{from:t.pickupArea,remaining:false};
  }
  function signatureFor(from,to) {
    const f=typeof from==='string'?from.trim().toLowerCase():from?[Math.round(from.latitude*1000)/1000,Math.round(from.longitude*1000)/1000]:null;
    return JSON.stringify([date(),f,String(to??'').trim().toLowerCase()]);
  }
  function quote(id,from,to,remaining) {
    if(!enabled||!verified)return null;
    const q=quotes.get(id),sig=signatureFor(from,to);
    if(!q||q.remaining!==remaining||Date.now()-q.fetchedAt>30*60000)return null;
    if(remaining?(q.destination!==to||q.serviceDate!==date()):q.signature!==sig)return null;
    // Forecasts are refreshed in the background; expired values never pretend to be live.
    return {...q,rough:!q.trafficAware,google:!!q.trafficAware};
  }
  const friendly = code => ({
    KEY_NOT_MATCHED:'That key does not match the secret saved in Cloudflare.',
    ROUTING_LOCKED:'Routing session expired. Connect Google Routing again.',
    GOOGLE_ACCESS_DENIED:'Google rejected the request. Check project billing, Routes API and key restrictions.',
    GOOGLE_QUOTA_EXCEEDED:'Google quota reached. Rough estimates remain available.',
    DAILY_ROUTE_LIMIT:'Daily 150-request limit reached. Existing quotes expire into rough estimates.',
    ROUTE_RATE_LIMIT:'Traffic requests paused briefly. Automatic checks will retry.',
    GOOGLE_NO_ROUTE:'Google could not find a route. Check the trip addresses.',
    GOOGLE_UNAVAILABLE:'Google is temporarily unavailable. Rough estimates remain available.',
    BUDGET_NOT_CONFIGURED:'Routing usage protection is not ready.',
  }[code]||'Traffic update unavailable. Rough estimates remain available.');
  async function api(path,body) {
    const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',
      headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();
    if(data.usage)usage=data.usage;
    if(!response.ok){const error=new Error(friendly(data.error));error.code=data.error;throw error;}
    return data;
  }
  async function requestQuote(id,from,to,depart,remaining,force=false) {
    if(!from||!to||typeof to!=='string'||/^(Public test pickup|Public test destination)$/.test(to))return;
    const signature=signatureFor(from,to),existing=quotes.get(id);
    if(!force&&existing?.signature===signature&&existing.remaining===remaining&&Date.now()-existing.fetchedAt<20*60000&&Math.abs(existing.departMinute-depart)<15)return;
    const data=await api('/api/routes',{origin:from,destination:to,departureTime:departureISO(depart)});
    quotes.set(id,{...data,signature,remaining,destination:to,serviceDate:date(),departMinute:depart,asOfMinute:currentTime()});
  }
  async function probe() {
    const data=await api('/api/routing/probe',{});
    verified=true;usage=data.usage;errors=0;
  }
  function routeSignature() {
    return JSON.stringify([date(),state.settings.garageAddress,state.trips.map(t=>[t.id,t.status,t.outcome,t.pickupArea,t.dropArea,t.scheduled])]);
  }
  async function cycle(force=false) {
    if(busy||!enabled||!unlocked||document.visibilityState==='hidden')return;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date())||date()<localServiceDate()) {
      message='This manifest is for an earlier date. Google routing is paused.';status();return;
    }
    const now=Date.now(),signature=routeSignature(),full=force||!lastPlan||now-lastPlan>=30*60000||signature!==lastSignature;
    const activeDue=force||!lastActive||now-lastActive>=5*60000;
    if(!full&&!activeDue)return;
    busy=true;status();
    try {
      if(!verified)await probe();
      const origins=approachOrigins();
      for(const t of routeOrder()){
        if(t.outcome||t.status===6)continue;
        const active=t.status>0&&t.status<5;
        if(!full&&!active)continue;
        let p=project()[t.id],origin=origins.get(t.id),approach=originFor(t,origin);
        if(t.status<2&&!p.connection?.sameStop&&approach.from){
          const departure=t.status===1?currentTime():Math.max(currentTime(),(p.pickup??t.scheduled)-p.connection.minutes);
          await requestQuote('connection:'+t.id,approach.from,t.pickupArea,departure,approach.remaining,force||active&&activeDue);
        }
        p=project()[t.id];
        if(t.status<5){
          const ride=rideFrom(t),departure=t.status>=3?currentTime():(p.pickup??t.scheduled)+boardingMinutes;
          await requestQuote('ride:'+t.id,ride.from,t.dropArea,departure,ride.remaining,force||active&&activeDue);
        }
      }
      if(full){lastPlan=now;lastSignature=signature;}
      lastActive=now;
      message='Google traffic connected · Checked '+fmt(currentTime())+(gpsWatch==null?' · Location off; active rides use logged departure times.':' · Device location enabled.');
      errors=0;
    }catch(error){
      errors++;message=error.message;
      if(error.code==='ROUTING_LOCKED'){unlocked=false;verified=false;enabled=false;}
      // Prevent a failed provider or quota from being retried on every clock tick.
      lastActive=Date.now();lastPlan=Date.now();lastSignature=signature;
    }finally{
      busy=false;status();
      if(document.visibilityState!=='hidden'&&$('modalRoot').hidden&&!activePointers.size)render(true);
    }
  }
  routingProvider={
    ride:t=>{const from=rideFrom(t);return quote('ride:'+t.id,from.from,t.dropArea,from.remaining);},
    connection:(t,origin)=>{const from=originFor(t,origin);return quote('connection:'+t.id,from.from,t.pickupArea,from.remaining);},
    tick(){
      status();
      if(scheduled||busy||!enabled||!unlocked||document.visibilityState==='hidden'||!$('modalRoot').hidden||activePointers.size)return;
      scheduled=true;setTimeout(()=>{scheduled=false;cycle();},250);
    },
    refresh:()=>cycle(true),
  };
  $('routingConnect').onclick=async()=>{
    if(enabled){enabled=false;quotes.clear();try{localStorage.setItem(FLAG,'false');}catch{}message='Google routing paused. Saved travel assumptions are in use.';status();render(true);return;}
    if(unlocked){enabled=true;verified=false;try{localStorage.setItem(FLAG,'true');}catch{}await cycle(true);return;}
    modal('Connect Google Routing',
      '<p>Paste the same Google Routes key you saved privately in Cloudflare. This unlocks traffic estimates for this browser for up to 18 hours.</p>'+
      '<label for="routingUnlockKey">Private Routes API key</label><input id="routingUnlockKey" type="password" autocomplete="off" autocapitalize="none" spellcheck="false">'+
      '<p class="micro muted">The key is sent only to your Serenity server to unlock this session. It is not saved in browser storage or exported manifests. Connecting tests one public-landmark route, then requests travel estimates using this manifest’s addresses. Maximum: 150 Google route requests per day.</p><p id="routingUnlockError" role="alert"></p>',
      '<button class="btn primary" id="routingUnlockSubmit">Unlock and Test Connection</button><button class="btn" id="closeModal">Cancel</button>');
    $('routingUnlockSubmit').onclick=async()=>{
      const input=$('routingUnlockKey'),key=input.value.trim();
      if(!key){$('routingUnlockError').textContent='Paste your Routes API key.';return;}
      input.value='';$('routingUnlockSubmit').disabled=true;
      try{
        await api('/api/routing/unlock',{key});
        unlocked=true;enabled=true;verified=false;
        try{localStorage.setItem(FLAG,'true');}catch{}
        closeModal();await cycle(true);
      }catch(error){$('routingUnlockError').textContent=error.message;$('routingUnlockSubmit').disabled=false;}
    };
  };
  $('routingRefresh').onclick=()=>cycle(true);
  $('routingLocation').onclick=()=>{
    if(gpsWatch!=null){navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null;gps=null;lastActive=0;message='Location off. Active estimates use logged departure times.';status();render(true);return;}
    if(!navigator.geolocation){message='Location is unavailable in this browser.';status();return;}
    gpsWatch=navigator.geolocation.watchPosition(position=>{
      gps={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,at:Date.now()};
      if(lastActive===0)cycle();
    },()=>{message='Device location unavailable. Logged trip locations remain in use.';status();},
    {enableHighAccuracy:true,maximumAge:30000,timeout:15000});
    lastActive=0;message='Waiting for the iPad location permission and a position…';status();
  };
  $('routingGarage').value=state.settings.garageAddress??'';
  $('routingSaveGarage').onclick=()=>{
    const value=$('routingGarage').value.trim();
    if(value.length>350){toast('Please shorten the garage address');return;}
    change('Update garage starting address',()=>state.settings.garageAddress=value);
    lastPlan=0;routingProvider.tick();toast('Garage address saved');
  };
  api('/api/routing/status').then(data=>{
    configured=data.configured;unlocked=data.unlocked;usage=data.usage;
    try{enabled=unlocked&&localStorage.getItem(FLAG)==='true';}catch{}
    message=!configured?'The private Google routing setup is incomplete.':
      unlocked?'Google routing is ready.':'Private key saved on server. Connect Google Routing to unlock this browser.';
    status();if(enabled)cycle(true);
  }).catch(()=>{message='Google routing connection unavailable. Saved estimates remain in use.';status();});
})();

