import {test,expect} from '@playwright/test';
const localDay=(offset=0)=>{
 const date=new Date(Date.now()+offset*86400000);
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
};
async function seeded(page,{today=7,tomorrow=0,progress=false}={}){
 const day=localDay(),next=localDay(1);
 await page.route('https://api.weather.gov/**',r=>r.abort('failed'));
 await page.addInitScript(({day,next,today,tomorrow,progress})=>{
  const make=(idx,date,done=false)=>({
    id:date+'-'+idx,date,name:'SYNTHETIC RIDER '+String.fromCharCode(65+idx),
    pu:'8:00 AM',du:'8:45 AM',puAddr:(100+idx)+' Test Avenue, Exampleville, NY 11111',
    doAddr:(200+idx)+' Demo Road, Exampleville, NY 11111',
    status:done?'Completed':'Scheduled',events:done?{dropoff:new Date().toISOString()}:{},
    sourcePhone:'',ready:false,notes:''
  });
  const runs=[
    ...Array.from({length:today},(_,i)=>make(i,day,false)),
    ...Array.from({length:tomorrow},(_,i)=>make(i,next,progress&&i===0))
  ];
  localStorage.setItem('serenity_beta1_v1',JSON.stringify({version:1,runs,
   people:{},active:null,shift:{start:null,end:null,rate:22.5},theme:'dark'}));
 },{day,next,today,tomorrow,progress});
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#v7-overview')).toBeVisible();
}
async function manager(page){
 await page.locator('#v7-overview .v7-page-heading [data-v7-action="import"]').click();
 await expect(page.locator('#manifest-date-manager')).toBeVisible();
}
const db=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('serenity_beta1_v1')));
const fixture=[
 ['FAKE RIDER ALPHA','8:15 AM','9:15 AM'],
 ['FAKE RIDER BRAVO','10:00 AM','10:34 AM'],
 ['FAKE RIDER CHARLIE','10:30 AM','11:00 AM'],
 ['FAKE RIDER CHARLIE','11:45 AM','12:00 PM'],
 ['FAKE RIDER ALPHA','12:15 PM','12:37 PM'],
 ['FAKE RIDER DELTA','1:30 PM','1:42 PM'],
 ['FAKE RIDER ECHO','3:00 PM','4:00 PM'],
 ['FAKE RIDER ECHO','5:00 PM','5:17 PM']
];
const line=(x,i)=>x[0]+' | '+x[1]+' | '+(101+i)+' Testing Road, Exampleville, NY 11111 | '+x[2]+' | '+(301+i)+' Sample Street, Exampleville, NY 11111';
const manual=fixture.map(line).join('\n');
const card=(x,i)=>x[0]+'\nPU '+x[1]+'\n'+(101+i)+' Testing Road, Exampleville, NY 11111\nDO '+x[2]+'\n'+(301+i)+' Sample Street, Exampleville, NY 11111';
test('Today and Tomorrow buttons select the right date without touching previous runs',async({page})=>{
 await seeded(page,{today:7});
 await expect(page.locator('#v7-assigned')).toHaveText('7');
 await manager(page);
 await page.locator('#manifest-tomorrow').click();
 await expect(page.locator('#import-date')).toHaveValue(localDay(1));
 await expect(page.locator('#date')).toHaveValue(localDay(1));
 await expect(page.locator('#manifest-date-count')).toContainText('0 saved runs');
 expect((await db(page)).runs.filter(r=>r.date===localDay())).toHaveLength(7);
 await page.locator('#manifest-today').click();
 await expect(page.locator('#manifest-date-count')).toContainText('7 saved runs');
});
test('two overlapping Tomorrow screenshots yield eight, not fourteen, preserve today',async({page})=>{
 const listA=fixture.slice(0,7).map((r,i)=>card(r,i)).join('\n'),
       listB=fixture.slice(1).map((r,i)=>card(r,i+1)).join('\n');
 await page.addInitScript(({listA,listB})=>{
  window.Tesseract={createWorker:async()=>({
    recognize:async file=>({data:{confidence:98,text:'ASSIGNED TOMORROW\n'+(file.name.includes('first')?listA:listB)}}),
    terminate:async()=>{}
  })};
 },{listA,listB});
 await seeded(page,{today:7});
 await manager(page);
 page.on('dialog',d=>d.accept());
 await page.locator('#manifest-image').setInputFiles([
  {name:'first.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71])},
  {name:'second.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71])}
 ]);
 await page.locator('#read-ocr').click();
 await expect(page.locator('#preview-box')).toContainText('8 unique ready',{timeout:15000});
 await expect(page.locator('#preview-box')).toContainText('6 overlapping duplicate(s) skipped');
 await expect(page.locator('#import-date')).toHaveValue(localDay(1));
 await expect(page.locator('#preview-box')).toContainText('0 saved now → 8 after REPLACE');
 await page.locator('#reviewed-all').check();
 await page.locator('#commit-reviewed').click();
 await expect(page.locator('#v7-manifest')).toBeVisible();
 const data=await db(page),next=data.runs.filter(r=>r.date===localDay(1));
 expect(next).toHaveLength(8);
 expect(data.runs.filter(r=>r.date===localDay())).toHaveLength(7);
 expect(next.filter(r=>r.name==='FAKE RIDER ECHO')).toHaveLength(2);
 await expect(page.locator('#v7-m-summary')).toContainText('8 runs');
});
test('Replace eliminates five old tomorrow runs rather than accumulating thirteen',async({page})=>{
 await seeded(page,{today:7,tomorrow:5});
 await manager(page);
 await page.locator('#manifest-tomorrow').click();
 await page.locator('#raw').fill(manual);
 await page.locator('#preview').click();
 await expect(page.locator('#preview-box')).toContainText('5 saved now → 8 after REPLACE');
 await page.locator('#reviewed-all').check();
 page.on('dialog',d=>d.accept());
 await page.locator('#commit-reviewed').click();
 const x=await db(page);
 expect(x.runs.filter(r=>r.date===localDay(1))).toHaveLength(8);
 expect(x.runs.filter(r=>r.date===localDay())).toHaveLength(7);
});
test('Add mode skips saved duplicates and appends one new run only',async({page})=>{
 await seeded(page,{today:7,tomorrow:1});
 await manager(page);
 await page.locator('#manifest-tomorrow').click();
 await page.locator('input[name="manifest-write-mode"][value="append"]').check();
 const existing=(await db(page)).runs.find(r=>r.date===localDay(1));
 const oldLine=[existing.name,existing.pu,existing.puAddr,existing.du,existing.doAddr].join(' | ');
 await page.locator('#raw').fill(oldLine+'\n'+line(fixture[0],0));
 await page.locator('#preview').click();
 await expect(page.locator('#preview-box')).toContainText('1 overlapping duplicate(s) skipped');
 await expect(page.locator('#preview-box')).toContainText('1 saved now → 2 after ADD');
 await page.locator('#reviewed-all').check();
 page.on('dialog',d=>d.accept());
 await page.locator('#commit-reviewed').click();
 expect((await db(page)).runs.filter(r=>r.date===localDay(1))).toHaveLength(2);
});
test('Clear ALL removes selected tomorrow only, while cancellation preserves everything',async({page})=>{
 await seeded(page,{today:7,tomorrow:8});
 await manager(page);
 await page.locator('#manifest-tomorrow').click();
 let allow=false;
 page.on('dialog',d=>allow?d.accept():d.dismiss());
 await page.locator('#manifest-clear-date').click();
 expect((await db(page)).runs.filter(r=>r.date===localDay(1))).toHaveLength(8);
 allow=true;
 await page.locator('#manifest-clear-date').click();
 await expect(page.locator('#manifest-date-count')).toContainText('0 saved runs');
 const x=await db(page);
 expect(x.runs.filter(r=>r.date===localDay(1))).toHaveLength(0);
 expect(x.runs.filter(r=>r.date===localDay())).toHaveLength(7);
});
test('Destructive clear with actual trip progress requires a second confirmation',async({page})=>{
 await seeded(page,{today:7,tomorrow:3,progress:true});
 await manager(page);
 await page.locator('#manifest-tomorrow').click();
 let count=0;
 page.on('dialog',d=>{count++;count===1?d.accept():d.dismiss()});
 await page.locator('#manifest-clear-date').click();
 expect(count).toBe(2);
 expect((await db(page)).runs.filter(r=>r.date===localDay(1))).toHaveLength(3);
});
test('Ambiguous conflicting cards block import until one is removed',async({page})=>{
 await seeded(page,{today:0,tomorrow:0});
 await manager(page);
 await page.locator('#manifest-tomorrow').click();
 const duplicate='FAKE RIDER ALPHA | 8:15 AM | 999 Different Rd, Exampleville, NY 11111 | 11:20 AM | 998 Different St, Exampleville, NY 11111';
 await page.locator('#raw').fill(line(fixture[0],0)+'\n'+duplicate+'\n'+line(fixture[1],1));
 await page.locator('#preview').click();
 await expect(page.locator('#preview-box')).toContainText('1 possible match(es)');
 await expect(page.locator('#commit-reviewed')).toBeDisabled();
 await page.locator('button[data-remove-import-index="1"]').click();
 await expect(page.locator('#preview-box')).toContainText('2 unique ready');
 await page.locator('#reviewed-all').check();
 page.on('dialog',d=>d.accept());
 await page.locator('#commit-reviewed').click();
 expect((await db(page)).runs.filter(r=>r.date===localDay(1))).toHaveLength(2);
});

test('Import modal inherits service date selected on Overview',async({page})=>{
 await seeded(page,{today:7});
 await page.locator('#date').fill(localDay(1));
 await expect(page.locator('#v7-assigned')).toHaveText('0');
 await manager(page);
 await expect(page.locator('#import-date')).toHaveValue(localDay(1));
 await expect(page.locator('#manifest-date-count')).toContainText('0 saved runs');
});
