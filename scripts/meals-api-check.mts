import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {chromium,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes} from 'node:crypto';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const base=process.env.CHECK_BASE_URL||'http://localhost:3011',url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const db=createClient(url,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const anon=createClient(url,key,{auth:{persistSession:false}}),browser=await chromium.launch();
const users:string[]=[],homes:number[]=[],contexts:Awaited<ReturnType<typeof browser.newContext>>[]=[];
const marker='meal-check-'+randomUUID();
async function identity(label:string){
 const email=marker+'-'+label+'@example.invalid',password=randomBytes(24).toString('base64url');
 const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true});if(error)throw error;const user=data.user!;users.push(user.id);
 let jar:{name:string;value:string;options?:unknown}[]=[];
 const auth=createServerClient(url,key,{cookies:{getAll:()=>jar,setAll:values=>{jar=values;}}});
 const signed=await auth.auth.signInWithPassword({email,password});if(signed.error)throw signed.error;
 const context=await browser.newContext();contexts.push(context);
 await context.addCookies(jar.map(c=>({name:c.name,value:c.value,url:base,httpOnly:false,sameSite:'Lax' as const})));
 return {email,user,context};
}
function checked<T>(result:{data:T;error:unknown}):T{if(result.error)throw result.error;return result.data;}
async function post(f:Awaited<ReturnType<typeof identity>>,home:number,body:Record<string,unknown>,origin=base){return f.context.request.post(base+'/api/meals',{headers:{Origin:origin,'x-household-id':String(home)},data:{request_id:randomUUID(),...body}});}
try{
 const a=await identity('a'),b=await identity('b'),c=await identity('c'),outsider=await identity('outside');
 const home=checked(await db.rpc('create_household',{p_user:a.user.id,p_email:a.email,p_name:marker,p_address:'Meal integration fixture',p_member_name:'A',p_participates:true})) as number;homes.push(home);
 const owner=checked(await db.from('members').select('*').eq('household_id',home).eq('user_id',a.user.id).single());
 const added=checked(await db.from('members').insert([b,c,outsider].map((f,i)=>({name:['B','C','Outside'][i],email:f.email,user_id:f.user.id,household_id:home,position:i+1,role:'member',color:'#e4e9ef'}))).select('*'));
 const ids=[owner.id,...added!.slice(0,2).map(m=>m.id)];
 const response=await post(a,home,{action:'create',name:'Private dinners',members:ids});expect(response.status()).toBe(200);let g=await response.json();
 expect(g.state.rice).toHaveLength(1);expect(g.member_ids).toEqual(ids);
 expect((await post(a,home,{action:'settings',group_id:g.id,rice_time:'18:30',cook_time:'19:00',reminders:false})).status()).toBe(200);
 const list=await outsider.context.request.get(base+'/api/meals',{headers:{'x-household-id':String(home)}});expect((await list.json()).groups).toHaveLength(0);
 expect((await post(outsider,home,{action:'item',group_id:g.id,text:'Cannot see this',urgency:'next'})).status()).toBe(404);
 expect((await post(a,home,{action:'create',name:'Invalid members',members:[owner.id,randomUUID()]})).status()).toBe(400);
 expect((await post(a,home,{action:'item',group_id:g.id,text:'Bad origin',urgency:'next'},'https://example.invalid')).status()).toBe(403);
 expect((await post(a,999999,{action:'item',group_id:g.id,text:'Wrong home',urgency:'next'})).status()).toBe(403);
 const anonymous=await browser.newContext();contexts.push(anonymous);expect((await anonymous.request.get(base+'/api/meals')).status()).toBe(401);
 const forbidden=await anon.from('meal_groups').select('id');expect(forbidden.error).toBeTruthy();
 const writes=await Promise.all(['Rice','Milk'].map(text=>post(a,home,{action:'item',group_id:g.id,text,urgency:'next'})));for(const r of writes)expect(r.status()).toBe(200);
 const command={action:'trip',group_id:g.id,members:ids.slice(1),on:'2026-10-18',request_id:randomUUID()};
 expect((await post(a,home,command)).status()).toBe(200);expect((await post(a,home,command)).status()).toBe(200);
 const when=new Date(Date.now()+2*3600000).toISOString();
 const planned=await post(a,home,{action:'plan',group_id:g.id,participants:ids,dishes:['Curry','Dal'],days:3,when});expect(planned.status()).toBe(200);g=await planned.json();
 expect(g.state.items).toHaveLength(2);expect(g.state.events.filter((e:{kind:string})=>e.kind==='grocery')).toHaveLength(1);
 expect(new Set(Object.values(g.state.batches[0].roles)).size).toBe(3);
 const ready=await post(b,home,{action:'ready',group_id:g.id,batch_id:g.state.batches[0].id});expect(ready.status()).toBe(200);g=await ready.json();
 expect(g.state.batches.filter((b:{status:string})=>b.status==='ready')).toHaveLength(1);expect(g.state.batches.filter((b:{status:string})=>b.status==='planned')).toHaveLength(1);
 expect(g.state.events.filter((e:{kind:string})=>e.kind==='cook'||e.kind==='prep')).toHaveLength(2);
 const visible=await b.context.request.get(base+'/api/meals',{headers:{'x-household-id':String(home)}});expect((await visible.json()).groups[0].id).toBe(g.id);
 // Exercise queue leases and the existing Apps Script acknowledgement protocol,
 // without calling poll or sending any email/push.
 const queued=checked(await db.from('meal_notice_jobs').insert(ids.slice(0,2).map(id=>({group_id:g.id,member_id:id,dedupe_key:marker+id,notice_key:'integration-no-delivery',channel:'email'}))).select('id'))!;
 const claimed=await Promise.all([db.rpc('claim_meal_notices',{p_channel:'email',p_limit:1}),db.rpc('claim_meal_notices',{p_channel:'email',p_limit:1})]);
 const jobs=claimed.flatMap(r=>checked(r)||[]);expect(jobs).toHaveLength(2);expect(new Set(jobs.map(j=>j.id)).size).toBe(2);expect(jobs.every(j=>queued.some(q=>q.id===j.id))).toBe(true);
 const ack=await a.context.request.post(base+'/api/worker',{headers:{Authorization:'Bearer '+process.env.WORKER_SECRET},data:{action:'ack',id:'meal:'+jobs[0].id,leaseToken:jobs[0].lease_token}});expect(ack.status()).toBe(200);
 const receipt=checked(await db.from('meal_notice_jobs').select('status').eq('id',jobs[0].id).single());expect(receipt.status).toBe('sent');
 console.log('Meals API passed: authenticated group sharing, outsider/property/origin isolation, anonymous denial, concurrent updates, idempotent joint trip, automatic roles and next batch, queue leases and email acknowledgements. No notifications sent.');
}finally{
 for(const home of homes){
  const {error}=await db.from('meal_groups').delete().eq('household_id',home);if(error)throw error;
  for(const table of ['members','household_settings','households']){
   const {error}=await db.from(table).delete().eq(table==='members'?'household_id':'id',home);if(error)throw error;
  }
 }
 for(const id of users){const {error}=await db.auth.admin.deleteUser(id);if(error)throw error;}
 for(const context of contexts)await context.close();await browser.close();
}
