import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {chromium,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes} from 'node:crypto';
import {applyMealCommand,emptyMealState,mealDate,mealCount,type MealGroup} from '../lib/meals';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const base=process.env.CHECK_BASE_URL||'http://localhost:3011',url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const db=createClient(url,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}}),browser=await chromium.launch();
const marker='unplanned-check-'+randomUUID(),users:string[]=[],homes:number[]=[],sessions:ReturnType<typeof createServerClient>[]=[];
const contexts:Awaited<ReturnType<typeof browser.newContext>>[]=[];
function checked<T>(r:{data:T;error:unknown}):T{if(r.error)throw r.error;return r.data;}
async function identity(label:string){
 const email=marker+'-'+label+'@example.invalid',password=randomBytes(24).toString('base64url');
 const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true});if(error)throw error;const user=data.user!;users.push(user.id);
 let jar:{name:string;value:string}[]=[];
 const auth=createServerClient(url,key,{cookies:{getAll:()=>jar,setAll:values=>{jar=values;}}});sessions.push(auth);
 const signed=await auth.auth.signInWithPassword({email,password});if(signed.error)throw signed.error;
 const context=await browser.newContext();contexts.push(context);
 await context.addCookies(jar.map(c=>({name:c.name,value:c.value,url:base,httpOnly:false,sameSite:'Lax' as const})));
 return {email,user,context};
}
async function post(f:Awaited<ReturnType<typeof identity>>,home:number,body:Record<string,unknown>){return f.context.request.post(base+'/api/meals',{headers:{Origin:base,'x-household-id':String(home)},data:{request_id:randomUUID(),...body}});}
try{
 const a=await identity('a'),b=await identity('b'),outside=await identity('outside');
 const home=checked(await db.rpc('create_household',{p_user:a.user.id,p_email:a.email,p_name:marker,p_address:'Unplanned cooking integration fixture',p_member_name:'A',p_participates:true})) as number;homes.push(home);
 const owner=checked(await db.from('members').select('*').eq('household_id',home).eq('user_id',a.user.id).single());
 const added=checked(await db.from('members').insert([b,outside].map((f,i)=>({name:i?'Outside':'B',email:f.email,user_id:f.user.id,household_id:home,position:i+1,role:'member',color:'#e4e9ef'}))).select('*'))!;
 const ids=[owner.id,added[0].id],now=new Date(),today=mealDate(now);
 let g:MealGroup={id:randomUUID(),household_id:home,name:'Private unplanned cooks',member_ids:ids,created_by:owner.id,created_at:now.toISOString(),version:0,state:{...emptyMealState(),reminders:false}};
 g=applyMealCommand(g,owner.id,{action:'plan',request_id:randomUUID(),participants:ids,dishes:['Earlier curry'],when:new Date(now.getTime()+3600000).toISOString(),days:3,shopper:null},now);
 g=applyMealCommand(g,owner.id,{action:'ready',request_id:randomUUID(),batch_id:g.state.batches[0].id},now);
 const original=structuredClone(g.state.batches[0]);
 checked(await db.from('meal_groups').insert(g));
 const command={action:'record_cook',request_id:randomUUID(),group_id:g.id,dishes:['Alu Bhaji','Dal'],cook:ids[1],prep:null,on:today,days:2,participants:ids};
 const r=await post(a,home,command),payload=await r.json();expect(r.status(),JSON.stringify(payload)).toBe(200);g=payload;
 expect(mealCount(g,ids[1],'cook')).toBe(1);expect(mealCount(g,ids[1],'prep')).toBe(1); // Only the earlier prep event.
 const recorded=g.state.batches.find(batch=>batch.id===command.request_id)!;
 expect(recorded.roles.prep).toBeNull();expect(recorded.cooked_on).toBe(today);expect(g.state.batches[0]).toEqual(original);
 expect(g.state.events.filter(e=>e.batch_id===recorded.id)).toHaveLength(1);
 expect((await post(a,home,command)).status()).toBe(200);
 expect((await post(a,home,{...command,request_id:randomUUID()})).status()).toBe(400);
 expect((await post(a,home,{...command,request_id:randomUUID(),dishes:['Invalid helper'],prep:added[1].id})).status()).toBe(400);
 expect((await post(outside,home,{...command,request_id:randomUUID()})).status()).toBe(404);
 expect((await post(a,999999,{...command,request_id:randomUUID()})).status()).toBe(403);
 // Distinct requests racing to record the same cook must award credit once.
 const concurrent={...command,dishes:['Another dinner'],cook:ids[0],prep:ids[0]};
 const results=await Promise.all([post(b,home,{...concurrent,request_id:randomUUID()}),post(b,home,{...concurrent,request_id:randomUUID()})]);
 expect(results.map(r=>r.status()).sort()).toEqual([200,400]);
 const visible=await b.context.request.get(base+'/api/meals',{headers:{'x-household-id':String(home)}});expect(visible.status()).toBe(200);
 g=(await visible.json()).groups[0];
 expect(mealCount(g,ids[0],'cook')).toBe(2);expect(mealCount(g,ids[0],'prep')).toBe(1);
 expect(g.state.batches[0]).toEqual(original);
 const notices=await db.from('meal_notice_jobs').select('id',{count:'exact',head:true}).eq('group_id',g.id);if(notices.error)throw notices.error;expect(notices.count).toBe(0);
 console.log('Unplanned cooking API passed: persisted solo credit, optional self-prep, earlier batch preserved, duplicate/racing requests award once, group/property isolation. No notifications sent.');
}finally{
 for(const home of homes){
  checked(await db.from('meal_groups').delete().eq('household_id',home));
  for(const table of ['members','household_settings','households'])checked(await db.from(table).delete().eq(table==='members'?'household_id':'id',home));
 }
 for(const session of sessions)await session.auth.signOut();
 for(const id of users){const {error}=await db.auth.admin.deleteUser(id);if(error)throw error;}
 for(const context of contexts)await context.close();await browser.close();
}
