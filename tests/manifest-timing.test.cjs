// Automated unit tests for pure Serenity timing rules; no patient information.
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const source=readFileSync('src/manifest-timing.js','utf8');
const sandbox={};vm.createContext(sandbox);vm.runInContext(source,sandbox);
const engine=sandbox.SerenityManifestTiming;
const sched='2026-11-12T10:30:00-05:00';
const eta=(delta)=>new Date(Date.parse(sched)+delta*60000).toISOString();
let tests=0;
function check(direction,delta,expected){
 const out=engine.classifyPickup({direction,scheduledPickup:sched,gpsPickupEta:eta(delta)});
 assert.equal(out.tone,expected,direction+' '+delta);
 assert.equal(out.minutesLate,delta);
 tests++;
}
check('Outbound',-5,'green');check('Outbound',0,'green');check('Outbound',1,'yellow');
check('Outbound',15,'yellow');check('Outbound',16,'red');check('Outbound',35,'red');
check('Return',-2,'green');check('Return',0,'green');check('Return',1,'purple');check('Return',45,'purple');
const missing=engine.classifyPickup({direction:'Outbound',scheduledPickup:sched,gpsPickupEta:null});
assert.equal(missing.tone,'unknown');tests++;
const stale=engine.classifyPickup({direction:'Outbound',scheduledPickup:sched,gpsPickupEta:eta(10),etaUpdatedAt:'2026-11-12T10:00:00-05:00',now:'2026-11-12T10:01:00-05:00',staleAfterSeconds:45});
assert.equal(stale.tone,'stale');tests++;
const gap=engine.computeUsableGap({previousGpsDropoffEta:'2026-11-12T10:00:00-05:00',nextScheduledPickup:'2026-11-12T10:45:00-05:00',repositionMinutes:18});
assert.equal(gap.availableMinutes,27);assert.equal(gap.classification,'available');tests++;
const conflict=engine.computeUsableGap({previousGpsDropoffEta:'2026-11-12T10:30:00-05:00',nextScheduledPickup:'2026-11-12T10:45:00-05:00',repositionMinutes:20});
assert.equal(conflict.availableMinutes,-5);assert.equal(conflict.classification,'conflict');tests++;
console.log('PASS '+tests+' Serenity timing tests');