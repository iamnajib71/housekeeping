import { ensureSchedule,failure,getMembers,getSettings,ok,requireMember } from '@/lib/server';
import { addDays,localClock } from '@/lib/schedule';
export const dynamic='force-dynamic';
export async function GET(){
 try{
  const {db,member}=await requireMember();const home=member.household_id!;const [members,settings]=await Promise.all([getMembers(db,home),getSettings(db,home)]);await ensureSchedule(db,settings,members);
  const today=localClock().date;
  const {data:assignments,error}=await db.from('assignments').select('*').eq('household_id',home).gte('date',addDays(today,-365)).order('date');if(error)throw error;
  const {data:submissions,error:subError}=await db.from('submissions').select('*').in('assignment_id',(assignments||[]).map(a=>a.id));if(subError)throw subError;
  // Shared submitted proof also supplies consistent area history for everyone's roster.
  const sanitized=(submissions||[]).filter(s=>{const a=assignments?.find(a=>a.id===s.assignment_id);return member.role==='admin'||s.status!=='draft'||a?.member_ids.includes(member.id);});
  let health;
  if(member.role==='admin'&&home===1){const {data,error}=await db.from('worker_health').select('*').eq('id',1).single();if(error)throw error;health=data;}
  const {data:household,error:homeError}=await db.from('households').select('id,name,address').eq('id',home).single();if(homeError)throw homeError;
  return ok({me:member,members:members.map(m=>member.role==='admin'?m:{...m,email:undefined,user_id:undefined}),household,settings,assignments,submissions:sanitized,today,server_now:new Date().toISOString(),health});
 }catch(e){return failure(e);}
}
