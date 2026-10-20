import {chromium,expect} from '@playwright/test';
import {defaultSettings,testMembers} from '../tests/fixtures';
import {generateSchedule} from '../lib/schedule';
import type {Member} from '../lib/types';

const base=process.env.CHECK_BASE_URL||'http://localhost:3011';
const assignments=generateSchedule(testMembers,defaultSettings,'2026-10-19','2026-11-08');
let today='2026-10-20',stamp=today+'T02:00:00Z',me:Member=testMembers[0];
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors:string[]=[],writes:string[]=[];
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>localStorage.setItem('housekeeping-phone-later',String(Date.now()+86400000)));
await page.route('**/api/dashboard',r=>r.fulfill({json:{me:{...me,guide_completed:true},members:testMembers,settings:defaultSettings,assignments,submissions:[],today,server_now:stamp}}));
await page.route('**/api/account',r=>r.fulfill({json:{ok:true,homes:[]}}));
await page.route('**/api/push',r=>r.fulfill({json:{publicKey:null,userId:null}}));
await page.route('**/api/assignments/*',r=>{if(r.request().method()!=='GET')writes.push(r.request().method());return r.fulfill({json:{submissions:[],photos:[]}});});
async function openDay(date:string){
 today=date;stamp=date+'T02:00:00Z';me=testMembers.find(m=>m.id===assignments.find(a=>a.date===date)!.member_ids[0])!;
 await page.clock.setFixedTime(new Date(stamp));
 await page.goto(base+'/app',{waitUntil:'networkidle'});
 await expect(page.locator('.bin-banner,.week-bin-strip')).toHaveCount(0);
}
async function fits(){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
try{
 for(const theme of ['light','dark']){
  await page.addInitScript(value=>localStorage.setItem('housekeeping-theme',value),theme);
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:900});
   await openDay('2026-10-20');
   const highlighted=page.locator('.task-list > .collection-duty');
   await expect(highlighted).toHaveCount(1);
   await expect(highlighted).toContainText('Put collection bins out Tuesday night: Red lid, Green lid, Yellow lid');
   await expect(highlighted.locator('svg.collection-task-icon')).toHaveAttribute('aria-hidden','true');
   expect(await highlighted.evaluate(el=>getComputedStyle(el).borderLeftWidth)).toBe('4px');
   await fits();
   await page.getByRole('button',{name:'Open my task',exact:true}).click();
   const row=page.getByRole('dialog').locator('.checklist label.collection-duty');
   await expect(row).toHaveCount(1);
   await row.scrollIntoViewIfNeeded();
   await page.screenshot({path:`.local/tuesday-bin-duty-${theme}-${width}.png`});
   const checkbox=row.getByRole('checkbox',{name:/Put collection bins out Tuesday night:/});
   await checkbox.check();await expect(checkbox).toBeChecked();
   await page.screenshot({path:`.local/tuesday-bin-checklist-${theme}-${width}.png`});
   await page.getByRole('button',{name:'Close task',exact:true}).click();

   await openDay('2026-10-21');
   await expect(page.locator('.task-list > .collection-duty')).toHaveCount(0);
   if(width<=700)await page.getByRole('button',{name:'More navigation'}).click();
   await page.locator('.sidebar').getByRole('button',{name:'Cleaning schedule',exact:true}).click();
   await expect(page.locator('.week-bin-strip')).toHaveCount(0);
   await page.getByLabel('Jump to schedule date').fill('2026-10-27');
   await page.locator('.assignment-row').filter({has:page.locator('.date-square b',{hasText:/^27$/})}).click();
   const future=page.getByRole('region',{name:'Assigned duties'}).locator('li.collection-duty');
   await expect(future).toHaveCount(1);await expect(future).toContainText('Purple lid');
   await page.getByRole('button',{name:'Close task',exact:true}).click();
   await fits();
  }
 }
 await page.setViewportSize({width:390,height:844});
 for(const date of ['2026-10-19','2026-10-21','2026-10-22','2026-10-23','2026-10-24','2026-10-25']){
  await openDay(date);await expect(page.locator('.task-list > .collection-duty')).toHaveCount(0);
 }
 expect(errors).toEqual([]);expect(writes).toEqual([]);
 console.log('Tuesday bin duty passed: highlighted dashboard and usable checkbox, accessible bin icon, correct weekly lids, future Tuesday preview, no collection notices on other tasks or global pages, mobile/desktop and both themes. No writes.');
}finally{await browser.close();}
