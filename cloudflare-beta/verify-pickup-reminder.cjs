const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
(async()=>{
 const html=fs.readFileSync('assets/index.html','utf8'),ids={},saved={},opened=[],copied=[];
 const documentEvents={},windowEvents={};
 class Element{
   constructor(id){this.id=id;this.value='';this.dataset={};this.style={};this.attributes={};this.classList={toggle(){}};}
   addEventListener(type,fn){this[type]??=fn;}setAttribute(n,v){this.attributes[n]=v;}removeAttribute(n){delete this.attributes[n];}
   querySelector(){return new Element();}querySelectorAll(){return [];}focus(){}remove(){}
   set innerHTML(v){this.html=v;for(const m of v.matchAll(/id="([^"]+)"/g))ids[m[1]]=new Element(m[1]);}
   get innerHTML(){return this.html;}
 }
 for(const m of html.split('<script>')[0].matchAll(/id="([^"]+)"/g))ids[m[1]]=new Element(m[1]);ids.modalRoot.hidden=true;
 const context=vm.createContext({console,confirm:()=>true,setTimeout(){},clearTimeout(){},setInterval(){},
   document:{visibilityState:'visible',documentElement:new Element(),getElementById:id=>ids[id]??null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(type,fn)=>(documentEvents[type]??=[]).push(fn),createElement:()=>new Element(),body:{appendChild(){}}},
   localStorage:{getItem:k=>saved[k]??null,setItem:(k,v)=>saved[k]=v},
   navigator:{userAgent:'Mozilla/5.0 (Linux; Android 16; Pixel 9 Pro XL) Chrome/142 Mobile',clipboard:{writeText:async text=>copied.push(text)}},
   window:{open:(...args)=>opened.push(args),addEventListener:(type,fn)=>(windowEvents[type]??=[]).push(fn)},
 });
 const run=s=>vm.runInContext(s,context),script=fs.readFileSync('assets/pickup-reminder.js','utf8');
 run(html.split('<script>')[1].split('</script>')[0]);
 run("state=seed();state.serviceDate=localServiceDate();state.clockMode='device';deviceTime=()=> '09:14';state.trips=state.trips.slice(0,2);state.settings.firstDrive=25;Object.assign(state.trips[0],{who:'Alex',scheduled:540,status:1,actual:{'En Route to Pickup':540},reposition:25,phone:'+15555550123',pickupArea:'Public Station, Alpha, NY',dropArea:'Public Library, Beta, NY',combinedApproach:null});Object.assign(state.trips[1],{who:'Jamie',scheduled:650,status:0,actual:{},combinedApproach:null});state.selected=state.trips[1].id;render();");
 ids.notes.value='Unsaved note';ids.phone.value='Unsaved number';
 run(script);assert.equal(ids.pickupReminder.hidden,true,'11 minutes away is not due');
 const before=run('JSON.stringify(state)');
 run("document.visibilityState='hidden';deviceTime=()=> '09:15';pickupReminderController.tick();");
 assert.equal(ids.pickupReminder.hidden,true,'Hidden pages do not announce pickup reminders');
 ids.modalRoot.hidden=false;
 run("document.visibilityState='visible'");
 for(const listener of documentEvents.visibilitychange)listener();
 ids.modalRoot.hidden=true;
 assert.equal(ids.pickupReminder.hidden,false);assert.match(ids.pickupReminderTitle.textContent,/Alex · 10 min/);
 assert.match(ids.pickupReminderDetail.textContent,/9:25 AM/,'The reminder uses delayed ETA, not scheduled 9:00 pickup');
 assert.equal(run('JSON.stringify(state)'),before,'Automatic reminders never alter run status, actuals or selection');
 assert.equal(ids.notes.value,'Unsaved note');assert.equal(ids.phone.value,'Unsaved number');
 assert.equal(opened.length,0);assert.equal(copied.length,0,'An alert cannot open an app, send a message or write the clipboard');
 ids.pickupReminderReview.onclick();
 assert.match(ids.pickupReminderDraft.value,/Hi Alex, it's Anthony from Serenity/);
 assert.match(ids.pickupReminderDraft.value,/approximately ten minutes out/);
 assert.match(ids.pickupReminderSms.attributes.href,/sms:\+15555550123\?body=/);
 assert.match(ids.modalRoot.innerHTML,/class="btn primary" id="pickupReminderSms"/,'Android keeps the native SMS draft primary');
 assert.equal(run('state.selected'),'F-002','Reviewing another rider does not replace the selected run or unsaved notes');
 await ids.pickupReminderCopy.onclick();assert.match(copied[0],/approximately ten minutes/);
 assert.equal(opened.length,0);
 run('closeModal()');
 for(const listener of windowEvents.pageshow)listener();
 assert.equal(ids.pickupReminder.hidden,true,'Returning to the page does not repeat a reviewed reminder');
 run(script);assert.equal(ids.pickupReminder.hidden,true,'Reviewed reminders stay handled after a page/module reload');
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
 assert.match(ids.pickupReminderDraft.value,/just a few minutes out/);assert.doesNotMatch(ids.pickupReminderDraft.value,/ten minutes out/);
 assert.equal(ids.pickupReminderSms.attributes['aria-disabled'],'true');
 run("closeModal();state.trips[1].who='Spanish test';state.trips[1].messageLanguage='es';pickupReminderController.tick();");ids.pickupReminderReview.onclick();
 assert.match(ids.pickupReminderDraft.value,/Hola Spanish, soy Anthony de Serenity/);assert.match(ids.pickupReminderDraft.value,/solo unos minutos/);
 run("closeModal();deviceTime=()=> '09:29';state.trips[1].who='ETA reached';pickupReminderController.tick();");ids.pickupReminderReview.onclick();
 assert.doesNotMatch(ids.pickupReminderDraft.value,/ten minutes|diez minutos|solo unos minutos/,'An overdue estimate does not pretend the driver is ten minutes away');
 run("closeModal();deviceTime=()=> '09:15';state.trips[1].who='Predeparture test';state.trips[1].status=0;state.selected=state.trips[1].id;selectedMessageType='10';render();");
 await ids.copyMessage.onclick();run('state.trips[1].status=1;pickupReminderController.tick();');
 assert.equal(ids.pickupReminder.hidden,false,'Testing a draft before departure does not suppress the later driving reminder');
 run("closeModal();deviceTime=()=> '09:15';state.trips[1].who='Manual draft';state.selected=state.trips[1].id;selectedMessageType='10';render();");
 await ids.copyMessage.onclick();run('pickupReminderController.tick();');
 assert.equal(ids.pickupReminder.hidden,true,'Preparing the regular 10-minute macro also handles its automatic reminder');
 run("navigator.userAgent='iPad';Object.assign(state.trips[1],{who:'Taylor',riderName:'Taylor Example',phone:'+15555550124',messageLanguage:'en'});deviceTime=()=> '09:14';render();");
 assert.equal(ids.modalRoot.hidden,true,'The iPad does not open a draft at 11 minutes');
 run("modal('Unrelated form','<p>Keep this open</p>');deviceTime=()=> '09:15';pickupReminderController.tick();");
 assert.match(ids.modalRoot.innerHTML,/Unrelated form/);
 run('closeModal();pickupReminderController.offerDraft();');
 assert.match(ids.modalRoot.innerHTML,/Ready to send a pickup text\?/,'The iPad opens the due draft without a tap');
 assert.equal(ids.pickupReminderRecipient.textContent,'To Taylor Example · +15555550124');
 assert.match(ids.pickupReminderDraft.value,/Hi Taylor, it's Anthony from Serenity.*ten minutes out/);
 assert.equal(opened.length,0);
 const copiesBefore= copied.length;
 run('closeModal();pickupReminderController.tick();');
 assert.equal(ids.modalRoot.hidden,true,'Later leaves the banner without a second pop-up');
 assert.equal(ids.pickupReminder.hidden,false);
 assert.equal(copied.length,copiesBefore,'The draft does not copy or open another service before review');
 ids.pickupReminderReview.onclick();
 assert.match(ids.modalRoot.innerHTML,/class="btn primary" id="pickupReminderMessagesWeb" href="https:\/\/messages\.google\.com\/web\/" target="_blank" rel="noopener noreferrer"/);
 run("deviceTime=()=> '09:22';pickupReminderController.refreshOpenDraft();");
 assert.match(ids.pickupReminderDraft.value,/just a few minutes out/);
 await ids.pickupReminderMessagesWeb.onclick({preventDefault(){assert.fail('The current draft may open Google Messages');}});
 assert.match(copied.at(-1),/Hi Taylor,.*just a few minutes out/);
 assert.match(ids.pickupReminderFeedback.textContent,/Select the recipient in Google Messages and paste/);
 assert.equal(opened.length,0,'The handoff uses a normal link and does not launch outside a link click');
 run("closeModal();state.trips[1].who='Web from Customer';state.trips[1].messageLanguage='es';render();");
 assert.match(html,/id="openMessagesWeb" href="https:\/\/messages\.google\.com\/web\/" target="_blank"/);
 await ids.openMessagesWeb.onclick({preventDefault(){assert.fail('A selected rider can open Google Messages');}});
 assert.match(copied.at(-1),/Estoy a unos diez minutos/);
 assert.match(ids.messageFeedback.textContent,/Message copied/);
 run("navigator.clipboard.writeText=async()=>{throw Error('Clipboard denied')};");
 await ids.openMessagesWeb.onclick({preventDefault(){}});
 assert.match(ids.messageFeedback.textContent,/copy the preview manually/);
 run("state.trips[1].who='Arrived during review';render();state.trips[1].status=2;");
 let prevented=false;
 await ids.pickupReminderMessagesWeb.onclick({preventDefault(){prevented=true;}});
 assert.equal(prevented,true,'An arrival recorded while the draft is open prevents the handoff');
 assert.match(ids.pickupReminderEta.textContent,/no longer due/);
 assert.equal(run("state.trips[0].actual['En Route to Pickup']"),540);
 console.log('Pickup reminders pass ETA-based threshold, persistent once-per-run handling, correct recipient/language, short/overdue wording, no automatic external action, preserved notes/selection/actuals, future-date/status/cancellation suppression and independent next-run reminders.');
})().catch(error=>{console.error(error);process.exitCode=1;});
