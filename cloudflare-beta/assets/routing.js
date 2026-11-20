(() => {
  const quotes = new Map(), FLAG = STORE + '_routing_enabled';
  let unlocked=false, enabled=false, configured=false, verified=false, busy=false;
  let message='Checking Google routing connection…',usage=null;
  let gps=null,gpsWatch=null,errors=0,lastChecked='',lastCheckedAt=0,manifestVersion=0,needsRefresh=false;
  const status = () => {
    const snapshot=enabled&&verified&&lastCheckedAt>0;
    const older=snapshot&&Date.now()-lastCheckedAt>30*60000;
    const location=locationNow()?'Device location ready.':gpsWatch==null?'Location off; active rides use logged departure times.':'Waiting for a usable device location.';
    $('routingStatus').textContent=message||(snapshot?'Google Routes connected · Last traffic check '+lastChecked+'. Manual refresh only. '+location+(older?' Saved Google times are older than 30 minutes; refresh for current traffic.':''):
      enabled?'Manual mode ready. Tap Refresh Traffic when you want Google estimates. '+location:'Google routing paused. Saved travel assumptions remain available.');
    $('routingBrief').textContent=busy?'Refreshing Google travel estimates…':errors?'Traffic check failed · Manual retry available':snapshot?'Manual Google traffic · Checked '+lastChecked+(needsRefresh?' · Manifest changed':older?' · Older saved estimates':'')+(locationNow()?' · GPS ready':' · Logged locations'):'Manual traffic mode · '+(unlocked?'Tap Refresh Traffic for Google estimates':'Connect Google Routing when ready');
    $('routingConnect').textContent=enabled?'Pause Google Routing':unlocked?'Start Google Routing':'Connect Google Routing';
    $('routingRefresh').hidden=!unlocked;
    $('routingRefresh').disabled=busy;
    $('routingLocation').hidden=!unlocked;
    $('routingLocation').textContent=gpsWatch==null?'Use iPad Location':'Stop Location';
    $('routingUsage').textContent=(usage?usage.used+' / '+usage.limit+' Google route requests today. ':'')+
      'Manual traffic checks only. One refresh can request several remaining trip and connecting-drive routes. Clock and status changes recalculate ETAs without contacting Google.';
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
    if(!q||q.remaining!==remaining)return null;
    if(remaining?(q.destination!==to||q.serviceDate!==date()):q.signature!==sig)return null;
    // Keep measured travel durations between manual checks; old quotes are
    // estimates, rather than silently reverting to generic driving minutes.
    const stale=Date.now()-q.fetchedAt>(remaining?10:30)*60000;
    return {...q,stale,rough:stale||!q.trafficAware,google:!stale&&!!q.trafficAware};
  }
  const friendly = code => ({
    KEY_NOT_MATCHED:'That key does not match the secret saved in Cloudflare.',
    ROUTING_LOCKED:'Routing session expired. Connect Google Routing again.',
    GOOGLE_ACCESS_DENIED:'Google rejected the request. Check project billing, Routes API and key restrictions.',
    GOOGLE_QUOTA_EXCEEDED:'Google quota reached. Rough estimates remain available.',
    DAILY_ROUTE_LIMIT:'Daily 150-request limit reached. Existing quotes expire into rough estimates.',
    ROUTE_RATE_LIMIT:'Request rate limit reached. Wait one minute, then tap Refresh Traffic once. There are no automatic retries.',
    GOOGLE_NO_ROUTE:'Google could not find a route. Check the trip addresses.',
    GOOGLE_UNAVAILABLE:'Google is temporarily unavailable. Rough estimates remain available.',
    GOOGLE_INVALID_RESPONSE:'Google returned an unreadable response. Rough estimates remain available.',
    BUDGET_NOT_CONFIGURED:'Routing usage protection is not ready.',
  }[code]||'Traffic update unavailable. Rough estimates remain available.');
  function failureMessage(data) {
    const detail=data.diagnostic||{},reason=detail.reason;
    const explanations={
      API_KEY_INVALID:'Google says the saved API key is invalid. Copy the complete key from Google Credentials into the Cloudflare runtime secret, then reconnect with that same value.',
      API_KEY_EXPIRED:'Google says the saved API key has expired. Check the key in Google Credentials.',
      API_KEY_NOT_FOUND:'Google cannot find the saved API key. Check the complete value in Google Credentials.',
      BILLING_DISABLED:'Google says billing is disabled for this project. Link an active billing account to the project.',
      SERVICE_DISABLED:'Google says Routes API is disabled for the project that owns this key. Enable Routes API in that project.',
      API_KEY_SERVICE_BLOCKED:'This key’s API restrictions block Routes API. Allow Routes API in Google Credentials.',
      API_KEY_HTTP_REFERRER_BLOCKED:'This key requires a website referrer. Serenity sends route requests from its Cloudflare server, so that restriction is blocking Google.',
      API_KEY_IP_ADDRESS_BLOCKED:'This key’s IP restrictions block the Cloudflare server’s route request.',
      API_KEY_ANDROID_APP_BLOCKED:'This key is restricted to an Android app. Serenity sends requests from its Cloudflare server.',
      API_KEY_IOS_APP_BLOCKED:'This key is restricted to an iOS app. Serenity sends requests from its Cloudflare server.',
      PROJECT_DELETED:'Google says the key’s project has been deleted.',
      CONSUMER_INVALID:'Google could not validate the project associated with this key.',
      RATE_LIMIT_EXCEEDED:'Google’s request rate limit was reached. Rough estimates remain available.',
      QUOTA_EXCEEDED:'Google’s project quota was reached. Rough estimates remain available.',
    };
    let explanation=explanations[reason]||friendly(data.error);
    const fields=['departureTime','origin','destination','routingPreference','travelMode','languageCode','regionCode','units','fieldMask'];
    if(!explanations[reason]&&detail.status==='INVALID_ARGUMENT')
      explanation='Google rejected the route request'+(fields.includes(detail.field)?' ('+detail.field+')':'')+'. Rough estimates remain available.';
    const codes=[];
    if(Number.isInteger(data.upstreamStatus)&&data.upstreamStatus>=400&&data.upstreamStatus<=599)codes.push('HTTP '+data.upstreamStatus);
    if(explanations[reason])codes.push(reason);
    else if(['INVALID_ARGUMENT','UNAUTHENTICATED','PERMISSION_DENIED','RESOURCE_EXHAUSTED','FAILED_PRECONDITION','NOT_FOUND','INTERNAL','UNAVAILABLE','DEADLINE_EXCEEDED'].includes(detail.status))codes.push(detail.status);
    return explanation+(codes.length?' Diagnostic: '+codes.join(' · ')+'.':'');
  }
  async function api(path,body) {
    const response=await fetch(path,{method:body===undefined?'GET':'POST',credentials:'same-origin',
      headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();
    if(data.usage)usage=data.usage;
    if(!response.ok){const error=new Error(failureMessage(data));error.code=data.error;throw error;}
    return data;
  }
  async function requestQuote(id,from,to,depart,remaining,force=false) {
    if(!from||!to||typeof to!=='string'||/^(Public test pickup|Public test destination)$/.test(to))return;
    const signature=signatureFor(from,to),existing=quotes.get(id);
    if(!force&&existing?.signature===signature&&existing.remaining===remaining&&Date.now()-existing.fetchedAt<20*60000&&Math.abs(existing.departMinute-depart)<15)return;
    const version=manifestVersion;
    const data=await api('/api/routes',{origin:from,destination:to,departureTime:departureISO(depart)});
    if(version!==manifestVersion)return;
    quotes.set(id,{...data,signature,remaining,destination:to,serviceDate:date(),departMinute:depart,asOfMinute:currentTime()});
  }
  async function probe() {
    const data=await api('/api/routing/probe',{});
    verified=true;usage=data.usage;errors=0;
  }
  async function cycle() {
    if(busy||!enabled||!unlocked||document.visibilityState==='hidden')return;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date())||date()<localServiceDate()) {
      message='This manifest is for an earlier date. Google routing is paused.';status();return;
    }
    const trips=routeOrder().filter(t=>!t.outcome&&t.status!==6);
    if(!trips.length){errors=0;message='All runs are closed. No Google requests were needed.';status();return;}
    const version=manifestVersion;
    busy=true;status();
    try {
      if(!verified)await probe();
      const origins=approachOrigins();
      for(const t of trips){
        if(version!==manifestVersion)return;
        if(t.outcome||t.status===6)continue;
        let p=project()[t.id],origin=origins.get(t.id),approach=originFor(t,origin);
        if(t.status<2&&!p.connection?.sameStop&&approach.from){
          const departure=t.status===1?currentTime():Math.max(currentTime(),(p.pickup??t.scheduled)-p.connection.minutes);
          await requestQuote('connection:'+t.id,approach.from,t.pickupArea,departure,approach.remaining,true);
        }
        if(version!==manifestVersion)return;
        p=project()[t.id];
        if(t.status<5){
          const ride=rideFrom(t),departure=t.status>=3?currentTime():(p.pickup??t.scheduled)+boardingMinutes;
          await requestQuote('ride:'+t.id,ride.from,t.dropArea,departure,ride.remaining,true);
        }
      }
      if(version!==manifestVersion)return;
      lastCheckedAt=Date.now();
      lastChecked=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'}).format(new Date(lastCheckedAt));
      needsRefresh=false;message='';
      errors=0;
    }catch(error){
      if(version!==manifestVersion)return;
      errors++;message=error.message;
      if(error.code==='ROUTING_LOCKED'){unlocked=false;verified=false;enabled=false;}
    }finally{
      busy=false;status();
      if(document.visibilityState!=='hidden'&&$('modalRoot').hidden&&!activePointers.size)render(true);
    }
  }
  routingProvider={
    ride:t=>{const from=rideFrom(t);return quote('ride:'+t.id,from.from,t.dropArea,from.remaining);},
    connection:(t,origin)=>{const from=originFor(t,origin);return quote('connection:'+t.id,from.from,t.pickupArea,from.remaining);},
    tick(){status();},
    refresh:()=>{enabled=true;try{localStorage.setItem(FLAG,'true');}catch{}return cycle();},
    manifestChanged(){manifestVersion++;needsRefresh=true;message='Manifest changed. ETAs have recalculated; tap Refresh Traffic when you want updated Google travel times.';status();},
  };
  $('routingConnect').onclick=async()=>{
    if(enabled){manifestVersion++;enabled=false;verified=false;lastCheckedAt=0;quotes.clear();try{localStorage.setItem(FLAG,'false');}catch{}message='Google routing paused. Saved travel assumptions are in use.';status();render(true);return;}
    if(unlocked){enabled=true;try{localStorage.setItem(FLAG,'true');}catch{}message='';status();render(true);return;}
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
        closeModal();await cycle();
      }catch(error){$('routingUnlockError').textContent=error.message;$('routingUnlockSubmit').disabled=false;}
    };
  };
  $('routingRefresh').onclick=()=>routingProvider.refresh();
  $('routingLocation').onclick=()=>{
    if(gpsWatch!=null){navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null;gps=null;message='Location off. Active estimates use logged departure times.';status();render(true);return;}
    if(!navigator.geolocation){message='Location is unavailable in this browser.';status();return;}
    gpsWatch=navigator.geolocation.watchPosition(position=>{
      gps={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,at:Date.now()};
      if(!errors)message='';status();
      if(document.visibilityState!=='hidden'&&$('modalRoot').hidden&&!activePointers.size)render(true);
    },()=>{if(gpsWatch!=null)navigator.geolocation.clearWatch(gpsWatch);gpsWatch=null;gps=null;message='Device location unavailable. Logged trip locations remain in use.';status();},
    {enableHighAccuracy:true,maximumAge:30000,timeout:15000});
    message='Waiting for the iPad location permission and a position. Tap Refresh Traffic when ready to request a route.';status();
  };
  $('routingGarage').value=state.settings.garageAddress??'';
  $('routingSaveGarage').onclick=()=>{
    const value=$('routingGarage').value.trim();
    if(value.length>350){toast('Please shorten the garage address');return;}
    change('Update garage starting address',()=>state.settings.garageAddress=value);
    routingProvider.manifestChanged();toast('Garage address saved');
  };
  api('/api/routing/status').then(data=>{
    configured=data.configured;unlocked=data.unlocked;usage=data.usage;
    try{enabled=unlocked&&localStorage.getItem(FLAG)==='true';}catch{}
    message=!configured?'The private Google routing setup is incomplete.':
      unlocked?'Manual traffic mode is ready. Tap Refresh Traffic to request Google estimates.':'Private key saved on server. Connect Google Routing to unlock this browser.';
    status();
  }).catch(()=>{message='Google routing connection unavailable. Saved estimates remain in use.';status();});
})();

