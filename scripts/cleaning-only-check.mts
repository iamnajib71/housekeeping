import {chromium,expect} from '@playwright/test';
import {defaultSettings,testMembers} from '../tests/fixtures';
import {generateSchedule} from '../lib/schedule';
const base=process.env.CHECK_BASE_URL||'http://localhost:3011';
const today='2026-11-18',members=testMembers.map(m=>({...m,guide_completed:true}));
const assignments=generateSchedule(members,defaultSettings,'2026-11-16','2026-12-06');
const browser=await chromium.launch();
const page=await browser.newPage({reducedMotion:'reduce'});
const errors:string[]=[],retiredCalls:string[]=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{if(/\/api\/(meals|push)(?:\?|$)/.test(r.url()))retiredCalls.push(r.url());});
await page.route('**/api/dashboard',r=>r.fulfill({json:{me:members[0],members,settings:defaultSettings,assignments,submissions:[],today,server_now:today+'T02:00:00Z'}}));
await page.route('**/api/account',r=>r.fulfill({json:{homes:[]}}));
await page.route('**/api/onboarding',r=>r.fulfill({json:{configured:true,trials:[]}}));
try{
 for(const theme of ['light','dark']){
  await page.addInitScript(value=>localStorage.setItem('housekeeping-theme',value),theme);
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:900});
   await page.goto(base+'/app?view=meals&meal=old-group',{waitUntil:'networkidle'});
   await expect(page.getByRole('heading',{name:'Today at home',exact:true})).toBeVisible();
   await expect(page).not.toHaveURL(/view=meals|meal=old-group/);
   await expect(page.getByRole('button',{name:/^(Meals|Shared meals)$/})).toHaveCount(0);
   await expect(page.locator('.meal-workspace')).toHaveCount(0);
   await expect(page.locator('.phone-setup-card')).toHaveCount(0);
   await page.getByRole('button',{name:'Add app to Home Screen'}).click();
   await expect(page.locator('.phone-setup-card')).toContainText('10pm');
   await expect(page.getByRole('button',{name:/Enable|Send test/})).toHaveCount(0);
   await page.getByRole('button',{name:'Close phone setup',exact:true}).click();
   if(width<=700){
    await page.getByRole('navigation',{name:'Quick navigation'}).getByRole('button',{name:'History',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Cleaning history',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'More navigation'}).click();
   }
   await page.locator('.sidebar').getByRole('button',{name:'Household settings',exact:true}).click();
   await expect(page.getByRole('combobox',{name:'Morning assignment email',exact:true})).toBeVisible();
   await expect(page.getByText('Day-before reminder',{exact:true})).toHaveCount(0);
   await expect(page.getByText(/One assignment email in the morning/)).toContainText('10pm');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:`.local/cleaning-only-${theme}-${width}.png`,fullPage:true});
  }
 }
 expect(errors).toEqual([]);expect(retiredCalls).toEqual([]);
 for(const method of ['GET','POST']){
  const response=await page.request.fetch(base+'/api/meals',{method});
  expect(response.status()).toBe(410);expect(response.headers()['cache-control']).toContain('no-store');
  expect(await response.json()).toHaveProperty('error');
 }
 console.log('Cleaning-only checks passed: no Meals or automatic prompts/API calls, legacy links open Today, mobile History navigation, quieter settings, on-demand install, retired GET/POST return 410; 320/390/1440px and both themes. No notifications sent.');
}finally{await browser.close();}
