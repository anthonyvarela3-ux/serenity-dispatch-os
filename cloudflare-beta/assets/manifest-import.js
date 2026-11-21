(() => {
  'use strict';
  const M=ManifestImport;
  let mode='merge',job=null,libraryPromise=null,draft=[],sourceText='',sourceDate='';
  const timeValue=m=>Number.isInteger(m)?String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'):'';
  const fromTime=value=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)?+value.slice(0,2)*60+ +value.slice(3):null;
  const datePlusOne=()=>{const d=new Date(localServiceDate()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
  function library(){
    if(window.Tesseract)return Promise.resolve(window.Tesseract);
    if(libraryPromise)return libraryPromise;
    libraryPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
      script.integrity='sha384-r1ru3tcf6FhnCFR4B7pIFG+BhFF9LlFtz/P1y4pblWn3AGs9y3lBx5SKLNf4+rED';
      script.crossOrigin='anonymous';
      const timer=setTimeout(()=>{script.remove();libraryPromise=null;reject(Error('OCR download timed out. Check your connection and try again.'));},45000);
      script.onload=()=>{clearTimeout(timer);resolve(window.Tesseract);};
      script.onerror=()=>{clearTimeout(timer);script.remove();libraryPromise=null;reject(Error('OCR could not load. Check your connection, or use a JSON file.'));};
      document.head.appendChild(script);
    });
    return libraryPromise;
  }
  function stop(){if(!job)return;job.cancelled=true;job.worker?.terminate().catch(()=>{});job=null;}
  $('modalRoot').addEventListener('click',event=>{
    if(event.target.id==='closeModal'||event.target.id==='cancelManifestOCR'||event.target.classList.contains('modalshade'))stop();
  });
  function open(nextMode){
    stop();mode=nextMode;draft=[];sourceText='';sourceDate='';
    modal(mode==='merge'?'Change Existing Manifest':'Upload New Manifest',
      '<p>'+(mode==='merge'?'Add or revise today’s remaining runs. Existing runs and all recorded progress stay saved.':'Start a new service day. Your current day is backed up before replacement.')+'</p>'+
      '<p class="small muted">Choose one or more RoutingBox screenshots, or a Serenity JSON file. Screenshot text is read on this device; the OCR engine downloads when first needed. Review names, times and addresses before applying.</p>'+
      '<label for="manifestFiles" class="btn primary">Choose screenshots or JSON</label><input id="manifestFiles" type="file" accept="image/png,image/jpeg,image/webp,application/json,.json" multiple hidden>'+
      '<p id="manifestPickError" role="alert"></p>',
      '<button class="btn" id="closeModal">Cancel</button>');
    $('manifestFiles').onchange=readFiles;
  }
  function errorView(message){
    modal('Manifest not changed','<p role="alert">'+esc(message)+'</p><p>Your saved day has not been changed.</p>',
      '<button class="btn primary" id="retryManifest">Choose another file</button><button class="btn" id="closeModal">Close</button>');
    $('retryManifest').onclick=()=>open(mode);
  }
  async function readFiles(event){
    const files=Array.from(event.target.files||[]);event.target.value='';if(!files.length)return;
    let token;
    try{
      if(files.length>4||files.some(f=>f.size>20*1024*1024))throw Error('Choose at most four screenshots, each smaller than 20 MB.');
      const jsonFiles=files.filter(f=>/\.json$/i.test(f.name)||f.type==='application/json');
      if(jsonFiles.length){
        if(files.length!==1)throw Error('Choose a JSON file by itself, or choose screenshots together.');
        const obj=JSON.parse(await files[0].text());
        if(obj.format!=='serenity-001'||!Array.isArray(obj.data?.trips)||obj.data.trips.length>100)throw Error('Choose a Serenity manifest JSON backup.');
        draft=M.deduplicate(obj.data.trips.map(t=>({riderName:String(t.riderName||t.who||''),who:String(t.who||''),scheduled:t.scheduled,
          scheduledDrop:t.scheduledDrop??null,pickupArea:String(t.pickupArea||''),dropArea:String(t.dropArea||''),kind:t.kind,pickupNotice:t.pickupNotice||(t.dialysisReturn===true?'dialysis':'auto'),dialysisReturn:t.dialysisReturn===true,driveMiles:Number.isFinite(t.driveMiles)?t.driveMiles:null,driveMilesEstimated:!!t.driveMilesEstimated})));
        sourceDate=obj.data.serviceDate||'';review([]);return;
      }
      if(files.some(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)))throw Error('Use PNG or JPEG screenshots, or a Serenity JSON file.');
      token={cancelled:false,worker:null};job=token;
      modal('Reading manifest screenshots','<p id="manifestOCRProgress" role="status">Loading OCR… The first use may take a little longer.</p><p class="small muted">Your saved runs stay unchanged until you review and apply.</p>',
        '<button class="btn" id="cancelManifestOCR">Cancel</button>');
      $('cancelManifestOCR').onclick=()=>{stop();closeModal();};
      const T=await library();if(token.cancelled)return;
      let index=0;
      token.worker=await T.createWorker('eng',1,{
        workerPath:'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/worker.min.js',
        corePath:'https://cdn.jsdelivr.net/npm/tesseract.js-core@6.0.0',
        logger:progress=>{if(!token.cancelled&&$('manifestOCRProgress'))$('manifestOCRProgress').textContent='Screenshot '+(index+1)+' of '+files.length+' · '+String(progress.status||'Reading')+(Number.isFinite(progress.progress)?' · '+Math.round(progress.progress*100)+'%':'');}
      });
      if(token.cancelled){await token.worker.terminate();return;}
      await token.worker.setParameters({preserve_interword_spaces:'1'});
      const texts=[];
      for(index=0;index<files.length;index++){
        if(token.cancelled)return;
        const result=await token.worker.recognize(files[index]);texts.push(result.data.text);
      }
      await token.worker.terminate();token.worker=null;if(token.cancelled)return;job=null;
      sourceText=texts.join('\n');
      const parsed=M.parse(sourceText);draft=M.deduplicate(parsed.rows);
      sourceDate=/\bTomorrow\b/i.test(sourceText)?datePlusOne():localServiceDate();
      review(parsed.warnings);
    }catch(error){if(token?.cancelled)return;stop();errorView(error.message||'The screenshot could not be read. Try a clearer screenshot.');}
  }
  function field(id,label,value,type='text'){
    return '<div class="field"><label for="'+id+'">'+label+'</label><input id="'+id+'" type="'+type+'" value="'+esc(value)+'" autocomplete="off"></div>';
  }
  function review(warnings=[]){
    if(!draft.length)draft=[{riderName:'',scheduled:null,scheduledDrop:null,pickupArea:'',dropArea:'',kind:'Outbound'}];
    const rows=draft.map((row,i)=>{
      const match=mode==='merge'?M.match(row,state.trips):{reason:'New day run'};
      row.pickupNotice=row.pickupNotice??(row.dialysisReturn===true?'dialysis':match.id?(state.trips.find(t=>t.id===match.id)?.pickupNotice||(state.trips.find(t=>t.id===match.id)?.dialysisReturn===true?'dialysis':'auto')):'auto');
      row.kind=row.kind||(match.id?state.trips.find(t=>t.id===match.id)?.kind:null)||'Outbound';
      const options=mode==='merge'?'<option value="">Choose existing run or Add new run</option><option value="new">Add new run</option>'+state.trips.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.id+' · '+t.who+' · '+fmt(t.scheduled)+(M.locked(t)?' · Keep saved progress':''))+'</option>').join(''):'<option value="new">Include in new day</option>';
      const selected=mode==='merge'?(match.id||(match.ambiguous?'':'new')):'new';row._target=row._target??selected;
      return '<section class="manifest-review-row"><div class="section-heading"><h4>Run '+(i+1)+'</h4><span class="small muted">'+esc(match.locked?'Already started or closed · saved run will be kept':match.reason)+'</span></div>'+
        '<div class="field"><label for="mrTarget'+i+'">How to apply</label><select id="mrTarget'+i+'">'+options+'<option value="skip">Skip this screenshot row</option></select></div>'+
        '<div class="two">'+field('mrName'+i,'Rider name',row.riderName||row.who||'')+field('mrPickup'+i,'Scheduled pickup',timeValue(row.scheduled),'time')+
        field('mrDrop'+i,'Scheduled drop-off (optional)',timeValue(row.scheduledDrop),'time')+
        '<div class="field"><label for="mrKind'+i+'">Leg</label><select id="mrKind'+i+'"><option>Outbound</option><option>Return</option></select></div></div>'+
        '<div class="field"><label for="mrNotice'+i+'">Pickup reminder - information only</label><select id="mrNotice'+i+'">'+pickupNoticeOptions()+'</select></div>'+
        field('mrFrom'+i,'Pickup address',row.pickupArea)+field('mrTo'+i,'Drop-off address',row.dropArea)+'</section>';
    }).join('');
    modal(mode==='merge'?'Review Manifest Changes':'Review New Manifest',
      '<p>'+(mode==='merge'?'Missing rows will not be removed or canceled. Completed, canceled and active runs keep their saved information.':'Applying starts a new day after saving a backup of the current day.')+'</p>'+
      '<div class="field"><label for="manifestServiceDate">Service date</label><input id="manifestServiceDate" type="date" value="'+esc(mode==='merge'?(state.serviceDate||localServiceDate()):(sourceDate||localServiceDate()))+'" '+(mode==='merge'?'readonly':'')+'></div>'+
      (mode==='merge'&&sourceDate&&sourceDate!==(state.serviceDate||localServiceDate())?'<p class="notice">The source date differs from this saved day. Check that you chose the correct screenshot.</p>':'')+
      warnings.map(w=>'<p class="notice">'+esc(w)+'</p>').join('')+
      '<div id="manifestReviewRows">'+rows+'</div>'+
      '<p class="small muted">Review every included row. OCR can misread digits, apartment numbers and names.</p>'+
      (sourceText?'<details><summary>Recognized text · edit if needed</summary><label class="sr-only" for="manifestRawText">Recognized text</label><textarea id="manifestRawText" rows="10">'+esc(sourceText)+'</textarea><button class="btn" id="manifestReparse">Re-read corrected text</button></details>':'')+
      '<p id="manifestApplyError" role="alert"></p>',
      '<button class="btn primary" id="applyManifest">'+(mode==='merge'?'Apply Manifest Changes':'Start New Day')+'</button><button class="btn" id="closeModal">Cancel</button>');
    draft.forEach((row,i)=>{$('mrNotice'+i).value=row.pickupNotice;$('mrTarget'+i).value=row._target;$('mrKind'+i).value=row.kind==='Return'?'Return':'Outbound';});
    if($('manifestReparse'))$('manifestReparse').onclick=()=>{sourceText=$('manifestRawText').value;const parsed=M.parse(sourceText);draft=M.deduplicate(parsed.rows);review(parsed.warnings);};
    $('applyManifest').onclick=apply;
  }
  function backup(){
    const snapshot=deep(state);snapshot.events=snapshot.events.map(({restore,...event})=>event);
    const key=STORE+'_before_manifest';
    localStorage.setItem(key,JSON.stringify({format:'serenity-001',data:snapshot}));
  }
  function apply(){
    try{
      const serviceDate=$('manifestServiceDate').value;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate))throw Error('Choose a service date.');
      if(mode==='merge'&&serviceDate!==(state.serviceDate||localServiceDate()))throw Error('Changes must use the current saved service date.');
      const entries=draft.map((saved,i)=>{
        const riderName=$('mrName'+i).value.trim();
        return {target:$('mrTarget'+i).value,row:{riderName,who:riderName.split(/\s+/)[0],scheduled:fromTime($('mrPickup'+i).value),scheduledDrop:fromTime($('mrDrop'+i).value),
          pickupArea:$('mrFrom'+i).value.trim(),dropArea:$('mrTo'+i).value.trim(),kind:$('mrKind'+i).value,pickupNotice:$('mrNotice'+i).value,dialysisReturn:$('mrNotice'+i).value==='dialysis',driveMiles:saved.driveMiles??null,driveMilesEstimated:!!saved.driveMilesEstimated}};
      });
      if(!entries.some(e=>e.target!=='skip'))throw Error('Include at least one run.');
      const clock=currentTime();
      let result;
      if(mode==='merge')result=M.merge(state,entries,clock);
      else{
        const fresh={...seed(),serviceDate,settings:deep(state.settings),trips:[],events:[],seq:0,tripSeq:0,selected:null,shift:{start:null,end:null},checkpoints:{},clockMode:state.clockMode||'device',clock:420,forecastClock:420};
        result=M.merge(fresh,entries.map(e=>({...e,target:e.target==='skip'?'skip':'new'})),clock);
        result.day.selected=result.day.trips[0]?.id??null;
      }
      backup();
      const summary=result.changes.added.length+' added · '+result.changes.updated.length+' updated';
      change((mode==='merge'?'Merge manifest changes':'Start manifest '+serviceDate)+' · '+summary,()=>{state=loadRouteScenario(result.day);state.clock=currentTime();state.forecastClock=state.clock;});
      closeModal();selectedTab='dispatch';rosterFilter='All';render();
      routingProvider?.manifestChanged?.();
      toast(summary+' · Undo restores the previous manifest');
    }catch(error){$('manifestApplyError').textContent=error.message||'Could not save. Your previous day is unchanged.';}
  }
  $('uploadNewManifest').onclick=()=>open('new');
  $('changeManifest').onclick=()=>open('merge');
})();
