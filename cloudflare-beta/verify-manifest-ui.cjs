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
 const timers=new Map();
 const context=vm.createContext({console,confirm:()=>true,setTimeout(task,delay){const id=Symbol();timers.set(id,{task,delay});return id;},clearTimeout(id){timers.delete(id);},setInterval(){},
   document:{visibilityState:'visible',documentElement:new Element(),getElementById:id=>ids[id]??null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>new Element(),body:{appendChild(){}}},
   window:{Tesseract:{createWorker:async()=>({setParameters:async()=>{},recognize:async()=>({data:{text:readText}}),terminate:async()=>{terminateCount++;}})}},
   localStorage:{getItem:k=>saved[k]??null,setItem:(k,v)=>saved[k]=v},
 });
 const run=s=>vm.runInContext(s,context);
 run(html.split('<script>')[1].split('</script>')[0]);run(fs.readFileSync('assets/manifest-core.js','utf8'));
 const firstText='ALEX EXAMPLE\nPU: 08:00 AM\nPublic Library, Alpha, NY 11701\nDO: 08:30 AM\nPublic Station, Beta, NY 11702';
 readText=firstText+'\nJAMIE SAMPLE\nPU: 10:00 AM\nPublic Station, Beta, NY 11702\nDO: 10:30 AM\nPublic Library, Gamma, NY 11703';
 context.initialText=readText;
 run("state=seed();state.serviceDate=localServiceDate();state.clockMode='simulation';state.clock=600;state.forecastClock=600;state.trips=ManifestImport.parse(initialText).rows.map((r,i)=>ManifestImport.newTrip(r,'F-00'+(i+1)));state.tripSeq=2;state.selected='F-001';state.trips[0].status=3;state.trips[0].actual={'On Board':590};state.trips[0].notes='Keep entrance';state.trips[0].phone='+15555550123';state.shift.start=420;render();");
 context.markRefresh=()=>refreshes++;run('routingProvider={manifestChanged:markRefresh,ride:()=>null,connection:()=>null,tick(){}};');
 const original=run('JSON.stringify(state)');
 run(fs.readFileSync('assets/manifest-import.js','utf8'));
 ids.changeManifest.onclick();
 assert.match(ids.modalRoot.innerHTML,/Change Existing Manifest/);
 assert.match(ids.modalRoot.innerHTML,/<input class="manifest-file-picker"[^>]*>/);
 assert.doesNotMatch(ids.modalRoot.innerHTML,/<input[^>]*\bhidden\b[^>]*>/);
 readText='JAMIE SAMPLE\nPU: 10:15 AM\nPublic Station, Beta, NY 11702\nDO: 10:45 AM\nPublic Library, Gamma, NY 11703\nCASEY TEST\nPU: 11:30 AM\nPublic Library, Gamma, NY 11703\nDO: 12:00 PM\nPublic Station, Delta, NY 11704';
 const file={name:'test.png',type:'image/png',size:1000};
 await ids.manifestFiles.onchange({target:{files:[{...file,type:''}],value:'test.png'}});
 assert.equal(terminateCount,1);assert.match(ids.modalRoot.innerHTML,/Review Manifest Changes/);
 assert.equal(ids.mrTarget0.value,'F-002');assert.equal(ids.mrTarget1.value,'new');
 assert.equal(run('JSON.stringify(state)'),original,'OCR and review never change the current day');
 ids.applyManifest.onclick();
 assert.equal(run('state.trips.length'),3);assert.equal(run("state.trips.find(t=>t.id==='F-002').scheduled"),615);
 assert.equal(run("state.trips[0].actual['On Board']"),590);assert.equal(run('state.trips[0].notes'),'Keep entrance');
 assert.equal(run('state.trips[0].phone'),'+15555550123');assert.equal(run('state.shift.start'),420);assert.equal(refreshes,1);
 assert.ok(saved[run("STORE+'_before_manifest'")]);assert.ok(ids.modalRoot.hidden);
 run('undo()');assert.equal(run('JSON.stringify(state)'),original,'Undo restores exact operational state');
 ids.uploadNewManifest.onclick();readText=firstText;
 await ids.manifestFiles.onchange({target:{files:[file],value:'test.png'}});
 ids.applyManifest.onclick();
 assert.equal(run('state.trips.length'),1);assert.equal(run('state.trips[0].status'),0);assert.equal(run('state.shift.start'),null);
 run('undo()');assert.equal(run('JSON.stringify(state)'),original,'New-day replacement also has a complete Undo');
 ids.changeManifest.onclick();
 await ids.manifestFiles.onchange({target:{files:[{name:'bad.pdf',type:'application/pdf',size:1000}],value:'bad.pdf'}});
 assert.match(ids.modalRoot.innerHTML,/Manifest not changed/);assert.equal(run('JSON.stringify(state)'),original);
 const ocr=context.window.Tesseract;
 const createWorker=ocr.createWorker;
 let started,finishStart;
 const didStart=new Promise(resolve=>{started=resolve;});
 ocr.createWorker=()=>new Promise(resolve=>{finishStart=resolve;started();});
 ids.retryManifest.onclick();
 const upload=ids.manifestFiles.onchange({target:{files:[file],value:file.name}});
 await didStart;
 assert.match(ids.modalRoot.innerHTML,/Reading manifest screenshots/);
 const startTimeout=[...timers.values()].find(timer=>timer.delay===60000);
 assert.ok(startTimeout);startTimeout.task();
 await upload;
 assert.match(ids.modalRoot.innerHTML,/took too long to start/);
 assert.equal(run('JSON.stringify(state)'),original);
 finishStart(await createWorker());
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(terminateCount,3,'A worker that starts after timeout is released');
 ocr.createWorker=createWorker;
 ids.retryManifest.onclick();
 let finishRead;
 const savedFile={name:'backup.json',size:1000,text:()=>new Promise(resolve=>{finishRead=resolve;})};
 const jsonUpload=ids.manifestFiles.onchange({target:{files:[savedFile],value:savedFile.name}});
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(ids.modalRoot.innerHTML,/Reading manifest file/);
 ids.cancelManifestOCR.onclick();
 await jsonUpload;
 ids.uploadNewManifest.onclick();
 finishRead(JSON.stringify({format:'serenity-001',data:{trips:[]}}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(ids.modalRoot.innerHTML,/Upload New Manifest/);
 assert.equal(run('JSON.stringify(state)'),original);
 console.log('Manifest UI passes screenshot review, merge, Undo, file validation, OCR timeout and cleanup, and canceled file reads.');
})().catch(error=>{console.error(error);process.exitCode=1;});
