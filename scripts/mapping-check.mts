import {chromium,expect} from '@playwright/test';
import {testMembers,defaultSettings} from '../tests/fixtures';
import {mapAreasToPlan} from '../lib/mapping';
import {createRequire} from 'node:module';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const base=process.env.CHECK_BASE_URL||'http://localhost:3011';
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:844}});
const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
let trial:any=null,imports=0,applies=0;
await page.route('**/api/dashboard',r=>r.fulfill({json:{me:testMembers[0],members:testMembers,settings:defaultSettings,assignments:[],submissions:[],today:'2026-10-10'}}));
await page.route('**/api/onboarding',r=>{
  if(r.request().method()==='GET')return r.fulfill({json:{configured:false,trials:trial?[trial]:[]}});
  const body=r.request().postDataJSON();
  if(body.action==='import_map'){
    expect(body.points).toBeUndefined();expect(Object.keys(body).sort()).toEqual(['action','areas','duration']);
    imports++;trial={id:'test-map',created_at:new Date().toISOString(),status:'ready',frame_times:[0],applied_at:null,plan:mapAreasToPlan(body.areas,body.duration)};
    return r.fulfill({json:trial});
  }
  if(body.action==='apply')applies++;
  return r.fulfill({json:{ok:true,changed:0}});
});
try{
  await page.goto(base+'/app?view=setup',{waitUntil:'networkidle'});
  await page.getByText('Experimental 3D home mapping',{exact:true}).click();
  const input=page.getByLabel('Import 3D map file');
  await input.setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{}')});
  await expect(page.locator('.mapping-trial [role=alert]')).toBeVisible();
  const map={format:'housekeeping-map-v1',model:'lingbot-map',revision:'a'.repeat(40),duration:2,points:[[0,0,0,255,255,255],[1,1,1,0,255,255]],cameras:[{seconds:0,position:[0,0,0]},{seconds:1,position:[1,0,0]}],metrics:{inferenceSeconds:1,peakGpuMb:1,frames:2}};
  await input.setInputFiles({name:'unit-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(map))});
  await expect(page.locator('.mapping-trial canvas')).toBeVisible();
  await expect(page.getByRole('button',{name:'Create cleaning draft'})).toBeDisabled();
  await page.locator('.mapping-trial').getByLabel('Visible fixtures (comma separated)').fill('Sink, stove');
  await page.getByRole('button',{name:'Add labelled area'}).click();
  await page.getByRole('button',{name:'Create cleaning draft'}).click();
  await expect(page.getByRole('heading',{name:'Review your proposed setup'})).toBeVisible();
  expect(imports).toBe(1);expect(applies).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('.mapping-trial').screenshot({path:'.local/mapping-mobile.png'});
  expect((await page.request.post(base+'/api/onboarding',{headers:{Origin:new URL(process.env.APP_URL||base).origin},data:{action:'import_map',areas:[],duration:2}})).status()).toBe(401);
  expect(errors).toEqual([]);
  console.log('Map import, invalid-file handling, mobile canvas, labels-only draft, explicit review and anonymous API denial passed. Synthetic geometry tests UI only; no model benchmark claim.');
}finally{await browser.close();}
