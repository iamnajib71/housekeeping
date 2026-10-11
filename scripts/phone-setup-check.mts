import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {chromium, expect} from '@playwright/test';
import {createRequire} from 'node:module';
import {createECDH,randomBytes,randomUUID} from 'node:crypto';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const base=process.env.CHECK_BASE_URL||'http://localhost:3007';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const db=createClient(url,process.env.SUPABASE_SECRET_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const browser=await chromium.launch(),users:string[]=[],sessions:any[]=[];
const curve=createECDH('prime256v1');curve.generateKeys();
const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/trial-'+randomUUID(),keys:{p256dh:curve.getPublicKey().toString('base64url'),auth:randomBytes(16).toString('base64url')}};
async function fixture(){
 const email=`test-push-${randomUUID()}@example.invalid`,password=randomBytes(24).toString('base64url');
 const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:true});if(error)throw error;users.push(data.user.id);
 let jar:any[]=[];const auth=createServerClient(url,key,{cookies:{getAll:()=>jar,setAll:values=>{jar=values;}}});
 const result=await auth.auth.signInWithPassword({email,password});if(result.error)throw result.error;sessions.push(auth);
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addCookies(jar.map(c=>({name:c.name,value:c.value,url:base,httpOnly:false,sameSite:'Lax' as const})));
 return {context,page:await context.newPage(),id:data.user.id,email};
}
async function post(f:any,action:string,sub:any=subscription,extra:any={}){return f.context.request.post(base+'/api/push',{headers:{Origin:base},data:{action,subscription:sub,...extra}});}
async function mockPhone(page:any,permission='default',ios=false){
 page.on('pageerror',(error:Error)=>console.error('Browser error:',error.message));
 await page.addInitScript(({subscription,permission,ios}:any)=>{
  // tsx inserts this helper into serialized browser callbacks.
  eval('window.__name = target => target');
  let current:any=null,requested=0;
  const notification:any=function(){};notification.permission=permission;notification.requestPermission=async()=>{requested++;notification.permission='granted';return 'granted';};
  Object.defineProperty(window,'Notification',{value:notification,configurable:true});Object.defineProperty(window,'PushManager',{value:function(){},configurable:true});
  if(ios)Object.defineProperty(navigator,'userAgent',{get:()=> 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',configurable:true});
  const registration={pushManager:{getSubscription:async()=>current,subscribe:async()=>{current={options:{},toJSON:()=>subscription,unsubscribe:async()=>{current=null;return true;}};return current;}}};
  Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>registration,getRegistration:async()=>registration,ready:Promise.resolve(registration)},configurable:true});
  (window as any).trialPermissionRequests=()=>requested;
 },{subscription,permission,ios});
}
try{
 const owner=await fixture(),other=await fixture();
 const publicConfig=await browser.newPage();
 expect((await publicConfig.request.get(base+'/api/push')).headers()['cache-control']).toContain('no-store');
 expect((await publicConfig.request.post(base+'/api/push',{headers:{Origin:base},data:{action:'subscribe',subscription}})).status()).toBe(401);
 await mockPhone(owner.page);await owner.page.goto(base+'/');
 const card=owner.page.getByRole('complementary',{name:'Set up Housekeeping on your phone'});await expect(card).toBeVisible();
 expect(await owner.page.evaluate(()=>(window as any).trialPermissionRequests())).toBe(0);
 await card.getByRole('button',{name:'Enable',exact:true}).click();await expect(card.getByText('Notifications enabled',{exact:true})).toBeVisible();
 expect(await owner.page.evaluate(()=>(window as any).trialPermissionRequests())).toBe(1);
 const owned=await db.from('push_subscriptions').select('user_id,email').eq('endpoint',subscription.endpoint).single();expect(owned.data).toEqual({user_id:owner.id,email:owner.email});
 expect((await (await post(other,'status')).json()).enabled).toBe(false);
 expect((await post(other,'test')).status()).toBe(403);
 expect((await post(other,'subscribe',{...subscription,keys:{...subscription.keys,auth:randomBytes(16).toString('base64url')}})).status()).toBe(403);
 expect((await post(other,'unsubscribe')).status()).toBe(200);
 expect((await (await post(owner,'status')).json()).enabled).toBe(true);
 expect((await post(owner,'subscribe',subscription,{user_id:other.id,email:other.email})).status()).toBe(200);
 expect((await db.from('push_subscriptions').select('user_id').eq('endpoint',subscription.endpoint).single()).data?.user_id).toBe(owner.id);
 expect((await post(owner,'subscribe',{...subscription,endpoint:'https://127.0.0.1/'})).status()).toBe(400);
 // UI test notification transport is mocked: no message is sent to a real phone.
 await owner.page.route('**/api/push',async route=>{const request=route.request();if(request.method()==='POST'&&request.postDataJSON().action==='test')await route.fulfill({status:200,contentType:'application/json',body:'{"ok":true}'});else await route.continue();});
 await card.getByRole('button',{name:'Send test',exact:true}).click();await expect(card.getByRole('status')).toContainText('Test sent');
 await owner.page.evaluate(()=>{const e:any=new Event('beforeinstallprompt');e.prompt=async()=>{(window as any).trialInstallPrompted=true;window.dispatchEvent(new Event('appinstalled'));};e.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(e);});
 await card.getByRole('button',{name:'Add app',exact:true}).click();await expect(card.getByText('Added to your Home Screen')).toBeVisible();
 expect(await owner.page.evaluate(()=>(window as any).trialInstallPrompted)).toBe(true);
 await owner.page.screenshot({path:'.local/phone-setup-mobile.png'});
 expect(await owner.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 await card.getByRole('button',{name:'Turn off',exact:true}).click();await expect(card.getByRole('status')).toContainText('turned off');
 expect((await (await post(owner,'status')).json()).enabled).toBe(false);
 await card.getByRole('button',{name:'Later',exact:true}).click();await owner.page.reload();await owner.page.waitForTimeout(1700);await expect(card).toHaveCount(0);await owner.page.getByRole('button',{name:'Phone setup and notifications'}).click();await expect(card).toBeVisible();
 const iphone=await browser.newPage({viewport:{width:390,height:844}});await mockPhone(iphone,'default',true);await iphone.goto(base+'/');const apple=iphone.getByRole('complementary');await expect(apple).toBeVisible();await expect(apple.getByText(/Tap Share/)).toBeVisible();await expect(apple.getByRole('button',{name:'Enable',exact:true})).toBeDisabled();
 const denied=await browser.newPage({viewport:{width:390,height:844}});await mockPhone(denied,'denied');await denied.goto(base+'/');await expect(denied.getByRole('complementary').getByText(/Notifications are blocked/)).toBeVisible();await expect(denied.getByRole('button',{name:'Enable',exact:true})).toBeDisabled();
 // A separate context exercises the real browser service worker registration.
 const real=await browser.newPage();await real.goto(base+'/');await real.evaluate(async()=>{await navigator.serviceWorker.ready;});expect(await real.evaluate(async()=>Boolean((await navigator.serviceWorker.getRegistration('/'))?.active))).toBe(true);
 expect((await real.request.get(base+'/sw.js')).headers()['cache-control']).toContain('no-store');
 for(const size of [180,192,512])expect((await real.request.get(base+`/icons/icon-${size}.png`)).status()).toBe(200);
 console.log('Phone prompt, permission gesture, install action, Later persistence, iPhone guide, denied permission, real service worker, no-store headers, private account binding and cross-account protection passed. Test notification transport mocked; handset receipt needs a real device.');
}finally{
 await browser.close();for(const auth of sessions)await auth.auth.signOut();for(const id of users){const {error}=await db.auth.admin.deleteUser(id);if(error)console.error('Fixture cleanup failed:',error.message);}
}
