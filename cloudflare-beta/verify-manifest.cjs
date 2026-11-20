const assert=require('node:assert/strict'),M=require('./assets/manifest-core.js');
const text=`ASSIGNED TODAY
TAYLOR EXAMPLE Tomorrow
PU: 08:15 AM
Public Library, Patchogue, NY 11772
DO: 09:30 AM
Public Station, Huntington, NY 11743
JORDAN SAMPLE
PU: 10:00 AM
Public Station, Huntington, NY 11743
DO: 10:45 AM
Public Library, Commack, NY 11725
TAYLOR EXAMPLE
PU: 02:00 PM
Public Station, Huntington, NY 11743
DO: 02:35 PM
Public Library, Patchogue, NY 11772`;
const {rows,warnings}=M.parse(text);
assert.equal(rows.length,3);assert.equal(warnings.length,0);
assert.equal(rows[0].who,'Taylor');assert.equal(rows[0].scheduled,495);assert.equal(rows[0].scheduledDrop,570);
assert.equal(rows[2].kind,'Return');assert.equal(rows[2].scheduled,840);
assert.ok(rows.every(r=>M.validate(r).length===0));
assert.equal(M.time('12:00 AM'),0);assert.equal(M.time('12:00 PM'),720);assert.equal(M.time('13:00 PM'),null);
assert.equal(M.time('10:99 AM'),null);assert.equal(M.time('10:00'),null);
assert.equal(M.parse('unreadable').rows.length,0);
assert.ok(M.validate(M.parse('ALEX EXAMPLE\nPU: 08:15 AM\nMissing drop').rows[0]).includes('pickup address'));
assert.equal(M.deduplicate([...rows,...rows]).length,3,'Overlapping screenshots do not duplicate runs');
const trips=rows.map((row,i)=>M.newTrip(row,'F-00'+(i+1)));
trips[0].status=6;trips[0].actual={Finished:570};trips[0].fare=85;trips[0].notes='Saved door';
trips[1].status=3;trips[1].actual={'Arrived at Pickup':610,'On Board':620};trips[1].phone='+15555550123';
trips[2].reposition=25;trips[2].notes='Verified entrance';trips[2].phone='+15555550124';trips[2].fare=90;
const day={serviceDate:'2026-11-20',trips,selected:'F-002',tripSeq:3,shift:{start:420,end:null},settings:{garageAddress:'Public station'},events:[{label:'On Board',time:620}],clock:625};
const snapshot=JSON.stringify(day),newRow={...rows[1],riderName:'CASEY EXAMPLE',who:'Casey',scheduled:780};
const entries=[{row:{...rows[0],scheduled:600},target:'F-001'},{row:{...rows[1],pickupArea:'Changed address, NY'},target:'F-002'},
 {row:newRow,target:'new'},{row:{...rows[2],scheduled:900},target:'F-003'}];
const result=M.merge(day,entries,650);
assert.equal(JSON.stringify(day),snapshot,'Review/apply calculation never mutates saved state');
assert.deepEqual(result.day.trips.find(t=>t.id==='F-001'),day.trips[0],'Completed history and revenue remain exact');
assert.deepEqual(result.day.trips.find(t=>t.id==='F-002'),day.trips[1],'On-board ride, phone and timing remain exact');
assert.deepEqual(result.changes,{added:['F-004'],updated:['F-003'],preserved:['F-001','F-002']});
const changed=result.day.trips.find(t=>t.id==='F-003');
assert.equal(changed.scheduled,900);assert.equal(changed.phone,trips[2].phone);assert.equal(changed.fare,90);assert.equal(changed.notes,trips[2].notes);
assert.equal(changed.manifestRevisions[0].before.scheduled,840);assert.equal(changed.reposition,null);
assert.deepEqual(result.day.shift,day.shift);assert.deepEqual(result.day.settings,day.settings);assert.deepEqual(result.day.events,day.events);assert.equal(result.day.selected,'F-002');
const repeat=M.merge(result.day,entries,651);assert.equal(repeat.day.trips.length,4);assert.equal(repeat.changes.added.length,0);
assert.equal(M.merge(day,[{row:newRow,target:'new'}],650).day.trips.length,4,'Partial screenshots never remove absent rows');
const missing=M.merge(day,[{row:rows[0],target:'F-001'}],650);assert.equal(missing.day.trips.length,3);
assert.equal(M.match(rows[0],trips).id,'F-001');assert.equal(M.match(rows[0],trips).locked,true);
assert.equal(M.match({...rows[2],scheduled:900},trips).id,'F-003');
assert.ok(M.match(rows[0],[...trips,{...trips[0],id:'F-009'}]).ambiguous);
assert.equal(M.match({...rows[0],riderName:'TAYLOR DIFFERENT'},trips).id,undefined,'Different full names do not merge just because first names match');
assert.ok(!M.match({...rows[0],riderName:'TAYLOR DIFFERENT'},trips).ambiguous);
assert.throws(()=>M.merge(day,[{row:newRow,target:''}],650),/Choose/);
assert.throws(()=>M.merge(day,[{row:{...newRow,scheduled:null},target:'new'}],650),/pickup time/);
assert.throws(()=>M.merge(day,[{row:rows[2],target:'F-003'},{row:rows[2],target:'F-003'}],650),/Two screenshot rows/);
const cancelled=JSON.parse(snapshot);cancelled.trips[2].outcome='Canceled in Advance';
assert.equal(M.merge(cancelled,[{row:rows[2],target:'F-003'}],650).day.trips.find(t=>t.id==='F-003').outcome,'Canceled in Advance');
const changedAddress=M.merge(day,[{row:{...rows[2],dropArea:'Other Library, Bay Shore, NY'},target:'F-003'}],650).day.trips.find(t=>t.id==='F-003');
assert.equal(changedAddress.driveMiles,null);
const unusual=JSON.parse(snapshot);unusual.trips[0].status=0;unusual.trips[0].actual={};
const retained=M.merge(unusual,[{row:newRow,target:'new'}],650).day.trips;
assert.deepEqual(retained.slice(0,2).map(t=>t.id),['F-001','F-002'],'An existing earlier pending row is not moved around recorded active progress');
console.log('Manifest parsing and merge pass OCR labels, times, same-location returns, duplicates, partial screenshots, explicit matching, ambiguous names, protected actuals/contacts/earnings, schedule revision audit, cancellation preservation and input validation.');
