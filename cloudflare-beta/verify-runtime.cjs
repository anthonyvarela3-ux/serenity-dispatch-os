const assert = require('node:assert/strict');
const fs = require('node:fs');
if(!globalThis.crypto)globalThis.crypto=require('node:crypto').webcrypto;
(async () => {
 const config=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
 assert.equal(config.name,'autumn-hill-2d59');
 assert.equal(config.main,'./worker.mjs');
 assert.equal(config.assets.binding,'ASSETS');
 assert.deepEqual(config.assets.run_worker_first,['/api/*']);
 assert.deepEqual(config.migrations,[{tag:'routing-budget-v1',new_sqlite_classes:['RoutingBudget']}]);
 assert.equal(config.durable_objects.bindings[0].name,'ROUTING_BUDGET');
 assert.ok(!config.vars);
 const {default:worker,RoutingBudget}=await import('./worker.mjs');
 const stored=new Map();
 const tx={get:async k=>stored.get(k),put:async(k,v)=>stored.set(k,structuredClone(v))};
 const counter=new RoutingBudget({storage:{transaction:fn=>fn(tx)}});
 const requests=[];
 let mode='success',providerError;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
   requests.push({url,options});
   if(mode==='throw')throw Error('private test diagnostic');
   if(mode==='denied')return new Response('private test diagnostic',{status:403});
   if(mode==='diagnostic')return new Response(JSON.stringify(providerError),{status:400});
   if(mode==='invalid')return new Response(JSON.stringify({routes:[]}));
   if(mode==='fallback')return new Response(JSON.stringify({routes:[{duration:'120s',distanceMeters:1000}],fallbackInfo:{reason:'SERVER_ERROR'}}));
   return new Response(JSON.stringify({routes:[{duration:'1501s',distanceMeters:16093.44}]}));
 };
 try {
   let assetRequest;
   const env={GOOGLE_MAPS_API_KEY:'fictional-private-test-value',ROUTING_BUDGET:{getByName:name=>{assert.equal(name,'single-driver-routing-budget-v1');return counter;}},
     ASSETS:{fetch:async req=>{assetRequest=req;return new Response('existing application');}}};
   const base='https://test.invalid', req=(path,body,cookie,origin=base)=>new Request(base+path,{
     method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},
     ...(body===undefined?{}:{body:JSON.stringify(body)})});
   const root=new Request(base+'/');
   assert.equal(await(await worker.fetch(root,env)).text(),'existing application');assert.equal(assetRequest,root);
   for(const key of [undefined,env.GOOGLE_MAPS_API_KEY]){
     const r=await worker.fetch(req('/api/health'),{...env,GOOGLE_MAPS_API_KEY:key});
     const text=await r.text();assert.ok(!text.includes(env.GOOGLE_MAPS_API_KEY));
     assert.equal(JSON.parse(text).googleRoutesKeyConfigured,Boolean(key));assert.equal(JSON.parse(text).googleValidationPending,true);
   }
   assert.equal((await worker.fetch(req('/api/routing/status'),env)).status,200);
   assert.equal((await worker.fetch(req('/api/routes',{origin:'A place',destination:'B place'}),env)).status,401);
   assert.equal((await worker.fetch(req('/api/routing/unlock',{key:env.GOOGLE_MAPS_API_KEY},null,'https://elsewhere.invalid'),env)).status,403);
   assert.equal((await worker.fetch(req('/api/routing/unlock',{key:'wrong'}),env)).status,401);
   assert.equal(requests.length,0,'Unauthenticated callers cannot make billable requests');
   const login=await worker.fetch(req('/api/routing/unlock',{key:env.GOOGLE_MAPS_API_KEY}),env);
   const cookieHeader=login.headers.get('Set-Cookie');
   assert.match(cookieHeader,/Secure; HttpOnly; SameSite=Strict; Path=\//);
   assert.ok(!cookieHeader.includes(env.GOOGLE_MAPS_API_KEY));
   const cookie=cookieHeader.split(';')[0];
   assert.equal((await(await worker.fetch(req('/api/routing/status',undefined,cookie),env)).json()).unlocked,true);
   assert.equal((await(await worker.fetch(req('/api/routing/status',undefined,cookie+'0'),env)).json()).unlocked,false);
   assert.equal((await(await worker.fetch(req('/api/routing/status',undefined,cookie),{...env,GOOGLE_MAPS_API_KEY:'rotated-test-value'})).json()).unlocked,false);
   assert.equal((await worker.fetch(req('/api/routes',{origin:'A place',destination:'B place'},cookie,'https://evil.invalid'),env)).status,403);
   const valid={origin:'Fictional public origin, NY',destination:'Fictional public destination, NY',departureTime:new Date(Date.now()+3600000).toISOString(),passengerName:'never forward names',notes:'never forward notes'};
   assert.equal((await worker.fetch(req('/api/routes',{...valid,origin:'x'},cookie),env)).status,400);
   assert.equal((await worker.fetch(req('/api/routes',{...valid,departureTime:'bad'},cookie),env)).status,400);
   assert.equal((await worker.fetch(req('/api/routes',valid,cookie),{...env,ROUTING_BUDGET:null})).status,503);
   assert.equal(requests.length,0);
   const result=await worker.fetch(req('/api/routes',valid,cookie),env), data=await result.json();
   assert.equal(result.status,200);assert.equal(data.minutes,26);assert.equal(data.miles,10);
   assert.equal(data.trafficAware,true);assert.equal(data.usage.used,1);
   const call=requests[0],body=JSON.parse(call.options.body);
   assert.equal(call.url,'https://routes.googleapis.com/directions/v2:computeRoutes');
   assert.equal(call.options.headers['X-Goog-Api-Key'],env.GOOGLE_MAPS_API_KEY);
   assert.equal(body.routingPreference,'TRAFFIC_AWARE_OPTIMAL');
   assert.equal(body.departureTime,valid.departureTime);
   assert.ok(!call.options.body.includes('never forward'));assert.ok(!JSON.stringify(data).includes(env.GOOGLE_MAPS_API_KEY));
   const probe=await worker.fetch(req('/api/routing/probe',{},cookie),env);
   assert.equal(probe.status,200);assert.match(requests.at(-1).options.body,/Bay Shore LIRR Station/);
   mode='denied';const denied=await worker.fetch(req('/api/routes',valid,cookie),env);
   assert.equal((await denied.json()).error,'GOOGLE_ACCESS_DENIED');
   mode='diagnostic';
   providerError={error:{status:'INVALID_ARGUMENT',message:env.GOOGLE_MAPS_API_KEY+' '+valid.origin,
     details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',reason:'API_KEY_INVALID',metadata:{key:env.GOOGLE_MAPS_API_KEY,address:valid.origin}}]}};
   let diagnostic=await(await worker.fetch(req('/api/routes',valid,cookie),env)).json();
   assert.deepEqual(diagnostic.diagnostic,{reason:'API_KEY_INVALID',status:'INVALID_ARGUMENT'});
   assert.equal(diagnostic.upstreamStatus,400);
   assert.ok(!JSON.stringify(diagnostic).includes(env.GOOGLE_MAPS_API_KEY));assert.ok(!JSON.stringify(diagnostic).includes(valid.origin));
   providerError.error.details[0].reason='BILLING_DISABLED';
   assert.equal((await(await worker.fetch(req('/api/routes',valid,cookie),env)).json()).diagnostic.reason,'BILLING_DISABLED');
   providerError={error:{status:'INVALID_ARGUMENT',message:'Cannot parse field mask: '+env.GOOGLE_MAPS_API_KEY,details:[]}};
   assert.deepEqual((await(await worker.fetch(req('/api/routes',valid,cookie),env)).json()).diagnostic,{status:'INVALID_ARGUMENT',field:'fieldMask'});
   providerError={error:{status:env.GOOGLE_MAPS_API_KEY,message:valid.origin,details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',reason:valid.origin}]}};
   assert.deepEqual((await(await worker.fetch(req('/api/routes',valid,cookie),env)).json()).diagnostic,{},'Unknown provider data is never echoed');
   providerError={error:{status:'INVALID_ARGUMENT',details:[{'@type':'type.googleapis.com/google.rpc.BadRequest',fieldViolations:[{field:'origin.address',description:valid.origin}]}]}};
   assert.deepEqual((await(await worker.fetch(req('/api/routes',valid,cookie),env)).json()).diagnostic,{status:'INVALID_ARGUMENT',field:'origin'});
   mode='invalid';assert.equal((await worker.fetch(req('/api/routes',valid,cookie),env)).status,502);
   mode='throw';assert.equal((await worker.fetch(req('/api/routes',valid,cookie),env)).status,502);
   mode='fallback';assert.equal((await(await worker.fetch(req('/api/routes',valid,cookie),env)).json()).trafficAware,false);
   mode='success';
   const counts=stored.get('counts');
   stored.set('counts',{...counts,used:149,minuteUsed:0});
   assert.equal((await worker.fetch(req('/api/routes',valid,cookie),env)).status,200);
   const before=requests.length, limited=await worker.fetch(req('/api/routes',valid,cookie),env);
   assert.equal(limited.status,429);assert.equal((await limited.json()).error,'DAILY_ROUTE_LIMIT');
   assert.equal(requests.length,before,'Daily cap is enforced before contacting Google');
   stored.set('counts',{...counts,used:1,minuteUsed:20});
   assert.equal((await(await worker.fetch(req('/api/routes',valid,cookie),env)).json()).error,'ROUTE_RATE_LIMIT');
   stored.set('counts',{...counts,date:'1900-01-01',used:150});
   assert.equal((await(await worker.fetch(req('/api/routes',valid,cookie),env)).json()).usage.used,1);
   assert.deepEqual([...stored.keys()],['counts'],'Only counters are retained, not route addresses or provider content');
   assert.equal((await worker.fetch(req('/api/missing'),env)).status,404);
   assert.equal((await worker.fetch(new Request(base+'/api/health',{method:'HEAD'}),env)).status,200);
   console.log('Protected Google routing passes session, origin, key privacy, address-only payload, future departure, provider failure/fallback, safe provider diagnostics, persistent daily and minute limits, secret rotation and static-asset tests.');
 }finally{globalThis.fetch=originalFetch;}
})().catch(error=>{console.error(error);process.exitCode=1;});

