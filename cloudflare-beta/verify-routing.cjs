const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const html=fs.readFileSync('assets/index.html','utf8'),ids={},saved={},calls=[];
 let geoCallback,deny=false,diagnostic=null,serverUnlocked=false,holdRoute=null;
 const fixedNow=Date.parse('2026-11-20T12:00:00Z');
 class TestDate extends Date {constructor(...args){super(...(args.length?args:[fixedNow]));}static now(){return fixedNow;}}
 const timers=[];
 class Element{
   constructor(id){this.id=id;this.value='';this.dataset={};this.style={};this.attributes={};this.classList={toggle(){}};}
   addEventListener(type,fn){this[type]??=fn;}setAttribute(n,v){this.attributes[n]=v;}removeAttribute(n){delete this.attributes[n];}
   querySelector(){return new Element();}querySelectorAll(){return [];}focus(){}
   set innerHTML(v){this.html=v;for(const m of v.matchAll(/id="([^"]+)"/g))ids[m[1]]=new Element(m[1]);}
   get innerHTML(){return this.html;}
 }
 for(const m of html.split('<script>')[0].matchAll(/id="([^"]+)"/g))ids[m[1]]=new Element(m[1]);
 ids.modalRoot.hidden=true;
 const context=vm.createContext({console,Date:TestDate,confirm:()=>true,setTimeout(fn,delay){timers.push({fn,delay});},clearTimeout(){},setInterval(){},Response,URL,
   document:{visibilityState:'visible',documentElement:new Element('html'),getElementById:id=>ids[id]??null,
     querySelectorAll:()=>[],addEventListener(){},createElement:()=>new Element(),body:{appendChild(){}}},
   localStorage:{getItem:k=>saved[k]??null,setItem:(k,v)=>saved[k]=v},
   navigator:{geolocation:{watchPosition:cb=>{geoCallback=cb;return 7;},clearWatch(){}}},
   fetch:async(url,options={})=>{
     if(!url.startsWith('/api/'))return new Response('{}',{status:503});
     const body=options.body?JSON.parse(options.body):null;calls.push({url,body});
     if(url==='/api/routing/status')return new Response(JSON.stringify({configured:true,unlocked:serverUnlocked}));
     if(url==='/api/routing/unlock'){assert.deepEqual(body,{key:'private-test-key',rememberBrowser:true});serverUnlocked=true;return new Response('{"unlocked":true}');}
     if(url==='/api/routing/lock'){serverUnlocked=false;return new Response('{"unlocked":false}');}
     if(url==='/api/routes'&&holdRoute){const wait=holdRoute;holdRoute=null;await wait;}
     if(deny)return new Response(JSON.stringify({error:'GOOGLE_ACCESS_DENIED',...(diagnostic?{upstreamStatus:400,diagnostic}:{})}),{status:502});
     const minutes=url.endsWith('probe')?15:typeof body.origin==='object'?8:
       body.destination.includes('drop one')?70:body.destination.includes('drop two')?30:
       body.destination.includes('pickup two')?40:10;
     return new Response(JSON.stringify({minutes,miles:12,fetchedAt:run('Date.now()'),trafficAware:true,usage:{used:calls.length,limit:150}}));
   },
 });
 const run=s=>vm.runInContext(s,context),flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
 run(html.split('<script>')[1].split('</script>')[0]);
 run("state=seed();state.clockMode='simulation';state.clock=420;state.forecastClock=420;state.serviceDate=localServiceDate();state.trips=state.trips.slice(0,2);state.settings.garageAddress='Public garage station, NY';state.trips.forEach((t,i)=>{t.scheduled=i?540:495;t.pickupArea='Public pickup '+(i?'two':'one')+', NY';t.dropArea='Public drop '+(i?'two':'one')+', NY';t.drive=10;t.reposition=20;t.combinedApproach=null;});render();");
 run(fs.readFileSync('assets/routing.js','utf8'));await flush();
 assert.equal(calls.length,1,'Page load only checks session, never spends on unauthenticated routing');
 await ids.routingConnect.onclick();ids.routingUnlockKey.value='private-test-key';
 assert.match(ids.modalRoot.innerHTML,/id="routingRemember" type="checkbox" checked/);
 ids.routingRemember.checked=true;
 await ids.routingUnlockSubmit.onclick();await flush();
 assert.equal(ids.routingUnlockKey.value,'','Key input is cleared immediately');
 assert.ok(!JSON.stringify(saved).includes('private-test-key'));
 assert.equal(run('project()[state.trips[0].id].pickup'),485);
 assert.equal(run('project()[state.trips[0].id].drop'),562);
 assert.equal(run('project()[state.trips[1].id].pickup'),602);
 assert.equal(run('project()[state.trips[1].id].drop'),639);
 assert.match(ids.roster.innerHTML,/Google traffic/);
 assert.deepEqual(JSON.parse(run('JSON.stringify(state.trips.map(t=>t.scheduled))')),[495,540]);
 assert.equal(run('state.events.length'),0,'Provider refresh does not create or overwrite operational events');
 assert.ok(calls.filter(c=>c.url==='/api/routes').every(c=>Object.keys(c.body).sort().join(',')==='departureTime,destination,origin'));
 const firstRide=calls.find(c=>c.url==='/api/routes'&&c.body.destination.includes('drop one'));
 const depart=new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(firstRide.body.departureTime));
 assert.equal(depart,'08:12','Future traffic uses the projected departure, not the current early-morning clock');
 run("state.clock=600;state.forecastClock=600;state.trips[0].status=3;state.trips[0].actual={'On Board':600};");
 let requestCount=calls.length;
 run('render();for(let i=0;i<60;i++)routingProvider.tick();routingProvider.manifestChanged();');await flush();
 assert.equal(calls.length,requestCount,'Clock, status and manifest updates cannot request Google traffic');
 assert.equal(timers.filter(t=>t.delay===250).length,0,'No automatic traffic polling is scheduled');
 await run('routingProvider.refresh()');await flush();
 assert.equal(run('project()[state.trips[0].id].drop'),670);
 assert.equal(run('project()[state.trips[1].id].pickup'),710);
 const checkedLabel=ids.routingBrief.textContent;
 run('const realTestDate=Date;Date=class extends realTestDate{static now(){return realTestDate.now()+60*60000;}};routingProvider.tick();');
 assert.equal(run('rideLeg(state.trips[0]).minutes'),70,'Older manual quotes retain measured duration rather than reverting to generic minutes');
 assert.equal(run('rideLeg(state.trips[0]).stale'),true);assert.equal(run('rideLeg(state.trips[0]).rough'),true);
 assert.match(ids.routingStatus.textContent,/older than 30 minutes/);
 assert.equal(ids.routingBrief.textContent.split(' · ')[1],checkedLabel.split(' · ')[1],'Clock ticks never advance the traffic check timestamp');
 run('Date=realTestDate;');
 run("state.clock=620;state.forecastClock=620;state.trips[0].status=4;state.trips[0].actual['En Route to Drop-Off']=600;");
 ids.routingLocation.onclick();
 geoCallback({coords:{latitude:40.75,longitude:-73.2,accuracy:10}});
 await flush();
 assert.equal(calls.length,requestCount+3,'Location permission and position updates make no Google calls');
 await ids.routingRefresh.onclick();await flush();
 assert.equal(run('rideLeg(state.trips[0]).remaining'),true);
 assert.equal(run('project()[state.trips[0].id].drop'),628,'A GPS remaining route starts at its observation time, not the old departure');
 assert.equal(run("state.trips[0].actual['En Route to Drop-Off']"),600);
 requestCount=calls.length;
 run("state.clockMode='device';updateDay();state.clockMode='simulation';");await flush();
 assert.equal(calls.length,requestCount,'Update Day is a local calculation, not a traffic request');
 deny=true;await run('routingProvider.refresh()');await flush();
 assert.match(ids.routingStatus.textContent,/billing/);
 diagnostic={reason:'API_KEY_INVALID',status:'INVALID_ARGUMENT'};
 await run('routingProvider.refresh()');await flush();
 assert.match(ids.routingStatus.textContent,/saved API key is invalid/);
 assert.match(ids.routingStatus.textContent,/HTTP 400 · API_KEY_INVALID/);
 diagnostic={status:'INVALID_ARGUMENT',field:'fieldMask'};
 await run('routingProvider.refresh()');await flush();
 assert.match(ids.routingStatus.textContent,/route request \(fieldMask\)/);
 diagnostic={reason:'private-test-key',status:'private-test-key'};
 await run('routingProvider.refresh()');await flush();
 assert.ok(!ids.routingStatus.textContent.includes('private-test-key'));
 assert.equal(run("state.trips[0].actual['On Board']"),600);
 await ids.routingConnect.onclick();
 assert.equal(run('rideLeg(state.trips[0]).google'),undefined,'Pausing restores the saved/manual fallback');
 assert.match(ids.routingStatus.textContent,/paused/);
 requestCount=calls.length;
 run("localStorage.setItem(STORE+'_routing_enabled','true');");
 run(fs.readFileSync('assets/routing.js','utf8'));await flush();
 assert.equal(calls.length,requestCount+1,'An already unlocked page reload only checks free session status');
 assert.equal(calls.at(-1).url,'/api/routing/status');
 assert.match(ids.routingUsage.textContent,/Arrived at Pickup, Arrived at Drop-Off and Finish Run check up to 2/);
 // Exercise the real Customer/Dispatch step handler for a complete six-run day.
 deny=false;diagnostic=null;
 run(`let testMinute=480,testMs=Date.now();
   Date=class extends realTestDate{constructor(...args){super(...(args.length?args:[testMs]));}static now(){return testMs;}};
   deviceTime=()=>minutes24(testMinute);
   function resetStatusDay(){state=seed();state.trips=state.trips.slice(0,6);state.clockMode='device';state.serviceDate=localServiceDate();state.forecastClock=state.clock=testMinute;
     state.settings.garageAddress='Public garage station, NY';state.handoff=null;state.selected=state.trips[0].id;
     state.trips.forEach((t,i)=>{t.status=0;t.outcome=null;t.actual={};t.scheduled=495+i*60;t.scheduledDrop=t.scheduled+35;
       t.pickupArea='Public pickup '+i+', NY';t.dropArea='Public drop '+i+', NY';t.drive=20;t.reposition=15;t.combinedApproach=null;});render();}
   resetStatusDay();`);
 const paid=()=>calls.filter(c=>c.url==='/api/routes'||c.url==='/api/routing/probe').length;
 let start=paid();await ids.routingRefresh.onclick();await flush();
 assert.equal(paid()-start,13,'Initial six-run refresh: 12 legs plus one session probe');
 const dailyStart=start;
 for(let i=0;i<6;i++)for(let stage=1;stage<=6;stage++){
   run('testMs+=60000;testMinute++;');
   start=paid();run(`dispatchStep(state.trips[${i}].id,1);`);await flush();
   const spent=paid()-start;
   assert.ok(spent<=2,`Run ${i+1}, stage ${stage}: at most two Google routes`);
   if(![2,5,6].includes(stage))assert.equal(spent,0,'En Route and On Board only recalculate locally');
   if([2,5,6].includes(stage)&&!(i===5&&stage>=5))assert.ok(spent>0,'Arrival and finish steps fetch relevant routes');
   assert.equal(run(`state.trips[${i}].actual[stages[${stage}]]`),run('testMinute'),'Status timestamp is unchanged by traffic response');
 }
 assert.ok(paid()-dailyStart<=49,'Six-run day fits within 49 attempts including initial refresh');
 assert.equal(run('state.trips.filter(t=>t.status===6).length'),6);
 assert.deepEqual(JSON.parse(run('JSON.stringify(state.trips.map(t=>t.scheduled))')),[495,555,615,675,735,795]);
 // Back, Undo, simulation, a future date, hidden page and pause never spend.
 start=paid();run('backTrip(state.trips[5]);undo();render();routingProvider.tick();');await flush();assert.equal(paid(),start);
 run("resetStatusDay();state.clockMode='simulation';logStep(state.trips[0],true);logStep(state.trips[0],true);");await flush();assert.equal(paid(),start);
 run("resetStatusDay();state.serviceDate='2026-11-21';logStep(state.trips[0],true);logStep(state.trips[0],true);");await flush();assert.equal(paid(),start);
 run("resetStatusDay();document.visibilityState='hidden';logStep(state.trips[0],true);logStep(state.trips[0],true);");await flush();assert.equal(paid(),start);
 run("document.visibilityState='visible';resetStatusDay();");
 // A single arrival changes later projections, not future route traffic snapshots.
 run('state.trips[0].status=1;state.trips[0].actual={"En Route to Pickup":testMinute};');
 start=paid();run('logStep(state.trips[0],true);');await flush();
 const eventCalls=calls.filter(c=>c.url==='/api/routes').slice(-2);
 assert.ok(eventCalls.some(c=>c.body.destination===run('state.trips[0].dropArea')));
 assert.ok(eventCalls.some(c=>c.body.destination===run('state.trips[1].pickupArea')));
 assert.ok(run('project()[state.trips[1].id].pickup>=project()[state.trips[0].id].drop+connectionTo(state.trips[1],state.trips[0].id).minutes'));
 assert.equal(paid()-start,2);
 // The immediate Arrived-at-Drop-Off / Finished pair reuses identical fresh routes.
 run('testMs+=60000;testMinute++;logStep(state.trips[0],true);logStep(state.trips[0],true);logStep(state.trips[0],true);');await flush();
 start=paid();run('logStep(state.trips[0],true);');await flush();assert.equal(paid(),start,'Adjacent Finish reuses routes checked seconds ago');
 // Coalesce rapid presses during an arrival request into only the latest event.
 run('resetStatusDay();testMs+=60000;testMinute++;logStep(state.trips[0],true);');
 let release;holdRoute=new Promise(resolve=>release=resolve);start=paid();
 run('logStep(state.trips[0],true);');await flush();
 assert.equal(paid()-start,1,'One arrival request is in flight');
 run('logStep(state.trips[0],true);logStep(state.trips[0],true);logStep(state.trips[0],true);logStep(state.trips[0],true);');
 release();await flush();assert.ok(paid()-start<=3,'Only in-flight route plus latest Finish event, without queued old events');
 assert.equal(run('state.trips[0].status'),6);
 // Corrections invalidate in-flight work without fetching or retrying anything.
 run('resetStatusDay();testMs+=60000;testMinute++;logStep(state.trips[0],true);');
 holdRoute=new Promise(resolve=>release=resolve);start=paid();run('logStep(state.trips[0],true);');await flush();
 run('backTrip(state.trips[0]);');release();await flush();assert.equal(paid()-start,1);
 deny=true;run('testMs+=60000;testMinute++;logStep(state.trips[0],true);');await flush();
 assert.match(ids.routingStatus.textContent,/billing/);start=paid();run('routingProvider.tick();render();');await flush();assert.equal(paid(),start,'Failures do not auto-retry');
 await ids.routingConnect.onclick();run('backTrip(state.trips[0]);logStep(state.trips[0],true);');await flush();assert.equal(paid(),start,'Paused routing stays paused on arrival');
 deny=false;
 run(fs.readFileSync('assets/routing.js','utf8'));
 const unlocks=calls.filter(c=>c.url==='/api/routing/unlock').length;
 await ids.updateEtas.onclick();await flush();
 assert.equal(calls.filter(c=>c.url==='/api/routing/unlock').length,unlocks,'Update ETAs waits for session status and uses the existing cookie');
 assert.equal(ids.modalRoot.hidden,true);
 assert.equal(ids.routingForget.hidden,false);
 await ids.routingForget.onclick();
 assert.equal(serverUnlocked,false);assert.equal(ids.routingForget.hidden,true);
 assert.match(ids.routingStatus.textContent,/removed from this browser/);
 console.log('Arrival/finish checks pass all six stages across six runs, <=49 attempts, at most two routes per event, future ETA propagation, fresh-route reuse, latest-event coalescing, preserved timestamps, pause/preview/Undo guards and no error retry.');
 console.log('Browser routing integration passes explicit Google refresh, no polling on clock/import/GPS/reload, unchanged check timestamps, retained older quotes, private unlock, future departure conversion, chained next pickup, actual events, GPS remaining duration, provider failure and pause fallback checks.');
})().catch(e=>{console.error(e);process.exitCode=1;});

