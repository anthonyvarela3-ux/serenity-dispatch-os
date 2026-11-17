const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('assets/index.html','utf8');
const [markup, script] = html.split('<script>');
const ids = {};
class Element {
  constructor(id){this.id=id; this.dataset={}; this.style={}; this.classList={toggle(){}};}
  addEventListener(event, fn){this[event]??=fn;}
  setAttribute(){}
  querySelector(){return new Element();}
  querySelectorAll(){return [];}
  focus(){}
  set innerHTML(value){
    this.html=value;
    if(this.id==='customerMain'){
      for(const id of ['openNextRun','customerAdvance','customerBack'])delete ids[id];
    }
    for(const m of value.matchAll(/id="([^"]+)"/g))ids[m[1]]=new Element(m[1]);
  }
  get innerHTML(){return this.html;}
}
for(const m of markup.matchAll(/id="([^"]+)"/g))ids[m[1]]=new Element(m[1]);
const saved = {};
const context = vm.createContext({
  console, confirm:()=>true, prompt:()=>'07:00', setTimeout(){}, clearTimeout(){},
  document:{getElementById:id=>ids[id]??null,querySelectorAll:()=>[],createElement:()=>new Element(),body:{appendChild(){}}},
  localStorage:{getItem:k=>saved[k]??null,setItem:(k,v)=>saved[k]=v},
});
const run = s=>vm.runInContext(s,context);
run(script.split('</script>')[0]);
const check=(s,result)=>assert.equal(run(s),result);
const tap=id=>{const e=ids[id]; (e.click??e.onclick)();};
const advance=n=>{for(let i=0;i<n;i++)tap('customerAdvance');};
check('revenueOpen',false);
tap('revenueToggle');
check('revenueOpen',true);
tap('revenueToggle');
advance(2);
tap('customerBack');
check('selected().status',1);
advance(5);
check('selected().id','F-002');
assert.match(ids.customerMain.innerHTML,/NEXT RUN · F-002/);
assert.equal(ids.customerAdvance,undefined);
check('JSON.parse(localStorage.getItem(STORE)).handoff','F-002');
tap('undo');
check('selected().id','F-001');
check('selected().status',5);
advance(1);
tap('openNextRun');
check('selected().status',0);
assert.match(ids.customerMain.innerHTML,/Status: Pending/);
assert.match(ids.customerMain.innerHTML,/Start Pickup/);
assert.equal(ids.customerAdvance.dataset.holdInstalled,'1');
advance(1);
check('statusText(selected())','En Route to Pickup');
tap('customerBack');
check('statusText(selected())','Pending');
advance(2);
run('overrideStatus(selected(), 0)');
check('statusText(selected())','Pending');
check('Object.keys(selected().actual).length',0);
tap('undo');
check('statusText(selected())','Arrived at Pickup');
run("modifyOutcome(selected(),'Canceled at Door')");
check('state.handoff','F-003');
for(let i=3;i<=8;i++){tap('openNextRun');advance(6);}
check('state.selected',null);
assert.match(ids.customerMain.innerHTML,/No runs remaining/);
check('state.trips.filter(t=>t.outcome).length',8);
assert.equal([...ids.roster.innerHTML.matchAll(/class="trip done"/g)].length,8);
run('state=seed();render()');
check('project()["F-002"].pickup', 552);
check('project()["F-001"].drop',null);
assert.match(ids.roster.innerHTML,/9:12 AM[\s\S]*tag red[^>]*>\+22 min/);
tap('refresh');
ids.updateTime.value='08:20';
tap('applyDay');
check('state.clock',500);
check('project()["F-002"].pickup',594);
check('state.trips[1].scheduled',530);
tap('addTrip');
Object.assign(ids.newWho,{value:'X.Y.'});
Object.assign(ids.newTime,{value:'12:00'});
Object.assign(ids.newKind,{value:'Outbound'});
Object.assign(ids.newDrive,{value:'20'});
Object.assign(ids.newApproach,{value:'10'});
tap('saveNew');
check('state.trips.length',9);
check('state.trips.find(t=>t.id==="F-005").reposition',null);
check('project()["F-005"].pickup',null);
assert.match(ids.roster.innerHTML,/ETA unknown/);
run('state=seed();state.trips[0].drive=40;state.trips[1].reposition=35;state.trips[1].combinedApproach=null;deviceTime=()=>"07:50";render()');
tap('clockMode');
tap('customerAdvance');
check('state.trips[0].actual["En Route to Pickup"]',470);
run('deviceTime=()=>"08:00"');
tap('customerAdvance');
check('project()["F-001"].pickup',480);
run('deviceTime=()=>"08:05"');
tap('customerAdvance');
run('deviceTime=()=>"08:10"');
tap('customerAdvance');
check('project()["F-001"].drop',530);
check('project()["F-002"].pickup',565);
run('deviceTime=()=>"09:00"');
tap('customerAdvance');
check('project()["F-001"].drop',540);
check('project()["F-002"].pickup',575);
check('state.trips[1].scheduled',530);
tap('customerAdvance');
assert.match(ids.customerMain.innerHTML,/NEXT RUN · F-002/);
tap('openNextRun');
assert.match(ids.customerMain.innerHTML,/Status: Pending/);
tap('plus5');
check('state.clockMode','simulation');
run('state=seed();Object.assign(state.trips[0],{drive:null,driveMiles:20});Object.assign(state.trips[1],{reposition:null,repositionMiles:17.5,combinedApproach:null});render()');
check('project()["F-001"].drop',517);
check('project()["F-002"].pickup',552);
check('project()["F-002"].pickupRough',true);
assert.match(ids.roster.innerHTML,/9:12 AM · Rough/);
run('state.trips[0].drive=36;state.trips[1].reposition=12;render()');
check('project()["F-002"].pickup',525);
check('project()["F-002"].pickupRough',false);
run('state.trips[1].reposition=null;state.trips[1].repositionMiles=null;render()');
check('project()["F-002"].pickup',null);
tap('addTrip');
Object.assign(ids.newWho,{value:'Z.Z.'});
Object.assign(ids.newTime,{value:'12:00'});
Object.assign(ids.newKind,{value:'Outbound'});
Object.assign(ids.newDrive,{value:''});
Object.assign(ids.newApproach,{value:''});
Object.assign(ids.newDriveMiles,{value:'8.5'});
Object.assign(ids.newApproachMiles,{value:'4.5'});
tap('saveNew');
check('state.trips.find(t=>t.who==="Z.Z.").driveMiles',8.5);
check('state.trips.find(t=>t.who==="Z.Z.").repositionMiles',4.5);
console.log('Passed script checks for Revenue, Back, handoff, persisted selection, Undo, cancellation, and last run.');
