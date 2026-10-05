import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { detectVideoCleaningPlan } from '../lib/onboarding-ai';
import { beginVideoUpload, getVideoFile, deleteVideoFile, VIDEO_CHUNK_BYTES } from '../lib/cloud-video';
import { relayVideoChunk, clearVideoBuffer, WALKTHROUGH_BUCKET } from '../lib/video-relay';
import { CleaningPlan, planChecklists } from '../lib/onboarding';
import { defaultSettings, testMembers } from '../tests/fixtures';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const base=process.env.CHECK_BASE_URL||'http://localhost:3007',realVideo=process.env.WALKTHROUGH_VIDEO;
if(realVideo&&process.env.WALKTHROUGH_APPROVED!=='true')throw new Error('Explicit approval to send this private video to Google is required.');
const db=realVideo?createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}}):null;
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:844}});
const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
let settings={...defaultSettings,cleaning_areas:['Kitchen','Oven','Stove','Toilet','Bathroom','Common Space','Lounge room','Laundry']};
let plan:CleaningPlan={areas:[{name:'Kitchen',fixtures:['Sink','Stove'],daily:['Wipe benches'],weekly:['Clean the oven'],frameIndex:null,seconds:.4,confidence:'high'}],unseenAreas:['Bathroom'],notes:'Confirm areas not shown.'};
let trial:any=null,saves=0,applies=0,uploadSize=0,offset=0,uploadUrl='',providerFile:any=null;
await page.route('**/api/dashboard',r=>r.fulfill({json:{me:testMembers[0],members:testMembers,settings,assignments:[],submissions:[],today:'2026-10-05'}}));
await page.route('**/api/onboarding/*/upload',async route=>{
  try{
    const bytes=route.request().postDataBuffer()!;expect(bytes.length).toBeLessThanOrEqual(VIDEO_CHUNK_BYTES);expect(Number(route.request().headers()['x-upload-offset'])).toBe(offset);
    const final=offset+bytes.length===uploadSize;if(db){const relayed=await relayVideoChunk(db,{id:trial.id,upload_url:uploadUrl,upload_size:uploadSize},bytes,offset);providerFile=relayed.file||providerFile;if(relayed.paths.length){const {error}=await db.storage.from(WALKTHROUGH_BUCKET).remove(relayed.paths);if(error)throw error;}}
    offset+=bytes.length;if(final)trial.status='processing';await route.fulfill({json:{nextOffset:offset,processing:final}});
  }catch(e){await route.fulfill({status:400,json:{error:(e as Error).message}});}
});
await page.route('**/api/onboarding',async route=>{
  try{
    if(route.request().method()==='GET')return route.fulfill({json:{configured:true,trials:trial?[trial]:[]}});
    const body=route.request().postDataJSON();
    if(body.action==='start_video'){
      expect(body.consent).toBe(true);uploadSize=body.size;offset=0;trial={id:randomUUID(),status:'uploading',created_at:new Date().toISOString(),frame_times:[],plan:null,applied_at:null};
      if(realVideo)uploadUrl=await beginVideoUpload(process.env.GEMINI_API_KEY!,body.size,body.mimeType,trial.id);return route.fulfill({json:trial});
    }
    if(body.action==='analyse_video'){
      if(realVideo){const file=await getVideoFile(process.env.GEMINI_API_KEY!,providerFile.name);if(file.state==='PROCESSING')return route.fulfill({json:{processing:true}});if(file.state!=='ACTIVE')throw new Error('Google could not process this recording.');
        plan=await detectVideoCleaningPlan(file.uri,file.mimeType||'video/mp4',process.env.GEMINI_API_KEY!,process.env.GEMINI_MODEL||'gemini-2.5-flash');await mkdir('.local',{recursive:true});await writeFile('.local/walkthrough-test-result.json',JSON.stringify(plan,null,2));
        console.log('Real-video areas: '+plan.areas.map(a=>a.name).join(', '));console.log('Daily duties: '+plan.areas.reduce((n,a)=>n+a.daily.length,0)+'; weekly duties: '+plan.areas.reduce((n,a)=>n+a.weekly.length,0));await deleteVideoFile(process.env.GEMINI_API_KEY!,file.name);providerFile=null;}
      trial={...trial,status:'ready',plan};return route.fulfill({json:trial});
    }
    trial={...trial,plan:body.plan};saves++;if(body.action==='apply'){applies++;const lists=planChecklists(body.plan);settings={...settings,daily_tasks:lists.daily,weekly_tasks:lists.weekly,cleaning_areas:lists.areas};trial.applied_at=new Date().toISOString();}return route.fulfill({json:{ok:true,changed:2}});
  }catch(e){await route.fulfill({status:400,json:{error:(e as Error).message}});}
});
try {
  await page.goto(base+'/app?view=setup',{waitUntil:'networkidle'});await expect(page.getByRole('heading',{name:'Set up your home from a walkthrough'})).toBeVisible();
  if(realVideo)await page.locator('input[type=file][accept="video/*"]').first().setInputFiles(realVideo);
  else {const bytes=await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=320;c.height=240;const ctx=c.getContext('2d')!;ctx.fillStyle='#dce9ff';ctx.fillRect(0,0,c.width,c.height);const stream=c.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),chunks:BlobPart[]=[];
    const timer=setInterval(()=>{ctx.fillStyle=Math.random()>.5?'#dce9ff':'#edf3ff';ctx.fillRect(0,0,c.width,c.height);},80);const data=await new Promise<Blob>(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>resolve(new Blob(chunks,{type:'video/webm'}));recorder.start();setTimeout(()=>recorder.stop(),1200);});clearInterval(timer);stream.getTracks().forEach(t=>t.stop());return Array.from(new Uint8Array(await data.arrayBuffer()));});await page.locator('input[type=file][accept="video/*"]').first().setInputFiles({name:'test.webm',mimeType:'video/webm',buffer:Buffer.from(bytes)});}
  await expect(page.getByRole('heading',{name:'Walkthrough ready to upload'})).toBeVisible();await expect(page.getByRole('button',{name:'Analyse walkthrough'})).toBeDisabled();await page.getByRole('checkbox',{name:/Send this video/}).check();await page.getByRole('button',{name:'Analyse walkthrough'}).click();
  await expect(page.getByRole('heading',{name:'Review your proposed setup'})).toBeVisible({timeout:realVideo?300000:15000});expect(plan.areas.length).toBeGreaterThan(0);expect(offset).toBe(uploadSize);
  await page.getByLabel('Area name',{exact:true}).first().fill('Trial area');await page.getByRole('button',{name:'Save trial draft',exact:true}).click();await expect(page.getByText('Trial draft saved. The active cleaning setup has not changed.')).toBeVisible();expect(applies).toBe(0);
  await page.getByRole('button',{name:'Preview replacement'}).click();await expect(page.getByRole('heading',{name:'Replace the current setup?'})).toBeVisible();await mkdir('.local',{recursive:true});await page.screenshot({path:'.local/onboarding-mobile.png'});if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw new Error('Onboarding page overflows on mobile');
  await page.getByRole('button',{name:'Confirm & replace setup'}).click();await expect(page.getByText(/Setup replaced across the app/)).toBeVisible();expect(applies).toBe(1);expect(saves).toBe(2);await expect(page.locator('.settings-grid textarea').first()).toHaveValue(settings.daily_tasks.join('\n'));
  await page.reload({waitUntil:'networkidle'});await page.getByLabel('Saved trial drafts',{exact:true}).selectOption(trial.id);await expect(page.getByLabel('Area name',{exact:true}).first()).toHaveValue('Trial area');await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('button',{name:'Overview',exact:true}).click();await expect(page.locator('.deep-summary .area b').first()).toHaveText('Trial area');
  if(errors.length)throw new Error(errors.join('; '));expect((await page.request.get(base+'/api/onboarding')).status()).toBe(401);console.log('Cloud upload, consent, editable draft, explicit replacement, draft recovery, area summary, mobile layout and private API passed.');
}finally{if(db&&trial)await clearVideoBuffer(db,trial.id).catch(()=>{});if(providerFile&&process.env.GEMINI_API_KEY)await deleteVideoFile(process.env.GEMINI_API_KEY,providerFile.name).catch(()=>{});await browser.close();}
