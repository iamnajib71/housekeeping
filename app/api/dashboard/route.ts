import { ensureSchedule,failure,getMembers,getSettings,ok,requireMember } from '@/lib/server';
import { addDays,localClock } from '@/lib/schedule';
export const dynamic='force-dynamic';
export async function GET(){
 try{
  const {db,member}=await requireMember();const [members,settings]=await Promise.all([getMembers(db),getSettings(db)]);await ensureSchedule(db,settings,members);
  const today=localClock().date;
  const {data:assignments,error}=await db.from('assignments').select('*').gte('date',addDays(today,-365)).order('date');if(error)throw error;
  const {data:submissions,error:subError}=await db.from('submissions').select('*').in('assignment_id',(assignments||[]).map(a=>a.id));if(subError)throw subError;
  const sanitized=(submissions||[]).map(s=>{const a=assignments?.find(a=>a.id===s.assignment_id);return member.role==='admin'||a?.member_ids.includes(member.id)?s:{...s,tasks:[],notes:'',review_note:''};});
  let health;
  if(member.role==='admin'){const {data,error}=await db.from('worker_health').select('*').eq('id',1).single();if(error)throw error;health=data;}
  return ok({me:member,members:members.map(m=>member.role==='admin'?m:{...m,email:undefined}),settings,assignments,submissions:sanitized,today,health});
 }catch(e){return failure(e);}
}
