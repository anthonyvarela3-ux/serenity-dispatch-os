const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const html=fs.readFileSync('assets/index.html','utf8'),ids={},saved={},calls=[];
 let geoCallback,deny=false,diagnostic=null,serverUnlocked=false;
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
 const context=vm.createContext({console,confirm:()=>true,setTimeout(fn,delay){timers.push({fn,delay});},clearTimeout(){},setInterval(){},Response,URL,
   document:{visibilityState:'visible',documentElement:new Element('html'),getElementById:id=>ids[id]??null,
     querySelectorAll:()=>[],addEventListener(){},createElement:()=>new Element(),body:{appendChild(){}}},
   localStorage:{getItem:k=>saved[k]??null,setItem:(k,v)=>saved[k]=v},
   navigator:{geolocation:{watchPosition:cb=>{geoCallback=cb;return 7;},clearWatch(){}}},
   fetch:async(url,options={})=>{
     if(!url.startsWith('/api/'))return new Response('{}',{status:503});
     const body=options.body?JSON.parse(options.body):null;calls.push({url,body});
     if(url==='/api/routing/status')return new Response(JSON.stringify({configured:true,unlocked:serverUnlocked}));
     if(url==='/api/routing/unlock'){assert.equal(body.key,'private-test-key');serverUnlocked=true;return new Response('{"unlocked":true}');}
     if(deny)return new Response(JSON.stringify({error:'GOOGLE_ACCESS_DENIED',...(diagnostic?{upstreamStatus:400,diagnostic}:{})}),{status:502});
     const minutes=url.endsWith('probe')?15:typeof body.origin==='object'?8:
       body.destination.includes('drop one')?70:body.destination.includes('drop two')?30:
       body.destination.includes('pickup two')?40:10;
     return new Response(JSON.stringify({minutes,miles:12,fetchedAt:Date.now(),trafficAware:true,usage:{used:calls.length,limit:150}}));
   },
 });
 const run=s=>vm.runInContext(s,context),flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
 run(html.split('<script>')[1].split('</script>')[0]);
 run("state=seed();state.clockMode='simulation';state.clock=420;state.forecastClock=420;state.serviceDate=localServiceDate();state.trips=state.trips.slice(0,2);state.settings.garageAddress='Public garage station, NY';state.trips.forEach((t,i)=>{t.scheduled=i?540:495;t.pickupArea='Public pickup '+(i?'two':'one')+', NY';t.dropArea='Public drop '+(i?'two':'one')+', NY';t.drive=10;t.reposition=20;t.combinedApproach=null;});render();");
 run(fs.readFileSync('assets/routing.js','utf8'));await flush();
 assert.equal(calls.length,1,'Page load only checks session, never spends on unauthenticated routing');
 await ids.routingConnect.onclick();ids.routingUnlockKey.value='private-test-key';
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
 assert.match(ids.routingUsage.textContent,/Manual traffic checks only/);
 console.log('Browser routing integration passes manual-only Google calls, no polling on clock/status/import/GPS/reload, unchanged check timestamps, retained older quotes, private unlock, future departure conversion, chained next pickup, actual events, GPS remaining duration, provider failure and pause fallback checks.');
})().catch(e=>{console.error(e);process.exitCode=1;});

