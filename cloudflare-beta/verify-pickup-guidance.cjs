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


 run("state=seed();state.clockMode='simulation';state.clock=600;state.forecastClock=600;state.trips=state.trips.slice(0,2);Object.assign(state.trips[0],{scheduled:660,drive:30,reposition:0,combinedApproach:null,kind:'Return'});Object.assign(state.trips[1],{scheduled:680,drive:20,reposition:15,combinedApproach:null});state.selected=state.trips[0].id;render();");
 const projection=run('JSON.stringify(project())'),lead=run('pickupLeadMinutes(selected())'),fare=run('JSON.stringify(revenue())');
 const ten=run("messageFor(selected(),'10')"),early=run("messageFor(selected(),'early')");
 ids.pickupGuidanceButton.onclick();ids.pickupGuidanceType.value='counseling';ids.savePickupGuidance.onclick();
 assert.equal(run('JSON.stringify(project())'),projection,'manual notices do not change any chained estimate');
 assert.equal(run('pickupLeadMinutes(selected())'),lead);assert.equal(run('JSON.stringify(revenue())'),fare);
 assert.equal(run("messageFor(selected(),'10')"),ten);assert.equal(run("messageFor(selected(),'early')"),early);
 assert.equal(ids.macro10.disabled,false);assert.equal(ids.macroEarly.disabled,false);
 assert.match(ids.roster.innerHTML,/Counseling return/);assert.match(ids.customerMain.innerHTML,/Reminder only/);
 assert.equal(JSON.parse(saved[run('STORE')]).trips[0].pickupNotice,'counseling');
 run('undo()');assert.equal(run('selected().pickupNotice'),undefined);assert.equal(run('JSON.stringify(project())'),projection);
 run("selected().dialysisReturn=true;selected().facilityReady={minute:450};render()");
 assert.equal(run('JSON.stringify(project())'),projection,'legacy dialysis/ready data cannot constrain timing');assert.equal(ids.macro10.disabled,false);
 assert.match(run("messageFor(selected(),'early','es')"),/antes/);
 run("selected().dialysisReturn=false;selected().pickupNotice='auto';selected().pickupArea='Example Counseling Center, Alpha, NY';render()");
 assert.equal(run('pickupNoticeType(selected()).type'),'counseling');assert.match(ids.roster.innerHTML,/Counseling location/);
 run("selected().pickupNotice='none';render()");assert.equal(run('pickupNoticeType(selected())'),null,'manual suppression wins');
 run("selected().pickupNotice='auto';selected().pickupArea='100 Example Street, Alpha, NY';selected().dropArea='Example Dialysis Center';selected().notes='';selected().who='Counseling Example';render()");assert.equal(run('pickupNoticeType(selected())'),null,'no inference from person, street or destination');
 run("selected().pickupArea='Example Dialysis Center';selected().kind='Outbound'");assert.equal(run('pickupNoticeType(selected()).type'),'dialysis','a named pickup facility can prompt even when direction is unspecified or outbound');
 run("selected().kind='Return'");assert.equal(run('pickupNoticeType(selected()).type'),'dialysis');
 for(const [place,type] of [['Example Infusion Center','treatment'],['Example Physical Therapy','treatment'],['Example Day Program','program'],['Example Psychotherapy Center','counseling']]){context.place=place;run('selected().pickupArea=place');assert.equal(run('pickupNoticeType(selected()).type'),type);}
 run("selected().pickupArea='100 Example Street';selected().notes='Return run from counseling';selected().kind='Outbound'");assert.equal(run('pickupNoticeType(selected()).type'),'counseling','explicit return note can identify a session');
 // Automatic pickup reminders remain active for informational session flags.
 run("state=seed();state.trips=state.trips.slice(0,1);state.selected=state.trips[0].id;Object.assign(selected(),{dialysisReturn:true,facilityReady:null,pickupNotice:'dialysis',scheduled:600,status:1,actual:{'En Route to Pickup':585},reposition:10,combinedApproach:null});state.clockMode='device';state.serviceDate=localServiceDate();deviceTime=()=> '09:58';render();");
 run(fs.readFileSync('assets/pickup-reminder.js','utf8'));assert.equal(ids.pickupReminder.hidden,false,'informational notice never suppresses pickup heads-up');
 // An import that changes only a reminder must retain saved travel assumptions.
 run("const row={riderName:'Alex Example',who:'Alex',scheduled:720,pickupArea:'Public Facility, Alpha, NY',dropArea:'Public Library, Beta, NY',kind:'Outbound',pickupNotice:'auto'};const imported=ManifestImport.newTrip(row,'F-001');imported.reposition=21;imported.repositionMiles=10;imported.drive=34;const day={trips:[imported],tripSeq:1};globalThis.merged=ManifestImport.merge(day,[{row:{...row,pickupNotice:'treatment'},target:'F-001'}],700).day;");
 assert.equal(run('merged.trips[0].pickupNotice'),'treatment');assert.equal(run('merged.trips[0].kind'),'Outbound');assert.equal(run('merged.trips[0].reposition'),21);assert.equal(run('merged.trips[0].drive'),34);
 assert.ok(run("ManifestImport.validate({...row,pickupNotice:'invalid'}).includes('pickup reminder')"));
 run("day.trips[0].pickupNotice='program';delete row.pickupNotice;globalThis.kept=ManifestImport.merge(day,[{row,target:'F-001'}],700).day");assert.equal(run('kept.trips[0].pickupNotice'),'program');
 run("day.trips[0].status=3;day.trips[0].actual={'On Board':700};globalThis.protectedDay=ManifestImport.merge(day,[{row:{...row,pickupNotice:'none'},target:'F-001'}],700).day");assert.equal(run('protectedDay.trips[0].pickupNotice'),'program');
 // Actual JSON review path retains annotation and never forces trip direction.
 run("state=seed();state.trips=[];state.tripSeq=0;state.clockMode='simulation';state.selected=null;render()");
 run(fs.readFileSync('assets/manifest-import.js','utf8'));ids.uploadNewManifest.onclick();
 const payload={format:'serenity-001',data:{serviceDate:'2099-01-01',trips:[{...run('row'),pickupNotice:'counseling'}]}};
 await ids.manifestFiles.onchange({target:{files:[{name:'manifest.json',type:'application/json',size:1000,text:async()=>JSON.stringify(payload)}],value:'x'}});
 assert.equal(ids.mrNotice0.value,'counseling');ids.applyManifest.onclick();
 assert.equal(run('state.trips[0].pickupNotice'),'counseling');assert.equal(run('state.trips[0].kind'),'Outbound');
 console.log('Session notifications pass manual/auto categories, cautious inference, suppression, unchanged forecasts/early targets/messages/reminders/statuses/revenue, legacy dialysis compatibility, Undo/backups and metadata-only imports without travel invalidation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
