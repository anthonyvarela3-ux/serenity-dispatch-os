(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ManifestImport=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  const normalized=x=>String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const person=t=>t.riderName||t.who||'';
  const samePerson=(a,b)=>{
    const x=person(a).trim(),y=person(b).trim();
    return !!x&&!!y&&(normalized(x)===normalized(y)||(!x.includes(' ')||!y.includes(' '))&&normalized(x.split(/\s+/)[0])===normalized(y.split(/\s+/)[0]));
  };
  const sameRoute=(a,b)=>normalized(a.pickupArea)===normalized(b.pickupArea)&&normalized(a.dropArea)===normalized(b.dropArea);
  const locked=t=>t.status>0||!!t.outcome||Object.keys(t.actual||{}).length>0;
  function time(text){
    const m=String(text??'').trim().match(/^(\d{1,2})\s*[:.]\s*([0-5]\d)\s*([AP])\s*\.?M\.?$/i);
    if(!m||+m[1]<1||+m[1]>12)return null;
    return (+m[1]%12+(m[3].toUpperCase()==='P'?12:0))*60+ +m[2];
  }
  const clean=s=>s.replace(/\b(?:Tomorrow|Today)\b/gi,'').replace(/\s+/g,' ').trim();
  function parse(text){
    const lines=String(text).replace(/\r/g,'').split('\n').map(clean).filter(Boolean), pick=[];
    const label=/\b(?:PU|PICK\s*UP)\s*[:;]?\s*(\d{1,2}\s*[:.]\s*\d{2}\s*[AP]\s*\.?M\.?)/i;
    const dropLabel=/\b(?:DO|D0|DROP\s*OFF)\s*[:;]?\s*(\d{1,2}\s*[:.]\s*\d{2}\s*[AP]\s*\.?M\.?)/i;
    function nameLine(line){return /[a-z]/i.test(line)&&!/[\d,:]/.test(line)&&!label.test(line)&&!dropLabel.test(line)&&
      !/^(?:assigned|search|no trips|routingbox|anthony$|pending$|outbound$|return$|<|back\b|chrome\b)/i.test(line);}
    for(let i=0;i<lines.length;i++)if(label.test(lines[i])){
      let name=i-1;while(name>=0&&!nameLine(lines[name])&&i-name<5)name--;
      pick.push({index:i,nameIndex:name>=0&&nameLine(lines[name])?name:i,name:name>=0&&nameLine(lines[name])?lines[name]:'',match:lines[i].match(label)});
    }
    const rows=[],warnings=[];
    for(let n=0;n<pick.length;n++){
      const p=pick[n],end=pick[n+1]?.nameIndex??lines.length;
      let di=-1;for(let k=p.index+1;k<end;k++)if(dropLabel.test(lines[k])){di=k;break;}
      const scheduled=time(p.match[1]),scheduledDrop=di<0?null:time(lines[di].match(dropLabel)[1]);
      const address=a=>a.filter(l=>!/^(?:assigned|no trips|pending|search|back\b)/i.test(l)).join(' ').trim();
      const first=p.name.split(/\s+/)[0]||'';
      const row={riderName:p.name,who:first===first.toUpperCase()?first.slice(0,1)+first.slice(1).toLowerCase():first,scheduled,scheduledDrop,
        pickupArea:di<0?'':address(lines.slice(p.index+1,di)),dropArea:di<0?'':address(lines.slice(di+1,end)),kind:null};
      const previous=rows.find(r=>samePerson(r,row)&&normalized(r.pickupArea)===normalized(row.dropArea)&&normalized(r.dropArea)===normalized(row.pickupArea));
      if(previous)row.kind='Return';
      rows.push(row);
      if(di<0)warnings.push('Run '+rows.length+': drop-off section was not read. Correct it before applying.');
    }
    if(!rows.length)warnings.push('No complete pickup labels were found. Check the recognized text or enter the run below.');
    return {rows,warnings};
  }
  function validate(row){
    const errors=[];
    if(!person(row).trim()||person(row).length>100)errors.push('rider name');
    if(!Number.isInteger(row.scheduled)||row.scheduled<0||row.scheduled>=1440)errors.push('pickup time');
    if(row.scheduledDrop!==null&&row.scheduledDrop!==undefined&&(!Number.isInteger(row.scheduledDrop)||row.scheduledDrop<0||row.scheduledDrop>=1440))errors.push('drop-off time');
    if(row.driveMiles!=null&&(!Number.isFinite(row.driveMiles)||row.driveMiles<0||row.driveMiles>=720))errors.push('loaded mileage');
    for(const k of ['pickupArea','dropArea'])if(typeof row[k]!=='string'||row[k].trim().length<5||row[k].length>350)errors.push(k==='pickupArea'?'pickup address':'drop-off address');
    return errors;
  }
  function match(row,trips){
    const exact=trips.filter(t=>samePerson(t,row)&&sameRoute(t,row)&&t.scheduled===row.scheduled);
    if(exact.length===1)return {id:exact[0].id,locked:locked(exact[0]),reason:'Same rider, time and route'};
    const route=trips.filter(t=>samePerson(t,row)&&sameRoute(t,row));
    if(route.length===1)return {id:route[0].id,locked:locked(route[0]),reason:'Same rider and route · review schedule change'};
    const atTime=trips.filter(t=>samePerson(t,row)&&t.scheduled===row.scheduled);
    if(atTime.length===1)return {id:atTime[0].id,locked:locked(atTime[0]),reason:'Same rider and time · review address change'};
    if(exact.length||route.length||atTime.length)return {ambiguous:true,reason:'Several possible matches · choose the existing run'};
    // A changed route AND time cannot safely be matched by first name alone.
    if(trips.some(t=>samePerson(t,row)))return {ambiguous:true,reason:'Rider already appears today · choose existing run or add a new leg'};
    return {reason:'New run'};
  }
  function deduplicate(rows){
    const found=new Set();
    return rows.filter(row=>{const key=[normalized(person(row)),row.scheduled,normalized(row.pickupArea),normalized(row.dropArea)].join('|');if(found.has(key))return false;found.add(key);return true;});
  }
  function newTrip(row,id){const first=row.who||person(row).split(/\s+/)[0];return {id,who:/^[A-Z][A-Z']+$/.test(first)?first.slice(0,1)+first.slice(1).toLowerCase():first,riderName:person(row),scheduled:row.scheduled,scheduledDrop:row.scheduledDrop??null,
    pickupArea:row.pickupArea.trim(),dropArea:row.dropArea.trim(),kind:row.kind==='Return'?'Return':'Outbound',
    status:0,actual:{},outcome:null,notes:'',phone:'',fare:null,drive:null,driveMiles:row.driveMiles??null,driveMilesEstimated:!!row.driveMilesEstimated,reposition:null,repositionMiles:null,combinedApproach:null};}
  function merge(day,entries,now){
    const out=clone(day),before=clone(day.trips),used=new Set(),changes={added:[],updated:[],preserved:[]};
    let seq=Math.max(out.tripSeq||0,...out.trips.map(t=>+(String(t.id).match(/(\d+)$/)?.[1]||0)));
    const id=()=>{let value;do{value='F-'+String(++seq).padStart(3,'0');}while(out.trips.some(t=>t.id===value));return value;};
    for(const {row,target} of entries){
      if(target==='skip')continue;
      const errors=validate(row);if(errors.length)throw Error('Check '+errors.join(', '));
      if(!target)throw Error('Choose a match or Add new run for every included row.');
      if(target==='new'){
        const duplicate=out.trips.find(t=>samePerson(t,row)&&sameRoute(t,row)&&t.scheduled===row.scheduled);
        if(duplicate){changes.preserved.push(duplicate.id);continue;}
        const t=newTrip(row,id());out.trips.push(t);changes.added.push(t.id);continue;
      }
      if(used.has(target))throw Error('Two screenshot rows are assigned to '+target+'. Choose the correct match.');used.add(target);
      const t=out.trips.find(t=>t.id===target);if(!t)throw Error('The selected run no longer exists. Review again.');
      if(locked(t)){changes.preserved.push(t.id);continue;}
      const oldRoute=[t.pickupArea,t.dropArea].join('|');
      const patch={scheduled:row.scheduled,scheduledDrop:row.scheduledDrop??t.scheduledDrop??null,pickupArea:row.pickupArea.trim(),dropArea:row.dropArea.trim(),kind:row.kind||t.kind||'Outbound'};
      if(Object.keys(patch).some(k=>t[k]!==patch[k])){
        t.manifestRevisions??=[];t.manifestRevisions.push({at:now,before:{scheduled:t.scheduled,scheduledDrop:t.scheduledDrop??null,pickupArea:t.pickupArea,dropArea:t.dropArea,kind:t.kind},after:clone(patch)});
        Object.assign(t,patch);
        if(oldRoute!==[t.pickupArea,t.dropArea].join('|')){t.drive=null;t.driveMiles=null;t.driveMilesEstimated=false;delete t.pickupTown;delete t.dropTown;}
        changes.updated.push(t.id);
      }else changes.preserved.push(t.id);
    }
    if(out.trips.length>100)throw Error('A day can contain at most 100 runs.');
    // Leave saved history/current interactions in place; insert new work into
    // the remaining schedule without moving it in front of an active run.
    let lastProtected=-1;out.trips.forEach((t,i)=>{if(locked(t))lastProtected=i;});
    const prefix=out.trips.slice(0,lastProtected+1),remaining=out.trips.slice(lastProtected+1).sort((a,b)=>a.scheduled-b.scheduled);
    out.trips=[...prefix,...remaining];out.tripSeq=seq;
    const pending=out.trips.filter(t=>!locked(t));
    const originMap=trips=>{let prev=null;const map=new Map();for(const t of trips){if(t.outcome==='Canceled in Advance')continue;map.set(t.id,prev);prev=t.id;}return map;};
    const oldOrigins=originMap(before),newOrigins=originMap(out.trips);
    for(const t of pending)if(oldOrigins.get(t.id)!==newOrigins.get(t.id)||changes.updated.includes(t.id)){
      t.reposition=null;t.repositionMiles=null;t.combinedApproach=null;
    }
    out.manifestUpdatedAt=now;
    return {day:out,changes};
  }
  return {parse,time,validate,match,deduplicate,merge,newTrip,locked};
});
