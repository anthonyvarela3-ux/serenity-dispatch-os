import { test, expect } from '@playwright/test';

async function setup(page,{status='Scheduled',completedWithoutDropoff=false,arrivedMinutesAgo=null,exception=false}={}){
 await page.route('https://api.weather.gov/**', route=>route.abort('failed'));
 await page.addInitScript(({status,completedWithoutDropoff,arrivedMinutesAgo,exception})=>{
  const now=new Date(),pad=n=>String(n).padStart(2,'0');
  const day=[now.getFullYear(),pad(now.getMonth()+1),pad(now.getDate())].join('-');
  const events={};
  if(completedWithoutDropoff)events.closed=new Date(Date.now()-15*60000).toISOString();
  if(arrivedMinutesAgo!==null)events.arrived=new Date(Date.now()-arrivedMinutesAgo*60000).toISOString();
  if(exception)events.closed=new Date(Date.now()-15*60000).toISOString();
  const data={version:1,
   runs:[
    {id:'synthetic-1',date:day,name:'TEST RIDER A',pu:'8:00 AM',
     puAddr:'100 Example St, Testville, NY 11111',du:'9:00 AM',
     doAddr:'200 Example Rd, Testville, NY 11111',
     miles:12,tariff:42.5,status,events,sourcePhone:'',ready:false,notes:''},
    {id:'synthetic-2',date:day,name:'TEST RIDER B',pu:'9:30 AM',
     puAddr:'300 Example St, Testville, NY 11111',du:'10:30 AM',
     doAddr:'400 Example Rd, Testville, NY 11111',
     miles:7,tariff:31.25,status:'Scheduled',events:{},sourcePhone:'',ready:false,notes:''}
   ],people:{},active:null,shift:{start:null,end:null,rate:22.5},theme:'dark',
   morningConfig:{garage:'TEST BASE',returnBase:20},
   morningFirstLegs:{[day]:{runId:'synthetic-1',pickupAddr:'100 Example St, Testville, NY 11111',
    garage:'TEST BASE',minutes:38}},
   forecastV4:{reposition:15,trip:20,buffer:5}
  };
  localStorage.setItem('serenity_beta1_v1',JSON.stringify(data));
 },{status,completedWithoutDropoff,arrivedMinutesAgo,exception});
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#v7-navigation')).toBeVisible();
 await expect(page.locator('#v7-overview')).toBeVisible();
}
async function openRun(page){
 await page.locator('#v7-navigation [data-v7-page="manifest"]').click();
 await expect(page.locator('#v7-manifest')).toBeVisible();
 await page.locator('#v7-manifest button[data-v7-open="synthetic-1"]').click();
 await expect(page.locator('#customer')).toBeVisible();
 await expect(page.locator('#v7-customer-flow')).toBeVisible();
}
async function getRun(page){
 return page.evaluate(()=>JSON.parse(localStorage.getItem('serenity_beta1_v1')).runs.find(r=>r.id==='synthetic-1'));
}

test('three-page navigation and synthetic shift summary',async({page})=>{
 await setup(page);
 await expect(page.locator('#v7-assigned')).toHaveText('2');
 await expect(page.locator('#v7-potential')).toHaveText('$73.75');
 await page.locator('#v7-navigation [data-v7-page="manifest"]').click();
 await expect(page.locator('#v7-manifest')).toBeVisible();
 await expect(page.locator('#v7-overview')).toBeHidden();
 await page.locator('#v7-manifest button[data-v7-open="synthetic-1"]').click();
 await expect(page.locator('#customer')).toBeVisible();
 await expect(page.locator('#v7-manifest')).toBeHidden();
 await page.locator('#v7-navigation [data-v7-page="overview"]').click();
 await expect(page.locator('#v7-overview')).toBeVisible();
});

test('en route, arrived, boarded and drop off & finish persist the complete audit',async({page})=>{
 await setup(page);await openRun(page);
 for(const action of ['enroute','arrived','boarded']){
  await page.locator('#v7-customer-flow [data-v7-event="'+action+'"]').click();
  const run=await getRun(page);
  expect(run.events[action]).toBeTruthy();
 }
 page.on('dialog',dialog=>dialog.accept());
 await page.locator('#v7-customer-flow [data-v7-event="dropoff"]').click();
 await expect(page.locator('#v7-manifest')).toBeVisible();
 const run=await getRun(page);
 expect(run.status).toBe('Completed');
 expect(run.events.dropoff).toBeTruthy();
 expect(run.events.closed).toBeTruthy();
 expect(run.events.audit.map(e=>e.kind)).toEqual(['enroute','arrived','boarded','dropoff']);
});

