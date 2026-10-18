import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {chromium,expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {randomBytes,randomUUID} from 'node:crypto';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const base=process.env.CHECK_BASE_URL||'http://localhost:3007',url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const db=createClient(url,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const users:string[]=[],homes:number[]=[],sessions:any[]=[],browser=await chromium.launch();
const before=await db.from('household_settings').select('*').eq('id',1).single();if(before.error)throw before.error;
const {count:beforeSubmissions}=await db.from('submissions').select('id',{head:true,count:'exact'});
async function fixture(label:string){
 const email=`test-${label}-${randomUUID()}@example.invalid`,password=randomBytes(24).toString('base64url');
 const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true});if(error)throw error;users.push(data.user.id);
 let jar:any[]=[];const auth=createServerClient(url,key,{cookies:{getAll:()=>jar,setAll:values=>{jar=values;}}});
 const result=await auth.auth.signInWithPassword({email,password});if(result.error)throw result.error;sessions.push(auth);
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addCookies(jar.map(c=>({name:c.name,value:c.value,url:base,httpOnly:false,sameSite:'Lax' as const})));
 const account=await context.request.get(base+'/api/account');if(account.status()!==200)throw new Error('Fixture authentication failed: '+account.status()+' '+(await account.json()).error+'; cookie chunks: '+jar.length);
 return {email,context,page:await context.newPage()};
}
async function post(f:any,path:string,body:unknown){return f.context.request.post(base+path,{headers:{Origin:base},data:body});}
try{
 const publicPage=await browser.newPage({viewport:{width:390,height:844}});await publicPage.goto(base+'/signup');await expect(publicPage.getByText('Manage properties',{exact:true})).toBeVisible();await expect(publicPage.getByText('Manage my shared home',{exact:true})).toBeVisible();
 if(await publicPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Signup overflows mobile');
 expect((await publicPage.request.get(base+'/api/account')).status()).toBe(401);
 await publicPage.route(url+'/auth/v1/authorize*',r=>r.fulfill({status:200,body:'OAuth handoff checked'}));
 await publicPage.getByLabel(/Manage my shared home/).check();
 const oauth=publicPage.waitForRequest(r=>r.url().startsWith(url+'/auth/v1/authorize'));
 await publicPage.getByRole('button',{name:'Sign up with Google'}).click();
 expect(new URL((await oauth).url()).searchParams.get('redirect_to')).toBe(base+'/auth/callback');
 const intent=(await publicPage.context().cookies(base)).find(c=>c.name==='auth-intent');expect(intent?.httpOnly).toBe(true);expect(intent?.value).toContain('admin_tenant');
 const owner=await fixture('owner'),tenant=await fixture('tenant'),other=await fixture('other');
 await owner.page.goto(base+'/welcome?mode=admin');await expect(owner.page.getByRole('heading',{name:'Let’s set up your property'})).toBeVisible();
 await owner.page.getByLabel('Your name',{exact:true}).fill('Trial manager');await owner.page.getByLabel('Property name',{exact:true}).fill('Trial property');await owner.page.getByLabel('Property address',{exact:true}).fill('1 Test Street, Melbourne VIC 3000');await owner.page.getByRole('button',{name:'Create property',exact:true}).click();
 await owner.page.waitForURL(/\/app(?:\?|$)/);let data=await (await owner.context.request.get(base+'/api/dashboard')).json();homes.push(data.household.id);
 expect(data.me.role).toBe('admin');expect(data.me.participates).toBe(false);expect(data.assignments).toEqual([]);expect(data.settings.daily_tasks).toEqual([]);expect(data.settings.council_bins_enabled).toBe(false);
 await expect(owner.page.getByText('1 Test Street, Melbourne VIC 3000',{exact:true})).toBeVisible();await expect(owner.page.getByRole('heading',{name:'Set up your first property',exact:true})).toBeVisible();
 await owner.page.getByRole('button',{name:'Set up cleaning areas',exact:true}).click();await expect(owner.page.getByRole('heading',{name:'Set up your home from a walkthrough'})).toBeVisible();await owner.page.screenshot({path:'.local/account-manager-mobile.png'});
 const save=await post(owner,'/api/admin',{action:'settings',settings:{...data.settings,daily_tasks:['Kitchen: Wipe surfaces'],weekly_tasks:['Kitchen: Deep clean','Bathroom: Deep clean']}});expect(save.status()).toBe(200);
 const invite=await post(owner,'/api/account',{action:'invite',email:tenant.email,name:'Trial tenant'});expect(invite.status()).toBe(200);const inviteData=await invite.json(),token=new URL(inviteData.url).searchParams.get('token');
 expect((await post(other,'/api/account',{action:'accept',token})).status()).toBe(400);
 await tenant.page.goto(base+'/welcome?invite='+token);await expect(tenant.page.getByRole('button',{name:'Accept invitation',exact:true})).toBeVisible();await tenant.page.getByRole('button',{name:'Accept invitation',exact:true}).click();await tenant.page.waitForURL(/\/app(?:\?|$)/);
 expect((await post(tenant,'/api/account',{action:'accept',token})).status()).toBe(200);
 let joined=await (await tenant.context.request.get(base+'/api/dashboard')).json();expect(joined.me.role).toBe('member');expect(joined.members).toHaveLength(2);expect(joined.me.participates).toBe(true);expect(joined.assignments.length).toBeGreaterThan(0);expect(joined.assignments.every((a:any)=>a.member_ids.includes(joined.me.id)&&a.kind==='daily')).toBe(true);
 expect((await post(tenant,'/api/account',{action:'invite',name:'Forbidden',email:other.email})).status()).toBe(403);
 await tenant.page.goto(base+'/app');await expect(tenant.page.getByRole('heading',{name:'Your cleaning turns, made simple'})).toBeVisible();await tenant.page.getByRole('button',{name:'Got it',exact:true}).click();await expect(tenant.page.getByRole('heading',{name:'Your cleaning turns, made simple'})).toHaveCount(0);await tenant.page.reload();await expect(tenant.page.getByRole('heading',{name:'Today at home'})).toBeVisible();await expect(tenant.page.getByRole('heading',{name:'Your cleaning turns, made simple'})).toHaveCount(0);await tenant.page.screenshot({path:'.local/account-tenant-mobile.png'});
 const otherCreated=await post(other,'/api/account',{action:'create',name:'Other trial',address:'2 Test Street, Melbourne VIC 3000',memberName:'Other owner',mode:'admin_tenant'});expect(otherCreated.status()).toBe(200);homes.push((await otherCreated.json()).id);
 expect((await post(other,'/api/account',{action:'select',id:homes[0]})).status()).toBe(403);
 const privateAssignment=joined.assignments[0];expect((await other.context.request.get(base+'/api/assignments/'+privateAssignment.id)).status()).toBe(404);
 expect((await post(other,'/api/admin',{action:'member',id:joined.me.id,name:'Changed',email:tenant.email})).status()).toBe(400);
 expect((await post(other,'/api/admin',{action:'reassign',id:privateAssignment.id,memberIds:[joined.me.id]})).status()).toBe(404);
 expect((await other.context.request.get(base+'/api/dashboard')).headers()['cache-control']).toContain('no-store');
 // Test manager property switching after the creation throttle window.
 await new Promise(r=>setTimeout(r,10500));
 const second=await post(owner,'/api/account',{action:'create',name:'Second managed home',address:'3 Test Street, Melbourne VIC 3000',memberName:'Trial manager',mode:'admin'});expect(second.status()).toBe(200);const secondId=(await second.json()).id;homes.push(secondId);
 expect((await (await owner.context.request.get(base+'/api/account')).json()).homes).toHaveLength(2);
 expect((await (await owner.context.request.get(base+'/api/dashboard')).json()).household.id).toBe(secondId);
 expect((await (await owner.context.request.get(base+'/api/dashboard',{headers:{'x-household-id':String(homes[0])}})).json()).household.id).toBe(homes[0]);
 expect((await other.context.request.get(base+'/api/dashboard',{headers:{'x-household-id':String(homes[0])}})).status()).toBe(403);
 expect((await post(owner,'/api/account',{action:'select',id:homes[0]})).status()).toBe(200);
 expect((await (await owner.context.request.get(base+'/api/dashboard')).json()).household.id).toBe(homes[0]);
 const after=await db.from('household_settings').select('*').eq('id',1).single();expect(after.data).toEqual(before.data);
 const {count:afterSubmissions}=await db.from('submissions').select('id',{head:true,count:'exact'});expect(afterSubmissions).toBe(beforeSubmissions);
 console.log('Signup UI, verified sessions, empty property, address, walkthrough prompt, invitation email binding, tenant guide persistence, one-tenant roster, role checks, cross-property isolation, fresh private responses and original household preservation passed. No test emails sent.');
}finally{
 await browser.close();for(const auth of sessions)await auth.auth.signOut();
 for(const id of homes){await db.from('tenant_invitations').delete().eq('household_id',id);await db.from('assignments').delete().eq('household_id',id);await db.from('household_settings').delete().eq('id',id);await db.from('members').delete().eq('household_id',id);await db.from('households').delete().eq('id',id);}
 for(const id of users){const {error}=await db.auth.admin.deleteUser(id);if(error)console.error('Fixture cleanup failed:',error.message);}
}
