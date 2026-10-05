import { chromium, expect } from '@playwright/test';
import { defaultSettings, testMembers } from '../tests/fixtures';
import { generateSchedule, weeklyTaskPlan } from '../lib/schedule';
const base=process.env.CHECK_BASE_URL||'http://localhost:3009';
const today='2026-10-05',assignments=generateSchedule(testMembers,defaultSettings,today,'2027-01-03');
const browser=await chromium.launch(),page=await browser.newPage();
let me=testMembers[0];const errors:string[]=[],writes:string[]=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/dashboard',r=>r.fulfill({json:{me,members:testMembers,settings:defaultSettings,assignments,submissions:[],today}}));
await page.route('**/api/assignments/*',r=>{if(r.request().method()!=='GET')writes.push(r.request().method());return r.fulfill({json:{submissions:[],photos:[]}});});
async function openSchedule(){await page.getByRole('button',{name:'Cleaning schedule',exact:true}).click();}
async function checkFutureWeekly(){
 await page.getByLabel('Jump to schedule date').fill('2026-10-12');
 const weekly=assignments.find(a=>a.id==='weekly-2026-10-12')!;
 await page.locator('.assignment-row').filter({hasText:'The Monday deep clean'}).click();
 const preview=page.getByRole('region',{name:'Assigned duties'}),plan=weeklyTaskPlan(weekly,assignments,[]);
 await expect(preview).toBeVisible();
 for(const id of weekly.member_ids){const group=preview.locator('.assigned-duty-group').filter({has:page.getByRole('heading',{name:new RegExp(testMembers.find(m=>m.id===id)!.name)})});await expect(group.locator('li')).toHaveText(plan[id]);}
 await expect(page.getByRole('dialog').getByRole('checkbox')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Submit my clean',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Close task',exact:true}).click();
}
try{
 await page.goto(base+'/app',{waitUntil:'networkidle'});
 await page.getByLabel('Deep-clean date').selectOption('2026-10-12');
 const summary=page.locator('.deep-summary');await expect(summary.locator('p')).toContainText('12 Oct');
 await expect(summary.locator('.area small').filter({hasText:'Assigned to'})).toHaveCount(defaultSettings.weekly_tasks.length);
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>page.locator('.sidebar').evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Monday selector overflows on mobile');
 await summary.scrollIntoViewIfNeeded();await page.screenshot({path:'.local/future-monday-overview.png'});await page.setViewportSize({width:1280,height:720});
 await summary.getByRole('button',{name:'View clean'}).click();await expect(page.getByRole('region',{name:'Assigned duties'})).toBeVisible();await page.getByRole('button',{name:'Close task',exact:true}).click();
 await openSchedule();await checkFutureWeekly();
 // The next Monday belongs to other housemates; both sets must remain visible.
 me=testMembers.find(m=>m.id===assignments.find(a=>a.id==='weekly-2026-10-12')!.member_ids[0])!;await page.reload({waitUntil:'networkidle'});await openSchedule();await checkFutureWeekly();
 await page.getByLabel('Jump to schedule date').fill('2026-11-11');
 const daily=assignments.find(a=>a.date==='2026-11-11')!;
 await page.locator('.assignment-row').filter({has:page.locator('.date-square b',{hasText:'11'})}).click();
 await expect(page.getByRole('region',{name:'Assigned duties'}).locator('li')).toHaveText(daily.tasks);
 await page.getByRole('button',{name:'Close task',exact:true}).click();
 await page.getByLabel('Jump to schedule date').fill('2026-10-06');
 const tuesday=assignments.find(a=>a.date==='2026-10-06')!;
 await page.locator('.assignment-row').filter({has:page.locator('.date-square b',{hasText:'6',exact:true})}).click();
 await expect(page.getByRole('region',{name:'Assigned duties'}).locator('li')).toHaveText(tuesday.tasks);
 await expect(page.getByRole('dialog')).toContainText('Put collection bins out Tuesday night: Red lid, Green lid, Yellow lid');
 await page.getByRole('button',{name:'Close task',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Schedule overflows on mobile');
 await page.screenshot({path:'.local/future-schedule-mobile.png'});
 if(errors.length||writes.length)throw new Error(JSON.stringify({errors,writes}));
 console.log('Dashboard Monday selector, Tuesday bin duties, future daily duties, both Monday shares, assigned and unassigned viewers, date jumps, no future edits, and mobile layout passed.');
}finally{await browser.close();}
