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
 const firstText='ALEX EXAMPLE\nPU: 08:00 AM\nPublic Library, Alpha, NY 11701\nDO: 08:30 AM\nPublic Station, Beta, NY 11702';
 readText=firstText+'\nJAMIE SAMPLE\nPU: 10:00 AM\nPublic Station, Beta, NY 11702\nDO: 10:30 AM\nPublic Library, Gamma, NY 11703';
 context.initialText=readText;
 run("state=seed();state.serviceDate=localServiceDate();state.clockMode='simulation';state.clock=600;state.forecastClock=600;state.trips=ManifestImport.parse(initialText).rows.map((r,i)=>ManifestImport.newTrip(r,'F-00'+(i+1)));state.tripSeq=2;state.selected='F-001';state.trips[0].status=3;state.trips[0].actual={'On Board':590};state.trips[0].notes='Keep entrance';state.trips[0].phone='+15555550123';state.shift.start=420;render();");
 context.markRefresh=()=>refreshes++;run('routingProvider={manifestChanged:markRefresh,ride:()=>null,connection:()=>null,tick(){}};');
 const original=run('JSON.stringify(state)');
 run(fs.readFileSync('assets/manifest-import.js','utf8'));
 ids.changeManifest.onclick();
 assert.match(ids.modalRoot.innerHTML,/Change Existing Manifest/);
 readText='JAMIE SAMPLE\nPU: 10:15 AM\nPublic Station, Beta, NY 11702\nDO: 10:45 AM\nPublic Library, Gamma, NY 11703\nCASEY TEST\nPU: 11:30 AM\nPublic Library, Gamma, NY 11703\nDO: 12:00 PM\nPublic Station, Delta, NY 11704';
 const file={name:'test.png',type:'image/png',size:1000};
 await ids.manifestFiles.onchange({target:{files:[file],value:'test.png'}});
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
 console.log('Manifest UI passes screenshot review, explicit merge, pre-import backup, preserved active events/contacts/shift, traffic invalidation, reversible new day and invalid-file handling.');
})().catch(error=>{console.error(error);process.exitCode=1;});
