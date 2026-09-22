import { ApiError,bodyJson,checkOrigin,failure,ok,requireMember } from '@/lib/server';
export async function POST(request:Request){
 try{
  checkOrigin(request);const {db,member}=await requireMember(true);const body=await bodyJson(request);
  if(body.action==='member'){
   if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>40)throw new ApiError('Enter a name of up to 40 characters.');
   const email=typeof body.email==='string'?body.email.trim().toLowerCase():null;
   if(email&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254))throw new ApiError('Enter a valid email address.');
   if(body.id===member.id&&email!==member.email)throw new ApiError('Your own login email cannot be changed here.');
   const {data,error}=await db.from('members').update({name:body.name.trim(),email}).eq('id',body.id).select('id').single();
   if(error)throw new ApiError(error.code==='23505'?'That email belongs to another housemate.':'Could not update this housemate.');return ok(data);
  }
  if(body.action==='settings'){
   const s=body.settings;
   for(const key of ['daily_tasks','weekly_tasks'])if(!Array.isArray(s?.[key])||!s[key].length||s[key].length>30||!s[key].every((t:unknown)=>typeof t==='string'&&t.trim().length>0&&t.length<=150))throw new ApiError('Use 1–30 tasks per checklist, each up to 150 characters.');
   for(const key of ['evening_hour','morning_hour','deadline_hour'])if(!Number.isInteger(s[key])||s[key]<0||s[key]>23)throw new ApiError('Choose a valid reminder hour.');
   if(s.morning_hour>=s.deadline_hour)throw new ApiError('The morning reminder must be before the deadline.');
   if(typeof s.reminders_enabled!=='boolean')throw new ApiError('Invalid reminder preference.');
   const {error}=await db.rpc('save_settings',{p_daily:[...new Set(s.daily_tasks.map((t:string)=>t.trim()))],p_weekly:[...new Set(s.weekly_tasks.map((t:string)=>t.trim()))],p_evening:s.evening_hour,p_morning:s.morning_hour,p_deadline:s.deadline_hour,p_enabled:s.reminders_enabled});if(error)throw error;return ok({ok:true});
  }
  if(body.action==='review'){
   if(!['approved','rework'].includes(body.status)||typeof body.note!=='string'||body.note.length>1000||(body.status==='rework'&&!body.note.trim()))throw new ApiError('Provide a valid review and a note for rework.');
   const {error}=await db.rpc('review_clean',{p_submission:body.id,p_status:body.status,p_note:body.note.trim()});if(error)throw new ApiError(error.message);
   return ok({ok:true});
  }
  if(body.action==='reassign'){
   if(!Array.isArray(body.memberIds)||body.memberIds.length>2)throw new ApiError('Choose one or two housemates.');
   const {error}=await db.rpc('reassign_clean',{p_assignment:body.id,p_members:body.memberIds});if(error)throw new ApiError(error.message);return ok({ok:true});
  }
  throw new ApiError('Unknown action.');
 }catch(e){return failure(e);}
}
