import { test, expect } from '@playwright/test';

const todayAtBrowser=page=>page.evaluate(()=>{
 const d=new Date();
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
});
test('compact manifest combines office pickup + ETA, prioritizes DO ETA over MAS, and shows running lateness',async({page})=>{
 // Freeze the local driving clock: ETA propagation should be reproducible.
 await page.clock.install({time:new Date('2026-11-12T08:26:00-05:00')});
 await page.route('https://api.weather.gov/**',r=>r.abort('failed'));
 await page.addInitScript(()=>{
  const date='2026-11-12';
  const runs=[
   {id:'a',date,name:'SYNTHETIC A',pu:'8:00 AM',du:'9:00 AM',
    puAddr:'101 Test Street, Exampleville, NY 11111',doAddr:'201 Test Street, Exampleville, NY 11111',
    status:'Arrived',events:{arrived:'2026-11-12T08:25:00-05:00'}},
   {id:'b',date,name:'SYNTHETIC B',pu:'8:30 AM',du:'10:00 AM',
    puAddr:'301 Test Street, Exampleville, NY 11111',doAddr:'401 Test Street, Exampleville, NY 11111',
    status:'Scheduled',events:{}}
  ];
  localStorage.setItem('serenity_beta1_v1',JSON.stringify({
   version:1,runs,people:{},active:null,shift:{start:null,end:null,rate:22.5},
   theme:'dark',forecastV4:{reposition:15,trip:20,buffer:5},
   morningConfig:{garage:'TEST BASE',returnBase:20}
  }));
 });
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.locator('#v7-navigation [data-v7-page="manifest"]').click();
 const table=page.locator('.v10-compact-manifest');
 await expect(table).toBeVisible();
 await expect(table.locator('thead th')).toHaveCount(5);
 const row1=page.locator('#v7-manifest-rows tr').nth(0);
 await expect(row1).toContainText('Scheduled 8:00 AM');
 await expect(row1).toContainText('Actual 8:25 AM');
 await expect(row1).toContainText('ETA DO');
 await expect(row1).toContainText('MAS DO 9:00 AM · reference only');
 await expect(row1).toContainText('+25m BEHIND');
 await expect(page.locator('#v10-drift-strip')).toContainText('Running 25m BEHIND');
 await expect(page.locator('#v10-drift-strip')).toContainText('combined projected lateness');
 const row2=page.locator('#v7-manifest-rows tr').nth(1);
 await expect(row2).toContainText('Scheduled 8:30 AM');
 await expect(row2).toContainText('Serenity model · not live GPS');
 await expect(row2).toContainText('MAS DO 10:00 AM · reference only');
 await expect(row2).toContainText('BEHIND');
 await expect(page.locator('.v7-table-foot')).toContainText('Live GPS traffic ETAs are not connected');
});

test('NWS morning, afternoon, evening cards use forecast for the selected service date',async({page})=>{
 await page.route('https://api.weather.gov/points/**',route=>route.fulfill({
  status:200,contentType:'application/geo+json',
  body:JSON.stringify({properties:{forecastHourly:'https://api.weather.gov/gridpoints/QA/2,2/forecast/hourly'}})
 }));
 await page.route('https://api.weather.gov/gridpoints/**',route=>{
  const d=new Date();
  const local=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1);
  const mk=(hour,temperature,shortForecast,rain)=>({
   startTime:new Date(local.getFullYear(),local.getMonth(),local.getDate(),hour).toISOString(),
   endTime:new Date(local.getFullYear(),local.getMonth(),local.getDate(),hour+1).toISOString(),
   temperature,temperatureUnit:'F',shortForecast,windSpeed:'6 mph',
   probabilityOfPrecipitation:{value:rain}
  });
  route.fulfill({status:200,contentType:'application/geo+json',
   body:JSON.stringify({properties:{periods:[
    mk(8,45,'Sunny',5),mk(9,47,'Sunny',7),
    mk(13,65,'Cloudy',25),mk(14,63,'Cloudy',35),
    mk(19,51,'Showers',70),mk(20,49,'Showers',80)
   ]}})});
 });
 await page.route('https://api.weather.gov/alerts/**',route=>route.fulfill({
  status:200,contentType:'application/geo+json',body:JSON.stringify({features:[]})
 }));
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const date=await todayAtBrowser(page);
 const next=await page.evaluate(()=>{
  const d=new Date();d.setDate(d.getDate()+1);
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
 });
 await page.locator('#date').fill(next);
 const tiles=page.locator('#v10-dayparts .v10-daypart');
 await expect(tiles).toHaveCount(3);
 await expect(tiles.nth(0)).toContainText('Morning');
 await expect(tiles.nth(0)).toContainText('45–47°F');
 await expect(tiles.nth(1)).toContainText('Afternoon');
 await expect(tiles.nth(1)).toContainText('63–65°F');
 await expect(tiles.nth(2)).toContainText('Evening');
 await expect(tiles.nth(2)).toContainText('49–51°F');
 await expect(tiles.nth(2)).toContainText('Rain up to 80%');
 await page.locator('#date').fill(date);
 await expect(tiles.nth(0)).toContainText('No NWS hourly forecast for this period');
});

test('weather periods show no invented estimates when outside available NWS window',async({page})=>{
 await page.route('https://api.weather.gov/**',r=>r.abort('failed'));
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#v10-dayparts .v10-daypart')).toHaveCount(3);
 await expect(page.locator('#v10-dayparts')).toContainText('No NWS hourly forecast');
 await expect(page.locator('#v10-dayparts')).toContainText('Not estimated');
});
