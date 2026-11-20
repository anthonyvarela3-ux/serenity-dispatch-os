(() => {
  'use strict';
  const KEY=STORE+'_address_reports',MAX=500;
  const issues=['Wrong street address','Wrong entrance or pickup point','Incorrect map pin','Other address issue'];
  const bases=['Driver observation','Customer confirmed','Facility confirmed','Not yet confirmed'];
  let records=[],loadError='';
  const clean=(value,max)=>typeof value==='string'&&value.length<=max?value.trim():null;
  function validateBackup(value){
    if(value===undefined)return [];
    if(!Array.isArray(value)||value.length>MAX)throw Error('Invalid address-report backup.');
    const ids=new Set();
    return value.map(raw=>{
      if(!raw||raw.version!==1)throw Error('Invalid address-report entry.');
      const r={version:1};
      for(const [key,max] of Object.entries({id:100,serviceDate:10,tripId:100,rider:100,endpoint:10,originalAddress:350,proposedAddress:350,issue:80,basis:80,notes:1000,invoiceReference:80,createdAt:40,clockMode:12})){
        r[key]=clean(raw[key],max);if(r[key]===null)throw Error('Invalid address-report '+key+'.');
      }
      r.recordedMinute=raw.recordedMinute;r.scheduledPickup=raw.scheduledPickup;
      if(raw.gps!==undefined){
        const g=raw.gps;
        if(!g||!Number.isFinite(g.latitude)||Math.abs(g.latitude)>90||!Number.isFinite(g.longitude)||Math.abs(g.longitude)>180||
          !Number.isFinite(g.accuracy)||g.accuracy<0||g.accuracy>250||typeof g.capturedAt!=='string'||!Number.isFinite(Date.parse(g.capturedAt)))throw Error('Invalid address-report GPS location.');
        r.gps={latitude:g.latitude,longitude:g.longitude,accuracy:g.accuracy,capturedAt:g.capturedAt};
      }
      if(!r.id||ids.has(r.id)||!/^\d{4}-\d{2}-\d{2}$/.test(r.serviceDate)||!r.tripId||!r.rider||
        !['pickup','dropoff'].includes(r.endpoint)||!issues.includes(r.issue)||!bases.includes(r.basis)||
        !['device','simulation'].includes(r.clockMode)||!Number.isFinite(Date.parse(r.createdAt))||
        !Number.isInteger(r.recordedMinute)||r.recordedMinute<0||r.recordedMinute>2880||
        !(r.scheduledPickup===null||Number.isInteger(r.scheduledPickup)&&r.scheduledPickup>=0&&r.scheduledPickup<1440)||
        (!r.proposedAddress&&!r.notes&&!r.gps))throw Error('Incomplete address-report entry.');
      ids.add(r.id);return r;
    });
  }
  try{const raw=localStorage.getItem(KEY);if(raw)records=validateBackup(JSON.parse(raw));}
  catch{loadError='The saved address-report log could not be read. Restore a JSON backup before adding reports.';}
  function save(next){
    if(loadError)throw Error(loadError);
    if(next.length>MAX)throw Error('The address log is full. Export the report before adding more entries.');
    try{localStorage.setItem(KEY,JSON.stringify(next));}catch{throw Error('Could not save this report on this device. Your existing log is unchanged.');}
    records=next;renderControls();
  }
  function mergeBackup(value){
    const incoming=validateBackup(value),existing=new Map(records.map(r=>[r.id,r]));
    if(loadError&&incoming.length){
      try{localStorage.setItem(KEY+'_unreadable',localStorage.getItem(KEY)||'');localStorage.setItem(KEY,JSON.stringify(incoming));}
      catch{throw Error('Could not restore the address-report log on this device.');}
      records=incoming;loadError='';renderControls();return;
    }
    for(const r of incoming){
      const old=existing.get(r.id);
      if(old&&JSON.stringify(old)!==JSON.stringify(r))throw Error('An address-report ID conflicts with a saved entry. Existing log kept.');
      existing.set(r.id,r);
    }
    if(incoming.length)save([...existing.values()]);
  }
  const endpoint=r=>r.endpoint==='pickup'?'Pickup':'Drop-off';
  const stamp=r=>new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'}).format(new Date(r.createdAt))+' (New York)';
  const ordered=rows=>rows.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
  const mapLink=g=>'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(g.latitude+','+g.longitude);
  const gpsText=g=>g?g.latitude.toFixed(6)+', '+g.longitude.toFixed(6)+' · accuracy ±'+Math.ceil(g.accuracy)+' m · captured '+new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',dateStyle:'medium',timeStyle:'short'}).format(new Date(g.capturedAt))+' (New York)':'';
  function report(rows){
    return 'Serenity Dispatch — Address Issue Report\n'+rows.length+' recorded issue'+(rows.length===1?'':'s')+'\nFor office review. Proposed corrections are driver reports, not MAS-approved changes.\n\n'+ordered(rows).map((r,i)=>
      (i+1)+'. '+r.serviceDate+' · '+r.tripId+' · '+r.rider+'\n'+
      'Recorded: '+stamp(r)+(r.clockMode==='simulation'?' · SIMULATION':'')+'\n'+
      'Scheduled pickup: '+fmt(r.scheduledPickup)+'\n'+
      'Invoice/reference: '+(r.invoiceReference||'Not provided')+'\n'+
      'Location: '+endpoint(r)+'\nIssue: '+r.issue+'\n'+
      'Manifest address: '+(r.originalAddress||'Not provided')+'\n'+
      'Proposed correct address: '+(r.proposedAddress||'Not yet known')+'\n'+
      'Basis: '+r.basis+'\nNotes: '+(r.notes||'None')+
      (r.gps?'\nRecorded GPS: '+gpsText(r.gps)+'\nGPS map: '+mapLink(r.gps)+'\nStreet address requires confirmation.':'')
    ).join('\n\n');
  }
  function csv(rows){
    const cell=value=>{
      let text=String(value??'');
      if(/^[\s]*[=+\-@]/.test(text))text="'"+text;
      return '"'+text.replace(/"/g,'""')+'"';
    };
    const headings=['Service date','Trip','Rider','Scheduled pickup','Invoice/reference','Location','Issue','Manifest address','Proposed correct address','Basis','Notes','Recorded at (New York)','Mode','Report ID','GPS latitude','GPS longitude','GPS accuracy (m)','GPS captured at','GPS map'];
    return '\uFEFF'+[headings,...ordered(rows).map(r=>[r.serviceDate,r.tripId,r.rider,fmt(r.scheduledPickup),r.invoiceReference,endpoint(r),r.issue,r.originalAddress,r.proposedAddress,r.basis,r.notes,stamp(r),r.clockMode,r.id,r.gps?.latitude,r.gps?.longitude,r.gps?.accuracy,r.gps?.capturedAt,r.gps?mapLink(r.gps):''])].map(row=>row.map(cell).join(',')).join('\r\n');
  }
  function renderControls(){
    const t=selected(),button=$('reportAddress'),count=$('addressReportLog');
    if(button)button.disabled=!t;
    if(count)count.textContent='Address Reports · '+records.length;
    if($('addressReportHint')){
      const n=t?records.filter(r=>r.tripId===t.id&&r.serviceDate===(state.serviceDate||localServiceDate())).length:0;
      $('addressReportHint').textContent=n?n+' address issue'+(n===1?'':'s')+' logged for this run.':'';
    }
  }
  function openReport(){
    const t=selected();if(!t)return;
    const serviceDate=state.serviceDate||localServiceDate();
    const addresses={pickup:String(t.pickupArea||''),dropoff:String(t.dropArea||'')};
    let gps=null,gpsBusy=false,captureSerial=0;
    modal('Report Wrong Address · '+t.id,
      '<p>'+esc(t.who)+' · '+esc(serviceDate)+'</p>'+
      '<div class="two"><div class="field"><label for="addressSide">Location</label><select id="addressSide"><option value="pickup">Pickup</option><option value="dropoff">Drop-off</option></select></div>'+
      '<div class="field"><label for="addressIssue">Issue</label><select id="addressIssue">'+issues.map(v=>'<option>'+esc(v)+'</option>').join('')+'</select></div></div>'+
      '<div class="field"><label for="addressOriginal">Address on this manifest</label><textarea id="addressOriginal" readonly></textarea></div>'+
      '<div class="field"><label for="addressProposed">Correct address or entrance, if known</label><input id="addressProposed" maxlength="350" autocomplete="off" placeholder="Leave blank if still unknown"></div>'+
      '<button class="btn" type="button" id="addressUseGps">Use Current GPS Location</button><p id="addressGpsStatus" class="small" role="status"></p>'+
      '<p class="small muted">Capture this location while you are at the pickup or drop-off. GPS records the map pin, accuracy and time; confirm the street address separately. No Google request is made.</p>'+
      '<div class="two"><div class="field"><label for="addressBasis">How do you know?</label><select id="addressBasis">'+bases.map(v=>'<option>'+esc(v)+'</option>').join('')+'</select></div>'+
      '<div class="field"><label for="addressInvoice">Invoice / dispatch reference (optional)</label><input id="addressInvoice" maxlength="80" autocomplete="off"></div></div>'+
      '<div class="field"><label for="addressNotes">What needs correcting?</label><textarea id="addressNotes" maxlength="1000" placeholder="What you found, door or entrance details, who confirmed it…"></textarea></div>'+
      '<p class="small muted">Saves an issue for office review. It does not change the manifest, navigation address or MAS record.</p><p id="addressSaveError" role="alert"></p>',
      '<button class="btn primary" id="saveAddressReport">Save Address Report</button><button class="btn" id="closeModal">Cancel</button>');
    $('addressSide').value='pickup';$('addressIssue').value=issues[0];$('addressBasis').value=bases[0];
    $('addressOriginal').value=addresses.pickup;$('addressInvoice').value=String(t.invoiceNumber||t.invoiceReference||'').slice(0,80);
    $('addressSide').onchange=()=>{captureSerial++;gps=null;gpsBusy=false;$('saveAddressReport').disabled=false;$('addressUseGps').disabled=false;$('addressSide').disabled=false;$('addressGpsStatus').textContent='';$('addressOriginal').value=addresses[$('addressSide').value]||'';};
    $('addressUseGps').onclick=()=>{
      if(gpsBusy)return;
      const feedback=$('addressGpsStatus'),button=$('addressUseGps'),saveButton=$('saveAddressReport'),side=$('addressSide'),token=++captureSerial;
      if(!navigator.geolocation?.getCurrentPosition){feedback.textContent='GPS location is unavailable in this browser. Enter the address or issue details manually.';return;}
      gpsBusy=true;button.disabled=true;saveButton.disabled=true;side.disabled=true;
      feedback.textContent='Getting your current location… Allow location access if prompted.';
      const current=()=>token===captureSerial&&$('addressGpsStatus')===feedback&&!$('modalRoot').hidden;
      const finish=()=>{gpsBusy=false;button.disabled=false;saveButton.disabled=false;side.disabled=false;};
      const failure=message=>{if(!current())return;finish();feedback.textContent=message+(gps?' Earlier GPS pin remains: '+gpsText(gps):'');};
      try{navigator.geolocation.getCurrentPosition(position=>{
        if(!current())return;
        const c=position.coords,at=position.timestamp,age=Date.now()-at;
        if(!Number.isFinite(c?.latitude)||Math.abs(c.latitude)>90||!Number.isFinite(c?.longitude)||Math.abs(c.longitude)>180||
          !Number.isFinite(c?.accuracy)||c.accuracy<0||!Number.isFinite(at)||age>60000||age< -5000){failure('A fresh GPS position was not available. Try again.');return;}
        if(c.accuracy>250){failure('GPS accuracy is ±'+Math.ceil(c.accuracy)+' m, too uncertain to record this stop. Move to a clearer location and try again.');return;}
        gps={latitude:c.latitude,longitude:c.longitude,accuracy:c.accuracy,capturedAt:new Date(at).toISOString()};finish();
        feedback.textContent='GPS recorded: '+gpsText(gps)+'. Review and save the report. The street address has not been inferred.';
      },error=>failure(error.code===1?'Location access was denied. Allow location for Serenity in your browser settings, or enter the details manually.':error.code===3?'GPS timed out. Try again or enter the details manually.':'GPS location could not be determined. Try again or enter the details manually.'),
      {enableHighAccuracy:true,maximumAge:0,timeout:15000});}catch{failure('GPS location is unavailable. Enter the details manually.');}
    };
    $('saveAddressReport').onclick=()=>{
      const button=$('saveAddressReport');if(button.disabled||gpsBusy)return;button.disabled=true;
      try{
        const side=$('addressSide').value;
        const draft={version:1,serviceDate,tripId:t.id,rider:t.riderName||t.who,
          endpoint:side,originalAddress:addresses[side],proposedAddress:$('addressProposed').value.trim(),issue:$('addressIssue').value,
          basis:$('addressBasis').value,notes:$('addressNotes').value.trim(),invoiceReference:$('addressInvoice').value.trim(),
          clockMode:usesDeviceTime()?'device':'simulation',recordedMinute:currentTime(),scheduledPickup:t.scheduled??null};
        if(gps)draft.gps={...gps};
        if(!draft.proposedAddress&&!draft.notes&&!gps)throw Error('Enter a correction or a note describing the problem, or capture the GPS location.');
        const same=records.some(r=>Object.keys(draft).filter(k=>k!=='recordedMinute').every(k=>JSON.stringify(r[k])===JSON.stringify(draft[k])));
        if(same){closeModal();toast('This address issue is already logged');return;}
        const id=globalThis.crypto?.randomUUID?.()||'address-'+Date.now()+'-'+Math.random().toString(36).slice(2);
        const entry=validateBackup([{...draft,id,createdAt:new Date().toISOString()}])[0];
        save([...records,entry]);closeModal();toast('Address issue saved for office review');
      }catch(error){$('addressSaveError').textContent=error.message;button.disabled=false;}
    };
  }
  function openLog(){
    modal('Address Issue Log',
      '<p>Saved on this browser across service days. Share with your office for review and any required MAS correction.</p>'+
      '<div class="field"><label for="addressDateFilter">Service date (blank shows all dates)</label><input id="addressDateFilter" type="date"></div>'+
      '<p id="addressLogCount" role="status"></p><div id="addressLogRows" class="events" style="max-height:280px;overflow:auto"></div>'+
      '<details style="margin-top:12px"><summary>Report text / manual copy</summary><label class="sr-only" for="addressReportText">Address report text</label><textarea id="addressReportText" readonly style="min-height:180px"></textarea></details>'+
      '<p id="addressLogFeedback" role="status"></p>',
      '<button class="btn primary" id="shareAddressReport">Share Report</button><button class="btn" id="copyAddressReport">Copy Report</button><button class="btn" id="csvAddressReport">Download CSV</button><button class="btn" id="txtAddressReport">Download Text</button><button class="btn" id="closeModal">Close</button>');
    const visible=()=>ordered(records.filter(r=>!$('addressDateFilter').value||r.serviceDate===$('addressDateFilter').value));
    const update=()=>{
      const rows=visible();$('addressLogCount').textContent=loadError||rows.length+' of '+records.length+' saved reports';
      $('addressLogRows').innerHTML=rows.map(r=>'<div class="event"><strong>'+esc(r.serviceDate+' · '+r.tripId+' · '+r.rider)+'</strong><br>'+esc(endpoint(r)+' · '+r.issue)+'<br><span class="small muted">Manifest: '+esc(r.originalAddress||'Not provided')+'<br>Proposed: '+esc(r.proposedAddress||'Not yet known')+'</span>'+(r.gps?'<br><span class="small">GPS: '+esc(gpsText(r.gps))+'</span><br><a href="'+esc(mapLink(r.gps))+'" target="_blank" rel="noopener noreferrer">View recorded location</a>':'')+'</div>').join('')||'<p class="muted">No address issues for this selection.</p>';
      $('addressReportText').value=report(rows);
      for(const id of ['shareAddressReport','copyAddressReport','csvAddressReport','txtAddressReport'])$(id).disabled=!rows.length||!!loadError;
    };
    $('addressDateFilter').value='';$('addressDateFilter').onchange=update;
    $('copyAddressReport').onclick=async()=>{
      try{if(!navigator.clipboard?.writeText)throw Error();await navigator.clipboard.writeText(report(visible()));$('addressLogFeedback').textContent='Report copied. Paste it into your office message.';}
      catch{$('addressReportText').parentElement.open=true;$('addressReportText').focus();$('addressReportText').select();$('addressLogFeedback').textContent='Copy from the selected report text, or download a file.';}
    };
    $('shareAddressReport').onclick=async()=>{
      if(!navigator.share){$('addressLogFeedback').textContent='Sharing is unavailable here. Copy the report or download a file to attach.';return;}
      try{await navigator.share({title:'Serenity Address Issue Report',text:report(visible())});$('addressLogFeedback').textContent='Returned from sharing. Delivery is not tracked by Serenity.';}
      catch(error){$('addressLogFeedback').textContent=error.name==='AbortError'?'Sharing canceled. Your reports remain saved.':'Could not open sharing. Copy the report or download a file.';}
    };
    const filename=()=> 'Serenity_Address_Issues_'+($('addressDateFilter').value||'All_Dates');
    $('csvAddressReport').onclick=()=>download(filename()+'.csv',csv(visible()),'text/csv;charset=utf-8');
    $('txtAddressReport').onclick=()=>download(filename()+'.txt',report(visible()),'text/plain;charset=utf-8');
    update();
  }
  addressReportController={render:renderControls,snapshot:()=>deep(records),validateBackup,mergeBackup,openLog};
  $('reportAddress').onclick=openReport;$('addressReportLog').onclick=openLog;renderControls();
})();
