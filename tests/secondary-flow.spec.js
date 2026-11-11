import { test, expect } from '@playwright/test';

async function fresh(page,withRun=false){
 await page.route('https://api.weather.gov/**',route=>route.abort('failed'));
 if(withRun)await page.addInitScript(()=>{
  const d=new Date(),pad=n=>String(n).padStart(2,'0');
  const today=[d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');
  localStorage.setItem('serenity_beta1_v1',JSON.stringify({
   version:1,runs:[{
    id:'patient-test',date:today,name:'TEST RIDER A',pu:'8:00 AM',du:'9:00 AM',
    puAddr:'100 Sample St, Testville, NY 11111',doAddr:'200 Sample Rd, Testville, NY 11111',
    miles:7,tariff:25,status:'Scheduled',events:{},sourcePhone:'5551234567',ready:false,notes:''
   }],people:{},active:null,shift:{start:null,end:null,rate:22.5},theme:'dark'
  }));
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#v7-overview')).toBeVisible();
}
async function openCustomer(page){
 await page.locator('#v7-navigation [data-v7-page="manifest"]').click();
 await page.locator('#v7-manifest button[data-v7-open="patient-test"]').click();
 await expect(page.locator('#customer')).toBeVisible();
}
const getDb=page=>page.evaluate(()=>{const value=localStorage.getItem('serenity_beta1_v1');return value?JSON.parse(value):{runs:[]};});

test('manual import requires explicit review, persists once, ignores exact duplicates',async({page})=>{
 await fresh(page);
 await page.locator('#v7-overview .v7-page-heading [data-v7-action="import"]').click();
 await expect(page.locator('#v7-utility')).toBeVisible();
 await page.locator('#raw').fill('TEST RIDER C | 11:00 AM | 500 Test Ave, Testville, NY 11111 | 11:45 AM | 600 Demo Rd, Testville, NY 11111');
 await page.locator('#preview').click();
 await expect(page.locator('#preview-box')).toContainText('1 new');
 await page.locator('#reviewed-all').check();
 page.on('dialog',d=>d.accept());
 await page.locator('#commit-reviewed').click();
 await expect(page.locator('#v7-manifest')).toBeVisible();
 expect((await getDb(page)).runs.length).toBe(1);
 await page.locator('#v7-navigation [data-v7-page="overview"]').click();
 await page.locator('#v7-overview .v7-page-heading [data-v7-action="import"]').click();
 await page.locator('#preview').click();
 await expect(page.locator('#preview-box')).toContainText('1 duplicate(s)');
 await expect(page.locator('#commit-reviewed')).toBeDisabled();
 expect((await getDb(page)).runs.length).toBe(1);
});

test('restore accepts valid JSON and rejects bad trip records without replacing data',async({page})=>{
 await fresh(page);
 const day=await page.locator('#date').inputValue();
 const valid={version:1,runs:[{id:'restored-1',date:day,name:'RESTORE TEST RIDER',
  pu:'1:00 PM',du:'1:30 PM',puAddr:'100 Test Ave',doAddr:'200 Test Ave',
  status:'Completed',events:{closed:new Date().toISOString()}}],
  people:{},active:null,shift:{start:null,end:null,rate:22.5},theme:'dark'};
 page.on('dialog',d=>d.accept());
 await page.locator('#restore').setInputFiles({name:'valid-backup.json',mimeType:'application/json',
  buffer:Buffer.from(JSON.stringify(valid))});
 await expect(page.locator('#v7-assigned')).toHaveText('1');
 expect((await getDb(page)).runs[0].id).toBe('restored-1');
 const broken={...valid,runs:[null]};
 await page.locator('#restore').setInputFiles({name:'invalid-backup.json',mimeType:'application/json',
  buffer:Buffer.from(JSON.stringify(broken))});
 expect((await getDb(page)).runs[0].id).toBe('restored-1');
});

test('Customer can save verified phone number, contact preference and trip notes',async({page})=>{
 await fresh(page,true);await openCustomer(page);
 await page.locator('.b3-detail summary').filter({hasText:'Contact & verified number'}).click();
 await page.locator('#edit-phone').fill('5559876543');
 await page.locator('#save-phone').click();
 await page.locator('.b3-detail summary').filter({hasText:'Contact & verified number'}).click();
 await page.locator('#preference').selectOption('No call');
 await page.locator('#save-pref').click();
 await page.locator('.b3-detail summary').filter({hasText:'Pickup intelligence & notes'}).click();
 await page.locator('#trip-notes').fill('Driver-only test note');
 await page.locator('#save-trip-notes').click();
 const db=await getDb(page);
 expect(db.people['TEST RIDER A'].phone).toBe('5559876543');
 expect(db.people['TEST RIDER A'].verified).toBe(true);
 expect(db.people['TEST RIDER A'].preference).toBe('No call');
 expect(db.runs[0].notes).toBe('Driver-only test note');
});

test('manifest selection and next-customer data remain in sync after status events',async({page})=>{
 await fresh(page,true);await openCustomer(page);
 await page.locator('#v7-customer-flow [data-v7-event="enroute"]').click();
 const db=await getDb(page);expect(db.runs[0].events.enroute).toBeTruthy();
 await page.locator('#v7-navigation [data-v7-page="manifest"]').click();
 await expect(page.locator('#v7-manifest-rows')).toContainText('En route');
 await page.locator('#v7-navigation [data-v7-page="overview"]').click();
 await expect(page.locator('#v7-next-content')).toContainText('TEST RIDER A');
});

test('Veterans Day and recorded light traffic are visible but never auto-discount ETAs',async({page})=>{
 await fresh(page,true);
 await page.locator('#date').fill('2026-11-11');
 await expect(page.locator('#v7-holiday-title')).toHaveText('Veterans Day');
 await page.locator('#v7-traffic').selectOption('light');
 await expect(page.locator('#v7-context-line')).toContainText('Lighter than usual');
 const db=await getDb(page);
 expect(db.dayObservations['2026-11-11'].traffic).toBe('light');
});

test('mocked NWS hourly weather appears on Overview without requiring customer data',async({page})=>{
 await page.route('https://api.weather.gov/points/**',route=>
  route.fulfill({status:200,contentType:'application/geo+json',
   body:JSON.stringify({properties:{forecastHourly:'https://api.weather.gov/gridpoints/QA/1,1/forecast/hourly'}})}));
 await page.route('https://api.weather.gov/gridpoints/**',route=>{
  const now=new Date();
  route.fulfill({status:200,contentType:'application/geo+json',
   body:JSON.stringify({properties:{periods:[{startTime:new Date(now.getTime()-60000).toISOString(),
    endTime:new Date(now.getTime()+3600000).toISOString(),temperature:57,temperatureUnit:'F',
    shortForecast:'Partly Cloudy',windSpeed:'5 mph',probabilityOfPrecipitation:{value:15}}]}})});
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#v7-overview')).toBeVisible();
 await expect(page.locator('#v7-weather-target #wx-temp')).toHaveText('57°F',{timeout:12000});
 await expect(page.locator('#v7-weather-target #wx-label')).toContainText('Partly Cloudy');
});

test('OCR can parse synthetic screenshot text, but only imports after rider-by-rider review',async({page})=>{
 await page.addInitScript(()=>{
  window.Tesseract={createWorker:async()=>({
   recognize:async()=>({data:{confidence:99,text:
    'TEST RIDER D\nPU 11:00 AM\n500 Example Ave, Testville, NY 11111\nDO 11:45 AM\n600 Example Rd, Testville, NY 11111'}}),
   terminate:async()=>{}
  })};
 });
 await fresh(page);
 await page.locator('#v7-overview .v7-page-heading [data-v7-action="import"]').click();
 await page.locator('#manifest-image').setInputFiles({name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10])});
 await page.locator('#read-ocr').click();
 await expect(page.locator('#preview-box')).toContainText('1 new',{timeout:12000});
 expect((await getDb(page)).runs.length).toBe(0);
 await page.locator('#reviewed-all').check();
 page.on('dialog',d=>d.accept());
 await page.locator('#commit-reviewed').click();
 expect((await getDb(page)).runs.length).toBe(1);
 expect((await getDb(page)).runs[0].name).toBe('TEST RIDER D');
});
