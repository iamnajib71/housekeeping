import 'server-only';
import {database} from './server';
import {maintainMealRice} from './meals-server';
import {mealReminders,type MealGroup} from './meals';
import {pushConfigured,sendBrowserPush} from './web-push';
import type {Member} from './types';

export async function pollMealNotices(db:ReturnType<typeof database>,limit:number,members:Member[],now=new Date()){
 const {data:rows,error}=await db.from('meal_groups').select('*').order('created_at');if(error)throw error;
 const groups:MealGroup[]=[];for(const row of rows||[])groups.push(await maintainMealRice(db,row,now));
 const pending=[];
 for(const g of groups)for(const notice of mealReminders(g,now)){
  const member=members.find(m=>m.id===notice.member_id&&m.household_id===g.household_id);if(!member)continue;
  for(const channel of (pushConfigured()?['email','push']:['email'])){
   if(channel==='email'&&!member.email)continue;
   pending.push({group_id:g.id,member_id:member.id,channel,notice_key:notice.key,dedupe_key:g.id+':'+notice.key+':'+channel});
  }
 }
 if(pending.length){const {error}=await db.from('meal_notice_jobs').upsert(pending,{onConflict:'dedupe_key',ignoreDuplicates:true});if(error)throw error;}
 const {error:exhausted}=await db.from('meal_notice_jobs').update({status:'failed'}).eq('status','leased').gte('attempts',4).lt('leased_at',new Date(now.getTime()-5*60000).toISOString());if(exhausted)throw exhausted;
 const messages:{id:string;leaseToken:string;to:string;subject:string;body:string}[]=[],push={sent:0,failed:0};
 for(const channel of ['email','push']){
  if(channel==='push'&&!pushConfigured())continue;
  const {data:claimed,error:ce}=await db.rpc('claim_meal_notices',{p_channel:channel,p_limit:channel==='email'?limit:5});if(ce)throw ce;
  for(const job of claimed||[]){
   const update=async(values:Record<string,unknown>)=>{const {error}=await db.from('meal_notice_jobs').update(values).eq('id',job.id).eq('lease_token',job.lease_token);if(error)throw error;};
   // Re-read at delivery time: completing a duty, a swap or opting out cancels
   // its queued reminder, even if it happened after this poll started.
   const {data:g,error:ge}=await db.from('meal_groups').select('*').eq('id',job.group_id).maybeSingle();if(ge)throw ge;
   const member=members.find(m=>m.id===job.member_id&&m.household_id===g?.household_id);
   const notice=g&&mealReminders(g,now).find(n=>n.key===job.notice_key&&n.member_id===job.member_id);
   if(!g||!member||!notice||!g.member_ids.includes(member.id)||(channel==='email'&&!member.email)){await update({status:'cancelled'});continue;}
   const url='/app?view=meals&home='+g.household_id+'&meal='+encodeURIComponent(g.id);
   if(channel==='email'){
    messages.push({id:'meal:'+job.id,leaseToken:job.lease_token,to:member.email!,subject:'Housekeeping meals: '+notice.title,body:'Hi '+member.name+',\n\n'+notice.title+'\n\n'+notice.body+'\n\nOpen your meal group:\n'+(process.env.APP_URL||'').replace(/\/$/,'')+url+'\n\nAll meal times use Melbourne time. You can change group reminders in Shared meals.\nHousekeeping'});
   }else{
    try{
     const {data:devices,error:de}=await db.from('push_subscriptions').select('*').eq('email',member.email?.toLowerCase()||'');if(de)throw de;
     for(const device of devices||[]){
      if(member.user_id&&device.user_id!==member.user_id)continue;
      try{await sendBrowserPush({endpoint:device.endpoint,keys:{p256dh:device.p256dh,auth:device.auth}},{title:notice.title,body:notice.body,url,tag:'meal-'+job.id});}
      catch(e){if([404,410].includes((e as {statusCode?:number}).statusCode||0)){const {error}=await db.from('push_subscriptions').delete().eq('id',device.id);if(error)throw error;}else throw e;}
     }
     await update({status:'sent',sent_at:now.toISOString()});push.sent++;
    }catch{push.failed++;await update({status:job.attempts>=4?'failed':'pending'});}
   }
  }
 }
 const {error:prune}=await db.from('meal_notice_jobs').delete().in('status',['sent','failed','cancelled']).lt('created_at',new Date(now.getTime()-90*86400000).toISOString());if(prune)throw prune;
 return {jobs:messages,push};
}
