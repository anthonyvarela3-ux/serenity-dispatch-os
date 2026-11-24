(() => {
  const quotes = new Map(), FLAG = STORE + '_routing_enabled';
  let locating=false,unlocked=false,enabled=false,verified=false,busy=false,forgetting=false;
  let sessionChecked=false,sessionCheck=null;
  let message='Checking Google routing connection…',usage=null;
  let gps=null,gpsWatch=null,errors=0,lastChecked='',lastCheckedAt=0,manifestVersion=0,needsRefresh=false,pendingStatus=null;
  let latestTraffic=null;
  const trafficClock=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'numeric',minute:'2-digit'});
  function freshnessText(now){
    if(!enabled)return 'Traffic last updated: — · Routing paused or disconnected';
    if(!latestTraffic||latestTraffic.serviceDate!==date())return 'Traffic last updated: — · No route refresh yet';
    const minutes=Math.max(0,Math.floor((now-latestTraffic.at)/60000));
    const age=minutes===0?'just now':minutes<60?minutes+' min ago':Math.floor(minutes/60)+'h '+minutes%60+'m ago';
    return 'Traffic last updated: '+trafficClock.format(latestTraffic.at)+' · '+age+
      (errors?' · Latest check failed':needsRefresh?' · Manifest changed':'');
  }
  const status = () => {
    const freshness=$('etaFreshness');
    if(freshness)freshness.textContent=freshnessText(Date.now());
    const snapshot=enabled&&verified&&lastCheckedAt>0;
    const older=snapshot&&[...quotes.values()].some(q=>Date.now()-q.fetchedAt>(q.remaining?10:30)*60000);
    const location=locationNow()?'Device location ready.':gpsWatch==null?'Location off; active rides use logged departure times.':'Waiting for a usable device location.';
    $('routingStatus').textContent=message||(snapshot?'Google Routes connected · Last traffic check '+lastChecked+'. Arrival and Finish Run buttons refresh the current and next legs. '+location+(older?' Some saved Google times are older than 30 minutes; refresh for current traffic.':''):
      enabled?'Arrival and finish traffic checks are ready. Refresh Traffic checks the full remaining schedule. '+location:'Google routing paused. Saved travel assumptions remain available.');
    $('routingBrief').textContent=busy?'Refreshing Google travel estimates…':errors?'Traffic check failed · Manual retry available':snapshot?'Google traffic on arrival/finish · Checked '+lastChecked+(needsRefresh?' · Manifest changed':older?' · Older saved estimates':'')+(locationNow()?' · GPS ready':' · Logged locations'):'Traffic on arrival/finish · '+(unlocked?'Ready when routing is enabled':'Connect Google Routing when ready');
    $('routingConnect').textContent=enabled?'Pause Google Routing':unlocked?'Start Google Routing':'Connect Google Routing';
    $('routingRefresh').hidden=!unlocked;
    $('routingConnect').disabled=forgetting;
    $('routingRefresh').disabled=busy||locating||forgetting;
    const forget=$('routingForget');
    forget.hidden=!unlocked;
    forget.disabled=busy||locating||forgetting;
    const update=$('updateEtas');
    if(update){update.disabled=busy||locating||forgetting;update.textContent=locating?'Getting location…':busy?'Updating ETAs…':'Update ETAs';}
    $('routingLocation').hidden=!unlocked;
    $('routingLocation').textContent=gpsWatch==null?'Use iPad Location':'Stop Location';
    $('routingUsage').textContent=(usage?usage.used+' / '+usage.limit+' Google route requests today. ':'')+
      'Arrived at Pickup, Arrived at Drop-Off and Finish Run check up to 2 relevant routes, then recalculate all later ETAs. An unverified session also needs 1 connection test. Refresh Traffic checks the full remaining schedule. Other status steps, timers, GPS, Back and Undo make no traffic requests.';
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
    // Keep measured travel durations between explicit checks; old quotes are
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
    // Adjacent Arrived / Finished taps often describe
    // the same journey. Reuse its just-fetched quote instead of paying twice.
    if(force==='status'&&existing?.signature===signature&&existing.remaining===remaining&&Date.now()-existing.fetchedAt<5000&&Math.abs(existing.departMinute-depart)<1)return;
    if(!force&&existing?.signature===signature&&existing.remaining===remaining&&Date.now()-existing.fetchedAt<20*60000&&Math.abs(existing.departMinute-depart)<15)return;
    const version=manifestVersion;
    const data=await api('/api/routes',{origin:from,destination:to,departureTime:departureISO(depart)});
    if(version!==manifestVersion)return;
    latestTraffic={at:Date.now(),serviceDate:date()};
    quotes.set(id,{...data,signature,remaining,destination:to,serviceDate:date(),departMinute:depart,asOfMinute:currentTime()});
    if(id.startsWith('ride:')&&!remaining&&Number.isFinite(data.miles)&&data.miles>=0){
      const trip=state.trips.find(t=>t.id===id.slice(5));
      if(trip&&trip.pickupArea===from&&trip.dropArea===to){
        trip.loadedRoute={pickup:from,dropoff:to,miles:data.miles};
        persist();
      }
    }
  }
  function checkSession(){
    if(sessionCheck)return sessionCheck;
    sessionCheck=api('/api/routing/status').then(data=>{
      sessionChecked=true;unlocked=data.unlocked;
      try{enabled=unlocked&&localStorage.getItem(FLAG)==='true';}catch{}
      message=!data.configured?'The private Google routing setup is incomplete.':
        unlocked?'':'Connect Google Routing to authorize this browser.';
      return true;
    }).catch(()=>{
      message='Google routing connection unavailable. Saved estimates remain in use.';
      return false;
    }).finally(()=>{sessionCheck=null;status();});
    return sessionCheck;
  }
  async function probe() {
    const data=await api('/api/routing/probe',{});
    verified=true;usage=data.usage;errors=0;
  }
  function statusRoutes(id,trips) {
    const order=routeOrder(),event=order.find(t=>t.id===id);
    if(!event)return new Set();
    const after=order.slice(order.indexOf(event)+1);
    const focus=!event.outcome&&event.status<5?event:after.find(t=>!t.outcome&&t.status<5);
    if(!focus)return new Set();
    const selected=new Set(),p=project()[focus.id],origin=approachOrigins().get(focus.id);
    if(focus.status<2&&!p.connection?.sameStop&&originFor(focus,origin).from)selected.add('connection:'+focus.id);
    selected.add('ride:'+focus.id);
    if(selected.size<2){
      const next=trips[trips.indexOf(focus)+1];
      if(next&&next.status<2&&!project()[next.id].connection?.sameStop&&originFor(next,approachOrigins().get(next.id)).from)selected.add('connection:'+next.id);
    }
    return selected;
  }
  async function cycle(eventId=null) {
    if(busy||forgetting||!enabled||!unlocked||document.visibilityState==='hidden')return;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date())||date()<localServiceDate()) {
      message='This manifest is for an earlier date. Google routing is paused.';status();return;
    }
    const trips=routeOrder().filter(t=>!t.outcome&&t.status!==6);
    if(!trips.length&&!state.trips.some(t=>filterStatus(t)==='Completed'&&tripRevenue(t).cents==null)){errors=0;message='All runs are closed. No Google requests were needed.';status();return;}
    const selected=eventId?statusRoutes(eventId,trips):null;
    if(selected&&!selected.size&&!state.trips.some(t=>t.id===eventId&&filterStatus(t)==='Completed'&&tripRevenue(t).cents==null))return;
    const version=manifestVersion;
    busy=true;status();
    try {
      if(!verified)await probe();
      const completedMissing=state.trips.filter(t=>filterStatus(t)==='Completed'&&tripRevenue(t).cents==null&&(!eventId||t.id===eventId));
      const backfill=eventId?completedMissing[0]:null;
      if(backfill&&selected.size>=2)selected.delete([...selected].at(-1));
      for(const trip of (eventId?(backfill?[backfill]:[]):completedMissing)){
        if(version!==manifestVersion)return;
        const departure=trip.actual?.['En Route to Drop-Off']??currentTime();
        await requestQuote('ride:'+trip.id,trip.pickupArea,trip.dropArea,Math.max(currentTime(),departure),false);
      }
      const origins=approachOrigins();
      for(const t of trips){
        if(version!==manifestVersion)return;
        if(t.outcome||t.status===6)continue;
        let p=project()[t.id],origin=origins.get(t.id),approach=originFor(t,origin);
        if((!selected||selected.has('connection:'+t.id))&&t.status<2&&!p.connection?.sameStop&&approach.from){
          const departure=t.status===1?currentTime():Math.max(currentTime(),(p.pickup??t.scheduled)-p.connection.minutes);
          await requestQuote('connection:'+t.id,approach.from,t.pickupArea,departure,approach.remaining,eventId?'status':true);
        }
        if(version!==manifestVersion)return;
        p=project()[t.id];
        if((!selected||selected.has('ride:'+t.id))&&t.status<5){
          const ride=rideFrom(t),departure=t.status>=3?currentTime():(p.pickup??t.scheduled)+boardingMinutes;
          await requestQuote('ride:'+t.id,ride.from,t.dropArea,departure,ride.remaining,eventId?'status':true);
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
      // A deliberate new step during an in-flight check replaces its remainder.
      // Drain only that latest step, never a timer retry or a queue of old taps.
      const next=pendingStatus;pendingStatus=null;
      if(next)await cycle(next);
    }
  }
  routingProvider={
    ride:t=>{const from=rideFrom(t);return quote('ride:'+t.id,from.from,t.dropArea,from.remaining);},
    connection:(t,origin)=>{const from=originFor(t,origin);return quote('connection:'+t.id,from.from,t.pickupArea,from.remaining);},
    tick(){status();},
    invalidate(){manifestVersion++;pendingStatus=null;},
    statusChanged(id){
      const trip=state.trips.find(t=>t.id===id);
      if(!trip||![2,5,6].includes(trip.status))return;
      if(!enabled||!unlocked||!usesDeviceTime()||date()!==localServiceDate()||document.visibilityState==='hidden')return;
      manifestVersion++;
      if(busy){pendingStatus=id;return;}
      return cycle(id);
    },
    refresh:()=>{enabled=true;try{localStorage.setItem(FLAG,'true');}catch{}return cycle();},
    manifestChanged(){manifestVersion++;pendingStatus=null;latestTraffic=null;needsRefresh=true;message='Manifest changed. ETAs have recalculated; tap Refresh Traffic when you want updated Google travel times.';status();},
  };
  $('routingConnect').onclick=async()=>{
    if(!sessionChecked&&!await checkSession())return;
    if(forgetting)return;
    if(enabled){manifestVersion++;enabled=false;verified=false;lastCheckedAt=0;latestTraffic=null;quotes.clear();try{localStorage.setItem(FLAG,'false');}catch{}message='Google routing paused. Saved travel assumptions are in use.';status();render(true);return;}
    if(unlocked){enabled=true;try{localStorage.setItem(FLAG,'true');}catch{}message='';status();render(true);return;}
    modal('Connect Google Routing',
      '<p>Enter the Google Routes key saved in Cloudflare to authorize this browser.</p>'+
      '<label for="routingUnlockKey">Private Routes API key</label><input id="routingUnlockKey" type="password" autocomplete="off" autocapitalize="none" spellcheck="false">'+
      '<label class="guidance-check" style="margin-top:12px"><input id="routingRemember" type="checkbox" checked> Remember this browser for 30 days</label>'+
      '<p class="micro muted">Serenity saves the connection in a secure cookie. The key stays out of browser storage and exported manifests. Leave the box unchecked on a shared device for an 18-hour connection.</p><p id="routingUnlockError" role="alert"></p>',
      '<button class="btn primary" id="routingUnlockSubmit">Unlock and Test Connection</button><button class="btn" id="closeModal">Cancel</button>');
    $('routingUnlockSubmit').onclick=async()=>{
      const input=$('routingUnlockKey'),key=input.value.trim();
      const submit=$('routingUnlockSubmit'),feedback=$('routingUnlockError');
      if(!key){feedback.textContent='Paste your Routes API key.';return;}
      input.value='';submit.disabled=true;feedback.textContent='';
      try{
        await api('/api/routing/unlock',{key,rememberBrowser:$('routingRemember').checked});
        unlocked=true;enabled=true;verified=false;
        try{localStorage.setItem(FLAG,'true');}catch{}
        if($('routingUnlockSubmit')===submit)closeModal();
        await cycle();
      }catch(error){feedback.textContent=error.message;submit.disabled=false;}
    };
  };
  $('routingForget').onclick=async()=>{
    if(busy||locating||forgetting||!unlocked)return;
    forgetting=true;status();
    try{
      await api('/api/routing/lock',{});
      manifestVersion++;pendingStatus=null;unlocked=false;enabled=false;verified=false;
      lastCheckedAt=0;latestTraffic=null;quotes.clear();usage=null;errors=0;
      try{localStorage.setItem(FLAG,'false');}catch{}
      message='Routing connection removed from this browser.';render(true);
    }catch{message='Could not remove the routing connection. Try again.';}
    finally{forgetting=false;status();}
  };
  $('routingRefresh').onclick=()=>routingProvider.refresh();
  const updateEtas=$('updateEtas');
  if(updateEtas)updateEtas.onclick=async()=>{
    if(!sessionChecked&&!await checkSession())return;
    if(busy||locating||forgetting)return;
    if(!unlocked)return $('routingConnect').onclick();
    const today=date()===localServiceDate();
    const underway=routeOrder().some(t=>!t.outcome&&[1,3,4].includes(t.status));
    if(today&&usesDeviceTime()&&underway&&!locationNow()&&navigator.geolocation){
      const version=manifestVersion;
      locating=true;status();
      try{
        const position=await new Promise(resolve=>navigator.geolocation.getCurrentPosition(
          resolve,()=>resolve(null),{enableHighAccuracy:true,maximumAge:15000,timeout:4500}
        ));
        if(position?.coords.accuracy<=250)gps={
          latitude:position.coords.latitude,longitude:position.coords.longitude,
          accuracy:position.coords.accuracy,at:position.timestamp??Date.now()
        };
      }catch{
        // Route from the last logged stop if a device fix is unavailable.
      }finally{
        locating=false;status();
      }
      if(version!==manifestVersion)return;
    }
    await routingProvider.refresh();
  };
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
  void checkSession();
})();

