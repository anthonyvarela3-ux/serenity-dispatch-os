import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./tests',timeout:30000,expect:{timeout:8000},
 retries:0,workers:1,
 projects:[
  {name:'Chromium desktop',use:{browserName:'chromium',viewport:{width:1366,height:850}}},
  {name:'WebKit iPad landscape',use:{browserName:'webkit',
    viewport:{width:1194,height:834},deviceScaleFactor:2,isMobile:true,hasTouch:true}}
 ],
 use:{baseURL:'http://127.0.0.1:4173',timezoneId:'America/New_York',
  screenshot:'only-on-failure',trace:'retain-on-failure'},
 webServer:{command:'python3 -m http.server 4173 --bind 127.0.0.1',url:'http://127.0.0.1:4173',
  reuseExistingServer:false,timeout:20000}
});
