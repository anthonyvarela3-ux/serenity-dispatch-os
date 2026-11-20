const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('assets/index.html','utf8');
function boot(saved={}){
 const ids={},downloads=[],copies=[],shares=[],network=[];let failStorage=false,nextID=0;
 class Element{
  constructor(id){this.id=id;this.value='';this.dataset={};this.style={};this.attributes={};this.parentElement={open:false};this.classList={toggle(){},contains(){return false;}};}
  addEventListener(type,fn){this[type]??=fn;}setAttribute(n,v){this.attributes[n]=v;}removeAttribute(n){delete this.attributes[n];}
  querySelector(){return new Element();}querySelectorAll(){return [];}focus(){this.focused=true;}select(){this.selected=true;}remove(){}
  set innerHTML(v){this.html=v;for(const m of v.matchAll(/id="([^"]+)"/g))ids[m[1]]=new Element(m[1]);}
  get innerHTML(){return this.html;}
 }
 for(const m of html.split('<script>')[0].matchAll(/id="([^"]+)"/g))ids[m[1]]=new Element(m[1]);ids.modalRoot.hidden=true;
 const context=vm.createContext({console,confirm:()=>true,alert:message=>{throw Error(message);},setTimeout(){},clearTimeout(){},setInterval(){},
  crypto:{randomUUID:()=> 'test-report-'+Date.now()+'-'+(++nextID)},
  document:{visibilityState:'visible',documentElement:new Element(),getElementById:id=>ids[id]??null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>new Element(),body:{appendChild(){}}},
  navigator:{clipboard:{writeText:async text=>copies.push(text)},share:async data=>shares.push(data)},
  localStorage:{getItem:k=>saved[k]??null,setItem:(k,v)=>{if(failStorage)throw Error('Full');saved[k]=v;}},
  fetch:async url=>{network.push(url);throw Error('No network in address-report tests');},
 });
 const run=s=>vm.runInContext(s,context);
 run(html.split('<script>')[1].split('</script>')[0]);
 context.captureDownload=(name,body,type)=>downloads.push({name,body,type});run('download=captureDownload;');
 run(fs.readFileSync('assets/address-reports.js','utf8'));
 return {ids,run,context,saved,downloads,copies,shares,network,storageFailure:value=>failStorage=value};
}
(async()=>{
 const b=boot(),{ids,run}=b;
 run("state=seed();state.serviceDate=localServiceDate();state.clockMode='simulation';state.clock=600;state.trips[0].phone='+15555550123';render();");
 ids.notes.value='Unsaved note draft';
 const before=run('JSON.stringify(state)'),networkBefore=b.network.length;
 ids.reportAddress.onclick();assert.match(ids.modalRoot.innerHTML,/Report Wrong Address/);
 assert.equal(ids.addressOriginal.value,run('selected().pickupArea'));
 ids.saveAddressReport.onclick();assert.match(ids.addressSaveError.textContent,/correction or a note/);
 ids.addressOriginal.value='Tampered read-only field';
 ids.addressProposed.value='Public Library main entrance, Bay Shore, NY';ids.addressNotes.value='Customer confirmed the side entrance';ids.addressBasis.value='Customer confirmed';ids.addressInvoice.value='OFFICE-123';
 ids.saveAddressReport.onclick();
 assert.equal(run('addressReportController.snapshot().length'),1);
 assert.equal(run('addressReportController.snapshot()[0].originalAddress'),run('selected().pickupArea'));
 assert.equal(run('JSON.stringify(state)'),before,'Reporting never changes trip addresses, status, timestamps, fares or events');
 assert.equal(ids.notes.value,'Unsaved note draft');assert.match(ids.addressReportHint.textContent,/1 address issue/);
 ids.reportAddress.onclick();ids.addressProposed.value='Public Library main entrance, Bay Shore, NY';ids.addressNotes.value='Customer confirmed the side entrance';ids.addressBasis.value='Customer confirmed';ids.addressInvoice.value='OFFICE-123';ids.saveAddressReport.onclick();
 assert.equal(run('addressReportController.snapshot().length'),1,'Repeated save does not duplicate the same report');
 ids.reportAddress.onclick();ids.addressSide.value='dropoff';ids.addressSide.onchange();
 assert.equal(ids.addressOriginal.value,run('selected().dropArea'));
 ids.addressNotes.value='=SUM(1,2)\nDoor says "use east entrance" <script>no</script>';ids.addressIssue.value='Wrong entrance or pickup point';ids.saveAddressReport.onclick();
 assert.equal(run('addressReportController.snapshot().length'),2);
 const reports=run('JSON.stringify(addressReportController.snapshot())');
 assert.equal(b.shares.length,0);assert.equal(b.copies.length,0);
 ids.addressReportLog.onclick();assert.match(ids.addressLogRows.innerHTML,/&lt;|Not yet known/);
 ids.copyAddressReport.onclick();await Promise.resolve();
 assert.match(b.copies[0],/OFFICE-123/);assert.match(b.copies[0],/Manifest address:/);assert.match(b.copies[0],/Proposed correct address:/);assert.doesNotMatch(b.copies[0],/15555550123/);
 assert.match(b.copies[0],/SIMULATION/);assert.match(b.copies[0],/not MAS-approved/);
 ids.csvAddressReport.onclick();ids.txtAddressReport.onclick();
 assert.match(b.downloads[0].body,/"'=SUM\(1,2\)/,'Spreadsheet formula text is escaped');
 assert.match(b.downloads[0].body,/""use east entrance""/);assert.match(b.downloads[1].name,/\.txt$/);
 ids.addressDateFilter.value='1999-01-01';ids.addressDateFilter.onchange();assert.equal(ids.shareAddressReport.disabled,true);
 ids.addressDateFilter.value='';ids.addressDateFilter.onchange();
 await ids.shareAddressReport.onclick();assert.equal(b.shares.length,1);assert.match(ids.addressLogFeedback.textContent,/Delivery is not tracked/);
 b.context.navigator.share=async()=>{const e=Error();e.name='AbortError';throw e;};await ids.shareAddressReport.onclick();assert.match(ids.addressLogFeedback.textContent,/canceled/);
 b.context.navigator.share=undefined;await ids.shareAddressReport.onclick();assert.match(ids.addressLogFeedback.textContent,/unavailable/);
 b.context.navigator.clipboard.writeText=async()=>{throw Error();};await ids.copyAddressReport.onclick();assert.equal(ids.addressReportText.parentElement.open,true);assert.equal(ids.addressReportText.selected,true);
 assert.equal(b.network.length,networkBefore,'Reports, exports and sharing never request Google or any server');
 run('closeModal();');ids.exportData.onclick();
 const backup=b.downloads.at(-1),obj=JSON.parse(backup.body);assert.equal(obj.data.addressReports.length,2);
 run('state=seed();state.serviceDate="2026-11-21";render();');assert.equal(run('addressReportController.snapshot().length'),2,'New service day keeps the log');
 ids.reset.onclick();assert.equal(run('addressReportController.snapshot().length'),2,'Demo reset keeps the independent report log');
 const reload=boot(b.saved);assert.equal(reload.run('addressReportController.snapshot().length'),2,'Reload preserves records');
 reload.context.testBackup=obj;
 await reload.ids.importData.onchange({target:{value:'backup',files:[{size:backup.body.length,text:async()=>JSON.stringify(obj)}]}});
 assert.equal(reload.run('addressReportController.snapshot().length'),2);assert.equal(reload.run('state.addressReports'),undefined);
 const oldBackup=JSON.parse(backup.body);delete oldBackup.data.addressReports;
 await reload.ids.importData.onchange({target:{value:'old',files:[{size:1000,text:async()=>JSON.stringify(oldBackup)}]}});
 assert.equal(reload.run('addressReportController.snapshot().length'),2,'Legacy backup never erases report history');
 assert.throws(()=>run('addressReportController.validateBackup([{version:1}])'),/Invalid/);
 run('let modified=addressReportController.snapshot();modified[0].notes="changed";');
 assert.throws(()=>run('addressReportController.mergeBackup(modified)'),/conflicts/);assert.equal(run('JSON.stringify(addressReportController.snapshot())'),reports);
 ids.reportAddress.onclick();ids.addressNotes.value='Different issue';b.storageFailure(true);ids.saveAddressReport.onclick();assert.match(ids.addressSaveError.textContent,/Could not save/);assert.equal(run('addressReportController.snapshot().length'),2);b.storageFailure(false);
 const corruptSaved={...b.saved,[run("STORE+'_address_reports'")]:'not json'},corrupt=boot(corruptSaved);
 corrupt.context.restoreReports=JSON.parse(reports);corrupt.run('addressReportController.mergeBackup(restoreReports)');assert.equal(corrupt.run('addressReportController.snapshot().length'),2);
 assert.equal(corruptSaved[run("STORE+'_address_reports_unreadable'")],'not json');
 // One-shot GPS uses a fresh device fix, preserves typed street addresses and
 // makes no route/geocoding calls. Callback races cannot modify another form.
 const g=boot();let success,failure,options;
 g.context.navigator.geolocation={getCurrentPosition:(ok,bad,opts)=>{success=ok;failure=bad;options=opts;}};
 g.run("state=seed();state.serviceDate=localServiceDate();state.clockMode='device';render();");
 const originalGpsDay=g.run('JSON.stringify(state)'),gpsNetwork=g.network.length;
 g.ids.reportAddress.onclick();g.ids.addressProposed.value='Driver-verified street address';
 g.ids.addressUseGps.onclick();assert.equal(g.ids.addressUseGps.disabled,true);assert.equal(g.ids.saveAddressReport.disabled,true);
 assert.equal(options.maximumAge,0);assert.equal(options.enableHighAccuracy,true);assert.equal(options.timeout,15000);
 const fix={coords:{latitude:40.7342,longitude:-73.2624,accuracy:12},timestamp:Date.now()};
 success(fix);assert.equal(g.ids.saveAddressReport.disabled,false);assert.match(g.ids.addressGpsStatus.textContent,/accuracy ±12 m/);
 assert.equal(g.ids.addressProposed.value,'Driver-verified street address','GPS never replaces a typed address with a guessed one');
 g.ids.saveAddressReport.onclick();assert.equal(g.run('addressReportController.snapshot()[0].gps.latitude'),fix.coords.latitude);
 assert.equal(g.run('JSON.stringify(state)'),originalGpsDay);assert.equal(g.network.length,gpsNetwork);
 g.ids.addressReportLog.onclick();g.ids.copyAddressReport.onclick();await Promise.resolve();
 assert.match(g.copies[0],/Recorded GPS:/);assert.match(g.copies[0],/GPS map: https:\/\/www.google.com\/maps\/search/);
 assert.match(g.ids.addressLogRows.innerHTML,/View recorded location/);g.ids.csvAddressReport.onclick();assert.match(g.downloads[0].body,/GPS latitude/);assert.match(g.downloads[0].body,/40.7342/);
 g.run('closeModal();');g.ids.reportAddress.onclick();g.ids.addressUseGps.onclick();success({...fix,timestamp:Date.now()});
 g.ids.saveAddressReport.onclick();assert.equal(g.run('addressReportController.snapshot().length'),2,'GPS alone is enough to log the actual point');
 g.ids.reportAddress.onclick();g.ids.addressUseGps.onclick();failure({code:1});assert.match(g.ids.addressGpsStatus.textContent,/denied/);assert.equal(g.ids.saveAddressReport.disabled,false);
 g.ids.addressUseGps.onclick();success({...fix,coords:{...fix.coords,accuracy:900},timestamp:Date.now()});assert.match(g.ids.addressGpsStatus.textContent,/too uncertain/);
 g.ids.addressUseGps.onclick();success({...fix,timestamp:Date.now()-120000});assert.match(g.ids.addressGpsStatus.textContent,/fresh GPS position/);
 g.ids.addressUseGps.onclick();failure({code:3});assert.match(g.ids.addressGpsStatus.textContent,/timed out/);
 g.ids.addressUseGps.onclick();success({...fix,timestamp:Date.now()});g.ids.addressSide.value='dropoff';g.ids.addressSide.onchange();
 assert.equal(g.ids.addressGpsStatus.textContent,'','Switching endpoint clears the previous GPS pin');g.ids.addressNotes.value='Drop-off issue';g.ids.saveAddressReport.onclick();
 assert.equal(g.run('addressReportController.snapshot().at(-1).gps'),undefined,'Pickup pin cannot leak into drop-off entry');
 g.ids.reportAddress.onclick();g.ids.addressUseGps.onclick();const oldSuccess=success;
 g.run('closeModal();');g.ids.reportAddress.onclick();oldSuccess({...fix,timestamp:Date.now()});assert.equal(g.ids.addressGpsStatus.textContent,undefined,'Closed-form callback cannot populate a new report');
 g.ids.addressUseGps.onclick();success({...fix,timestamp:Date.now()});g.ids.addressUseGps.onclick();failure({code:2});assert.match(g.ids.addressGpsStatus.textContent,/Earlier GPS pin remains/);
 const gpsReports=g.run('JSON.stringify(addressReportController.snapshot())'),gpsReload=boot(g.saved);assert.equal(gpsReload.run('JSON.stringify(addressReportController.snapshot())'),gpsReports);
 assert.throws(()=>g.run('let invalidGps=addressReportController.snapshot();invalidGps[0].gps.latitude=1000;addressReportController.validateBackup(invalidGps);'),/Invalid.*GPS/);
 g.context.navigator.geolocation=undefined;g.run('closeModal();');g.ids.reportAddress.onclick();g.ids.addressUseGps.onclick();assert.match(g.ids.addressGpsStatus.textContent,/unavailable/);
 assert.equal(g.network.length,gpsNetwork,'All GPS success and failure paths make zero Google requests');
 console.log('GPS address capture passes fresh one-shot location/accuracy/time, preservation of typed and original addresses, GPS-only reports, export/backup/map link, poor/stale fixes, denial/timeout, endpoint changes, closed-form races and zero network requests.');
 console.log('Address reporting passes pickup/drop-off capture, original-address preservation, duplicate protection, no route/status/earnings or network changes, CSV/text/share/copy fallbacks, date filtering, persistence across reload/new days/reset, validated JSON backup merge, legacy restore and storage failure checks.');
})().catch(e=>{console.error(e);process.exitCode=1;});
