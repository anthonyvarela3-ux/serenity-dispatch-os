const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const html=fs.readFileSync('assets/index.html','utf8'),ids={},saved={};
 const decode=s=>s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
 class Element{
   constructor(id){this.id=id;this.value='';this.dataset={};this.style={};this.attributes={};this.classList={toggle(){},contains(){return false;}};}
   addEventListener(type,fn){this[type]??=fn;}setAttribute(n,v){this.attributes[n]=v;}removeAttribute(n){delete this.attributes[n];}
   querySelector(){return new Element();}querySelectorAll(){return [];}focus(){}remove(){}
   set innerHTML(v){this.html=v;for(const m of v.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)){ids[m[1]]=new Element(m[1]);const value=m[0].match(/\bvalue="([^"]*)"/);if(value)ids[m[1]].value=decode(value[1]);}}
   get innerHTML(){return this.html;}
 }
 for(const m of html.split('<script>')[0].matchAll(/id="([^"]+)"/g))ids[m[1]]=new Element(m[1]);
 ids.modalRoot.hidden=true;
 let readText='',terminateCount=0,refreshes=0;
 const context=vm.createContext({console,confirm:()=>true,setTimeout(){},clearTimeout(){},setInterval(){},
   document:{visibilityState:'visible',documentElement:new Element(),getElementById:id=>ids[id]??null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>new Element(),body:{appendChild(){}}},
   window:{Tesseract:{createWorker:async()=>({setParameters:async()=>{},recognize:async()=>({data:{text:readText}}),terminate:async()=>{terminateCount++;}})}},
   localStorage:{getItem:k=>saved[k]??null,setItem:(k,v)=>saved[k]=v},
 });
 const run=s=>vm.runInContext(s,context);
 run(html.split('<script>')[1].split('</script>')[0]);run(fs.readFileSync('assets/manifest-core.js','utf8'));

 run("state=seed();state.clockMode='simulation';state.clock=600;state.forecastClock=600;state.trips=state.trips.slice(0,2);Object.assign(state.trips[0],{scheduled:660,drive:30,reposition:0,combinedApproach:null,earlyArrivalOverride:null});Object.assign(state.trips[1],{scheduled:680,drive:20,reposition:15,combinedApproach:null});state.selected=state.trips[0].id;render();");
 const normal=run('project()[state.trips[1].id].pickup');
 run("state.trips[0].dialysisReturn=true;state.trips[0].kind='Return';state.trips[0].earlyArrivalOverride=90;render();");
 assert.equal(run('pickupLeadMinutes(state.trips[0])'),0,'unconfirmed dialysis overrides all early settings');
 assert.equal(run('project()[state.trips[0].id].pickup'),660);
 assert.equal(run('project()[state.trips[1].id].pickup'),normal+10,'the hold propagates to later rides');
 assert.match(ids.roster.innerHTML,/Dialysis return/);assert.match(ids.customerMain.innerHTML,/Await facility readiness/);
 assert.equal(ids.macro10.disabled,true);assert.equal(ids.macroEarly.disabled,true);
 assert.equal(run("messageFor(selected(),'10')"),'');assert.equal(run("messageFor(selected(),'early','es')"),'');
 assert.match(run("messageFor(selected(),'confirm')"),/11:00 AM/);
 run("selectMacro('early')");assert.equal(run('selectedMessageType'),'confirm');
 ids.pickupGuidanceButton.onclick();ids.pickupGuidanceType.value='dialysis-return';ids.pickupFacilityReady.checked=true;ids.savePickupGuidance.onclick();
 assert.equal(run('dialysisReady(selected()).minute'),600);assert.equal(run('project()[selected().id].pickup'),600);
 assert.equal(ids.macro10.disabled,false);assert.equal(run('selected().scheduled'),660);
 assert.equal(JSON.parse(saved[run('STORE')]).trips[0].facilityReady.minute,600);
 const restored=run('JSON.parse(JSON.stringify(state))');context.restored=restored;
 run('state=loadRouteScenario(restored)');assert.ok(run('dialysisReady(selected())'));
 run('undo()');assert.equal(run('dialysisReady(selected())'),null);assert.equal(run('pickupLeadMinutes(selected())'),0);
 run("selected().actual['Arrived at Pickup']=550;selected().status=2;render()");assert.equal(run('project()[selected().id].pickup'),550,'never rewrite actual early arrival');
 run("selected().actual={};selected().status=0;pickupGuidanceMenu(selected())");ids.pickupGuidanceType.value='dialysis-return';ids.pickupFacilityReady.checked=true;ids.savePickupGuidance.onclick();
 run('selected().scheduled++');assert.equal(run('dialysisReady(selected())'),null,'schedule change invalidates readiness');
 run('selected().scheduled--;state.serviceDate="2099-01-01"');assert.equal(run('dialysisReady(selected())'),null,'new date cannot reuse readiness');
 run('delete state.serviceDate;selected().pickupArea+=" changed"');assert.equal(run('dialysisReady(selected())'),null,'changed pickup cannot reuse readiness');
 run("state=seed();state.trips=state.trips.slice(0,1);state.selected=state.trips[0].id;Object.assign(selected(),{dialysisReturn:true,facilityReady:null,scheduled:600,status:1,actual:{'En Route to Pickup':585},reposition:10,combinedApproach:null});state.clockMode='device';state.serviceDate=localServiceDate();deviceTime=()=> '09:58';render();");
 run(fs.readFileSync('assets/pickup-reminder.js','utf8'));assert.equal(ids.pickupReminder.hidden,true,'no pre-readiness heads-up');
 run("selected().facilityReady={minute:598,serviceDate:state.serviceDate,scheduledPickup:600,pickupArea:selected().pickupArea};render();pickupReminderController.tick();");assert.equal(ids.pickupReminder.hidden,false,'confirmed-ready pickup may prompt');
 run("const row={riderName:'Alex Example',who:'Alex',scheduled:720,pickupArea:'Public Facility, Alpha, NY',dropArea:'Public Library, Beta, NY',kind:'Return',dialysisReturn:true};const imported=ManifestImport.newTrip(row,'F-001');imported.facilityReady={minute:690};const day={trips:[imported],tripSeq:1};const merged=ManifestImport.merge(day,[{row:{...row,scheduled:730},target:'F-001'}],700).day;globalThis.merged=merged;");
 assert.equal(run('merged.trips[0].dialysisReturn'),true);assert.equal(run('merged.trips[0].facilityReady'),null);
 assert.equal(run("ManifestImport.newTrip({...row,facilityReady:{minute:1}},'new').facilityReady"),null,'manifest new-day import does not inherit readiness');
 assert.ok(run("ManifestImport.validate({...row,dialysisReturn:'yes'}).includes('dialysis return flag')"));
 run("delete row.dialysisReturn;globalThis.kept=ManifestImport.merge(day,[{row,target:'F-001'}],700).day");assert.equal(run('kept.trips[0].dialysisReturn'),true,'missing OCR metadata preserves matched guidance');
 run("day.trips[0].status=3;day.trips[0].actual={'On Board':700};globalThis.protectedDay=ManifestImport.merge(day,[{row:{...row,dialysisReturn:false},target:'F-001'}],700).day");assert.equal(run('protectedDay.trips[0].dialysisReturn'),true);
 // Exercise the actual JSON review path and checkbox application.
 run("state=seed();state.trips=[];state.tripSeq=0;state.clockMode='simulation';state.selected=null;render()");
 run(fs.readFileSync('assets/manifest-import.js','utf8'));ids.uploadNewManifest.onclick();
 const payload={format:'serenity-001',data:{serviceDate:'2099-01-01',trips:[{...run('row'),dialysisReturn:true,facilityReady:{minute:1}}]}};
 await ids.manifestFiles.onchange({target:{files:[{name:'manifest.json',type:'application/json',size:1000,text:async()=>JSON.stringify(payload)}],value:'x'}});
 assert.equal(ids.mrDialysis0.checked,true);ids.applyManifest.onclick();
 assert.equal(run('state.trips[0].dialysisReturn'),true);assert.equal(run('state.trips[0].kind'),'Return');assert.equal(run('state.trips[0].facilityReady'),null);
 console.log('Dialysis guidance passes scheduled-return floor, chained ETAs, immutable actuals, explicit ready override/Undo, no early messaging/reminder, persisted backup, stale-ready invalidation, reviewed imports and protected runs.');
})().catch(error=>{console.error(error);process.exitCode=1;});
