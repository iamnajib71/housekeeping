import { chromium, expect } from '@playwright/test';
import { generateSchedule, weeklyTaskPlan } from '../lib/schedule';
import { MONDAY_BIN_TASK } from '../lib/weekly-bins';
import { defaultSettings, testMembers } from '../tests/fixtures';

const base=process.env.CHECK_BASE_URL||'http://localhost:3009';
const today='2026-10-19', assignments=generateSchedule(testMembers,defaultSettings,'2026-10-05','2026-11-02');
const monday=assignments.find(a=>a.date===today)!;
const plan=weeklyTaskPlan(monday,assignments,[]);
const owner=testMembers.find(m=>plan[m.id]?.includes(MONDAY_BIN_TASK))!;
let me=owner;
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:844}});
const errors:string[]=[],writes:string[]=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/dashboard',r=>r.fulfill({json:{me,members:testMembers,settings:defaultSettings,assignments,submissions:[],today}}));
await page.route('**/api/assignments/*',r=>{if(r.request().method()!=='GET')writes.push(r.request().method());return r.fulfill({json:{submissions:[],photos:[]}});});
try{
  for(const id of monday.member_ids){
    me=testMembers.find(m=>m.id===id)!;
    await page.goto(base+'/app',{waitUntil:'networkidle'});
    const summary=page.locator('.deep-summary');
    await expect(summary.getByLabel('Monday bin responsibility')).toContainText(`Changing the household bins: ${owner.name}`);
    await expect(summary.locator('.area').filter({hasText:'Bins'})).toContainText(`Assigned to ${owner.name}`);
    await page.getByRole('button',{name:'Open my task',exact:true}).click();
    const dialog=page.getByRole('dialog');
    await expect(dialog.getByLabel('Monday bin responsibility')).toContainText(owner.name);
    await expect(dialog.getByRole('checkbox',{name:MONDAY_BIN_TASK,exact:true})).toHaveCount(id===owner.id?1:0);
    if(id===owner.id){
      await dialog.getByRole('checkbox',{name:MONDAY_BIN_TASK,exact:true}).check();
      await expect(dialog.getByRole('checkbox',{name:MONDAY_BIN_TASK,exact:true})).toBeChecked();
      await page.screenshot({path:'.local/monday-bins-mobile.png'});
    }
    await page.getByRole('button',{name:'Close task',exact:true}).click();
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Monday bin responsibility overflows on mobile');
  }
  me=testMembers.find(m=>!monday.member_ids.includes(m.id))!;
  await page.goto(base+'/app',{waitUntil:'networkidle'});
  const summary=page.locator('.deep-summary');
  await expect(summary.getByLabel('Monday bin responsibility')).toContainText(owner.name);
  await summary.getByRole('button',{name:'View clean'}).click();
  await expect(page.getByRole('dialog').getByLabel('Monday bin responsibility')).toContainText(owner.name);
  await expect(page.getByRole('region',{name:'Assigned duties'}).locator('.assigned-duty-group').filter({hasText:owner.name})).toContainText(MONDAY_BIN_TASK);
  if(errors.length||writes.length)throw new Error(JSON.stringify({errors,writes}));
  console.log('Monday bin owner visible to both cleaners and another housemate; only owner gets bin checkbox; mobile layout and no writes passed.');
}finally{await browser.close();}
