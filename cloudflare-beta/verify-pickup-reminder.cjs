const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const html=fs.readFileSync('assets/index.html','utf8'),ids={},saved={},opened=[],copied=[];
 class Element{
   constructor(id){this.id=id;this.value='';this.dataset={};this.style={};this.attributes={};this.classList={toggle(){}};}
   addEventListener(type,fn){this[type]??=fn;}setAttribute(n,v){this.attributes[n]=v;}removeAttribute(n){delete this.attributes[n];}
   querySelector(){return new Element();}querySelectorAll(){return [];}focus(){}remove(){}
   set innerHTML(v){this.html=v;for(const m of v.matchAll(/id="([^"]+)"/g))ids[m[1]]=new Element(m[1]);}
   get innerHTML(){return this.html;}
 }
 for(const m of html.split('<script>')[0].matchAll(/id="([^"]+)"/g))ids[m[1]]=new Element(m[1]);ids.modalRoot.hidden=true;
 const context=vm.createContext({console,confirm:()=>true,setTimeout(){},clearTimeout(){},setInterval(){},
   document:{visibilityState:'visible',documentElement:new Element(),getElementById:id=>ids[id]??null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>new Element(),body:{appendChild(){}}},
   localStorage:{getItem:k=>saved[k]??null,setItem:(k,v)=>saved[k]=v},
   navigator:{userAgent:'iPad',clipboard:{writeText:async text=>copied.push(text)}},window:{open:(...args)=>opened.push(args)},
 });
 const run=s=>vm.runInContext(s,context),script=fs.readFileSync('assets/pickup-reminder.js','utf8');
 run(html.split('<script>')[1].split('</script>')[0]);
 run("state=seed();state.serviceDate=localServiceDate();state.clockMode='device';deviceTime=()=> '09:14';state.trips=state.trips.slice(0,2);state.settings.firstDrive=25;Object.assign(state.trips[0],{who:'Alex',scheduled:540,status:1,actual:{'En Route to Pickup':540},reposition:25,phone:'+15555550123',pickupArea:'Public Station, Alpha, NY',dropArea:'Public Library, Beta, NY',combinedApproach:null});Object.assign(state.trips[1],{who:'Jamie',scheduled:650,status:0,actual:{},combinedApproach:null});state.selected=state.trips[1].id;render();");
 ids.notes.value='Unsaved note';ids.phone.value='Unsaved number';
 run(script);assert.equal(ids.pickupReminder.hidden,true,'11 minutes away is not due');
 const before=run('JSON.stringify(state)');
 run("deviceTime=()=> '09:15';pickupReminderController.tick();");
 assert.equal(ids.pickupReminder.hidden,false);assert.match(ids.pickupReminderTitle.textContent,/Alex · 10 min/);
 assert.match(ids.pickupReminderDetail.textContent,/9:25 AM/,'The reminder uses delayed ETA, not scheduled 9:00 pickup');
 assert.equal(run('JSON.stringify(state)'),before,'Automatic reminders never alter run status, actuals or selection');
 assert.equal(ids.notes.value,'Unsaved note');assert.equal(ids.phone.value,'Unsaved number');
 assert.equal(opened.length,0);assert.equal(copied.length,0,'An alert cannot open an app, send a message or write the clipboard');
 ids.pickupReminderReview.onclick();
 assert.match(ids.modalRoot.innerHTML,/Hi, it&#39;s Anthony from Serenity/);
 assert.match(ids.modalRoot.innerHTML,/approximately ten minutes out/);
 assert.match(ids.modalRoot.innerHTML,/sms:\+15555550123/);
 assert.equal(run('state.selected'),'F-002','Reviewing another rider does not replace the selected run or unsaved notes');
 await ids.pickupReminderCopy.onclick();assert.match(copied[0],/approximately ten minutes/);
 assert.equal(opened.length,0);
 run('closeModal()');run(script);assert.equal(ids.pickupReminder.hidden,true,'Reviewed reminders stay handled after a page/module reload');
 run("state.trips[0].status=6;state.trips[0].actual.Finished=550;Object.assign(state.trips[1],{scheduled:575,status:1,reposition:15,actual:{'En Route to Pickup':550},phone:''});deviceTime=()=> '09:15';pickupReminderController.tick();");
 assert.equal(ids.pickupReminder.hidden,false,'The next run receives its own reminder');
 ids.pickupReminderDismiss.onclick();run(script);assert.equal(ids.pickupReminder.hidden,true,'Dismissal survives reload');
 run("state.trips[1].who='Canceled test';state.trips[1].outcome='Canceled in Advance';pickupReminderController.tick();");assert.equal(ids.pickupReminder.hidden,true);
 run("state.trips[1].outcome=null;state.trips[1].status=2;pickupReminderController.tick();");assert.equal(ids.pickupReminder.hidden,true,'Arrived at Pickup is too late for a driving heads-up');
 run("state.trips[1].status=0;pickupReminderController.tick();");assert.equal(ids.pickupReminder.hidden,true,'Pending future runs cannot trigger reminders');
 run("state.trips[1].status=1;state.trips[0].status=3;pickupReminderController.tick();");assert.equal(ids.pickupReminder.hidden,true,'No reminder while another passenger is on board');
 run("state.trips[0].status=1;pickupReminderController.tick();");assert.equal(ids.pickupReminder.hidden,true,'Ambiguous multiple en-route targets are suppressed');
 run("state.trips[0].status=6;state.clockMode='simulation';pickupReminderController.tick();");assert.equal(ids.pickupReminder.hidden,true);
 run("state.clockMode='device';state.serviceDate='2099-01-01';pickupReminderController.tick();");assert.equal(ids.pickupReminder.hidden,true,'Tomorrow previews cannot notify today');
 run("state.serviceDate=localServiceDate();deviceTime=()=> '09:22';state.trips[1].who='Short ride';pickupReminderController.tick();");
 assert.equal(ids.pickupReminder.hidden,false);ids.pickupReminderReview.onclick();
 assert.match(ids.modalRoot.innerHTML,/just a few minutes out/);assert.doesNotMatch(ids.modalRoot.innerHTML,/ten minutes out/);
 assert.match(ids.modalRoot.innerHTML,/id="pickupReminderSms" aria-disabled="true"/);
 run("closeModal();state.trips[1].who='Spanish test';state.trips[1].messageLanguage='es';pickupReminderController.tick();");ids.pickupReminderReview.onclick();
 assert.match(ids.modalRoot.innerHTML,/Hola, soy Anthony de Serenity/);assert.match(ids.modalRoot.innerHTML,/solo unos minutos/);
 run("closeModal();deviceTime=()=> '09:29';state.trips[1].who='ETA reached';pickupReminderController.tick();");ids.pickupReminderReview.onclick();
 assert.doesNotMatch(ids.modalRoot.innerHTML,/ten minutes|diez minutos|solo unos minutos/,'An overdue estimate does not pretend the driver is ten minutes away');
 run("closeModal();deviceTime=()=> '09:15';state.trips[1].who='Manual draft';state.selected=state.trips[1].id;selectedMessageType='10';render();");
 await ids.copyMessage.onclick();run('pickupReminderController.tick();');
 assert.equal(ids.pickupReminder.hidden,true,'Preparing the regular 10-minute macro also handles its automatic reminder');
 assert.equal(run("state.trips[0].actual['En Route to Pickup']"),540);
 console.log('Pickup reminders pass ETA-based threshold, persistent once-per-run handling, correct recipient/language, short/overdue wording, no automatic external action, preserved notes/selection/actuals, future-date/status/cancellation suppression and independent next-run reminders.');
})().catch(error=>{console.error(error);process.exitCode=1;});
