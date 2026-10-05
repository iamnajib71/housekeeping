import 'server-only';
import { database,ensureSchedule,getMembers,getSettings } from './server';
import { addDays,localClock,reminderTypes } from './schedule';
import type { Assignment,Submission } from './types';
import { reminderEmail } from './reminder-email';
import { deleteVideoFile } from './cloud-video';
import { clearVideoBuffer } from './video-relay';
export async function runMaintenance(db=database()) {
 const {data:oldTrials}=await db.from('walkthrough_trials').select('id,status').is('buffer_cleaned_at',null).lt('created_at',new Date(Date.now()-2*60*60*1000).toISOString()).order('created_at').limit(5);
 await Promise.allSettled((oldTrials||[]).map(async trial=>{await clearVideoBuffer(db,trial.id);const {error}=await db.from('walkthrough_trials').update({buffer_cleaned_at:new Date().toISOString()}).eq('id',trial.id);if(error)throw error;if(trial.status==='uploading')await db.from('walkthrough_trials').update({status:'failed',upload_url:null}).eq('id',trial.id).eq('status','uploading');}));
 if(process.env.GEMINI_API_KEY){
  const {data:expired}=await db.from('walkthrough_trials').select('id,provider_file').not('provider_file','is',null).or('status.in.(ready,failed),created_at.lt.'+new Date(Date.now()-2*60*60*1000).toISOString()).limit(2);
  await Promise.allSettled((expired||[]).map(async trial=>{await deleteVideoFile(process.env.GEMINI_API_KEY!,trial.provider_file);const {error}=await db.from('walkthrough_trials').update({provider_file:null,upload_url:null,status:'failed'}).eq('id',trial.id).in('status',['uploading','processing','analyzing','failed']);if(error)throw error;await db.from('walkthrough_trials').update({provider_file:null,upload_url:null}).eq('id',trial.id).eq('status','ready');}));
 }
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
 let weeklyHistory:Assignment[]|undefined,weeklySubmissions:Submission[]=[];
 for(const job of claimed||[]){
  const member=members.find(m=>m.id===job.member_id);
  const {data:a,error}=await db.from('assignments').select('*').eq('id',job.assignment_id).single();if(error)throw error;
  const {data:sub,error:readError}=await db.from('submissions').select('*').eq('assignment_id',a.id).eq('member_id',job.member_id).maybeSingle();if(readError)throw readError;
  const done=sub&&['submitted','approved'].includes(sub.status);
  const stale=job.kind==='tomorrow'?a.date!==addDays(clock.date,1):job.kind==='today'?a.date!==clock.date:job.kind==='overdue'?a.date<addDays(clock.date,-1)||a.date>clock.date:sub?.status!=='rework';
  if(!member?.email||!a.member_ids.includes(job.member_id)||done||stale){const {error}=await db.from('email_jobs').update({status:'cancelled'}).eq('id',job.id);if(error)throw error;continue;}
  if(a.kind==='weekly'&&job.kind!=='rework'&&!weeklyHistory){
   const {data:history,error}=await db.from('assignments').select('*').eq('kind','weekly').gte('date',addDays(clock.date,-365)).order('date');if(error)throw error;
   weeklyHistory=history||[];
   if(weeklyHistory.length){const {data,error}=await db.from('submissions').select('*').in('assignment_id',weeklyHistory.map(item=>item.id));if(error)throw error;weeklySubmissions=data||[];}
  }
  messages.push({id:job.id,leaseToken:job.lease_token,...reminderEmail(a,member,members,job.kind,sub||undefined,weeklyHistory||[],weeklySubmissions,process.env.APP_URL||'')});
 }
 const {error:healthError}=await db.from('worker_health').update({last_run:new Date().toISOString(),last_error:null}).eq('id',1);if(healthError)throw healthError;
 return {jobs:messages,deleted};
}
