import {chromium,expect} from '@playwright/test';
import {testMembers,defaultSettings} from '../tests/fixtures';
import {generateSchedule} from '../lib/schedule';
const base=process.env.CHECK_BASE_URL||'http://localhost:3011';
const today='2026-11-18',target=testMembers[5].id;
let members=testMembers.map(m=>({...m,guide_completed:true,away_from:null as string|null,away_until:null as string|null})),me=members[0],posts:any[]=[];
const browser=await chromium.launch(),page=await browser.newPage({reducedMotion:'reduce'}),errors:string[]=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/dashboard',r=>r.fulfill({json:{me,members,settings:defaultSettings,assignments:generateSchedule(members,defaultSettings,'2026-11-16','2027-02-16'),submissions:[],today,server_now:today+'T02:00:00Z'}}));
await page.route('**/api/account',r=>r.fulfill({json:{homes:[]}}));
await page.route('**/api/admin',r=>{
 const body=r.request().postDataJSON();posts.push(body);
 if(body.action!=='availability'||body.id!==target)throw Error('Unexpected write');
 members=members.map(m=>m.id===target?{...m,away_from:body.back?null:body.from,away_until:null}:m);
 return r.fulfill({json:{changed:30,protected:0}});
});
async function household(width:number){if(width<=700)await page.getByRole('button',{name:'More navigation'}).click();await page.locator('.sidebar').getByRole('button',{name:'Our household',exact:true}).click();}
try{
 for(const theme of ['light','dark']){
  await page.addInitScript(t=>localStorage.setItem('housekeeping-theme',t),theme);
  for(const width of [320,390,1440]){
   members=members.map(m=>({...m,away_from:null,away_until:null}));me=members[0];posts=[];
   await page.setViewportSize({width,height:900});await page.goto(base+'/app',{waitUntil:'networkidle'});await household(width);
   const card=page.locator('.member-card').filter({has:page.getByRole('heading',{name:members[5].name,exact:true})});
   await card.locator('summary').click();
   await card.getByLabel('Away from for '+members[5].name).fill('2026-11-20');
   await card.getByRole('button',{name:'Save absence',exact:true}).click();
   await expect(card).toContainText('Away from Fri, 20 Nov');
   await expect(card).toContainText('Until marked back by an admin');
   await expect(card.getByRole('button',{name:'Cancel planned absence'})).toBeVisible();
   expect(posts).toEqual([{action:'availability',id:target,from:'2026-11-20'}]);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:`.local/member-absence-${theme}-${width}.png`,fullPage:true});
   await card.getByRole('button',{name:'Cancel planned absence'}).click();
   await expect(card.locator('summary')).toBeVisible();
   expect(posts[1]).toEqual({action:'availability',id:target,back:true});
  }
 }
 // Current absence exposes the simple manual return button; tenants only see status.
 members=members.map(m=>m.id===target?{...m,away_from:'2026-11-17',away_until:null}:m);
 await page.goto(base+'/app',{waitUntil:'networkidle'});await household(1440);
 const card=page.locator('.member-card').filter({has:page.getByRole('heading',{name:members[5].name,exact:true})});
 await expect(card.getByRole('button',{name:'Mark back today'})).toBeVisible();
 me=members[1];await page.goto(base+'/app',{waitUntil:'networkidle'});await household(1440);
 await expect(page.getByText('Away since Tue, 17 Nov')).toBeVisible();
 await expect(page.getByRole('button',{name:'Mark back today'})).toHaveCount(0);
 await expect(page.getByText('Plan time away',{exact:true})).toHaveCount(0);
 expect(errors).toEqual([]);
 console.log('Availability UI passed: planned absence, date boundary, compact manual return/cancel, regenerated fixtures, admin-only actions, visible member status, 320/390/1440px and both themes. All writes mocked.');
}finally{await browser.close();}
