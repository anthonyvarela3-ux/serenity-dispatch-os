import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./tests',timeout:30000,expect:{timeout:8000},
 retries:0,workers:1,
 use:{baseURL:'http://127.0.0.1:4173',timezoneId:'America/New_York',
  viewport:{width:1366,height:850},screenshot:'only-on-failure',trace:'retain-on-failure'},
 webServer:{command:'python3 -m http.server 4173 --bind 127.0.0.1',url:'http://127.0.0.1:4173',
  reuseExistingServer:false,timeout:20000}
});