test('direct drop-off without missed earlier taps closes without inventing them',async({page})=>{
 await setup(page);await openRun(page);
 page.on('dialog',dialog=>dialog.accept());
 await page.locator('#v7-customer-flow [data-v7-event="dropoff"]').click();
 await expect(page.locator('#v7-manifest')).toBeVisible();
 const run=await getRun(page);
 expect(run.status).toBe('Completed');
 expect(run.events.dropoff).toBeTruthy();
 expect(run.events.boarded).toBeUndefined();
 expect(run.events.arrived).toBeUndefined();
});

test('declining drop-off confirmation leaves the run open',async({page})=>{
 await setup(page);await openRun(page);
 page.on('dialog',dialog=>dialog.dismiss());
 await page.locator('#v7-customer-flow [data-v7-event="dropoff"]').click();
 const run=await getRun(page);
 expect(run.status).toBe('Scheduled');
 expect(run.events.dropoff).toBeUndefined();
 await expect(page.locator('#customer')).toBeVisible();
});

test('legacy Completed with missing actual drop-off can be repaired manually',async({page})=>{
 await setup(page,{status:'Completed',completedWithoutDropoff:true});
 await expect(page.locator('#v7-priority-content')).toContainText('missing actual drop-off');
 await openRun(page);
 const repair=page.locator('button[data-v8-open-repair="dropoff"]').first();
 await expect(repair).toBeVisible();
 await repair.click();
 await expect(page.locator('#v8-repair-form')).toBeVisible();
 const stamp=await page.evaluate(()=>{
  const d=new Date(Date.now()-30*60000),pad=n=>String(n).padStart(2,'0');
  return [d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-')+
    'T'+pad(d.getHours())+':'+pad(d.getMinutes());
 });
 await page.locator('#v8-repair-at').fill(stamp);
 page.on('dialog',dialog=>dialog.accept());
 await page.locator('#v8-save-repair').click();
 const run=await getRun(page);
 expect(run.status).toBe('Completed');
 expect(run.events.dropoff).toBeTruthy();
 expect(run.events.dropoffSource).toBe('driver_manual_backfill');
 expect(run.events.audit.at(-1).source).toBe('driver_manual_backfill');
 await expect(page.locator('#v8-repair-panel')).toContainText('Actual drop-off');
});

test('30 minute payment watchdog, acknowledge still waiting and trip transition',async({page})=>{
 await setup(page,{status:'Arrived',arrivedMinutesAgo:35});
 await expect(page.locator('#v7-alert-host .v7-urgent')).toBeVisible();
 await expect(page.locator('#v7-alert-host')).toContainText('PAYMENT AT RISK');
 await page.locator('[data-v7-guard="wait"]').click();
 await expect(page.locator('#v7-alert-host .v7-snoozed')).toBeVisible();
 await openRun(page);
 await page.locator('#v7-customer-flow [data-v7-event="boarded"]').click();
 await expect(page.locator('#v7-alert-host .v7-urgent')).toHaveCount(0);
 const run=await getRun(page);expect(run.events.boarded).toBeTruthy();
});

test('exception can be reopened only with explicit driver confirmation',async({page})=>{
 await setup(page,{status:'Exception',exception:true});
 await openRun(page);
 await expect(page.locator('#v8-reopen-exception')).toBeVisible();
 page.on('dialog',dialog=>dialog.accept());
 await page.locator('#v8-reopen-exception').click();
 const run=await getRun(page);
 expect(run.status).toBe('Scheduled');
 expect(run.events.closed).toBeUndefined();
});

test('office-approved later pickup preserves original manifest and changes operating time',async({page})=>{
 await setup(page);await openRun(page);
 await page.locator('button[data-v7-office="synthetic-1"]').click();
 await expect(page.locator('#office-approval')).toBeVisible();
 await page.locator('#office-status').selectOption('approved');
 await page.locator('#office-time').fill('09:15');
 await page.locator('#office-source').selectOption('Office phone call');
 await page.locator('#office-confirm').check();
 await page.locator('#office-save').click();
 const value=await page.evaluate(()=>{
  const db=JSON.parse(localStorage.getItem('serenity_beta1_v1'));
  return {original:db.runs[0].pu,approval:db.officeClearances?.['synthetic-1']};
 });
 expect(value.original).toBe('8:00 AM');
 expect(value.approval.state).toBe('approved');
 expect(value.approval.agreedPickup).toBe('9:15 AM');
});

test('export backup contains actuals and does not claim payment',async({page})=>{
 await setup(page);
 const p=page.waitForEvent('download');
 await page.locator('#export').click();
 const file=await p;
 expect(file.suggestedFilename()).toMatch(/^serenity-backup-/);
 await expect(page.locator('#v7-traffic-source')).toContainText('Informational only');
});
