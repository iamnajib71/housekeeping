import { chromium,expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { defaultSettings,testMembers } from '../tests/fixtures';
import { weeklyTaskPlan,formatDate } from '../lib/schedule';
import type { Assignment,Submission } from '../lib/types';
const base=process.env.CHECK_BASE_URL||'http://localhost:3007';
const members=testMembers.map((m,i)=>({...m,name:i===0?'Najib':i===5?'Zarif':m.name}));
const assignment:Assignment={id:'weekly-2026-10-05',date:'2026-10-05',kind:'weekly',member_ids:[members[0].id,members[5].id],tasks:defaultSettings.weekly_tasks};
const future:Assignment={id:'daily-2026-10-09',date:'2026-10-09',kind:'daily',member_ids:[members[0].id],tasks:defaultSettings.daily_tasks};
const plan=weeklyTaskPlan(assignment,[assignment,future],[]);
let own:Submission|undefined={id:'test-sub',assignment_id:assignment.id,member_id:members[0].id,tasks:plan[members[0].id],notes:'',status:'submitted',submitted_at:'2026-10-05T02:37:58Z',review_note:'',task_feedback:[]};
let partner:Submission|undefined;
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:844}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/dashboard',r=>r.fulfill({json:{me:members[0],members,settings:defaultSettings,assignments:[assignment,future],submissions:[own,partner].filter(Boolean),today:'2026-10-05'}}));
await page.route('**/api/assignments/*',r=>r.fulfill({json:{submissions:[own,partner].filter(Boolean),photos:[]}}));
try{
 await page.goto(base+'/app',{waitUntil:'networkidle'});const card=page.locator('.your-turn');
 await expect(card.getByText('Your part submitted',{exact:true})).toBeVisible();await expect(card.getByText('Zarif’s part is still pending.')).toBeVisible();await expect(card.locator('.empty-check.completed')).toHaveCount(4);await expect(card.getByRole('button',{name:'Open my task',exact:true})).toHaveCount(0);
 await expect(page.locator('.stat-card').first().locator('b')).toHaveText(formatDate(future.date,{weekday:'short',day:'numeric',month:'short'}));
 await card.getByRole('button',{name:'View my submission'}).click();await expect(page.getByRole('dialog').getByRole('heading',{name:'Najib’s submission'})).toBeVisible();await page.getByRole('button',{name:'Close task',exact:true}).click();
 await mkdir('.local',{recursive:true});await page.screenshot({path:'.local/submitted-overview.png'});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Overview overflows on mobile');
 partner={...own!,id:'partner-sub',member_id:members[5].id,tasks:plan[members[5].id]};await page.reload({waitUntil:'networkidle'});await expect(card.getByText('Zarif’s part is submitted.')).toBeVisible();await expect(card.locator('.empty-check.completed')).toHaveCount(4);
 own={...own!,status:'approved'};await page.reload({waitUntil:'networkidle'});await expect(card.getByText('Approved',{exact:true})).toBeVisible();await expect(card.getByRole('button',{name:'View my submission'})).toBeVisible();
 const missing=own.tasks[1];own={...own,status:'rework',task_feedback:own.tasks.map(task=>({task,status:task===missing?'rework':'approved',note:task===missing?'Please finish this area.':''}))};await page.reload({waitUntil:'networkidle'});await expect(card.getByText('Tasks to fix',{exact:true})).toBeVisible();await expect(card.locator('.empty-check.completed')).toHaveCount(3);await expect(card.getByRole('img',{name:missing+' not submitted',exact:true})).toBeVisible();await expect(card.getByRole('button',{name:'Fix & resubmit'})).toBeVisible();
 own=undefined;await page.reload({waitUntil:'networkidle'});await expect(card.getByText('Due today',{exact:true})).toBeVisible();await expect(card.locator('.empty-check.completed')).toHaveCount(0);await expect(card.getByRole('button',{name:'Open my task',exact:true})).toBeVisible();
 if(errors.length)throw new Error(errors.join('; '));console.log('Personal submitted checkmarks, pending partner, next-turn date, saved submission access, approvals, targeted rework and mobile layout passed.');
}finally{await browser.close();}
