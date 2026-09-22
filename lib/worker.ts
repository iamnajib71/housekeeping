import 'server-only';
import { database,ensureSchedule,getMembers,getSettings } from './server';
import { addDays,formatDate,localClock,reminderTypes } from './schedule';
import type { Assignment,Submission } from './types';
export async function runMaintenance(db=database()) {
 const now=new Date().toISOString(), abandoned=new Date(Date.now()-86400000).toISOString();
 const {data:photos,error}=await db.from('photos').select('id,path').is('deleted_at',null).or('expires_at.lte.'+now+',and(uploaded.eq.false,created_at.lte.'+abandoned+')').limit(100);
 if(error)throw error;
 if(photos?.length){const {error:removeError}=await db.storage.from('cleaning-proof').remove(photos.map(p=>p.path));if(removeError)throw removeError;const {error}=await db.from('photos').update({deleted_at:now}).in('id',photos.map(p=>p.id));if(error)throw error;}
 // Prune only operational logs, never the cleaning history.
 const {error:pruneError}=await db.from('email_jobs').delete().in('status',['sent','cancelled']).lt('created_at',new Date(Date.now()-90*86400000).toISOString());if(pruneError)throw pruneError;
 return photos?.length||0;
}
export async function pollEmails(limit:number) {
 const db=database(),settings=await getSettings(db),members=await getMembers(db);
 await ensureSchedule(db,settings,members);const deleted=await runMaintenance(db);
 const clock=localClock();
 const {data:assignments,error}=await db.from('assignments').select('*').gte('date',addDays(clock.date,-1)).lte('date',addDays(clock.date,1));if(error)throw error;
 const {data:submissions,error:subError}=await db.from('submissions').select('*').in('assignment_id',(assignments||[]).map(a=>a.id));if(subError)throw subError;
 const jobs=[];
 for(const a of (assignments||[]) as Assignment[])for(const memberId of a.member_ids){
  if(!members.find(m=>m.id===memberId)?.email)continue;
  const sub=(submissions||[]).find(s=>s.assignment_id===a.id&&s.member_id===memberId);
  for(const kind of reminderTypes(a.date,clock.date,clock.hour,settings,Boolean(sub&&['submitted','approved'].includes(sub.status))))jobs.push({dedupe_key:a.id+':'+memberId+':'+kind,member_id:memberId,assignment_id:a.id,kind});
 }
 if(jobs.length){const {error}=await db.from('email_jobs').upsert(jobs,{onConflict:'dedupe_key',ignoreDuplicates:true});if(error)throw error;}
 if(!settings.reminders_enabled){const {error}=await db.from('email_jobs').update({status:'cancelled'}).in('status',['pending','leased']);if(error)throw error;await db.from('worker_health').update({last_run:new Date().toISOString(),last_error:null}).eq('id',1);return {jobs:[],deleted};}
 const {data:claimed,error:claimError}=await db.rpc('claim_emails',{p_limit:limit});if(claimError)throw claimError;
 const messages=[];
 for(const job of claimed||[]){
  const member=members.find(m=>m.id===job.member_id);
  const {data:a,error}=await db.from('assignments').select('*').eq('id',job.assignment_id).single();if(error)throw error;
  const {data:sub,error:readError}=await db.from('submissions').select('*').eq('assignment_id',a.id).eq('member_id',job.member_id).maybeSingle();if(readError)throw readError;
  const done=sub&&['submitted','approved'].includes(sub.status);
  const stale=job.kind==='tomorrow'?a.date!==addDays(clock.date,1):job.kind==='today'?a.date!==clock.date:job.kind==='overdue'?a.date<addDays(clock.date,-1)||a.date>clock.date:sub?.status!=='rework';
  if(!member?.email||!a.member_ids.includes(job.member_id)||done||stale){const {error}=await db.from('email_jobs').update({status:'cancelled'}).eq('id',job.id);if(error)throw error;continue;}
  const label=a.kind==='daily'?'daily reset':'Monday deep clean';
  const when=job.kind==='tomorrow'?'tomorrow':job.kind==='today'?'today':job.kind==='rework'?'needs a quick follow-up':'is overdue';
  const partner=a.member_ids.filter((id:string)=>id!==member.id).map((id:string)=>members.find(m=>m.id===id)?.name).join(' & ');
  const link=(process.env.APP_URL||'').replace(/\/$/,'')+'/app?assignment='+encodeURIComponent(a.id);
  const body='Hi '+member.name+',\n\nYour '+label+' '+when+'.\nDate: '+formatDate(a.date)+' (Melbourne time)\n'+(partner?'Your partner: '+partner+'\n':'')+'\nTasks:\n'+a.tasks.map((t:string)=>'• '+t).join('\n')+(job.kind==='rework'?'\n\nAdmin note: '+sub.review_note:'')+'\n\nOpen your task, tick what you cleaned, and add photo proof:\n'+link+'\n\nPhotos are removed after 7 days. Thanks for doing your part!\nHousekeeping';
  messages.push({id:job.id,leaseToken:job.lease_token,to:member.email,subject:'Housekeeping: your '+label+' '+when,body});
 }
 const {error:healthError}=await db.from('worker_health').update({last_run:new Date().toISOString(),last_error:null}).eq('id',1);if(healthError)throw healthError;
 return {jobs:messages,deleted};
}
